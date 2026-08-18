/**
 * In-process stand-in for Upstash Redis.
 *
 * Implements exactly the commands this app uses, with the same semantics and
 * return shapes, so nothing above it has to know which store it is talking to.
 *
 * Deliberately not a general Redis clone: the point is that the ordering
 * system runs on a laptop with no accounts and no network. It holds everything
 * in one process, which means it is correct for `next dev` and for a single
 * long-running server, and wrong for serverless — a session created on one
 * instance does not exist on the next. `demo.ts` reports that as
 * `durable: false`, and the admin dashboard says so out loud.
 */

interface Entry {
  value: unknown;
  /** Epoch ms, or null for no expiry. */
  expiresAt: number | null;
}

type ZMember = { score: number; member: string };

export class MemoryStore {
  private data = new Map<string, Entry>();

  // ── Expiry ────────────────────────────────────────────────

  private live(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  private put(key: string, value: unknown, expiresAt: number | null): void {
    this.data.set(key, { value, expiresAt });
  }

  // ── Strings ───────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    // Upstash deserialises JSON for you; callers rely on getting objects back.
    return entry ? (structuredClone(entry.value) as T) : null;
  }

  async set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number; px?: number },
  ): Promise<'OK' | null> {
    if (opts?.nx && this.live(key)) return null;

    const expiresAt =
      opts?.ex !== undefined
        ? Date.now() + opts.ex * 1000
        : opts?.px !== undefined
          ? Date.now() + opts.px
          : null;

    this.put(key, structuredClone(value), expiresAt);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) if (this.data.delete(key)) n++;
    return n;
  }

  async incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + 1;
    this.put(key, next, entry?.expiresAt ?? null);
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async mget<T>(...keys: string[]): Promise<T> {
    const flat = keys.flat() as string[];
    return flat.map((k) => {
      const entry = this.live(k);
      return entry ? structuredClone(entry.value) : null;
    }) as T;
  }

  async mset(pairs: Record<string, unknown>): Promise<'OK'> {
    for (const [key, value] of Object.entries(pairs)) {
      this.put(key, structuredClone(value), null);
    }
    return 'OK';
  }

  // ── Lists ─────────────────────────────────────────────────

  private list(key: string): unknown[] {
    const entry = this.live(key);
    if (entry && Array.isArray(entry.value)) return entry.value as unknown[];
    const fresh: unknown[] = [];
    this.put(key, fresh, entry?.expiresAt ?? null);
    return fresh;
  }

  async rpush(key: string, ...values: unknown[]): Promise<number> {
    const arr = this.list(key);
    arr.push(...values.flat());
    return arr.length;
  }

  async lpop<T>(key: string, count?: number): Promise<T | null> {
    const arr = this.list(key);
    if (arr.length === 0) return count === undefined ? null : ([] as unknown as T);
    if (count === undefined) return arr.shift() as T;
    return arr.splice(0, count) as unknown as T;
  }

  async llen(key: string): Promise<number> {
    return this.list(key).length;
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const arr = this.list(key);
    // Redis treats -1 as "through the end" and its stop index is inclusive.
    const from = start < 0 ? Math.max(0, arr.length + start) : start;
    const to = stop < 0 ? arr.length + stop : stop;
    return arr.slice(from, to + 1) as T[];
  }

  // ── Sets ──────────────────────────────────────────────────

  private set_(key: string): Set<string> {
    const entry = this.live(key);
    if (entry && entry.value instanceof Set) return entry.value as Set<string>;
    const fresh = new Set<string>();
    this.put(key, fresh, entry?.expiresAt ?? null);
    return fresh;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.set_(key);
    let added = 0;
    for (const m of members.flat()) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  // ── Sorted sets ───────────────────────────────────────────

  private zset(key: string): ZMember[] {
    const entry = this.live(key);
    if (entry && Array.isArray(entry.value)) return entry.value as ZMember[];
    const fresh: ZMember[] = [];
    this.put(key, fresh, entry?.expiresAt ?? null);
    return fresh;
  }

  async zadd(key: string, ...entries: ZMember[]): Promise<number> {
    const zs = this.zset(key);
    let added = 0;
    for (const e of entries.flat()) {
      const existing = zs.find((x) => x.member === e.member);
      if (existing) existing.score = e.score;
      else {
        zs.push({ ...e });
        added++;
      }
    }
    zs.sort((a, b) => a.score - b.score);
    return added;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const zs = this.zset(key);
    const wanted = new Set(members.flat());
    const before = zs.length;
    for (let i = zs.length - 1; i >= 0; i--) {
      if (wanted.has(zs[i].member)) zs.splice(i, 1);
    }
    return before - zs.length;
  }

  /**
   * Covers the two forms the app uses: index ranges (with `rev`) and score
   * ranges (with `byScore`). Members only — no `withScores` caller exists.
   */
  async zrange<T>(
    key: string,
    min: number | string,
    max: number | string,
    opts?: { byScore?: boolean; rev?: boolean },
  ): Promise<T> {
    const zs = [...this.zset(key)].sort((a, b) => a.score - b.score);

    if (opts?.byScore) {
      const lo = min === '-inf' ? -Infinity : Number(min);
      const hi = max === '+inf' ? Infinity : Number(max);
      return zs
        .filter((e) => e.score >= lo && e.score <= hi)
        .map((e) => e.member) as unknown as T;
    }

    const ordered = opts?.rev ? zs.reverse() : zs;
    const start = Number(min);
    const stop = Number(max);
    const from = start < 0 ? Math.max(0, ordered.length + start) : start;
    const to = stop < 0 ? ordered.length + stop : stop;
    return ordered.slice(from, to + 1).map((e) => e.member) as unknown as T;
  }
}

/**
 * Survives Next.js dev-server hot reloads, which otherwise re-evaluate module
 * scope and would drop every open session on each file save.
 */
const globalForStore = globalThis as unknown as { __pailayStore?: MemoryStore };

export function memoryStore(): MemoryStore {
  globalForStore.__pailayStore ??= new MemoryStore();
  return globalForStore.__pailayStore;
}
