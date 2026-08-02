const SAFE_CASE_NAME = /^[a-zA-Z0-9_-]{1,160}$/;

export type BlenderBridgePlatform = "Windows" | "Mac" | "PC";

export function blenderBridgePlatformLabel(userAgent: string): BlenderBridgePlatform {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  return "PC";
}

export function blenderBridgeUrl(baseName: string): string {
  if (!SAFE_CASE_NAME.test(baseName)) {
    throw new Error("Blender Bridgeへ渡せないケース名です");
  }
  return `hikari-blender://open?case=${encodeURIComponent(baseName)}`;
}
