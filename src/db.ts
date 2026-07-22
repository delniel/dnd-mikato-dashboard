import Dexie, { type EntityTable } from 'dexie'
import { spells as seededSpells } from './data'
import { migrateCharacter, SCHEMA_VERSION, type CharacterState } from './domain'
import { collectCharacterImageIds, createCharacterLibrary, migrateCharacterLibrary, type CharacterLibrary } from './library'
type Snapshot = { id: 'character' | 'library'; value: unknown }
export type ImageRecord = { id: string; blob: Blob; updatedAt: number; characterId?: string }
const mergeSeededSpells = (value: unknown, includeMissing = false): CharacterState => {
  const normalized = migrateCharacter(value)
  // Публичная версия должна оставаться пустым конструктором персонажа.
  // Исходные заклинания Урумира синхронизируются только в личной локальной сборке.
  if (import.meta.env.VITE_PUBLIC_BLANK === 'true' || !seededSpells.length) return normalized
  const byId = new Map(seededSpells.map((spell) => [spell.id, spell]))
  const spells = normalized.spells.map((spell) => {
    const replacement = byId.get(spell.id)
    return replacement ? { ...replacement, ...(spell.imageId ? { imageId: spell.imageId } : {}) } : spell
  })
  if (!includeMissing) return { ...normalized, spells }
  const existingIds = new Set(spells.map((spell) => spell.id))
  return {
    ...normalized,
    spells: [...spells, ...seededSpells.filter((spell) => !existingIds.has(spell.id))],
  }
}
export const normalizeLibrary = (value: unknown): CharacterLibrary => {
  const library = migrateCharacterLibrary(value)
  return {
    ...library,
    // Обычная загрузка не должна возвращать удалённые заклинания и менять
    // пользовательские записи. Синхронизация исходных данных выполняется
    // только одноразовыми миграциями БД ниже.
    characters: Object.fromEntries(Object.entries(library.characters).map(([id, character]) => [id, { ...character, data: { ...migrateCharacter(character.data), settings: library.settings } }])),
  }
}
class CharacterDatabase extends Dexie {
  snapshots!: EntityTable<Snapshot, 'id'>; images!: EntityTable<ImageRecord, 'id'>
  constructor() {
    super('urumir-dashboard')
    this.version(1).stores({ snapshots: 'id', images: 'id, updatedAt' })
    this.version(2).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: migrateCharacter(saved.value) })
    })
    this.version(3).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: migrateCharacter(saved.value) })
    })
    this.version(4).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: migrateCharacter(saved.value) })
    })
    this.version(5).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: mergeSeededSpells(saved.value) })
    })
    this.version(6).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: mergeSeededSpells(saved.value, true) })
    })
    this.version(7).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: mergeSeededSpells(saved.value, true) })
    })
    this.version(8).stores({ snapshots: 'id', images: 'id, updatedAt' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const saved = await table.get('character') as { id: 'character'; value: unknown } | undefined
      if (saved) await table.put({ id: 'character', value: mergeSeededSpells(saved.value, true) })
    })
    this.version(9).stores({ snapshots: 'id', images: 'id, updatedAt, characterId' }).upgrade(async (transaction) => {
      const table = transaction.table('snapshots')
      const library = await table.get('library') as { id: 'library'; value: unknown } | undefined
      let normalized: CharacterLibrary | undefined
      if (library) normalized = normalizeLibrary(library.value)
      else {
        const legacy = await table.get('character') as { id: 'character'; value: unknown } | undefined
        if (legacy) normalized = createCharacterLibrary(mergeSeededSpells(legacy.value, true), { id: 'legacy-character' })
      }
      if (normalized) {
        await table.put({ id: 'library', value: normalized })
        const images = transaction.table('images')
        for (const character of Object.values(normalized.characters)) {
          for (const id of collectCharacterImageIds(character.data)) {
            const image = await images.get(id) as ImageRecord | undefined
            if (image && !image.characterId) await images.put({ ...image, characterId: character.id })
          }
        }
      }
    })
  }
}
export const db = new CharacterDatabase()
export const saveCharacter = (value: CharacterState) => db.snapshots.put({ id: 'character', value: { ...value, schemaVersion: SCHEMA_VERSION } })
export const loadCharacter = async () => { const saved = await db.snapshots.get('character'); return saved ? { id: 'character' as const, value: mergeSeededSpells(saved.value) } : undefined }
export const saveLibrary = (value: CharacterLibrary) => db.snapshots.put({ id: 'library', value })
export const loadLibrary = async () => {
  const saved = await db.snapshots.get('library')
  if (saved) return { id: 'library' as const, value: normalizeLibrary(saved.value) }
  const legacy = await db.snapshots.get('character')
  return legacy ? { id: 'library' as const, value: createCharacterLibrary(mergeSeededSpells(legacy.value, true), { id: 'legacy-character' }) } : undefined
}
export const saveImage = async (file: File, characterId?: string) => { const id = characterId ? `${characterId}:${crypto.randomUUID()}` : crypto.randomUUID(); await db.images.put({ id, blob: file, updatedAt: Date.now(), ...(characterId ? { characterId } : {}) }); return id }
export const loadImage = (id: string) => db.images.get(id)
export const loadImages = (ids: string[]) => db.images.bulkGet(ids)
export const saveImages = (images: ImageRecord[]) => db.images.bulkPut(images)
export const cloneImage = async (id?: string, characterId?: string) => {
  if (!id) return undefined
  const image = await db.images.get(id)
  if (!image) return undefined
  const owner = characterId ?? image.characterId
  const copyId = owner ? `${owner}:${crypto.randomUUID()}` : crypto.randomUUID()
  await db.images.put({ id: copyId, blob: image.blob.slice(0, image.blob.size, image.blob.type), updatedAt: Date.now(), ...(owner ? { characterId: owner } : {}) })
  return copyId
}
export const removeImage = (id: string) => db.images.delete(id)
export const removeImages = (ids: string[]) => ids.length ? db.images.bulkDelete(ids) : Promise.resolve()
