'use client';

import type { SessionSnapshot, PublicPayment } from '@/lib/snapshot';
import type { MenuCatalog, Order } from '@/lib/types';

/** What the session holds about the guest themselves. */
interface GuestProfile {
  allergyProfile: string[];
  guestName: string;
  guestPhone: string;
}

/**
 * Thin fetch layer for the guest app.
 *
 * Everything returns a discriminated result rather than throwing, because the
 * caller is always a component that needs to show the message to a guest — an
 * uncaught rejection here is a blank screen in someone's hand mid-meal.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; status: number };

async function call<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
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
    return { ok: false, error: 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', status: 0 };
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body — fall through to the status check */
  }

  if (!res.ok || json.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: (json.error as string) || 'เกิดข้อผิดพลาด กรุณาลองใหม่',
      code: json.code as string | undefined,
    };
  }
  return { ok: true, data: json as T };
}

export const guestApi = {
  state: (sessionId: string) =>
    call<SessionSnapshot>(`/api/s/${sessionId}/state`),

  menu: () => call<MenuCatalog>('/api/menu'),

  reportGeo: (
    sessionId: string,
    body: { lat: number; lng: number; accuracy: number },
  ) =>
    call<{ geoStatus: string; distanceM: number | null }>(
      `/api/s/${sessionId}/geo`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  denyGeo: (sessionId: string) =>
    call<{ geoStatus: string }>(`/api/s/${sessionId}/geo`, { method: 'DELETE' }),

  saveAllergies: (
    sessionId: string,
    body: { allergens: string[]; guestName?: string; guestPhone?: string },
  ) =>
    call<GuestProfile>(`/api/s/${sessionId}/allergy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Name, phone and the villa's own intake answers, from the step that asks for
   * them before the guest has seen the allergen list. Allergies are
   * deliberately not sent, so this cannot clear a profile saved earlier in the
   * stay.
   */
  saveGuest: (
    sessionId: string,
    body: {
      guestName: string;
      guestPhone: string;
      guestExtra?: Record<string, string>;
    },
  ) =>
    call<GuestProfile>(`/api/s/${sessionId}/allergy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  verifyBooking: (
    sessionId: string,
    body: { phone: string },
  ) =>
    call<{
      guestName: string;
      guestPhone: string;
      villa: string;
      booking?: Record<string, unknown>;
    }>(`/api/s/${sessionId}/verify-booking`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addToCart: (
    sessionId: string,
    body: {
      menuId: string;
      qty: number;
      optionIds: string[];
      note: string;
      allergenAck: boolean;
      ageConfirmed: boolean;
    },
  ) =>
    call<{ cart: SessionSnapshot['cart']; totals: SessionSnapshot['cartTotals'] }>(
      `/api/s/${sessionId}/cart`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  setQty: (sessionId: string, key: string, qty: number) =>
    call<{ cart: SessionSnapshot['cart']; totals: SessionSnapshot['cartTotals'] }>(
      `/api/s/${sessionId}/cart`,
      { method: 'PATCH', body: JSON.stringify({ key, qty }) },
    ),

  placeOrder: (sessionId: string, idempotencyKey: string) =>
    call<{
      order: Order;
      payment: PublicPayment;
      removed?: { name: string }[];
    }>(`/api/s/${sessionId}/order`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
};
