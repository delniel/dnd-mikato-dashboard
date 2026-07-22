import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArchiveRestore, ArrowLeft, ArrowRight, BookOpen, ChevronDown, Copy, Dices, Download, FileArchive, Heart, Moon, Package, Pencil, Plus, Save, Settings, Shield, Sparkles, Star, Sun, Swords, Trash2, Upload, UserRound, Users, WandSparkles, X, type LucideIcon } from 'lucide-react'
import { createJsonBackup, createLibraryBackup, materializeImportedCharacter, parseJsonBackup, restoreLibraryBackup, type BackupScope, type PreparedBackupImport } from './backup'
import { cloneImage, loadImage, loadImages, loadLibrary, removeImages, saveImage, saveImages, saveLibrary, type ImageRecord } from './db'
import { createBlankCharacter } from './data'
import { manaRecoveryAmount, thresholdForLevel, type CharacterState, type CurrencyKey, type Item, type Note, type ResourceKey, type Skill, type Spell } from './domain'
import { calculateCombatState, combatCategories, combatCategoryLabels, combatDurationLabels, combatDurationTypes, combatOperationLabels, combatOperationSymbols, combatOperations, describeCombatDuration, formatCombatNumber, type CombatCalculation, type CombatCategory, type CombatEffect, type CombatModifier, type CombatOperation } from './combat'
import { addCharacter, characterForActivation, collectCharacterImageIds, createCharacterLibrary, createCharacterRecord, deleteCharacter, getActiveCharacter, renameCharacter, sanitizeFilename, selectCharacter as selectLibraryCharacter, syncActiveCharacter, type CharacterLibrary, type CharacterRecord } from './library'
import { librarySnapshot, useLibraryStore } from './libraryStore'
import { useCharacterStore } from './store'

type Page = 'Обзор' | 'Бой' | 'Характеристики' | 'Заклинания и Способности' | 'Навыки +' | 'Инвентарь' | 'Персонаж' | 'Заметки' | 'Настройки'

