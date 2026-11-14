import { describe, expect, it } from 'vitest'
import { allAttackTarget, buildCombatTargets, calculateCombatState, calculateCombatTarget, calculateSpellCombatStats, combatHpTargets, combatModifierSchema, formatSignedCombatNumber, migrateCombatEffects, parseCombatNumber, weaponAttackTarget, type CombatEffect, type CombatTarget } from './combat'
import { createInitialCharacter } from './data'

const armorClass: CombatTarget = { id: 'profile.armorClass', label: 'Класс доспеха', group: 'combat', baseValue: 17 }
const speed: CombatTarget = { id: 'profile.speed', label: 'Скорость', group: 'combat', baseValue: 30, nonNegative: true }

const effect = (patch: Partial<CombatEffect> = {}): CombatEffect => ({
  id: 'effect-1',
  name: 'Пробуждённый скелет',
  category: 'positive',
  source: 'Способность',
  description: '',
  active: true,
  concentration: false,
  createdAt: '2026-07-22T10:00:00.000Z',
  duration: { type: 'untilEndOfCombat' },
  modifiers: [{ id: 'modifier-1', target: armorClass.id, operation: 'ADD', value: 4 }],
  ...patch,
})

describe('чистый расчёт боевых параметров', () => {
  it('пересчитывает атаки, проверки, спасброски и HP по счётчику копий без изменения листа', () => {
    const state = createInitialCharacter()
    state.resources.hp = { current: 60, max: 67 }
    state.customResources = [{ id: 'copies', name: 'Копии', current: 0, max: 3 }]
    state.combatEffects = migrateCombatEffects([effect({ category: 'special', modifiers: [
      ...[allAttackTarget.id, 'characteristic.all.check', 'characteristic.all.save'].map((target) => ({
        id: target, target, operation: 'SUBTRACT' as const, value: 0, resource: { id: 'copies', multiplier: 2, offset: 0 },
      })),
      ...Object.values(combatHpTargets).map((target) => ({
        id: target, target, operation: 'DIVIDE' as const, value: 0, resource: { id: 'copies', multiplier: 1, offset: 1 },
      })),
    ] })])
    const values = () => Object.fromEntries(calculateCombatState(state).map((result) => [result.target.id, result]))
    for (const [copies, current, max] of [[0, 60, 67], [1, 30, 33], [2, 20, 22], [3, 15, 16]]) {
      state.customResources[0].current = copies
      const result = values()
      expect(result[weaponAttackTarget.id].finalValue).toBe(copies ? -2 * copies : 0)
      expect(result[combatHpTargets.current].finalValue).toBe(current)
      expect(result[combatHpTargets.max].finalValue).toBe(max)
      for (const entry of Object.values(result).filter(({ target }) => /\.(check|save)$/.test(target.id))) expect(entry.effectDelta).toBe(copies ? -2 * copies : 0)
    }
    expect(state.resources.hp).toEqual({ current: 60, max: 67 })
    state.customResources = []
    expect(values()[combatHpTargets.max].finalValue).toBe(67)
  })

  it('считает бонус урона от зарядов и пропускает нулевой делитель', () => {
    const state = createInitialCharacter()
    state.customResources = [{ id: 'charges', name: 'Заряды', current: 3, max: 10 }]
    const resource = { id: 'charges', multiplier: 1, offset: 0 }
    state.combatEffects = [effect({ modifiers: [
      { id: 'damage', target: 'profile.damageBonus', operation: 'ADD', value: 0, resource },
      { id: 'division', target: combatHpTargets.max, operation: 'DIVIDE', value: 0, resource },
    ] })]
    const find = (id: string) => calculateCombatState(state).find(({ target }) => target.id === id)?.finalValue
    expect(find('profile.damageBonus')).toBe(3)
    state.customResources[0].current = 0
    expect(find('profile.damageBonus')).toBe(0)
    expect(find(combatHpTargets.max)).toBe(state.resources.hp.max)
  })
  it('учитывает отдельные скорости и эффекты без изменения базовых значений', () => {
    const state = createInitialCharacter()
    state.profile.flySpeed = '30'
    state.profile.swimSpeed = '40'
    state.profile.climbSpeed = '20'
    state.combatEffects = [effect({ modifiers: [{ id: 'flight', target: 'profile.flySpeed', operation: 'ADD', value: 10 }] })]
    const values = calculateCombatState(state)
    expect(values.find((entry) => entry.target.id === 'profile.flySpeed')?.finalValue).toBe(40)
    expect(values.find((entry) => entry.target.id === 'profile.swimSpeed')?.finalValue).toBe(40)
    expect(values.find((entry) => entry.target.id === 'profile.climbSpeed')?.finalValue).toBe(20)
    expect(state.profile.flySpeed).toBe('30')
    expect(state.profile.speed).toBe('30')
  })
  it('не экстраполирует модификатор выше подтверждённой таблицы при изменении характеристики', () => {
    const state = createInitialCharacter()
    const characteristic = state.characteristics.find((entry) => entry.name === 'Телосложение')!
    state.profile.mainCharacteristic = characteristic.name
    state.profile.proficiency = '+3'
    state.combatEffects = [effect({ modifiers: [{ id: 'score', target: `characteristic.${characteristic.id}.score`, operation: 'SET', value: 40 }, { id: 'dc', target: 'profile.spellSaveDc', operation: 'ADD', value: 2 }] })]
    expect(calculateSpellCombatStats('Телосложение', state)).toEqual([])
    expect(calculateSpellCombatStats('Телосложение', state, false, { attack: '+2', saveDc: '-1' })).toEqual([])
    expect(characteristic.score).toBe('30')
  })

  it('пересчитывает автоматическую проверку от изменённой характеристики, сохраняя ручной спасбросок', () => {
    const state = createInitialCharacter()
    const characteristic = state.characteristics.find((entry) => entry.name === 'Телосложение')!
    characteristic.check = ''
    characteristic.save = '+13'
    state.combatEffects = [effect({ modifiers: [{ id: 'score', target: `characteristic.${characteristic.id}.score`, operation: 'SET', value: 40 }] })]
    const calculations = calculateCombatState(state)
    expect(calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.check`)?.finalValue).toBe(10)
    expect(calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.save`)?.finalValue).toBe(13)
    expect(characteristic.score).toBe('30')
  })
  it('автоматически применяет владение к спасброску главной характеристики с 4-го уровня', () => {
    const state = createInitialCharacter()
    state.level = 4
    state.profile.proficiency = ''
    state.profile.mainCharacteristic = 'Ловкость'
    const dexterity = state.characteristics.find((entry) => entry.name === 'Ловкость')!
    dexterity.score = '16'
    dexterity.check = ''
    dexterity.save = ''

    const save = calculateCombatState(state).find((entry) => entry.target.id === `characteristic.${dexterity.id}.save`)
    expect(save?.finalValue).toBe(5)
    expect(dexterity.save).toBe('')
  })
  it('применяет групповые цели ко всем шести характеристикам и не меняет базовые поля', () => {
    const state = createInitialCharacter()
    state.characteristics.forEach((characteristic) => { characteristic.check = '0'; characteristic.save = '0' })
    const originals = state.characteristics.map(({ score, check, save }) => ({ score, check, save }))
    state.combatEffects = [effect({ modifiers: [
      { id: 'all-scores', target: 'characteristic.all.score', operation: 'ADD', value: 1 },
      { id: 'all-checks', target: 'characteristic.all.check', operation: 'ADD', value: 2 },
      { id: 'all-saves', target: 'characteristic.all.save', operation: 'ADD', value: 3 },
    ] })]

    const calculations = calculateCombatState(state)
    for (const characteristic of state.characteristics) {
      expect(calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.score`)?.finalValue).toBe(Number(characteristic.score) + 1)
      const check = calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.check`)
      const save = calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.save`)
      expect(check?.finalValue).toBe(check!.baseValue + 2)
      expect(save?.finalValue).toBe(save!.baseValue + 3)
    }
    expect(state.characteristics.map(({ score, check, save }) => ({ score, check, save }))).toEqual(originals)
  })
  it('читает типографские знаки и отображает явный знак положительных бонусов', () => {
    expect(parseCombatNumber('−4')).toBe(-4)
    expect(parseCombatNumber('+13')).toBe(13)
    expect(formatSignedCombatNumber(-4)).toBe('-4')
    expect(formatSignedCombatNumber(0)).toBe('0')
    expect(formatSignedCombatNumber(13)).toBe('+13')
  })

  it('берёт базу бросков атаки из бонуса владения', () => {
    const state = createInitialCharacter()
    state.profile.proficiency = '+4'
    state.profile.attackBonus = '+3'
    state.profile.spellAttackBonus = '+3'

    const bases = buildCombatTargets(state)
      .filter((target) => target.id === 'profile.attackBonus' || target.id === 'profile.spellAttackBonus')
      .map((target) => target.baseValue)

    expect(bases).toEqual([4, 4])
  })

  it('использует бонус владения по уровню для обычного заклинания, но не меняет расчёт руны', () => {
    const state = createInitialCharacter()
    state.level = 4
    state.profile.proficiency = ''
    state.profile.mainCharacteristic = 'Интеллект'
    state.characteristics.find((entry) => entry.name === 'Интеллект')!.score = '18'

    expect(calculateSpellCombatStats('Интеллект', state)[0]).toMatchObject({ attack: 6, saveDc: 14, proficient: true })
    expect(calculateSpellCombatStats('Интеллект', state, true)[0]).toMatchObject({ attack: 4, saveDc: 12, proficient: true })
  })

  it('добавляет +4 к КД 17, не изменяя базовое значение', () => {
    const result = calculateCombatTarget(armorClass, [effect()])
    expect(result.finalValue).toBe(21)
    expect(result.baseValue).toBe(17)
    expect(armorClass.baseValue).toBe(17)
  })

  it('после удаления эффекта возвращает базовый КД', () => {
    expect(calculateCombatTarget(armorClass, []).finalValue).toBe(17)
  })

  it('рассчитывает скорость как (30 + 10) / 2', () => {
    const haste = effect({ id: 'haste', name: 'Ускорение', modifiers: [{ id: 'add-speed', target: speed.id, operation: 'ADD', value: 10 }] })
    const bonds = effect({ id: 'bonds', name: 'Путы', category: 'negative', createdAt: '2026-07-22T11:00:00.000Z', modifiers: [{ id: 'divide-speed', target: speed.id, operation: 'DIVIDE', value: 2 }] })
    expect(calculateCombatTarget(speed, [haste, bonds]).finalValue).toBe(20)
  })

  it('применяет все категории в заданном порядке операций', () => {
    const target: CombatTarget = { id: 'profile.test', label: 'Тест', group: 'combat', baseValue: 100 }
    const positive = effect({
      id: 'positive',
      name: 'Положительный комплекс',
      category: 'positive',
      modifiers: [
        { id: 'p-set', target: target.id, operation: 'SET', value: 120 },
        { id: 'p-add', target: target.id, operation: 'ADD', value: 20 },
        { id: 'p-subtract', target: target.id, operation: 'SUBTRACT', value: 10 },
        { id: 'p-divide', target: target.id, operation: 'DIVIDE', value: 2 },
        { id: 'p-multiply', target: target.id, operation: 'MULTIPLY', value: 3 },
      ],
    })
    const negative = effect({
      id: 'negative',
      name: 'Отрицательный комплекс',
      category: 'negative',
      createdAt: '2026-07-22T11:00:00.000Z',
      modifiers: [
        { id: 'n-set', target: target.id, operation: 'SET', value: 200 },
        { id: 'n-add', target: target.id, operation: 'ADD', value: 5 },
        { id: 'n-subtract', target: target.id, operation: 'SUBTRACT', value: 15 },
        { id: 'n-multiply', target: target.id, operation: 'MULTIPLY', value: 2 },
        { id: 'n-divide', target: target.id, operation: 'DIVIDE', value: 5 },
      ],
    })
    const special = effect({
      id: 'special',
      name: 'Особый комплекс',
      category: 'special',
      createdAt: '2026-07-22T12:00:00.000Z',
      modifiers: [
        { id: 's-set', target: target.id, operation: 'SET', value: 80 },
        { id: 's-add', target: target.id, operation: 'ADD', value: 4 },
        { id: 's-subtract', target: target.id, operation: 'SUBTRACT', value: 4 },
        { id: 's-divide', target: target.id, operation: 'DIVIDE', value: 2 },
        { id: 's-multiply', target: target.id, operation: 'MULTIPLY', value: 3 },
      ],
    })
    const result = calculateCombatTarget(target, [special, negative, positive])
    expect(result.finalValue).toBe(120)
    expect(result.steps.map((step) => step.operation)).toEqual(['SET', 'ADD', 'SUBTRACT', 'DIVIDE', 'MULTIPLY', 'SET', 'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'SET', 'ADD', 'SUBTRACT', 'DIVIDE', 'MULTIPLY'])
    expect(result.steps.map((step) => step.effectName)).toEqual([
      ...Array(5).fill('Положительный комплекс'),
      ...Array(5).fill('Отрицательный комплекс'),
      ...Array(5).fill('Особый комплекс'),
    ])
  })

  it('не применяет выключенный эффект', () => {
    expect(calculateCombatTarget(armorClass, [effect({ active: false })]).finalValue).toBe(17)
  })

  it('запрещает деление на ноль', () => {
    expect(combatModifierSchema.safeParse({ id: 'bad', target: speed.id, operation: 'DIVIDE', value: 0 }).success).toBe(false)
  })

  it('детерминированно применяет последний SET и сообщает о конфликте', () => {
    const first = effect({ id: 'first', createdAt: '2026-07-22T10:00:00.000Z', modifiers: [{ id: 'set-1', target: armorClass.id, operation: 'SET', value: 18 }] })
    const last = effect({ id: 'last', createdAt: '2026-07-22T11:00:00.000Z', modifiers: [{ id: 'set-2', target: armorClass.id, operation: 'SET', value: 25 }] })
    const result = calculateCombatTarget(armorClass, [last, first])
    expect(result.finalValue).toBe(25)
    expect(result.setConflict).toBe(true)
  })

  it('сохраняет текстовый эффект без числовых изменений', () => {
    const [migrated] = migrateCombatEffects([effect({ id: 'acid', name: 'Разъедание кислотой', category: 'negative', duration: { type: 'rounds', roundsRemaining: 3 }, modifiers: [] })])
    expect(migrated).toMatchObject({ id: 'acid', name: 'Разъедание кислотой', category: 'negative', duration: { type: 'rounds', roundsRemaining: 3 }, modifiers: [] })
  })
})
