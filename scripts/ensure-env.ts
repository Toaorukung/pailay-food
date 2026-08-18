/**
 * Creates .env.local with real random secrets on first run.
 *
 * Runs before `npm run dev`. Without it the first thing a new developer meets
 * is three "generate a secret" instructions before a single page renders — and
 * the temptation to hardcode a placeholder that later ships to production.
 *
 * Never overwrites an existing file, and never touches production: the app
 * refuses to start without real secrets when NODE_ENV is production, which is
 * exactly what should happen if this file was skipped during deployment.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const FILE = '.env.local';

if (existsSync(FILE)) process.exit(0);

const secret = () => randomBytes(32).toString('base64');

writeFileSync(
  FILE,
  `# Generated automatically on first run. Gitignored — never commit this.
#
# As written, the app runs standalone: bundled menu, in-memory store, no
# external accounts. Add the Google Sheets and Upstash values from
# .env.example when you are ready to make data durable.

NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Real random secrets — reuse these when deploying.
# Changing TABLE_SECRET invalidates every QR code already printed.
TABLE_SECRET="${secret()}"
SESSION_SECRET="${secret()}"
CRON_SECRET="${secret()}"

# The villa's published PromptPay number, from their printed menu.
PROMPTPAY_ID="0951519501"

# Standalone admin sign-in. Change this before anyone else can reach the app.
DEMO_ADMIN_PASSWORD="pailay-admin"
`,
  'utf8',
);

console.log(`
  Created ${FILE} with fresh secrets.

  Running standalone — bundled menu, in-memory store.
  Open http://localhost:3000 and pick a villa to start ordering.
  Admin: /admin/login  ·  owner / pailay-admin
`);