const pages: { page: Page; icon: LucideIcon }[] = [
  { page: 'Обзор', icon: Shield },
  { page: 'Бой', icon: Swords },
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
const currencyExchanges: Record<CurrencyKey, Array<{ from: CurrencyKey; to: CurrencyKey; label: string; direction: 'left' | 'right' }>> = {
  PP: [{ from: 'PP', to: 'GP', label: '1 ПМ → 10 ЗМ', direction: 'right' }],
  GP: [{ from: 'GP', to: 'PP', label: '10 ЗМ → 1 ПМ', direction: 'left' }, { from: 'GP', to: 'SP', label: '1 ЗМ → 10 СМ', direction: 'right' }],
  SP: [{ from: 'SP', to: 'GP', label: '10 СМ → 1 ЗМ', direction: 'left' }, { from: 'SP', to: 'CP', label: '1 СМ → 10 ММ', direction: 'right' }],
  CP: [{ from: 'CP', to: 'SP', label: '10 ММ → 1 СМ', direction: 'left' }],
}
const accentOptions = [
  ['red', 'Красный'], ['blue', 'Синий'], ['cyan', 'Голубой'], ['green', 'Зелёный'], ['purple', 'Фиолетовый'], ['pink', 'Розовый'], ['yellow', 'Жёлтый'],
] as const
const editablePages = new Set<Page>(['Обзор', 'Характеристики', 'Персонаж'])
const passiveSenseLabels: Record<string, string> = {
  Восприятие: 'Пассивное Восприятие',
  Проницательность: 'Пассивная Проницательность',
  Анализ: 'Пассивный Анализ',
}
const combatEffectSectionTitles: Record<CombatCategory, string> = {
  positive: 'Положительные эффекты',
  negative: 'Отрицательные эффекты',
  special: 'Особые эффекты',
}
const baseDice = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd16', 'd20', 'd100']
const newId = () => crypto.randomUUID()
const noValue = (value: string) => value.trim() || 'Не указано'

function App() {
  const state = useCharacterStore()
  const setCharacter = useCharacterStore((store) => store.setCharacter)
  const library = useLibraryStore()
  const replaceLibrary = useLibraryStore((store) => store.replaceLibrary)
  const [page, setPage] = useState<Page>('Обзор')
  const [hydrated, setHydrated] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [diceOpen, setDiceOpen] = useState(false)
  const [charactersOpen, setCharactersOpen] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [libraryNotice, setLibraryNotice] = useState('')
  const saved = useMemo(() => snapshot(state), [state])

  useEffect(() => {
    loadLibrary()
      .then((record) => {
        const next = record?.value ?? createCharacterLibrary(snapshot(useCharacterStore.getState()))
        replaceLibrary(next)
        const active = next.activeCharacterId ? characterForActivation(next, next.activeCharacterId) : null
        if (active) setCharacter(active)
        setStorageReady(true)
        setHydrated(true)
      })
      .catch(() => {
        setStorageError('Не удалось прочитать локальные данные. Автосохранение отключено, чтобы не перезаписать существующую библиотеку.')
        setHydrated(true)
      })
  }, [replaceLibrary, setCharacter])

  useEffect(() => {
    if (!hydrated || !storageReady) return
    const next = syncActiveCharacter(librarySnapshot(), saved)
    replaceLibrary(next)
    void saveLibrary(next).catch(() => setLibraryNotice('Не удалось сохранить библиотеку персонажей. Предыдущая копия не удалена.'))
  }, [hydrated, replaceLibrary, saved, storageReady])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.themeMode
    document.documentElement.dataset.accent = state.settings.accentColor
  }, [state.settings.themeMode, state.settings.accentColor])

  const selectPage = (nextPage: Page) => {
    if (!editablePages.has(nextPage)) state.setEditing(false)
    setPage(nextPage)
  }

  const persistCurrent = async (): Promise<CharacterLibrary> => {
    if (!storageReady) throw new Error('Локальное хранилище недоступно')
    const next = syncActiveCharacter(librarySnapshot(), snapshot(useCharacterStore.getState()))
    await saveLibrary(next)
    replaceLibrary(next)
    return next
  }

  const activate = async (id: string) => {
    if (id === librarySnapshot().activeCharacterId) return
    setLibraryBusy(true)
    try {
      const persisted = await persistCurrent()
      const next = selectLibraryCharacter(persisted, id)
      const character = characterForActivation(next, id)
      if (!character) return
      await saveLibrary(next)
      replaceLibrary(next); setCharacter(character); state.setEditing(false); setLibraryNotice('Персонаж переключён.')
    } catch { setLibraryNotice('Не удалось переключить персонажа: текущие данные оставлены открытыми.') }
    finally { setLibraryBusy(false) }
  }

  const createNewCharacter = async () => {
    if (libraryBusy) return
    const name = window.prompt('Имя нового персонажа:', 'Новый персонаж')?.trim()
    if (!name) return
    setLibraryBusy(true)
    try {
      const persisted = await persistCurrent()
      const next = addCharacter(persisted, createCharacterRecord(createBlankCharacter(), { name }))
      await saveLibrary(next); replaceLibrary(next)
      const character = next.activeCharacterId ? characterForActivation(next, next.activeCharacterId) : null
      if (character) setCharacter(character)
      setLibraryNotice(`Создан персонаж «${name}».`)
    } catch { setLibraryNotice('Не удалось создать персонажа.') }
    finally { setLibraryBusy(false) }
  }

  const renameManagedCharacter = async (id: string) => {
    const source = librarySnapshot().characters[id]
    if (!source) return
    const name = window.prompt('Новое имя персонажа:', source.name)?.trim()
    if (!name) return
    setLibraryBusy(true)
    try {
      const persisted = await persistCurrent()
      const next = renameCharacter(persisted, id, name)
      await saveLibrary(next); replaceLibrary(next)
      if (next.activeCharacterId === id) { const data = characterForActivation(next, id); if (data) setCharacter(data) }
      setLibraryNotice(`Персонаж переименован в «${name}».`)
    } catch { setLibraryNotice('Не удалось переименовать персонажа.') }
    finally { setLibraryBusy(false) }
  }

  const duplicateManagedCharacter = async (id: string) => {
    if (libraryBusy) return
    setLibraryBusy(true)
    try {
      const persisted = await persistCurrent(); const source = persisted.characters[id]
      if (!source) return
      const ids = collectCharacterImageIds(source.data); const records = (await loadImages(ids)).filter((record): record is NonNullable<typeof record> => Boolean(record))
      const copySource: CharacterRecord = { ...source, name: `${source.name} — копия`, data: { ...structuredClone(source.data), profile: { ...source.data.profile, name: `${source.name} — копия` } } }
      const materialized = materializeImportedCharacter(copySource, records)
      if (materialized.images.length) await saveImages(materialized.images)
      const next = addCharacter(persisted, materialized.character)
      await saveLibrary(next); replaceLibrary(next)
      const data = next.activeCharacterId ? characterForActivation(next, next.activeCharacterId) : null
      if (data) setCharacter(data)
      setLibraryNotice(`Создана независимая копия «${source.name}».`)
    } catch { setLibraryNotice('Не удалось дублировать персонажа.') }
    finally { setLibraryBusy(false) }
  }

  const deleteManagedCharacter = async (id: string) => {
    if (libraryBusy) return
    const source = librarySnapshot().characters[id]
    if (!source || !window.confirm(`Удалить персонажа “${source.name}”? Это действие удалит его данные и локальные изображения.`)) return
    setLibraryBusy(true)
    try {
      const persisted = await persistCurrent()
      const currentSource = persisted.characters[id]
      if (!currentSource) return
      const removedIds = collectCharacterImageIds(currentSource.data)
      const next = deleteCharacter(persisted, id)
      await saveLibrary(next); replaceLibrary(next)
      const data = next.activeCharacterId ? characterForActivation(next, next.activeCharacterId) : null
      if (data) setCharacter(data)
      setLibraryNotice(`Персонаж «${source.name}» удалён.`)
      const used = new Set(Object.values(next.characters).flatMap((character) => collectCharacterImageIds(character.data)))
      void removeImages(removedIds.filter((imageId) => !used.has(imageId))).catch(() => setLibraryNotice(`Персонаж «${source.name}» удалён, но часть неиспользуемых изображений очистить не удалось.`))
    } catch { setLibraryNotice('Не удалось удалить персонажа. Существующая библиотека сохранена.') }
    finally { setLibraryBusy(false) }
  }

  const content = page === 'Обзор'
    ? <Overview />
    : page === 'Бой'
      ? <CombatPage />
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
                : <SettingsPage persistCurrent={persistCurrent} applySingleImport={async (prepared, replace) => {
                    const current = await persistCurrent(); const source = prepared.character
                    if (!source) throw new Error('Нет персонажа')
                    const targetId = replace ? current.activeCharacterId : crypto.randomUUID()
                    if (!targetId) throw new Error('Нет активного персонажа')
                    const materialized = materializeImportedCharacter(source, prepared.images, targetId)
                    materialized.character.data.settings = structuredClone(current.settings)
                    if (materialized.images.length) await saveImages(materialized.images)
                    const replacedImageIds = replace && current.activeCharacterId ? collectCharacterImageIds(current.characters[current.activeCharacterId].data) : []
                    let next = replace && current.activeCharacterId
                      ? { ...current, characters: { ...current.characters, [current.activeCharacterId]: materialized.character } }
                      : addCharacter(current, materialized.character)
                    next = { ...next, activeCharacterId: targetId }
                    await saveLibrary(next); replaceLibrary(next); const data = characterForActivation(next, targetId); if (data) setCharacter(data)
                    const used = new Set(Object.values(next.characters).flatMap((character) => collectCharacterImageIds(character.data)))
                    await removeImages(replacedImageIds.filter((id) => !used.has(id))).catch(() => undefined)
                  }} applyCollectionImport={async (prepared, mode, conflicts) => {
                    const incoming = prepared.library; if (!incoming) throw new Error('Нет коллекции')
                    const current = await persistCurrent(); let next = mode === 'replace' ? { ...incoming, characters: {}, characterOrder: [], activeCharacterId: null } : current
                    const newImages: ImageRecord[] = []; const replacedImageIds: string[] = mode === 'replace' ? Object.values(current.characters).flatMap((character) => collectCharacterImageIds(character.data)) : []
                    for (const oldId of incoming.characterOrder) {
                      const source = incoming.characters[oldId]; if (!source) continue
                      const exists = Boolean(next.characters[oldId])
                      if (mode === 'merge' && exists && conflicts === 'skip') continue
                      const targetId = mode === 'merge' && exists && conflicts === 'copy' ? crypto.randomUUID() : oldId
                      if (mode === 'merge' && exists && conflicts === 'replace') replacedImageIds.push(...collectCharacterImageIds(next.characters[oldId].data))
                      const ownedImages = prepared.images.filter((image) => !image.characterId || image.characterId === oldId)
                      const materialized = materializeImportedCharacter(source, ownedImages, targetId, mode === 'replace' || (exists && conflicts === 'replace'))
                      materialized.character.data.settings = structuredClone(next.settings)
                      newImages.push(...materialized.images)
                      next = { ...next, characters: { ...next.characters, [targetId]: materialized.character }, characterOrder: next.characterOrder.includes(targetId) ? next.characterOrder : [...next.characterOrder, targetId] }
                    }
                    next = { ...next, settings: mode === 'replace' ? incoming.settings : current.settings, activeCharacterId: mode === 'replace' ? (incoming.activeCharacterId && next.characters[incoming.activeCharacterId] ? incoming.activeCharacterId : next.characterOrder[0] ?? null) : current.activeCharacterId }
                    if (newImages.length) await saveImages(newImages)
                    await saveLibrary(next); replaceLibrary(next)
                    const data = next.activeCharacterId ? characterForActivation(next, next.activeCharacterId) : null; if (data) setCharacter(data)
                    const used = new Set(Object.values(next.characters).flatMap((character) => collectCharacterImageIds(character.data)))
                    await removeImages(replacedImageIds.filter((id) => !used.has(id))).catch(() => undefined)
                  }} resetCurrent={async () => {
                    const current = await persistCurrent(); const id = current.activeCharacterId; if (!id) return
                    const source = current.characters[id]; const removed = collectCharacterImageIds(source.data)
                    const reset = { ...createCharacterRecord(undefined, { id, name: source.name }), createdAt: source.createdAt }
                    const next = { ...current, characters: { ...current.characters, [id]: reset } }; await saveLibrary(next); replaceLibrary(next)
                    const data = characterForActivation(next, id); if (data) setCharacter(data)
                    const used = new Set(Object.values(next.characters).flatMap((character) => collectCharacterImageIds(character.data)))
                    await removeImages(removed.filter((imageId) => !used.has(imageId))).catch(() => undefined)
                  }} resetAll={async () => {
                    const current = await persistCurrent(); const removed = Object.values(current.characters).flatMap((character) => collectCharacterImageIds(character.data))
                    const next = createCharacterLibrary(); await saveLibrary(next); replaceLibrary(next)
                    const data = next.activeCharacterId ? characterForActivation(next, next.activeCharacterId) : null; if (data) setCharacter(data)
                    await removeImages(removed).catch(() => undefined)
                  }} />

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand />
        <Navigation active={page} onSelect={selectPage} />
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Лист персонажа · <a className="edition-link" href="https://dnd-mikato-edition.fandom.com/ru" target="_blank" rel="noreferrer">Микато Edition</a></p>
            <h1>{page}</h1>
          </div>
          <div className="top-actions"><CharacterSwitcher library={library} busy={libraryBusy} onSwitch={activate} onManage={() => setCharactersOpen(true)} onCreate={createNewCharacter} />{editablePages.has(page) && <><span className={state.editing ? 'mode-pill edit' : 'mode-pill'}>{state.editing ? 'Режим редактирования' : 'Игровой режим'}</span><ModeButton /></>}</div>
        </header>
        {storageError && <p className="notice error-notice library-notice" role="alert">{storageError}</p>}
        {libraryNotice && <p className="notice library-notice" role="status">{libraryNotice}</p>}
        {!hydrated ? <EmptyState title="Загрузка библиотеки…" text="Восстанавливаем локальные данные персонажей." /> : library.activeCharacterId ? <div key={library.activeCharacterId}>{content}</div> : <EmptyState title="Нет персонажей" text="Создайте первого персонажа, чтобы открыть лист." />}
      </section>
      <nav className="bottom-nav"><Navigation active={page} onSelect={selectPage} compact /></nav>
      <button className="dice-fab" type="button" aria-label="Открыть бросок кубиков" onClick={() => setDiceOpen(true)}><Dices /></button>
      {diceOpen && <DicePanel onClose={() => setDiceOpen(false)} />}
      {charactersOpen && <CharacterManager library={library} busy={libraryBusy} onClose={() => setCharactersOpen(false)} onOpen={(id) => { void activate(id); setCharactersOpen(false) }} onCreate={() => void createNewCharacter()} onRename={(id) => void renameManagedCharacter(id)} onDuplicate={(id) => void duplicateManagedCharacter(id)} onDelete={(id) => void deleteManagedCharacter(id)} />}
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
    combatEffects: state.combatEffects,
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

