import type { GeoStatus, VillaTable } from './types';

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. */
export function haversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/**
 * How far a stored coordinate could be from the point it was meant to mark.
 *
 * A latitude written to one decimal place names an 11 km band. Comparing that
 * against a 300 m fence asks a question the data cannot answer, and the answer
 * it invents is "everyone is outside". Trailing zeros carry no information and
 * are already gone by the time the value is a number, which is correct here.
 */
export function pinUncertaintyM(lat: number, lng: number): number {
  const decimals = (n: number) => {
    const text = String(n);
    // Exponential notation only appears far below any real coordinate, and
    // means the value is essentially zero — treat it as no precision at all.
    if (text.includes('e') || text.includes('E')) return 0;
    const dot = text.indexOf('.');
    return dot === -1 ? 0 : text.length - dot - 1;
  };
  // One degree of latitude is ~111 km. Longitude degrees shrink with the
  // cosine of the latitude, so using the latitude figure for both is the
  // conservative direction.
  return 111_000 * 10 ** -Math.min(decimals(lat), decimals(lng));
}

/** Whether a villa's pin is precise enough to judge its own radius. */
export function pinIsUsable(
  table: Pick<VillaTable, 'lat' | 'lng' | 'radiusM'>,
): boolean {
  if (table.lat === null || table.lng === null) return false;
  return pinUncertaintyM(table.lat, table.lng) <= table.radiusM;
}

export interface GeoReading {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Decides whether a guest looks like they are actually at the villa.
 *
 * Deliberately advisory, not a gate. Phone GPS under a villa roof is routinely
 * off by a few hundred metres, and iOS refuses the permission outright often
 * enough that hard-blocking would lock out paying guests. The physical QR
 * sticker inside the villa is the real proof of presence; this only flags
 * orders that look odd so staff can glance at them.
 *
 * Distance is always computed here on the server. A client-reported distance
 * is just a number an attacker types.
 */
export function evaluateGeo(
  table: Pick<VillaTable, 'lat' | 'lng' | 'radiusM'>,
  reading: GeoReading | null,
): { status: GeoStatus; distanceM: number | null } {
  if (!reading) return { status: 'UNAVAILABLE', distanceM: null };
  // No pin, or one coarser than the fence it would be measured against — a
  // district-level coordinate against a 300 m radius flags every guest who
  // ever scans. Nothing to compare until someone stands at the villa and
  // captures a real one.
  const { lat, lng } = table;
  if (lat === null || lng === null || !pinIsUsable(table)) {
    return { status: 'UNKNOWN', distanceM: null };
  }

  const distanceM = Math.round(haversine(reading.lat, reading.lng, lat, lng));

  // Give the guest the benefit of their own GPS error margin rather than
  // flagging someone standing in the villa whose phone reports ±200m.
  const tolerance = table.radiusM + Math.min(reading.accuracy || 0, 500);
  return {
    status: distanceM <= tolerance ? 'OK' : 'OUTSIDE',
    distanceM,
  };
}
