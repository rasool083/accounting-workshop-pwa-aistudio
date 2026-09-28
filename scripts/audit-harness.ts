import * as accounting from "../client/src/lib/accounting";
import {
  calculateBankTransferFee,
  calculateInvoiceAmount,
  calculateLateProfit,
  exportPayload,
  importPayload,
  jalaliDateKey,
  jalaliDayDifference,
  jalaliMonthDayBasis,
} from "../client/src/lib/accounting";
import {
  exportVendorDirectory,
  getMaterialStats,
  importVendorDirectory,
  materialNames,
} from "../client/src/lib/vendorDirectory";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

let cases = 0;
for (let i = 0; i < 100; i++) {
  const month = (i % 12) + 1;
  const day = (i % (month <= 6 ? 31 : month === 12 ? 29 : 30)) + 1;
  const date = `1405/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
  assert(jalaliDateKey(date) === date, `date normalization failed: ${date}`);
  assert(jalaliDayDifference(date, date) === 0, `same-day difference failed: ${date}`);
  assert(jalaliMonthDayBasis(date) >= 29, `month basis failed: ${date}`);
  cases += 3;
}
for (let i = 0; i < 100; i++) {
  const amount = i * 123456.7;
  const fixed = i % 17;
  const percent = i % 11;
  const rule = { id: `r${i}`, name: "synthetic", active: true, percent, fixedAmount: fixed, minAmount: i % 3, maxAmount: i % 2 ? undefined : amount + fixed };
  const result = calculateBankTransferFee([rule], undefined, amount);
  assert(result.fee >= 0 && result.fee <= (rule.maxAmount ?? Infinity), `fee bounds failed: ${i}`);
  const subtotal = i * 98765.4;
  const discount = i % 2 ? subtotal / 2 : subtotal * 2;
  const total = calculateInvoiceAmount(subtotal, discount);
  assert(total >= 0 && total <= subtotal, `invoice total bounds failed: ${i}`);
  cases += 2;
}
for (let i = 0; i < 100; i++) {
  const amount = 100000 + i * 1000;
  const check = { id: `c${i}`, number: `C${i}`, amount, status: "نزد ما", dueDate: `1405/07/${String((i % 29) + 1).padStart(2, "0")}`, receivedDate: "1405/06/01" } as any;
  const rule = { dayBasis: 30, graceDays: i % 5, tiers: [{ maxDays: 9999, rate: (i % 7) / 100 }] } as any;
  const result = calculateLateProfit(check, rule, "1405/06/01", amount, i % 2 ? 30 : "شمسی");
  assert(result.profit >= 0 && result.settled >= result.base, `late profit monotonicity failed: ${i}`);
  cases++;
}
const state = accounting.seedState;
const accountingRoundTrip = importPayload(exportPayload(state));
assert(accountingRoundTrip.invoices.length === state.invoices.length, "accounting backup invoice count changed");
assert(accountingRoundTrip.products.length === state.products.length, "accounting backup product count changed");
cases += 2;
const vendor = { version: 1 as const, vendors: [], quotes: [] };
for (let i = 0; i < 20; i++) {
  vendor.vendors.push({ id: `v${i}`, name: `فروشنده ${i}`, kind: i % 2 ? "بازرگانی" : "تولیدکننده", contactName: "", phone: "", email: "", location: "", website: "", suppliedMaterials: [`ماده ${i % 5}`], notes: "", active: true, createdAt: String(i), updatedAt: String(i) } as any);
  vendor.quotes.push({ id: `q${i}`, vendorId: `v${i}`, materialName: `ماده ${i % 5}`, quoteDate: `1405/06/${String((i % 20) + 1).padStart(2, "0")}`, price: 1000 + i * 10, currency: "تومان", unit: "کیلوگرم", packageDescription: "", minimumOrder: "", validUntil: "", status: "معتبر", source: "synthetic", notes: "", createdAt: String(i) } as any);
}
const vendorRoundTrip = importVendorDirectory(exportVendorDirectory(vendor));
assert(vendorRoundTrip.vendors.length === 20 && vendorRoundTrip.quotes.length === 20, "vendor backup count changed");
assert(materialNames(vendor).length === 5, "material deduplication failed");
assert(getMaterialStats(vendor, "ماده 1")[0].quoteCount === 4, "vendor stats count failed");
cases += 4;
console.log(JSON.stringify({ passedCases: cases, status: "passed", areas: ["Jalali dates", "bank fees", "invoice discounts", "late profit", "accounting backup", "vendor analytics"] }, null, 2));
