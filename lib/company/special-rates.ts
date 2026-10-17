import type { AppStore } from "@/lib/server/store";
import type { CompanySpecialRate } from "@/lib/types";

export type SpecialRateStatus = "Upcoming" | "Active" | "Expired" | "Inactive";

export function getSpecialRateStatus(rate: CompanySpecialRate, today = new Date().toISOString().slice(0, 10)): SpecialRateStatus {
  if (!rate.enabled) return "Inactive";
  if (rate.endDate < today) return "Expired";
  if (rate.startDate > today) return "Upcoming";
  return "Active";
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function overlapsSpecialRate(store: AppStore, companyCode: string, productId: string, startDate: string, endDate: string, exceptId?: string) {
  return store.companySpecialRates.some((rate) => rate.companyCode === companyCode && rate.productId === productId && rate.id !== exceptId && rate.approvalStatus !== "rejected" && rate.startDate <= endDate && startDate <= rate.endDate);
}

/** Shared order-entry guard. Keep the returned amounts as an order-line snapshot. */
export function resolveSpecialRateForOrder(store: AppStore, companyCode: string, productId: string, specialRateId: string, orderDate = new Date().toISOString().slice(0, 10)) {
  const product = store.companyProducts.find((item) => item.id === productId && item.companyCode === companyCode && item.status === "active");
  const rate = store.companySpecialRates.find((item) => item.id === specialRateId && item.companyCode === companyCode && item.productId === productId);
  if (!product || !rate || rate.approvalStatus !== "approved" || !rate.enabled || !validIsoDate(orderDate) || orderDate < rate.startDate || orderDate > rate.endDate || rate.specialRate <= 0 || rate.specialRate >= product.mrp) return null;
  return { specialRateId: rate.id, specialRate: rate.specialRate, unitPrice: rate.specialRate, mrp: product.mrp, productCode: product.productCode, productName: product.brandName };
}
