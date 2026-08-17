import { requireSession, guardResponse } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { addToCart, setLineQty, clearCart } from '@/lib/cart';
import { computeTotals } from '@/lib/pricing';
import { allergenConflicts } from '@/lib/search';
import { rateLimit } from '@/lib/ratelimit';
import {
  addToCartSchema,
  updateCartLineSchema,
  parseBody,
} from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/** Add a line. */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const limit = await rateLimit('cart', sessionId);
  if (!limit.ok) return fail('ดำเนินการถี่เกินไป กรุณารอสักครู่', 429);

  const body = await parseBody(req, addToCartSchema);
  if (!body.ok) return fail(body.error);

  const catalog = await getCatalog();
  const item = catalog.items.find((i) => i.id === body.data.menuId);
  if (!item) return fail('ไม่พบรายการอาหารนี้', 404);

  // The allergy acknowledgement is enforced here, not only in the dialog.
  // A guest who has declared an allergy must actively confirm before the dish
  // can enter their cart, and the confirmation is recorded on the line so the
  // kitchen ticket shows it.
  const conflicts = allergenConflicts(item, guard.session.allergyProfile);
  if (conflicts.certain.length > 0 && !body.data.allergenAck) {
    return fail('กรุณายืนยันการรับทราบคำเตือนเรื่องการแพ้อาหารก่อนสั่ง', 409, {
      code: 'ALLERGEN_ACK_REQUIRED',
      allergens: conflicts.certain,
    });
  }

  // Same shape as the allergy gate: the dialog asks, and the server insists.
  // Thai law puts the obligation on the seller, so "the UI asked" is not a
  // defence if the request can simply be replayed without the flag.
  if (item.isAlcohol && !body.data.ageConfirmed) {
    return fail(
      `เครื่องดื่มแอลกอฮอล์จำหน่ายเฉพาะผู้มีอายุ ${catalog.settings.alcoholMinAge} ปีขึ้นไป`,
      409,
      { code: 'AGE_CONFIRM_REQUIRED', minAge: catalog.settings.alcoholMinAge },
    );
  }

  const result = await addToCart(sessionId, catalog, body.data);
  if (!result.ok) return fail(result.error ?? 'เพิ่มลงตะกร้าไม่สำเร็จ', 400);

  return ok({
    cart: result.cart,
    totals: computeTotals(result.cart.lines, catalog.settings),
  });
});

/** Change or remove a line (qty 0 removes). */
export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const limit = await rateLimit('cart', sessionId);
  if (!limit.ok) return fail('ดำเนินการถี่เกินไป กรุณารอสักครู่', 429);

  const body = await parseBody(req, updateCartLineSchema);
  if (!body.ok) return fail(body.error);

  const catalog = await getCatalog();
  const result = await setLineQty(sessionId, body.data.key, body.data.qty);
  if (!result.ok) return fail(result.error ?? 'แก้ไขตะกร้าไม่สำเร็จ', 400);

  return ok({
    cart: result.cart,
    totals: computeTotals(result.cart.lines, catalog.settings),
  });
});

/** Empty the cart. */
export const DELETE = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const catalog = await getCatalog();
  const cart = await clearCart(sessionId);
  return ok({ cart, totals: computeTotals(cart.lines, catalog.settings) });
});
