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
  active: boolean;
  available: boolean;
};

export type CartItem = { productId: string; quantity: string };
export type OrderDraft = { customerId: string; items: CartItem[] };
export type OrderStatus = "awaiting_customer_approval" | "pending_billing" | "completed" | "rejected";
export type OrderLine = { product: Product; quantity: number; unitPrice: number };
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
