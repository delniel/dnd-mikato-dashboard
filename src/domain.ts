import { z } from 'zod'
import { createInitialCharacter } from './data'
import { combatEffectSchema, migrateCombatEffects, type CombatEffect } from './combat'

export const SCHEMA_VERSION = 5
export const experienceThresholds = [20, 45, 75, 110, 150, 195, 245, 300, 360, 425, 495, 570, 650, 735, 825, 920, 1020, 1125, 1235, 1350, 1470, 1595, 1725, 1860, 2000]

export type ResourceKey = 'hp' | 'mana' | 'superiority'
export type Resource = { current: number; max: number; temporary?: number; dieType?: string }
export type ThemeMode = 'dark' | 'light'
export type AccentColor = 'red' | 'blue' | 'cyan' | 'green' | 'purple' | 'pink' | 'yellow'
export type NamedEntry = { id: string; name: string; imageId?: string }
export type CharacterSkill = { id: string; name: string; bonus: string }
export type Characteristic = { id: string; name: string; score: string; check: string; save: string; skills: CharacterSkill[] }
export type Spell = { id: string; name: string; imageId?: string; elements: string[]; characteristic: string; components: string; castingTime: string; target?: string; range: string; duration: string; manaCost: number | null; damageOrHealing: string; damage?: string; healing?: string; difficulty: string; level: string; summary: string; description: string; effects: string; restrictions: string; tags: string[]; requiresConcentration: boolean; actionType: string }
export type Skill = { id: string; name: string; imageId?: string; difficulty: string; actionType: string; summary: string; mechanics: string; condition: string; requirement: string; status: 'active' | 'passive' | 'reaction'; tags: string[] }
export type Item = { id: string; name: string; imageId?: string; category: string; quantity: string; damage: string; damageType: string; range: string; properties: string; cost: string; description: string; equipped: boolean; note: string }
export type CurrencyKey = 'PP' | 'GP' | 'SP' | 'CP'
export type DiceRoll = { id: string; dice: Record<string, number>; results: Record<string, number[]>; total: number; createdAt: string }
export type Note = { id: string; title: string; body: string; tags: string[]; imageId?: string; createdAt: string; updatedAt: string }

export type CharacterState = {
  schemaVersion: number
  profile: Record<string, string>
  resources: Record<ResourceKey, Resource>
  experience: number
  level: number
  inspiration: boolean
  senses: Record<string, string>
  favorites: string[]
  notes: Note[]
  combatEffects: CombatEffect[]
  settings: { levelUpBehavior: 'carry' | 'reset'; allowNegativeMana: boolean; themeMode: ThemeMode; accentColor: AccentColor }
  recentAction?: { key: ResourceKey; previous: number; label: string }
  characteristics: Characteristic[]
  languages: NamedEntry[]
  proficiencies: NamedEntry[]
  elements: NamedEntry[]
  spells: Spell[]
  skills: Skill[]
  inventory: Item[]
  currencies: Record<CurrencyKey, number>
  diceHistory: DiceRoll[]
  extras: Record<string, unknown>
}

