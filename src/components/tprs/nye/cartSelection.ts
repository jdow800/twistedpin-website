import { z } from "zod";
import { cartErrorResponseSchema, cartReplaceRequestSchema, cartStateSchema,
  type CartAddItem, type CartErrorResponse, type CartReplaceRequest, type CartState } from "../../../tprs/schemas/cart";

/** Explicit dated party bounds, supplied by the selected product's duration.
 * NYE consumes one pool unit per lane; prep/turnover may extend the hold bounds. */
export type NyeLaneCoverage = {
  cartLineRef: string;
  count: number;
  startTime: string;
  endTime: string;
  poolId?: string;
};

const coverageSchema = z.object({
  cartLineRef: z.string().min(1), count: z.number().int().positive(),
  startTime: z.string().datetime({ offset: true }), endTime: z.string().datetime({ offset: true }),
  poolId: z.string().uuid().optional(),
}).strict();
const pendingSchema = z.object({
  version: z.literal(1), cartToken: z.string().min(1), request: cartReplaceRequestSchema,
  coverage: z.array(coverageSchema), originalDeadline: z.string().datetime().nullable(),
  createdAt: z.number().finite(),
}).strict();
export type PendingCartSelection = z.infer<typeof pendingSchema>;
export const NYE_CART_PENDING_KEY = "tprs:nye:cart-selection:v1";

type RevisionedCart = CartState & { revision: number; items: CartAddItem[] };
function revisioned(cart: CartState): cart is RevisionedCart {
  return Number.isSafeInteger(cart.revision) && Number(cart.revision) >= 0 && Array.isArray(cart.items) && !!cart.cartToken;
}
function itemKey(item: CartAddItem): string {
  return JSON.stringify([item.cartLineRef, item.productId, item.quantity,
    item.startTime === undefined ? null : Date.parse(item.startTime)]);
}
function sameItems(a: readonly CartAddItem[], b: readonly CartAddItem[]): boolean {
  if (a.length !== b.length || new Set(a.map(i => i.cartLineRef)).size !== a.length
    || new Set(b.map(i => i.cartLineRef)).size !== b.length) return false;
  const left = a.map(itemKey).sort(), right = b.map(itemKey).sort();
  return left.every((key, i) => key === right[i]);
}
function validCoverage(items: readonly CartAddItem[], coverage: readonly NyeLaneCoverage[]): boolean {
  if ((items.length > 0 && coverage.length === 0) || (items.length === 0 && coverage.length > 0)
    || new Set(coverage.map(c => c.cartLineRef)).size !== coverage.length) return false;
  return coverage.every(c => {
    const item = items.find(i => i.cartLineRef === c.cartLineRef);
    return item && item.quantity === c.count && item.startTime !== undefined
      && Date.parse(item.startTime) === Date.parse(c.startTime)
      && Number.isFinite(Date.parse(c.endTime)) && Date.parse(c.endTime) > Date.parse(c.startTime);
  });
}

/** A live but unrelated cart is never sufficient. This check is shared by the
 * selection flow and payment's GET-only preflight. It does not acquire holds. */
export function exactSelectionHeld(cart: CartState, items: readonly CartAddItem[],
  coverage: readonly NyeLaneCoverage[], now = Date.now()): boolean {
  if (!revisioned(cart) || !sameItems(cart.items, items) || !validCoverage(items, coverage)
    || cart.holds.length !== coverage.length || new Set(cart.holds.map(h => h.id)).size !== cart.holds.length) return false;
  if (items.length === 0) return cart.holdExpiresAt === null;
  const deadline = Date.parse(cart.holdExpiresAt ?? "");
  if (!Number.isFinite(deadline) || deadline <= now) return false;
  return coverage.every(c => {
    const rows = cart.holds.filter(h => h.cartLineRef === c.cartLineRef);
    if (rows.length !== 1) return false;
    const h = rows[0];
    return h.count === c.count && (!c.poolId || h.poolId === c.poolId)
      && Date.parse(h.startTime) <= Date.parse(c.startTime) && Date.parse(h.endTime) >= Date.parse(c.endTime)
      && Date.parse(h.expiresAt) === deadline;
  });
}