function CharacterSwitcher({ library, busy, onSwitch, onManage, onCreate }: { library: CharacterLibrary; busy: boolean; onSwitch: (id: string) => Promise<void>; onManage: () => void; onCreate: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const active = getActiveCharacter(library)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [open])
  return <div className="character-switcher" ref={rootRef}>
    <button ref={triggerRef} className="character-switcher-button" type="button" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>{active ? <><Avatar imageId={active.data.profile.avatarId} name={active.name} className="switcher-avatar" /><span><strong>{active.name}</strong><small>{active.data.profile.classBackground || `Уровень ${active.data.level}`}</small></span></> : <><Users size={18} /><span><strong>Нет персонажа</strong><small>Создайте первого</small></span></>}<ChevronDown size={16} /></button>
    {open && <div className="character-menu" role="menu">{library.characterOrder.map((id) => { const character = library.characters[id]; if (!character) return null; return <button type="button" role="menuitem" className={id === library.activeCharacterId ? 'active' : ''} key={id} onClick={() => { setOpen(false); void onSwitch(id) }}><Avatar imageId={character.data.profile.avatarId} name={character.name} className="menu-avatar" /><span><strong>{character.name}</strong><small>{character.data.profile.classBackground || `Уровень ${character.data.level}`} · HP {character.data.resources.hp.current}/{character.data.resources.hp.max}</small></span>{id === library.activeCharacterId && <b>Открыт</b>}</button> })}<div className="character-menu-actions"><button type="button" role="menuitem" onClick={() => { setOpen(false); onManage() }}><Users size={15} />Управление персонажами</button><button type="button" role="menuitem" onClick={() => { setOpen(false); void onCreate() }}><Plus size={15} />Создать персонажа</button></div></div>}
  </div>
}

function CharacterManager({ library, busy, onClose, onOpen, onCreate, onRename, onDuplicate, onDelete }: { library: CharacterLibrary; busy: boolean; onClose: () => void; onOpen: (id: string) => void; onCreate: () => void; onRename: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const [message, setMessage] = useState('')
  const exportCharacter = async (id: string) => {
    const character = library.characters[id]; if (!character) return
    setMessage('Создаю ZIP…')
    try {
      const scoped = { ...library, activeCharacterId: id }
      const backup = await createLibraryBackup(scoped, 'current')
      downloadBlob(backup.blob, `mikato-character-${sanitizeFilename(character.name)}-${new Date().toISOString().slice(0, 10)}.zip`)
      setMessage(`Экспортирован «${character.name}», изображений: ${backup.imageCount}.`)
    } catch { setMessage('Не удалось экспортировать персонажа.') }
  }
  return <Modal title="Персонажи" onClose={onClose}><div className="manager-heading"><p className="quiet">Каждый лист, его ресурсы, заметки и изображения сохраняются независимо.</p><button className="button primary" type="button" disabled={busy} onClick={onCreate}><Plus size={16} />Создать персонажа</button></div>{library.characterOrder.length ? <div className="character-manager-grid">{library.characterOrder.map((id) => { const character = library.characters[id]; if (!character) return null; return <Card className={id === library.activeCharacterId ? 'character-manager-card active' : 'character-manager-card'} key={id}><div className="character-manager-main"><Avatar imageId={character.data.profile.avatarId} name={character.name} /><div><p className="eyebrow">{id === library.activeCharacterId ? 'Сейчас открыт' : 'Персонаж'}</p><h3>{character.name}</h3><p>{character.data.profile.classBackground || 'Класс не указан'} · уровень {character.data.level}</p><small>HP {character.data.resources.hp.current}/{character.data.resources.hp.max} · обновлён {new Date(character.updatedAt).toLocaleString('ru-RU')}</small></div></div><div className="character-manager-actions"><button className="button primary small" type="button" disabled={busy || id === library.activeCharacterId} onClick={() => onOpen(id)}>Открыть</button><button className="button ghost small" type="button" onClick={() => onRename(id)}><Pencil size={14} />Переименовать</button><button className="button ghost small" type="button" disabled={busy} onClick={() => onDuplicate(id)}><Copy size={14} />Дублировать</button><button className="button ghost small" type="button" disabled={busy} onClick={() => void exportCharacter(id)}><FileArchive size={14} />Экспортировать</button><button className="button ghost small delete-character" type="button" onClick={() => onDelete(id)}><Trash2 size={14} />Удалить</button></div></Card> })}</div> : <EmptyState title="Персонажей пока нет" text="Создайте первого персонажа, чтобы начать работу." />}{message && <p className="notice" role="status">{message}</p>}</Modal>
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href)
}

function ModeButton() {
  const { editing, setEditing } = useCharacterStore()
  return <button type="button" className={editing ? 'button primary' : 'button ghost'} onClick={() => setEditing(!editing)}>{editing ? <><Save size={16} />Сохранить и закрыть</> : <><Pencil size={16} />Редактировать</>}</button>
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`card ${className}`}>{children}</article>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeRef.current(); return }
      if (event.key !== 'Tab') return
      const entries = focusable(); if (!entries.length) return
      const first = entries[0]; const last = entries[entries.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])

  return <div className="drawer-backdrop" onMouseDown={onClose}><section ref={dialogRef} className="drawer editor-drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><button className="close" type="button" aria-label="Закрыть" onClick={onClose}><X /></button><h2>{title}</h2>{children}</section></div>
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
  return <div className={adjustable ? `counter ${steps.length > 1 ? `counter-steps counter-steps-${steps.length}` : ''}` : 'counter input-only'}>{adjustable && [...steps].reverse().map((step) => <button key={`minus-${step}`} type="button" aria-label={`${label}: минус ${step}`} onClick={() => onAdjust?.(-step)}>−{step}</button>)}<input aria-label={label} type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />{adjustable && steps.map((step) => <button key={`plus-${step}`} type="button" aria-label={`${label}: плюс ${step}`} onClick={() => onAdjust?.(step)}>+{step}</button>)}</div>
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
      <ResourceCard title="Хиты" caption="HP" color="hp" resourceKey="hp" editMaximum />
      <ResourceCard title="Мана" caption="Энергия" color="mana" resourceKey="mana" editMaximum />
      <ResourceCard title="Превосходство" caption="Ресурс" color="bone" resourceKey="superiority" />
    </section>

    {state.recentAction && <button className="undo-banner" type="button" onClick={state.undo}><ArchiveRestore size={17} />Отменить: {state.recentAction.label}</button>}

    <section className="overview-grid">
      <OverviewStats title="Параметры боя" values={[['КД', 'armorClass'], ['Скорость', 'speed'], ['Инициатива', 'initiative'], ['Бонус владения', 'proficiency']]} />
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

function ResourceCard({ title, caption, color, resourceKey, interactive = false, editMaximum = false }: { title: string; caption: string; color: string; resourceKey: ResourceKey; interactive?: boolean; editMaximum?: boolean }) {
  const state = useCharacterStore()
  const resource = state.resources[resourceKey]
  const dieType = state.resources.superiority.dieType ?? ''
  return <Card className={`resource ${color}`}>
    <div className="resource-heading"><div><p className="eyebrow">{caption}</p><h3>{title}</h3></div><strong>{resourceKey === 'hp' && (resource.temporary ?? 0) > 0 ? `${resource.current} + ${resource.temporary} / ${resource.max}` : `${resource.current} / ${resource.max}`}</strong></div>
    {resourceKey === 'superiority' && (state.editing
      ? <FieldValue label="Кость превосходства" value={dieType} onChange={state.setSuperiorityDie} editable />
      : <p className="resource-detail"><span>Кость превосходства</span><strong>{noValue(dieType)}</strong></p>)}
    {resourceKey === 'hp' ? <HpProgress current={resource.current} temporary={resource.temporary ?? 0} max={resource.max} /> : <Progress value={resource.current} max={resource.max} color={color} />}
    {interactive && <Counter label={`${title}: текущее значение`} value={resource.current} onChange={(value) => state.setResource(resourceKey, value)} onAdjust={(delta) => state.adjust(resourceKey, delta)} steps={resourceKey === 'superiority' ? [1] : [1, 5, 10]} />}
    {interactive && resourceKey === 'mana' && <button className="button ghost resource-action" type="button" disabled={manaRecoveryAmount(state.profile.manaRecovery ?? '') <= 0 || resource.current >= resource.max} onClick={state.recoverMana}><ArchiveRestore size={16} />Восстановление маны (+{manaRecoveryAmount(state.profile.manaRecovery ?? '')})</button>}
    {interactive && resourceKey === 'hp' && <div className="temporary-hp"><span>Временные хиты</span><Counter label="Временные хиты" value={resource.temporary ?? 0} onChange={state.setTemporaryHp} onAdjust={(delta) => state.setTemporaryHp((resource.temporary ?? 0) + delta)} steps={[1, 5, 10]} /></div>}
    {editMaximum && state.editing && <div className="resource-max"><FieldValue label={`${title}: максимум`} value={String(resource.max)} onChange={(value) => state.setResourceMax(resourceKey, Number(value))} editable /></div>}
  </Card>
}