const resourceSchema = z.object({ current: z.number(), max: z.number(), temporary: z.number().optional() })
const superiorityResourceSchema = resourceSchema.extend({ dieType: z.string() })
const entrySchema = z.object({ id: z.string(), name: z.string(), imageId: z.string().optional() })
const skillBonusSchema = z.object({ id: z.string(), name: z.string(), bonus: z.string() })
const characteristicSchema = z.object({ id: z.string(), name: z.string(), score: z.string(), check: z.string(), save: z.string(), skills: z.array(skillBonusSchema) })
const spellSchema = z.object({ id: z.string(), name: z.string(), imageId: z.string().optional(), elements: z.array(z.string()), characteristic: z.string(), components: z.string(), castingTime: z.string(), target: z.string().optional(), range: z.string(), duration: z.string(), manaCost: z.number().nullable(), damageOrHealing: z.string(), damage: z.string().optional(), healing: z.string().optional(), difficulty: z.string(), level: z.string(), summary: z.string(), description: z.string(), effects: z.string(), restrictions: z.string(), tags: z.array(z.string()), requiresConcentration: z.boolean(), actionType: z.string() })
const skillSchema = z.object({ id: z.string(), name: z.string(), imageId: z.string().optional(), difficulty: z.string(), actionType: z.string(), summary: z.string(), mechanics: z.string(), condition: z.string(), requirement: z.string(), status: z.enum(['active', 'passive', 'reaction']), tags: z.array(z.string()) })
const itemSchema = z.object({ id: z.string(), name: z.string(), imageId: z.string().optional(), category: z.string(), quantity: z.string(), damage: z.string(), damageType: z.string(), range: z.string(), properties: z.string(), cost: z.string(), description: z.string(), equipped: z.boolean(), note: z.string() })
const noteSchema = z.object({ id: z.string(), title: z.string(), body: z.string(), tags: z.array(z.string()), imageId: z.string().optional(), createdAt: z.string(), updatedAt: z.string() })

export const characterSchema = z.object({
  schemaVersion: z.number(),
  profile: z.record(z.string(), z.string()),
  resources: z.object({ hp: resourceSchema, mana: resourceSchema, superiority: superiorityResourceSchema }),
  experience: z.number(),
  level: z.number(),
  inspiration: z.boolean(),
  senses: z.record(z.string(), z.string()),
  favorites: z.array(z.string()),
  notes: z.array(noteSchema),
  combatEffects: z.array(combatEffectSchema),
  settings: z.object({ levelUpBehavior: z.enum(['carry', 'reset']), allowNegativeMana: z.boolean(), themeMode: z.enum(['dark', 'light']), accentColor: z.enum(['red', 'blue', 'cyan', 'green', 'purple', 'pink', 'yellow']) }),
  recentAction: z.object({ key: z.enum(['hp', 'mana', 'superiority']), previous: z.number(), label: z.string() }).optional(),
  characteristics: z.array(characteristicSchema),
  languages: z.array(entrySchema),
  proficiencies: z.array(entrySchema),
  elements: z.array(entrySchema),
  spells: z.array(spellSchema),
  skills: z.array(skillSchema),
  inventory: z.array(itemSchema),
  currencies: z.object({ PP: z.number(), GP: z.number(), SP: z.number(), CP: z.number() }),
  diceHistory: z.array(z.object({ id: z.string(), dice: z.record(z.string(), z.number()), results: z.record(z.string(), z.array(z.number())), total: z.number(), createdAt: z.string() })),
  extras: z.record(z.string(), z.unknown()),
})

export function thresholdForLevel(level: number): number | undefined {
  return level >= 0 && level < 25 ? experienceThresholds[level] : undefined
}

export function levelUp(state: CharacterState): CharacterState {
  const threshold = thresholdForLevel(state.level)
  if (threshold === undefined || state.experience < threshold || state.level >= 25) return state
  return {
    ...state,
    level: state.level + 1,
    experience: state.settings.levelUpBehavior === 'carry' ? Math.max(0, state.experience - threshold) : 0,
  }
}

export function setLevel(state: CharacterState, level: number): CharacterState {
  const next = Number.isFinite(level) ? Math.trunc(level) : state.level
  return { ...state, level: Math.min(25, Math.max(0, next)) }
}

export function setTemporaryHp(state: CharacterState, temporary: number): CharacterState {
  return { ...state, resources: { ...state.resources, hp: { ...state.resources.hp, temporary: Math.max(0, Number.isFinite(temporary) ? temporary : 0) } } }
}

export function changeResource(state: CharacterState, key: ResourceKey, next: number, label = 'Изменение ресурса'): CharacterState {
  const resource = state.resources[key]
  const minimum = key === 'mana' && state.settings.allowNegativeMana ? Number.NEGATIVE_INFINITY : 0
  const current = Math.min(resource.max, Math.max(minimum, Number.isFinite(next) ? next : resource.current))
  return {
    ...state,
    resources: { ...state.resources, [key]: { ...resource, current } },
    recentAction: { key, previous: resource.current, label },
  }
}

