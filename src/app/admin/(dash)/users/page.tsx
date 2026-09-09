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
  CheckCircle2,
  XCircle,
  RefreshCw,
  Mail,
  User,
  CheckSquare,
  Square,
  RotateCcw,
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
import {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type PermissionId,
  type AdminRole,
} from '@/lib/types';

interface AdminUserDTO {
  id: string;
  email: string;
  username: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  hasPassword: boolean;
  permissions: PermissionId[];
  createdAt: string;
}

const ROLE_INFO: Record<
  AdminRole,
  { label: string; tone: 'brand' | 'warning' | 'neutral'; desc: string }
> = {
  OWNER: {
    label: 'เจ้าของร้าน (Owner)',
    tone: 'brand',
    desc: 'สิทธิ์สูงสุด เข้าถึงได้ทุกระบบโดยอัตโนมัติ',
  },
  MANAGER: {
    label: 'ผู้จัดการ (Manager)',
    tone: 'warning',
    desc: 'จัดการเมนู ราคา หมวดหมู่ ภูมิแพ้ วิลล่า และรายงาน',
  },
  STAFF: {
    label: 'พนักงาน (Staff)',
    tone: 'neutral',
    desc: 'รับออเดอร์ ครัว ยืนยันการสั่ง อัปโหลดสลิป',
  },
};

