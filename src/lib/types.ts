export const LOCALES = ['th', 'en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'th';

/** Every guest-visible string from the Sheet carries all three languages. */
export interface Localized {
  th: string;
  en: string;
  zh: string;
}

export function pick(l: Localized, locale: Locale): string {
  // Fall back through th -> en so a half-translated Sheet still renders.
  return l[locale] || l.th || l.en || l.zh || '';
}

export interface Category {
  id: string;
  name: Localized;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Allergen {
  id: string;
  name: Localized;
  icon: string;
  isActive: boolean;
}

export interface MenuOption {
  id: string;
  groupId: string;
  name: Localized;
  priceDelta: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface MenuOptionGroup {
  id: string;
  menuId: string;
  name: Localized;
  type: 'single' | 'multi';
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: Localized;
  description: Localized;
  ingredients: Localized;
  price: number;
  imageUrl: string;
  /** Allergen ids the dish definitely contains. */
  allergens: string[];
  /** Allergen ids possible via cross-contamination in the kitchen. */
  mayContain: string[];
  tags: string[];
  spicyLevel: number;
  isVegetarian: boolean;
  isAvailable: boolean;
  sortOrder: number;
  /**
   * Sold by weight — whole crab, river prawn, grouper by the kilo. `price` is
   * 0 and means nothing until the kitchen weighs it and a member of staff sets
   * the real figure on the order line. Anything that adds money up has to
   * treat these as unknown rather than free.
   */
  priceOnRequest: boolean;
  /** Beer and spirits. Gated behind an age confirmation before ordering. */
  isAlcohol: boolean;
  optionGroups: MenuOptionGroup[];
}

/** The single blob cached in Redis and shipped to the client. */
export interface MenuCatalog {
  version: number;
  generatedAt: string;
  categories: Category[];
  allergens: Allergen[];
  items: MenuItem[];
  settings: PublicSettings;
}

export interface PublicSettings {
  shopName: string;
  currency: string;
  serviceChargePercent: number;
  vatPercent: number;
  vatIncluded: boolean;
  allergyDisclaimer: Localized;
  paymentNote: Localized;
  promptPayName: string;
  minOrderAmount: number;
  /** Shown on dishes priced by weight, so the guest can ring the kitchen. */
  contactPhone: string;
  /** The villa's service rules, shown once immediately before checkout. */
  serviceNoticeEnabled: boolean;
  serviceNoticeImage: string;
  /** One rule per line. Rendered as a list, not a paragraph. */
  serviceNotice: Localized;
  alcoholMinAge: number;
  alcoholNotice: Localized;
}

export interface VillaTable {
  id: string;
  label: string;
  villa: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  isActive: boolean;
}

export type GeoStatus = 'OK' | 'OUTSIDE' | 'DENIED' | 'UNAVAILABLE' | 'UNKNOWN';
export type SessionStatus = 'OPEN' | 'LOCKED' | 'CLOSED';

export interface GuestSession {
  id: string;
  tableId: string;
  tableLabel: string;
  villa: string;
  status: SessionStatus;
  openedAt: string;
  closedAt: string | null;
  guestName: string;
  /** Allergen ids the guest declared. */
  allergyProfile: string[];
  geoStatus: GeoStatus;
  distanceM: number | null;
  locale: Locale;
  /** Set once checkout starts, so the bill cannot change underneath it. */
  activePaymentId: string | null;
}

export interface CartLineOption {
  groupId: string;
  optionId: string;
  name: Localized;
  priceDelta: number;
}

export interface CartLine {
  /** hash(menuId + sorted option ids + note) — identical lines merge. */
  key: string;
  menuId: string;
  name: Localized;
  qty: number;
  /** Zero and meaningless when `priceOnRequest` is set. */
  unitPrice: number;
  options: CartLineOption[];
  note: string;
  allergenAck: boolean;
  /** Weighed by the kitchen — staff set the real price after the order lands. */
  priceOnRequest: boolean;
  addedAt: string;
}

export interface Cart {
  sessionId: string;
  lines: CartLine[];
  updatedAt: string;
}

export type OrderStatus = 'NEW' | 'COOKING' | 'SERVED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  menuId: string;
  name: Localized;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  options: CartLineOption[];
  note: string;
  allergenAck: boolean;
  /** Copied off the menu item, so repricing does not need a catalog lookup. */
  priceOnRequest: boolean;
  /** Set once staff enter the weighed price. Until then the line is unbilled. */
  pricedBy: string | null;
  pricedAt: string | null;
}

export interface Order {
  id: string;
  sessionId: string;
  tableId: string;
  tableLabel: string;
  villa: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  /** Allergen ids, snapshotted off the session at order time. */
  allergyProfile: string[];
  /**
   * The same allergies as readable names, resolved once when the order is
   * placed. The kitchen display has no catalog to look ids up against, and a
   * ticket that reads "al-shellfish" is a ticket nobody reads.
   */
  allergyLabels: string[];
  geoStatus: GeoStatus;
  locale: Locale;
}

export type PaymentStatus =
  | 'PENDING'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface Payment {
  id: string;
  sessionId: string;
  tableLabel: string;
  villa: string;
  orderIds: string[];
  amount: number;
  method: 'promptpay';
  status: PaymentStatus;
  slipUrl: string | null;
  slipUploadedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

export type AdminRole = 'OWNER' | 'MANAGER' | 'STAFF';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
}

/** Ranked capability check — OWNER outranks MANAGER outranks STAFF. */
const RANK: Record<AdminRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };
export function hasRole(role: AdminRole | undefined, min: AdminRole): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[min];
}
