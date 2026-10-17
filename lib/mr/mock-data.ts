import type { Customer, MrProfile, Order, OrderStatus, Product } from "./types";

export const mockProfile: MrProfile = {
  id: "mr-manoj",
  name: "Manoj Kumar",
  employeeCode: "ZNX-MR-001",
  territory: "Bengaluru South",
  companyIds: ["zenex", "nova"],
};

export const mockCustomers: Customer[] = [
  { id: "apollo", name: "Apollo Pharmacy", code: "ZNX-CUS-1001", phone: "9845012345", pinCode: "560041", address: "4th Block, Jayanagar, Bengaluru", status: "approved" },
  { id: "srisai", name: "Sri Sai Medicals", code: "ZNX-CUS-1002", phone: "9845023456", pinCode: "560078", address: "JP Nagar, Bengaluru", status: "approved" },
  { id: "medplus", name: "MedPlus Pharmacy", code: "ZNX-CUS-1003", phone: "9845034567", pinCode: "560076", address: "Bannerghatta Road, Bengaluru", status: "approved" },
  { id: "sanjeevini", name: "Sanjeevini Medicals", code: "ZNX-CUS-1004", phone: "9845045678", pinCode: "560085", address: "Banashankari, Bengaluru", status: "approved" },
  { id: "care", name: "Care & Cure Pharmacy", code: "ZNX-CUS-1005", phone: "9845056789", pinCode: "560068", address: "Bommanahalli, Bengaluru", status: "pending_verification" },
  { id: "city", name: "City Health Medicals", code: "ZNX-CUS-1006", phone: "9845067890", pinCode: "560029", address: "BTM Layout, Bengaluru", status: "rejected" },
];

export const mockProducts: Product[] = [
  { id: "zenpara", name: "Paracetamol 650 mg · 10 tablets", brand: "Zenpara 650", code: "ZNX-P001", companyId: "zenex", companyName: "Zenex International", unitPrice: 3250, active: true, available: true },
  { id: "zenvit", name: "Multivitamin · 15 tablets", brand: "Zenvit Plus", code: "ZNX-P002", companyId: "zenex", companyName: "Zenex International", unitPrice: 14500, active: true, available: true },
  { id: "zencal", name: "Calcium + Vitamin D3 · 15 tablets", brand: "Zencal D3", code: "ZNX-P003", companyId: "zenex", companyName: "Zenex International", unitPrice: 11200, active: true, available: true },
  { id: "zenacid", name: "Pantoprazole 40 mg · 10 tablets", brand: "Zenacid 40", code: "ZNX-P004", companyId: "zenex", companyName: "Zenex International", unitPrice: 8900, active: true, available: false },
  { id: "novac", name: "Vitamin C 500 mg · 20 tablets", brand: "Nova C", code: "NVA-P001", companyId: "nova", companyName: "Nova Healthcare", unitPrice: 7800, active: true, available: true },
  { id: "novazinc", name: "Zinc 20 mg · 10 tablets", brand: "Nova Zinc", code: "NVA-P002", companyId: "nova", companyName: "Nova Healthcare", unitPrice: 5600, active: true, available: true },
  { id: "retired", name: "Multivitamin · 10 tablets", brand: "Zenvit Classic", code: "ZNX-P005", companyId: "zenex", companyName: "Zenex International", unitPrice: 9000, active: false, available: true },
  { id: "unassigned", name: "Vitamin B complex · 10 tablets", brand: "Other B", code: "OTH-P001", companyId: "other", companyName: "Other Pharma", unitPrice: 6500, active: true, available: true },
];

function seedOrder(index: number, status: OrderStatus, customerIndex: number, day: number): Order {
  const date = `2026-10-${String(day).padStart(2, "0")}T09:30:00+05:30`;
  const products = [mockProducts[index % 3], mockProducts[4 + index % 2]];
  const history: Order["history"] = [{ label: "Order submitted", date, note: "Sent for customer approval." }];
  if (status !== "awaiting_customer_approval") history.push({ label: status === "rejected" ? "Rejected by customer" : "Approved by customer", date: date.replace("09:30", "11:00"), ...(status === "rejected" ? { note: "Customer requested a revised quantity." } : {}) });
  if (status === "completed") history.push({ label: "Billing completed", date: date.replace("09:30", "15:00") });
  return {
    id: `mock-${1001 + index}`, reference: `ZX-${1001 + index}`, mrId: mockProfile.id,
    customer: mockCustomers[customerIndex], date, status,
    items: products.map((product, i) => ({ product: { ...product }, quantity: 5 + index + i, unitPrice: product.unitPrice })), history,
  };
}

export const mockOrders: Order[] = [
  seedOrder(0, "completed", 0, 5), seedOrder(1, "pending_billing", 1, 8),
  seedOrder(2, "awaiting_customer_approval", 2, 10), seedOrder(3, "completed", 3, 11),
  seedOrder(4, "rejected", 1, 12), seedOrder(5, "pending_billing", 0, 14),
  seedOrder(6, "completed", 2, 15), seedOrder(7, "awaiting_customer_approval", 1, 16),
  { ...seedOrder(8, "completed", 3, 16), id: "other-mr-order", reference: "ZX-2001", mrId: "mr-other" },
];
