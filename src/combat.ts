import { z } from 'zod'
import type { CharacterState } from './domain'

export const combatCategories = ['positive', 'negative', 'special'] as const
export const combatOperations = ['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'SET'] as const
export const combatDurationTypes = ['manual', 'rounds', 'untilEndOfCombat', 'concentration'] as const

export type CombatCategory = typeof combatCategories[number]
export type CombatOperation = typeof combatOperations[number]
export type CombatDurationType = typeof combatDurationTypes[number]
export type CombatModifier = { id: string; target: string; operation: CombatOperation; value: number }
export type CombatDuration = { type: CombatDurationType; roundsRemaining?: number }
export type CombatEffect = {
  id: string
  name: string
  category: CombatCategory
  source: string
  sourceId?: string
  description: string
  active: boolean
  concentration: boolean
  createdAt: string
  duration: CombatDuration
  modifiers: CombatModifier[]
}

export type CombatTarget = {
  id: string
  label: string
  group: 'combat' | 'ability'
  baseValue: number
  unit?: string
  nonNegative?: boolean
}

export type CombatBreakdownStep = {
  effectId: string
  effectName: string
  operation: CombatOperation
  value: number
  before: number
  after: number
  applied: boolean
}

export type CombatCalculation = {
  target: CombatTarget
  baseValue: number
  equipmentValue: number
  effectDelta: number
  finalValue: number
  steps: CombatBreakdownStep[]
  setConflict: boolean
}

const durationSchema = z.object({
  type: z.enum(combatDurationTypes),
  roundsRemaining: z.number().int().min(0).optional(),
}).superRefine((duration, context) => {
  if (duration.type === 'rounds' && duration.roundsRemaining === undefined) {
    context.addIssue({ code: 'custom', message: 'Для длительности в раундах нужно указать число раундов' })
  }
})

export const combatModifierSchema = z.object({
  id: z.string().min(1),
  target: z.string().min(1),
  operation: z.enum(combatOperations),
  value: z.number().finite(),
}).superRefine((modifier, context) => {
  if (modifier.operation === 'DIVIDE' && modifier.value === 0) {
    context.addIssue({ code: 'custom', message: 'Деление на ноль запрещено' })
  }
})

export const combatEffectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  category: z.enum(combatCategories),
  source: z.string(),
  sourceId: z.string().optional(),
  description: z.string(),
  active: z.boolean(),
  concentration: z.boolean(),
  createdAt: z.string(),
  duration: durationSchema,
  modifiers: z.array(combatModifierSchema),
})

const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function migrateCombatEffects(value: unknown): CombatEffect[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((raw): CombatEffect[] => {
    if (!isRecord(raw)) return []
    const rawDuration = isRecord(raw.duration) ? raw.duration : { type: raw.concentration === true ? 'concentration' : 'manual' }
    const candidate = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
      name: typeof raw.name === 'string' ? raw.name : '',
      category: combatCategories.includes(raw.category as CombatCategory) ? raw.category : 'special',
      source: typeof raw.source === 'string' ? raw.source : '',
      ...(typeof raw.sourceId === 'string' && raw.sourceId ? { sourceId: raw.sourceId } : {}),
      description: typeof raw.description === 'string' ? raw.description : '',
      active: raw.active !== false,
      concentration: raw.concentration === true || rawDuration.type === 'concentration',
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now(),
      duration: {
        type: combatDurationTypes.includes(rawDuration.type as CombatDurationType) ? rawDuration.type : 'manual',
        ...(typeof rawDuration.roundsRemaining === 'number' ? { roundsRemaining: Math.max(0, Math.trunc(rawDuration.roundsRemaining)) } : {}),
      },
      modifiers: Array.isArray(raw.modifiers) ? raw.modifiers.flatMap((modifier) => {
        if (!isRecord(modifier)) return []
        const parsed = combatModifierSchema.safeParse({
          id: typeof modifier.id === 'string' && modifier.id ? modifier.id : newId(),
          target: typeof modifier.target === 'string' ? modifier.target : '',
          operation: modifier.operation,
          value: modifier.value,
        })
        return parsed.success ? [parsed.data] : []
      }) : [],
    }
    const parsed = combatEffectSchema.safeParse(candidate)
    if (!parsed.success || seen.has(parsed.data.id)) return []
    seen.add(parsed.data.id)
    return [parsed.data]
  })
}

