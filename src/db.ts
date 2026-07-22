import Dexie, { type EntityTable } from 'dexie'
import { migrateCharacter, SCHEMA_VERSION, type CharacterState } from './domain'
type Snapshot = { id: 'character'; value: CharacterState }
type ImageRecord = { id: string; blob: Blob; updatedAt: number }
class CharacterDatabase extends Dexie {
  snapshots!: EntityTable<Snapshot, 'id'>; images!: EntityTable<ImageRecord, 'id'>
  constructor() {
    super('dnd-mikato-dashboard')
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
  }
}
export const db = new CharacterDatabase()
export const saveCharacter = (value: CharacterState) => db.snapshots.put({ id: 'character', value: { ...value, schemaVersion: SCHEMA_VERSION } })
export const loadCharacter = async () => { const saved = await db.snapshots.get('character'); return saved ? { id: 'character' as const, value: migrateCharacter(saved.value) } : undefined }
export const saveImage = async (file: File) => { const id = crypto.randomUUID(); await db.images.put({ id, blob: file, updatedAt: Date.now() }); return id }
export const loadImage = (id: string) => db.images.get(id)
export const cloneImage = async (id?: string) => {
  if (!id) return undefined
  const image = await db.images.get(id)
  if (!image) return undefined
  const copyId = crypto.randomUUID()
  await db.images.put({ id: copyId, blob: image.blob.slice(0, image.blob.size, image.blob.type), updatedAt: Date.now() })
  return copyId
}
export const removeImage = (id: string) => db.images.delete(id)