function OverviewStats({ title, values }: { title: string; values: Array<[string, string]> }) {
  const state = useCharacterStore()
  return <Card className="overview-stats"><p className="eyebrow">Показатели</p><h3>{title}</h3><div className={`stat-row stat-row-${values.length}`}>{values.map(([label, key]) => state.editing ? <FieldValue key={key} label={label} value={state.profile[key] ?? ''} onChange={(value) => state.setProfile(key, value)} editable /> : <div className="stat-value" key={key}><span>{label}</span><strong>{noValue(state.profile[key] ?? '')}</strong></div>)}</div></Card>
}

function HpProgress({ current, temporary, max }: { current: number; temporary: number; max: number }) {
  const total = Math.max(1, max + temporary)
  return <div className="progress hp-progress" aria-label={`${current} обычных и ${temporary} временных хитов из ${max}`}><span className="hp" style={{ width: `${Math.max(0, current) / total * 100}%` }} /><span className="temporary" style={{ width: `${Math.max(0, temporary) / total * 100}%` }} /></div>
}

function CombatPage() {
  const state = useCharacterStore()
  const calculations = calculateCombatState(state)
  const combatCalculations = calculations.filter((calculation) => calculation.target.group === 'combat')
  const abilityCalculations = state.characteristics.map((characteristic) => ({
    id: characteristic.id,
    name: characteristic.name,
    calculations: {
      score: calculations.find((calculation) => calculation.target.id === `characteristic.${characteristic.id}.score`),
      check: calculations.find((calculation) => calculation.target.id === `characteristic.${characteristic.id}.check`),
      save: calculations.find((calculation) => calculation.target.id === `characteristic.${characteristic.id}.save`),
    },
  }))
  const [editingEffect, setEditingEffect] = useState<CombatEffect | 'new' | null>(null)
  const [calculationDetail, setCalculationDetail] = useState<CombatCalculation | null>(null)
  const [spellDetail, setSpellDetail] = useState<Spell | null>(null)
  const [skillDetail, setSkillDetail] = useState<Skill | null>(null)
  const [itemDetail, setItemDetail] = useState<Item | null>(null)
  const equipped = state.inventory.filter((item) => item.equipped && (item.damage || item.range || /оруж/i.test(item.category)))
  const quickSpells = [...state.spells].sort((left, right) => Number(state.favorites.includes(right.id)) - Number(state.favorites.includes(left.id)))
  const quickSkills = state.skills.filter((skill) => skill.status !== 'passive').concat(state.skills.filter((skill) => skill.status === 'passive'))

  return <div className="page-stack combat-page">
    <section className="combat-section">
      <div className="section-title"><div><p className="eyebrow">Общие данные персонажа</p><h2>Боевые ресурсы</h2></div><span className="mode-pill">Максимумы изменяются в основных параметрах</span></div>
      <div className="resource-grid combat-resources">
        <ResourceCard title="Хиты" caption="HP" color="hp" resourceKey="hp" interactive />
        <ResourceCard title="Мана" caption="Энергия" color="mana" resourceKey="mana" interactive />
        <ResourceCard title="Превосходство" caption="Ресурс" color="bone" resourceKey="superiority" interactive />
      </div>
      {state.recentAction && <button className="undo-banner" type="button" onClick={state.undo}><ArchiveRestore size={17} />Отменить: {state.recentAction.label}</button>}
    </section>

    <section className="combat-section">
      <div className="section-title"><div><p className="eyebrow">База + активные эффекты</p><h2>Боевые параметры</h2></div></div>
      {combatCalculations.length || abilityCalculations.length ? <div className="combat-stat-grid">{combatCalculations.map((calculation) => <CombatStatCard key={calculation.target.id} calculation={calculation} onOpen={() => setCalculationDetail(calculation)} />)}{abilityCalculations.map((ability) => <AbilityCombatCard key={ability.id} name={ability.name} calculations={ability.calculations} onOpen={setCalculationDetail} />)}</div> : <EmptyState title="Нет числовых параметров" text="Заполните КД, скорость или характеристики в основных разделах персонажа." />}
    </section>

    <section className="combat-section effects-section">
      <div className="section-title"><div><p className="eyebrow">Временные состояния</p><h2>Активные эффекты</h2></div><button className="button primary" type="button" onClick={() => setEditingEffect('new')}><Plus size={16} />Добавить эффект</button></div>
      <EffectSection category="positive" effects={state.combatEffects.filter((effect) => effect.category === 'positive')} onEdit={setEditingEffect} />
      <EffectSection category="negative" effects={state.combatEffects.filter((effect) => effect.category === 'negative')} onEdit={setEditingEffect} />
      {state.combatEffects.some((effect) => effect.category === 'special') && <EffectSection category="special" effects={state.combatEffects.filter((effect) => effect.category === 'special')} onEdit={setEditingEffect} />}
    </section>

    <section className="combat-section">
      <div className="section-title"><div><p className="eyebrow">Существующие данные листа</p><h2>Быстрый доступ</h2></div></div>
      <div className="combat-quick-sections">
        <QuickContentSection title="Экипированное оружие" empty="Нет экипированных предметов" entries={equipped.map((item) => ({ id: item.id, name: item.name, imageId: item.imageId, meta: [item.damage, item.range].filter(Boolean).join(' · '), onOpen: () => setItemDetail(item) }))} />
        <QuickContentSection title="Заклинания" empty="Заклинания не добавлены" entries={quickSpells.map((spell) => ({ id: spell.id, name: spell.name, imageId: spell.imageId, meta: [spell.manaCost === null ? '' : `${spell.manaCost} маны`, spell.actionType, spell.range].filter(Boolean).join(' · '), onOpen: () => setSpellDetail(spell) }))} />
        <QuickContentSection title="Способности и навыки" empty="Навыки не добавлены" entries={quickSkills.map((skill) => ({ id: skill.id, name: skill.name, imageId: skill.imageId, meta: [skill.actionType, skill.status === 'reaction' ? 'Реакция' : ''].filter(Boolean).join(' · '), onOpen: () => setSkillDetail(skill) }))} />
      </div>
    </section>

    {editingEffect && <CombatEffectEditor effect={editingEffect === 'new' ? blankCombatEffect() : editingEffect} calculations={calculations} onClose={() => setEditingEffect(null)} />}
    {calculationDetail && <CombatCalculationDetail calculation={calculationDetail} onClose={() => setCalculationDetail(null)} />}
    {spellDetail && <SpellDetail spell={spellDetail} onClose={() => setSpellDetail(null)} />}
    {skillDetail && <Modal title={skillDetail.name} onClose={() => setSkillDetail(null)}><ImageFrame imageId={skillDetail.imageId} label={skillDetail.name} className="detail-image" /><p className="lead">{skillDetail.summary || 'Краткое описание не указано.'}</p><LongDetail label="Полная механика" value={skillDetail.mechanics} /><LongDetail label="Условие" value={skillDetail.condition} /><LongDetail label="Требование" value={skillDetail.requirement} /></Modal>}
    {itemDetail && <Modal title={itemDetail.name} onClose={() => setItemDetail(null)}><ImageFrame imageId={itemDetail.imageId} label={itemDetail.name} className="detail-image" /><dl className="details-grid"><Detail label="Категория" value={itemDetail.category} /><Detail label="Количество" value={itemDetail.quantity} /><Detail label="Урон" value={itemDetail.damage} /><Detail label="Тип урона" value={itemDetail.damageType} /><Detail label="Дальность" value={itemDetail.range} /><Detail label="Свойства" value={itemDetail.properties} /></dl><LongDetail label="Описание" value={itemDetail.description || itemDetail.note} /></Modal>}
  </div>
}

