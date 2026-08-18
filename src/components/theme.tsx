'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/components/ui';

/**
 * Light / dark / follow-the-device.
 *
 * Three states rather than two, because "dark" on a phone usually means
 * "whatever the phone is doing" — a guest who has their device on automatic
 * night mode expects the menu to match at dinner without being asked.
 *
 * The choice is written to `data-theme` on <html>, which the CSS in
 * globals.css keys off. System mode writes nothing and lets the
 * `prefers-color-scheme` media query decide.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pf-theme';

interface ThemeValue {
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts at 'system' and syncs on mount. The inline script below has already
  // applied the stored choice, so there is no flash — this only catches React
  // up with what the DOM already shows.
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setChoiceState(stored);
    }
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing with storage disabled: the choice still applies for
      // this page view, it just will not be remembered.
    }
  }, []);

  const value = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * Runs before React hydrates, during HTML parse, so the page never paints the
 * wrong theme first. Written as a string because it has to execute inline —
 * a component would be too late.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;

const OPTIONS: { value: ThemeChoice; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'สว่าง' },
  { value: 'dark', icon: Moon, label: 'มืด' },
  { value: 'system', icon: Monitor, label: 'ตามเครื่อง' },
];

/**
 * Segmented control. All three states are visible at once rather than hidden
 * behind a cycling button, so the current setting is readable without
 * clicking to find out.
 */
export function ThemeToggle({
  className,
  tone = 'default',
}: {
  className?: string;
  /** `onBrand` for the coloured guest header, where the surface is dark blue. */
  tone?: 'default' | 'onBrand';
}) {
  const { choice, setChoice } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="ธีมสี"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg p-0.5',
        tone === 'onBrand'
          ? 'border border-white/25 bg-white/15 backdrop-blur'
          : 'border border-[var(--line)] bg-[var(--surface-sunken)]',
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              tone === 'onBrand'
                ? active
                  ? 'bg-white text-[var(--color-brand-700)]'
                  : 'text-white/70 hover:text-white'
                : active
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]'
                  : 'text-[var(--text-subtle)] hover:text-[var(--text)]',
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
