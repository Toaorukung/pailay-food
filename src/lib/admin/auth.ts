import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from '../env';
import { kv, K } from '../kv';
import { loadAdminUsers } from '../sheets/repo';
import { verifyPassword } from './password';
import { rateLimit } from '../ratelimit';
import { hasRole, type AdminRole, type AdminUser } from '../types';

/**
 * Admin authentication.
 *
 * Two ways in, one session. Google OAuth for the owner and managers (their
 * account already has 2FA, and there is no password for us to leak), plus
 * username/password for kitchen staff who have no company Google account.
 * Either path ends at the same signed cookie, so authorisation logic never has
 * to care which was used.
 *
 * Both paths check the AdminUsers tab: a valid Google login by someone who is
 * not listed, or is listed but inactive, is rejected.
 */

export const ADMIN_COOKIE = 'pf_admin';
const SESSION_HOURS = 12;
const ISSUER = 'pailay-food';
const AUDIENCE = 'pailay-admin';

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  via: 'google' | 'password';
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function issueAdminSession(session: AdminSession): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

async function verifyToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const { id, email, name, role, via } = payload as Record<string, unknown>;
    if (typeof id !== 'string' || typeof email !== 'string') return null;
    if (role !== 'OWNER' && role !== 'MANAGER' && role !== 'STAFF') return null;
    return {
      id,
      email,
      name: typeof name === 'string' ? name : email,
      role,
      via: via === 'google' ? 'google' : 'password',
    };
  } catch {
    return null;
  }
}

/** Reads the admin session from cookies() — for server components. */
export async function currentAdmin(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifyToken(store.get(ADMIN_COOKIE)?.value);
}

/** Reads it from a Request — for route handlers. */
export async function adminFromRequest(req: Request): Promise<AdminSession | null> {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ADMIN_COOKIE) {
      return verifyToken(decodeURIComponent(rest.join('=')));
    }
  }
  return null;
}

/**
 * Route-handler guard. Middleware also gates /admin, but every mutating route
 * re-checks here — middleware protects pages, not the API surface behind them,
 * and a role check that exists in only one place is a role check waiting to be
 * bypassed.
 */
export async function requireAdmin(
  req: Request,
  minRole: AdminRole = 'STAFF',
): Promise<{ ok: true; admin: AdminSession } | { ok: false; response: Response }> {
  const admin = await adminFromRequest(req);
  if (!admin) {
    return {
      ok: false,
      response: Response.json({ error: 'ต้องเข้าสู่ระบบ' }, { status: 401 }),
    };
  }
  if (!hasRole(admin.role, minRole)) {
    return {
      ok: false,
      response: Response.json({ error: 'สิทธิ์ไม่เพียงพอ' }, { status: 403 }),
    };
  }
  return { ok: true, admin };
}

// ── Credential login ────────────────────────────────────────

export type LoginOutcome =
  | { ok: true; session: AdminSession }
  | { ok: false; error: string; status: number };

/**
 * Username/password login.
 *
 * Always runs a hash verification, even for an unknown username, so response
 * timing does not reveal which accounts exist. The dummy hash below is a real
 * scrypt hash of a random value, so the work performed matches the real path.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function loginWithPassword(
  identifier: string,
  password: string,
  ip: string,
): Promise<LoginOutcome> {
  const key = `${ip}:${identifier.toLowerCase()}`;
  const limit = await rateLimit('login', key);
  if (!limit.ok) {
    return {
      ok: false,
      status: 429,
      error: `พยายามเข้าสู่ระบบบ่อยเกินไป ลองใหม่ใน ${Math.ceil(limit.resetInSeconds / 60)} นาที`,
    };
  }

  const users = await loadAdminUsers();
  const needle = identifier.trim().toLowerCase();
  const user = users.find(
    (u) => u.username === needle || u.email === needle,
  );

  const valid = verifyPassword(password, user?.passwordHash || DUMMY_HASH);

  if (!user || !valid || !user.isActive || !user.passwordHash) {
    await kv().incr(K.adminLoginFail(key)).catch(() => {});
    return { ok: false, status: 401, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  return { ok: true, session: toSession(user, 'password') };
}

/** Looks up a Google-authenticated email against the allowlist. */
export async function adminForGoogleEmail(
  email: string,
): Promise<AdminUser | null> {
  const users = await loadAdminUsers();
  const found = users.find((u) => u.email === email.trim().toLowerCase());
  if (!found || !found.isActive) return null;
  return found;
}

export function toSession(
  user: AdminUser,
  via: AdminSession['via'],
): AdminSession {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    via,
  };
}
