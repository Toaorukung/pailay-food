'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Check,
  Minus,
  Plus,
  Search,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { Button, Dialog, Input, Textarea, cn } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog, MenuItem, Order, OrderItem } from '@/lib/types';

export interface MenuItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'replace' | 'add';
  order: Order;
  targetItem?: OrderItem;
  catalog: MenuCatalog;
  onSave: (data: {
    menuId: string;
    qty: number;
    optionIds: string[];
    note: string;
  }) => Promise<void>;
  busy: boolean;
}

export function MenuItemModal({
  open,
  onOpenChange,
  mode,
  order,
  targetItem,
  catalog,
  onSave,
  busy,
}: MenuItemModalProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [qty, setQty] = useState<number>(1);
  const [note, setNote] = useState<string>('');

  // Reset or initialize when modal opens or target item changes
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedCategory('all');
      if (mode === 'replace' && targetItem) {
        setSelectedMenuId(targetItem.menuId);
        setSelectedOptionIds(targetItem.options.map((o) => o.optionId));
        setQty(targetItem.qty);
        setNote(targetItem.note || '');
      } else {
        setSelectedMenuId(null);
        setSelectedOptionIds([]);
        setQty(1);
        setNote('');
      }
    }
  }, [open, mode, targetItem]);

  const selectedItem = useMemo(
    () => catalog.items.find((i) => i.id === selectedMenuId) ?? null,
    [catalog.items, selectedMenuId],
  );

  // When a new menu item is picked, initialize default required options
  const handleSelectMenuItem = (item: MenuItem) => {
    setSelectedMenuId(item.id);
    // Auto-select first option for required single-select groups
    const defaults: string[] = [];
    for (const group of item.optionGroups) {
      if (group.required && group.type === 'single') {
        const first = group.options.find((o) => o.isAvailable);
        if (first) defaults.push(first.id);
      }
    }
    setSelectedOptionIds(defaults);
  };

  const toggleOption = (groupId: string, optionId: string, type: 'single' | 'multi') => {
    if (type === 'single') {
      const group = selectedItem?.optionGroups.find((g) => g.id === groupId);
      const otherGroupOptionIds = group
        ? new Set(group.options.map((o) => o.id))
        : new Set();
      const next = selectedOptionIds.filter((id) => !otherGroupOptionIds.has(id));
      next.push(optionId);
      setSelectedOptionIds(next);
    } else {
      if (selectedOptionIds.includes(optionId)) {
        setSelectedOptionIds(selectedOptionIds.filter((id) => id !== optionId));
      } else {
        setSelectedOptionIds([...selectedOptionIds, optionId]);
      }
    }
  };

  // Filter items
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.items
      .filter((i) => i.isAvailable)
      .filter((i) => {
        if (selectedCategory !== 'all' && i.categoryId !== selectedCategory) {
          return false;
        }
        if (!q) return true;
        const th = i.name.th.toLowerCase();
        const en = i.name.en.toLowerCase();
        const zh = i.name.zh.toLowerCase();
        const tags = (i.tags || []).join(' ').toLowerCase();
        return th.includes(q) || en.includes(q) || zh.includes(q) || tags.includes(q);
      });
  }, [catalog.items, search, selectedCategory]);

  // Option validation
  const validationError = useMemo(() => {
    if (!selectedItem) return 'กรุณาเลือกเมนู';
    for (const group of selectedItem.optionGroups) {
      if (group.required) {
        const count = group.options.filter((o) =>
          selectedOptionIds.includes(o.id),
        ).length;
        if (count < (group.minSelect || 1)) {
          return `กรุณาเลือก "${group.name.th || group.name.en}" อย่างน้อย ${group.minSelect || 1} ตัวเลือก`;
        }
      }
    }
    if (qty < 1) return 'จำนวนต้องไม่น้อยกว่า 1';
    return null;
  }, [selectedItem, selectedOptionIds, qty]);

  // Compute calculated line price
  const linePrice = useMemo(() => {
    if (!selectedItem) return 0;
    if (selectedItem.priceOnRequest) return 0;
    const optionExtra = selectedItem.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => selectedOptionIds.includes(o.id))
      .reduce((sum, o) => sum + (o.priceDelta || 0), 0);
    return (selectedItem.price + optionExtra) * qty;
  }, [selectedItem, selectedOptionIds, qty]);

  const handleSubmit = async () => {
    if (!selectedItem || validationError) return;
    await onSave({
      menuId: selectedItem.id,
      qty,
      optionIds: selectedOptionIds,
      note,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2">
          {mode === 'replace' ? (
            <>
              <ArrowLeftRight className="size-5 text-[var(--brand)]" />
              <span>เปลี่ยนเมนู</span>
            </>
          ) : (
            <>
              <Plus className="size-5 text-[var(--brand)]" />
              <span>เพิ่มเมนูในออเดอร์</span>
            </>
          )}
        </div>
      }
      description={
        mode === 'replace' && targetItem ? (
          <span>
            เปลี่ยน &ldquo;{targetItem.name.th || targetItem.name.en}&rdquo; (เดิม {targetItem.qty} ที่) เป็นเมนูอื่น
          </span>
        ) : (
          <span>
            เพิ่มรายการอาหารในออเดอร์ {order.villa || order.tableLabel} ({order.id})
          </span>
        )
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-left">
            {selectedItem && (
              <p className="text-sm font-semibold tabular">
                รวม:{' '}
                {selectedItem.priceOnRequest
                  ? 'ถามราคา (ชั่งน้ำหนัก)'
                  : formatMoney(linePrice, catalog.settings.currency)}
              </p>
            )}
            {validationError && selectedItem && (
              <p className="text-xs text-[var(--danger)]">{validationError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={Boolean(validationError) || busy}
              onClick={handleSubmit}
            >
              <Check className="size-4" />
              {mode === 'replace' ? 'ยืนยันเปลี่ยนเมนู' : 'เพิ่มลงในออเดอร์'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search & Category Filter */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 muted" />
            <Input
              type="text"
              placeholder="ค้นหาชื่อเมนู..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-[var(--surface-sunken)]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'whitespace-nowrap rounded-lg px-2.5 py-1 font-medium transition-colors',
                selectedCategory === 'all'
                  ? 'bg-[var(--brand)] text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--line)]',
              )}
            >
              ทั้งหมด
            </button>
            {catalog.categories
              .filter((c) => c.isActive)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-2.5 py-1 font-medium transition-colors',
                    selectedCategory === cat.id
                      ? 'bg-[var(--brand)] text-white'
                      : 'bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--line)]',
                  )}
                >
                  {cat.name.th || cat.name.en}
                </button>
              ))}
          </div>
        </div>

        {/* Selected Item Details (Option Groups, Qty, Note) */}
        {selectedItem ? (
          <div className="rounded-xl border border-[var(--brand)] bg-[var(--brand-soft)]/20 p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-[var(--brand)] uppercase tracking-wider">
                  เมนูที่เลือก
                </span>
                <p className="text-base font-bold">
                  {selectedItem.name.th || selectedItem.name.en}
                </p>
                <p className="text-xs muted">
                  {selectedItem.priceOnRequest
                    ? 'ถามราคา (ชั่งน้ำหนักก่อนปรุง)'
                    : formatMoney(selectedItem.price, catalog.settings.currency)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setSelectedMenuId(null)}
              >
                เลือกเมนูอื่น
              </Button>
            </div>

            {/* Option Groups */}
            {selectedItem.optionGroups.map((group) => (
              <div key={group.id} className="space-y-1.5 border-t border-[var(--line)] pt-2.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold">
                    {group.name.th || group.name.en}
                    {group.required && (
                      <span className="ml-1 text-[var(--danger)]">*</span>
                    )}
                  </span>
                  <span className="text-[11px] muted">
                    {group.type === 'single' ? 'เลือกได้ 1 รายการ' : 'เลือกได้หลายรายการ'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {group.options
                    .filter((o) => o.isAvailable)
                    .map((opt) => {
                      const isSelected = selectedOptionIds.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleOption(group.id, opt.id, group.type)}
                          className={cn(
                            'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                            isSelected
                              ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-sunken)]',
                          )}
                        >
                          <span>{opt.name.th || opt.name.en}</span>
                          {opt.priceDelta !== 0 && (
                            <span
                              className={cn(
                                'text-[11px]',
                                isSelected ? 'text-white/90' : 'muted',
                              )}
                            >
                              {opt.priceDelta > 0 ? `+${opt.priceDelta}` : opt.priceDelta}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}

            {/* Quantity & Note */}
            <div className="grid grid-cols-1 gap-3 border-t border-[var(--line)] pt-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs font-semibold">จำนวน</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    disabled={qty <= 1}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-10 text-center font-bold tabular text-sm">
                    {qty}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setQty(qty + 1)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold">หมายเหตุพิเศษ</span>
                <Input
                  type="text"
                  placeholder="เช่น เผ็ดน้อย, ไม่ใส่ผัก"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Item Selection List */
          <div className="max-h-[42svh] space-y-1.5 overflow-y-auto pr-1">
            {filteredItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm muted">
                ไม่พบเมนูที่ค้นหา
              </p>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectMenuItem(item)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--line)]',
                    'bg-[var(--surface)] p-2.5 text-left transition-colors',
                    'hover:border-[var(--brand)] hover:bg-[var(--surface-sunken)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {item.name.th || item.name.en}
                    </p>
                    {item.optionGroups.length > 0 && (
                      <p className="text-[11px] muted">
                        {item.optionGroups.map((g) => g.name.th || g.name.en).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular">
                    {item.priceOnRequest
                      ? 'ถามราคา'
                      : formatMoney(item.price, catalog.settings.currency)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

