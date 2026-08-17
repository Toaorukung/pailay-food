import { env } from '@/lib/env';
import { drain } from '@/lib/sheets/queue';
import { handler, ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Safety net for the write-behind queue.
 *
 * The primary path is `after()` on each write, which drains within a second of
 * the guest's action. This cron pass exists for the cases that path cannot
 * cover: a function that died mid-drain, a Sheets outage that forced a requeue,
 * or a Redis blip that delayed an enqueue.
 *
 * Note for Hobby-plan deployments: Vercel only runs crons once per day there.
 * The app still syncs promptly because of the post-write drain; the cron
 * frequency in vercel.json only matters for retries.
 */
export const GET = handler(async (req: Request) => {
  const provided = req.headers.get('authorization');
  if (provided !== `Bearer ${env.cronSecret}`) {
    return fail('Unauthorized', 401);
  }

  const result = await drain();
  return ok({ result });
});
