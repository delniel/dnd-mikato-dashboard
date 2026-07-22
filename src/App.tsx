import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArchiveRestore, BookOpen, Copy, Dices, Download, Heart, Moon, Package, Pencil, Plus, Save, Settings, Shield, Sparkles, Star, Sun, Trash2, Upload, UserRound, WandSparkles, X, type LucideIcon } from 'lucide-react'
import { cloneImage, db, loadCharacter, loadImage, saveCharacter, saveImage } from './db'
import { serializeCharacter, thresholdForLevel, type CharacterState, type CurrencyKey, type Item, type Note, type ResourceKey, type Skill, type Spell } from './domain'
import { useCharacterStore } from './store'

type Page = 'Обзор' | 'Характеристики' | 'Заклинания и Способности' | 'Навыки +' | 'Инвентарь' | 'Персонаж' | 'Заметки' | 'Настройки'

const pages: { page: Page; icon: LucideIcon }[] = [
  { page: 'Обзор', icon: Shield },
  { page: 'Характеристики', icon: Sparkles },
  { page: 'Заклинания и Способности', icon: WandSparkles },
  { page: 'Навыки +', icon: Star },
  { page: 'Инвентарь', icon: Package },
  { page: 'Персонаж', icon: UserRound },
  { page: 'Заметки', icon: BookOpen },
  { page: 'Настройки', icon: Settings },
]

const currencies: Array<{ key: CurrencyKey; label: string; ratio?: string; tone: string }> = [
  { key: 'PP', label: 'ПМ', ratio: '10 ЗМ', tone: 'platinum' },
  { key: 'GP', label: 'ЗМ', ratio: '10 СМ', tone: 'gold' },
  { key: 'SP', label: 'СМ', ratio: '10 ММ', tone: 'silver' },
  { key: 'CP', label: 'ММ', tone: 'copper' },
]
const accentOptions = [
  ['red', 'Красный'], ['blue', 'Синий'], ['cyan', 'Голубой'], ['green', 'Зелёный'], ['purple', 'Фиолетовый'], ['pink', 'Розовый'], ['yellow', 'Жёлтый'],
] as const
const editablePages = new Set<Page>(['Обзор', 'Характеристики', 'Персонаж'])
const passiveSenseLabels: Record<string, string> = {
  Восприятие: 'Пассивное Восприятие',
  Проницательность: 'Пассивная Проницательность',
  Анализ: 'Пассивный Анализ',
}
const baseDice = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd16', 'd20', 'd100']
const newId = () => crypto.randomUUID()
const noValue = (value: string) => value.trim() || 'Не указано'

function App() {
  const state = useCharacterStore()
  const setCharacter = useCharacterStore((store) => store.setCharacter)
  const [page, setPage] = useState<Page>('Обзор')
  const [hydrated, setHydrated] = useState(false)
  const [diceOpen, setDiceOpen] = useState(false)
  const saved = useMemo(() => snapshot(state), [state])

  useEffect(() => {
    loadCharacter()
      .then((record) => {
        if (record) setCharacter(record.value)
        setHydrated(true)
      })
      .catch(() => setHydrated(true))
  }, [setCharacter])

  useEffect(() => {
    if (hydrated) void saveCharacter(saved)
  }, [hydrated, saved])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.themeMode
    document.documentElement.dataset.accent = state.settings.accentColor
  }, [state.settings.themeMode, state.settings.accentColor])

  const selectPage = (nextPage: Page) => {
    if (!editablePages.has(nextPage)) state.setEditing(false)
    setPage(nextPage)
  }

  const content = page === 'Обзор'
    ? <Overview />
    : page === 'Характеристики'
      ? <Characteristics />
      : page === 'Заклинания и Способности'
        ? <SpellsPage />
        : page === 'Навыки +'
          ? <SkillsPage />
          : page === 'Инвентарь'
            ? <InventoryPage />
            : page === 'Персонаж'
              ? <CharacterPage />
              : page === 'Заметки'
                ? <NotesPage />
                : <SettingsPage />

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand />
        <Navigation active={page} onSelect={selectPage} />
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Лист персонажа · Микато Edition</p>
            <h1>{page}</h1>
          </div>
          {editablePages.has(page) && <div className="top-actions">
            <span className={state.editing ? 'mode-pill edit' : 'mode-pill'}>{state.editing ? 'Режим редактирования' : 'Игровой режим'}</span>
            <ModeButton />
          </div>}
        </header>
        {content}
      </section>
      <nav className="bottom-nav"><Navigation active={page} onSelect={selectPage} compact /></nav>
      <button className="dice-fab" type="button" aria-label="Открыть бросок кубиков" onClick={() => setDiceOpen(true)}><Dices /></button>
      {diceOpen && <DicePanel onClose={() => setDiceOpen(false)} />}
    </main>
  )
}

function snapshot(state: ReturnType<typeof useCharacterStore.getState>): CharacterState {
  return {
    schemaVersion: state.schemaVersion,
    profile: state.profile,
    resources: state.resources,
    experience: state.experience,
    level: state.level,
    inspiration: state.inspiration,
    senses: state.senses,
    favorites: state.favorites,
    notes: state.notes,
    settings: state.settings,
    recentAction: state.recentAction,
    characteristics: state.characteristics,
    languages: state.languages,
    proficiencies: state.proficiencies,
    elements: state.elements,
    spells: state.spells,
    skills: state.skills,
    inventory: state.inventory,
    currencies: state.currencies,
    diceHistory: state.diceHistory,
    extras: state.extras,
  }
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Dices size={22} /></span><div><strong>DnD MGE</strong><small>Лист персонажа</small></div></div>
}

function Navigation({ active, onSelect, compact = false }: { active: Page; onSelect: (page: Page) => void; compact?: boolean }) {
  return <div className={compact ? 'nav compact' : 'nav'}>{pages.map(({ page, icon: Icon }) => <button key={page} type="button" className={active === page ? 'nav-item active' : 'nav-item'} onClick={() => onSelect(page)} aria-current={active === page ? 'page' : undefined}><Icon size={compact ? 18 : 19} /><span>{page}</span></button>)}</div>
}

function ModeButton() {
  const { editing, setEditing } = useCharacterStore()
  return <button type="button" className={editing ? 'button primary' : 'button ghost'} onClick={() => setEditing(!editing)}>{editing ? <><Save size={16} />Сохранить и закрыть</> : <><Pencil size={16} />Редактировать</>}</button>
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`card ${className}`}>{children}</article>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="drawer-backdrop" onMouseDown={onClose}><section className="drawer editor-drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><button className="close" type="button" aria-label="Закрыть" onClick={onClose}><X /></button><h2>{title}</h2>{children}</section></div>
}

