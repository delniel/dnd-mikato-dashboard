import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { collectImageIds, createCharacterBackup, createJsonBackup, createLibraryBackup, materializeImportedCharacter, parseJsonBackup, restoreCharacterBackup, restoreLibraryBackup } from './backup'
import { createInitialCharacter } from './data'
import { loadImages, saveImages } from './db'
import { addCharacter, createCharacterLibrary, createCharacterRecord } from './library'

vi.mock('./db', () => ({
  loadImages: vi.fn(),
  saveImages: vi.fn(async () => undefined),
}))

describe('резервная копия с изображениями', () => {
  beforeEach(() => vi.clearAllMocks())

  it('собирает все связанные изображения и убирает дубликаты', () => {
    const state = createInitialCharacter()
    state.profile.avatarId = 'avatar'
    state.spells[0].imageId = 'shared'
    state.skills[0].imageId = 'shared'
    state.inventory[0].imageId = 'item'
    state.notes = [{ id: 'note', title: 'Карта', body: '', tags: [], imageId: 'note-image', createdAt: '', updatedAt: '' }]
    expect(collectImageIds(state)).toEqual(['avatar', 'shared', 'item', 'note-image'])
  })

  it('возвращает изображение на прежний imageId после ZIP-экспорта и импорта', async () => {
    const state = createInitialCharacter()
    state.profile.avatarId = 'avatar-image'
    vi.mocked(loadImages).mockResolvedValue([{ id: 'avatar-image', blob: new Blob(['portrait'], { type: 'image/webp' }), updatedAt: 1 }])

    const exported = await createCharacterBackup(state)
    expect(exported.imageCount).toBe(1)
    const restored = await restoreCharacterBackup(exported.blob)

    expect(restored.character.profile.avatarId).toBe('avatar-image')
    expect(restored.imageCount).toBe(1)
    expect(saveImages).toHaveBeenCalledWith([expect.objectContaining({ id: 'avatar-image', blob: expect.any(Blob) })])
  })

  it('экспортирует всю коллекцию с раздельными путями изображений и сохраняет порядок', async () => {
    const first = createInitialCharacter(); first.profile.name = 'А'; first.profile.avatarId = 'a-image'
    const second = createInitialCharacter(); second.profile.name = 'Б'; second.profile.avatarId = 'b-image'
    const library = addCharacter(createCharacterLibrary(first, { id: 'a' }), createCharacterRecord(second, { id: 'b' }))
    vi.mocked(loadImages)
      .mockResolvedValueOnce([{ id: 'a-image', characterId: 'a', blob: new Blob(['a-image'], { type: 'image/webp' }), updatedAt: 1 }])
      .mockResolvedValueOnce([{ id: 'b-image', characterId: 'b', blob: new Blob(['b-image'], { type: 'image/webp' }), updatedAt: 1 }])
    const exported = await createLibraryBackup(library, 'all')
    const zip = await JSZip.loadAsync(exported.blob)
    expect(zip.file('characters/a/images/0')).not.toBeNull()
    expect(zip.file('characters/b/images/0')).not.toBeNull()
    const restored = await restoreLibraryBackup(exported.blob)
    expect(restored.library?.characterOrder).toEqual(['a', 'b'])
    expect(restored.library?.activeCharacterId).toBe('b')
    expect(restored.images.map((image) => image.characterId)).toEqual(['a', 'b'])
  })

  it('JSON одного и всех персонажей не содержит ссылок на фотографии', () => {
    const state = createInitialCharacter(); state.profile.avatarId = 'private-image'; state.spells[0].imageId = 'spell-image'
    const library = createCharacterLibrary(state, { id: 'hero' })
    expect(createJsonBackup(library, 'current')).not.toContain('private-image')
    expect(createJsonBackup(library, 'all')).not.toContain('spell-image')
  })

  it('распознаёт старый JSON как одного нового персонажа', () => {
    const state = createInitialCharacter(); state.profile.name = 'Старый герой'; state.resources.hp.current = 9
    const prepared = parseJsonBackup(JSON.stringify(state))
    expect(prepared).toMatchObject({ backupType: 'singleCharacter', legacy: true, character: { name: 'Старый герой', data: { resources: { hp: { current: 9 } } } } })
  })

  it('отклоняет резервную копию более новой версии', () => {
    expect(() => parseJsonBackup(JSON.stringify({ schemaVersion: 999, backupType: 'singleCharacter', character: {} }))).toThrow(/новой версией/)
  })

  it('создаёт новые ID изображений при импорте и очищает отсутствующие фотографии', () => {
    const state = createInitialCharacter(); state.profile.avatarId = 'avatar'; state.spells[0].imageId = 'missing'
    const result = materializeImportedCharacter(createCharacterRecord(state, { id: 'old' }), [{ id: 'avatar', blob: new Blob(['x']), updatedAt: 1 }], 'new')
    expect(result.character.data.profile.avatarId).toMatch(/^new:/)
    expect(result.character.data.spells[0].imageId).toBeUndefined()
    expect(result.images[0]).toMatchObject({ characterId: 'new' })
  })
})
