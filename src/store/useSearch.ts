import { create } from 'zustand';

interface SearchState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
}

export const useSearch = create<SearchState>((set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  isSearchOpen: false,
  setIsSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
}));
