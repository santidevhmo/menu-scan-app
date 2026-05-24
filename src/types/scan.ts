export type ScanPhotoSource = "camera" | "gallery";

export type ScanPhoto = {
  id: string;
  uri: string;
  width: number;
  height: number;
  source: ScanPhotoSource;
};
