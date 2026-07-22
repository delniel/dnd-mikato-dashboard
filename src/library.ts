import { createInitialCharacter } from './data'
import { migrateCharacter, type CharacterState } from './domain'

export const LIBRARY_SCHEMA_VERSION = 2
export type AppSettings = CharacterState['settings']
export type CharacterRecord = { id: string; name: string; createdAt: string; updatedAt: string; data: CharacterState }
export type CharacterLibrary = { schemaVersion: number; activeCharacterId: string | null; characterOrder: string[]; characters: Record<string, CharacterRecord>; settings: AppSettings }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const clone = <T,>(value: T): T => structuredClone(value)
const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

export function createCharacterRecord(data: CharacterState = createInitialCharacter(), options: { id?: string; name?: string; timestamp?: string } = {}): CharacterRecord {
  const id = options.id ?? newId()
  const timestamp = options.timestamp ?? now()
  const copy = clone(data)
  const name = options.name?.trim() || copy.profile.name?.trim() || 'Новый персонаж'
  copy.profile = { ...copy.profile, name }
  return { id, name, createdAt: timestamp, updatedAt: timestamp, data: copy }
}

export function createCharacterLibrary(data: CharacterState = createInitialCharacter(), options: { id?: string; timestamp?: string } = {}): CharacterLibrary {
  const character = createCharacterRecord(data, options)
  return { schemaVersion: LIBRARY_SCHEMA_VERSION, activeCharacterId: character.id, characterOrder: [character.id], characters: { [character.id]: character }, settings: clone(character.data.settings) }
}

const normalizeSettings = (value: unknown): AppSettings => migrateCharacter({ settings: value }).settings

export function migrateCharacterLibrary(value: unknown): CharacterLibrary {
  if (isRecord(value) && isRecord(value.characters)) {
    const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : 1
    if (version > LIBRARY_SCHEMA_VERSION) throw new Error('Резервная копия создана более новой версией приложения')
    const characters: Record<string, CharacterRecord> = {}
    for (const [mapId, raw] of Object.entries(value.characters)) {
      if (!isRecord(raw)) continue
      try {
        const id = typeof raw.id === 'string' && raw.id ? raw.id : mapId
        const data = migrateCharacter(isRecord(raw.data) ? raw.data : raw)
        const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : data.profile.name?.trim() || 'Без имени'
        data.profile = { ...data.profile, name }
        characters[id] = {
          id,
          name,
          createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now(),
          updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now(),
          data,
        }
      } catch { /* Повреждённая запись не должна уничтожать остальные. */ }
    }
    const listed = Array.isArray(value.characterOrder) ? value.characterOrder.filter((id): id is string => typeof id === 'string' && Boolean(characters[id])) : []
    const characterOrder = [...new Set([...listed, ...Object.keys(characters)])]
    const requestedActive = typeof value.activeCharacterId === 'string' ? value.activeCharacterId : null
    const settings = normalizeSettings(value.settings)
    for (const character of Object.values(characters)) character.data.settings = clone(settings)
    return {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      activeCharacterId: requestedActive && characters[requestedActive] ? requestedActive : characterOrder[0] ?? null,
      characterOrder,
      characters,
      settings,
    }
  }
  const legacy = migrateCharacter(value)
  return createCharacterLibrary(legacy, { id: 'legacy-character', timestamp: now() })
}

export function getActiveCharacter(library: CharacterLibrary): CharacterRecord | null {
  return library.activeCharacterId ? library.characters[library.activeCharacterId] ?? null : null
}

export function characterForActivation(library: CharacterLibrary, id: string): CharacterState | null {
  const character = library.characters[id]
  return character ? { ...clone(character.data), settings: clone(library.settings) } : null
}

export function syncActiveCharacter(library: CharacterLibrary, data: CharacterState, timestamp = now()): CharacterLibrary {
  const id = library.activeCharacterId
  if (!id || !library.characters[id]) return library
  const copy = clone(data)
  const name = copy.profile.name?.trim() || library.characters[id].name
  copy.profile = { ...copy.profile, name }
  return {
    ...library,
    settings: clone(copy.settings),
    characters: { ...library.characters, [id]: { ...library.characters[id], name, updatedAt: timestamp, data: copy } },
  }
}

