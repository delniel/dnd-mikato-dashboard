import { describe, expect, it } from 'vitest'
import { createInitialCharacter } from './data'
import type { CombatEffect } from './combat'
import { changeResource, convertCurrency, deductMana, levelUp, manaRecoveryAmount, migrateCharacter, restoreCharacter, restoreMana, rollDice, serializeCharacter, setLevel, setResourceMaximum, setSuperiorityDie, setTemporaryHp, thresholdForLevel, undoResource } from './domain'
import { useCharacterStore } from './store'

const base = () => createInitialCharacter()

describe('ресурсы и уровень', () => {
  it('меняет HP и ману только на переданный один шаг', () => {
    expect(changeResource(base(), 'hp', 80).resources.hp.current).toBe(80)
    expect(deductMana(base(), 1)?.resources.mana.current).toBe(299)
  })

  it('поддерживает ручной ввод ресурса и максимума', () => {
    const result = setResourceMaximum(changeResource(base(), 'hp', 70), 'hp', 60)
    expect(result.resources.hp).toEqual({ current: 60, max: 60, temporary: 0 })
  })

  it('не допускает отрицательную ману без отдельной настройки', () => {
    const state = base()
    expect(deductMana({ ...state, resources: { ...state.resources, mana: { current: 10, max: 300 } } }, 60)).toBeNull()
  })

  it('отменяет последнее изменение ресурса', () => {
    expect(undoResource(changeResource(base(), 'hp', 80)).resources.hp.current).toBe(81)
  })

  it('изменяет уровень без других автоправок', () => {
    const state = base()
    expect(levelUp({ ...state, experience: 570 }).level).toBe(12)
    expect(levelUp({ ...state, experience: 569 }).level).toBe(11)
    expect(setLevel(state, state.level - 1).level).toBe(10)
    expect(setLevel(state, 42).level).toBe(25)
    expect(setLevel(state, -4).level).toBe(0)
  })

  it('возвращает отсутствующий порог опыта без аварии', () => {
    expect(thresholdForLevel(0)).toBe(20)
    expect(thresholdForLevel(1)).toBe(45)
    expect(thresholdForLevel(23)).toBe(1860)
    expect(thresholdForLevel(24)).toBe(2000)
    expect(thresholdForLevel(25)).toBeUndefined()
  })

  it('хранит редактируемый тип кости превосходства в ресурсе', () => {
    const changed = setSuperiorityDie(base(), '1d6 (домашнее правило)')
    expect(changed.resources.superiority.dieType).toBe('1d6 (домашнее правило)')
  })

  it('хранит временные хиты отдельно от текущих и максимальных', () => {
    const changed = setTemporaryHp(base(), 15)
    expect(changed.resources.hp).toEqual({ current: 81, max: 81, temporary: 15 })
    expect(setResourceMaximum(changed, 'hp', 60).resources.hp).toEqual({ current: 60, max: 60, temporary: 15 })
  })

  it('не позволяет повыситься выше 25 уровня', () => {
    const state = { ...base(), level: 24, experience: 2000 }
    const maximum = levelUp(state)
    expect(maximum.level).toBe(25)
    expect(levelUp({ ...maximum, experience: 9999 }).level).toBe(25)
  })
})

