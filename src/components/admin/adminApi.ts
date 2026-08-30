'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminLive } from '@/app/api/admin/live/route';

export async function adminFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok || json.ok === false) {
    return { ok: false, error: (json.error as string) || `ผิดพลาด (${res.status})` };
  }
  return { ok: true, data: json as T };
}

export const LIVE_POLL_MS = 4_000;

/**
 * Shared live feed for the dashboard, kitchen display and payment queue.
 *
 * Polls rather than streams. See the note on /api/admin/live for why: on
 * serverless, holding an SSE connection per open tablet costs far more than a
 * 4-second poll from a handful of staff devices, and reconnect handling after
 * a wifi drop is one line instead of a state machine.
 */
export function useLive(pollMs = LIVE_POLL_MS) {
  const [data, setData] = useState<AdminLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const previousOrderIds = useRef<Set<string> | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await adminFetch<AdminLive>('/api/admin/live');
    if (res.ok) {
      const ids = new Set(res.data.orders.map((o) => o.id));
      if (previousOrderIds.current) {
        const fresh = [...ids].filter((id) => !previousOrderIds.current!.has(id));
        if (fresh.length > 0) setNewOrderIds(fresh);
      }
      previousOrderIds.current = ids;
      setData(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === 'visible') await load();
      timer = setTimeout(tick, pollMs);
    };
    timer = setTimeout(tick, pollMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, pollMs]);

  return { data, error, loading, refresh: load, newOrderIds, clearNew: () => setNewOrderIds([]) };
}

/**
 * Plays a short tone when a new order lands.
 *
 * Generated with the Web Audio API rather than shipped as a file: no asset to
 * load, and no autoplay-policy trouble because it only ever fires after the
 * member of staff has already interacted with the page.
 */
export function useOrderChime(enabled: boolean, trigger: string[]) {
  const contextRef = useRef<AudioContext | null>(null);
  const playedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || trigger.length === 0) return;

    // Only chime for IDs that have not already chimed in this session
    const unplayed = trigger.filter((id) => !playedIdsRef.current.has(id));
    if (unplayed.length === 0) return;

    unplayed.forEach((id) => playedIdsRef.current.add(id));

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;

      contextRef.current ??= new Ctor();
      const ctx = contextRef.current;
      if (ctx.state === 'suspended') void ctx.resume();

      const now = ctx.currentTime;
      [880, 1320].forEach((frequency, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.18);
      });
    } catch {
      // Audio is a nicety; a browser that blocks it must not break the KDS.
    }
  }, [enabled, trigger]);
}
