const SAFE_CASE_NAME = /^[a-zA-Z0-9_-]{1,160}$/;

export function blenderBridgeUrl(baseName: string): string {
  if (!SAFE_CASE_NAME.test(baseName)) {
    throw new Error("Blender Bridgeへ渡せないケース名です");
  }
  return `hikari-blender://open?case=${encodeURIComponent(baseName)}`;
}
