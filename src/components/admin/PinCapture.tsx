'use client';

import { useState } from 'react';
import { Crosshair, TriangleAlert } from 'lucide-react';
import { Button, Field } from '@/components/ui';
import { pinUncertaintyM } from '@/lib/geo';

/**
 * Captures the villa's coordinates from the device standing in it.
 *
 * Typing a pin off a map is where the placeholder coordinates came from: a
 * district centroid rounded to one decimal, which names an 11 km band and made
 * the 300 m fence flag every guest. One tap on the terrace produces a figure
 * with the precision the radius actually needs.
 *
 * Writes latitude and longitude together, because they are one reading taken
 * at one moment and a half-applied pin is worse than none.
 */
export function PinCapture({
  values,
  set,
}: {
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const lat = toNumber(values.lat);
  const lng = toNumber(values.lng);
  const radius = toNumber(values.radius_m) ?? 300;

  const uncertainty =
    lat !== null && lng !== null ? pinUncertaintyM(lat, lng) : null;
  const tooCoarse = uncertainty !== null && uncertainty > radius;

  function capture() {
    if (!('geolocation' in navigator)) {
      setError('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        setAccuracy(Math.round(pos.coords.accuracy));
        // Six decimals is about 0.1 m — finer than any phone reports, and
        // enough that the stored figure never becomes the limiting factor.
        set('lat', Number(pos.coords.latitude.toFixed(6)));
        set('lng', Number(pos.coords.longitude.toFixed(6)));
      },
      (err) => {
        setBusy(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์แล้วลองใหม่'
            : 'อ่านตำแหน่งไม่สำเร็จ ลองออกไปที่โล่งแล้วกดใหม่',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <Field
      label="ปักหมุดวิลล่า"
      hint="ยืนอยู่ที่วิลล่าแล้วกดปุ่มนี้ — แม่นกว่าการพิมพ์พิกัดจากแผนที่มาก"
    >
      <div className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          full
          loading={busy}
          onClick={capture}
        >
          <Crosshair className="size-4" />
          ใช้ตำแหน่งปัจจุบัน
        </Button>

        {accuracy !== null && (
          <p className="text-xs muted">
            อ่านค่าได้แล้ว · ความแม่นยำของเครื่อง ±{accuracy} ม.
            {accuracy > radius &&
              ` — มากกว่ารัศมี ${radius} ม. ที่ตั้งไว้ ลองกดใหม่ที่กลางแจ้ง`}
          </p>
        )}

        {tooCoarse && (
          <p className="flex items-start gap-1.5 text-xs text-[var(--warning)]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            พิกัดนี้ละเอียดแค่ราว {formatDistance(uncertainty)} แต่รัศมีตั้งไว้{' '}
            {radius} ม. — ระบบจะข้ามการเตือนนอกพื้นที่จนกว่าจะปักหมุดใหม่
          </p>
        )}

        {error && (
          <p className="text-xs text-[var(--danger)]">{error}</p>
        )}
      </div>
    </Field>
  );
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${Math.round(m / 1000)} กม.` : `${Math.round(m)} ม.`;
}
