import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/admin/auth';
import { processUpload, UploadError, MAX_UPLOAD_BYTES } from '@/lib/images';
import { randomId } from '@/lib/ids';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Menu photo upload. Same sniff-and-re-encode pipeline as guest slips — an
 * admin account is not a reason to store bytes we have not inspected.
 *
 * Unlike slips these are genuinely public: the URL goes straight into the
 * guest menu, so it is stored on the item row as-is.
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('อ่านไฟล์ไม่สำเร็จ', 400);
  }

  const file = form.get('image');
  if (!(file instanceof File)) return fail('กรุณาเลือกไฟล์รูป', 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail('ไฟล์ใหญ่เกิน 5MB', 413);

  let processed;
  try {
    processed = await processUpload(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, 400);
    console.error('[upload] failed', err);
    return fail('ประมวลผลรูปไม่สำเร็จ', 400);
  }

  const blob = await put(
    `menu/${randomId(10)}.${processed.extension}`,
    processed.data,
    {
      access: 'public',
      contentType: processed.contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    },
  );

  return ok({ url: blob.url, width: processed.width, height: processed.height });
});
