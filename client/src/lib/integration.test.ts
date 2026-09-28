import { describe, expect, it } from "vitest";
import {
  executeProduction,
  loadState,
  rebuildCheckAllocations,
  type Check,
  type Invoice,
  type ProductionFormula,
} from "./accounting";
import { exportUnifiedPayload, importUnifiedPayload } from "./backup";
import type { VendorDirectoryState } from "./vendorDirectory";

describe("operational workshop integration fixture", () => {
  it("keeps production, sale settlement, and unified restore consistent", () => {
    const raw = {
      id: "fixture-raw",
      code: "RAW-F",
      name: "ماده اولیه آزمایشی",
      unit: "گرم",
      unit2: "گرم",
      conversionRate: 1,
      stock: 1000,
      minStock: 0,
      price: 2,
      category: "مواد اولیه" as const,
    };
    const output = {
      id: "fixture-output",
      code: "OUT-F",
      name: "محصول آزمایشی",
      unit: "عدد",
      unit2: "کارتن",
      conversionRate: 36,
      stock: 0,
      minStock: 0,
      price: 1500,
      category: "محصول تولیدی" as const,
    };
    const formula: ProductionFormula = {
      id: "fixture-formula",
      name: "فرمول محصول آزمایشی",
      formulaType: "قطعه",
      outputProductId: output.id,
      outputName: output.name,
      outputQuantity: 1,
      outputUnit: "عدد",
      materials: [{ id: "fixture-material", productId: raw.id, quantity: 100, unit: "گرم" }],
      costs: [],
      note: "fixture غیرحساس برای آزمون یکپارچه",
    };
    const base = loadState();
    const state = {
      ...base,
      people: [
        { id: "fixture-customer", code: "C-F", name: "مشتری آزمون", type: "مشتری" as const, roles: ["مشتری" as const], phone: "", balance: 0 },
      ],
      products: [raw, output],
      productionFormulas: [formula],
      invoices: [],
      checks: [],
    };

    const produced = executeProduction(state, formula.id, 10, "عدد", "1405/07/01").state;
    expect(produced.products.find(item => item.id === raw.id)?.stock).toBe(0);
    expect(produced.products.find(item => item.id === output.id)?.stock).toBe(10);
    expect(produced.productionRecords).toHaveLength(1);
    expect(produced.inventoryEvents.some(event => event.kind === "production_output")).toBe(true);

    const invoice: Invoice = {
      id: "fixture-invoice",
      number: "F-1001",
      type: "فروش",
      date: "1405/07/01",
      partyId: "fixture-customer",
      paymentRuleId: "cash-default",
      items: [{ id: "fixture-item", productId: output.id, description: output.name, quantity: 1, unit: "عدد", unitPrice: 1500, total: 1500, quantityBase: 1, conversionRate: 1 }],
      allocations: [],
      amount: 1500,
      paidAmount: 0,
      status: "باز",
      note: "fixture",
    };
    const check: Check = {
      id: "fixture-check",
      number: "CHK-F",
      partyId: "fixture-customer",
      receivedDate: "1405/07/01",
      dueDate: "1405/07/15",
      amount: 1500,
      status: "نزد ما",
      bank: "بانک آزمون",
    };
    const settled = rebuildCheckAllocations({
      ...produced,
      invoices: [invoice],
      checks: [check],
    });
    expect(settled.invoices[0].status).toBe("تسویه شده");
    expect(settled.invoices[0].paidAmount).toBeGreaterThanOrEqual(1500);
    expect(settled.checks[0].status).toBe("نزد ما");

    const vendors: VendorDirectoryState = { version: 1, vendors: [], quotes: [] };
    const restored = importUnifiedPayload(exportUnifiedPayload(settled, vendors));
    expect(restored.unified).toBe(true);
    expect(restored.accounting.invoices[0].status).toBe("تسویه شده");
    expect(restored.accounting.productionRecords).toHaveLength(1);
    expect(restored.accounting.products.find(item => item.id === output.id)?.stock).toBe(10);
    expect(restored.accounting.settings.security).toBeUndefined();
  });
});