describe('редактируемые данные листа', () => {
  it('содержит языки, владения и элементы отдельными записями', () => {
    const state = base()
    expect(state.languages.map((entry) => entry.name)).toEqual(['Общий', 'Жесты'])
    expect(state.proficiencies).toHaveLength(2)
    expect(state.elements).toHaveLength(3)
  })

  it('сохраняет полные названия длинных навыков в начальных данных', () => {
    const skills = base().characteristics.flatMap((characteristic) => characteristic.skills.map((skill) => skill.name))
    expect(skills).toContain('Ловкость рук')
    expect(skills).toContain('Уход за животными')
    expect(skills).toContain('Проницательность')
  })

  it('поддерживает CRUD для коллекций через хранилище', () => {
    useCharacterStore.getState().reset()
    useCharacterStore.getState().upsertEntry('languages', { id: 'elvish', name: 'Эльфийский' })
    expect(useCharacterStore.getState().languages.some((entry) => entry.name === 'Эльфийский')).toBe(true)
    useCharacterStore.getState().deleteEntry('languages', 'elvish')
    expect(useCharacterStore.getState().languages.some((entry) => entry.id === 'elvish')).toBe(false)
  })

  it('изменяет валюту без конвертации', () => {
    useCharacterStore.getState().reset()
    useCharacterStore.getState().adjustCurrency('GP', 1)
    useCharacterStore.getState().setCurrency('PP', 7)
    expect(useCharacterStore.getState().currencies).toEqual({ PP: 7, GP: 71, SP: 0, CP: 0 })
  })

  it('создаёт, изменяет и удаляет заклинание', () => {
    useCharacterStore.getState().reset()
    const spell = { ...base().spells[0], id: 'custom-spell', name: 'Тест' }
    useCharacterStore.getState().upsertSpell(spell)
    useCharacterStore.getState().upsertSpell({ ...spell, name: 'Тест 2' })
    expect(useCharacterStore.getState().spells.find((item) => item.id === spell.id)?.name).toBe('Тест 2')
    useCharacterStore.getState().deleteSpell(spell.id)
    expect(useCharacterStore.getState().spells.some((item) => item.id === spell.id)).toBe(false)
  })

  it('создаёт независимую копию навыка', () => {
    useCharacterStore.getState().reset()
    const original = base().skills[0]
    const copy = { ...original, id: 'copy-skill', name: `${original.name} — копия`, mechanics: 'Изменённая механика' }
    useCharacterStore.getState().upsertSkill(copy)
    expect(useCharacterStore.getState().skills.find((skill) => skill.id === original.id)?.mechanics).not.toBe(copy.mechanics)
    expect(useCharacterStore.getState().skills.find((skill) => skill.id === copy.id)?.name).toBe(copy.name)
  })

  it('создаёт, изменяет и удаляет предмет', () => {
    useCharacterStore.getState().reset()
    const item = { ...base().inventory[0], id: 'custom-item', name: 'Тестовый предмет' }
    useCharacterStore.getState().upsertItem(item)
    expect(useCharacterStore.getState().inventory.some((entry) => entry.id === item.id)).toBe(true)
    useCharacterStore.getState().deleteItem(item.id)
    expect(useCharacterStore.getState().inventory.some((entry) => entry.id === item.id)).toBe(false)
  })

  it('создаёт, изменяет и удаляет несколько заметок', () => {
    useCharacterStore.getState().reset()
    const first = { id: 'note-1', title: 'Первое событие', body: 'Текст', tags: ['сессия'], imageId: 'image-1', createdAt: '2026-07-21T10:00:00.000Z', updatedAt: '2026-07-21T10:00:00.000Z' }
    const second = { id: 'note-2', title: 'Второе событие', body: 'Другое', tags: [], createdAt: '2026-07-21T10:00:00.000Z', updatedAt: '2026-07-21T10:00:00.000Z' }
    useCharacterStore.getState().upsertNote(first)
    useCharacterStore.getState().upsertNote(second)
    useCharacterStore.getState().upsertNote({ ...first, body: 'Обновлённый текст' })
    expect(useCharacterStore.getState().notes).toHaveLength(2)
    expect(useCharacterStore.getState().notes.find((note) => note.id === first.id)?.body).toBe('Обновлённый текст')
    useCharacterStore.getState().deleteNote(second.id)
    expect(useCharacterStore.getState().notes.map((note) => note.id)).toEqual(['note-1'])
  })

  it('имеет гибкие поля профессии и мастерства/магии', () => {
    const state = base()
    expect(state.profile).toHaveProperty('profession')
    expect(state.profile).toHaveProperty('masteryMagic', 'Магия')
  })
})

