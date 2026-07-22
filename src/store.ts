import { create } from 'zustand'
import { createInitialCharacter } from './data'
import type { CombatEffect } from './combat'
import {
  changeResource,
  convertCurrency,
  deductMana,
  levelUp,
  restoreMana,
  restoreCharacter,
  rollDice,
  setLevel,
  setResourceMaximum,
  setSuperiorityDie,
  setTemporaryHp,
  undoResource,
  type CharacterState,
  type CurrencyKey,
  type Item,
  type NamedEntry,
  type Note,
  type ResourceKey,
  type Skill,
  type SkillProficiencyRank,
  type Spell,
} from './domain'

type Collection = 'languages' | 'proficiencies' | 'elements'
type Store = CharacterState & {
  editing: boolean
  setEditing: (value: boolean) => void
  setCharacter: (value: CharacterState) => void
  setProfile: (key: string, value: string) => void
  setExperience: (value: number) => void
  setLevel: (value: number) => void
  adjustLevel: (delta: number) => void
  setResource: (key: ResourceKey, current: number) => void
  setResourceMax: (key: ResourceKey, max: number) => void
  adjust: (key: ResourceKey, delta: number) => void
  setTemporaryHp: (value: number) => void
  setSuperiorityDie: (dieType: string) => void
  cast: (cost: number) => boolean
  recoverMana: () => boolean
  undo: () => void
  levelUp: () => void
  toggleInspiration: () => void
  toggleFavorite: (id: string) => void
  setSense: (name: string, value: string) => void
  setCharacteristic: (id: string, field: 'score' | 'check' | 'save', value: string) => void
  cycleSkillProficiency: (characteristicId: string, skillId: string) => void
  setSkillDisplayBonus: (characteristicId: string, skillId: string, value: string) => void
  setCurrency: (key: CurrencyKey, value: number) => void
  adjustCurrency: (key: CurrencyKey, delta: number) => void
  convertCurrency: (from: CurrencyKey, to: CurrencyKey) => boolean
  upsertEntry: (collection: Collection, entry: NamedEntry) => void
  deleteEntry: (collection: Collection, id: string) => void
  upsertSpell: (spell: Spell) => void
  deleteSpell: (id: string) => void
  upsertSkill: (skill: Skill) => void
  deleteSkill: (id: string) => void
  upsertItem: (item: Item) => void
  toggleItemEquipped: (id: string) => void
  deleteItem: (id: string) => void
  upsertNote: (note: Note) => void
  deleteNote: (id: string) => void
  upsertCombatEffect: (effect: CombatEffect) => void
  deleteCombatEffect: (id: string) => void
  toggleCombatEffect: (id: string) => void
  setCombatEffectRounds: (id: string, rounds: number) => void
  addRoll: (selection: Record<string, number>) => void
  clearRolls: () => void
  setSetting: <K extends keyof CharacterState['settings']>(key: K, value: CharacterState['settings'][K]) => void
  importData: (raw: string) => void
  reset: () => void
}

const copyInitial = (): CharacterState => createInitialCharacter()
const updateList = <T extends { id: string }>(list: T[], value: T) => list.some((item) => item.id === value.id)
  ? list.map((item) => item.id === value.id ? value : item)
  : [...list, value]

