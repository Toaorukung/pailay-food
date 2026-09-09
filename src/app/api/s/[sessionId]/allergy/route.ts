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

  // One read serves both checks; the steps that send allergies and the step
  // that sends intake answers both need the live catalog.
  const catalog =
    body.data.allergens || body.data.guestExtra ? await getCatalog() : null;

  if (body.data.allergens && catalog) {
    const known = new Set(catalog.allergens.map((a) => a.id));
    const unknown = body.data.allergens.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return fail(`ไม่รู้จักสารก่อภูมิแพ้: ${unknown.join(', ')}`, 400);
    }
    patch.allergyProfile = body.data.allergens;
  }

  if (body.data.guestExtra && catalog) {
    const sent = body.data.guestExtra;
    // Driven by the catalog, not by the payload: the label stored beside each
    // answer has to be the villa's wording, and an id the villa does not ask
    // about is simply not written.
    //
    // Unlike an unknown allergen this is not an error. A guest whose page
    // loaded before the owner deleted a question would otherwise be locked out
    // of the step, and a dropped answer to a question nobody asks any more
    // costs nothing — where a dropped allergy could cost a great deal.
    patch.guestExtra = catalog.guestFields
      .map((field) => ({
        fieldId: field.id,
        label: field.label.th || field.label.en || field.id,
        value: (sent[field.id] ?? '').trim(),
      }))
      .filter((answer) => answer.value !== '');
  }

  if (body.data.guestName !== undefined) patch.guestName = body.data.guestName.trim();
  if (body.data.guestPhone !== undefined) patch.guestPhone = body.data.guestPhone;

  const session = await updateSession(sessionId, patch);

  return ok({
    allergyProfile: session?.allergyProfile ?? [],
    guestName: session?.guestName ?? '',
    guestPhone: session?.guestPhone ?? '',
    guestExtra: session?.guestExtra ?? [],
  });
});
