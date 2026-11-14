import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { createInitialCharacter } from './data'
import { loadLibrary, saveImage, saveLibrary } from './db'
import { addCharacter, createCharacterLibrary, createCharacterRecord } from './library'
import { useLibraryStore } from './libraryStore'
import { useCharacterStore } from './store'

vi.mock('./db', () => ({
  cloneImage: vi.fn(async (id?: string) => id ? `copy-${id}` : undefined),
  loadImage: vi.fn(async () => undefined),
  loadImages: vi.fn(async () => []),
  loadLibrary: vi.fn(async () => undefined),
  removeImages: vi.fn(async () => undefined),
  saveImage: vi.fn(async () => 'uploaded-image'),
  saveImages: vi.fn(async () => undefined),
  saveLibrary: vi.fn(async () => undefined),
}))

vi.mock('./backup', () => ({
  createJsonBackup: vi.fn(() => '{}'),
  createLibraryBackup: vi.fn(async () => ({ blob: new Blob(), imageCount: 0 })),
  materializeImportedCharacter: vi.fn((character, _images, id = 'imported') => ({ character: { ...character, id }, images: [] })),
  parseJsonBackup: vi.fn(),
  restoreLibraryBackup: vi.fn(),
}))

const navigate = (page: string) => fireEvent.click(screen.getAllByRole('button', { name: page === 'Заклинания' ? 'Заклинания и Способности' : page })[0])