export function setResourceMaximum(state: CharacterState, key: ResourceKey, max: number): CharacterState {
  const nextMax = Math.max(0, Number.isFinite(max) ? max : state.resources[key].max)
  return {
    ...state,
    resources: {
      ...state.resources,
      [key]: { ...state.resources[key], max: nextMax, current: Math.min(state.resources[key].current, nextMax) },
    },
  }
}

export function setSuperiorityDie(state: CharacterState, dieType: string): CharacterState {
  return { ...state, resources: { ...state.resources, superiority: { ...state.resources.superiority, dieType } } }
}

const currencyOrder: CurrencyKey[] = ['PP', 'GP', 'SP', 'CP']

export function convertCurrency(state: CharacterState, from: CurrencyKey, to: CurrencyKey): CharacterState {
  const fromIndex = currencyOrder.indexOf(from)
  const toIndex = currencyOrder.indexOf(to)
  if (Math.abs(fromIndex - toIndex) !== 1) return state

  const exchangeDown = toIndex > fromIndex
  const cost = exchangeDown ? 1 : 10
  const gain = exchangeDown ? 10 : 1
  if (state.currencies[from] < cost) return state

  return {
    ...state,
    currencies: {
      ...state.currencies,
      [from]: state.currencies[from] - cost,
      [to]: state.currencies[to] + gain,
    },
  }
}

export function manaRecoveryAmount(value: string): number {
  const match = value.match(/[+-]?\d+/)
  return match ? Math.max(0, Number.parseInt(match[0], 10)) : 0
}

export function restoreMana(state: CharacterState): CharacterState {
  const amount = manaRecoveryAmount(state.profile.manaRecovery ?? '')
  if (amount <= 0 || state.resources.mana.current >= state.resources.mana.max) return state
  return changeResource(state, 'mana', state.resources.mana.current + amount, `Восстановление: +${amount} маны`)
}

export function deductMana(state: CharacterState, cost: number): CharacterState | null {
  if (!state.settings.allowNegativeMana && state.resources.mana.current < cost) return null
  return changeResource(state, 'mana', state.resources.mana.current - cost, `Заклинание: −${cost} маны`)
}

export function undoResource(state: CharacterState): CharacterState {
  if (!state.recentAction) return state
  return {
    ...state,
    resources: {
      ...state.resources,
      [state.recentAction.key]: { ...state.resources[state.recentAction.key], current: state.recentAction.previous },
    },
    recentAction: undefined,
  }
}

