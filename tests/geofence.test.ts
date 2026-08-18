import { describe, expect, it } from 'vitest';
import { evaluateGeo, haversine, pinUncertaintyM } from '../src/lib/geo';

/**
 * The geofence is advisory, so its failure mode is not a locked-out guest —
 * it is a warning that fires on everyone and therefore means nothing. That is
 * what a district-level pin did: every villa carried (12.8, 99.9667), a
 * coordinate naming an 11 km band, measured against a 300 m radius.
 */

const villa = (lat: number | null, lng: number | null, radiusM = 300) => ({
  lat,
  lng,
  radiusM,
});

const at = (lat: number, lng: number, accuracy = 10) => ({ lat, lng, accuracy });

describe('pinUncertaintyM', () => {
  it('reads precision off the decimals that survived being a number', () => {
    expect(pinUncertaintyM(12.8, 99.9667)).toBeCloseTo(11_100, -2);
    expect(pinUncertaintyM(12.79, 99.96)).toBeCloseTo(1_110, -1);
    expect(pinUncertaintyM(12.795123, 99.968456)).toBeLessThan(1);
  });

  it('takes the coarser of the two, not the finer', () => {
    // A precise longitude cannot rescue a latitude rounded to a district.
    expect(pinUncertaintyM(12.8, 99.968456)).toBeCloseTo(11_100, -2);
  });

  it('treats a whole number as no precision at all', () => {
    expect(pinUncertaintyM(13, 100)).toBeCloseTo(111_000, -3);
  });
});

describe('evaluateGeo', () => {
  it('says nothing when the pin is coarser than its own radius', () => {
    // The exact case in production: the guest is genuinely 849 km away, but
    // the villa's pin cannot support a 300 m judgement either way.
    const result = evaluateGeo(villa(12.8, 99.9667), at(19.9, 99.83));
    expect(result.status).toBe('UNKNOWN');
    expect(result.distanceM).toBeNull();
  });

  it('still says nothing when there is no pin', () => {
    expect(evaluateGeo(villa(null, null), at(12.795, 99.968)).status).toBe('UNKNOWN');
  });

  it('judges normally once the pin is precise enough', () => {
    const pinned = villa(12.795123, 99.968456);
    expect(evaluateGeo(pinned, at(12.795200, 99.968500)).status).toBe('OK');
    expect(evaluateGeo(pinned, at(12.900000, 99.968456)).status).toBe('OUTSIDE');
  });

  it('accepts a coarse pin when the radius is coarse to match', () => {
    // Two decimals is ~1.1 km, which a 2 km fence can genuinely use.
    const wide = villa(12.79, 99.96, 2_000);
    expect(evaluateGeo(wide, at(12.7905, 99.9605)).status).toBe('OK');
  });

  it('forgives the guest their own GPS error, up to a limit', () => {
    const pinned = villa(12.795123, 99.968456);
    const justOutside = at(12.798_5, 99.968456, 400); // ~375 m away
    expect(evaluateGeo(pinned, justOutside).status).toBe('OK');
    // The allowance is capped, so a phone claiming ±50 km is not a free pass.
    expect(evaluateGeo(pinned, at(12.9, 99.968456, 100_000)).status).toBe('OUTSIDE');
  });

  it('reports nothing at all when the phone gave no reading', () => {
    const result = evaluateGeo(villa(12.795123, 99.968456), null);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.distanceM).toBeNull();
  });
});

describe('haversine', () => {
  it('measures a known short hop', () => {
    // One ten-thousandth of a degree of latitude is ~11.1 m.
    expect(haversine(12.795, 99.968, 12.7951, 99.968)).toBeCloseTo(11.1, 0);
  });
});
