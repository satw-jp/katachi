/**
 * Deterministic solar geometry for the Hikari study.
 *
 * The calculation is a NOAA-style, low-precision solar-position approximation
 * (equation of time + solar declination). It uses only the supplied UTC instant
 * and place coordinates: it never reads the host clock, browser locale, or host
 * time zone. It intentionally does not model weather, terrain, or atmospheric
 * refraction.
 */

export interface GeographicPlace {
  /** Decimal degrees, north positive. */
  latitudeDeg: number;
  /** Decimal degrees, east positive. */
  longitudeDeg: number;
  /** IANA name used only by display helpers, never by solar computation. */
  timeZone: string;
}

/** A clock input is always an absolute ISO-8601 instant, never a local date. */
export interface StudyClock {
  instantUtc: string | Date;
}

export interface WorldDirection {
  x: number;
  y: number;
  z: number;
}

export interface SolarPosition {
  /** Bearing in degrees, clockwise from true north (0=N, 90=E). */
  azimuthDeg: number;
  /** Geometric altitude in degrees above the astronomical horizon. */
  altitudeDeg: number;
  /**
   * Unit vector pointing from the study object toward the sun.
   * Hikari world coordinates are +X east, +Y up, and -Z north.
   */
  directionToSun: WorldDirection;
  /** Unit vector in the direction light travels: sun toward the study object. */
  propagationDirection: WorldDirection;
  aboveHorizon: boolean;
}

/** Central Tokyo / Tokyo Station: stable WGS84 coordinates and Japan Standard Time. */
export const TOKYO_PLACE: GeographicPlace = Object.freeze({
  latitudeDeg: 35.681236,
  longitudeDeg: 139.767125,
  timeZone: "Asia/Tokyo",
});

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2)$/;

function radians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

function degrees(radiansValue: number): number {
  return radiansValue * RAD_TO_DEG;
}

function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function assertFinitePlace(place: GeographicPlace): void {
  if (!Number.isFinite(place.latitudeDeg) || place.latitudeDeg < -90 || place.latitudeDeg > 90) {
    throw new RangeError("place.latitudeDeg must be a finite value from -90 to 90.");
  }
  if (!Number.isFinite(place.longitudeDeg) || place.longitudeDeg < -180 || place.longitudeDeg > 180) {
    throw new RangeError("place.longitudeDeg must be a finite value from -180 to 180.");
  }
}

function parseInstantUtc(instantUtc: string | Date): Date {
  if (instantUtc instanceof Date) {
    if (Number.isNaN(instantUtc.getTime())) throw new TypeError("instantUtc must be a valid Date.");
    return new Date(instantUtc.getTime());
  }
  if (!ISO_INSTANT.test(instantUtc)) {
    throw new TypeError("instantUtc must be an ISO-8601 instant with Z or an explicit offset.");
  }
  const parsed = new Date(instantUtc);
  if (Number.isNaN(parsed.getTime())) throw new TypeError("instantUtc must be a valid ISO-8601 instant.");
  return parsed;
}

/**
 * Calculates geometric solar position using the NOAA fractional-year series.
 * Invalid instants and coordinates throw TypeError/RangeError rather than
 * returning a partial result.
 */
export function solarPositionAt(
  instantUtc: string | Date | StudyClock,
  place: GeographicPlace = TOKYO_PLACE,
): SolarPosition {
  assertFinitePlace(place);
  const value = typeof instantUtc === "object" && !(instantUtc instanceof Date)
    ? instantUtc.instantUtc
    : instantUtc;
  const instant = parseInstantUtc(value);

  // UTC date fields are deliberate: civil-zone offsets cancel in true solar time.
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes()
    + instant.getUTCSeconds() / 60 + instant.getUTCMilliseconds() / 60000;
  const yearStart = Date.UTC(instant.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((instant.getTime() - yearStart) / 86_400_000) + 1;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (utcMinutes / 60 - 12) / 24);

  const equationOfTimeMinutes = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma));
  const declinationRad = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  // UTC minutes plus equation-of-time and longitude produces local true solar time.
  const trueSolarMinutes = ((utcMinutes + equationOfTimeMinutes + 4 * place.longitudeDeg) % 1440 + 1440) % 1440;
  const hourAngleRad = radians(trueSolarMinutes / 4 - 180);
  const latitudeRad = radians(place.latitudeDeg);
  const altitudeRad = Math.asin(Math.sin(latitudeRad) * Math.sin(declinationRad)
    + Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad));
  const azimuthDeg = wrapDegrees(degrees(Math.atan2(
    Math.sin(hourAngleRad),
    Math.cos(hourAngleRad) * Math.sin(latitudeRad) - Math.tan(declinationRad) * Math.cos(latitudeRad),
  )) + 180);
  const altitudeDeg = degrees(altitudeRad);
  const horizontal = Math.cos(altitudeRad);
  const azimuthRad = radians(azimuthDeg);
  const directionToSun = {
    x: horizontal * Math.sin(azimuthRad),
    y: Math.sin(altitudeRad),
    z: -horizontal * Math.cos(azimuthRad),
  };

  return {
    azimuthDeg,
    altitudeDeg,
    directionToSun,
    propagationDirection: {
      x: -directionToSun.x,
      y: -directionToSun.y,
      z: -directionToSun.z,
    },
    aboveHorizon: altitudeDeg > 0,
  };
}

/** Formats an instant in Tokyo for UI labels only; it is not used for calculation. */
export function formatTokyoLocalTime(instantUtc: string | Date, locale = "ja-JP"): string {
  const instant = parseInstantUtc(instantUtc);
  return new Intl.DateTimeFormat(locale, {
    timeZone: TOKYO_PLACE.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}
