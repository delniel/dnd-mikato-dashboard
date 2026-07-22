import { loadImages, saveImages, type ImageRecord } from './db'
import { restoreCharacter, type CharacterState } from './domain'
import { LIBRARY_SCHEMA_VERSION, collectCharacterImageIds, createCharacterLibrary, createCharacterRecord, migrateCharacterLibrary, rewriteCharacterImageIds, stripCharacterImages, type CharacterLibrary, type CharacterRecord } from './library'

const LEGACY_FORMAT = 'dnd-mge-character-backup'
const LIBRARY_FORMAT = 'dnd-mge-character-library-backup'
const BACKUP_VERSION = 2
export type BackupScope = 'current' | 'all'
export type BackupType = 'singleCharacter' | 'characterCollection'
type BackupImage = { characterId: string; id: string; path: string; type: string }
type NewManifest = { format: typeof LIBRARY_FORMAT; version: typeof BACKUP_VERSION; dataFile: 'backup.json'; images: BackupImage[] }
type LegacyManifest = { format: typeof LEGACY_FORMAT; version: 1; characterFile: 'character.json'; images: Array<{ id: string; path: string; type: string }> }
export type PreparedBackupImport = { backupType: BackupType; legacy: boolean; character?: CharacterRecord; library?: CharacterLibrary; images: ImageRecord[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exportedAt = () => new Date().toISOString()

export function collectImageIds(state: CharacterState): string[] { return collectCharacterImageIds(state) }

const singleEnvelope = (character: CharacterRecord, withImageRefs: boolean) => ({
  schemaVersion: LIBRARY_SCHEMA_VERSION,
  backupType: 'singleCharacter' as const,
  exportedAt: exportedAt(),
  character: { ...structuredClone(character), data: withImageRefs ? structuredClone(character.data) : stripCharacterImages(character.data) },
})

const collectionEnvelope = (library: CharacterLibrary, withImageRefs: boolean) => ({
  schemaVersion: LIBRARY_SCHEMA_VERSION,
  backupType: 'characterCollection' as const,
  exportedAt: exportedAt(),
  activeCharacterId: library.activeCharacterId,
  characterOrder: [...library.characterOrder],
  characters: Object.fromEntries(Object.entries(library.characters).map(([id, character]) => [id, { ...structuredClone(character), data: withImageRefs ? structuredClone(character.data) : stripCharacterImages(character.data) }])),
  settings: structuredClone(library.settings),
})

export function createJsonBackup(library: CharacterLibrary, scope: BackupScope): string {
  const active = library.activeCharacterId ? library.characters[library.activeCharacterId] : undefined
  if (scope === 'current') {
    if (!active) throw new Error('Нет активного персонажа')
    return JSON.stringify(singleEnvelope(active, false), null, 2)
  }
  return JSON.stringify(collectionEnvelope(library, false), null, 2)
}

export function parseJsonBackup(raw: string, preserveImageRefs = false): PreparedBackupImport {
  const value: unknown = JSON.parse(raw)
  if (isRecord(value) && (value.backupType === 'singleCharacter' || value.backupType === 'characterCollection') && typeof value.schemaVersion === 'number' && value.schemaVersion > LIBRARY_SCHEMA_VERSION) throw new Error('Резервная копия создана более новой версией приложения')
  if (isRecord(value) && value.backupType === 'characterCollection') {
    const library = migrateCharacterLibrary(value)
    if (!preserveImageRefs) for (const character of Object.values(library.characters)) character.data = stripCharacterImages(character.data)
    return { backupType: 'characterCollection', legacy: false, library, images: [] }
  }
  if (isRecord(value) && value.backupType === 'singleCharacter' && isRecord(value.character)) {
    const rawCharacter = value.character
    const restored = restoreCharacter(JSON.stringify(isRecord(rawCharacter.data) ? rawCharacter.data : rawCharacter))
    const data = preserveImageRefs ? restored : stripCharacterImages(restored)
    const character = createCharacterRecord(data, { id: typeof rawCharacter.id === 'string' ? rawCharacter.id : undefined, name: typeof rawCharacter.name === 'string' ? rawCharacter.name : undefined, timestamp: typeof rawCharacter.createdAt === 'string' ? rawCharacter.createdAt : undefined })
    if (typeof rawCharacter.updatedAt === 'string') character.updatedAt = rawCharacter.updatedAt
    return { backupType: 'singleCharacter', legacy: false, character, images: [] }
  }
  const restored = restoreCharacter(raw)
  const character = preserveImageRefs ? restored : stripCharacterImages(restored)
  return { backupType: 'singleCharacter', legacy: true, character: createCharacterRecord(character, { id: 'legacy-import' }), images: [] }
}

export async function createLibraryBackup(library: CharacterLibrary, scope: BackupScope): Promise<{ blob: Blob; imageCount: number }> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const selected = scope === 'current'
    ? (library.activeCharacterId && library.characters[library.activeCharacterId] ? [library.characters[library.activeCharacterId]] : [])
    : library.characterOrder.flatMap((id) => library.characters[id] ? [library.characters[id]] : [])
  if (!selected.length) throw new Error('Нет персонажей для экспорта')
  const images: BackupImage[] = []
  for (const character of selected) {
    const ids = collectCharacterImageIds(character.data)
    const records = await loadImages(ids)
    records.forEach((record, index) => {
      if (!record) return
      const path = `characters/${character.id}/images/${index}`
      zip.file(path, record.blob)
      images.push({ characterId: character.id, id: record.id, path, type: record.blob.type || 'application/octet-stream' })
    })
  }
  const data = scope === 'current' ? singleEnvelope(selected[0], true) : collectionEnvelope(library, true)
  const manifest: NewManifest = { format: LIBRARY_FORMAT, version: BACKUP_VERSION, dataFile: 'backup.json', images }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('backup.json', JSON.stringify(data, null, 2))
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), imageCount: images.length }
}

