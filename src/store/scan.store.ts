import { create } from "zustand";
import type { ScanPhoto } from "@/types/scan";
import { MAX_SCAN_PHOTOS } from "@/lib/adaptiveExtraction";

interface ScanState {
  photos: ScanPhoto[];
  addPhoto: (photo: ScanPhoto) => void;
  removePhoto: (id: string) => void;
  clear: () => void;
}

/** Stores the current scan photo set before review and extraction. */
export const useScanStore = create<ScanState>((set) => ({
  photos: [],
  addPhoto: (photo) =>
    set((state) =>
      state.photos.length >= MAX_SCAN_PHOTOS
        ? state
        : { photos: [...state.photos, photo] },
    ),
  removePhoto: (id) =>
    set((state) => ({ photos: state.photos.filter((p) => p.id !== id) })),
  clear: () => set({ photos: [] }),
}));
