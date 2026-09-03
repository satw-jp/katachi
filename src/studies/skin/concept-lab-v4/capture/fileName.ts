export function captureFileName(concept: string, palette: string, seed: number, timeMs: number, width: number, height: number, extension: "png" | "json" | "webm"): string {
  const safeConcept = concept.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return `skin-art_${safeConcept}_${palette}_seed-${seed}_t-${Math.round(timeMs)}_${width}x${height}.${extension}`;
}
