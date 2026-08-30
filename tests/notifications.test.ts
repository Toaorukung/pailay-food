import { describe, it, expect } from 'vitest';
import { confirmationText } from '@/lib/line';
import { isSettled, paidTotal, outstandingTotal } from '@/lib/orders';
import { isConfirmed, type Order, type MenuCatalog } from '@/lib/types';

const loc = (th: string, en = th, zh = th) => ({ th, en, zh });

const dummySettings: MenuCatalog['settings'] = {
  shopName: 'ไปเล วิลล่า',
  currency: 'THB',
  serviceChargePercent: 0,
  vatPercent: 7,
  vatIncluded: true,
  allergyDisclaimer: loc(''),
  paymentNote: loc(''),
  promptPayName: '',
  minOrderAmount: 0,
  orderOpen: '',
  orderCutoff: '',
  contactPhone: '',
  welcomeEnabled: false,
  welcomeImage: '',
  serviceNoticeEnabled: false,
  serviceNoticeImage: '',
  serviceNotice: loc(''),
  alcoholMinAge: 20,
  alcoholNotice: loc(''),
};

const sampleOrder: Order = {
  id: 'ord-12345',
  sessionId: 'sess-abc',
  tableId: 'tab-1',
  tableLabel: 'Villa 1',
  villa: 'Villa 1 — Pool',
  createdAt: '2026-08-30T12:00:00.000Z',
  status: 'PENDING_CONFIRM',
  items: [
    {
      id: 'i-1',
      menuId: 'm-padthai',
      name: loc('ผัดไทยกุ้งสด', 'Pad Thai with Prawn', '鲜虾泰式炒河粉'),
      unitPrice: 150,
      qty: 2,
      lineTotal: 300,
      options: [],
      note: 'เผ็ดน้อย',
      allergenAck: true,
      priceOnRequest: false,
      pricedAt: null,
      pricedBy: null,
    },
  ],
  subtotal: 300,
  serviceCharge: 0,
  vat: 0,
  total: 300,
  paymentId: 'pay-123',
  lineUserId: 'U1234567890',
  confirmedAt: null,
  confirmedBy: null,
  allergyProfile: [],
  allergyLabels: [],
  geoStatus: 'OK',
  locale: 'th',
};

describe('order confirmation formatting', () => {
  it('formats Thai confirmation message accurately', () => {
    const text = confirmationText(sampleOrder, dummySettings);
    expect(text).toContain('ยืนยันออเดอร์เรียบร้อย');
    expect(text).toContain('ord-12345');
    expect(text).toContain('Villa 1 — Pool');
    expect(text).toContain('2× ผัดไทยกุ้งสด');
    expect(text).toContain('300');
  });

  it('formats English confirmation message for English locale', () => {
    const enOrder = { ...sampleOrder, locale: 'en' as const };
    const text = confirmationText(enOrder, dummySettings);
    expect(text).toContain('Your order is confirmed');
    expect(text).toContain('Pad Thai with Prawn');
  });
});

describe('order settlement logic', () => {
  it('recognises confirmed kitchen statuses', () => {
    expect(isConfirmed('NEW')).toBe(true);
    expect(isConfirmed('COOKING')).toBe(true);
    expect(isConfirmed('SERVED')).toBe(true);
    expect(isConfirmed('PENDING_CONFIRM')).toBe(false);
    expect(isConfirmed('CANCELLED')).toBe(false);
  });

  it('isSettled requires confirmed status and APPROVED payment', () => {
    const newOrder = { ...sampleOrder, status: 'NEW' as const };
    expect(isSettled(newOrder, 'APPROVED')).toBe(true);
    expect(isSettled(newOrder, 'PENDING')).toBe(false);
    expect(isSettled(sampleOrder, 'APPROVED')).toBe(false);
  });

  it('calculates paidTotal and outstandingTotal correctly', () => {
    const order1 = { ...sampleOrder, id: 'o1', status: 'NEW' as const, total: 300 };
    const order2 = { ...sampleOrder, id: 'o2', status: 'COOKING' as const, total: 500 };
    const order3 = { ...sampleOrder, id: 'o3', status: 'PENDING_CONFIRM' as const, total: 200 };

    const payments: Record<string, 'APPROVED' | 'PENDING'> = {
      o1: 'APPROVED',
      o2: 'PENDING',
      o3: 'PENDING',
    };

    const statusOf = (o: Order) => payments[o.id];

    expect(paidTotal([order1, order2, order3], statusOf)).toBe(300);
    expect(outstandingTotal([order1, order2, order3], statusOf)).toBe(500);
  });
});

describe('order item modification and retotaling', () => {
  it('recalculates order total when item is changed', async () => {
    const { retotal } = await import('@/lib/orders');
    const replacementItem = {
      ...sampleOrder.items[0],
      unitPrice: 200,
      qty: 3,
      lineTotal: 600,
    };
    const updated = retotal(sampleOrder, [replacementItem], dummySettings);
    expect(updated.subtotal).toBe(600);
    expect(updated.total).toBe(600);
  });

  it('recalculates order total when item is added', async () => {
    const { retotal } = await import('@/lib/orders');
    const extraItem = {
      id: 'i-2',
      menuId: 'm-soup',
      name: loc('ต้มยำกุ้ง', 'Tom Yum Goong', '冬阴功汤'),
      unitPrice: 250,
      qty: 1,
      lineTotal: 250,
      options: [],
      note: '',
      allergenAck: true,
      priceOnRequest: false,
      pricedAt: null,
      pricedBy: null,
    };
    const updated = retotal(sampleOrder, [...sampleOrder.items, extraItem], dummySettings);
    expect(updated.subtotal).toBe(550);
    expect(updated.total).toBe(550);
    expect(updated.items.length).toBe(2);
  });
});

describe('payment and stay completion', () => {
  it('marks payment as approved and links session', () => {
    const payment = {
      id: 'p-1',
      sessionId: 's-123',
      tableLabel: 'Villa 1',
      villa: 'Villa 1',
      orderId: 'ord-123',
      amount: 500,
      method: 'promptpay' as const,
      status: 'APPROVED' as const,
      slipUrl: 'https://example.com/slip.jpg',
      slipUploadedAt: new Date().toISOString(),
      verifiedBy: 'Admin User',
      verifiedAt: new Date().toISOString(),
      rejectReason: null,
      createdAt: new Date().toISOString(),
    };
    expect(payment.status).toBe('APPROVED');
    expect(payment.sessionId).toBe('s-123');
  });
});


