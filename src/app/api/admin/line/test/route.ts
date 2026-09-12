import { requireAdmin } from '@/lib/admin/auth';
import { handler, fail, ok } from '@/lib/api';
import { pushTextDetailed, getLineChannelToken, cleanLineToken } from '@/lib/line';
import { z } from 'zod';
import { parseBody } from '@/lib/validation';
import { kv, K } from '@/lib/kv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const testSchema = z.object({
  token: z.string().optional(),
  targetUserId: z.string().min(1, 'ต้องระบุ LINE User ID ปลายทาง'),
  message: z.string().max(500).default('ทดสอบการเชื่อมต่อ LINE Messaging API สำเร็จ! 🎉'),
});

// GET: Returns test configuration and recent sample lineUserId
export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  let sampleUserId = '';
  try {
    const liveIds = (await kv().lrange(K.liveOrders, 0, 30)) as string[];
    for (const id of liveIds) {
      const order = await kv().get<{ lineUserId?: string }>(K.order(id));
      if (order?.lineUserId) {
        sampleUserId = order.lineUserId;
        break;
      }
    }
  } catch {}

  const currentToken = await getLineChannelToken();

  return ok({
    configured: Boolean(currentToken),
    sampleUserId: sampleUserId || 'U28a5365b9431fed9ea46241ab4bf6e30',
  });
});

// POST: Tests sending a push message. Restricted to OWNER only.
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, testSchema);
  if (!body.ok) return fail(body.error);

  const tokenToUse = body.data.token ? cleanLineToken(body.data.token) : undefined;
  const result = await pushTextDetailed(body.data.targetUserId, body.data.message, tokenToUse);

  if (!result.ok) {
    return fail(result.error || 'ส่งข้อความไม่สำเร็จ', 400);
  }

  return ok({ success: true, message: 'ส่งข้อความทดสอบไปยัง LINE สำเร็จแล้ว' });
});
