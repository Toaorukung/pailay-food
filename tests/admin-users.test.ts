import { describe, it, expect } from 'vitest';
import { createAdminUserSchema, updateAdminUserSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/admin/password';

describe('Admin User Schemas', () => {
  describe('createAdminUserSchema', () => {
    it('validates a valid full user record', () => {
      const parsed = createAdminUserSchema.safeParse({
        name: 'สมชาย ผู้จัดการ',
        username: 'somchai_mgr',
        email: 'somchai@example.com',
        role: 'MANAGER',
        password: 'securePassword123',
        isActive: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.username).toBe('somchai_mgr');
        expect(parsed.data.role).toBe('MANAGER');
      }
    });

    it('allows empty email and empty password (for Google OAuth users)', () => {
      const parsed = createAdminUserSchema.safeParse({
        name: 'พนักงาน ครัว',
        username: 'kitchen_staff',
        email: '',
        role: 'STAFF',
        password: '',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.email).toBe('');
        expect(parsed.data.password).toBe('');
        expect(parsed.data.isActive).toBe(true);
      }
    });

    it('rejects invalid username characters', () => {
      const parsed = createAdminUserSchema.safeParse({
        name: 'Test',
        username: 'user name with space!',
        email: '',
        role: 'STAFF',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects short passwords (< 6 chars)', () => {
      const parsed = createAdminUserSchema.safeParse({
        name: 'Test',
        username: 'valid_user',
        email: '',
        password: '123',
        role: 'STAFF',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid email formats', () => {
      const parsed = createAdminUserSchema.safeParse({
        name: 'Test',
        username: 'valid_user',
        email: 'not-an-email',
        role: 'STAFF',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('updateAdminUserSchema', () => {
    it('validates valid update without password change', () => {
      const parsed = updateAdminUserSchema.safeParse({
        id: 'u-123456',
        name: 'ชื่อใหม่',
        username: 'new_username',
        email: 'new@example.com',
        role: 'OWNER',
        isActive: false,
      });
      expect(parsed.success).toBe(true);
    });

    it('validates valid update with new password', () => {
      const parsed = updateAdminUserSchema.safeParse({
        id: 'u-123456',
        name: 'ชื่อใหม่',
        username: 'new_username',
        email: 'new@example.com',
        role: 'OWNER',
        password: 'newSecretPassword123',
        isActive: true,
      });
      expect(parsed.success).toBe(true);
    });

    it('requires an id', () => {
      const parsed = updateAdminUserSchema.safeParse({
        name: 'ชื่อใหม่',
        username: 'new_username',
        role: 'STAFF',
        isActive: true,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('Password Hashing for Admin Users', () => {
    it('hashes and correctly verifies passwords', () => {
      const plain = 'PailayAdminPass2026!';
      const hash = hashPassword(plain);
      expect(hash.startsWith('scrypt$')).toBe(true);
      expect(verifyPassword(plain, hash)).toBe(true);
      expect(verifyPassword('WrongPassword', hash)).toBe(false);
    });
  });
});