export function rollDice(selection: Record<string, number>, random = Math.random): DiceRoll {
  const results: Record<string, number[]> = {}
  let total = 0

  for (const [die, count] of Object.entries(selection)) {
    const faces = Number(die.trim().replace(/^d/i, ''))
    if (!Number.isFinite(faces) || faces < 2) {
      results[die] = []
      continue
    }

    results[die] = Array.from({ length: Math.max(0, Math.trunc(count)) }, () => {
      const value = Math.floor(random() * faces) + 1
      total += value
      return value
    })
  }

  return { id: crypto.randomUUID(), dice: selection, results, total, createdAt: new Date().toISOString() }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const asString = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const stringRecord = (value: unknown): Record<string, string> => isRecord(value)
  ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  : {}
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

const textEntries = (value: unknown, fallback: NamedEntry[]): NamedEntry[] => {
  if (Array.isArray(value)) {
    const entries = value.filter(isRecord).map((entry) => ({
      id: asString(entry.id, newId()),
      name: asString(entry.name),
      ...(typeof entry.imageId === 'string' ? { imageId: entry.imageId } : {}),
    })).filter((entry) => entry.name.trim())
    return entries
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((name) => ({ id: newId(), name: name.trim() })).filter((entry) => entry.name)
  }

  return fallback
}

const migrateNotes = (value: unknown): Note[] => {
  if (typeof value === 'string') {
    const body = value.trim()
    return body ? [{ id: 'legacy-note', title: 'Старая заметка', body, tags: [], createdAt: now(), updatedAt: now() }] : []
  }

  if (!Array.isArray(value)) return []

  return value.filter(isRecord).map((entry, index) => {
    const createdAt = asString(entry.createdAt, now())
    return {
      id: asString(entry.id, newId()),
      title: asString(entry.title, `Заметка ${index + 1}`),
      body: asString(entry.body, asString(entry.content, asString(entry.text))),
      tags: stringArray(entry.tags),
      ...(typeof entry.imageId === 'string' ? { imageId: entry.imageId } : {}),
      createdAt,
      updatedAt: asString(entry.updatedAt, createdAt),
    }
  })
}

const migrateCharacteristics = (value: unknown, fallback: Characteristic[]): Characteristic[] => {
  if (!Array.isArray(value)) return fallback

  return value.filter(isRecord).map((rawCharacteristic) => {
    const id = asString(rawCharacteristic.id, newId())
    const defaultCharacteristic = fallback.find((entry) => entry.id === id || entry.name === asString(rawCharacteristic.name))
    const rawSkills = Array.isArray(rawCharacteristic.skills) ? rawCharacteristic.skills.filter(isRecord) : []
    const skills = rawSkills.map((rawSkill) => {
      const rawName = asString(rawSkill.name)
      const rawBonus = asString(rawSkill.bonus)
      const defaultSkill = defaultCharacteristic?.skills.find((entry) => {
        if (entry.id === asString(rawSkill.id)) return true
        return entry.name === rawName || entry.name.startsWith(`${rawName} `)
      })
      const hasBrokenContinuation = defaultSkill && defaultSkill.name !== rawName && defaultSkill.name.startsWith(`${rawName} `) && rawBonus === defaultSkill.name.slice(rawName.length + 1).split(' ')[0]
      return {
        id: asString(rawSkill.id, newId()),
        name: hasBrokenContinuation ? defaultSkill.name : rawName,
        bonus: hasBrokenContinuation ? defaultSkill.bonus : rawBonus,
      }
    })
    return {
      id,
      name: asString(rawCharacteristic.name, defaultCharacteristic?.name ?? ''),
      score: asString(rawCharacteristic.score),
      check: asString(rawCharacteristic.check),
      save: asString(rawCharacteristic.save),
      skills,
    }
  })
}

export function migrateCharacter(input: unknown): CharacterState {
  const defaults = createInitialCharacter()
  if (!isRecord(input)) return defaults

  const oldProfile = isRecord(input.profile) ? input.profile : {}
  const profile = { ...defaults.profile, ...stringRecord(oldProfile) }
  if (typeof oldProfile.masteryMagic !== 'string') profile.masteryMagic = asString(oldProfile.powerType, defaults.profile.masteryMagic || '')
  if (!profile.profession) profile.profession = ''
  const hasExplicitClassBackground = Object.prototype.hasOwnProperty.call(oldProfile, 'classBackground') && typeof oldProfile.classBackground === 'string'
  const explicitClassBackground = typeof oldProfile.classBackground === 'string' ? oldProfile.classBackground.trim() : ''
  const legacyClassBackground = [...new Set([oldProfile.className, oldProfile.background].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()))].join(' · ')
  profile.classBackground = hasExplicitClassBackground ? explicitClassBackground : legacyClassBackground || (typeof oldProfile.profession === 'string' ? oldProfile.profession.trim() : '') || defaults.profile.classBackground || ''

  const sourceResources = isRecord(input.resources) ? input.resources : {}
  const resource = (key: ResourceKey): Resource => {
    const raw = sourceResources[key]
    const fallback = defaults.resources[key]
    if (!isRecord(raw)) return { ...fallback }
    const rawMax = typeof raw.max === 'number' ? Math.max(0, raw.max) : fallback.max
    const rawCurrent = typeof raw.current === 'number' ? raw.current : fallback.current
    const migratedTemporary = key === 'hp'
      ? (typeof raw.temporary === 'number' ? Math.max(0, raw.temporary) : Math.max(0, rawCurrent - rawMax))
      : undefined
    const common = {
      current: key === 'hp' ? Math.min(rawMax, Math.max(0, rawCurrent)) : rawCurrent,
      max: rawMax,
      ...(key === 'hp' ? { temporary: migratedTemporary ?? (fallback.temporary ?? 0) } : {}),
    }
    return key === 'superiority'
      ? { ...common, dieType: asString(raw.dieType, profile.superiorityDie || fallback.dieType || '') }
      : common
  }

  const known = new Set(['schemaVersion', 'profile', 'resources', 'experience', 'level', 'inspiration', 'senses', 'favorites', 'notes', 'combatEffects', 'settings', 'recentAction', 'characteristics', 'languages', 'proficiencies', 'elements', 'spells', 'skills', 'inventory', 'currencies', 'diceHistory', 'extras'])
  const legacyElectrum = isRecord(input.currencies) && typeof input.currencies.EP === 'number' ? input.currencies.EP : undefined
  const extras = {
    ...defaults.extras,
    ...(isRecord(input.extras) ? input.extras : {}),
    ...Object.fromEntries(Object.entries(input).filter(([key]) => !known.has(key))),
    ...(legacyElectrum ? { retiredCurrencies: { EP: legacyElectrum } } : {}),
  }

  const candidate: CharacterState = {
    ...defaults,
    schemaVersion: SCHEMA_VERSION,
    profile,
    resources: { hp: resource('hp'), mana: resource('mana'), superiority: resource('superiority') },
    experience: typeof input.experience === 'number' ? input.experience : defaults.experience,
    level: Math.min(25, Math.max(0, typeof input.level === 'number' ? Math.trunc(input.level) : defaults.level)),
    inspiration: input.inspiration === true,
    senses: { ...defaults.senses, ...stringRecord(input.senses) },
    favorites: stringArray(input.favorites),
    notes: migrateNotes(input.notes),
    combatEffects: migrateCombatEffects(input.combatEffects),
    settings: isRecord(input.settings)
      ? {
          levelUpBehavior: input.settings.levelUpBehavior === 'reset' ? 'reset' : 'carry',
          allowNegativeMana: input.settings.allowNegativeMana === true,
          themeMode: input.settings.themeMode === 'light' ? 'light' : 'dark',
          accentColor: ['red', 'blue', 'cyan', 'green', 'purple', 'pink', 'yellow'].includes(asString(input.settings.accentColor)) ? asString(input.settings.accentColor) as AccentColor : 'red',
        }
      : defaults.settings,
    characteristics: migrateCharacteristics(input.characteristics, defaults.characteristics),
    languages: textEntries(input.languages, defaults.languages),
    proficiencies: textEntries(input.proficiencies, defaults.proficiencies),
    elements: textEntries(input.elements ?? oldProfile.elements, defaults.elements),
    spells: Array.isArray(input.spells) ? input.spells as Spell[] : defaults.spells,
    skills: Array.isArray(input.skills) ? input.skills.filter((skill) => !isRecord(skill) || skill.status !== 'desired') as Skill[] : defaults.skills,
    inventory: Array.isArray(input.inventory) ? input.inventory as Item[] : defaults.inventory,
    currencies: isRecord(input.currencies)
      ? { PP: Number(input.currencies.PP) || 0, GP: Number(input.currencies.GP) || 0, SP: Number(input.currencies.SP) || 0, CP: Number(input.currencies.CP) || 0 }
      : defaults.currencies,
    diceHistory: Array.isArray(input.diceHistory) ? input.diceHistory.slice(0, 10) as DiceRoll[] : defaults.diceHistory,
    extras,
  }

  return characterSchema.parse(candidate)
}

// Dice history is intentionally local-session data in exported backups; migrations and IndexedDB retain it.
export function serializeCharacter(state: CharacterState): string {
  return JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION, diceHistory: [] }, null, 2)
}

export function restoreCharacter(raw: string): CharacterState {
  return migrateCharacter(JSON.parse(raw))
}
