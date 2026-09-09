import { describe, it, expect } from 'vitest';
import { createAdminUserSchema, updateAdminUserSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/admin/password';
import { hasPermission, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/types';

describe('Admin User Schemas', () => {
  describe('createAdminUserSchema', () => {
    it('validates a valid full user record with custom permissions', () => {
      const parsed = createAdminUserSchema.safeParse({
        name: 'สมชาย ผู้จัดการ',
        username: 'somchai_mgr',
        email: 'somchai@example.com',
        role: 'MANAGER',
        password: 'securePassword123',
        isActive: true,
        permissions: ['orders', 'pending', 'menu'],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.username).toBe('somchai_mgr');
        expect(parsed.data.role).toBe('MANAGER');
        expect(parsed.data.permissions).toEqual(['orders', 'pending', 'menu']);
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
        permissions: ['orders', 'payments'],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.permissions).toEqual(['orders', 'payments']);
      }
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

  describe('Granular Permissions & hasPermission Helper', () => {
    it('grants full access to OWNER regardless of explicit permissions', () => {
      expect(hasPermission('OWNER', [], 'users')).toBe(true);
      expect(hasPermission('OWNER', [], 'settings')).toBe(true);
      expect(hasPermission('OWNER', ['orders'], 'reports')).toBe(true);
    });

    it('checks explicit permissions for STAFF', () => {
      expect(hasPermission('STAFF', ['orders', 'pending'], 'orders')).toBe(true);
      expect(hasPermission('STAFF', ['orders', 'pending'], 'pending')).toBe(true);
      expect(hasPermission('STAFF', ['orders', 'pending'], 'menu')).toBe(false);
      expect(hasPermission('STAFF', ['orders', 'pending'], 'settings')).toBe(false);
    });

    it('falls back to default permissions when permissions array is undefined or empty', () => {
      expect(hasPermission('STAFF', undefined, 'orders')).toBe(true);
      expect(hasPermission('STAFF', undefined, 'settings')).toBe(false);
      expect(hasPermission('MANAGER', undefined, 'menu')).toBe(true);
      expect(hasPermission('MANAGER', undefined, 'users')).toBe(false);
    });

    it('ensures all defined permissions have metadata and belong to categories', () => {
      expect(PERMISSIONS.length).toBeGreaterThan(10);
      for (const p of PERMISSIONS) {
        expect(p.id).toBeDefined();
        expect(p.label).toBeDefined();
        expect(p.group).toBeDefined();
        expect(p.desc).toBeDefined();
      }
    });
  });
});

