'use client';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── Button ──────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand)] text-[var(--text-on-brand)] shadow-[var(--shadow-brand)] ' +
    'hover:bg-[var(--brand-hover)]',
  secondary:
    'bg-[var(--surface)] text-[var(--text)] border border-[var(--line-strong)] ' +
    'shadow-[var(--shadow-xs)] hover:bg-[var(--surface-sunken)]',
  ghost: 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
  danger:
    'bg-[var(--danger)] text-white shadow-[var(--shadow-sm)] hover:brightness-110',
  success:
    'bg-[var(--success)] text-white shadow-[var(--shadow-sm)] hover:brightness-110',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 36px is the floor for a dense admin row; guest controls use md or lg.
  // These are pressed with thumbs, often wet, so nothing goes smaller.
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-[3.25rem] px-6 text-base rounded-2xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  full?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold',
        'transition-[background-color,box-shadow,transform] duration-150',
        // A press that moves confirms the tap on a touchscreen that has no
        // hover state to fall back on.
        'active:scale-[0.985] active:duration-75',
        'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ── Surfaces ────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('card p-4', className)}>
      {children}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'danger' | 'warning' | 'success';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
  brand: 'bg-[var(--brand-soft)] text-[var(--brand-soft-text)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'text-xs font-semibold leading-none',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ALERT_BORDERS: Record<Tone, string> = {
  neutral: 'border-[var(--line-strong)]',
  brand: 'border-[var(--brand)]',
  danger: 'border-[var(--danger)]',
  warning: 'border-[var(--warning)]',
  success: 'border-[var(--success)]',
};

export function Alert({
  tone = 'warning',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border-l-4 px-3.5 py-3 text-sm',
        BADGE_TONES[tone],
        ALERT_BORDERS[tone],
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}

// ── Form controls ───────────────────────────────────────────

const FIELD_BASE =
  'w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] ' +
  'px-3.5 py-2.5 text-[var(--text)] placeholder:text-[var(--text-subtle)] ' +
  'shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] ' +
  'focus:border-[var(--brand)] focus:outline-none ' +
  'focus:ring-4 focus:ring-[var(--brand-ring)] ' +
  'disabled:opacity-60 disabled:bg-[var(--surface-sunken)]';

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(FIELD_BASE, 'h-11', className)} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(FIELD_BASE, 'resize-y', className)} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(FIELD_BASE, 'h-11 pr-8', className)}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-semibold">{label}</span>}
      {children}
      {error ? (
        <span className="block text-xs font-medium text-[var(--danger)]">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl p-3',
        'transition-colors hover:bg-[var(--surface-sunken)]',
        className,
      )}
    >
      <input
        type="checkbox"
        {...rest}
        className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
      />
      <span className="text-sm leading-snug">{label}</span>
    </label>
  );
}

// ── Dialog ──────────────────────────────────────────────────

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /**
   * When false the dialog cannot be dismissed — no close button, no Escape, no
   * click-outside. Used for a required step the guest has to complete (entering
   * their name and phone) rather than skip. The only way out is a control
   * inside the dialog that calls onOpenChange itself.
   */
  dismissible?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px] animate-fade"
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          className={cn(
            'fixed z-50 flex flex-col gap-4 bg-[var(--surface)]',
            'shadow-[var(--shadow-lg)]',
            // Bottom sheet on phones, centred dialog from sm up. Thumbs reach
            // the bottom of a phone screen; they do not reach the middle.
            'inset-x-0 bottom-0 max-h-[90svh] overflow-y-auto',
            'rounded-t-[1.75rem] px-5 pb-6 pt-3 animate-sheet',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2',
            'sm:w-[min(32rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-2xl sm:p-6 sm:animate-rise',
          )}
        >
          {/* Grab handle: signals "this sheet slides" on touch. */}
          <div
            aria-hidden
            className="mx-auto h-1 w-10 shrink-0 rounded-full bg-[var(--line-strong)] sm:hidden"
          />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-lg font-bold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            {dismissible && (
              <DialogPrimitive.Close
                className={cn(
                  '-m-1 shrink-0 rounded-lg p-1.5 muted transition-colors',
                  'hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]',
                )}
                aria-label="ปิด"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            )}
          </div>

          {children}
          {footer && <div className="flex gap-2 pt-1">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── Misc ────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm muted">{body}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

/** Page heading with an optional right-hand slot for actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}
