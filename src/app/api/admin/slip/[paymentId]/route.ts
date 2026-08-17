import { requireAdmin } from '@/lib/admin/auth';
import { getPayment } from '@/lib/payments';
import { handler, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Authenticated proxy for payment slips.
 *
 * The blob URL is never handed to a browser. Staff see the image through this
 * route, which means losing a screenshot of the admin page does not leak a
 * permanently readable link to a guest's bank slip.
 */
export const GET = handler(
  async (req: Request, { params }: { params: Promise<{ paymentId: string }> }) => {
    const auth = await requireAdmin(req, 'STAFF');
    if (!auth.ok) return auth.response;

    const { paymentId } = await params;
    const payment = await getPayment(paymentId);
    if (!payment?.slipUrl) return fail('ไม่พบสลิป', 404);

    const upstream = await fetch(payment.slipUrl, { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return fail('โหลดรูปสลิปไม่สำเร็จ', 502);
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        // Private: a shared browser cache must not retain payment evidence.
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `inline; filename="slip-${paymentId}.jpg"`,
      },
    });
  },
);
