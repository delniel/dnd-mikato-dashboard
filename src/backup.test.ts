import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectImageIds, createCharacterBackup, restoreCharacterBackup } from './backup'
import { createInitialCharacter } from './data'
import { loadImages, saveImages } from './db'

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
})
