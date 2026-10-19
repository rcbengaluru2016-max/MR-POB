import type { AccountStatus } from "../types";

export type Customer = {
  id: string;
  name: string;
  code: string;
  phone: string;
  pinCode: string;
  address: string;
  status: "approved" | "pending_verification" | "rejected";
};

export type MrProfile = {
  id: string;
  name: string;
  employeeCode: string;
  territory: string;
  companyIds: string[];
  username?: string;
  email?: string;
  phone?: string;
  status?: AccountStatus;
  createdAt?: string;
  lastLoginAt?: string;
};

export type Product = {
  id: string;
  name: string;
  brand: string;
  code: string;
  companyId: string;
  companyName: string;
  /** Integer paise; mock prices include applicable taxes. */
  unitPrice: number;
  /** Illustrative cart pricing; MRP is integer paise, GST is a percentage. */
  mrp: number;
  gst: number;
  active: boolean;
  available: boolean;
};

export type CartOptions = {
  offer?: string;
  scheme?: boolean;
  schemeType?: string;
  specialRate?: boolean;
  /** Tax-inclusive pack price entered in rupees. */
  specialRatePrice?: string;
};
export type CartItem = CartOptions & { productId: string; quantity: string };
export type OrderDraft = { customerId: string; items: CartItem[] };
export type OrderStatus = "awaiting_customer_approval" | "pending_billing" | "completed" | "rejected";
export type OrderLine = CartOptions & { product: Product; quantity: number; unitPrice: number };
export type Order = {
  id: string;
  reference: string;
  mrId: string;
  customer: Customer;
  date: string;
  status: OrderStatus;
  items: OrderLine[];
  history: { label: string; date: string; note?: string }[];
};
