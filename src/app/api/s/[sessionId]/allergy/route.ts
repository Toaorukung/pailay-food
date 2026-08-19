import { requireSession, guardResponse, updateSession } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { allergyProfileSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';
import type { GuestSession } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Stores what the guest tells us about themselves: their name and phone from
 * the opening steps, and their allergies from the step after them.
 *
 * Only the fields actually sent are written. The steps arrive as separate
 * requests, so treating an absent field as an empty one would have each step
 * erase the one before it.
 *
 * Allergen ids are checked against the live allergen list rather than stored as
 * sent — an unknown id would silently never match anything, which on a page
 * whose job is to warn about allergies is the worst possible failure mode.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const body = await parseBody(req, allergyProfileSchema);
  if (!body.ok) return fail(body.error);

  const patch: Partial<GuestSession> = {};

  if (body.data.allergens) {
    const catalog = await getCatalog();
    const known = new Set(catalog.allergens.map((a) => a.id));
    const unknown = body.data.allergens.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return fail(`ไม่รู้จักสารก่อภูมิแพ้: ${unknown.join(', ')}`, 400);
    }
    patch.allergyProfile = body.data.allergens;
  }

  if (body.data.guestName !== undefined) patch.guestName = body.data.guestName.trim();
  if (body.data.guestPhone !== undefined) patch.guestPhone = body.data.guestPhone;

  const session = await updateSession(sessionId, patch);

  return ok({
    allergyProfile: session?.allergyProfile ?? [],
    guestName: session?.guestName ?? '',
    guestPhone: session?.guestPhone ?? '',
  });
});
