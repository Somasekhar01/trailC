import test from "node:test";
import assert from "node:assert/strict";
import { calculateSummary, roundMoney, type PricedLine } from "./orders.js";

test("roundMoney uses currency precision without binary floating-point drift", () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(4.555), 4.56);
});

test("cart summary calculates subtotal, tax, delivery, tip, and total from server-priced lines", () => {
  const lines: PricedLine[] = [
    { item: "a", name: "Latte", quantity: 2, unitPrice: 5.5, size: "Regular", addOns: [], instructions: "" },
    { item: "b", name: "Cookie", quantity: 1, unitPrice: 4, size: "", addOns: [], instructions: "" }
  ];
  assert.deepEqual(calculateSummary(lines, "delivery", 2, 0.1, 4.5), {
    subtotal: 15,
    tax: 1.5,
    deliveryFee: 4.5,
    tip: 2,
    total: 23
  });
});

test("pickup summary does not charge delivery", () => {
  const line: PricedLine = { item: "a", name: "Coffee", quantity: 1, unitPrice: 4, size: "", addOns: [], instructions: "" };
  assert.equal(calculateSummary([line], "pickup", 0, 0.1, 5).total, 4.4);
});
