'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, cn } from '@/components/ui';

/**
 * Puts a value on the clipboard and says so.
 *
 * `value` may be a function: the villa link is built from
 * `window.location.origin`, which is not available while the server renders,
 * and deferring it to the click avoids a hydration mismatch.
 */
export function CopyButton({
  value,
  label = 'คัดลอกลิงก์',
  copiedLabel = 'คัดลอกแล้ว',
  showLabel = true,
  className,
}: {
  value: string | (() => string);
  label?: string;
  copiedLabel?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    const text = typeof value === 'function' ? value() : value;
    const ok = await writeClipboard(text);
    setCopied(ok);
    setFailed(!ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1800);
  }, [value]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-label={label}
      className={cn(copied && 'text-[var(--success)]', className)}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {showLabel && (
        <span className="whitespace-nowrap">
          {failed ? 'คัดลอกไม่ได้' : copied ? copiedLabel : label}
        </span>
      )}
    </Button>
  );
}

/**
 * `navigator.clipboard` needs a secure context and is missing on older Android
 * browsers, which is exactly the phone a member of staff is holding in the
 * villa. The textarea route still works there.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }

  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}
