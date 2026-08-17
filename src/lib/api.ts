/** Small helpers so every route handler answers in the same shape. */

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...data }, init);
}

export function fail(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Wraps a handler so an unexpected throw becomes a 500 with a logged stack
 * rather than an opaque runtime error — and so internal messages (which can
 * contain sheet ids or key fragments) never reach the client.
 */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error('[api] unhandled', err);
      return fail('เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่', 500);
    }
  };
}
