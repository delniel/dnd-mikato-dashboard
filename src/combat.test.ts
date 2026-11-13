import { describe, expect, it } from 'vitest'
import { buildCombatTargets, calculateCombatState, calculateCombatTarget, calculateSpellCombatStats, combatModifierSchema, formatSignedCombatNumber, migrateCombatEffects, parseCombatNumber, type CombatEffect, type CombatTarget } from './combat'
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
  it('учитывает изменение характеристики до 40 и отдельный эффект на сложность заклинания', () => {
    const state = createInitialCharacter()
    const characteristic = state.characteristics.find((entry) => entry.name === 'Телосложение')!
    state.profile.mainCharacteristic = characteristic.name
    state.profile.proficiency = '+3'
    state.combatEffects = [effect({ modifiers: [{ id: 'score', target: `characteristic.${characteristic.id}.score`, operation: 'SET', value: 40 }, { id: 'dc', target: 'profile.spellSaveDc', operation: 'ADD', value: 2 }] })]
    expect(calculateSpellCombatStats('Телосложение', state)).toEqual([{ name: 'Телосложение', proficient: true, attack: 18, saveDc: 28 }])
    expect(calculateSpellCombatStats('Телосложение', state, false, { attack: '+2', saveDc: '-1' })[0]).toMatchObject({ attack: 20, saveDc: 27 })
    expect(characteristic.score).toBe('30')
  })

  it('пересчитывает автоматическую проверку от изменённой характеристики, сохраняя ручной спасбросок', () => {
    const state = createInitialCharacter()
    const characteristic = state.characteristics.find((entry) => entry.name === 'Телосложение')!
    characteristic.check = ''
    characteristic.save = '+13'
    state.combatEffects = [effect({ modifiers: [{ id: 'score', target: `characteristic.${characteristic.id}.score`, operation: 'SET', value: 40 }] })]
    const calculations = calculateCombatState(state)
    expect(calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.check`)?.finalValue).toBe(15)
    expect(calculations.find((entry) => entry.target.id === `characteristic.${characteristic.id}.save`)?.finalValue).toBe(13)
    expect(characteristic.score).toBe('30')
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
