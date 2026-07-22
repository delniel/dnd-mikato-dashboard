import { describe, expect, it } from 'vitest'
import { createInitialCharacter } from './data'
import { normalizeLibrary } from './db'
import { addCharacter, characterForActivation, createCharacterLibrary, createCharacterRecord, deleteCharacter, duplicateCharacter, migrateCharacterLibrary, renameCharacter, syncActiveCharacter } from './library'

describe('библиотека персонажей', () => {
  it('мигрирует старый одиночный снимок ровно один раз со всеми данными', () => {
    const old = createInitialCharacter()
    old.profile.name = 'Старый герой'; old.resources.hp.current = 37; old.spells[0].name = 'Старое заклинание'
    const migrated = migrateCharacterLibrary(old)
    expect(migrated.characterOrder).toEqual(['legacy-character'])
    expect(migrated.characters['legacy-character'].data).toMatchObject({ profile: { name: 'Старый герой' }, resources: { hp: { current: 37 } } })
    expect(migrated.characters['legacy-character'].data.spells[0].name).toBe('Старое заклинание')
    expect(migrateCharacterLibrary(migrated).characterOrder).toEqual(['legacy-character'])
  })

  it('держит данные двух персонажей независимыми', () => {
    const first = createCharacterLibrary(createInitialCharacter(), { id: 'a', timestamp: '2026-01-01' })
    const second = createCharacterRecord(createInitialCharacter(), { id: 'b', name: 'Б', timestamp: '2026-01-02' })
    const library = addCharacter(first, second)
    const changed = structuredClone(library.characters.a.data)
    changed.resources.hp.current = 1; changed.spells[0].name = 'Изменено'; changed.inventory[0].quantity = '99'
    const synced = syncActiveCharacter({ ...library, activeCharacterId: 'a' }, changed, '2026-01-03')
    expect(synced.characters.b.data.resources.hp.current).not.toBe(1)
    expect(synced.characters.b.data.spells[0].name).not.toBe('Изменено')
    expect(synced.characters.b.data.inventory[0].quantity).not.toBe('99')
  })

  it('сохраняет акцентный цвет отдельно у каждого персонажа, оставляя тему общей', () => {
    const first = createInitialCharacter()
    first.settings.accentColor = 'red'
    let library = createCharacterLibrary(first, { id: 'a' })
    const second = createInitialCharacter()
    second.settings.accentColor = 'blue'
    library = addCharacter(library, createCharacterRecord(second, { id: 'b' }))
    const changed = structuredClone(library.characters.a.data)
    changed.settings = { ...changed.settings, accentColor: 'green', themeMode: 'light' }
    const synced = syncActiveCharacter({ ...library, activeCharacterId: 'a' }, changed)
    expect(synced.characters.a.data.settings.accentColor).toBe('green')
    expect(synced.characters.b.data.settings.accentColor).toBe('blue')
    expect(synced.settings).toMatchObject({ themeMode: 'light', accentColor: 'red' })
    expect(characterForActivation(synced, 'b')?.settings).toMatchObject({ themeMode: 'light', accentColor: 'blue' })
  })

  it('дублирует глубоко, переименовывает и выбирает следующего после удаления', () => {
    let library = createCharacterLibrary(createInitialCharacter(), { id: 'a', timestamp: '2026-01-01' })
    library = duplicateCharacter(library, 'a', { id: 'b', timestamp: '2026-01-02' })
    expect(library.characters.b.name).toContain('копия')
    library.characters.b.data.resources.hp.current = 5
    expect(library.characters.a.data.resources.hp.current).not.toBe(5)
    library = renameCharacter(library, 'b', 'Новый герой', '2026-01-03')
    expect(library.characters.b.data.profile.name).toBe('Новый герой')
    library = deleteCharacter({ ...library, activeCharacterId: 'a' }, 'a')
    expect(library.activeCharacterId).toBe('b')
  })

  it('пропускает повреждённого персонажа коллекции, сохраняя исправных', () => {
    const good = createCharacterRecord(createInitialCharacter(), { id: 'good' })
    const migrated = migrateCharacterLibrary({ schemaVersion: 2, activeCharacterId: 'bad', characterOrder: ['bad', 'good'], characters: { bad: null, good }, settings: good.data.settings })
    expect(migrated.characterOrder).toEqual(['good'])
    expect(migrated.activeCharacterId).toBe('good')
  })

  it('не возвращает удалённые исходные заклинания и не перезаписывает изменённые при загрузке', () => {
    const character = createInitialCharacter()
    character.spells = character.spells.slice(1)
    character.spells[0] = { ...character.spells[0], name: 'Пользовательская версия' }
    const normalized = normalizeLibrary(createCharacterLibrary(character, { id: 'custom' }))
    expect(normalized.characters.custom.data.spells).toHaveLength(character.spells.length)
    expect(normalized.characters.custom.data.spells[0].name).toBe('Пользовательская версия')
    expect(normalized.characters.custom.data.spells.some((spell) => spell.id === 'hydra')).toBe(false)
  })
})