const PERMISSION_GROUPS = [
  'บริการ & ออเดอร์',
  'จัดการร้าน',
  'ระบบ & ความปลอดภัย',
] as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserDTO[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | AdminRole>('ALL');

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
  const [newRole, setNewRole] = useState<AdminRole>('STAFF');
  const [newPassword, setNewPassword] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);
  const [newPermissions, setNewPermissions] = useState<PermissionId[]>(
    DEFAULT_ROLE_PERMISSIONS.STAFF,
  );

  // Form fields for Edit
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<AdminRole>('STAFF');
  const [editPassword, setEditPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPermissions, setEditPermissions] = useState<PermissionId[]>([]);

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

  const handleRoleChangeForCreate = (role: AdminRole) => {
    setNewRole(role);
    setNewPermissions(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
  };

  const handleRoleChangeForEdit = (role: AdminRole) => {
    setEditRole(role);
    setEditPermissions(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
  };

  const togglePermissionForCreate = (pId: PermissionId) => {
    if (newRole === 'OWNER') return;
    setNewPermissions((prev) =>
      prev.includes(pId) ? prev.filter((p) => p !== pId) : [...prev, pId],
    );
  };

  const togglePermissionForEdit = (pId: PermissionId) => {
    if (editRole === 'OWNER') return;
    setEditPermissions((prev) =>
      prev.includes(pId) ? prev.filter((p) => p !== pId) : [...prev, pId],
    );
  };

  const openCreateDialog = () => {
    setNewName('');
    setNewUsername('');
    setNewEmail('');
    setNewRole('STAFF');
    setNewPassword('');
    setNewIsActive(true);
    setNewPermissions(DEFAULT_ROLE_PERMISSIONS.STAFF);
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
    setEditPermissions(
      user.role === 'OWNER'
        ? DEFAULT_ROLE_PERMISSIONS.OWNER
        : user.permissions && user.permissions.length > 0
        ? user.permissions
        : DEFAULT_ROLE_PERMISSIONS[user.role] ?? [],
    );
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
        permissions: newRole === 'OWNER' ? DEFAULT_ROLE_PERMISSIONS.OWNER : newPermissions,
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
        permissions: editRole === 'OWNER' ? DEFAULT_ROLE_PERMISSIONS.OWNER : editPermissions,
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

  const renderPermissionCheckboxes = (
    role: AdminRole,
    currentPerms: PermissionId[],
    onToggle: (pId: PermissionId) => void,
    onSetAll: (perms: PermissionId[]) => void,
  ) => {
    const isOwner = role === 'OWNER';

    return (
      <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)]/40 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--line)] pb-3">
          <div>
            <span className="font-bold text-sm text-[var(--text)] flex items-center gap-1.5">
              <CheckSquare className="size-4 text-[var(--brand)]" />
              กำหนดสิทธิ์การทำงาน (Permissions)
            </span>
            <p className="text-xs muted">
              {isOwner
                ? 'เจ้าของร้านมีสิทธิ์เข้าถึงทุกฟังก์ชันโดยอัตโนมัติ'
                : 'เลือกเครื่องหมายถูกในช่องที่ต้องการอนุญาตให้ผู้ใช้นี้เข้าถึง'}
            </p>
          </div>

          {!isOwner && (
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => onSetAll(PERMISSIONS.map((p) => p.id))}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => onSetAll([])}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]/20 transition-colors"
              >
                ล้างทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => onSetAll(DEFAULT_ROLE_PERMISSIONS[role] ?? [])}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]/20 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="size-3" />
                ค่าเริ่มต้น
              </button>
            </div>
          )}
        </div>

        {PERMISSION_GROUPS.map((group) => {
          const groupItems = PERMISSIONS.filter((p) => p.group === group);
          return (
            <div key={group} className="space-y-2">
              <span className="text-xs font-bold text-[var(--text-muted)] tracking-wider">
                {group}
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {groupItems.map((p) => {
                  const checked = isOwner || currentPerms.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors text-left',
                        checked
                          ? 'border-[var(--brand)]/50 bg-[var(--brand-soft)]/15'
                          : 'border-[var(--line)] bg-[var(--surface)] opacity-70 hover:opacity-100',
                        isOwner && 'cursor-default',
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={isOwner}
                        checked={checked}
                        onChange={() => onToggle(p.id)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block text-xs font-bold leading-tight">
                          {p.label}
                        </span>
                        <span className="block text-[11px] text-[var(--text-muted)] leading-tight pt-0.5">
                          {p.desc}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">จัดการผู้ใช้งาน (User Management)</h1>
          <p className="text-sm muted">
            จัดการบัญชีแอดมิน กำหนดบทบาท และเลือกสิทธิ์การเข้าถึงแต่ละฟังก์ชันได้อย่างละเอียด
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
            <Skeleton key={i} className="h-20" />
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
            const permsList =
              user.role === 'OWNER'
                ? PERMISSIONS.map((p) => p.label)
                : (user.permissions ?? []).map(
                    (pId) => PERMISSIONS.find((p) => p.id === pId)?.label || pId,
                  );

            return (
              <Card
                key={user.id}
                className={cn(
                  'flex flex-col gap-3 p-4 transition-colors',
                  !user.isActive && 'opacity-65 bg-[var(--surface-sunken)]/40',
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

                    <div className="min-w-0 flex-1 space-y-1">
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

                      <div className="flex items-center gap-3 text-xs muted flex-wrap">
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
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
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
                </div>

                {/* Permissions summary */}
                <div className="border-t border-[var(--line)] pt-2.5 flex items-center gap-2 text-xs flex-wrap">
                  <span className="font-semibold text-[var(--text-muted)] shrink-0">
                    สิทธิ์ที่ได้รับ ({user.role === 'OWNER' ? 'ทุกฟังก์ชัน' : `${permsList.length} รายการ`}):
                  </span>
                  {user.role === 'OWNER' ? (
                    <span className="text-[var(--brand)] font-medium">
                      เข้าถึงได้ทุกหน้าในระบบโดยอัตโนมัติ
                    </span>
                  ) : permsList.length === 0 ? (
                    <span className="text-[var(--danger)] italic">ไม่มีสิทธิ์ใดๆ (ไม่สามารถเข้าใช้งานหน้าใดได้)</span>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {permsList.map((label, idx) => (
                        <span
                          key={idx}
                          className="bg-[var(--surface-sunken)] text-[var(--text)] px-2 py-0.5 rounded text-[11px] font-medium"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Create User ─────────────────────────────── */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="เพิ่มผู้ใช้งานใหม่"
        description="สร้างบัญชีผู้ใช้ใหม่สำหรับเข้าระบบหลังบ้าน และเลือกสิทธิ์การเข้าถึงแต่ละฟังก์ชัน"
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2 max-h-[75vh] overflow-y-auto pr-1">
          {formError && (
            <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              hint="ใช้สำหรับล็อกอิน (ภาษาอังกฤษ ตัวเลข _ หรือ -)"
            >
              <Input
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="เช่น somchai_m, kitchen1"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="อีเมล (Email)"
              hint="กรอกหากต้องการล็อกอินผ่าน Google Account"
            >
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@gmail.com"
              />
            </Field>

            <Field label="บทบาทหลัก (Role) *">
              <Select
                value={newRole}
                onChange={(e) => handleRoleChangeForCreate(e.target.value as AdminRole)}
              >
                <option value="STAFF">พนักงาน (Staff)</option>
                <option value="MANAGER">ผู้จัดการ (Manager)</option>
                <option value="OWNER">เจ้าของร้าน (Owner)</option>
              </Select>
            </Field>
          </div>

          <Field
            label="รหัสผ่าน (Password)"
            hint="กำหนดรหัสผ่านสำหรับ Username (อย่างน้อย 6 ตัวอักษร) หรือเว้นว่างหากใช้เฉพาะ Google"
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

          {/* Granular Permissions Picker */}
          {renderPermissionCheckboxes(
            newRole,
            newPermissions,
            togglePermissionForCreate,
            setNewPermissions,
          )}

          <Checkbox
            label="เปิดใช้งานบัญชีนี้ทันที"
            checked={newIsActive}
            onChange={(e) => setNewIsActive(e.target.checked)}
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
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
        title="แก้ไขข้อมูลผู้ใช้งานและสิทธิ์"
        description="แก้ไขข้อมูล กำหนดสิทธิ์การทำงาน หรือตั้งรหัสผ่านใหม่"
      >
        {editUser && (
          <form onSubmit={handleEdit} className="space-y-4 pt-2 max-h-[75vh] overflow-y-auto pr-1">
            {formError && (
              <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="อีเมล (Email)" hint="สำหรับล็อกอินผ่าน Google Account">
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="user@gmail.com"
                />
              </Field>

              <Field
                label="บทบาทหลัก (Role) *"
                hint={editUser.id === currentUserId ? 'ไม่สามารถเปลี่ยนระดับสิทธิ์ของบัญชีตนเองได้' : undefined}
              >
                <Select
                  value={editRole}
                  disabled={editUser.id === currentUserId}
                  onChange={(e) => handleRoleChangeForEdit(e.target.value as AdminRole)}
                >
                  <option value="STAFF">พนักงาน (Staff)</option>
                  <option value="MANAGER">ผู้จัดการ (Manager)</option>
                  <option value="OWNER">เจ้าของร้าน (Owner)</option>
                </Select>
              </Field>
            </div>

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

            {/* Granular Permissions Picker */}
            {renderPermissionCheckboxes(
              editRole,
              editPermissions,
              togglePermissionForEdit,
              setEditPermissions,
            )}

            <Checkbox
              label="เปิดใช้งานบัญชีนี้"
              disabled={editUser.id === currentUserId}
              checked={editIsActive}
              onChange={(e) => setEditIsActive(e.target.checked)}
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
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