export type CartSelectionApi = {
  establishCartSession(): Promise<CartState>;
  getCart(): Promise<CartState>;
  getActiveCheckoutAttempt(): Promise<unknown | null | undefined>;
  replaceCartItems(request: CartReplaceRequest): Promise<CartState>;
};
export type CartSelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PendingCartRead = { kind: "empty" } | { kind: "pending"; pending: PendingCartSelection }
  | { kind: "blocked"; reason: "storage_unavailable" | "pending_unreadable" };
export type CartSelectionResult =
  | { kind: "session" | "held" | "cleared"; cart: RevisionedCart }
  | { kind: "payment_recovery"; attempt?: unknown }
  | { kind: "rejected"; error: CartErrorResponse }
  | { kind: "expired"; cart: RevisionedCart }
  | { kind: "review"; reason: "session_changed" | "selection_changed" | "receipt_changed" | "coverage_changed" | "deadline_changed"; cart?: RevisionedCart }
  | { kind: "uncertain"; pending: PendingCartSelection }
  | { kind: "blocked"; reason: "busy" | "pending_mutation" | "storage_unavailable" | "pending_unreadable" | "session_unavailable" | "invalid_proposal" | "no_pending_mutation" };

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function browserStorage(): CartSelectionStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
}
/** Session-scoped durable pending evidence contains no contact or payment data.
 * A corrupt/unwritable store blocks acquisition instead of inventing another key. */
export function readPendingCartSelection(storage = browserStorage()): PendingCartRead {
  if (!storage) return { kind: "blocked", reason: "storage_unavailable" };
  let raw: string | null;
  try { raw = storage.getItem(NYE_CART_PENDING_KEY); } catch { return { kind: "blocked", reason: "storage_unavailable" }; }
  if (raw === null) return { kind: "empty" };
  try {
    const pending = pendingSchema.parse(JSON.parse(raw));
    if (!validCoverage(pending.request.items, pending.coverage)) throw new Error("invalid coverage");
    return { kind: "pending", pending: freeze(pending) };
  } catch { return { kind: "blocked", reason: "pending_unreadable" }; }
}

/** The UI owns proposal/form drafts; this controller owns exactly one pending
 * cart mutation. No browsing call writes inventory. Unknown outcomes may ONLY
 * retry their retained body/key, including after reload or a later expiry. */
