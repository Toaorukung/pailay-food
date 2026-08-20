/**
 * Drops the cached catalog so the next guest request reloads it from Sheets.
 *
 * Needed after a deploy that changes the shape of PublicSettings: the copy in
 * Redis was written by the old code and has no field for the new setting, so
 * it keeps serving a menu with the new feature missing until it goes stale.
 *
 *   npm run bust:menu
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: true });

const { bustMenuCache } = await import('../src/lib/menu-cache');

const version = await bustMenuCache();
console.log(`เคลียร์แคชเมนูแล้ว เวอร์ชันใหม่: ${version}`);
