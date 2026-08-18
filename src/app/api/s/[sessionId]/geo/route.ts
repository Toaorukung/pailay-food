import { requireSession, guardResponse, updateSession } from '@/lib/session';
import { getTable } from '@/lib/tables';
import { evaluateGeo } from '@/lib/geo';
import { geoReportSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Receives a raw GPS reading and records the result on the session.
 *
 * The browser sends coordinates and its own accuracy estimate; the distance is
 * computed here. A client that posts `distance: 0` gains nothing, because that
 * field does not exist in the request.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const body = await parseBody(req, geoReportSchema);
  if (!body.ok) return fail(body.error);

  const table = await getTable(guard.session.tableId);
  if (!table) return fail('ไม่พบข้อมูลวิลล่า', 404);

  const { status, distanceM } = evaluateGeo(table, body.data);
  await updateSession(sessionId, { geoStatus: status, distanceM });

  return ok({ geoStatus: status, distanceM });
});

/** The browser denied permission or timed out — record that, do not block. */
export const DELETE = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  await updateSession(sessionId, { geoStatus: 'DENIED', distanceM: null });
  return ok({ geoStatus: 'DENIED' });
});