function CombatStatCard({ calculation, onOpen }: { calculation: CombatCalculation; onOpen: () => void }) {
  const changed = calculation.finalValue !== calculation.baseValue + calculation.equipmentValue
  const unit = calculation.target.unit ?? ''
  const effectValue = `${calculation.effectDelta >= 0 ? '+' : ''}${formatCombatNumber(calculation.effectDelta)}${unit}`
  return <button type="button" className={changed ? 'combat-stat changed' : 'combat-stat'} onClick={onOpen} aria-label={`Расчёт: ${calculation.target.label}`}>
    <span>{calculation.target.label}</span>
    <strong>{formatCombatNumber(calculation.finalValue)}{unit}</strong>
    <small>База: {formatCombatNumber(calculation.baseValue)}{unit}</small>
    <small className={changed ? 'effect-total changed' : 'effect-total'}>Эффекты: {effectValue}</small>
    <em>Расчёт</em>
  </button>
}

function AbilityCombatCard({ name, calculations, onOpen }: { name: string; calculations: Partial<Record<'score' | 'check' | 'save', CombatCalculation>>; onOpen: (calculation: CombatCalculation) => void }) {
  const values: Array<{ key: 'score' | 'check' | 'save'; label: string }> = [
    { key: 'score', label: 'Значение' },
    { key: 'check', label: 'Модификатор' },
    { key: 'save', label: 'Спасбросок' },
  ]
  const changed = values.some(({ key }) => {
    const calculation = calculations[key]
    return calculation && calculation.finalValue !== calculation.baseValue + calculation.equipmentValue
  })
  return <article className={changed ? 'combat-stat ability-combat-stat changed' : 'combat-stat ability-combat-stat'} aria-label={`${name}: боевые значения`}>
    <h3>{name}</h3>
    <div className="ability-combat-values">
      {values.map(({ key, label }) => {
        const calculation = calculations[key]
        if (!calculation) return <div className="ability-combat-value unavailable" key={key}><span>{label}</span><strong>—</strong><small>Не указано</small></div>
        const valueChanged = calculation.finalValue !== calculation.baseValue + calculation.equipmentValue
        const effectValue = `${calculation.effectDelta >= 0 ? '+' : ''}${formatCombatNumber(calculation.effectDelta)}`
        return <button type="button" className={valueChanged ? 'ability-combat-value changed' : 'ability-combat-value'} key={key} aria-label={`Расчёт: ${calculation.target.label}`} onClick={() => onOpen(calculation)}><span>{label}</span><strong>{formatCombatNumber(calculation.finalValue)}</strong><small>База {formatCombatNumber(calculation.baseValue)} · эффекты {effectValue}</small></button>
      })}
    </div>
  </article>
}

function CombatCalculationDetail({ calculation, onClose }: { calculation: CombatCalculation; onClose: () => void }) {
  const unit = calculation.target.unit ?? ''
  return <Modal title={`Расчёт: ${calculation.target.label}`} onClose={onClose}>
    <div className="calculation-summary"><span>База</span><strong>{formatCombatNumber(calculation.baseValue)}{unit}</strong>{calculation.equipmentValue !== 0 && <><span>Экипировка</span><strong>{formatCombatNumber(calculation.equipmentValue)}{unit}</strong></>}<span>Итог</span><strong>{formatCombatNumber(calculation.finalValue)}{unit}</strong></div>
    <p className="quiet calculation-order-hint">Порядок: положительные эффекты (+/−, ÷, ×), затем отрицательные (+/−, ×, ÷). Операция «=» применяется последней.</p>
    {calculation.setConflict && <p className="calculation-warning" role="alert">Несколько активных эффектов устанавливают значение через «=». Применён последний созданный эффект.</p>}
    {calculation.steps.length ? <ol className="calculation-steps">{calculation.steps.map((step, index) => <li key={`${step.effectId}-${index}`} className={step.applied ? '' : 'ignored'}><strong>{step.effectName}</strong><span>{combatOperationSymbols[step.operation]} {formatCombatNumber(step.value)}</span><span>{step.applied ? `${formatCombatNumber(step.before)} → ${formatCombatNumber(step.after)}` : 'Не применён: более новый SET'}</span></li>)}</ol> : <p className="quiet">Активных числовых изменений для этого параметра нет.</p>}
  </Modal>
}

function EffectSection({ category, effects, onEdit }: { category: CombatCategory; effects: CombatEffect[]; onEdit: (effect: CombatEffect) => void }) {
  return <section className={`effect-group ${category}`}><div className="effect-group-heading"><span aria-hidden="true">{category === 'positive' ? '+' : category === 'negative' ? '−' : '✦'}</span><div><p className="eyebrow">{combatCategoryLabels[category]}</p><h3>{combatEffectSectionTitles[category]}</h3></div><b>{effects.length}</b></div>{effects.length ? <div className="effect-grid">{effects.map((effect) => <EffectCard key={effect.id} effect={effect} onEdit={() => onEdit(effect)} />)}</div> : <p className="effect-empty">Нет эффектов этой категории.</p>}</section>
}

function EffectCard({ effect, onEdit }: { effect: CombatEffect; onEdit: () => void }) {
  const state = useCharacterStore()
  const targetLabels = new Map(calculateCombatState(state).map((calculation) => [calculation.target.id, calculation.target.label]))
  return <Card className={`effect-card ${effect.category} ${effect.active ? '' : 'inactive'}`}>
    <div className="effect-card-heading"><div><span className="effect-category">{combatCategoryLabels[effect.category]}</span><h3>{effect.name}</h3></div><button className="effect-toggle" type="button" aria-pressed={effect.active} onClick={() => state.toggleCombatEffect(effect.id)}>{effect.active ? 'Активен' : 'Выключен'}</button></div>
    {effect.source && <p className="effect-source">Источник: {effect.source}</p>}
    <p className="effect-description">{effect.description || 'Описание не указано.'}</p>
    <p className="effect-duration">{effect.concentration && <span>Концентрация · </span>}{describeCombatDuration(effect.duration)}</p>
    {effect.modifiers.length > 0 && <ul className="effect-modifiers">{effect.modifiers.map((modifier) => <li key={modifier.id}>{combatOperationSymbols[modifier.operation]}{formatCombatNumber(modifier.value)} <span>{targetLabels.get(modifier.target) ?? modifier.target}</span></li>)}</ul>}
    {effect.duration.type === 'rounds' && <div className="effect-rounds"><span>Осталось раундов</span><Counter label={`${effect.name}: оставшиеся раунды`} value={effect.duration.roundsRemaining ?? 0} onChange={(value) => state.setCombatEffectRounds(effect.id, value)} onAdjust={(delta) => state.setCombatEffectRounds(effect.id, (effect.duration.roundsRemaining ?? 0) + delta)} /></div>}
    <div className="effect-actions"><button className="button ghost small" type="button" onClick={onEdit}><Pencil size={14} />Изменить</button><button className="button ghost small" type="button" onClick={() => { if (window.confirm(`Снять эффект «${effect.name}»?`)) state.deleteCombatEffect(effect.id) }}><Trash2 size={14} />Снять</button></div>
  </Card>
}

