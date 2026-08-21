import {
  formatHM,
  type ItemTimeState,
  type OrderWindow,
} from '@/lib/availability';
import type { StringKey } from '@/i18n/dict';

type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

/** The villa-wide order window, in the guest's language. Null when open. */
export function windowText(
  window: OrderWindow,
  t: Translate,
): string | null {
  if (window.open) return null;
  if (window.code === 'BEFORE_OPEN' && window.openMin !== null) {
    return t('avail.beforeOpen', { time: formatHM(window.openMin) });
  }
  if (window.code === 'AFTER_CUTOFF' && window.cutoffMin !== null) {
    return t('avail.afterCutoff', { time: formatHM(window.cutoffMin) });
  }
  return t('avail.closedBadge');
}

/** Why a dish cannot be ordered right now, in the guest's language. */
export function itemTimeText(
  state: Exclude<ItemTimeState, { orderable: true }>,
  t: Translate,
): string {
  switch (state.code) {
    case 'BEFORE_ITEM_OPEN':
      return t('avail.itemBefore', { time: formatHM(state.boundMin ?? 0) });
    case 'AFTER_ITEM_CUTOFF':
      return t('avail.itemAfter', { time: formatHM(state.boundMin ?? 0) });
    case 'LEAD_TOO_LATE':
      return t('avail.itemLeadLate', { hours: state.leadHours ?? 0 });
  }
}