const validNewManifest = (value: unknown): value is NewManifest => isRecord(value) && value.format === LIBRARY_FORMAT && value.version === BACKUP_VERSION && value.dataFile === 'backup.json' && Array.isArray(value.images) && value.images.every((image) => isRecord(image) && typeof image.characterId === 'string' && typeof image.id === 'string' && typeof image.path === 'string' && image.path.startsWith('characters/') && !image.path.includes('..') && typeof image.type === 'string')
const validLegacyManifest = (value: unknown): value is LegacyManifest => isRecord(value) && value.format === LEGACY_FORMAT && value.version === 1 && value.characterFile === 'character.json' && Array.isArray(value.images) && value.images.every((image) => isRecord(image) && typeof image.id === 'string' && typeof image.path === 'string' && image.path.startsWith('images/') && !image.path.includes('..') && typeof image.type === 'string')

export async function restoreLibraryBackup(file: Blob): Promise<PreparedBackupImport> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('В архиве нет manifest.json')
  const manifest: unknown = JSON.parse(await manifestFile.async('string'))
  if (validNewManifest(manifest)) {
    const dataFile = zip.file(manifest.dataFile)
    if (!dataFile) throw new Error('В архиве нет backup.json')
    const prepared = parseJsonBackup(await dataFile.async('string'), true)
    const images = await Promise.all(manifest.images.map(async (image) => {
      const archived = zip.file(image.path)
      if (!archived) throw new Error(`В архиве нет изображения ${image.path}`)
      return { id: image.id, blob: new Blob([await archived.async('arraybuffer')], { type: image.type }), updatedAt: Date.now(), characterId: image.characterId }
    }))
    return { ...prepared, images }
  }
  if (validLegacyManifest(manifest)) {
    const characterFile = zip.file(manifest.characterFile)
    if (!characterFile) throw new Error('В архиве нет character.json')
    const character = restoreCharacter(await characterFile.async('string'))
    const images = await Promise.all(manifest.images.map(async (image) => {
      const archived = zip.file(image.path)
      if (!archived) throw new Error(`В архиве нет изображения ${image.path}`)
      return { id: image.id, blob: new Blob([await archived.async('arraybuffer')], { type: image.type }), updatedAt: Date.now() }
    }))
    return { backupType: 'singleCharacter', legacy: true, character: createCharacterRecord(character, { id: 'legacy-import' }), images }
  }
  throw new Error('Неподдерживаемый формат резервной копии')
}

export function materializeImportedCharacter(record: CharacterRecord, images: ImageRecord[], newCharacterId: string = crypto.randomUUID(), preserveTimestamps = false): { character: CharacterRecord; images: ImageRecord[] } {
  const referenced = collectCharacterImageIds(record.data)
  const available = new Map(images.map((image) => [image.id, image]))
  const replacements = new Map<string, string | undefined>()
  const copiedImages: ImageRecord[] = []
  for (const oldId of referenced) {
    const source = available.get(oldId)
    if (!source) { replacements.set(oldId, undefined); continue }
    const id = `${newCharacterId}:${crypto.randomUUID()}`
    replacements.set(oldId, id)
    copiedImages.push({ id, blob: source.blob.slice(0, source.blob.size, source.blob.type), updatedAt: Date.now(), characterId: newCharacterId })
  }
  const timestamp = new Date().toISOString()
  const data = rewriteCharacterImageIds(record.data, replacements)
  return { character: { ...structuredClone(record), id: newCharacterId, createdAt: preserveTimestamps ? record.createdAt : timestamp, updatedAt: preserveTimestamps ? record.updatedAt : timestamp, data }, images: copiedImages }
}

// Совместимые адаптеры старого публичного API.
export async function createCharacterBackup(state: CharacterState): Promise<{ blob: Blob; imageCount: number }> {
  return createLibraryBackup(createCharacterLibrary(state, { id: 'exported-character' }), 'current')
}

export async function restoreCharacterBackup(file: Blob): Promise<{ character: CharacterState; imageCount: number }> {
  const restored = await restoreLibraryBackup(file)
  const character = restored.character ?? (restored.library?.activeCharacterId ? restored.library.characters[restored.library.activeCharacterId]?.data : undefined)
  if (!character) throw new Error('В резервной копии нет персонажа')
  if (restored.images.length) await saveImages(restored.images)
  return { character: 'data' in character ? character.data : character, imageCount: restored.images.length }
}