export const useCharacterStore = create<Store>((set, get) => ({
  ...copyInitial(),
  editing: false,

  setEditing: (editing) => set({ editing }),
  setCharacter: (value) => set(value),
  setProfile: (key, value) => set((state) => ({ profile: { ...state.profile, [key]: value } })),
  setExperience: (experience) => set({ experience: Math.max(0, Number.isFinite(experience) ? experience : 0) }),
  setLevel: (level) => set((state) => setLevel(state, level)),
  adjustLevel: (delta) => set((state) => setLevel(state, state.level + delta)),

  setResource: (key, current) => set((state) => changeResource(state, key, current)),
  setResourceMax: (key, max) => set((state) => setResourceMaximum(state, key, max)),
  adjust: (key, delta) => set((state) => changeResource(state, key, state.resources[key].current + delta)),
  setTemporaryHp: (value) => set((state) => setTemporaryHp(state, value)),
  setSuperiorityDie: (dieType) => set((state) => setSuperiorityDie(state, dieType)),
  cast: (cost) => {
    const next = deductMana(get(), cost)
    if (!next) return false
    set(next)
    return true
  },
  recoverMana: () => {
    const current = get()
    const next = restoreMana(current)
    if (next === current) return false
    set(next)
    return true
  },
  undo: () => set((state) => undoResource(state)),
  levelUp: () => set((state) => levelUp(state)),
  toggleInspiration: () => set((state) => ({ inspiration: !state.inspiration })),
  toggleFavorite: (id) => set((state) => ({ favorites: state.favorites.includes(id) ? state.favorites.filter((favorite) => favorite !== id) : [...state.favorites, id] })),

  setSense: (name, value) => set((state) => ({ senses: { ...state.senses, [name]: value } })),
  setCharacteristic: (id, field, value) => set((state) => ({ characteristics: state.characteristics.map((characteristic) => characteristic.id === id ? { ...characteristic, [field]: value } : characteristic) })),
  cycleSkillProficiency: (characteristicId, skillId) => set((state) => ({ characteristics: state.characteristics.map((characteristic) => characteristic.id === characteristicId ? { ...characteristic, skills: characteristic.skills.map((skill) => skill.id === skillId ? { ...skill, proficiencyRank: ((skill.proficiencyRank + 1) % 3) as SkillProficiencyRank } : skill) } : characteristic) })),
  setSkillDisplayBonus: (characteristicId, skillId, bonus) => set((state) => ({ characteristics: state.characteristics.map((characteristic) => characteristic.id === characteristicId ? { ...characteristic, skills: characteristic.skills.map((skill) => skill.id === skillId ? { ...skill, bonus } : skill) } : characteristic) })),
  setCurrency: (key, value) => set((state) => ({ currencies: { ...state.currencies, [key]: Math.max(0, Number.isFinite(value) ? value : state.currencies[key]) } })),
  adjustCurrency: (key, delta) => set((state) => ({ currencies: { ...state.currencies, [key]: Math.max(0, state.currencies[key] + delta) } })),
  convertCurrency: (from, to) => {
    const current = get()
    const next = convertCurrency(current, from, to)
    if (next === current) return false
    set(next)
    return true
  },

  upsertEntry: (collection, entry) => set((state) => ({ [collection]: updateList(state[collection], entry) })),
  deleteEntry: (collection, id) => set((state) => ({ [collection]: state[collection].filter((entry) => entry.id !== id) })),
  upsertSpell: (spell) => set((state) => ({ spells: updateList(state.spells, spell) })),
  deleteSpell: (id) => set((state) => ({ spells: state.spells.filter((spell) => spell.id !== id), favorites: state.favorites.filter((favorite) => favorite !== id) })),
  upsertSkill: (skill) => set((state) => ({ skills: updateList(state.skills, skill) })),
  deleteSkill: (id) => set((state) => ({ skills: state.skills.filter((skill) => skill.id !== id) })),
  upsertItem: (item) => set((state) => ({ inventory: updateList(state.inventory, item) })),
  toggleItemEquipped: (id) => set((state) => ({ inventory: state.inventory.map((item) => item.id === id ? { ...item, equipped: !item.equipped } : item) })),
  deleteItem: (id) => set((state) => ({ inventory: state.inventory.filter((item) => item.id !== id) })),
  upsertNote: (note) => set((state) => ({ notes: updateList(state.notes, note) })),
  deleteNote: (id) => set((state) => ({ notes: state.notes.filter((note) => note.id !== id) })),
  upsertCombatEffect: (effect) => set((state) => ({ combatEffects: updateList(state.combatEffects, effect) })),
  deleteCombatEffect: (id) => set((state) => ({ combatEffects: state.combatEffects.filter((effect) => effect.id !== id) })),
  toggleCombatEffect: (id) => set((state) => ({ combatEffects: state.combatEffects.map((effect) => effect.id === id ? { ...effect, active: !effect.active } : effect) })),
  setCombatEffectRounds: (id, rounds) => set((state) => ({ combatEffects: state.combatEffects.map((effect) => effect.id === id && effect.duration.type === 'rounds' ? { ...effect, duration: { ...effect.duration, roundsRemaining: Math.max(0, Number.isFinite(rounds) ? Math.trunc(rounds) : effect.duration.roundsRemaining ?? 0) } } : effect) })),

  addRoll: (selection) => set((state) => ({ diceHistory: [rollDice(selection), ...state.diceHistory].slice(0, 10) })),
  clearRolls: () => set({ diceHistory: [] }),
  setSetting: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
  importData: (raw) => set({ ...restoreCharacter(raw), editing: false }),
  reset: () => set({ ...copyInitial(), editing: false }),
}))
