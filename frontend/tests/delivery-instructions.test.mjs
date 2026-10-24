import assert from "node:assert/strict";
import test from "node:test";
import { mockProfile } from "../lib/mr/mock-data.ts";
import { submitMockOrder, validateDraft } from "../lib/mr/mock-service.ts";

const draft = () => ({ customerId: "apollo", items: [{ productId: "zenpara", quantity: "1" }] });

test("delivery instructions remain optional for existing order drafts", async () => {
  const order = await submitMockOrder(draft(), mockProfile);
  assert.equal(order.deliveryInstructions, undefined);
});

test("instructions preserve whitespace, line breaks, Unicode and literal markup per order", async () => {
  const deliveryInstructions = "  Call first\nSide entrance — ಕನ್ನಡ <script>alert(1)</script>  ";
  const first = await submitMockOrder({ ...draft(), deliveryInstructions }, mockProfile);
  const second = await submitMockOrder(draft(), mockProfile);
  assert.equal(first.deliveryInstructions, deliveryInstructions);
  assert.notEqual(first.id, second.id);
  assert.equal(second.deliveryInstructions, undefined);
});

test("instruction length and type are validated without making instructions required", async () => {
  assert.equal(validateDraft({ ...draft(), deliveryInstructions: "a".repeat(2000) }, mockProfile), null);
  assert.equal(validateDraft({ ...draft(), deliveryInstructions: "" }, mockProfile), null);
  await assert.rejects(submitMockOrder({ ...draft(), deliveryInstructions: "a".repeat(2001) }, mockProfile), /2,000/);
  assert.match(validateDraft({ ...draft(), deliveryInstructions: 42 }, mockProfile), /2,000/);
});
