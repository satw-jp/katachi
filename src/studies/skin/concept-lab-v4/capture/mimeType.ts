export const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function selectVideoMimeType(isSupported: (mime: string) => boolean = (mime) => (
  typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)
)): string | null {
  return VIDEO_MIME_CANDIDATES.find((mime) => isSupported(mime)) ?? null;
}
