import Dexie, { type EntityTable } from 'dexie'
import { spells as seededSpells } from './data'
import { migrateCharacter, SCHEMA_VERSION, type CharacterState } from './domain'
type Snapshot = { id: 'character'; value: CharacterState }
export type ImageRecord = { id: string; blob: Blob; updatedAt: number }
const mergeSeededSpells = (value: unknown, includeMissing = false): CharacterState => {
  const normalized = migrateCharacter(value)
  if (!seededSpells.length) return normalized
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
  }
}
export const db = new CharacterDatabase()
export const saveCharacter = (value: CharacterState) => db.snapshots.put({ id: 'character', value: { ...value, schemaVersion: SCHEMA_VERSION } })
export const loadCharacter = async () => { const saved = await db.snapshots.get('character'); return saved ? { id: 'character' as const, value: mergeSeededSpells(saved.value) } : undefined }
export const saveImage = async (file: File) => { const id = crypto.randomUUID(); await db.images.put({ id, blob: file, updatedAt: Date.now() }); return id }
export const loadImage = (id: string) => db.images.get(id)
export const loadImages = (ids: string[]) => db.images.bulkGet(ids)
export const saveImages = (images: ImageRecord[]) => db.images.bulkPut(images)
export const cloneImage = async (id?: string) => {
  if (!id) return undefined
  const image = await db.images.get(id)
  if (!image) return undefined
  const copyId = crypto.randomUUID()
  await db.images.put({ id: copyId, blob: image.blob.slice(0, image.blob.size, image.blob.type), updatedAt: Date.now() })
  return copyId
}
export const removeImage = (id: string) => db.images.delete(id)
