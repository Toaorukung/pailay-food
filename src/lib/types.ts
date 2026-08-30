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
  /**
   * Smallest quantity a guest may order of this dish in one line. 0 means no
   * floor. Used for set menus a villa only cooks in bulk — an ABF breakfast at
   * "min 5 sets", a hotpot at "min 16 people". The quantity stepper starts
   * here and cannot go below it, and the order is rejected server-side if a
   * line still falls short.
   */
  minQty: number;
  /**
   * Time-of-day window this dish can be ordered in, "HH:MM" in Thailand time.
   * Blank ends are open. `orderUntil` is the load-bearing one — drinks the
   * villa sells itself close for orders at 17:00 so the kitchen is not chasing
   * a last-minute crate of beer at closing.
   */
  orderFrom: string;
  orderUntil: string;
  /**
   * Hours of notice the kitchen needs for this dish. A whole roast pig or a
   * "come and grill for you" service cannot be started on the spot. With a
   * lead time set, the dish stops being orderable once there is no longer that
   * much time left before the day's cutoff.
   */
  leadHours: number;
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
  /**
   * When the villa takes orders, "HH:MM" in Thailand time. Both blank means
   * around the clock. Outside the window the guest can still browse and build
   * a cart, but confirming the order is refused — the last-order cutoff a
   * villa sets at 21:00 lives here.
   */
  orderOpen: string;
  orderCutoff: string;
  /**
   * The same artwork shown as a welcome popup the first time a guest opens the
   * app, before they are asked for their name, phone and allergies.
   */
  welcomeEnabled: boolean;
  welcomeImage: string;
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
  /** URL-safe villa name, the first segment of the printed link. */
  slug: string;
  /** Random, unguessable second segment. Printed into the QR code. */
  qrCode: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  isActive: boolean;
}

export type GeoStatus = 'OK' | 'OUTSIDE' | 'DENIED' | 'UNAVAILABLE' | 'UNKNOWN';
/**
 * Sessions no longer close themselves. A villa keeps one session for the whole
 * stay — order, pay, eat, order again — until staff expire it from
 * /admin/sessions. That is also what turns the link into a read-only record of
 * everything the villa ordered.
 */
export type SessionStatus = 'OPEN' | 'CLOSED';

export interface GuestSession {
  id: string;
  tableId: string;
  tableLabel: string;
  villa: string;
  status: SessionStatus;
  openedAt: string;
  closedAt: string | null;
  guestName: string;
  /** Asked for on first open, so staff can ring the villa about an order. */
  guestPhone: string;
  /** Allergen ids the guest declared. */
  allergyProfile: string[];
  /**
   * The LINE account that opened the link, verified from a LIFF id token.
   * This is what the confirmation message is pushed to. Blank when the app was
   * opened in an ordinary browser rather than inside LINE.
   */
  lineUserId: string;
  geoStatus: GeoStatus;
  distanceM: number | null;
  locale: Locale;
  /** When staff ended it, and who. Null while the session is still open. */
  closedBy: string | null;
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

/**
 * An order's life, in order.
 *
 * Nothing is cooked until a member of staff has looked at the ticket. A guest
 * confirming their cart raises the order as PENDING_CONFIRM, which is the
 * queue on /admin/pending: staff ring the villa, adjust or price lines, and
 * only then confirm. Confirming is what puts it on the kitchen board and what
 * sends the guest their confirmation on LINE.
 *
 * Money is settled off the app — the guest transfers or pays reception — and
 * an admin uploads the slip afterwards from /admin/payments. So payment state
 * lives entirely on the Payment record and never gates the kitchen.
 */
export type OrderStatus =
  /** Placed by the guest. Waiting for staff to check it and confirm. */
  | 'PENDING_CONFIRM'
  /** Confirmed by staff. This is when it reaches the kitchen display. */
  | 'NEW'
  | 'COOKING'
  | 'SERVED'
  | 'CANCELLED'
  /**
   * Retired statuses, kept so orders written under the old pay-first flow
   * still deserialise and render for their 30 days of retention. Nothing
   * produces them any more.
   */
  | 'AWAITING_PRICING'
  | 'UNPAID'
  | 'AWAITING_PAYMENT';

/** Statuses the kitchen acts on. Anything else is still a front-of-house matter. */
export const KITCHEN_STATUSES: OrderStatus[] = ['NEW', 'COOKING', 'SERVED'];

/**
 * Staff have confirmed this ticket, so the kitchen is allowed to see it.
 *
 * Deliberately not "paid": under the current flow the money arrives outside
 * the app and the slip is uploaded later, so waiting for payment before
 * cooking would leave every order sitting cold.
 */
export function isConfirmed(status: OrderStatus): boolean {
  return status === 'NEW' || status === 'COOKING' || status === 'SERVED';
}

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
  /** The payment raised for this order when the guest confirmed it. */
  paymentId: string;
  /**
   * Who to message on LINE about this ticket, snapshotted off the session.
   * Kept per order rather than read back off the session at confirm time: a
   * villa can have several people ordering on one bill, and the confirmation
   * belongs to whoever actually sent the order. Blank when the guest opened
   * the link outside LINE.
   */
  lineUserId: string;
  /** Set when staff confirmed the ticket into the kitchen. */
  confirmedAt: string | null;
  confirmedBy: string | null;
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

/**
 * PENDING is "confirmed, money not recorded yet" — the row an admin sees on
 * /admin/payments waiting for a slip. APPROVED means an admin has uploaded the
 * transfer slip against it, which is what counts the order as revenue.
 *
 * PENDING_REVIEW and REJECTED belonged to the old flow, where the guest
 * uploaded their own slip and staff checked it. Kept so historic payments
 * still deserialise.
 */
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
  /** One payment, one order. Guests settle each order before it is cooked. */
  orderId: string;
  amount: number;
  method: 'promptpay';
  status: PaymentStatus;
  slipUrl: string | null;
  slipUploadedAt: string | null;
  /** The admin who uploaded the slip. */
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
