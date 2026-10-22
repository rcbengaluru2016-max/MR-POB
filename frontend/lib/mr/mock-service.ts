import { mockCustomers, mockProducts } from "./mock-data.ts";
import type { CartItem, MrProfile, Order, OrderDraft, OrderStatus, Product } from "./types";

export const orderStatusLabels: Record<OrderStatus, string> = {
  awaiting_customer_approval: "Awaiting Customer Approval",
  pending_billing: "Pending Billing",
  completed: "Completed",
  rejected: "Rejected",
};
export const maxQuantity = 9999;
export const emptyDraft = (): OrderDraft => ({ customerId: "", items: [] });
export const currency = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
export const orderTotal = (order: Pick<Order, "items">) => order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
export const orderDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(date));
export const validQuantity = (value: string) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= maxQuantity;

export function cartUnitPrice(item: CartItem, product: Product): number | null {
  if (!item.specialRate) return product.unitPrice;
  const value = item.specialRatePrice?.trim() ?? "";
  const price = Math.round(Number(value) * 100);
  return /^\d+(\.\d{1,2})?$/.test(value) && Number.isSafeInteger(price * maxQuantity) && price > 0 ? price : null;
}

export function cartLineTotals(item: CartItem, product: Product) {
  const unitPrice = cartUnitPrice(item, product);
  if (!validQuantity(item.quantity) || unitPrice === null) return null;
  const total = unitPrice * Number(item.quantity);
  const amount = Math.round(total / (1 + product.gst / 100));
  return { amount, gst: total - amount, total };
}

export function searchCustomers(query: string) {
  const term = query.trim().toLowerCase();
  return mockCustomers.filter((customer) => [customer.name, customer.code, customer.phone, customer.pinCode].some((value) => value.toLowerCase().includes(term)));
}

export function searchProducts(profile: MrProfile, brandQuery: string) {
  const term = brandQuery.trim().toLowerCase();
  return mockProducts.filter((product) => product.active && profile.companyIds.includes(product.companyId) && product.brand.toLowerCase().includes(term));
}

export function getMrOrders(orders: Order[], mrId: string, query = "", status: OrderStatus | "all" = "all") {
  const term = query.trim().toLowerCase();
  return orders.filter((order) => order.mrId === mrId && (status === "all" || order.status === status) && [order.reference, order.customer.name, order.customer.code].some((value) => value.toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getMrOrder(orders: Order[], mrId: string, id: string) {
  return orders.find((order) => order.mrId === mrId && order.id === id);
}

export function getDashboardStatistics(orders: Order[], mrId: string) {
  const own = getMrOrders(orders, mrId);
  return {
    total: own.length,
    awaiting_customer_approval: own.filter((order) => order.status === "awaiting_customer_approval").length,
    pending_billing: own.filter((order) => order.status === "pending_billing").length,
    completed: own.filter((order) => order.status === "completed").length,
  };
}

export function validateDraft(draft: OrderDraft, profile: MrProfile): string | null {
  if (!mockCustomers.some((customer) => customer.id === draft.customerId && customer.status === "approved")) return "Select an approved customer before submitting your order.";
  if (!draft.items.length) return "Add at least one product to your order.";
  if (new Set(draft.items.map((item) => item.productId)).size !== draft.items.length) return "Each product must appear only once in the cart.";
  const eligibleProducts = searchProducts(profile, "");
  for (const item of draft.items) {
    const product = eligibleProducts.find((product) => product.id === item.productId);
    if (!product?.available) return "A product in your cart is unavailable. Remove it before continuing.";
    if (!validQuantity(item.quantity)) return `Enter a whole-number quantity between 1 and ${maxQuantity.toLocaleString("en-IN")} for ${product.brand}.`;
    if (cartUnitPrice(item, product) === null) return `Enter a positive special rate price with up to two decimal places for ${product.brand}.`;
  }
  return null;
}

/** Mock adapter only. No network request or database write takes place. */
export async function submitMockOrder(draft: OrderDraft, profile: MrProfile): Promise<Order> {
  const error = validateDraft(draft, profile);
  if (error) throw new Error(error);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const date = new Date().toISOString();
  const id = crypto.randomUUID();
  return {
    id, reference: `ZX-DEMO-${id.slice(0, 8).toUpperCase()}`, mrId: profile.id, date,
    customer: { ...mockCustomers.find((customer) => customer.id === draft.customerId)! },
    status: "awaiting_customer_approval",
    items: draft.items.map((item) => {
      const product = mockProducts.find((product) => product.id === item.productId)!;
      return { ...item, product: { ...product }, quantity: Number(item.quantity), unitPrice: cartUnitPrice(item, product)! };
    }),
    history: [{ label: "Demo order submitted", date, note: "Awaiting customer approval. Created in this preview only." }],
  };
}