function CombatEffectEditor({ effect, calculations, onClose }: { effect: CombatEffect; calculations: CombatCalculation[]; onClose: () => void }) {
  const state = useCharacterStore()
  const [draft, setDraft] = useState<CombatEffect>(effect)
  const [error, setError] = useState('')
  const sourceOptions = [
    ...state.spells.map((spell) => ({ id: `spell:${spell.id}`, label: `Заклинание: ${spell.name}` })),
    ...state.skills.map((skill) => ({ id: `skill:${skill.id}`, label: `Навык: ${skill.name}` })),
    ...state.inventory.map((item) => ({ id: `item:${item.id}`, label: `Предмет: ${item.name}` })),
  ]
  const updateModifier = (id: string, patch: Partial<CombatModifier>) => setDraft({ ...draft, modifiers: draft.modifiers.map((modifier) => modifier.id === id ? { ...modifier, ...patch } : modifier) })
  const addModifier = () => {
    const target = calculations[0]?.target.id
    if (!target) return
    setDraft({ ...draft, modifiers: [...draft.modifiers, { id: newId(), target, operation: 'ADD', value: 0 }] })
  }
  const save = () => {
    if (!draft.name.trim()) return setError('Укажите название эффекта.')
    if (draft.modifiers.some((modifier) => !Number.isFinite(modifier.value))) return setError('Все изменения должны содержать корректные числа.')
    if (draft.modifiers.some((modifier) => modifier.operation === 'DIVIDE' && modifier.value === 0)) return setError('Деление на ноль запрещено.')
    if (draft.duration.type === 'rounds' && (!Number.isFinite(draft.duration.roundsRemaining) || (draft.duration.roundsRemaining ?? -1) < 0)) return setError('Укажите неотрицательное количество раундов.')
    state.upsertCombatEffect({ ...draft, name: draft.name.trim(), source: draft.source.trim() })
    onClose()
  }

  return <Modal title={effect.name ? 'Редактировать эффект' : 'Новый эффект'} onClose={onClose}>
    <div className="editor-grid combat-effect-editor">
      <EditorField label="Название" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
      <label className="editor-field"><span>Категория</span><select aria-label="Категория эффекта" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as CombatCategory })}>{combatCategories.map((category) => <option key={category} value={category}>{combatCategoryLabels[category]}</option>)}</select></label>
      <EditorField label="Источник" value={draft.source} onChange={(source) => setDraft({ ...draft, source })} />
      <label className="editor-field"><span>Связать с записью листа</span><select aria-label="Связь с записью листа" value={draft.sourceId ?? ''} onChange={(event) => setDraft({ ...draft, ...(event.target.value ? { sourceId: event.target.value } : { sourceId: undefined }) })}><option value="">Без связи</option>{sourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <div className="effect-description-field"><EditorField label="Описание" value={draft.description} type="textarea" onChange={(description) => setDraft({ ...draft, description })} /></div>
      <label className="editor-field"><span>Длительность</span><select aria-label="Длительность эффекта" value={draft.duration.type} onChange={(event) => { const type = event.target.value as CombatEffect['duration']['type']; setDraft({ ...draft, duration: type === 'rounds' ? { type, roundsRemaining: draft.duration.roundsRemaining ?? 1 } : { type }, concentration: type === 'concentration' || draft.concentration }) }}>{combatDurationTypes.map((duration) => <option key={duration} value={duration}>{combatDurationLabels[duration]}</option>)}</select></label>
      {draft.duration.type === 'rounds' && <label className="editor-field"><span>Осталось раундов</span><input aria-label="Осталось раундов" type="number" min="0" value={draft.duration.roundsRemaining ?? 0} onChange={(event) => setDraft({ ...draft, duration: { type: 'rounds', roundsRemaining: Number(event.target.value) } })} /></label>}
      <label className="check"><input type="checkbox" checked={draft.concentration} onChange={(event) => setDraft({ ...draft, concentration: event.target.checked })} />Требует концентрации</label>
      <label className="check"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Эффект активен</label>
    </div>
    <section className="modifier-editor"><div className="section-title"><div><p className="eyebrow">Безопасные операции</p><h3>Числовые изменения</h3></div><button className="button ghost small" type="button" disabled={!calculations.length} onClick={addModifier}><Plus size={14} />Добавить изменение</button></div>
      {draft.modifiers.length ? <div className="modifier-list">{draft.modifiers.map((modifier) => <div className="modifier-row" key={modifier.id}><label><span>Параметр</span><select aria-label="Целевой параметр" value={modifier.target} onChange={(event) => updateModifier(modifier.id, { target: event.target.value })}>{calculations.map((calculation) => <option key={calculation.target.id} value={calculation.target.id}>{calculation.target.label}</option>)}</select></label><label><span>Операция</span><select aria-label="Операция изменения" value={modifier.operation} onChange={(event) => updateModifier(modifier.id, { operation: event.target.value as CombatOperation })}>{combatOperations.map((operation) => <option key={operation} value={operation}>{combatOperationLabels[operation]}</option>)}</select></label><label><span>Число</span><input aria-label="Число изменения" type="number" step="any" value={modifier.value} onChange={(event) => updateModifier(modifier.id, { value: Number(event.target.value) })} /></label><button className="modifier-delete" type="button" aria-label="Удалить изменение" onClick={() => setDraft({ ...draft, modifiers: draft.modifiers.filter((entry) => entry.id !== modifier.id) })}><Trash2 size={16} /></button></div>)}</div> : <p className="quiet">Эффект может быть текстовым и не содержать числовых изменений.</p>}
    </section>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <button className="button primary" type="button" onClick={save}>Сохранить эффект</button>
  </Modal>
}