export function createCartSelectionController(options: {
  api: CartSelectionApi; storage?: CartSelectionStorage; now?: () => number; newMutationKey?: () => string;
}) {
  const { api } = options, storage = options.storage ?? browserStorage();
  const now = options.now ?? Date.now, newKey = options.newMutationKey ?? (() => crypto.randomUUID());
  let busy = false;
  const readPending = () => readPendingCartSelection(storage);
  function save(pending: PendingCartSelection): boolean {
    if (!storage) return false;
    try {
      const raw = JSON.stringify(pending);
      storage.setItem(NYE_CART_PENDING_KEY, raw);
      return storage.getItem(NYE_CART_PENDING_KEY) === raw;
    } catch { return false; }
  }
  function clear(pending: PendingCartSelection): boolean {
    if (!storage) return false;
    try {
      const current = readPending();
      if (current.kind !== "pending" || JSON.stringify(current.pending) !== JSON.stringify(pending)) return false;
      storage.removeItem(NYE_CART_PENDING_KEY);
      return storage.getItem(NYE_CART_PENDING_KEY) === null;
    } catch { return false; }
  }
  const blocked = (reason: Extract<CartSelectionResult, {kind: "blocked"}>["reason"]): CartSelectionResult => ({kind: "blocked", reason});
  async function run(work: () => Promise<CartSelectionResult>): Promise<CartSelectionResult> {
    if (busy) return blocked("busy");
    busy = true;
    try { return await work(); } finally { busy = false; }
  }
  async function send(pending: PendingCartSelection): Promise<CartSelectionResult> {
    // A missing/replaced cookie cannot safely retry an old cart's first hold.
    // This GET never changes the expected revision or refreshes its deadline.
    try {
      const cart = cartStateSchema.parse(await api.getCart());
      if (!revisioned(cart) || cart.cartToken !== pending.cartToken)
        return { kind: "review", reason: "session_changed" };
      const attempt = await api.getActiveCheckoutAttempt();
      if (attempt) return { kind: "payment_recovery", attempt };
    } catch { return { kind: "uncertain", pending }; }
    let cart: RevisionedCart;
    try {
      const response = cartStateSchema.parse(await api.replaceCartItems(pending.request));
      if (!revisioned(response)) return { kind: "uncertain", pending };
      cart = response;
    } catch (error) {
      const value = error as { status?: number; body?: unknown } | null;
      const parsed = cartErrorResponseSchema.safeParse(value?.body);
      if ((value?.status === 400 || value?.status === 409) && parsed.success) {
        // These are authoritative transaction rejections, so a new explicit
        // proposal is safe after the caller fetches/reviews the current cart.
        if (!clear(pending)) return blocked("storage_unavailable");
        return parsed.data.code === "payment_recovery_required" ? {kind: "payment_recovery"}
          : { kind: "rejected", error: parsed.data };
      }
      return { kind: "uncertain", pending };
    }
    const receipt = cart.mutation;
    let result: CartSelectionResult;
    if (cart.cartToken !== pending.cartToken) return {kind: "review", reason: "session_changed", cart};
    else if (!receipt || receipt.key !== pending.request.mutationKey
      || receipt.appliedRevision !== pending.request.expectedRevision + 1)
      return { kind: "uncertain", pending };
    else if (cart.revision !== receipt.appliedRevision) result = {kind: "review", reason: "receipt_changed", cart};
    else if (!sameItems(cart.items, pending.request.items)) result = {kind: "review", reason: "selection_changed", cart};
    else if (pending.request.items.length && (!cart.holdExpiresAt || Date.parse(cart.holdExpiresAt) <= now())) result = {kind: "expired", cart};
    else if (!exactSelectionHeld(cart, pending.request.items, pending.coverage, now())) result = {kind: "review", reason: "coverage_changed", cart};
    else if (pending.originalDeadline && cart.holdExpiresAt && Date.parse(cart.holdExpiresAt) !== Date.parse(pending.originalDeadline))
      result = {kind: "review", reason: "deadline_changed", cart};
    else result = {kind: pending.request.items.length ? "held" : "cleared", cart};
    return clear(pending) ? result : blocked("storage_unavailable");
  }
  return {
    readPending,
    establishSession: () => run(async () => {
      const pending = readPending();
      if (pending.kind === "blocked") return pending;
      if (pending.kind === "pending") return blocked("pending_mutation");
      try {
        const cart = cartStateSchema.parse(await api.establishCartSession());
        if (!revisioned(cart)) return blocked("session_unavailable");
        const attempt = await api.getActiveCheckoutAttempt();
        return attempt ? {kind: "payment_recovery", attempt} : {kind: "session", cart};
      } catch { return blocked("session_unavailable"); }
    }),
    commit: (baseCart: CartState, items: readonly CartAddItem[], coverage: readonly NyeLaneCoverage[]) => run(async () => {
      const current = readPending();
      if (current.kind === "blocked") return current;
      if (current.kind === "pending") return blocked("pending_mutation");
      if (!revisioned(baseCart)) return blocked("session_unavailable");
      let pending: PendingCartSelection;
      try {
        pending = pendingSchema.parse({ version: 1, cartToken: baseCart.cartToken,
          request: {items, expectedRevision: baseCart.revision, mutationKey: newKey()}, coverage,
          originalDeadline: baseCart.holdExpiresAt && Date.parse(baseCart.holdExpiresAt) > now() ? baseCart.holdExpiresAt : null,
          createdAt: now() });
        if (!validCoverage(pending.request.items, pending.coverage)
          || new Set(items.map(i => i.cartLineRef)).size !== items.length) return blocked("invalid_proposal");
        freeze(pending);
      } catch { return blocked("invalid_proposal"); }
      if (!save(pending)) return blocked("storage_unavailable");
      return send(pending);
    }),
    retryPending: () => run(async () => {
      const current = readPending();
      if (current.kind === "blocked") return current;
      return current.kind === "pending" ? send(current.pending) : blocked("no_pending_mutation");
    }),
  };
}
