import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { createInitialCharacter } from './data'
import { saveCharacter, saveImage } from './db'
import { useCharacterStore } from './store'
import { createTestCharacter } from './test/fixtures'

vi.mock('./db', () => ({
  db: { snapshots: { put: vi.fn() } },
  cloneImage: vi.fn(async (id?: string) => id ? `copy-${id}` : undefined),
  loadCharacter: vi.fn(async () => undefined),
  loadImage: vi.fn(async () => undefined),
  saveCharacter: vi.fn(async () => undefined),
  saveImage: vi.fn(async () => 'uploaded-image'),
}))

const navigate = (page: string) => fireEvent.click(screen.getAllByRole('button', { name: page === 'Заклинания' ? 'Заклинания и Способности' : page })[0])

describe('игровые представления листа', () => {
  beforeEach(() => {
    useCharacterStore.setState({ ...createTestCharacter(), editing: false })
    vi.mocked(saveCharacter).mockClear()
    vi.mocked(saveImage).mockClear()
  })

  afterEach(() => cleanup())

  it('начинает с полностью пустого публичного листа', () => {
    const blank = createInitialCharacter()
    expect(blank.profile.name).toBe('')
    expect(blank.spells).toEqual([])
    expect(blank.skills).toEqual([])
    expect(blank.inventory).toEqual([])
  })

  it('показывает подписанные пассивные чувства и не дублирует удалённый быстрый блок', async () => {
    render(<App />)
    expect(await screen.findByText('Пассивное Восприятие')).toBeInTheDocument()
    expect(screen.getByText('Пассивная Проницательность')).toBeInTheDocument()
    expect(screen.getByText('Пассивный Анализ')).toBeInTheDocument()
    expect(screen.queryByText('Быстро')).not.toBeInTheDocument()
    expect(screen.queryByText('Размер')).not.toBeInTheDocument()
  })

  it('сохраняет полные подписи длинных навыков в игровом и редактируемом режиме', async () => {
    render(<App />)
    navigate('Характеристики')
    expect(await screen.findByText('Ловкость рук')).toBeInTheDocument()
    expect(screen.getByText('Уход за животными')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Редактировать' })[0])
    expect(screen.getByLabelText('Ловкость рук')).toBeInTheDocument()
    expect(screen.getByLabelText('Уход за животными')).toBeInTheDocument()
  })

  it('показывает подписи полей персонажа, включая профессию и мастерство/магию', async () => {
    render(<App />)
    navigate('Персонаж')
    expect(await screen.findByText('Раса')).toBeInTheDocument()
    expect(screen.getByText('Профессия')).toBeInTheDocument()
    expect(screen.getByText('Мастерство/Магия')).toBeInTheDocument()
    expect(screen.getByText('Магические элементы')).toBeInTheDocument()
  })

  it('подписывает каждый кубик и хранит сгруппированные результаты разных типов', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Открыть бросок кубиков' }))
    expect(await screen.findByText('d2')).toBeInTheDocument()
    expect(screen.getByLabelText('d4: количество')).toBeInTheDocument()
    expect(screen.getByLabelText('d20: количество')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('d4: количество'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('d10: количество'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Бросить' }))
    expect(await screen.findByText('2 × d4')).toBeInTheDocument()
    expect(screen.getByText('1 × d10')).toBeInTheDocument()
    expect(screen.getByText(/Итого:/)).toBeInTheDocument()
  })

  it('фильтрует заклинания только по избранному', async () => {
    render(<App />)
    expect(screen.getAllByRole('button', { name: 'Заклинания и Способности' })).toHaveLength(2)
    navigate('Заклинания')
    const first = useCharacterStore.getState().spells[0]
    const second = useCharacterStore.getState().spells[1]
    fireEvent.click((await screen.findAllByLabelText(/Добавить .* в избранное/))[0])
    fireEvent.click(screen.getByRole('button', { name: 'Только избранное' }))
    expect(screen.getByRole('heading', { name: first.name })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: second.name })).not.toBeInTheDocument()
  })

  it('ограничивает глобальное редактирование тремя разделами и сохраняет изменения при переходе', async () => {
    render(<App />)
    await waitFor(() => expect(saveCharacter).toHaveBeenCalled())
    vi.mocked(saveCharacter).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Имя игрока'), { target: { value: 'Новый игрок' } })
    navigate('Заклинания')
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
    await waitFor(() => expect(saveCharacter).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ playerName: 'Новый игрок' }) })))
    navigate('Персонаж')
    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
  })

  it('переключает вдохновение, главную характеристику и экипировку прямо из игрового режима', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Временные хиты: плюс 5' }))
    expect(useCharacterStore.getState().resources.hp.temporary).toBe(5)
    fireEvent.click(await screen.findByRole('button', { name: /Вдохновение/ }))
    expect(useCharacterStore.getState().inspiration).toBe(true)
    navigate('Характеристики')
    fireEvent.click(screen.getByRole('button', { name: 'Сделать главной: Ловкость' }))
    expect(useCharacterStore.getState().profile.mainCharacteristic).toBe('Ловкость')
    navigate('Инвентарь')
    const item = useCharacterStore.getState().inventory[0]
    fireEvent.click(screen.getByRole('button', { name: `${item.equipped ? 'Снять' : 'Экипировать'} ${item.name}` }))
    expect(useCharacterStore.getState().inventory[0].equipped).toBe(!item.equipped)
  })

  it('ищет заклинания по одноразрядной мане и сортирует найденные карточки', async () => {
    const initial = createTestCharacter()
    const template = initial.spells[0]
    initial.spells = [
      { ...template, id: 'mana-12', name: 'Двенадцать маны', manaCost: 12, characteristic: 'Сила', components: 'С', level: '', difficulty: '', target: '', range: '', summary: '', description: '', effects: '', restrictions: '', tags: [] },
      { ...template, id: 'mana-3', name: 'Три маны', manaCost: 3, characteristic: 'Харизма', components: 'В', level: '', difficulty: '', target: '', range: '', summary: '', description: '', effects: '', restrictions: '', tags: [] },
    ]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    fireEvent.change(await screen.findByLabelText('Поиск заклинаний'), { target: { value: '3' } })
    expect(screen.getByRole('heading', { name: 'Три маны' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Двенадцать маны' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Поиск заклинаний'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Сортировка по мане'), { target: { value: 'asc' } })
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Три маны')
    fireEvent.change(screen.getByLabelText('Поиск заклинаний'), { target: { value: 'С' } })
    expect(screen.getByRole('heading', { name: 'Двенадцать маны' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Три маны' })).not.toBeInTheDocument()
  })

  it('нормализует и позволяет очистить старое объединённое поле урона', async () => {
    const initial = createTestCharacter()
    initial.spells = [{ ...initial.spells[0], damageOrHealing: '2d6', damage: undefined, healing: undefined, elements: ['Урон'] }]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    fireEvent.click(await screen.findByRole('button', { name: /Редактировать / }))
    expect(screen.getByLabelText('Урон')).toHaveValue('2d6')
    fireEvent.change(screen.getByLabelText('Урон'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заклинание' }))
    expect(useCharacterStore.getState().spells[0].damageOrHealing).toBe('')
  })

  it('применяет независимые настройки темы и акцента', async () => {
    render(<App />)
    navigate('Настройки')
    fireEvent.click(await screen.findByRole('button', { name: 'Светлая' }))
    fireEvent.click(screen.getByRole('button', { name: 'Акцент: Зелёный' }))
    expect(useCharacterStore.getState().settings).toMatchObject({ themeMode: 'light', accentColor: 'green' })
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'))
    expect(document.documentElement).toHaveAttribute('data-accent', 'green')
  })

  it('ищет навыки по сложности, механике и локализованному статусу', async () => {
    const initial = createTestCharacter()
    const template = initial.skills[0]
    initial.skills = [
      { ...template, id: 'granite', name: 'Гранитная стойка', difficulty: 'Редкий', mechanics: 'Каменная защита', status: 'passive' },
      { ...template, id: 'dash', name: 'Рывок', difficulty: 'Простой', mechanics: 'Быстрое движение', status: 'active' },
    ]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Навыки +')
    const search = await screen.findByLabelText('Поиск навыков')
    fireEvent.change(search, { target: { value: 'Каменная' } })
    expect(screen.getByRole('heading', { name: 'Гранитная стойка' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Рывок' })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'пассивный' } })
    expect(screen.getByRole('heading', { name: 'Гранитная стойка' })).toBeInTheDocument()
  })

  it('редактирует, заменяет и убирает изображение существующего заклинания с сохранением состояния', async () => {
    const initial = createTestCharacter()
    initial.spells[0].imageId = 'old-image'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    fireEvent.click((await screen.findAllByRole('button', { name: /Редактировать / }))[0])
    const imageInput = screen.getByLabelText('Заменить изображение')
    fireEvent.change(imageInput, { target: { files: [new File(['image'], 'spell.png', { type: 'image/png' })] } })
    await waitFor(() => expect(saveImage).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заклинание' }))
    await waitFor(() => expect(useCharacterStore.getState().spells[0].imageId).toBe('uploaded-image'))
    await waitFor(() => expect(saveCharacter).toHaveBeenCalled())
    fireEvent.click(screen.getAllByRole('button', { name: /Редактировать / })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Убрать изображение' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заклинание' }))
    await waitFor(() => expect(useCharacterStore.getState().spells[0].imageId).toBeUndefined())
  })

  it('создаёт независимую копию навыка и отдельную заметку с тегом', async () => {
    render(<App />)
    const initialSkills = useCharacterStore.getState().skills.length
    navigate('Навыки +')
    fireEvent.click((await screen.findAllByRole('button', { name: /Создать копию / }))[0])
    await waitFor(() => expect(useCharacterStore.getState().skills).toHaveLength(initialSkills + 1))
    expect(useCharacterStore.getState().skills.at(-1)?.id).not.toBe(useCharacterStore.getState().skills[0].id)
    navigate('Заметки')
    fireEvent.click(screen.getByRole('button', { name: 'Новая заметка' }))
    fireEvent.change(screen.getByLabelText('Заголовок'), { target: { value: 'Карта пещер' } })
    fireEvent.change(screen.getByLabelText('Текст заметки'), { target: { value: 'Северный вход закрыт.' } })
    fireEvent.change(screen.getByLabelText('Новый тег: Теги'), { target: { value: 'локация' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }))
    expect(await screen.findByRole('heading', { name: 'Карта пещер' })).toBeInTheDocument()
    expect(useCharacterStore.getState().notes[0]).toMatchObject({ title: 'Карта пещер', tags: ['локация'] })
  })
})
