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
  if (table.lat === null || table.lng === null) {
    // Villa has no coordinates configured yet — nothing to compare against.
    return { status: 'UNKNOWN', distanceM: null };
  }

  const distanceM = Math.round(
    haversine(reading.lat, reading.lng, table.lat, table.lng),
  );

  // Give the guest the benefit of their own GPS error margin rather than
  // flagging someone standing in the villa whose phone reports ±200m.
  const tolerance = table.radiusM + Math.min(reading.accuracy || 0, 500);
  return {
    status: distanceM <= tolerance ? 'OK' : 'OUTSIDE',
    distanceM,
  };
}
