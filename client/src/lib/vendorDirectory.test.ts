import { describe, expect, it } from "vitest";
import { exportVendorDirectory, getMaterialStats, importVendorDirectory, materialNames } from "./vendorDirectory";

describe("vendor directory analytics", () => {
  const state = {
    version: 1 as const,
    vendors: [
      { id: "v1", name: "تولیدکننده الف", kind: "تولیدکننده" as const, contactName: "", phone: "", email: "", location: "", website: "", suppliedMaterials: ["پتاسیم اگزالات"], notes: "", active: true, createdAt: "", updatedAt: "" },
      { id: "v2", name: "بازرگانی ب", kind: "بازرگانی" as const, contactName: "", phone: "", email: "", location: "", website: "", suppliedMaterials: ["پتاسیم اگزالات", "رزین"], notes: "", active: true, createdAt: "", updatedAt: "" },
    ],
    quotes: [
      { id: "q1", vendorId: "v1", materialName: "پتاسیم اگزالات", quoteDate: "1405/06/01", price: 120000, currency: "تومان", unit: "کیلوگرم", packageDescription: "", minimumOrder: "", validUntil: "", status: "معتبر" as const, source: "", notes: "", createdAt: "1" },
      { id: "q2", vendorId: "v2", materialName: "پتاسیم اگزالات", quoteDate: "1405/06/05", price: 100000, currency: "تومان", unit: "کیلوگرم", packageDescription: "", minimumOrder: "", validUntil: "", status: "معتبر" as const, source: "", notes: "", createdAt: "2" },
      { id: "q3", vendorId: "v2", materialName: "رزین", quoteDate: "1405/06/05", price: 80000, currency: "تومان", unit: "کیلوگرم", packageDescription: "", minimumOrder: "", validUntil: "", status: "بررسی نشده" as const, source: "", notes: "", createdAt: "3" },
    ],
  };

  it("collects unique material names and compares supplier prices", () => {
    expect(materialNames(state)).toEqual(["پتاسیم اگزالات", "رزین"]);
    expect(getMaterialStats(state, "پتاسیم اگزالات")[0]).toEqual(expect.objectContaining({ vendorCount: 2, quoteCount: 2, lowestPrice: 100000, averagePrice: 110000, lowestVendorId: "v2" }));
  });

  it("reports the latest price movement for a material", () => {
    const changed = { ...state, quotes: [...state.quotes, { ...state.quotes[1], id: "q4", quoteDate: "1405/06/10", price: 110000 }] };
    expect(getMaterialStats(changed, "پتاسیم اگزالات")[0].changePercent).toBe(10);
  });

  it("does not average quotes with a different unit and round-trips its own backup", () => {
    const mixed = { ...state, quotes: [...state.quotes, { ...state.quotes[1], id: "q4", quoteDate: "1405/06/10", unit: "گرم", price: 150 }] };
    const stat = getMaterialStats(mixed, "پتاسیم اگزالات")[0];
    expect(stat.quoteCount).toBe(3);
    expect(stat.comparableQuoteCount).toBe(1);
    expect(stat.comparisonUnit).toBe("گرم");
    expect(importVendorDirectory(exportVendorDirectory(state))).toEqual(state);
  });

  it("rejects an accounting backup as a vendor backup", () => {
    expect(() => importVendorDirectory('{"format":"accounting-backup-v5"}')).toThrow();
  });
});