export function parseCombatNumber(value: string | undefined): number | null {
  if (!value) return null
  const normalized = value.trim().replace(/[−–—﹣]/g, '-').replace(/[＋﹢]/g, '+').replace(',', '.')
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const profileTargets: Array<{ key: string; label: string; unit?: string; nonNegative?: boolean }> = [
  { key: 'armorClass', label: 'Класс доспеха' },
  { key: 'speed', label: 'Скорость', unit: ' фут.', nonNegative: true },
  { key: 'attackBonus', label: 'Бросок атаки' },
  { key: 'damageBonus', label: 'Бонус урона' },
  { key: 'meleeRange', label: 'Дальность ближней атаки', unit: ' фут.', nonNegative: true },
  { key: 'rangedRange', label: 'Дальность дальней атаки', unit: ' фут.', nonNegative: true },
  { key: 'spellAttackBonus', label: 'Бонус атаки заклинанием' },
  { key: 'spellSaveDc', label: 'Сложность спасброска заклинаний' },
]

export function buildCombatTargets(state: Pick<CharacterState, 'profile' | 'characteristics'>): CombatTarget[] {
  const targets: CombatTarget[] = []
  for (const definition of profileTargets) {
    const baseValue = parseCombatNumber(state.profile[definition.key])
    if (baseValue !== null) targets.push({ id: `profile.${definition.key}`, label: definition.label, group: 'combat', baseValue, unit: definition.unit, nonNegative: definition.nonNegative })
  }
  for (const characteristic of state.characteristics) {
    const fields: Array<['score' | 'check' | 'save', string]> = [['score', 'Значение'], ['check', 'Проверка'], ['save', 'Спасбросок']]
    for (const [field, label] of fields) {
      const baseValue = parseCombatNumber(characteristic[field])
      if (baseValue !== null) targets.push({ id: `characteristic.${characteristic.id}.${field}`, label: `${characteristic.name}: ${label}`, group: 'ability', baseValue })
    }
  }
  return targets
}

const effectOrder = (left: CombatEffect, right: CombatEffect) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
const categoryOrder: CombatCategory[] = ['positive', 'negative', 'special']
const operationOrderByCategory: Record<CombatCategory, CombatOperation[]> = {
  positive: ['SET', 'ADD', 'SUBTRACT', 'DIVIDE', 'MULTIPLY'],
  negative: ['SET', 'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'],
  special: ['SET', 'ADD', 'SUBTRACT', 'DIVIDE', 'MULTIPLY'],
}

export function calculateCombatTarget(target: CombatTarget, effects: CombatEffect[], equipmentValue = 0): CombatCalculation {
  const safeEquipment = Number.isFinite(equipmentValue) ? equipmentValue : 0
  const active = [...effects].filter((effect) => effect.active).sort(effectOrder)
  const modifiers = active.flatMap((effect) => effect.modifiers.map((modifier, modifierIndex) => ({ effect, modifier, modifierIndex })))
    .filter(({ modifier }) => modifier.target === target.id && Number.isFinite(modifier.value) && !(modifier.operation === 'DIVIDE' && modifier.value === 0))
  let current = target.baseValue + safeEquipment
  const steps: CombatBreakdownStep[] = []

  for (const category of categoryOrder) {
    for (const operation of operationOrderByCategory[category]) {
      for (const { effect, modifier } of modifiers.filter((entry) => entry.effect.category === category && entry.modifier.operation === operation)) {
        const before = current
        current = operation === 'SET' ? modifier.value
          : operation === 'ADD' ? current + modifier.value
          : operation === 'SUBTRACT' ? current - modifier.value
            : operation === 'MULTIPLY' ? current * modifier.value
              : current / modifier.value
        steps.push({ effectId: effect.id, effectName: effect.name, operation, value: modifier.value, before, after: current, applied: true })
      }
    }
  }

  const setters = modifiers.filter(({ modifier }) => modifier.operation === 'SET')

  if (target.nonNegative) current = Math.max(0, current)
  return {
    target,
    baseValue: target.baseValue,
    equipmentValue: safeEquipment,
    effectDelta: current - target.baseValue - safeEquipment,
    finalValue: current,
    steps,
    setConflict: setters.length > 1,
  }
}

export function calculateCombatState(state: Pick<CharacterState, 'profile' | 'characteristics' | 'combatEffects'>): CombatCalculation[] {
  return buildCombatTargets(state as Pick<CharacterState, 'profile' | 'characteristics'>)
    .map((target) => calculateCombatTarget(target, state.combatEffects))
}

export function formatCombatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString()
}

export function formatSignedCombatNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${formatCombatNumber(value)}`
}

export const combatCategoryLabels: Record<CombatCategory, string> = {
  positive: 'Положительный',
  negative: 'Отрицательный',
  special: 'Особый',
}

export const combatOperationLabels: Record<CombatOperation, string> = {
  ADD: 'Прибавить (+)',
  SUBTRACT: 'Отнять (−)',
  MULTIPLY: 'Умножить (×)',
  DIVIDE: 'Разделить (÷)',
  SET: 'Установить (=)',
}

export const combatOperationSymbols: Record<CombatOperation, string> = { ADD: '+', SUBTRACT: '−', MULTIPLY: '×', DIVIDE: '÷', SET: '=' }

export const combatDurationLabels: Record<CombatDurationType, string> = {
  manual: 'Пока не снят вручную',
  rounds: 'Раунды',
  untilEndOfCombat: 'До конца боя',
  concentration: 'Концентрация',
}

export function describeCombatDuration(duration: CombatDuration): string {
  return duration.type === 'rounds'
    ? `${duration.roundsRemaining ?? 0} раунд(а)`
    : combatDurationLabels[duration.type]
}
