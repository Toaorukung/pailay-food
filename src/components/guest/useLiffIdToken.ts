'use client';

import { useEffect, useState } from 'react';

/**
 * Gets a LIFF id token, if the page is running inside LINE.
 *
 * The token is proof of which LINE account is looking at the screen, and it is
 * the only thing that lets the villa message a guest back when their order is
 * confirmed. It is verified on the server; nothing here is trusted.
 *
 * Deliberately never blocks and never surfaces an error. The link is also
 * shared outside LINE, LIFF's CDN can be slow on villa wifi, and a guest whose
 * SDK failed to load must still be able to order — they simply get no LINE
 * message. Every failure path therefore ends at "no token", not at a message
 * asking the guest to do something about it.
 */

const SDK_URL = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
const SDK_ELEMENT_ID = 'liff-sdk';

interface Liff {
  init(config: { liffId: string; withLoginOnExternalBrowser?: boolean }): Promise<void>;
  isLoggedIn(): boolean;
  getIDToken(): string | null;
}

declare global {
  interface Window {
    liff?: Liff;
  }
}

function loadSdk(): Promise<Liff | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.liff) return Promise.resolve(window.liff);

  return new Promise((resolve) => {
    // A second mount must reuse the tag rather than fetch the SDK again.
    const existing = document.getElementById(SDK_ELEMENT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.liff ?? null), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SDK_ELEMENT_ID;
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.liff ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

export function useLiffIdToken(liffId: string): string | null {
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    if (!liffId) return;
    let cancelled = false;

    (async () => {
      try {
        const liff = await loadSdk();
        if (!liff || cancelled) return;

        // Outside the LINE app this would otherwise redirect the guest through
        // a login page they did not ask for. In LINE it is already true.
        await liff.init({ liffId, withLoginOnExternalBrowser: false });
        if (cancelled || !liff.isLoggedIn()) return;

        const token = liff.getIDToken();
        if (token && !cancelled) setIdToken(token);
      } catch (err) {
        // Logged, not shown: the guest can order perfectly well without this.
        console.warn('[liff] unavailable', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return idToken;
}
