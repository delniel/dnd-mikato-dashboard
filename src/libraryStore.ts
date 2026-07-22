import { create } from 'zustand'
import { createCharacterLibrary, type CharacterLibrary } from './library'

type LibraryStore = CharacterLibrary & { replaceLibrary: (library: CharacterLibrary) => void }
const initial = createCharacterLibrary()

export const useLibraryStore = create<LibraryStore>((set) => ({
  ...initial,
  replaceLibrary: (library) => set(library),
}))

export const librarySnapshot = (): CharacterLibrary => {
  const { schemaVersion, activeCharacterId, characterOrder, characters, settings } = useLibraryStore.getState()
  return { schemaVersion, activeCharacterId, characterOrder, characters, settings }
}
