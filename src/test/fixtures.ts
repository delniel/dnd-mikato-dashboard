import { createInitialCharacter } from '../data'
import type { CharacterState, Item, Skill, Spell } from '../domain'

const spell = (id: string, name: string, manaCost: number): Spell => ({
  id,
  name,
  elements: ['Тестовый элемент'],
  characteristic: 'Мудрость',
  components: 'В, С',
  castingTime: '1 действие',
  target: 'Существо',
  range: '30 футов',
  duration: 'Мгновенно',
  manaCost,
  damageOrHealing: '1d6',
  damage: '1d6',
  healing: '',
  difficulty: 'Средний',
  level: '1 уровень',
  summary: 'Тестовая способность.',
  description: 'Описание тестовой способности.',
  effects: '',
  restrictions: '',
  tags: ['тест'],
  requiresConcentration: false,
  actionType: 'Действие',
})

const skill: Skill = {
  id: 'test-skill',
  name: 'Тестовый навык',
  difficulty: 'Средний',
  actionType: 'Пассивное',
  summary: 'Тестовый навык.',
  mechanics: 'Тестовая механика.',
  condition: 'Нет',
  requirement: 'Нет',
  status: 'passive',
  tags: ['тест'],
}

const item: Item = {
  id: 'test-item',
  name: 'Тестовый предмет',
  category: 'Снаряжение',
  quantity: '1',
  damage: '',
  damageType: '',
  range: '',
  properties: '',
  cost: '1 зм.',
  description: 'Тестовый предмет.',
  equipped: false,
  note: '',
}

export function createTestCharacter(): CharacterState {
  const state = createInitialCharacter()
  state.profile = { ...state.profile, name: 'Тестовый персонаж', playerName: 'Игрок', masteryMagic: 'Магия' }
  state.resources = {
    hp: { current: 81, max: 81, temporary: 0 },
    mana: { current: 300, max: 300 },
    superiority: { current: 2, max: 2, dieType: '1d8' },
  }
  state.experience = 10
  state.level = 11
  state.languages = [{ id: 'common', name: 'Общий' }, { id: 'gestures', name: 'Жесты' }]
  state.proficiencies = [{ id: 'simple', name: 'Простое оружие' }, { id: 'tools', name: 'Инструменты' }]
  state.elements = [{ id: 'one', name: 'Огонь' }, { id: 'two', name: 'Вода' }, { id: 'three', name: 'Воздух' }]
  state.spells = [spell('spell-one', 'Первое заклинание', 12), spell('spell-two', 'Второе заклинание', 3)]
  state.skills = [skill]
  state.inventory = [item]
  state.currencies = { PP: 0, GP: 70, SP: 0, CP: 0 }
  return state
}
