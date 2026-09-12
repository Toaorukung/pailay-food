import { requireAdmin } from '@/lib/admin/auth';
import { handler, fail, ok } from '@/lib/api';
import {
  pushTextDetailed,
  getLineChannelToken,
  cleanLineToken,
  getBotInfo,
  verifyTokenWithLine,
  fetchOAuthToken,
} from '@/lib/line';
import { z } from 'zod';
import { parseBody } from '@/lib/validation';
import { kv, K } from '@/lib/kv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const testSchema = z.object({
  channelId: z.string().optional(),
  channelSecret: z.string().optional(),
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

// POST: Tests token validity with LINE API and sends a push message. Restricted to OWNER only.
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, testSchema);
  if (!body.ok) return fail(body.error);

  let tokenToUse = body.data.token ? cleanLineToken(body.data.token) : '';

  if (!tokenToUse && body.data.channelId && body.data.channelSecret) {
    const fetched = await fetchOAuthToken(body.data.channelId, body.data.channelSecret);
    if (fetched) {
      tokenToUse = fetched;
    }
  }

  if (!tokenToUse) {
    tokenToUse = await getLineChannelToken();
  }

  if (!tokenToUse) {
    return fail('ยังไม่ได้ระบุ Channel ID/Secret หรือ Channel Access Token', 400);
  }

  // Step 1: Verify token with LINE Bot Info API
  const botInfo = await getBotInfo(tokenToUse);
  if (!botInfo.ok) {
    const oauthCheck = await verifyTokenWithLine(tokenToUse);
    const tokenPreview = `${tokenToUse.slice(0, 10)}...${tokenToUse.slice(-6)} (ความยาว ${tokenToUse.length} ตัวอักษร)`;

    return fail(
      `LINE API ปฏิเสธ Token (${botInfo.status}): ${botInfo.error}\n` +
      `รายละเอียดจาก LINE OAuth: ${oauthCheck.message}\n` +
      `Token ที่ส่งไป: ${tokenPreview}`,
      400,
    );
  }

  // Step 2: Push message to target user
  const result = await pushTextDetailed(body.data.targetUserId, body.data.message, tokenToUse);
  if (!result.ok) {
    return fail(
      `เชื่อมต่อบอท "${botInfo.bot.displayName}" (@${botInfo.bot.basicId}) สำเร็จ แต่ส่งหาผู้ใช้ไม่สำเร็จ: ${result.error}`,
      400,
    );
  }

  return ok({
    success: true,
    message: `ส่งข้อความทดสอบจากบอท "${botInfo.bot.displayName}" (@${botInfo.bot.basicId}) ไปยัง LINE สำเร็จแล้ว! 🎉`,
  });
});