describe('кубики и миграция', () => {
  it('группирует результаты по типу кубика и считает точную сумму', () => {
    const result = rollDice({ d4: 2, d10: 1 }, () => 0.5)
    expect(result.results.d4).toEqual([3, 3])
    expect(result.results.d10).toEqual([6])
    expect(result.total).toBe(12)
  })

  it('хранит не больше десяти бросков', () => {
    useCharacterStore.getState().reset()
    for (let index = 0; index < 12; index += 1) useCharacterStore.getState().addRoll({ d2: 1 })
    expect(useCharacterStore.getState().diceHistory).toHaveLength(10)
    useCharacterStore.getState().clearRolls()
    expect(useCharacterStore.getState().diceHistory).toHaveLength(0)
  })

  it('мигрирует прежний снимок, сохраняя ресурсы, заметку, избранное, аватар и тип кости', () => {
    const old = {
      profile: { name: 'Старый Урумир', avatarId: 'avatar-1', elements: 'Мутация, Кости', superiorityDie: '1d6', powerType: 'Мастерство и Магия' },
      resources: { hp: { current: 40, max: 81 }, mana: { current: 200, max: 300 }, superiority: { current: 1, max: 2 } },
      experience: 18,
      level: 11,
      senses: { Анализ: '12' },
      favorites: ['hydra'],
      notes: 'Сохранённая заметка',
      settings: { levelUpBehavior: 'carry', allowNegativeMana: false },
    }
    const migrated = migrateCharacter(old)
    expect(migrated.schemaVersion).toBe(5)
    expect(migrated.profile.avatarId).toBe('avatar-1')
    expect(migrated.profile.masteryMagic).toBe('Мастерство и Магия')
    expect(migrated.resources.hp.current).toBe(40)
    expect(migrated.resources.superiority.dieType).toBe('1d6')
    expect(migrated.notes).toMatchObject([{ title: 'Старая заметка', body: 'Сохранённая заметка' }])
    expect(migrated.elements.map((entry) => entry.name)).toContain('Кости')
  })

  it('исправляет разрезанные старой версией названия навыков без потери бонуса', () => {
    const migrated = migrateCharacter({
      characteristics: [{ id: 'Ловкость', name: 'Ловкость', score: '14', check: '+2', save: '+2', skills: [{ id: 'Ловкость-Ловкость', name: 'Ловкость', bonus: 'рук' }] }],
    })
    expect(migrated.characteristics[0].skills[0]).toMatchObject({ name: 'Ловкость рук', bonus: '' })
  })

  it('сохраняет уже созданные заметки, их теги и imageId при миграции', () => {
    const notes = [{ id: 'keep', title: 'Карта', body: 'Подземелье', tags: ['локация'], imageId: 'map-image', createdAt: '2026-07-20T12:00:00.000Z', updatedAt: '2026-07-21T12:00:00.000Z' }]
    const migrated = migrateCharacter({ notes })
    expect(migrated.notes).toEqual(notes)
  })

  it('сохраняет историю бросков при миграции, но не добавляет её в экспорт', () => {
    const state = { ...base(), diceHistory: [{ id: 'roll', dice: { d20: 1 }, results: { d20: [17] }, total: 17, createdAt: '2026-07-21T12:00:00.000Z' }] }
    expect(migrateCharacter(state).diceHistory).toHaveLength(1)
    expect(JSON.parse(serializeCharacter(state)).diceHistory).toEqual([])
  })

  it('добавляет тему, вдохновение и архивирует удалённый электрум при миграции', () => {
    const migrated = migrateCharacter({ inspiration: true, settings: { themeMode: 'light', accentColor: 'purple' }, currencies: { PP: 1, GP: 2, EP: 7, SP: 3, CP: 4 } })
    expect(migrated.inspiration).toBe(true)
    expect(migrated.settings).toMatchObject({ themeMode: 'light', accentColor: 'purple' })
    expect(migrated.currencies).toEqual({ PP: 1, GP: 2, SP: 3, CP: 4 })
    expect(migrated.extras).toMatchObject({ retiredCurrencies: { EP: 7 } })
  })

  it('сохраняет намеренно очищенные коллекции и объединяет старые поля класса', () => {
    const migrated = migrateCharacter({
      profile: { className: 'Следопыт', background: 'Странник' },
      languages: [],
      proficiencies: [],
      elements: [],
    })
    expect(migrated.profile.classBackground).toBe('Следопыт · Странник')
    expect(migrated.languages).toEqual([])
    expect(migrated.proficiencies).toEqual([])
    expect(migrated.elements).toEqual([])
    expect(migrateCharacter(migrated).profile.classBackground).toBe('Следопыт · Странник')
    expect(migrateCharacter({ ...migrated, profile: { ...migrated.profile, classBackground: '', background: 'Старое значение' } }).profile.classBackground).toBe('')
  })

  it('переносит старое превышение максимума HP во временные хиты', () => {
    const migrated = migrateCharacter({ resources: { hp: { current: 96, max: 81 } } })
    expect(migrated.resources.hp).toEqual({ current: 81, max: 81, temporary: 15 })
  })

  it('импортирует старый экспорт с новыми значениями по умолчанию', () => {
    const restored = restoreCharacter(JSON.stringify({ profile: { name: 'Импорт' }, resources: base().resources }))
    expect(restored.profile.name).toBe('Импорт')
    expect(restored.currencies.GP).toBe(70)
    expect(restored.spells.length).toBeGreaterThan(0)
    expect(restored.notes).toEqual([])
    expect(restored.combatEffects).toEqual([])
    expect(restoreCharacter(serializeCharacter(base())).schemaVersion).toBe(5)
  })

  it('сохраняет боевые эффекты при экспорте и импорте', () => {
    const combatEffect: CombatEffect = { id: 'acid', name: 'Разъедание кислотой', category: 'negative', source: '', description: '1к6 урона кислотой', active: true, concentration: false, createdAt: '2026-07-22T10:00:00.000Z', duration: { type: 'rounds', roundsRemaining: 3 }, modifiers: [] }
    const restored = restoreCharacter(serializeCharacter({ ...base(), combatEffects: [combatEffect] }))
    expect(restored.combatEffects).toEqual([combatEffect])
  })

  it('конвертирует только соседние номиналы монет по курсу 1 к 10', () => {
    const state = { ...base(), currencies: { PP: 1, GP: 10, SP: 0, CP: 0 } }
    const down = convertCurrency(state, 'PP', 'GP')
    expect(down.currencies).toEqual({ PP: 0, GP: 20, SP: 0, CP: 0 })
    const up = convertCurrency(down, 'GP', 'PP')
    expect(up.currencies).toEqual({ PP: 1, GP: 10, SP: 0, CP: 0 })
    expect(convertCurrency(state, 'PP', 'SP')).toBe(state)
    expect(convertCurrency({ ...state, currencies: { PP: 0, GP: 9, SP: 0, CP: 0 } }, 'GP', 'PP').currencies.GP).toBe(9)
  })

  it('восстанавливает ману по текстовому показателю и не превышает максимум', () => {
    const state = base()
    state.profile.manaRecovery = '+30 маны'
    state.resources.mana = { current: 285, max: 300 }
    expect(manaRecoveryAmount(state.profile.manaRecovery)).toBe(30)
    const restored = restoreMana(state)
    expect(restored.resources.mana.current).toBe(300)
    expect(restored.recentAction?.label).toBe('Восстановление: +30 маны')
    expect(restoreMana(restored)).toBe(restored)
    expect(manaRecoveryAmount('не указано')).toBe(0)
  })
})
