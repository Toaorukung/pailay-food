'use client';

import type { SessionSnapshot, PublicPayment } from '@/lib/snapshot';

/** Everything needed to render a payment screen for one order. */
export interface PaymentContext {
  payment: PublicPayment;
  qr: { dataUrl: string; payload: string } | null;
  promptPayId: string;
  promptPayName: string;
  paymentNote: { th: string; en: string; zh: string };
}
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
   * Name and phone on their own, from the step that asks for them before the
   * guest has seen the allergen list. Allergies are deliberately not sent, so
   * this cannot clear a profile saved earlier in the stay.
   */
  saveGuest: (
    sessionId: string,
    body: { guestName: string; guestPhone: string },
  ) =>
    call<GuestProfile>(`/api/s/${sessionId}/allergy`, {
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
    call<PaymentContext & { order: Order; removed?: { name: string }[] }>(
      `/api/s/${sessionId}/order`,
      { method: 'POST', body: JSON.stringify({ idempotencyKey }) },
    ),

  /** Fetches the PromptPay QR for one order — used to pay and to re-pay. */
  payFor: (sessionId: string, orderId: string) =>
    call<PaymentContext & { order: Order }>(
      `/api/s/${sessionId}/pay?orderId=${encodeURIComponent(orderId)}`,
      { method: 'POST' },
    ),

  uploadSlip: (sessionId: string, orderId: string, file: Blob) => {
    const form = new FormData();
    form.append('slip', file, 'slip.jpg');
    return call<{ payment: PublicPayment }>(
      `/api/s/${sessionId}/slip?orderId=${encodeURIComponent(orderId)}`,
      { method: 'POST', body: form },
    );
  },
};

/**
 * Shrinks a photo in the browser before upload.
 *
 * A modern phone camera produces 4-8MB per shot; on villa wifi that is a long,
 * failure-prone upload for an image that only has to be readable by a human.
 * Doing it here also means an iPhone HEIC is decoded by Safari and handed to
 * us as JPEG, which keeps the server's accepted-format list short.
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  // If the canvas path produced nothing, sending the original is better than
  // failing the payment step.
  return blob ?? file;
}
