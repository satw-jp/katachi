import { solarPositionAt, TOKYO_PLACE, type WorldDirection } from "./solarPosition.ts";

export type DaylightMode = "manual" | "tokyo";

export interface DaylightSettings {
  daylightMode: DaylightMode;
  /** Tokyo civil date, YYYY-MM-DD. */
  daylightDate: string;
  /** Minutes after 00:00 JST. */
  daylightMinutes: number;
  /** Legacy one-axis study angle, retained as the manual fallback. */
  lightAngle: number;
}

export interface ResolvedDaylight {
  mode: DaylightMode;
  instantUtc: string | null;
  propagationDirection: WorldDirection;
  directionToSun: WorldDirection;
  azimuthDeg: number | null;
  altitudeDeg: number | null;
  aboveHorizon: boolean;
  label: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function tokyoCivilInstant(date: string, minutes: number): string {
  if (!DATE_PATTERN.test(date)) throw new TypeError("daylightDate must use YYYY-MM-DD.");
  const [year, month, day] = date.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) {
    throw new RangeError("daylightDate must be a real calendar date.");
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 1440) {
    throw new RangeError("daylightMinutes must be from 0 through 1439.");
  }
  const wholeMinutes = Math.round(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  const minute = wholeMinutes % 60;
  return `${date}T${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
}

export function resolveDaylight(settings: DaylightSettings): ResolvedDaylight {
  if (settings.daylightMode === "tokyo") {
    const instant = tokyoCivilInstant(settings.daylightDate, settings.daylightMinutes);
    const solar = solarPositionAt(instant, TOKYO_PLACE);
    return {
      mode: "tokyo",
      instantUtc: new Date(instant).toISOString(),
      propagationDirection: solar.propagationDirection,
      directionToSun: solar.directionToSun,
      azimuthDeg: solar.azimuthDeg,
      altitudeDeg: solar.altitudeDeg,
      aboveHorizon: solar.aboveHorizon,
      label: `${formatMinutes(settings.daylightMinutes)} JST · 方位 ${solar.azimuthDeg.toFixed(0)}° · 高度 ${solar.altitudeDeg.toFixed(0)}°`,
    };
  }

  const angle = settings.lightAngle * Math.PI / 180;
  const propagationDirection = normalized({
    x: Math.sin(angle) * 0.72,
    y: -1,
    z: Math.cos(angle) * 0.28,
  });
  return {
    mode: "manual",
    instantUtc: null,
    propagationDirection,
    directionToSun: {
      x: -propagationDirection.x,
      y: -propagationDirection.y,
      z: -propagationDirection.z,
    },
    azimuthDeg: null,
    altitudeDeg: null,
    aboveHorizon: true,
    label: `手動 · 角度 ${settings.lightAngle.toFixed(0)}°`,
  };
}

export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function normalized(value: WorldDirection): WorldDirection {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!(length > 0) || !Number.isFinite(length)) return { x: 0, y: -1, z: 0 };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}
