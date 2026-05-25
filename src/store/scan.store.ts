import { create } from "zustand";
import type { ScanPhoto } from "@/types/scan";

interface ScanState {
  photos: ScanPhoto[];
  addPhoto: (photo: ScanPhoto) => void;
  removePhoto: (id: string) => void;
  clear: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  photos: [],
  addPhoto: (photo) => set((state) => ({ photos: [...state.photos, photo] })),
  removePhoto: (id) =>
    set((state) => ({ photos: state.photos.filter((p) => p.id !== id) })),
  clear: () => set({ photos: [] }),
}));
