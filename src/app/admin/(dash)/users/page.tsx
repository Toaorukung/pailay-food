'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserCog,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Mail,
  User,
} from 'lucide-react';
import { adminFetch } from '@/components/admin/adminApi';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  cn,
} from '@/components/ui';

interface AdminUserDTO {
  id: string;
  email: string;
  username: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
}

const ROLE_INFO: Record<
  AdminUserDTO['role'],
  { label: string; tone: 'brand' | 'warning' | 'neutral'; desc: string }
> = {
  OWNER: {
    label: 'เจ้าของร้าน (Owner)',
    tone: 'brand',
    desc: 'สิทธิ์สูงสุด เข้าถึงได้ทุกหน้า รวมถึงตั้งค่าร้านและจัดการผู้ใช้',
  },
  MANAGER: {
    label: 'ผู้จัดการ (Manager)',
    tone: 'warning',
    desc: 'จัดการเมนู ราคา หมวดหมู่ ภูมิแพ้ วิลล่า และดูรายงานยอดขาย',
  },
  STAFF: {
    label: 'พนักงาน (Staff)',
    tone: 'neutral',
    desc: 'ดูและจัดการออเดอร์ในครัว ยืนยันการสั่ง อัปโหลดสลิป และดูเซสชัน',
  },
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserDTO[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | AdminUserDTO['role']>('ALL');

  // Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserDTO | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUserDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields for Create
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminUserDTO['role']>('STAFF');
  const [newPassword, setNewPassword] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);

  // Form fields for Edit
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<AdminUserDTO['role']>('STAFF');
  const [editPassword, setEditPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ users: AdminUserDTO[]; currentUserId: string }>(
      '/api/admin/users',
    );
    if (res.ok) {
      setUsers(res.data.users);
      setCurrentUserId(res.data.currentUserId);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const query = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!query) return true;
      return (
        u.name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    });
  }, [users, search, roleFilter]);

  const openCreateDialog = () => {
    setNewName('');
    setNewUsername('');
    setNewEmail('');
    setNewRole('STAFF');
    setNewPassword('');
    setNewIsActive(true);
    setFormError(null);
    setCreateOpen(true);
  };

  const openEditDialog = (user: AdminUserDTO) => {
    setEditUser(user);
    setEditName(user.name);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPassword('');
    setEditIsActive(user.isActive);
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);

    const res = await adminFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        name: newName,
        username: newUsername,
        email: newEmail,
        role: newRole,
        password: newPassword,
        isActive: newIsActive,
      }),
    });

    if (res.ok) {
      setCreateOpen(false);
      await loadUsers();
    } else {
      setFormError(res.error);
    }
    setSaving(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser || saving) return;
    setSaving(true);
    setFormError(null);

    const res = await adminFetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({
        id: editUser.id,
        name: editName,
        username: editUsername,
        email: editEmail,
        role: editRole,
        password: editPassword.trim() ? editPassword : undefined,
        isActive: editIsActive,
      }),
    });

    if (res.ok) {
      setEditUser(null);
      await loadUsers();
    } else {
      setFormError(res.error);
    }
    setSaving(false);
  };

  const handleToggleActive = async (user: AdminUserDTO) => {
    if (user.id === currentUserId) return;
    const res = await adminFetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: !user.isActive,
      }),
    });

    if (res.ok) {
      await loadUsers();
    } else {
      setError(res.error);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser || saving) return;
    setSaving(true);

    const res = await adminFetch(`/api/admin/users?id=${deleteUser.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setDeleteUser(null);
      await loadUsers();
    } else {
      setError(res.error);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">จัดการผู้ใช้งาน (User Management)</h1>
          <p className="text-sm muted">
            จัดการบัญชีแอดมิน กำหนดบทบาทสิทธิ์การใช้งาน และตั้งรหัสผ่านสำหรับเข้าระบบหลังบ้าน
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadUsers}
            disabled={loading}
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="size-4" />
            เพิ่มผู้ใช้ใหม่
          </Button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {/* Filter Bar */}
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, username หรืออีเมล…"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold muted whitespace-nowrap">บทบาท:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="h-9 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-medium focus:border-[var(--brand)] focus:outline-none"
          >
            <option value="ALL">ทั้งหมด ({users?.length ?? 0})</option>
            <option value="OWNER">เจ้าของร้าน (Owner)</option>
            <option value="MANAGER">ผู้จัดการ (Manager)</option>
            <option value="STAFF">พนักงาน (Staff)</option>
          </select>
        </div>
      </Card>

      {/* User List */}
      {loading && !users ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<UserCog className="size-10" />}
          title="ไม่พบผู้ใช้งาน"
          body={search ? 'ไม่พบผู้ใช้ที่ตรงกับคำค้นหา' : 'ยังไม่มีผู้ใช้ในระบบ'}
        />
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const isSelf = user.id === currentUserId;
            const roleInfo = ROLE_INFO[user.role];

            return (
              <Card
                key={user.id}
                className={cn(
                  'flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between',
                  !user.isActive && 'opacity-65 bg-[var(--surface-sunken)]/40',
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl',
                      user.role === 'OWNER'
                        ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                        : user.role === 'MANAGER'
                        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                        : 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
                    )}
                  >
                    {user.role === 'OWNER' ? (
                      <ShieldCheck className="size-5" />
                    ) : user.role === 'MANAGER' ? (
                      <Shield className="size-5" />
                    ) : (
                      <User className="size-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[15px]">{user.name}</span>
                      <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded">
                        @{user.username}
                      </span>
                      {isSelf && (
                        <Badge tone="brand" className="text-[10px] py-0 px-1.5">
                          บัญชีของคุณ
                        </Badge>
                      )}
                      <Badge tone={roleInfo.tone} className="text-[10px] py-0 px-2">
                        {roleInfo.label}
                      </Badge>
                      {!user.isActive && (
                        <Badge tone="danger" className="text-[10px] py-0 px-1.5">
                          ระงับการใช้งาน
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs muted flex-wrap pt-0.5">
                      {user.email ? (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3" />
                          {user.email}
                        </span>
                      ) : (
                        <span className="italic">ไม่มีอีเมล (เข้าสู่ระบบด้วยรหัสผ่านเท่านั้น)</span>
                      )}
                      <span>·</span>
                      <span>
                        {user.hasPassword ? (
                          <span className="text-[var(--success)] font-medium">✓ มีรหัสผ่าน</span>
                        ) : (
                          <span className="text-[var(--warning)]">ไม่มีรหัสผ่าน (Google login เท่านั้น)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSelf}
                    onClick={() => handleToggleActive(user)}
                    title={
                      isSelf
                        ? 'ไม่สามารถปิดการใช้งานบัญชีตนเองได้'
                        : user.isActive
                        ? 'กดเพื่อระงับการใช้งาน'
                        : 'กดเพื่อเปิดการใช้งาน'
                    }
                    className="h-8 px-2 text-xs"
                  >
                    {user.isActive ? (
                      <span className="text-[var(--success)] flex items-center gap-1 font-medium">
                        <CheckCircle2 className="size-3.5" /> ใช้งานอยู่
                      </span>
                    ) : (
                      <span className="text-[var(--danger)] flex items-center gap-1 font-medium">
                        <XCircle className="size-3.5" /> ระงับ
                      </span>
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditDialog(user)}
                    className="h-8 px-2.5 text-xs gap-1"
                  >
                    <Pencil className="size-3.5" />
                    แก้ไข
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isSelf}
                    onClick={() => setDeleteUser(user)}
                    title={isSelf ? 'ไม่สามารถลบบัญชีตนเองได้' : 'ลบผู้ใช้งาน'}
                    className="h-8 px-2 text-xs"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Role explanation Card */}
      <Card className="bg-[var(--surface-sunken)]/50 p-4 space-y-2 border border-[var(--line)]">
        <p className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
          <Shield className="size-3.5 text-[var(--brand)]" />
          ระดับสิทธิ์การใช้งาน (Roles & Permissions)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-[var(--text-muted)]">
          <div>
            <span className="font-semibold text-[var(--brand)]">เจ้าของร้าน (OWNER):</span>{' '}
            มีสิทธิ์ทุกอย่าง รวมทั้งเพิ่ม/ลบผู้ใช้งาน และตั้งค่าร้าน
          </div>
          <div>
            <span className="font-semibold text-[var(--warning)]">ผู้จัดการ (MANAGER):</span>{' '}
            จัดการเมนูอาหาร ราคา สารก่อภูมิแพ้ วิลล่า และดูรายงาน
          </div>
          <div>
            <span className="font-semibold text-[var(--text)]">พนักงาน (STAFF):</span>{' '}
            รับและยืนยันออเดอร์ จัดการสถานะในครัว และตรวจสอบสลิป
          </div>
        </div>
      </Card>

      {/* ── Dialog: Create User ─────────────────────────────── */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="เพิ่มผู้ใช้งานใหม่"
        description="สร้างบัญชีผู้ใช้ใหม่สำหรับเข้าระบบหลังบ้าน สามารถใช้รหัสผ่านหรืออีเมล Google ในการเข้าสู่ระบบ"
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          {formError && (
            <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
              {formError}
            </p>
          )}

          <Field label="ชื่อ - นามสกุล / ชื่อเรียก *" hint="เช่น สมชาย ผู้จัดการ, ครัวป้าเล็ก">
            <Input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น สมชาย ผู้จัดการ"
            />
          </Field>

          <Field
            label="ชื่อผู้ใช้ (Username) *"
            hint="ใช้สำหรับล็อกอินด้วยรหัสผ่าน (ภาษาอังกฤษ ตัวเลข _ หรือ -)"
          >
            <Input
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="เช่น somchai_m, kitchen1"
            />
          </Field>

          <Field
            label="อีเมล (Email)"
            hint="กรอกหากต้องการล็อกอินผ่าน Google Account (เว้นว่างได้)"
          >
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@gmail.com"
            />
          </Field>

          <Field label="บทบาท / สิทธิ์การใช้งาน *">
            <Select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminUserDTO['role'])}
            >
              <option value="STAFF">พนักงาน (Staff) — ออเดอร์, ครัว, สลิป</option>
              <option value="MANAGER">ผู้จัดการ (Manager) — เมนู, ราคา, รายงาน</option>
              <option value="OWNER">เจ้าของร้าน (Owner) — เข้าถึงได้ทุกอย่าง</option>
            </Select>
          </Field>

          <Field
            label="รหัสผ่าน (Password)"
            hint="กำหนดรหัสผ่านสำหรับล็อกอินผ่าน Username (อย่างน้อย 6 ตัวอักษร) หรือเว้นว่างหากใช้เฉพาะ Google"
          >
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
              />
            </div>
          </Field>

          <Checkbox
            label="เปิดใช้งานบัญชีนี้ทันที"
            checked={newIsActive}
            onChange={(e) => setNewIsActive(e.target.checked)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setCreateOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={saving}>
              สร้างผู้ใช้งาน
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Dialog: Edit User ───────────────────────────────── */}
      <Dialog
        open={Boolean(editUser)}
        onOpenChange={(open) => !open && setEditUser(null)}
        title="แก้ไขข้อมูลผู้ใช้งาน"
        description="แก้ไขชื่อ อีเมล สิทธิ์ หรือตั้งรหัสผ่านใหม่"
      >
        {editUser && (
          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            {formError && (
              <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
                {formError}
              </p>
            )}

            <Field label="ชื่อ - นามสกุล / ชื่อเรียก *">
              <Input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="ชื่อผู้ใช้"
              />
            </Field>

            <Field label="ชื่อผู้ใช้ (Username) *">
              <Input
                required
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="username"
              />
            </Field>

            <Field label="อีเมล (Email)" hint="สำหรับล็อกอินผ่าน Google Account">
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@gmail.com"
              />
            </Field>

            <Field
              label="บทบาท / สิทธิ์การใช้งาน *"
              hint={editUser.id === currentUserId ? 'ไม่สามารถเปลี่ยนระดับสิทธิ์ของบัญชีตนเองได้' : undefined}
            >
              <Select
                value={editRole}
                disabled={editUser.id === currentUserId}
                onChange={(e) => setEditRole(e.target.value as AdminUserDTO['role'])}
              >
                <option value="STAFF">พนักงาน (Staff)</option>
                <option value="MANAGER">ผู้จัดการ (Manager)</option>
                <option value="OWNER">เจ้าของร้าน (Owner)</option>
              </Select>
            </Field>

            <div className="rounded-xl border border-[var(--line)] p-3.5 space-y-2 bg-[var(--surface-sunken)]/30">
              <Field
                label="เปลี่ยนรหัสผ่านใหม่"
                hint="เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่านเดิม (หากเปลี่ยนต้องมีอย่างน้อย 6 ตัวอักษร)"
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
                  <Input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านใหม่…"
                    className="pl-9"
                  />
                </div>
              </Field>
            </div>

            <Checkbox
              label="เปิดใช้งานบัญชีนี้"
              disabled={editUser.id === currentUserId}
              checked={editIsActive}
              onChange={(e) => setEditIsActive(e.target.checked)}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setEditUser(null)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" loading={saving}>
                บันทึกการแก้ไข
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* ── Dialog: Delete Confirm ──────────────────────────── */}
      <Dialog
        open={Boolean(deleteUser)}
        onOpenChange={(open) => !open && setDeleteUser(null)}
        title="ยืนยันการลบผู้ใช้งาน"
        description="การลบนี้จะถอนสิทธิ์การเข้าถึงระบบของผู้ใช้นี้ทันที"
      >
        {deleteUser && (
          <div className="space-y-4 pt-2">
            <p className="text-sm">
              คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้งาน{' '}
              <strong className="text-[var(--text)]">
                {deleteUser.name} (@{deleteUser.username})
              </strong>{' '}
              ออกจากระบบ?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setDeleteUser(null)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                loading={saving}
                onClick={handleDelete}
              >
                ยืนยันการลบ
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
