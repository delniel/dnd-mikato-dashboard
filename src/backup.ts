import { loadImages, saveImages } from './db'
import { restoreCharacter, serializeCharacter, type CharacterState } from './domain'

const BACKUP_FORMAT = 'dnd-mge-character-backup'
const BACKUP_VERSION = 1

type BackupImage = { id: string; path: string; type: string }
type BackupManifest = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  characterFile: 'character.json'
  images: BackupImage[]
}

const imageIdsFrom = (entries: Array<{ imageId?: string }>) => entries.flatMap((entry) => entry.imageId ? [entry.imageId] : [])

export function collectImageIds(state: CharacterState): string[] {
  return [...new Set([
    state.profile.avatarId,
    ...imageIdsFrom(state.languages),
    ...imageIdsFrom(state.proficiencies),
    ...imageIdsFrom(state.elements),
    ...imageIdsFrom(state.spells),
    ...imageIdsFrom(state.skills),
    ...imageIdsFrom(state.inventory),
    ...imageIdsFrom(state.notes),
  ].filter((id): id is string => Boolean(id)))]
}

const isBackupManifest = (value: unknown): value is BackupManifest => {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<BackupManifest>
  return manifest.format === BACKUP_FORMAT
    && manifest.version === BACKUP_VERSION
    && manifest.characterFile === 'character.json'
    && Array.isArray(manifest.images)
    && manifest.images.every((image) => image
      && typeof image.id === 'string'
      && typeof image.path === 'string'
      && image.path.startsWith('images/')
      && !image.path.includes('..')
      && typeof image.type === 'string')
}

export async function createCharacterBackup(state: CharacterState): Promise<{ blob: Blob; imageCount: number }> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const ids = collectImageIds(state)
  const records = await loadImages(ids)
  const images: BackupImage[] = []

  records.forEach((record, index) => {
    if (!record) return
    const path = `images/${index}`
    zip.file(path, record.blob)
    images.push({ id: record.id, path, type: record.blob.type || 'application/octet-stream' })
  })

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    characterFile: 'character.json',
    images,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file(manifest.characterFile, serializeCharacter(state))

  return {
    blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }),
    imageCount: images.length,
  }
}

export async function restoreCharacterBackup(file: Blob): Promise<{ character: CharacterState; imageCount: number }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('В архиве нет manifest.json')

  const manifestValue: unknown = JSON.parse(await manifestFile.async('string'))
  if (!isBackupManifest(manifestValue)) throw new Error('Неподдерживаемый формат резервной копии')

  const characterFile = zip.file(manifestValue.characterFile)
  if (!characterFile) throw new Error('В архиве нет character.json')
  const character = restoreCharacter(await characterFile.async('string'))

  const images = await Promise.all(manifestValue.images.map(async (image) => {
    const archived = zip.file(image.path)
    if (!archived) throw new Error(`В архиве нет изображения ${image.path}`)
    const bytes = await archived.async('arraybuffer')
    return { id: image.id, blob: new Blob([bytes], { type: image.type }), updatedAt: Date.now() }
  }))
  if (images.length) await saveImages(images)

  return { character, imageCount: images.length }
}
