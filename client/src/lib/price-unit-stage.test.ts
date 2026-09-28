import { describe, expect, it } from "vitest";
import {
  exportPayload,
  importPayload,
  inventoryLedgerDiscrepancies,
  normalizeState,
  rebuildInventoryProjection,
} from "./accounting";
import { priceUnitFixture } from "./fixtures/price-unit.fixture";

describe("price and unit stage fixture integration", () => {
  it("normalizes the fixture with expected operational rows", () => {
    const state = normalizeState(priceUnitFixture);
    expect(state.products).toHaveLength(3);
    expect(state.invoices).toHaveLength(2);
    expect(state.invoices.reduce((sum, invoice) => sum + invoice.items.length, 0)).toBe(2);
    expect(state.priceHistory).toHaveLength(2);
    expect(state.checks).toHaveLength(1);
    expect(state.productionFormulas).toHaveLength(1);
  });

  it("round-trips the price basis and unit snapshots through backup", () => {
    const state = normalizeState(priceUnitFixture);
    const restored = importPayload(exportPayload(state));
    const row = restored.invoices.find(invoice => invoice.id === "fixture-invoice-sale")?.items[0];
    expect(row).toMatchObject({
      baseUnit: "عدد",
      priceBasis: "baseUnit",
      conversionRate: 36,
      quantityBase: 360,
      total: 108000000,
    });
    expect(restored.priceHistory.find(item => item.id === "fixture-price-carton")).toMatchObject({
      baseUnit: "عدد",
      priceBasis: "baseUnit",
      price: 300000,
    });
  });

  it("keeps fixture stock equal to its opening-ledger projection", () => {
    const state = normalizeState(priceUnitFixture);
    const projected = rebuildInventoryProjection(state);
    expect(inventoryLedgerDiscrepancies(state)).toEqual([]);
    expect(projected.products.map(product => [product.id, product.stock])).toEqual(
      state.products.map(product => [product.id, product.stock])
    );
  });
});
