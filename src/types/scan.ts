export type ScanPhotoSource = "camera" | "gallery";

export interface ScanPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  source: ScanPhotoSource;
}