describe('игровые представления листа', () => {
  it('показывает статус успешного автосохранения', async () => {
    render(<App />)
    expect(await screen.findByText('Сохранено локально')).toBeInTheDocument()
  })

  beforeEach(() => {
    const initial = createInitialCharacter()
    useCharacterStore.setState({ ...initial, editing: false })
    useLibraryStore.getState().replaceLibrary(createCharacterLibrary(initial, { id: 'test-character', timestamp: '2026-01-01T00:00:00.000Z' }))
    vi.mocked(loadLibrary).mockReset()
    vi.mocked(loadLibrary).mockResolvedValue(undefined)
    vi.mocked(saveLibrary).mockClear()
    vi.mocked(saveImage).mockClear()
  })

  afterEach(() => cleanup())

  it('показывает подписанные пассивные чувства и не дублирует удалённый быстрый блок', async () => {
    render(<App />)
    expect(await screen.findByText('Пассивное Восприятие')).toBeInTheDocument()
    expect(screen.getByText('Пассивная Проницательность')).toBeInTheDocument()
    expect(screen.getByText('Пассивный Анализ')).toBeInTheDocument()
    expect(screen.queryByText('Быстро')).not.toBeInTheDocument()
    expect(screen.queryByText('Размер')).not.toBeInTheDocument()
  })

  it('подставляет пассивное чувство только когда ручное значение не задано', async () => {
    const initial = createInitialCharacter()
    initial.senses.Восприятие = ''
    initial.senses.Проницательность = '99'
    initial.profile.proficiency = '+3'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    const perception = await screen.findByText('Пассивное Восприятие')
    expect(perception.parentElement).toHaveTextContent('15')
    expect(screen.getByText('Пассивная Проницательность').parentElement).toHaveTextContent('99')
  })

  it('показывает бонус владения по уровню в обзоре и навыке, если ручное значение пусто', async () => {
    const initial = createInitialCharacter()
    initial.level = 4
    initial.profile.proficiency = ''
    const perception = initial.characteristics.find((entry) => entry.name === 'Мудрость')!.skills.find((entry) => entry.name === 'Восприятие')!
    perception.proficiencyRank = 1
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)

    expect((await screen.findByText('Бонус владения')).parentElement).toHaveTextContent('+2')
    navigate('Характеристики')
    expect(await screen.findByRole('button', { name: /Восприятие: \+7/ })).toBeInTheDocument()
  })

  it('показывает инициативу в боевых параметрах', async () => {
    const initial = createInitialCharacter()
    initial.profile.initiative = '+2'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    expect(await screen.findByText('Инициатива')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('не подставляет неподтверждённые правила отдыха и не меняет ресурсы автоматически', async () => {
    const initial = createInitialCharacter()
    initial.resources.hitDice = { current: 2, max: 4 }
    initial.resources.patronMana = { current: 1, max: 2 }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)

    expect(screen.queryByText('Учитывайте восстановление костей хитов по правилам вашего персонажа. Запас меняется вручную.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Правила отдыха' })).not.toBeInTheDocument()
    expect(useCharacterStore.getState().resources.hitDice).toEqual({ current: 2, max: 4 })
    expect(useCharacterStore.getState().resources.patronMana).toEqual({ current: 1, max: 2 })
    navigate('Бой')
    expect(await screen.findByText('Учитывайте восстановление костей хитов по правилам вашего персонажа. Запас меняется вручную.')).toBeInTheDocument()
  })

  it('показывает поля анкеты без дублирования умений в разделе персонажа', async () => {
    const initial = createInitialCharacter()
    initial.profile.size = 'Средний'
    initial.profile.background = 'Чужеземец'
    initial.profile.specialAbilities = 'Ночное зрение'
    initial.profile.perspective = 'Размашистый удар'
    initial.profile.characterNotes = 'Личная заметка'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Персонаж')
    expect((await screen.findByText('Основная характеристика')).parentElement).toHaveTextContent(initial.profile.mainCharacteristic)
    expect(screen.getByText('Размер').parentElement).toHaveTextContent('Средний')
    expect(screen.getByText('Предыстория').parentElement).toHaveTextContent('Чужеземец')
    expect(screen.queryByRole('group', { name: 'Способности' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Перспектива' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Заметки' })).not.toBeInTheDocument()
    expect(screen.queryByText('Класс')).not.toBeInTheDocument()
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Редактировать' })))
    act(() => fireEvent.change(screen.getByRole('textbox', { name: 'Основная характеристика' }), { target: { value: 'Сила' } }))
    expect(useCharacterStore.getState().profile.mainCharacteristic).toBe('Сила')
    expect(useCharacterStore.getState().profile.specialAbilities).toBe('Ночное зрение')
    expect(useCharacterStore.getState().profile.perspective).toBe('Размашистый удар')
    expect(useCharacterStore.getState().profile.characterNotes).toBe('Личная заметка')
  })

  it('даёт выбрать расу, подвид, предысторию, мировоззрение и размер из списков', async () => {
    const initial = createInitialCharacter()
    initial.profile.race = 'Плазмоиды'
    initial.profile.raceSubtype = 'Текучий плазмоид'
    initial.profile.alignment = ''
    initial.profile.size = ''
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Персонаж')
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }))

    const race = screen.getByRole('combobox', { name: 'Раса' })
    const subtype = screen.getByRole('combobox', { name: 'Подвид' })
    const background = screen.getByRole('combobox', { name: 'Предыстория' })
    const alignment = screen.getByRole('combobox', { name: 'Мировоззрение' })
    const size = screen.getByRole('combobox', { name: 'Размер' })
    expect(within(alignment).getAllByRole('option')).toHaveLength(10)
    expect(within(size).getAllByRole('option')).toHaveLength(7)
    expect(within(size).getByRole('option', { name: 'Крошечный (Tiny)' })).toBeInTheDocument()
    expect(within(size).getByRole('option', { name: 'Громадный (Gargantuan)' })).toBeInTheDocument()
    expect(within(subtype).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Не выбрано', 'Желатиновый плазмоид', 'Текучий плазмоид', 'Кислотный плазмоид', 'Энергетический плазмоид',
    ])
    fireEvent.change(race, { target: { value: 'Люди' } })
    expect(useCharacterStore.getState().profile.raceSubtype).toBe('')
    expect(within(subtype).queryByRole('option', { name: 'Кислотный плазмоид' })).not.toBeInTheDocument()
    fireEvent.change(background, { target: { value: 'Чужеземец' } })
    expect(useCharacterStore.getState().profile.background).toBe('Чужеземец')
    fireEvent.change(alignment, { target: { value: 'Хаотичный Нейтральный' } })
    expect(useCharacterStore.getState().profile.alignment).toBe('Хаотичный Нейтральный')
    fireEvent.change(size, { target: { value: 'Громадный (Gargantuan)' } })
    expect(useCharacterStore.getState().profile.size).toBe('Громадный (Gargantuan)')
  })

  it('не показывает перспективу в разделе персонажа', async () => {
    const initial = createInitialCharacter()
    initial.profile.perspective = 'Размашистый удар'
    useCharacterStore.setState({ ...initial, editing: true })
    render(<App />)
    navigate('Персонаж')
    expect(await screen.findByText('Основная характеристика')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Перспектива' })).not.toBeInTheDocument()
    expect(useCharacterStore.getState().profile.perspective).toBe('Размашистый удар')
  })

  it('сохраняет нестандартный подвид импортированной расы вне справочника', async () => {
    const initial = createInitialCharacter()
    initial.profile.race = 'constructor'
    initial.profile.raceSubtype = 'Свой подвид'
    useCharacterStore.setState({ ...initial, editing: true })
    render(<App />)
    const subtype = await screen.findByRole('combobox', { name: 'Подвид' })
    expect(subtype).toHaveValue('Свой подвид')
    expect(within(subtype).getAllByRole('option')).toHaveLength(2)
  })

  it('показывает ману покровителя только по выбору и не стирает скрытый ресурс', async () => {
    const initial = createInitialCharacter()
    initial.resources.patronMana = { current: 4, max: 10 }
    initial.profile.trackPatronMana = 'false'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)

    expect(screen.queryByText('Мана покровителя: 4 / 10')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }))
    const toggle = screen.getByRole('checkbox', { name: 'Отслеживать ману покровителя' })
    fireEvent.click(toggle)
    expect(screen.getByText('Мана покровителя: 4 / 10')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('Мана покровителя: 4 / 10')).not.toBeInTheDocument()
    expect(useCharacterStore.getState().resources.patronMana).toEqual({ current: 4, max: 10 })
  })

  it('сохраняет особые чувства и защиты и показывает их в бою', async () => {
    render(<App />)
    navigate('Персонаж')
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Особые чувства' }), { target: { value: 'Тёмное зрение 60 футов' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Сопротивления' }), { target: { value: 'Огонь' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и закрыть' }))
    expect(useCharacterStore.getState().profile.specialSenses).toBe('Тёмное зрение 60 футов')
    navigate('Бой')
    expect(await screen.findByText('Тёмное зрение 60 футов')).toBeInTheDocument()
    expect(screen.getByText('Огонь')).toBeInTheDocument()
    expect(screen.queryByText('Иммунитеты')).not.toBeInTheDocument()
  })

  it('показывает индивидуальные скорости в персонаже и бою', async () => {
    const initial = createInitialCharacter()
    initial.profile.flySpeed = '30'
    initial.profile.swimSpeed = '40'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Персонаж')
    expect((await screen.findByText('Скорость полёта')).parentElement).toHaveTextContent('30')
    expect(screen.getByText('Скорость плавания').parentElement).toHaveTextContent('40')
    navigate('Бой')
    expect(await screen.findByRole('button', { name: 'Расчёт: Скорость полёта' })).toHaveTextContent('30')
    expect(screen.getByRole('button', { name: 'Расчёт: Скорость плавания' })).toHaveTextContent('40')
    expect(screen.queryByRole('button', { name: 'Расчёт: Скорость лазания' })).not.toBeInTheDocument()
  })

  it('подставляет бонус владения в базу бросков атаки', async () => {
    const initial = createInitialCharacter()
    initial.profile.proficiency = '+4'
    initial.profile.attackBonus = '+3'
    initial.profile.spellAttackBonus = '+3'
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)

    navigate('Бой')
    await screen.findByRole('heading', { name: 'Боевые параметры' })
    expect(within(screen.getByRole('button', { name: 'Расчёт: Владение оружием: бонус' })).getByText('База: 4')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Расчёт: Владение заклинанием: бонус' })).getByText('База: 4')).toBeInTheDocument()
  })

  it('списывает ману умения из быстрого доступа в бою', async () => {
    const initial = createInitialCharacter()
    initial.skills[0] = { ...initial.skills[0], manaCost: 2 }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: new RegExp(initial.skills[0].name) }))
    fireEvent.click(screen.getByRole('button', { name: 'Использовать (2 маны)' }))
    expect(useCharacterStore.getState().resources.mana.current).toBe(initial.resources.mana.current - 2)
  })

  it('отслеживает готовую руну и активирует её без повторного расхода маны', async () => {
    const initial = createInitialCharacter()
    initial.spells[0] = { ...initial.spells[0], runic: true, manaCost: 3 }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Заклинания: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: new RegExp(initial.spells[0].name) }))
    expect(screen.getByRole('heading', { name: 'Готовых рун: 0' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Создание руны ${initial.spells[0].name}: списать 3 маны`) }))
    expect(useCharacterStore.getState().resources.mana.current).toBe(initial.resources.mana.current - 3)
    fireEvent.click(screen.getByRole('button', { name: 'Отметить созданную руну' }))
    expect(screen.getByRole('heading', { name: 'Готовых рун: 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Активировать готовую руну' }))
    expect(screen.getByRole('heading', { name: 'Готовых рун: 0' })).toBeInTheDocument()
    expect(useCharacterStore.getState().resources.mana.current).toBe(initial.resources.mana.current - 3)
  })

  it('списывает превосходство умения из быстрого доступа и не уходит в минус', async () => {
    const initial = createInitialCharacter()
    initial.skills[0] = { ...initial.skills[0], superiorityCost: 1 }
    initial.resources.superiority = { current: 1, max: 2, dieType: '1d8' }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: new RegExp(initial.skills[0].name) }))
    const button = screen.getByRole('button', { name: 'Списать превосходство (1)' })
    fireEvent.click(button)
    expect(useCharacterStore.getState().resources.superiority.current).toBe(0)
    fireEvent.click(button)
    expect(screen.getByText('Недостаточно превосходства: 0.')).toBeInTheDocument()
    expect(useCharacterStore.getState().resources.superiority.current).toBe(0)
  })

  it('показывает и списывает кости хитов для умения из быстрого доступа', async () => {
    const initial = createInitialCharacter()
    initial.skills[0] = { ...initial.skills[0], hitDiceCost: 1 }
    initial.resources.hitDice = { current: 1, max: 2 }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: new RegExp(initial.skills[0].name) }))
    const button = screen.getByRole('button', { name: 'Списать кости хитов (1)' })
    fireEvent.click(button)
    expect(useCharacterStore.getState().resources.hitDice.current).toBe(0)
    fireEvent.click(button)
    expect(screen.getByText('Недостаточно костей хитов: 0.')).toBeInTheDocument()
    expect(useCharacterStore.getState().resources.hitDice.current).toBe(0)
  })

  it('позволяет задать и списать HP-стоимость умения', async () => {
    render(<App />)
    navigate('Умения')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить навык' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Жизненная сила' } })
    fireEvent.change(screen.getByLabelText('Стоимость HP (необязательно)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить навык' }))
    expect(useCharacterStore.getState().skills.find((skill) => skill.name === 'Жизненная сила')?.hpCost).toBe(10)
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: /Жизненная сила/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Списать HP (10)' }))
    expect(useCharacterStore.getState().resources.hp.current).toBe(71)
  })

  it('совместно списывает ресурсы умения и отменяет их одной кнопкой', async () => {
    const initial = createInitialCharacter()
    initial.resources.mana.current = 30
    initial.resources.superiority.current = 1
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Умения')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить навык' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Совместный приём' } })
    fireEvent.change(screen.getByLabelText('Стоимость маны (необязательно)'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Стоимость превосходства (необязательно)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Связь затрат'), { target: { value: 'combined' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить навык' }))
    expect(useCharacterStore.getState().skills.find((skill) => skill.name === 'Совместный приём')?.costMode).toBe('combined')
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: /Совместный приём/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Оплатить вместе: 30 маны + 1 превосходства' }))
    expect(useCharacterStore.getState().resources.mana.current).toBe(0)
    expect(useCharacterStore.getState().resources.superiority.current).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: /Отменить: Совместная оплата/ }))
    expect(useCharacterStore.getState().resources).toEqual(initial.resources)
  })

  it('позволяет выбрать ровно один ресурс для альтернативной оплаты умения', async () => {
    const initial = createInitialCharacter()
    initial.skills[0] = { ...initial.skills[0], manaCost: 30, superiorityCost: 1, costMode: 'choose' }
    initial.resources.mana.current = 30
    initial.resources.superiority.current = 1
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    fireEvent.click(within(quick).getByRole('button', { name: new RegExp(initial.skills[0].name) }))
    fireEvent.change(screen.getByLabelText('Вариант оплаты'), { target: { value: 'superiority' } })
    fireEvent.click(screen.getByRole('button', { name: 'Оплатить выбранный вариант' }))
    expect(useCharacterStore.getState().resources.superiority.current).toBe(0)
    expect(useCharacterStore.getState().resources.mana.current).toBe(30)
  })

  it('сохраняет вручную заданную стоимость превосходства навыка', async () => {
    render(<App />)
    navigate('Умения')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить навык' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Боевой приём' } })
    fireEvent.change(screen.getByLabelText('Стоимость превосходства (необязательно)'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить навык' }))
    expect(useCharacterStore.getState().skills.find((skill) => skill.name === 'Боевой приём')?.superiorityCost).toBe(2)
  })

  it('позволяет задать стоимость костей хитов для нового навыка', async () => {
    render(<App />)
    navigate('Умения')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить навык' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Взлом замков' } })
    fireEvent.change(screen.getByLabelText('Стоимость костей хитов (необязательно)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить навык' }))
    expect(useCharacterStore.getState().skills.find((skill) => skill.name === 'Взлом замков')?.hitDiceCost).toBe(1)
  })

  it('создаёт и учитывает ограниченные применения умения', async () => {
    render(<App />)
    navigate('Умения')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить навык' }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Первая помощь' } })
    fireEvent.change(screen.getByLabelText('Лимит применений (необязательно)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Лимит применений (необязательно)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Лимит применений (необязательно)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Когда восстанавливаются применения'), { target: { value: 'Короткий отдых' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить навык' }))
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Умения: быстрый доступ' })
    const entry = within(quick).getByRole('button', { name: /Первая помощь/ })
    expect(entry).toHaveTextContent('2/2 применений')
    fireEvent.click(entry)
    expect(screen.getByText('Восстановление: Короткий отдых')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Потратить применение' }))
    expect(screen.getByRole('heading', { name: 'Применения: 1 / 2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть применение' }))
    expect(screen.getByRole('heading', { name: 'Применения: 2 / 2' })).toBeInTheDocument()
  })

  it('не использует неподготовленное заклинание', async () => {
    const initial = createInitialCharacter()
    initial.spells[0] = { ...initial.spells[0], prepared: false }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    const useButton = await screen.findByRole('button', { name: `Использовать ${initial.spells[0].name}: списать ${initial.spells[0].manaCost} маны` })
    expect(useButton).toBeDisabled()
    expect(screen.getAllByText('Не подготовлено').length).toBeGreaterThan(0)
  })

  it('отделяет способности от заклинаний и не считает их подготовленными', async () => {
    const initial = createInitialCharacter()
    initial.spells = [
      { ...initial.spells[0], id: 'spell-one', name: 'Проверочное заклинание' },
      { ...initial.spells[0], id: 'ability-one', name: 'Разделение', spellType: 'Способность', requiresPreparation: false, prepared: false, manaCost: null, elements: ['Способность'], restrictions: 'Раса: Плазмоид' },
    ]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    expect(await screen.findByRole('button', { name: 'Способности (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Проверочное заклинание' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Способности (1)' }))
    expect(screen.getByRole('heading', { name: 'Разделение' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Проверочное заклинание' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Подготовлено заклинаний:/)).not.toBeInTheDocument()
    navigate('Бой')
    const quickAbilities = await screen.findByRole('region', { name: 'Способности: быстрый доступ' })
    const quickSpells = screen.getByRole('region', { name: 'Заклинания: быстрый доступ' })
    expect(within(quickAbilities).getByText('Разделение')).toBeInTheDocument()
    expect(within(quickSpells).queryByText('Разделение')).not.toBeInTheDocument()
  })

  it('позволяет использовать руну без обязательной подготовки', async () => {
    const initial = createInitialCharacter()
    initial.spells[0] = { ...initial.spells[0], prepared: false, requiresPreparation: false }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    const useButton = await screen.findByRole('button', { name: `Использовать ${initial.spells[0].name}: списать ${initial.spells[0].manaCost} маны` })
    expect(useButton).toBeEnabled()
    fireEvent.click(useButton)
    expect(useCharacterStore.getState().resources.mana.current).toBe(initial.resources.mana.current - (initial.spells[0].manaCost ?? 0))
  })

  it('редактирует варианты оплаты заклинания и списывает выбранную стоимость', async () => {
    const initial = createInitialCharacter()
    initial.spells = [{ ...initial.spells[0], id: 'variable-cost', name: 'Цена выбора', manaCost: 30, manaCostOptions: undefined, requiresPreparation: false }]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать Цена выбора' }))
    fireEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))
    fireEvent.change(screen.getByLabelText('Название варианта 1'), { target: { value: 'Бонусное действие' } })
    fireEvent.change(screen.getByLabelText('Название варианта 2'), { target: { value: 'Реакция' } })
    fireEvent.change(screen.getByLabelText('Стоимость маны 2'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заклинание' }))

    const reaction = await screen.findByRole('button', { name: 'Использовать Цена выбора: Реакция: списать 45 маны' })
    fireEvent.click(reaction)
    expect(useCharacterStore.getState().resources.mana.current).toBe(initial.resources.mana.current - 45)
    expect(await screen.findByText('Списано 45 маны (Реакция): «Цена выбора».')).toBeInTheDocument()
  })

  it('сохраняет и показывает дополнительные ручные затраты заклинания', async () => {
    const initial = createInitialCharacter()
    initial.spells = [{ ...initial.spells[0], id: 'blood-cost', name: 'Кровавое копьё', additionalCostNote: '3d4 урона себе при формировании' }]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заклинания')
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать Кровавое копьё' }))
    fireEvent.change(screen.getByLabelText('Дополнительные затраты и условия оплаты (вручную)'), { target: { value: '3d4 самоурона, списать вручную' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заклинание' }))
    expect(useCharacterStore.getState().spells[0].additionalCostNote).toBe('3d4 самоурона, списать вручную')

    fireEvent.click(screen.getByText('Кровавое копьё', { selector: 'h3' }).closest('button')!)
    expect(screen.getByText('Дополнительные затраты и условия оплаты (вручную)')).toBeInTheDocument()
    expect(screen.getByText('3d4 самоурона, списать вручную')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    navigate('Бой')
    const quick = await screen.findByRole('region', { name: 'Заклинания: быстрый доступ' })
    expect(within(quick).getByText(/Дополнительные затраты вручную: 3d4 самоурона, списать вручную/)).toBeInTheDocument()
  })

  it('создаёт и изменяет дополнительный боевой ресурс', async () => {
    render(<App />)
    navigate('Бой')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить ресурс' }))
    fireEvent.change(screen.getByLabelText('Название ресурса Новый ресурс'), { target: { value: 'Искра' } })
    const section = screen.getByLabelText('Название ресурса Искра').closest('section') ?? screen.getByLabelText('Название ресурса Искра').parentElement?.parentElement?.parentElement
    expect(section).toBeTruthy()
    fireEvent.change(within(section as HTMLElement).getByLabelText('Максимум'), { target: { value: '3' } })
    expect(within(section as HTMLElement).getByLabelText('0 из 3').firstElementChild).toHaveStyle({ width: '0%' })
    fireEvent.click(within(section as HTMLElement).getByRole('button', { name: 'Искра: текущее значение: плюс 1' }))
    expect(parseFloat((within(section as HTMLElement).getByLabelText('1 из 3').firstElementChild as HTMLElement).style.width)).toBeCloseTo(100 / 3)
    expect(useCharacterStore.getState().customResources[0]).toMatchObject({ name: 'Искра', current: 1, max: 3 })
  })

  it('восстанавливает ману на величину из боевых резервов', async () => {
    const initial = createInitialCharacter()
    initial.profile.manaRecovery = '+30'
    initial.resources.mana = { current: 250, max: 300 }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановление маны (+30)' }))
    expect(useCharacterStore.getState().resources.mana.current).toBe(280)
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

  it('добавляет пользовательский навык к выбранной характеристике и считает владение', async () => {
    const initial = createInitialCharacter()
    useCharacterStore.setState({ ...initial, editing: true })
    render(<App />)
    navigate('Характеристики')
    const input = await screen.findByLabelText('Новый навык для Мудрость')
    fireEvent.change(input, { target: { value: 'Ориентация' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить навык к Мудрость' }))
    expect(await screen.findByRole('button', { name: /Ориентация: \+5/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ориентация: \+5/ }))
    expect(screen.getByRole('button', { name: /Ориентация: \+8/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Удалить пользовательский навык Ориентация' }))
    expect(screen.queryByText('Ориентация')).not.toBeInTheDocument()
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
    await waitFor(() => expect(saveLibrary).toHaveBeenCalled())
    vi.mocked(saveLibrary).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Имя игрока'), { target: { value: 'Новый игрок' } })
    navigate('Заклинания')
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
    await waitFor(() => expect(saveLibrary).toHaveBeenCalledWith(expect.objectContaining({ characters: expect.objectContaining({}) })))
    navigate('Персонаж')
    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
  })

  it('переключает вдохновение, главную характеристику и экипировку прямо из игрового режима', async () => {
    render(<App />)
    navigate('Бой')
    fireEvent.click(await screen.findByRole('button', { name: 'Временные хиты: плюс 5' }))
    expect(useCharacterStore.getState().resources.hp.temporary).toBe(5)
    navigate('Обзор')
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

  it('позволяет в обзоре редактировать текущее и максимальное HP общими данными персонажа', async () => {
    render(<App />)
    expect(await screen.findByText('81 / 81')).toBeInTheDocument()
    expect(screen.queryByLabelText('Хиты: текущее значение')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    fireEvent.change(screen.getByLabelText('Хиты: текущее значение'), { target: { value: '75' } })
    expect(screen.getByLabelText('Хиты: максимум')).toBeInTheDocument()
    expect(screen.getByLabelText('Мана: максимум')).toBeInTheDocument()
    expect(screen.getByLabelText('Превосходство: максимум')).toBeInTheDocument()
    expect(useCharacterStore.getState().resources.hp.current).toBe(75)
    fireEvent.change(screen.getByLabelText('Хиты: максимум'), { target: { value: '90' } })
    expect(useCharacterStore.getState().resources.hp.max).toBe(90)
    fireEvent.change(screen.getByLabelText('Превосходство: максимум'), { target: { value: '8' } })
    expect(useCharacterStore.getState().resources.superiority.max).toBe(8)
    navigate('Бой')
    expect(await screen.findByText('75 / 90')).toBeInTheDocument()
    expect(screen.getByLabelText('Хиты: текущее значение')).toBeInTheDocument()
    expect(screen.queryByLabelText('Хиты: максимум')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Хиты: текущее значение: плюс 10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Мана: текущее значение: минус 10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Превосходство: текущее значение: плюс 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Превосходство: текущее значение: плюс 5' })).not.toBeInTheDocument()
  })

  it('предлагает групповые параметры характеристик для боевых эффектов', async () => {
    render(<App />)
    navigate('Бой')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить эффект' }))
    fireEvent.click(screen.getByRole('button', { name: 'Добавить изменение' }))
    const target = screen.getByRole('combobox', { name: 'Целевой параметр' })
    expect(within(target).getByRole('option', { name: 'Все характеристики: Значение' })).toBeInTheDocument()
    expect(within(target).getByRole('option', { name: 'Все характеристики: Проверка' })).toBeInTheDocument()
    expect(within(target).getByRole('option', { name: 'Все характеристики: Спасбросок' })).toBeInTheDocument()
  })

  it('выбирает кости хитов и превосходства, затем бросает и тратит превосходство в бою', async () => {
    const initial = createInitialCharacter()
    initial.resources.superiority = { current: 1, max: 3, dieType: '1d8' }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    await screen.findByText('81 / 81')
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    const hitDie = screen.getByRole('combobox', { name: 'Кость хитов' })
    const superiorityDie = screen.getByRole('combobox', { name: 'Кость превосходства' })
    expect(superiorityDie).toHaveValue('1к8')
    fireEvent.change(hitDie, { target: { value: '1к10' } })
    expect(useCharacterStore.getState().profile.hitDie).toBe('1к10')
    fireEvent.change(superiorityDie, { target: { value: '1к6' } })
    expect(useCharacterStore.getState().resources.superiority.dieType).toBe('1к6')
    navigate('Бой')

    const button = await screen.findByRole('button', { name: 'Бросить кость превосходства' })
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      fireEvent.click(button)
    } finally {
      random.mockRestore()
    }
    const state = useCharacterStore.getState()
    expect(state.resources.superiority.current).toBe(0)
    expect(state.resources.hitDice).toEqual(initial.resources.hitDice)
    expect(state.diceHistory[0]).toMatchObject({ dice: { d6: 1 }, total: 4 })
    expect(screen.getByText('Выпало').parentElement).toHaveTextContent('4')
    expect(button).toBeDisabled()
    expect(state.rollSuperiority()).toBeNull()
    expect(useCharacterStore.getState().diceHistory).toHaveLength(1)
  })

  it('синхронизирует HP между вкладками Бой и Обзор', async () => {
    render(<App />)
    navigate('Бой')
    fireEvent.change(await screen.findByLabelText('Хиты: текущее значение'), { target: { value: '70' } })
    expect(useCharacterStore.getState().resources.hp.current).toBe(70)
    navigate('Обзор')
    expect(await screen.findByText('70 / 81')).toBeInTheDocument()
  })

  it('объединяет значение, проверку и спасбросок характеристики в одну карточку', async () => {
    render(<App />)
    navigate('Бой')
    const strength = await screen.findByLabelText('Сила: боевые значения')
    expect(within(strength).getByText('Значение')).toBeInTheDocument()
    expect(within(strength).getByText('Проверка')).toBeInTheDocument()
    expect(within(strength).getByRole('button', { name: 'Расчёт: Сила: Проверка' })).toHaveTextContent('-3')
    expect(within(strength).getByText('Спасбросок')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/боевые значения$/)).toHaveLength(6)
  })

  it('показывает все записи быстрого доступа внутри прокручиваемых областей', async () => {
    render(<App />)
    navigate('Бой')
    const spells = await screen.findByRole('region', { name: 'Заклинания: быстрый доступ' })
    const skills = screen.getByRole('region', { name: 'Умения: быстрый доступ' })
    expect(spells).toHaveAttribute('tabindex', '0')
    expect(skills).toHaveAttribute('tabindex', '0')
    expect(within(spells).getAllByRole('button')).toHaveLength(useCharacterStore.getState().spells.length)
    expect(within(skills).getAllByRole('button')).toHaveLength(useCharacterStore.getState().skills.length)
  })

  it('показывает эффекты в правильных секциях и сохраняет текстовый эффект', async () => {
    const initial = createInitialCharacter()
    initial.combatEffects = [
      { id: 'blessing', name: 'Благословение', category: 'positive', source: 'Заклинание', description: '+ к бою', active: true, concentration: false, createdAt: '2026-07-22T10:00:00.000Z', duration: { type: 'manual' }, modifiers: [] },
      { id: 'acid', name: 'Разъедание кислотой', category: 'negative', source: '', description: 'В начале хода 1к6 урона кислотой', active: true, concentration: false, createdAt: '2026-07-22T11:00:00.000Z', duration: { type: 'rounds', roundsRemaining: 3 }, modifiers: [] },
    ]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    expect(await screen.findByRole('heading', { name: 'Положительные эффекты' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Отрицательные эффекты' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Благословение' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Разъедание кислотой' })).toBeInTheDocument()
    expect(screen.getByText('В начале хода 1к6 урона кислотой')).toBeInTheDocument()
    await waitFor(() => expect(saveLibrary).toHaveBeenCalledWith(expect.objectContaining({ characters: expect.any(Object) })))
  })

  it('подставляет название связанной записи только в пустое название эффекта', async () => {
    render(<App />)
    navigate('Бой')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить эффект' }))
    const name = screen.getByLabelText('Название')
    const source = screen.getByLabelText('Связь с записью листа')
    const [first, second] = useCharacterStore.getState().spells
    fireEvent.change(source, { target: { value: `spell:${first.id}` } })
    expect(name).toHaveValue(first.name)
    fireEvent.change(name, { target: { value: 'Моё название' } })
    fireEvent.change(source, { target: { value: `spell:${second.id}` } })
    expect(name).toHaveValue('Моё название')
  })

  it('позволяет выбрать эффект на заклинания без общего поля Сл. спасброска', async () => {
    const initial = createInitialCharacter()
    initial.profile.proficiency = ''
    initial.profile.spellSaveDc = ''
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Бой')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить эффект' }))
    fireEvent.click(screen.getByRole('button', { name: 'Добавить изменение' }))
    const select = screen.getByLabelText('Целевой параметр')
    expect(within(select).getByRole('option', { name: 'Сложность спасброска заклинаний' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Атака заклинанием' })).toBeInTheDocument()
  })

  it('восстанавливает сохранённые эффекты при загрузке страницы', async () => {
    const saved = createInitialCharacter()
    saved.combatEffects = [{ id: 'persisted', name: 'Сохранённый эффект', category: 'special', source: '', description: 'После перезагрузки', active: true, concentration: false, createdAt: '2026-07-22T12:00:00.000Z', duration: { type: 'manual' }, modifiers: [] }]
    vi.mocked(loadLibrary).mockResolvedValueOnce({ id: 'library', value: createCharacterLibrary(saved, { id: 'saved-character' }) })
    render(<App />)
    await waitFor(() => expect(useCharacterStore.getState().combatEffects).toHaveLength(1))
    navigate('Бой')
    expect(await screen.findByRole('heading', { name: 'Особые эффекты' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Сохранённый эффект' })).toBeInTheDocument()
  })

  it('конвертирует соседние номиналы монет кнопками инвентаря', async () => {
    const initial = createInitialCharacter()
    initial.currencies = { PP: 1, GP: 0, SP: 0, CP: 0 }
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Инвентарь')
    fireEvent.click(await screen.findByRole('button', { name: 'Конвертировать 1 ПМ → 10 ЗМ' }))
    expect(useCharacterStore.getState().currencies).toEqual({ PP: 0, GP: 10, SP: 0, CP: 0 })
  })

  it('ищет заклинания по одноразрядной мане и сортирует найденные карточки', async () => {
    const initial = createInitialCharacter()
    const template = initial.spells[0]
    initial.spells = [
      { ...template, id: 'mana-12', name: 'Двенадцать маны', manaCost: 12, characteristic: 'Сила', components: 'С', level: '', difficulty: '', target: '', summary: '', description: '', effects: '', restrictions: '', tags: [] },
      { ...template, id: 'mana-3', name: 'Три маны', manaCost: 3, characteristic: 'Харизма', components: 'В', level: '', difficulty: '', target: '', summary: '', description: '', effects: '', restrictions: '', tags: [] },
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
    const initial = createInitialCharacter()
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
    const initial = createInitialCharacter()
    const template = initial.skills[0]
    initial.skills = [
      { ...template, id: 'granite', name: 'Гранитная стойка', difficulty: 'Редкий', mechanics: 'Каменная защита', status: 'passive' },
      { ...template, id: 'dash', name: 'Рывок', difficulty: 'Простой', mechanics: 'Быстрое движение', status: 'active' },
    ]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Умения')
    const search = await screen.findByLabelText('Поиск навыков')
    fireEvent.change(search, { target: { value: 'Каменная' } })
    expect(screen.getByRole('heading', { name: 'Гранитная стойка' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Рывок' })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'пассивный' } })
    expect(screen.getByRole('heading', { name: 'Гранитная стойка' })).toBeInTheDocument()
  })

  it('редактирует, заменяет и убирает изображение существующего заклинания с сохранением состояния', async () => {
    const initial = createInitialCharacter()
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
    await waitFor(() => expect(saveLibrary).toHaveBeenCalled())
    fireEvent.click(screen.getAllByRole('button', { name: /Редактировать / })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Убрать изображение' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заклинание' }))
    await waitFor(() => expect(useCharacterStore.getState().spells[0].imageId).toBeUndefined())
  })

  it('создаёт независимую копию навыка и отдельную заметку с тегом', async () => {
    render(<App />)
    const initialSkills = useCharacterStore.getState().skills.length
    navigate('Умения')
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

  it('ищет заметки по заголовку и тегам', async () => {
    const initial = createInitialCharacter()
    initial.notes = [
      { id: 'one', title: 'Карта пещер', body: 'Текст', tags: ['локация'], createdAt: '2026-07-22', updatedAt: '2026-07-22' },
      { id: 'two', title: 'Список NPC', body: 'Текст', tags: ['персонажи'], createdAt: '2026-07-22', updatedAt: '2026-07-22' },
    ]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заметки')
    const search = await screen.findByLabelText('Поиск заметок')
    fireEvent.change(search, { target: { value: 'пещер' } })
    expect(screen.getByRole('heading', { name: 'Карта пещер' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Список NPC' })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'персонажи' } })
    expect(screen.getByRole('heading', { name: 'Список NPC' })).toBeInTheDocument()
  })

  it('оставляет миниатюру заметки и отдельную область для изображения в полном просмотре', async () => {
    const initial = createInitialCharacter()
    initial.notes = [{ id: 'image-note', title: 'Карта с изображением', body: 'Описание', tags: [], imageId: 'note-image', createdAt: '2026-11-14', updatedAt: '2026-11-14' }]
    useCharacterStore.setState({ ...initial, editing: false })
    render(<App />)
    navigate('Заметки')

    const title = await screen.findByRole('heading', { name: 'Карта с изображением' })
    expect(title.closest('.note-card')?.querySelector('.note-image')).toBeInTheDocument()
    fireEvent.click(title.closest('button')!)

    const dialog = await screen.findByRole('dialog', { name: 'Карта с изображением' })
    expect(dialog.querySelector('.detail-image-frame')).toBeInTheDocument()
  })

  it('переключает три независимых персонажа без смешивания ресурсов и заклинаний', async () => {
    const make = (name: string, hp: number, spellName: string) => {
      const data = createInitialCharacter(); data.profile.name = name; data.resources.hp.current = hp; data.spells[0].name = spellName
      return data
    }
    let library = createCharacterLibrary(make('Альфа', 11, 'Альфа-заклинание'), { id: 'alpha' })
    library = addCharacter(library, createCharacterRecord(make('Бета', 22, 'Бета-заклинание'), { id: 'beta' }))
    library = addCharacter(library, createCharacterRecord(make('Гамма', 33, 'Гамма-заклинание'), { id: 'gamma' }))
    library = { ...library, activeCharacterId: 'alpha' }
    vi.mocked(loadLibrary).mockResolvedValueOnce({ id: 'library', value: library })
    render(<App />)
    expect(await screen.findByText('11 / 81')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Альфа/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Бета/ }))
    await waitFor(() => expect(useCharacterStore.getState().profile.name).toBe('Бета'))
    expect(useCharacterStore.getState().resources.hp.current).toBe(22)
    expect(useCharacterStore.getState().spells[0].name).toBe('Бета-заклинание')
    act(() => useCharacterStore.getState().setResource('hp', 7))
    fireEvent.click(screen.getByRole('button', { name: /Бета/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Гамма/ }))
    await waitFor(() => expect(useCharacterStore.getState().profile.name).toBe('Гамма'))
    expect(useCharacterStore.getState().resources.hp.current).toBe(33)
    fireEvent.click(screen.getByRole('button', { name: /Гамма/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Бета/ }))
    await waitFor(() => expect(useCharacterStore.getState().profile.name).toBe('Бета'))
    expect(useCharacterStore.getState().resources.hp.current).toBe(7)
    expect(useLibraryStore.getState().characters.alpha.data.resources.hp.current).toBe(11)
  })

  it('создаёт нового персонажа как пустой лист, не копируя Урумира', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('Новый герой')
    render(<App />)
    await waitFor(() => expect(saveLibrary).toHaveBeenCalled())
    const switcher = document.querySelector<HTMLButtonElement>('.character-switcher-button')
    expect(switcher).not.toBeNull()
    fireEvent.click(switcher!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Создать персонажа' }))
    await waitFor(() => expect(useCharacterStore.getState().profile.name).toBe('Новый герой'))
    expect(useCharacterStore.getState().spells).toEqual([])
    expect(useCharacterStore.getState().skills).toEqual([])
    expect(useCharacterStore.getState().inventory).toEqual([])
    prompt.mockRestore()
  })

  it('не перезаписывает библиотеку, если локальное хранилище не удалось прочитать', async () => {
    vi.mocked(loadLibrary).mockRejectedValueOnce(new Error('unsupported schema'))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Автосохранение отключено')
    act(() => useCharacterStore.getState().setProfile('name', 'Не сохранять'))
    await act(async () => Promise.resolve())
    expect(saveLibrary).not.toHaveBeenCalled()
  })
})
