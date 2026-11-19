import { config } from "./config.js";
import { MenuItemModel } from "./models.js";

export interface CartLineInput {
  itemId: string;
  quantity: number;
  size?: string;
  addOns?: string[];
  instructions?: string;
}

export interface PricedLine {
  item: string;
  name: string;
  quantity: number;
  unitPrice: number;
  size: string;
  addOns: { name: string; price: number }[];
  instructions: string;
}

export interface PriceSummary {
  lines: PricedLine[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  tip: number;
  total: number;
}

export function calculateSummary(
  lines: PricedLine[],
  fulfillment: "pickup" | "delivery",
  tip: number,
  taxRate: number,
  deliveryFeeAmount: number
): Omit<PriceSummary, "lines"> {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const tax = roundMoney(subtotal * taxRate);
  const deliveryFee = fulfillment === "delivery" ? deliveryFeeAmount : 0;
  return { subtotal, tax, deliveryFee, tip: roundMoney(tip), total: roundMoney(subtotal + tax + deliveryFee + tip) };
}

export async function priceCart(
  input: CartLineInput[],
  fulfillment: "pickup" | "delivery",
  tip = 0
): Promise<PriceSummary> {
  if (!input.length || input.length > 30) throw Object.assign(new Error("Add between 1 and 30 items."), { status: 400 });
  if (!Number.isFinite(tip) || tip < 0 || tip > 100) throw Object.assign(new Error("Tip must be between $0 and $100."), { status: 400 });
  const ids = [...new Set(input.map((line) => line.itemId))];
  const items = await MenuItemModel.find({ _id: { $in: ids }, available: true }).lean();
  const byId = new Map(items.map((item) => [String(item._id), item]));
  const lines: PricedLine[] = input.map((line) => {
    const item = byId.get(line.itemId);
    if (!item) throw Object.assign(new Error("A selected item is unavailable."), { status: 409 });
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 25) {
      throw Object.assign(new Error("Item quantity must be between 1 and 25."), { status: 400 });
    }
    const selectedSize = line.size ? item.sizes.find((size: { name: string; price: number }) => size.name === line.size) : undefined;
    if (line.size && !selectedSize) throw Object.assign(new Error(`${item.name} does not have that size.`), { status: 400 });
    const selectedAddOns = (line.addOns ?? []).map((name: string) => {
      const addOn = item.addOns.find((option: { name: string; price: number }) => option.name === name);
      if (!addOn) throw Object.assign(new Error(`${name} is not available for ${item.name}.`), { status: 400 });
      return { name: addOn.name, price: addOn.price };
    });
    if (new Set(selectedAddOns.map((option) => option.name)).size !== selectedAddOns.length) {
      throw Object.assign(new Error("Duplicate add-ons are not allowed."), { status: 400 });
    }
    const unitPrice = (selectedSize?.price ?? item.price) + selectedAddOns.reduce((sum, option) => sum + option.price, 0);
    return {
      item: String(item._id),
      name: item.name,
      quantity: line.quantity,
      unitPrice: roundMoney(unitPrice),
      size: selectedSize?.name ?? "",
      addOns: selectedAddOns,
      instructions: line.instructions?.trim() ?? ""
    };
  });
  return { lines, ...calculateSummary(lines, fulfillment, tip, config.TAX_RATE, config.DELIVERY_FEE) };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function reserveInventory(lines: PricedLine[]): Promise<void> {
  const reserved: { id: string; quantity: number }[] = [];
  try {
    for (const line of lines) {
      const result = await MenuItemModel.updateOne(
        { _id: line.item, available: true, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity } }
      );
      if (result.modifiedCount !== 1) throw Object.assign(new Error(`${line.name} is out of stock.`), { status: 409 });
      reserved.push({ id: line.item, quantity: line.quantity });
    }
  } catch (error) {
    await Promise.all(reserved.map(({ id, quantity }) =>
      MenuItemModel.updateOne({ _id: id }, { $inc: { stock: quantity } })
    ));
    throw error;
  }
}
