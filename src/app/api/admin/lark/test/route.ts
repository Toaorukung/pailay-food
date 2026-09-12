import { requireAdmin } from '@/lib/admin/auth';
import { handler, fail, ok } from '@/lib/api';
import { sendLarkTest, getLarkConfig } from '@/lib/lark';
import { z } from 'zod';
import { parseBody } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const testSchema = z.object({
  url: z.string().optional(),
  secret: z.string().optional(),
});

// GET: Returns Lark configuration status. Restricted to OWNER only.
export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const cfg = await getLarkConfig();

  return ok({
    configured: Boolean(cfg?.url),
    hasSecret: Boolean(cfg?.secret),
  });
});

// POST: Sends a test notification to Lark. Restricted to OWNER only.
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, testSchema);
  if (!body.ok) return fail(body.error);

  let explicitConfig;
  if (body.data.url?.trim()) {
    explicitConfig = {
      url: body.data.url.trim(),
      secret: body.data.secret?.trim() || undefined,
    };
  }

  const result = await sendLarkTest(explicitConfig);

  if (!result.ok) {
    return fail(result.error || 'ส่งข้อความเข้า Lark ไม่สำเร็จ', 400);
  }

  return ok({
    success: true,
    message: 'ส่งข้อความทดสอบเข้ากลุ่ม Lark สำเร็จเรียบร้อยแล้ว! 🎉',
  });
});