export function selectCharacter(library: CharacterLibrary, id: string): CharacterLibrary {
  return library.characters[id] ? { ...library, activeCharacterId: id } : { ...library, activeCharacterId: library.characterOrder.find((entry) => library.characters[entry]) ?? null }
}

export function addCharacter(library: CharacterLibrary, character: CharacterRecord): CharacterLibrary {
  const id = library.characters[character.id] ? newId() : character.id
  const copy = clone({ ...character, id, data: { ...character.data, settings: library.settings } })
  return { ...library, activeCharacterId: id, characterOrder: [...library.characterOrder, id], characters: { ...library.characters, [id]: copy } }
}

export function duplicateCharacter(library: CharacterLibrary, id: string, options: { id?: string; timestamp?: string } = {}): CharacterLibrary {
  const source = library.characters[id]
  if (!source) return library
  const copy = createCharacterRecord(source.data, { id: options.id, name: `${source.name} — копия`, timestamp: options.timestamp })
  return addCharacter(library, copy)
}

export function renameCharacter(library: CharacterLibrary, id: string, name: string, timestamp = now()): CharacterLibrary {
  const source = library.characters[id]
  const clean = name.trim()
  if (!source || !clean) return library
  const data = clone(source.data)
  data.profile = { ...data.profile, name: clean }
  return { ...library, characters: { ...library.characters, [id]: { ...source, name: clean, updatedAt: timestamp, data } } }
}

export function deleteCharacter(library: CharacterLibrary, id: string): CharacterLibrary {
  if (!library.characters[id]) return library
  const index = library.characterOrder.indexOf(id)
  const characters = { ...library.characters }
  delete characters[id]
  const characterOrder = library.characterOrder.filter((entry) => entry !== id && characters[entry])
  const activeCharacterId = library.activeCharacterId === id
    ? characterOrder[index] ?? characterOrder[index - 1] ?? characterOrder[0] ?? null
    : library.activeCharacterId && characters[library.activeCharacterId] ? library.activeCharacterId : characterOrder[0] ?? null
  return { ...library, characters, characterOrder, activeCharacterId }
}

const imageEntries = (data: CharacterState): Array<{ imageId?: string }> => [
  { imageId: data.profile.avatarId }, ...data.languages, ...data.proficiencies, ...data.elements, ...data.spells, ...data.skills, ...data.inventory, ...data.notes,
]

export function collectCharacterImageIds(data: CharacterState): string[] {
  return [...new Set(imageEntries(data).flatMap((entry) => entry.imageId ? [entry.imageId] : []))]
}

export function rewriteCharacterImageIds(data: CharacterState, replacements: Map<string, string | undefined>): CharacterState {
  const copy = clone(data)
  const replace = (imageId?: string) => imageId ? (replacements.has(imageId) ? replacements.get(imageId) : imageId) : undefined
  const profileAvatar = replace(copy.profile.avatarId)
  copy.profile = { ...copy.profile, ...(profileAvatar ? { avatarId: profileAvatar } : { avatarId: '' }) }
  const rewrite = <T extends { imageId?: string }>(entries: T[]) => entries.map((entry) => { const imageId = replace(entry.imageId); return { ...entry, ...(imageId ? { imageId } : { imageId: undefined }) } })
  copy.languages = rewrite(copy.languages); copy.proficiencies = rewrite(copy.proficiencies); copy.elements = rewrite(copy.elements)
  copy.spells = rewrite(copy.spells); copy.skills = rewrite(copy.skills); copy.inventory = rewrite(copy.inventory); copy.notes = rewrite(copy.notes)
  return copy
}

export function stripCharacterImages(data: CharacterState): CharacterState {
  return rewriteCharacterImageIds(data, new Map(collectCharacterImageIds(data).map((id) => [id, undefined])))
}

export function sanitizeFilename(value: string): string {
  const clean = value.toLocaleLowerCase('ru-RU').normalize('NFKD').replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '')
  return clean || 'character'
}