function QuickContentSection({ title, empty, entries }: { title: string; empty: string; entries: Array<{ id: string; name: string; imageId?: string; meta: string; onOpen: () => void }> }) {
  return <section className="quick-content"><h3>{title}</h3>{entries.length ? <div className="quick-content-list" role="region" aria-label={`${title}: быстрый доступ`} tabIndex={0}>{entries.map((entry) => <button type="button" key={entry.id} onClick={entry.onOpen}><ImageFrame imageId={entry.imageId} label={entry.name} /><span><strong>{entry.name}</strong><small>{entry.meta || 'Подробности'}</small></span></button>)}</div> : <p className="quiet">{empty}</p>}</section>
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
  const characterId = useLibraryStore((state) => state.activeCharacterId)
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    onChange(await saveImage(file, characterId ?? undefined))
    input.value = ''
  }
  return <div className="image-input"><label className="button ghost file-button"><Upload size={16} />{value ? 'Заменить изображение' : 'Загрузить изображение'}<input className="visually-hidden-input" aria-label={value ? 'Заменить изображение' : 'Загрузить изображение'} type="file" accept="image/*" onChange={upload} /></label>{value && <button className="button ghost" type="button" onClick={() => onChange(undefined)}>Убрать изображение</button>}</div>
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
  const exchange = (from: CurrencyKey, to: CurrencyKey, label: string) => {
    setNotice(state.convertCurrency(from, to) ? `Конвертация выполнена: ${label}.` : `Недостаточно монет для конвертации: ${label}.`)
  }

  return <div className="page-stack">
    <section className="currency-grid">{currencies.map(({ key, label, ratio, tone }) => <Card key={key} className={`currency ${tone}`}>
      <div className="currency-heading"><p className="eyebrow">{label}</p>{ratio && <span>{ratio}</span>}</div>
      <Counter label={`${label}: количество`} value={state.currencies[key]} onChange={(value) => state.setCurrency(key, value)} onAdjust={(delta) => state.adjustCurrency(key, delta)} steps={[1, 10, 100]} />
      <div className="currency-conversions">{currencyExchanges[key].map((conversion) => <button key={`${conversion.from}-${conversion.to}`} type="button" aria-label={`Конвертировать ${conversion.label}`} onClick={() => exchange(conversion.from, conversion.to, conversion.label)}>{conversion.direction === 'left' ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}<span>{conversion.label}</span></button>)}</div>
    </Card>)}</section>
    <section className="page-toolbar"><p className="page-intro">Монеты можно конвертировать по курсу 1 к 10 между соседними номиналами.</p><button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={16} />Добавить предмет</button></section>
    {notice && <p className="notice" role="status">{notice}</p>}
    {state.inventory.length ? <section className="inventory-grid">{state.inventory.map((item) => <Card key={item.id} className="item-card"><ImageFrame imageId={item.imageId} label={item.name} className="item-image" /><div className="section-title"><div><p className="eyebrow">{item.category || 'Категория не указана'}</p><h3>{item.name}</h3></div>{item.equipped && <span className="equipped">Экипировано</span>}</div><p className="quiet">Количество: <strong>{noValue(item.quantity)}</strong></p><dl className="details-grid">{item.damage && <Detail label="Урон" value={item.damage} />}{item.damageType && <Detail label="Тип урона" value={item.damageType} />}{item.range && <Detail label="Дальность" value={item.range} />}{item.cost && <Detail label="Стоимость" value={item.cost} />}</dl>{(item.description || item.note || item.properties) && <p className="item-summary">{item.description || item.note || item.properties}</p>}<CardActions itemName={item.name} leftAction={<button className={item.equipped ? 'unequip-item' : 'equip-item'} type="button" aria-label={`${item.equipped ? 'Снять' : 'Экипировать'} ${item.name}`} onClick={() => { state.toggleItemEquipped(item.id); setNotice(item.equipped ? `Предмет «${item.name}» снят.` : `Предмет «${item.name}» экипирован.`) }}>{item.equipped ? 'Снять' : 'Экипировать'}</button>} onEdit={() => setEditing(item)} onDuplicate={() => void duplicate(item)} onDelete={() => { if (window.confirm(`Удалить «${item.name}»?`)) { state.deleteItem(item.id); setNotice(`Предмет «${item.name}» удалён.`) } }} /></Card>)}</section> : <EmptyState title="Инвентарь пуст" text="Добавьте первый предмет — он будет сохранён на устройстве." />}
    {editing && <ItemEditor item={editing === 'new' ? blankItem() : editing} onClose={() => setEditing(null)} />}
  </div>
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
  const combatFields: Array<[string, string]> = [['attackBonus', 'Бонус броска атаки'], ['damageBonus', 'Бонус урона'], ['meleeRange', 'Дальность ближней атаки'], ['rangedRange', 'Дальность дальней атаки'], ['spellAttackBonus', 'Бонус атаки заклинанием'], ['spellSaveDc', 'Сложность спасброска заклинаний']]
  return <div className="page-stack"><section className="profile-card"><Avatar name={state.profile.name} imageId={state.profile.avatarId} className="profile-avatar" /><div><FieldValue label="Имя персонажа" value={state.profile.name} onChange={(value) => state.setProfile('name', value)} editable={state.editing} heading /><p className="quiet">Аватар сохраняется на этом устройстве вместе с листом.</p>{state.editing && <ImageInput value={state.profile.avatarId} onChange={(imageId) => state.setProfile('avatarId', imageId ?? '')} />}</div></section><section className="profile-grid">{fields.map(([key, label]) => <FieldValue key={key} label={label} value={state.profile[key] ?? ''} onChange={(value) => state.setProfile(key, value)} editable={state.editing} />)}</section><section><div className="section-title"><div><p className="eyebrow">База для вкладки «Бой»</p><h2>Атака и магия</h2></div></div><div className="profile-grid">{combatFields.map(([key, label]) => <FieldValue key={key} label={label} value={state.profile[key] ?? ''} onChange={(value) => state.setProfile(key, value)} editable={state.editing} />)}</div></section><section className="collections"><EntryCollection title="Языки" collection="languages" /><EntryCollection title="Владения" collection="proficiencies" /><EntryCollection title="Магические элементы" collection="elements" /></section><section className="text-grid">{[['traits', 'Черты'], ['ideals', 'Идеалы'], ['bonds', 'Привязанности'], ['weaknesses', 'Слабости'], ['backstory', 'Предыстория персонажа'], ['characterNotes', 'Заметки']].map(([key, label]) => <TextValue key={key} label={label} value={state.profile[key] ?? ''} editable={state.editing} onChange={(value) => state.setProfile(key, value)} />)}</section></div>
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
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [notice, setNotice] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
  const notes = state.notes.filter((note) => {
    const matchesTag = !tagFilter || note.tags.includes(tagFilter)
    const matchesQuery = !normalizedQuery || [note.title, ...note.tags].some((value) => value.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
    return matchesTag && matchesQuery
  })
  const tags = [...new Set(state.notes.flatMap((note) => note.tags))]

  return <div className="page-stack"><section className="page-toolbar"><div><p className="eyebrow">Игровые заметки</p><h2>Заметки сессии</h2></div><button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={16} />Новая заметка</button></section><div className="filters note-search"><input aria-label="Поиск заметок" placeholder="Поиск по заголовку и тегам..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>{tags.length > 0 && <div className="tag-filter"><button type="button" className={!tagFilter ? 'active' : ''} onClick={() => setTagFilter('')}>Все теги</button>{tags.map((tag) => <button type="button" key={tag} className={tagFilter === tag ? 'active' : ''} onClick={() => setTagFilter(tag)}>{tag}</button>)}</div>}{notice && <p className="notice" role="status">{notice}</p>}{notes.length ? <section className="notes-grid">{notes.map((note) => <Card key={note.id} className="note-card">{note.imageId && <ImageFrame imageId={note.imageId} label={note.title} className="note-image" />}<button className="note-open" type="button" onClick={() => setExpanded(note)}><p className="eyebrow">{new Date(note.updatedAt).toLocaleDateString('ru-RU')}</p><h3>{note.title || 'Без названия'}</h3><p>{note.body || 'Пустая заметка'}</p></button><div className="note-tags">{note.tags.map((tag) => <button type="button" key={tag} onClick={() => setTagFilter(tag)}>{tag}</button>)}</div><CardActions itemName={note.title || 'заметка'} onEdit={() => setEditing(note)} onDuplicate={() => { const copy: Note = { ...note, id: newId(), title: `${note.title || 'Заметка'} — копия`, imageId: note.imageId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; state.upsertNote(copy); setNotice(`Создана копия заметки «${note.title || 'Без названия'}».`) }} onDelete={() => { if (window.confirm(`Удалить заметку «${note.title || 'Без названия'}»?`)) { state.deleteNote(note.id); setNotice('Заметка удалена.') } }} /></Card>)}</section> : <EmptyState title="Заметок не найдено" text={query || tagFilter ? 'Измените поисковый запрос или выбранный тег.' : 'Создайте первую заметку для событий, NPC и планов сессии.'} />}{editing && <NoteEditor note={editing === 'new' ? blankNote() : editing} onClose={() => setEditing(null)} />}{expanded && <Modal title={expanded.title || 'Заметка'} onClose={() => setExpanded(null)}>{expanded.imageId && <ImageFrame imageId={expanded.imageId} label={expanded.title} className="detail-image" />}<div className="note-tags">{expanded.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><p className="note-full">{expanded.body || 'Пустая заметка'}</p><button className="button ghost" type="button" onClick={() => { setEditing(expanded); setExpanded(null) }}><Pencil size={16} />Редактировать</button></Modal>}</div>
}

function NoteEditor({ note, onClose }: { note: Note; onClose: () => void }) {
  const upsert = useCharacterStore((state) => state.upsertNote)
  const [draft, setDraft] = useState(note)
  return <Modal title={note.id ? 'Редактировать заметку' : 'Новая заметка'} onClose={onClose}><div className="editor-grid note-editor-grid"><EditorField label="Заголовок" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} /><EditorField label="Текст заметки" value={draft.body} type="textarea" onChange={(body) => setDraft({ ...draft, body })} /><TagInput label="Теги" value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} /></div><ImageInput value={draft.imageId} onChange={(imageId) => setDraft({ ...draft, ...(imageId ? { imageId } : { imageId: undefined }) })} /><button className="button primary" type="button" onClick={() => { upsert({ ...draft, title: draft.title.trim() || 'Без названия', updatedAt: new Date().toISOString() }); onClose() }}>Сохранить заметку</button></Modal>
}

type SettingsPageProps = {
  persistCurrent: () => Promise<CharacterLibrary>
  applySingleImport: (prepared: PreparedBackupImport, replace: boolean) => Promise<void>
  applyCollectionImport: (prepared: PreparedBackupImport, mode: 'merge' | 'replace', conflicts: 'copy' | 'replace' | 'skip') => Promise<void>
  resetCurrent: () => Promise<void>
  resetAll: () => Promise<void>
}

