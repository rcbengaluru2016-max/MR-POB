import assert from "node:assert/strict";
import test from "node:test";
import { mockCustomers, mockOrders, mockProfile, mockProducts } from "../lib/mr/mock-data.ts";
import { getDashboardStatistics, getMrOrder, getMrOrders, orderTotal, searchCustomers, searchProducts, submitMockOrder, validateDraft } from "../lib/mr/mock-service.ts";

test("customer search supports name, code, phone and PIN without duplicating records", () => {
  const customer = mockCustomers[0];
  for (const query of [" APOLLO ", customer.code, customer.phone, customer.pinCode]) {
    assert.equal(searchCustomers(query)[0], customer);
  }
  assert.deepEqual(searchCustomers("no-such-customer"), []);
});

test("MR catalog hides inactive and unassigned products while exposing stock status", () => {
  const products = searchProducts(mockProfile, "");
  assert.equal(products.length, 6);
  assert.deepEqual(searchProducts(mockProfile, " OTHER "), []);
  assert.deepEqual(searchProducts(mockProfile, "Zenvit Classic"), []);
  assert.equal(searchProducts(mockProfile, "zenacid")[0].available, false);
  assert.equal(searchProducts(mockProfile, " NOVA ").length, 2);
});

test("orders, detail lookups and dashboard counts stay restricted to the MR", () => {
  assert.equal(getMrOrders(mockOrders, mockProfile.id).length, 8);
  assert.equal(getMrOrder(mockOrders, mockProfile.id, "other-mr-order"), undefined);
  assert.equal(getMrOrders(mockOrders, mockProfile.id, "ZNX-CUS-1001").length, 2);
  assert.equal(getMrOrders(mockOrders, mockProfile.id, "Sri Sai", "rejected").length, 1);
  assert.deepEqual(getDashboardStatistics(mockOrders, mockProfile.id), { total: 8, awaiting_customer_approval: 2, pending_billing: 2, completed: 3 });
});

test("submission rejects ineligible customers, unavailable products and invalid carts", async () => {
  const draft = { customerId: "apollo", items: [{ productId: "zenpara", quantity: "3" }] };
  assert.equal(validateDraft(draft, mockProfile), null);
  for (const customerId of ["", "missing", "care", "city"]) {
    await assert.rejects(submitMockOrder({ ...draft, customerId }, mockProfile), /approved customer/);
  }
  assert.match(validateDraft({ ...draft, items: [] }, mockProfile), /at least one/);
  for (const quantity of ["", "0", "-1", "1.5", "10000", "Infinity", "1e2"]) {
    assert.match(validateDraft({ ...draft, items: [{ productId: "zenpara", quantity }] }, mockProfile), /whole-number/);
  }
  for (const productId of ["zenacid", "retired", "unassigned", "missing"]) {
    assert.match(validateDraft({ ...draft, items: [{ productId, quantity: "1" }] }, mockProfile), /unavailable/);
  }
  assert.match(validateDraft({ ...draft, items: [...draft.items, ...draft.items] }, mockProfile), /only once/);
});

test("demo submission snapshots customer and product data with exact monetary totals", async () => {
  const order = await submitMockOrder({ customerId: "apollo", items: [{ productId: "zenpara", quantity: "3" }, { productId: "novac", quantity: "2" }] }, mockProfile);
  assert.match(order.reference, /^ZX-DEMO-/);
  assert.equal(order.mrId, mockProfile.id);
  assert.equal(order.status, "awaiting_customer_approval");
  assert.equal(orderTotal(order), 25350);
  assert.notEqual(order.customer, mockCustomers[0]);
  assert.notEqual(order.items[0].product, mockProducts[0]);
  assert.equal(mockOrders.length, 9);
  assert.equal(order.history.length, 1);
});