function useImageUrl(imageId?: string) {
  const [source, setSource] = useState<{ imageId: string; url: string } | null>(null)
  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (!imageId) return () => undefined
    void loadImage(imageId).then((image) => {
      if (!image) return
      objectUrl = URL.createObjectURL(image.blob)
      if (active) setSource({ imageId, url: objectUrl })
      else URL.revokeObjectURL(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])
  return source && source.imageId === imageId ? source.url : ''
}

function ImageFrame({ imageId, label, className = '' }: { imageId?: string; label: string; className?: string }) {
  const url = useImageUrl(imageId)
  return <div className={`image-frame ${className}`}>{url ? <img src={url} alt={label} /> : <span aria-label={`Нет изображения: ${label}`}>{label.slice(0, 1).toUpperCase()}</span>}</div>
}

function Avatar({ imageId, name, className = '' }: { imageId?: string; name: string; className?: string }) {
  return <ImageFrame imageId={imageId} label={name} className={`avatar ${className}`} />
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <Card className="empty-state"><h3>{title}</h3><p>{text}</p></Card>
}

function FieldValue({ label, value, onChange, editable, heading = false, className = '' }: { label: string; value: string; onChange?: (value: string) => void; editable?: boolean; heading?: boolean; className?: string }) {
  return <label className={`field-value ${heading ? 'heading-field' : ''} ${className}`}><span>{label}</span>{editable ? <input aria-label={label} value={value} onChange={(event) => onChange?.(event.target.value)} /> : heading ? <h2>{noValue(value)}</h2> : <strong>{noValue(value)}</strong>}</label>
}

function TextValue({ label, value, onChange, editable }: { label: string; value: string; onChange: (value: string) => void; editable: boolean }) {
  return <article className="text-value"><span>{label}</span>{editable ? <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /> : <p>{noValue(value)}</p>}</article>
}

function Counter({ label, value, onChange, onAdjust, steps = [1] }: { label: string; value: number; onChange: (value: number) => void; onAdjust?: (delta: number) => void; steps?: number[] }) {
  const adjustable = Boolean(onAdjust)
  return <div className={adjustable ? `counter ${steps.length > 1 ? 'counter-steps' : ''}` : 'counter input-only'}>{adjustable && [...steps].reverse().map((step) => <button key={`minus-${step}`} type="button" aria-label={`${label}: минус ${step}`} onClick={() => onAdjust?.(-step)}>−{step}</button>)}<input aria-label={label} type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />{adjustable && steps.map((step) => <button key={`plus-${step}`} type="button" aria-label={`${label}: плюс ${step}`} onClick={() => onAdjust?.(step)}>+{step}</button>)}</div>
}

function Progress({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0
  return <div className="progress" aria-label={`${value} из ${max}`}><span className={color} style={{ width: `${width}%` }} /></div>
}

function Overview() {
  const state = useCharacterStore()
  const threshold = thresholdForLevel(state.level)
  const canLevel = threshold !== undefined && state.experience >= threshold

  return <div className="page-stack">
    <section className="hero-layout">
      <section className="hero-card">
        <Avatar name={state.profile.name || 'Персонаж'} imageId={state.profile.avatarId} className="hero-portrait" />
        <div className="hero-copy">
          <FieldValue label="Имя персонажа" value={state.profile.name} onChange={(value) => state.setProfile('name', value)} editable={state.editing} heading />
          <div className="hero-details">
            <FieldValue label="Имя игрока" value={state.profile.playerName} onChange={(value) => state.setProfile('playerName', value)} editable={state.editing} />
            <FieldValue label="Класс/предыстория" value={state.profile.classBackground || ''} onChange={(value) => state.setProfile('classBackground', value)} editable={state.editing} />
            <FieldValue label="Раса" value={state.profile.race} onChange={(value) => state.setProfile('race', value)} editable={state.editing} />
            <FieldValue label="Подвид" value={state.profile.raceSubtype} onChange={(value) => state.setProfile('raceSubtype', value)} editable={state.editing} />
          </div>
        </div>
        <div className="level-controls"><span>Уровень</span><strong>{state.level}</strong>{state.editing && <Counter label="Уровень" value={state.level} onChange={state.setLevel} onAdjust={state.adjustLevel} />}</div>
      </section>
      <button className={state.inspiration ? 'inspiration active' : 'inspiration'} type="button" aria-pressed={state.inspiration} onClick={state.toggleInspiration}><Star size={24} fill={state.inspiration ? 'currentColor' : 'none'} /><span>Вдохновение</span><strong>{state.inspiration ? 'Есть' : 'Нет'}</strong><small>Нажмите, чтобы переключить</small></button>
    </section>

    <section className="resource-grid">
      <ResourceCard title="Хиты" caption="HP" color="hp" resourceKey="hp" />
      <ResourceCard title="Мана" caption="Энергия" color="mana" resourceKey="mana" />
      <ResourceCard title="Превосходство" caption="Ресурс" color="bone" resourceKey="superiority" />
    </section>

    {state.recentAction && <button className="undo-banner" type="button" onClick={state.undo}><ArchiveRestore size={17} />Отменить: {state.recentAction.label}</button>}

    <section className="overview-grid">
      <OverviewStats title="Параметры боя" values={[['КД', 'armorClass'], ['Скорость', 'speed'], ['Бонус владения', 'proficiency']]} />
      <OverviewStats title="Боевые резервы" values={[['Ёмкость заклинаний', 'spellCapacity'], ['Кость хитов', 'hitDie'], ['Восстановление маны', 'manaRecovery']]} />
      <Card className="experience">
        <div className="section-title"><div><p className="eyebrow">Опыт</p><h3>Прогресс уровня</h3></div>{canLevel && <button className="button primary" type="button" onClick={state.levelUp}>Повысить уровень</button>}</div>
        {state.editing ? <Counter label="Опыт" value={state.experience} onChange={state.setExperience} onAdjust={(delta) => state.setExperience(state.experience + delta)} steps={[1, 10, 100]} /> : <p className="progress-copy">{threshold === undefined ? 'Достигнут максимальный уровень' : `${state.experience} из ${threshold}`}</p>}
        {threshold !== undefined && <Progress value={state.experience} max={threshold} color="blue" />}
      </Card>
      <Card className="passive-senses">
        <div className="section-title"><div><p className="eyebrow">Чувства</p><h3>Пассивные чувства</h3></div></div>
        <div className="sense-grid">{Object.entries(state.senses).map(([name, value]) => <FieldValue key={name} label={passiveSenseLabels[name] ?? name} value={value} onChange={(next) => state.setSense(name, next)} editable={state.editing} />)}</div>
      </Card>
    </section>
  </div>
}

function ResourceCard({ title, caption, color, resourceKey }: { title: string; caption: string; color: string; resourceKey: ResourceKey }) {
  const state = useCharacterStore()
  const resource = state.resources[resourceKey]
  const dieType = state.resources.superiority.dieType ?? ''
  return <Card className={`resource ${color}`}>
    <div className="resource-heading"><div><p className="eyebrow">{caption}</p><h3>{title}</h3></div><strong>{resourceKey === 'hp' && (resource.temporary ?? 0) > 0 ? `${resource.current} + ${resource.temporary} / ${resource.max}` : `${resource.current} / ${resource.max}`}</strong></div>
    {resourceKey === 'superiority' && (state.editing
      ? <FieldValue label="Кость превосходства" value={dieType} onChange={state.setSuperiorityDie} editable />
      : <p className="resource-detail"><span>Кость превосходства</span><strong>{noValue(dieType)}</strong></p>)}
    {resourceKey === 'hp' ? <HpProgress current={resource.current} temporary={resource.temporary ?? 0} max={resource.max} /> : <Progress value={resource.current} max={resource.max} color={color} />}
    <Counter label={`${title}: текущее значение`} value={resource.current} onChange={(value) => state.setResource(resourceKey, value)} onAdjust={(delta) => state.adjust(resourceKey, delta)} steps={resourceKey === 'hp' || resourceKey === 'mana' ? [1, 5, 10] : [1]} />
    {resourceKey === 'hp' && <div className="temporary-hp"><span>Временные хиты</span><Counter label="Временные хиты" value={resource.temporary ?? 0} onChange={state.setTemporaryHp} onAdjust={(delta) => state.setTemporaryHp((resource.temporary ?? 0) + delta)} steps={[1, 5, 10]} /></div>}
    {state.editing && <div className="resource-max"><FieldValue label={`${title}: максимум`} value={String(resource.max)} onChange={(value) => state.setResourceMax(resourceKey, Number(value))} editable /></div>}
  </Card>
}

function OverviewStats({ title, values }: { title: string; values: Array<[string, string]> }) {
  const state = useCharacterStore()
  return <Card className="overview-stats"><p className="eyebrow">Показатели</p><h3>{title}</h3><div className="stat-row">{values.map(([label, key]) => state.editing ? <FieldValue key={key} label={label} value={state.profile[key] ?? ''} onChange={(value) => state.setProfile(key, value)} editable /> : <div className="stat-value" key={key}><span>{label}</span><strong>{noValue(state.profile[key] ?? '')}</strong></div>)}</div></Card>
}

function HpProgress({ current, temporary, max }: { current: number; temporary: number; max: number }) {
  const total = Math.max(1, max + temporary)
  return <div className="progress hp-progress" aria-label={`${current} обычных и ${temporary} временных хитов из ${max}`}><span className="hp" style={{ width: `${Math.max(0, current) / total * 100}%` }} /><span className="temporary" style={{ width: `${Math.max(0, temporary) / total * 100}%` }} /></div>
}

function Characteristics() {
  const state = useCharacterStore()
  return <div className="page-stack"><p className="page-intro">Модификаторы и бонусы независимы от чисел характеристик — значения никогда не пересчитываются автоматически. Отметьте главную характеристику звездой.</p><section className="characteristic-grid">{state.characteristics.map((characteristic) => { const selected = state.profile.mainCharacteristic === characteristic.name; return <Card key={characteristic.id} className={selected ? 'characteristic is-main' : 'characteristic'}><div className="characteristic-heading"><h3>{characteristic.name}</h3><button type="button" className="main-stat" aria-label={`Сделать главной: ${characteristic.name}`} aria-pressed={selected} onClick={() => state.setProfile('mainCharacteristic', characteristic.name)}><Star size={17} fill={selected ? 'currentColor' : 'none'} /></button></div><div className="triple-fields">{(['score', 'check', 'save'] as const).map((field) => <FieldValue key={field} label={field === 'score' ? 'Число' : field === 'check' ? 'Проверка' : 'Спасбросок'} value={characteristic[field]} onChange={(value) => state.setCharacteristic(characteristic.id, field, value)} editable={state.editing} />)}</div><div className="skill-metrics">{characteristic.skills.map((skill) => <FieldValue key={skill.id} label={skill.name} value={skill.bonus} onChange={(value) => state.setSkillBonus(characteristic.id, skill.id, value)} editable={state.editing} />)}</div></Card> })}</section></div>
}

function SpellsPage() {
  const state = useCharacterStore()
  const [query, setQuery] = useState('')
  const [element, setElement] = useState('Все')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [manaSort, setManaSort] = useState<'default' | 'asc' | 'desc'>('default')
  const [editing, setEditing] = useState<Spell | 'new' | null>(null)
  const [detail, setDetail] = useState<Spell | null>(null)
  const [notice, setNotice] = useState('')
  const elements = ['Все', ...new Set(state.spells.flatMap((spell) => spell.elements).filter(Boolean))]
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = state.spells.filter((spell) => {
    const searchable = [spell.name, spell.manaCost, spell.characteristic, spell.components, spell.castingTime, spell.actionType, spell.target, spell.range, spell.duration, spell.difficulty, spell.level, spell.damage, spell.healing, spell.damageOrHealing, spell.summary, spell.description, spell.effects, spell.restrictions, spell.elements.join(' '), spell.tags.join(' '), spell.requiresConcentration ? 'концентрация' : ''].filter((value) => value !== null && value !== undefined).join(' ').toLocaleLowerCase()
    const componentTokens = spell.components.toLocaleLowerCase().split(/[\s,;/]+/).filter(Boolean)
    const isComponentQuery = normalizedQuery === 'в' || normalizedQuery === 'с'
    const matchesQuery = !normalizedQuery || (isComponentQuery ? componentTokens.includes(normalizedQuery) : searchable.includes(normalizedQuery))
    return matchesQuery && (element === 'Все' || spell.elements.includes(element)) && (!favoritesOnly || state.favorites.includes(spell.id))
  }).sort((left, right) => {
    if (manaSort === 'default') return 0
    if (left.manaCost === null) return 1
    if (right.manaCost === null) return -1
    return manaSort === 'asc' ? left.manaCost - right.manaCost : right.manaCost - left.manaCost
  })

  const duplicate = async (spell: Spell) => {
    const copiedImageId = await cloneImage(spell.imageId)
    state.upsertSpell({ ...spell, id: newId(), name: `${spell.name} — копия`, ...(copiedImageId ? { imageId: copiedImageId } : {}) })
    setNotice(`Создана независимая копия «${spell.name}».`)
  }
  const castSpell = (spell: Spell) => {
    if (spell.manaCost === null) return
    setNotice(state.cast(spell.manaCost) ? `Списано ${spell.manaCost} маны: «${spell.name}».` : `Недостаточно маны для «${spell.name}»: осталось ${state.resources.mana.current}.`)
  }

  return <div className="page-stack">
    <section className="page-toolbar ability-toolbar">
      <div className="filters"><input aria-label="Поиск заклинаний" placeholder="Поиск по всем параметрам…" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Элемент" value={element} onChange={(event) => setElement(event.target.value)}>{elements.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Сортировка по мане" value={manaSort} onChange={(event) => setManaSort(event.target.value as typeof manaSort)}><option value="default">Исходный порядок</option><option value="asc">Мана: сначала меньше</option><option value="desc">Мана: сначала больше</option></select><button type="button" className={favoritesOnly ? 'filter-toggle active' : 'filter-toggle'} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}><Heart size={15} fill={favoritesOnly ? 'currentColor' : 'none'} />Только избранное</button></div>
      <button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={16} />Добавить заклинание</button>
    </section>
    {notice && <p className="notice" role="status">{notice}</p>}
    {filtered.length ? <section className="ability-grid spell-grid">{filtered.map((spell) => { const damage = spell.damage || (!spell.elements.includes('Исцеление') ? spell.damageOrHealing : ''); const healing = spell.healing || (spell.elements.includes('Исцеление') ? spell.damageOrHealing : ''); return <Card key={spell.id} className="ability-card spell-card"><button className="favorite" type="button" aria-label={state.favorites.includes(spell.id) ? `Убрать «${spell.name}» из избранного` : `Добавить «${spell.name}» в избранное`} aria-pressed={state.favorites.includes(spell.id)} onClick={() => state.toggleFavorite(spell.id)}><Heart size={18} fill={state.favorites.includes(spell.id) ? 'currentColor' : 'none'} /></button><button className="ability-open" type="button" onClick={() => setDetail(spell)}><ImageFrame imageId={spell.imageId} label={spell.name} className="ability-image spell-image" /><div className="ability-copy"><p className="eyebrow">{spell.elements.join(' · ') || 'Элемент не указан'}</p><h3>{spell.name}</h3><div className="ability-meta"><span>{spell.manaCost === null ? 'Мана не указана' : `${spell.manaCost} маны`}</span>{spell.level && <span>{spell.level}</span>}{spell.difficulty && <span>{spell.difficulty}</span>}{spell.characteristic && <span>{spell.characteristic}</span>}</div><p>{spell.summary || 'Краткое описание не указано.'}</p><dl className="spell-facts">{damage && damage !== '—' && <Detail label="Урон" value={damage} />}{healing && healing !== '—' && <Detail label="Лечение" value={healing} />}{spell.components && <Detail label="Компоненты" value={spell.components} />}{spell.actionType && <Detail label="Действие" value={spell.actionType} />}{spell.target && <Detail label="Цель" value={spell.target} />}{spell.range && <Detail label="Дистанция" value={spell.range} />}{spell.duration && <Detail label="Длительность" value={spell.duration} />}</dl></div></button><CardActions itemName={spell.name} leftAction={spell.manaCost === null ? undefined : <button className="use-spell" type="button" aria-label={`Использовать ${spell.name}: списать ${spell.manaCost} маны`} onClick={() => castSpell(spell)}><WandSparkles size={15} />Использовать ({spell.manaCost})</button>} onEdit={() => setEditing(spell)} onDuplicate={() => void duplicate(spell)} onDelete={() => { if (window.confirm(`Удалить «${spell.name}»?`)) { state.deleteSpell(spell.id); setNotice(`Заклинание «${spell.name}» удалено.`) } }} /></Card> })}</section> : <EmptyState title="Заклинания не найдены" text="Измените поиск или фильтр, либо добавьте новую способность." />}
    {editing && <SpellEditor spell={editing === 'new' ? blankSpell() : editing} onClose={() => setEditing(null)} />}
    {detail && <SpellDetail spell={detail} onClose={() => setDetail(null)} />}
  </div>
}

function CardActions({ itemName, onEdit, onDuplicate, onDelete, leftAction }: { itemName: string; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; leftAction?: ReactNode }) {
  return <div className="card-actions">{leftAction}<div className="action-group"><button type="button" aria-label={`Редактировать ${itemName}`} onClick={onEdit}><Pencil size={15} />Изменить</button><button type="button" aria-label={`Создать копию ${itemName}`} onClick={onDuplicate}><Copy size={15} />Копия</button><button className="delete" type="button" aria-label={`Удалить ${itemName}`} onClick={onDelete}><Trash2 size={15} />Удалить</button></div></div>
}

function SpellDetail({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  const { cast, resources } = useCharacterStore()
  const [message, setMessage] = useState('')
  const useSpell = () => {
    if (spell.manaCost === null) return
    setMessage(cast(spell.manaCost) ? `Списано ${spell.manaCost} маны.` : `Недостаточно маны: осталось ${resources.mana.current}.`)
  }

  const damage = spell.damage || (!spell.elements.includes('Исцеление') ? spell.damageOrHealing : '')
  const healing = spell.healing || (spell.elements.includes('Исцеление') ? spell.damageOrHealing : '')
  return <Modal title={spell.name} onClose={onClose}><ImageFrame imageId={spell.imageId} label={spell.name} className="detail-image" /><p className="lead">{spell.summary || 'Краткое описание не указано.'}</p><dl className="details-grid"><Detail label="Характеристика" value={spell.characteristic} /><Detail label="Компоненты" value={spell.components} /><Detail label="Время наложения" value={spell.castingTime} /><Detail label="Цель" value={spell.target ?? ''} /><Detail label="Дистанция" value={spell.range} /><Detail label="Длительность" value={spell.duration} /><Detail label="Тип действия" value={spell.actionType} /><Detail label="Мана" value={spell.manaCost === null ? 'Не указана' : String(spell.manaCost)} /><Detail label="Сложность" value={spell.difficulty} /><Detail label="Уровень" value={spell.level} /><Detail label="Урон" value={damage} /><Detail label="Лечение" value={healing} /><Detail label="Элементы" value={spell.elements.join(', ')} /><Detail label="Концентрация" value={spell.requiresConcentration ? 'Да' : 'Нет'} /></dl><LongDetail label="Описание" value={spell.description} /><LongDetail label="Эффекты" value={spell.effects} /><LongDetail label="Ограничения" value={spell.restrictions} />{spell.manaCost !== null && <button className="button primary" type="button" onClick={useSpell}>Использовать ({spell.manaCost} маны)</button>}{message && <p className="notice" role="status">{message}</p>}</Modal>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{noValue(value)}</dd></div>
}

function LongDetail({ label, value }: { label: string; value: string }) {
  return <section className="long-detail"><h3>{label}</h3><p>{noValue(value)}</p></section>
}

function ImageInput({ value, onChange }: { value?: string; onChange: (imageId?: string) => void }) {
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    onChange(await saveImage(file))
    input.value = ''
  }
  return <div className="image-input"><label className="button ghost"><Upload size={16} />{value ? 'Заменить изображение' : 'Загрузить изображение'}<input hidden type="file" accept="image/*" onChange={upload} /></label>{value && <button className="button ghost" type="button" onClick={() => onChange(undefined)}>Убрать изображение</button>}</div>
}

function EditorField({ label, value, type = 'text', onChange }: { label: string; value: string; type?: 'text' | 'number' | 'textarea'; onChange: (value: string) => void }) {
  return <label className="editor-field"><span>{label}</span>{type === 'textarea' ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />}</label>
}

function TagInput({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const tags = draft.split(',').map((tag) => tag.trim()).filter(Boolean)
    if (!tags.length) return
    onChange([...new Set([...value, ...tags])])
    setDraft('')
  }
  return <div className="tag-input"><span>{label}</span><div className="chips">{value.map((tag) => <span className="chip" key={tag}>{tag}<button type="button" aria-label={`Удалить тег ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))}>×</button></span>)}</div><div className="add-line"><input aria-label={`Новый тег: ${label}`} value={draft} placeholder="Введите тег" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} /><button className="button ghost" type="button" onClick={add}>Добавить</button></div></div>
}

function SpellEditor({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  const upsert = useCharacterStore((state) => state.upsertSpell)
  const legacyIsHealing = spell.elements.includes('Исцеление')
  const [draft, setDraft] = useState<Spell>({
    ...spell,
    damage: spell.damage ?? (legacyIsHealing ? '' : spell.damageOrHealing),
    healing: spell.healing ?? (legacyIsHealing ? spell.damageOrHealing : ''),
  })
  const standardCharacteristics = ['Сила', 'Ловкость', 'Телосложение', 'Интеллект', 'Мудрость', 'Харизма']
  const [customCharacteristic, setCustomCharacteristic] = useState(Boolean(spell.characteristic) && !standardCharacteristics.includes(spell.characteristic))
  const field = (key: keyof Spell, label: string, type: 'text' | 'number' | 'textarea' = 'text') => <EditorField label={label} value={String(draft[key] ?? '')} type={type} onChange={(value) => setDraft({ ...draft, [key]: type === 'number' ? (value === '' ? null : Number(value)) : value } as Spell)} />
  const save = () => {
    upsert({ ...draft, id: draft.id || newId(), damageOrHealing: draft.damage || draft.healing || '' })
    onClose()
  }
  return <Modal title={spell.id ? 'Редактировать заклинание' : 'Новое заклинание'} onClose={onClose}><div className="editor-grid">{field('name', 'Название')}<label className="editor-field"><span>Характеристика</span><select value={customCharacteristic ? 'custom' : draft.characteristic} onChange={(event) => { const value = event.target.value; setCustomCharacteristic(value === 'custom'); if (value !== 'custom') setDraft({ ...draft, characteristic: value }) }}><option value="">Не выбрано</option>{standardCharacteristics.map((value) => <option key={value}>{value}</option>)}<option value="custom">Другое значение…</option></select></label>{customCharacteristic && <EditorField label="Нестандартная характеристика" value={draft.characteristic} onChange={(characteristic) => setDraft({ ...draft, characteristic })} />}{field('components', 'Компоненты')}{field('castingTime', 'Время наложения')}{field('actionType', 'Тип действия')}{field('target', 'Цель')}{field('range', 'Дистанция')}{field('duration', 'Длительность')}{field('manaCost', 'Стоимость маны', 'number')}{field('damage', 'Урон')}{field('healing', 'Лечение')}{field('difficulty', 'Сложность')}{field('level', 'Уровень')}{field('summary', 'Кратко', 'textarea')}{field('description', 'Описание', 'textarea')}{field('effects', 'Эффекты', 'textarea')}{field('restrictions', 'Ограничения', 'textarea')}<TagInput label="Элементы" value={draft.elements} onChange={(elements) => setDraft({ ...draft, elements })} /><TagInput label="Теги" value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} /><label className="check"><input type="checkbox" checked={draft.requiresConcentration} onChange={(event) => setDraft({ ...draft, requiresConcentration: event.target.checked })} />Концентрация</label></div><ImageInput value={draft.imageId} onChange={(imageId) => setDraft({ ...draft, ...(imageId ? { imageId } : { imageId: undefined }) })} /><button className="button primary" type="button" onClick={save}>Сохранить заклинание</button></Modal>
}

function SkillsPage() {
  const state = useCharacterStore()
  const [filter, setFilter] = useState<'all' | Skill['status']>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Skill | 'new' | null>(null)
  const [detail, setDetail] = useState<Skill | null>(null)
  const [notice, setNotice] = useState('')
  const statusLabels: Record<Skill['status'], string> = { active: 'активное активный', passive: 'пассивное пассивный', reaction: 'реакция' }
  const list = state.skills.filter((skill) => (filter === 'all' || skill.status === filter) && (!query || [skill.name, skill.difficulty, skill.actionType, skill.summary, skill.mechanics, skill.condition, skill.requirement, statusLabels[skill.status], skill.tags.join(' ')].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const duplicate = async (skill: Skill) => {
    const copiedImageId = await cloneImage(skill.imageId)
    state.upsertSkill({ ...skill, id: newId(), name: `${skill.name} — копия`, ...(copiedImageId ? { imageId: copiedImageId } : {}) })
    setNotice(`Создана независимая копия «${skill.name}».`)
  }

  return <div className="page-stack"><section className="page-toolbar ability-toolbar"><div className="filters"><input aria-label="Поиск навыков" placeholder="Поиск навыков…" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="tabs">{[['all', 'Все'], ['active', 'Активные'], ['passive', 'Пассивные'], ['reaction', 'Реакции']].map(([key, label]) => <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key as typeof filter)}>{label}</button>)}</div></div><button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={16} />Добавить навык</button></section>{notice && <p className="notice" role="status">{notice}</p>}{list.length ? <section className="ability-grid skill-grid">{list.map((skill) => <Card key={skill.id} className="ability-card skill-card"><button className="ability-open" type="button" onClick={() => setDetail(skill)}><ImageFrame imageId={skill.imageId} label={skill.name} className="ability-image skill-image" /><div className="ability-copy"><p className="eyebrow">{skill.actionType || 'Тип не указан'} · {skill.difficulty || 'Сложность не указана'}</p><h3>{skill.name}</h3><p>{skill.summary || skill.mechanics || 'Описание не указано.'}</p><dl className="compact-details"><Detail label="Условие" value={skill.condition} /><Detail label="Требование" value={skill.requirement} /></dl></div></button><CardActions itemName={skill.name} onEdit={() => setEditing(skill)} onDuplicate={() => void duplicate(skill)} onDelete={() => { if (window.confirm(`Удалить «${skill.name}»?`)) { state.deleteSkill(skill.id); setNotice(`Навык «${skill.name}» удалён.`) } }} /></Card>)}</section> : <EmptyState title="Навыки не найдены" text="Смените фильтр или создайте новый навык." />}{editing && <SkillEditor skill={editing === 'new' ? blankSkill() : editing} onClose={() => setEditing(null)} />}{detail && <Modal title={detail.name} onClose={() => setDetail(null)}><ImageFrame imageId={detail.imageId} label={detail.name} className="detail-image" /><p className="lead">{detail.summary || 'Краткое описание не указано.'}</p><LongDetail label="Полная механика" value={detail.mechanics} /><LongDetail label="Условие" value={detail.condition} /><LongDetail label="Требование" value={detail.requirement} /></Modal>}</div>
}

function SkillEditor({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const upsert = useCharacterStore((state) => state.upsertSkill)
  const [draft, setDraft] = useState(skill)
  const field = (key: keyof Skill, label: string, type: 'text' | 'textarea' = 'text') => <EditorField label={label} value={String(draft[key] ?? '')} type={type} onChange={(value) => setDraft({ ...draft, [key]: value } as Skill)} />
  return <Modal title={skill.id ? 'Редактировать навык' : 'Новый навык'} onClose={onClose}><div className="editor-grid">{field('name', 'Название')}{field('difficulty', 'Сложность')}{field('actionType', 'Тип действия')}<label className="editor-field"><span>Статус</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Skill['status'] })}><option value="active">Активный</option><option value="passive">Пассивный</option><option value="reaction">Реакция</option></select></label>{field('summary', 'Кратко', 'textarea')}{field('mechanics', 'Механика', 'textarea')}{field('condition', 'Условие', 'textarea')}{field('requirement', 'Требование', 'textarea')}<TagInput label="Теги" value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} /></div><ImageInput value={draft.imageId} onChange={(imageId) => setDraft({ ...draft, ...(imageId ? { imageId } : { imageId: undefined }) })} /><button className="button primary" type="button" onClick={() => { upsert({ ...draft, id: draft.id || newId() }); onClose() }}>Сохранить навык</button></Modal>
}

function InventoryPage() {
  const state = useCharacterStore()
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const duplicate = async (item: Item) => {
    const copiedImageId = await cloneImage(item.imageId)
    state.upsertItem({ ...item, id: newId(), name: `${item.name} — копия`, ...(copiedImageId ? { imageId: copiedImageId } : {}) })
    setNotice(`Создана копия предмета «${item.name}».`)
  }
  return <div className="page-stack"><section className="currency-grid">{currencies.map(({ key, label, ratio, tone }) => <Card key={key} className={`currency ${tone}`}><div className="currency-heading"><p className="eyebrow">{label}</p>{ratio && <span>{ratio}</span>}</div><Counter label={`${label}: количество`} value={state.currencies[key]} onChange={(value) => state.setCurrency(key, value)} onAdjust={(delta) => state.adjustCurrency(key, delta)} steps={[1, 10, 100]} /></Card>)}</section><section className="page-toolbar"><p className="page-intro">Валюта хранится отдельно от предметов и не конвертируется автоматически.</p><button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={16} />Добавить предмет</button></section>{notice && <p className="notice" role="status">{notice}</p>}{state.inventory.length ? <section className="inventory-grid">{state.inventory.map((item) => <Card key={item.id} className="item-card"><ImageFrame imageId={item.imageId} label={item.name} className="item-image" /><div className="section-title"><div><p className="eyebrow">{item.category || 'Категория не указана'}</p><h3>{item.name}</h3></div>{item.equipped && <span className="equipped">Экипировано</span>}</div><p className="quiet">Количество: <strong>{noValue(item.quantity)}</strong></p><dl className="details-grid">{item.damage && <Detail label="Урон" value={item.damage} />}{item.damageType && <Detail label="Тип урона" value={item.damageType} />}{item.range && <Detail label="Дальность" value={item.range} />}{item.cost && <Detail label="Стоимость" value={item.cost} />}</dl>{(item.description || item.note || item.properties) && <p className="item-summary">{item.description || item.note || item.properties}</p>}<CardActions itemName={item.name} leftAction={<button className={item.equipped ? 'unequip-item' : 'equip-item'} type="button" aria-label={`${item.equipped ? 'Снять' : 'Экипировать'} ${item.name}`} onClick={() => { state.toggleItemEquipped(item.id); setNotice(item.equipped ? `Предмет «${item.name}» снят.` : `Предмет «${item.name}» экипирован.`) }}>{item.equipped ? 'Снять' : 'Экипировать'}</button>} onEdit={() => setEditing(item)} onDuplicate={() => void duplicate(item)} onDelete={() => { if (window.confirm(`Удалить «${item.name}»?`)) { state.deleteItem(item.id); setNotice(`Предмет «${item.name}» удалён.`) } }} /></Card>)}</section> : <EmptyState title="Инвентарь пуст" text="Добавьте первый предмет — он будет сохранён на устройстве." />}{editing && <ItemEditor item={editing === 'new' ? blankItem() : editing} onClose={() => setEditing(null)} />}</div>
}

function ItemEditor({ item, onClose }: { item: Item; onClose: () => void }) {
  const upsert = useCharacterStore((state) => state.upsertItem)
  const [draft, setDraft] = useState(item)
  const field = (key: keyof Item, label: string, type: 'text' | 'textarea' = 'text') => <EditorField label={label} value={String(draft[key] ?? '')} type={type} onChange={(value) => setDraft({ ...draft, [key]: value } as Item)} />
  return <Modal title={item.id ? 'Редактировать предмет' : 'Новый предмет'} onClose={onClose}><div className="editor-grid">{field('name', 'Название')}{field('category', 'Категория')}{field('quantity', 'Количество')}{field('damage', 'Урон')}{field('damageType', 'Тип урона')}{field('range', 'Дальность')}{field('cost', 'Стоимость')}{field('properties', 'Свойства', 'textarea')}{field('description', 'Описание', 'textarea')}{field('note', 'Заметки', 'textarea')}<label className="check"><input type="checkbox" checked={draft.equipped} onChange={(event) => setDraft({ ...draft, equipped: event.target.checked })} />Экипировано</label></div><ImageInput value={draft.imageId} onChange={(imageId) => setDraft({ ...draft, ...(imageId ? { imageId } : { imageId: undefined }) })} /><button className="button primary" type="button" onClick={() => { upsert({ ...draft, id: draft.id || newId() }); onClose() }}>Сохранить предмет</button></Modal>
}

function CharacterPage() {
  const state = useCharacterStore()
  const fields: Array<[string, string]> = [['race', 'Раса'], ['raceSubtype', 'Подвид'], ['classBackground', 'Класс/предыстория'], ['alignment', 'Мировоззрение'], ['profession', 'Профессия'], ['masteryMagic', 'Мастерство/Магия'], ['age', 'Возраст'], ['height', 'Рост'], ['weight', 'Вес'], ['eyes', 'Глаза'], ['hair', 'Волосы'], ['skin', 'Кожа']]
  return <div className="page-stack"><section className="profile-card"><Avatar name={state.profile.name} imageId={state.profile.avatarId} className="profile-avatar" /><div><FieldValue label="Имя персонажа" value={state.profile.name} onChange={(value) => state.setProfile('name', value)} editable={state.editing} heading /><p className="quiet">Аватар сохраняется на этом устройстве вместе с листом.</p>{state.editing && <ImageInput value={state.profile.avatarId} onChange={(imageId) => state.setProfile('avatarId', imageId ?? '')} />}</div></section><section className="profile-grid">{fields.map(([key, label]) => <FieldValue key={key} label={label} value={state.profile[key] ?? ''} onChange={(value) => state.setProfile(key, value)} editable={state.editing} />)}</section><section className="collections"><EntryCollection title="Языки" collection="languages" /><EntryCollection title="Владения" collection="proficiencies" /><EntryCollection title="Магические элементы" collection="elements" /></section><section className="text-grid">{[['traits', 'Черты'], ['ideals', 'Идеалы'], ['bonds', 'Привязанности'], ['weaknesses', 'Слабости'], ['backstory', 'Предыстория персонажа']].map(([key, label]) => <TextValue key={key} label={label} value={state.profile[key] ?? ''} editable={state.editing} onChange={(value) => state.setProfile(key, value)} />)}</section></div>
}

function EntryCollection({ title, collection }: { title: string; collection: 'languages' | 'proficiencies' | 'elements' }) {
  const state = useCharacterStore()
  const entries = state[collection]
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const save = () => {
    if (!draft.trim()) return
    state.upsertEntry(collection, { id: newId(), name: draft.trim() })
    setDraft('')
    setAdding(false)
  }
  return <Card className="collection"><div className="section-title"><h3>{title}</h3>{state.editing && <button className="button ghost small" type="button" onClick={() => setAdding(true)}><Plus size={15} />Добавить</button>}</div><div className="chips">{entries.length ? entries.map((entry) => <span key={entry.id} className="chip">{state.editing ? <input aria-label={`${title}: ${entry.name}`} value={entry.name} onChange={(event) => state.upsertEntry(collection, { ...entry, name: event.target.value })} /> : entry.name}{state.editing && <button type="button" aria-label={`Удалить ${entry.name}`} onClick={() => state.deleteEntry(collection, entry.id)}>×</button>}</span>) : <span className="quiet">Не указано</span>}</div>{adding && <div className="add-line"><input autoFocus aria-label={`Новый: ${title}`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save() }} /><button className="button primary" type="button" onClick={save}>Сохранить</button></div>}</Card>
}

function NotesPage() {
  const state = useCharacterStore()
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [expanded, setExpanded] = useState<Note | null>(null)
  const [tagFilter, setTagFilter] = useState('')
  const [notice, setNotice] = useState('')
  const notes = state.notes.filter((note) => !tagFilter || note.tags.includes(tagFilter))
  const tags = [...new Set(state.notes.flatMap((note) => note.tags))]

  return <div className="page-stack"><section className="page-toolbar"><div><p className="eyebrow">Игровые заметки</p><h2>Заметки сессии</h2></div><button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={16} />Новая заметка</button></section>{tags.length > 0 && <div className="tag-filter"><button type="button" className={!tagFilter ? 'active' : ''} onClick={() => setTagFilter('')}>Все теги</button>{tags.map((tag) => <button type="button" key={tag} className={tagFilter === tag ? 'active' : ''} onClick={() => setTagFilter(tag)}>{tag}</button>)}</div>}{notice && <p className="notice" role="status">{notice}</p>}{notes.length ? <section className="notes-grid">{notes.map((note) => <Card key={note.id} className="note-card">{note.imageId && <ImageFrame imageId={note.imageId} label={note.title} className="note-image" />}<button className="note-open" type="button" onClick={() => setExpanded(note)}><p className="eyebrow">{new Date(note.updatedAt).toLocaleDateString('ru-RU')}</p><h3>{note.title || 'Без названия'}</h3><p>{note.body || 'Пустая заметка'}</p></button><div className="note-tags">{note.tags.map((tag) => <button type="button" key={tag} onClick={() => setTagFilter(tag)}>{tag}</button>)}</div><CardActions itemName={note.title || 'заметка'} onEdit={() => setEditing(note)} onDuplicate={() => { const copy: Note = { ...note, id: newId(), title: `${note.title || 'Заметка'} — копия`, imageId: note.imageId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; state.upsertNote(copy); setNotice(`Создана копия заметки «${note.title || 'Без названия'}».`) }} onDelete={() => { if (window.confirm(`Удалить заметку «${note.title || 'Без названия'}»?`)) { state.deleteNote(note.id); setNotice('Заметка удалена.') } }} /></Card>)}</section> : <EmptyState title="Заметок пока нет" text={tagFilter ? 'Для этого тега заметок нет.' : 'Создайте первую заметку для событий, NPC и планов сессии.'} />}{editing && <NoteEditor note={editing === 'new' ? blankNote() : editing} onClose={() => setEditing(null)} />}{expanded && <Modal title={expanded.title || 'Заметка'} onClose={() => setExpanded(null)}>{expanded.imageId && <ImageFrame imageId={expanded.imageId} label={expanded.title} className="detail-image" />}<div className="note-tags">{expanded.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><p className="note-full">{expanded.body || 'Пустая заметка'}</p><button className="button ghost" type="button" onClick={() => { setEditing(expanded); setExpanded(null) }}><Pencil size={16} />Редактировать</button></Modal>}</div>
}

function NoteEditor({ note, onClose }: { note: Note; onClose: () => void }) {
  const upsert = useCharacterStore((state) => state.upsertNote)
  const [draft, setDraft] = useState(note)
  return <Modal title={note.id ? 'Редактировать заметку' : 'Новая заметка'} onClose={onClose}><div className="editor-grid note-editor-grid"><EditorField label="Заголовок" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} /><EditorField label="Текст заметки" value={draft.body} type="textarea" onChange={(body) => setDraft({ ...draft, body })} /><TagInput label="Теги" value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} /></div><ImageInput value={draft.imageId} onChange={(imageId) => setDraft({ ...draft, ...(imageId ? { imageId } : { imageId: undefined }) })} /><button className="button primary" type="button" onClick={() => { upsert({ ...draft, title: draft.title.trim() || 'Без названия', updatedAt: new Date().toISOString() }); onClose() }}>Сохранить заметку</button></Modal>
}

function SettingsPage() {
  const state = useCharacterStore()
  const [message, setMessage] = useState('')
  const exportData = () => {
    const blob = new Blob([serializeCharacter(snapshot(state))], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'dnd-mge-character.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      state.importData(await file.text())
      setMessage('Данные импортированы и мигрированы без сброса листа.')
    } catch {
      setMessage('Не удалось импортировать файл: нужен корректный JSON листа персонажа.')
    }
    input.value = ''
  }
  return <div className="page-stack settings-page"><Card><p className="eyebrow">Оформление</p><h2>Тема интерфейса</h2><div className="theme-options"><button type="button" className={state.settings.themeMode === 'dark' ? 'active' : ''} aria-pressed={state.settings.themeMode === 'dark'} onClick={() => state.setSetting('themeMode', 'dark')}><Moon size={17} />Тёмная</button><button type="button" className={state.settings.themeMode === 'light' ? 'active' : ''} aria-pressed={state.settings.themeMode === 'light'} onClick={() => state.setSetting('themeMode', 'light')}><Sun size={17} />Светлая</button></div><p className="setting-label">Акцентный цвет</p><div className="accent-options">{accentOptions.map(([value, label]) => <button key={value} type="button" className={`accent-swatch ${value} ${state.settings.accentColor === value ? 'active' : ''}`} aria-label={`Акцент: ${label}`} aria-pressed={state.settings.accentColor === value} onClick={() => state.setSetting('accentColor', value)}><span />{label}</button>)}</div></Card><Card><p className="eyebrow">Опыт и уровень</p><h2>Правило повышения</h2><p className="quiet">Максимальный уровень — 25. На каждом уровне показывается опыт, необходимый для следующего.</p><label className="check"><input type="radio" checked={state.settings.levelUpBehavior === 'carry'} onChange={() => state.setSetting('levelUpBehavior', 'carry')} />Переносить избыток опыта</label><label className="check"><input type="radio" checked={state.settings.levelUpBehavior === 'reset'} onChange={() => state.setSetting('levelUpBehavior', 'reset')} />Сбрасывать опыт в ноль</label><label className="check"><input type="checkbox" checked={state.settings.allowNegativeMana} onChange={(event) => state.setSetting('allowNegativeMana', event.target.checked)} />Разрешить отрицательную ману</label></Card><Card><p className="eyebrow">Данные</p><h2>Резервная копия</h2><p className="quiet">JSON содержит данные листа. Загруженные изображения остаются в этом браузере и не входят в JSON; история бросков также не экспортируется.</p><div className="button-row"><button className="button primary" type="button" onClick={exportData}><Download size={16} />Экспорт JSON</button><label className="button ghost"><Upload size={16} />Импорт JSON<input hidden type="file" accept="application/json" onChange={importData} /></label><button className="button ghost" type="button" onClick={() => { void db.snapshots.put({ id: 'character', value: snapshot(state) }); setMessage('Текущий лист сохранён локально в этом браузере.') }}>Сохранить локально</button></div><button className="danger" type="button" onClick={() => { if (window.confirm('Сбросить лист к исходным данным? Это не удаляет изображения из IndexedDB.')) { state.reset(); setMessage('Восстановлены исходные данные.') } }}>Сбросить к исходным данным</button>{message && <p className="notice" role="status">{message}</p>}</Card></div>
}

function DicePanel({ onClose }: { onClose: () => void }) {
  const state = useCharacterStore()
  const [selection, setSelection] = useState<Record<string, number>>({})
  const [dice, setDice] = useState(baseDice)
  const [customFaces, setCustomFaces] = useState('')
  const [message, setMessage] = useState('')
  const addCustomDie = () => {
    const faces = Number(customFaces)
    if (!Number.isInteger(faces) || faces < 2) {
      setMessage('Укажите целое число граней не меньше 2.')
      return
    }
    const die = `d${faces}`
    setDice((current) => current.includes(die) ? current : [...current, die])
    setCustomFaces('')
    setMessage(`${die} добавлен в этот бросок.`)
  }
  const roll = () => {
    if (!Object.values(selection).some((value) => value > 0)) {
      setMessage('Выберите хотя бы один кубик.')
      return
    }
    state.addRoll(selection)
    setMessage('Бросок сохранён в историю.')
  }
  return <Modal title="Бросок кубиков" onClose={onClose}><p className="page-intro">Укажите количество каждого кубика: кнопки меняют число на 1, поле позволяет ввести значение вручную.</p><div className="dice-grid">{dice.map((die) => <section key={die} className="dice-choice"><div><strong>{die}</strong><span>{Number(die.slice(1))} граней</span></div><Counter label={`${die}: количество`} value={selection[die] ?? 0} onChange={(value) => setSelection({ ...selection, [die]: Math.max(0, value) })} onAdjust={(delta) => setSelection({ ...selection, [die]: Math.max(0, (selection[die] ?? 0) + delta) })} /></section>)}</div><div className="custom-die"><label><span>Пользовательский кубик</span><input aria-label="Количество граней пользовательского кубика" type="number" min="2" placeholder="Например, 30" value={customFaces} onChange={(event) => setCustomFaces(event.target.value)} /></label><button className="button ghost" type="button" onClick={addCustomDie}>Добавить dN</button></div><div className="button-row"><button className="button primary" type="button" onClick={roll}>Бросить</button><button className="button ghost" type="button" onClick={() => { setSelection({}); setMessage('Выбор кубиков очищен.') }}>Очистить выбор</button></div>{message && <p className="notice" role="status">{message}</p>}<section className="roll-history"><div className="section-title"><div><p className="eyebrow">История</p><h3>Последние броски</h3></div>{state.diceHistory.length > 0 && <button className="button ghost" type="button" onClick={state.clearRolls}>Очистить историю</button>}</div>{state.diceHistory.length ? <ol>{state.diceHistory.map((roll) => <li key={roll.id}><div className="roll-groups">{Object.entries(roll.results).filter(([, results]) => results.length).map(([die, results]) => <div className="roll-group" key={die}><span>{results.length} × {die}</span><strong>{results.join(' + ')}</strong><em> = {results.reduce((sum, result) => sum + result, 0)}</em></div>)}</div><b>Итого: {roll.total}</b></li>)}</ol> : <p className="quiet">Здесь появятся до 10 последних бросков.</p>}</section></Modal>
}

function blankSpell(): Spell {
  return { id: '', name: '', elements: [], characteristic: '', components: '', castingTime: '', target: '', range: '', duration: '', manaCost: null, damageOrHealing: '', difficulty: '', level: '', summary: '', description: '', effects: '', restrictions: '', tags: [], requiresConcentration: false, actionType: '' }
}

function blankSkill(): Skill {
  return { id: '', name: '', difficulty: '', actionType: '', summary: '', mechanics: '', condition: '', requirement: '', status: 'active', tags: [] }
}

function blankItem(): Item {
  return { id: '', name: '', category: '', quantity: '1', damage: '', damageType: '', range: '', properties: '', cost: '', description: '', equipped: false, note: '' }
}

function blankNote(): Note {
  const timestamp = new Date().toISOString()
  return { id: newId(), title: '', body: '', tags: [], createdAt: timestamp, updatedAt: timestamp }
}

export default App