function SettingsPage({ persistCurrent, applySingleImport, applyCollectionImport, resetCurrent, resetAll }: SettingsPageProps) {
  const state = useCharacterStore()
  const library = useLibraryStore()
  const [scope, setScope] = useState<BackupScope>('current')
  const [pending, setPending] = useState<PreparedBackupImport | null>(null)
  const [conflicts, setConflicts] = useState<'copy' | 'replace' | 'skip'>('copy')
  const [resetOpen, setResetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const active = getActiveCharacter(library)
  const datedName = (extension: 'zip' | 'json') => scope === 'current' && active
    ? `mikato-character-${sanitizeFilename(active.name)}-${new Date().toISOString().slice(0, 10)}.${extension}`
    : `mikato-all-characters-${new Date().toISOString().slice(0, 10)}.${extension}`
  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true); setMessage('')
    try { await work(); setMessage(success) } catch (error) { setMessage(error instanceof Error ? error.message : 'Операция не выполнена.') }
    finally { setBusy(false) }
  }
  const exportZip = () => run(async () => {
    const backup = await createLibraryBackup(await persistCurrent(), scope)
    downloadBlob(backup.blob, datedName('zip'))
    setMessage(`ZIP создан. Добавлено изображений: ${backup.imageCount}.`)
  }, 'ZIP создан.')
  const exportJson = () => run(async () => {
    const json = createJsonBackup(await persistCurrent(), scope)
    downloadBlob(new Blob([json], { type: 'application/json' }), datedName('json'))
  }, 'JSON без изображений создан.')
  const prepareImport = async (event: ChangeEvent<HTMLInputElement>, kind: 'zip' | 'json') => {
    const input = event.currentTarget; const file = input.files?.[0]
    if (!file) return
    setBusy(true); setMessage('Проверяю резервную копию…')
    try { setPending(kind === 'zip' ? await restoreLibraryBackup(file) : parseJsonBackup(await file.text())); setMessage('Файл проверен. Выберите способ импорта.') }
    catch { setMessage(kind === 'zip' ? 'Не удалось прочитать ZIP: архив повреждён или имеет неподдерживаемый формат.' : 'Не удалось прочитать JSON: файл повреждён или имеет неподдерживаемый формат.') }
    finally { input.value = ''; setBusy(false) }
  }
  const finishImport = (work: () => Promise<void>, success: string) => run(async () => { await work(); setPending(null) }, success)
  const confirmReplaceCurrent = () => pending && window.confirm(`Заменить текущего персонажа «${active?.name ?? 'Без имени'}»? Его текущие данные будут перезаписаны.`) && finishImport(() => applySingleImport(pending, true), 'Текущий персонаж заменён.')
  const confirmReplaceAll = () => pending && window.confirm('Заменить всю библиотеку? Все текущие персонажи и их локальные изображения будут удалены.') && finishImport(() => applyCollectionImport(pending, 'replace', conflicts), 'Библиотека заменена.')
  return <div className="page-stack settings-page">
    <Card><p className="eyebrow">Оформление</p><h2>Тема интерфейса</h2><div className="theme-options"><button type="button" className={state.settings.themeMode === 'dark' ? 'active' : ''} aria-pressed={state.settings.themeMode === 'dark'} onClick={() => state.setSetting('themeMode', 'dark')}><Moon size={17} />Тёмная</button><button type="button" className={state.settings.themeMode === 'light' ? 'active' : ''} aria-pressed={state.settings.themeMode === 'light'} onClick={() => state.setSetting('themeMode', 'light')}><Sun size={17} />Светлая</button></div><p className="setting-label">Акцентный цвет</p><div className="accent-options">{accentOptions.map(([value, label]) => <button key={value} type="button" className={`accent-swatch ${value} ${state.settings.accentColor === value ? 'active' : ''}`} aria-label={`Акцент: ${label}`} aria-pressed={state.settings.accentColor === value} onClick={() => state.setSetting('accentColor', value)}><span />{label}</button>)}</div></Card>
    <Card><p className="eyebrow">Опыт и уровень</p><h2>Правило повышения</h2><p className="quiet">Эти настройки общие для всей библиотеки персонажей.</p><label className="check"><input type="radio" checked={state.settings.levelUpBehavior === 'carry'} onChange={() => state.setSetting('levelUpBehavior', 'carry')} />Переносить избыток опыта</label><label className="check"><input type="radio" checked={state.settings.levelUpBehavior === 'reset'} onChange={() => state.setSetting('levelUpBehavior', 'reset')} />Сбрасывать опыт в ноль</label><label className="check"><input type="checkbox" checked={state.settings.allowNegativeMana} onChange={(event) => state.setSetting('allowNegativeMana', event.target.checked)} />Разрешить отрицательную ману</label></Card>
    <Card><p className="eyebrow">Данные</p><h2>Резервные копии</h2><div className="backup-scope" role="radiogroup" aria-label="Что экспортировать"><label><input type="radio" name="backup-scope" checked={scope === 'current'} onChange={() => setScope('current')} />Только текущего персонажа</label><label><input type="radio" name="backup-scope" checked={scope === 'all'} onChange={() => setScope('all')} />Всех персонажей</label></div><p className="quiet">ZIP включает фотографии. JSON легче, но изображения в него не входят.</p><div className="button-row"><button className="button primary" disabled={busy || (scope === 'current' && !active)} type="button" onClick={() => void exportZip()}><FileArchive size={16} />Экспорт ZIP с фото</button><button className="button ghost" disabled={busy || (scope === 'current' && !active)} type="button" onClick={() => void exportJson()}><Download size={16} />Экспорт JSON без фото</button></div><div className="button-row secondary-backup-actions"><label className={`button primary file-button ${busy ? 'disabled' : ''}`}><Upload size={16} />Импорт ZIP<input className="visually-hidden-input" aria-label="Импорт ZIP" disabled={busy} type="file" accept=".zip,application/zip" onChange={(event) => void prepareImport(event, 'zip')} /></label><label className={`button ghost file-button ${busy ? 'disabled' : ''}`}><Upload size={16} />Импорт JSON<input className="visually-hidden-input" aria-label="Импорт JSON" disabled={busy} type="file" accept=".json,application/json" onChange={(event) => void prepareImport(event, 'json')} /></label><button className="button ghost" disabled={busy} type="button" onClick={() => void run(async () => { await persistCurrent() }, 'Вся библиотека сохранена локально в этом браузере.')}>Сохранить локально</button></div><button className="danger" disabled={busy} type="button" onClick={() => setResetOpen(true)}>Сброс данных…</button>{message && <p className="notice" role="status">{message}</p>}</Card>
    {pending && <Modal title="Импорт резервной копии" onClose={() => setPending(null)}>{pending.legacy && <p className="notice">Это резервная копия старого формата. Она будет импортирована как отдельный персонаж.</p>}{pending.backupType === 'singleCharacter' ? <><p>В файле найден персонаж: <strong>{pending.character?.name ?? 'Без имени'}</strong></p><p className="quiet">Рекомендуется добавить его как нового, чтобы не потерять открытый лист.</p><div className="button-row"><button className="button primary" disabled={busy} type="button" onClick={() => void finishImport(() => applySingleImport(pending, false), 'Персонаж добавлен в библиотеку.')}>Добавить как нового</button><button className="button ghost" disabled={busy || !active || pending.legacy} type="button" onClick={() => void confirmReplaceCurrent()}>Заменить текущего</button><button className="button ghost" type="button" onClick={() => setPending(null)}>Отмена</button></div></> : <><p>В резервной копии найдено персонажей: <strong>{pending.library?.characterOrder.length ?? 0}</strong></p><label className="editor-field"><span>Если ID уже существует</span><select value={conflicts} onChange={(event) => setConflicts(event.target.value as typeof conflicts)}><option value="copy">Создать копии</option><option value="replace">Заменить совпадающих</option><option value="skip">Пропустить совпадающих</option></select></label><div className="button-row"><button className="button primary" disabled={busy} type="button" onClick={() => void finishImport(() => applyCollectionImport(pending, 'merge', conflicts), 'Коллекция объединена с текущей библиотекой.')}>Объединить с существующими</button><button className="button ghost" disabled={busy} type="button" onClick={() => void confirmReplaceAll()}>Заменить всю библиотеку</button><button className="button ghost" type="button" onClick={() => setPending(null)}>Отмена</button></div></>}</Modal>}
    {resetOpen && <Modal title="Сброс данных" onClose={() => setResetOpen(false)}><p>Выберите область сброса. Операция удалит связанные локальные изображения.</p><div className="reset-options"><button className="button ghost" disabled={busy || !active} type="button" onClick={() => { if (window.confirm(`Сбросить персонажа «${active?.name ?? 'Без имени'}» к исходному состоянию?`)) void run(async () => { await resetCurrent(); setResetOpen(false) }, 'Текущий персонаж сброшен.') }}>Сбросить текущего персонажа</button><button className="danger" disabled={busy} type="button" onClick={() => { if (window.confirm('Удалить ВСЕХ персонажей и создать новый исходный лист?')) void run(async () => { await resetAll(); setResetOpen(false) }, 'Вся библиотека сброшена.') }}>Сбросить всю библиотеку</button><button className="button ghost" type="button" onClick={() => setResetOpen(false)}>Отмена</button></div></Modal>}
  </div>
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

function blankCombatEffect(): CombatEffect {
  return { id: newId(), name: '', category: 'special', source: '', description: '', active: true, concentration: false, createdAt: new Date().toISOString(), duration: { type: 'manual' }, modifiers: [] }
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
