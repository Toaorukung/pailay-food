import { describe, it, expect } from 'vitest';
import { guestFieldSchema, allergyProfileSchema } from '@/lib/validation';

const base = {
  label_th: 'จำนวนผู้เข้าพัก',
  label_en: 'Number of guests',
  label_zh: '入住人数',
  type: 'number' as const,
  options_th: '',
  options_en: '',
  options_zh: '',
  required: true,
  sort_order: 10,
  is_active: true,
};

describe('guest field definition', () => {
  it('accepts a plain question', () => {
    expect(guestFieldSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a question with no Thai label', () => {
    // English alone would render as a blank label for a Thai guest, since the
    // guest app falls back to Thai rather than the other way round.
    const result = guestFieldSchema.safeParse({ ...base, label_th: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a select with no choices', () => {
    // A required dropdown with nothing in it is a step the guest cannot pass.
    const result = guestFieldSchema.safeParse({ ...base, type: 'select' });
    expect(result.success).toBe(false);
  });

  it('accepts a select once choices are listed', () => {
    const result = guestFieldSchema.safeParse({
      ...base,
      type: 'select',
      options_th: '1-2 ท่าน, 3-4 ท่าน, 5 ท่านขึ้นไป',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field type', () => {
    const result = guestFieldSchema.safeParse({ ...base, type: 'signature' });
    expect(result.success).toBe(false);
  });

  it('defaults sort order and flags so a bare row still parses', () => {
    const result = guestFieldSchema.safeParse({
      label_th: 'เลขห้อง',
      type: 'text',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(100);
      expect(result.data.required).toBe(false);
      expect(result.data.is_active).toBe(true);
    }
  });
});

describe('guest intake answers', () => {
  it('accepts answers keyed by field id', () => {
    const result = allergyProfileSchema.safeParse({
      guestName: 'สมชาย',
      guestPhone: '0951519501',
      guestExtra: { 'gf-abc': '4', 'gf-def': 'ห้อง 12' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an answer longer than the stored cap', () => {
    const result = allergyProfileSchema.safeParse({
      guestExtra: { 'gf-abc': 'ก'.repeat(501) },
    });
    expect(result.success).toBe(false);
  });

  it('treats absent answers as absent, not as an empty set', () => {
    // The steps arrive as separate requests, so an omitted key must leave what
    // an earlier step saved alone rather than clearing it.
    const result = allergyProfileSchema.safeParse({ guestName: 'สมชาย' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.guestExtra).toBeUndefined();
  });
});
