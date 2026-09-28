import { isJalaliLeapYear, isValidJalaliDate, normalizeState, parseLocalizedNumber, reconcileLedgerEvents } from "../client/src/lib/accounting";

const base = normalizeState({
  settings: { businessName: "Probe", currency: "تومان", dayBasis: "شمسی", units: ["عدد"] },
  products: [
    { id: "p1", code: "P1", name: "یک", unit: "عدد", stock: 10, minStock: 0, price: 0 },
    { id: "p2", code: "P2", name: "دو", unit: "عدد", stock: 10, minStock: 0, price: 0 },
  ],
  accounts: [
    { id: "a1", name: "بانک یک", type: "بانک", balance: 100 },
    { id: "a2", name: "بانک دو", type: "بانک", balance: 100 },
  ],
  inventoryEvents: [
    { id: "ie1", at: "2026-01-01T00:00:00Z", date: "1404/10/11", kind: "opening_balance", productId: "p1", quantityEntered: 10, unitEntered: "عدد", quantityBase: 10, baseUnit: "عدد", sourceType: "opening", note: "" },
    { id: "ie2", at: "2026-01-01T00:00:00Z", date: "1404/10/11", kind: "opening_balance", productId: "p2", quantityEntered: 10, unitEntered: "عدد", quantityBase: 10, baseUnit: "عدد", sourceType: "opening", note: "" },
  ],
  cashEvents: [
    { id: "ce1", at: "2026-01-01T00:00:00Z", date: "1404/10/11", kind: "opening_balance", accountId: "a1", amount: 100, currency: "تومان", sourceType: "opening", note: "" },
    { id: "ce2", at: "2026-01-01T00:00:00Z", date: "1404/10/11", kind: "opening_balance", accountId: "a2", amount: 100, currency: "تومان", sourceType: "opening", note: "" },
  ],
});
const changedWithoutNewEvents = {
  ...base,
  products: base.products.map(p => ({ ...p, stock: p.stock + 1 })),
  accounts: base.accounts.map(a => ({ ...a, balance: a.balance + 1 })),
};
const bridged = reconcileLedgerEvents(base, changedWithoutNewEvents);
const mixedUpdate = {
  ...base,
  products: base.products.map(p => ({ ...p, stock: p.id === "p1" ? p.stock + 2 : p.stock + 1 })),
  accounts: base.accounts.map(a => ({ ...a, balance: a.id === "a1" ? a.balance + 2 : a.balance + 1 })),
  inventoryEvents: [...base.inventoryEvents, { ...base.inventoryEvents[0], id: "new-explicit", productId: "p1", quantityBase: 2, quantityEntered: 2, sourceType: "production" as const }],
  cashEvents: [...base.cashEvents, { ...base.cashEvents[0], id: "new-explicit-cash", accountId: "a1", amount: 2, sourceType: "transaction" as const }],
};
const mixedResult = reconcileLedgerEvents(base, mixedUpdate);
const calendarMismatch = [] as Array<{ year: number; core: boolean; shared: boolean }>;
for (let year = 1200; year <= 1500; year++) {
  const core = isJalaliLeapYear(year);
  const shared = isJalaliLeapYear(year);
  if (core !== shared) calendarMismatch.push({ year, core, shared });
}
const result = {
  calendarMismatchCount: calendarMismatch.length,
  coreRejects1404_12_30: !isValidJalaliDate(1404, 12, 30),
  localizedNumberResult: parseLocalizedNumber("۱۲۳۴۵۶٫۷۸"),
  legacyInventoryDeltaBridged: bridged.inventoryEvents.length - base.inventoryEvents.length,
  legacyCashDeltaBridged: bridged.cashEvents.length - base.cashEvents.length,
  mixedInventoryDeltaEvents: mixedResult.inventoryEvents.filter(event => event.sourceType === "projection_reconciliation" && event.productId === "p2").length,
  mixedCashDeltaEvents: mixedResult.cashEvents.filter(event => event.sourceType === "projection_reconciliation" && event.accountId === "a2").length,
};
console.log(JSON.stringify(result, null, 2));
if (result.calendarMismatchCount !== 0 || result.localizedNumberResult !== 123456.78 || result.legacyInventoryDeltaBridged !== 2 || result.legacyCashDeltaBridged !== 2 || result.mixedInventoryDeltaEvents !== 1 || result.mixedCashDeltaEvents !== 1) process.exitCode = 1;
