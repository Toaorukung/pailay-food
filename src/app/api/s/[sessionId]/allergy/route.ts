import { requireSession, guardResponse, updateSession } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { allergyProfileSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Stores the guest's declared allergies on the session.
 *
 * Ids are checked against the live allergen list rather than stored as sent —
 * an unknown id would silently never match anything, which on a page whose job
 * is to warn about allergies is the worst possible failure mode.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const body = await parseBody(req, allergyProfileSchema);
  if (!body.ok) return fail(body.error);

  const catalog = await getCatalog();
  const known = new Set(catalog.allergens.map((a) => a.id));
  const unknown = body.data.allergens.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return fail(`ไม่รู้จักสารก่อภูมิแพ้: ${unknown.join(', ')}`, 400);
  }

  const session = await updateSession(sessionId, {
    allergyProfile: body.data.allergens,
    guestName: body.data.guestName ?? '',
  });

  return ok({
    allergyProfile: session?.allergyProfile ?? [],
    guestName: session?.guestName ?? '',
  });
});
