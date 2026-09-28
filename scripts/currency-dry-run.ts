import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  exportPayload,
  importPayload,
  normalizeState,
  type AppState,
} from "../client/src/lib/accounting";
import { checksumJson } from "../client/src/lib/backup";
import { priceUnitFixture } from "../client/src/lib/fixtures/price-unit.fixture";

const MONEY_KEYS = new Set([
  "amount",
  "unitPrice",
  "total",
  "price",
  "feeAmount",
  "fixedAmount",
  "minAmount",
  "maxAmount",
  "balance",
  "paidAmount",
  "discountAmount",
  "profit",
  "principalAmount",
  "effectiveProfit",
  "apparentProfit",
]);

function collectMoney(value: unknown, path = "", result: Record<string, number> = {}) {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectMoney(item, `${path}[${index}]`, result));
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (MONEY_KEYS.has(key) && typeof child === "number" && Number.isFinite(child)) {
      result[childPath] = child;
    } else if (child && typeof child === "object") {
      collectMoney(child, childPath, result);
    }
  }
  return result;
}

function sum(values: Record<string, number>) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function countRecords(state: AppState) {
  return {
    products: state.products.length,
    invoices: state.invoices.length,
    invoiceItems: state.invoices.reduce((total, invoice) => total + invoice.items.length, 0),
    priceHistory: state.priceHistory.length,
    transactions: state.transactions.length,
    checks: state.checks.length,
    accounts: state.accounts.length,
    purchasePayments: state.purchasePayments.length,
    issuedChecks: state.issuedChecks.length,
    cashEvents: state.cashEvents.length,
    inventoryEvents: state.inventoryEvents.length,
    payrollRecords: state.payrollRecords.length,
  };
}

const source = normalizeState(priceUnitFixture);
const backupText = exportPayload(source);
const restored = importPayload(backupText);
const sourceMoney = collectMoney(source);
const restoredMoney = collectMoney(restored);
const sourceKeys = Object.keys(sourceMoney).sort();
const restoredKeys = Object.keys(restoredMoney).sort();
const report = {
  mode: "diagnostic-dry-run-no-value-conversion",
  defaultCurrency: source.settings.currencyCode,
  defaultCurrencyLabel: source.settings.currency,
  hypotheticalConversion: "IRT values unchanged; IRR↔IRT conversion not applied",
  before: {
    checksum: checksumJson(source),
    backupChecksum: checksumJson(JSON.parse(backupText)),
    recordCounts: countRecords(source),
    monetaryFieldCount: sourceKeys.length,
    monetaryTotal: sum(sourceMoney),
  },
  after: {
    checksum: checksumJson(restored),
    recordCounts: countRecords(restored),
    monetaryFieldCount: restoredKeys.length,
    monetaryTotal: sum(restoredMoney),
  },
  invariants: {
    sameMonetaryPaths: JSON.stringify(sourceKeys) === JSON.stringify(restoredKeys),
    sameMonetaryValues: JSON.stringify(sourceMoney) === JSON.stringify(restoredMoney),
    sameRecordCounts: JSON.stringify(countRecords(source)) === JSON.stringify(countRecords(restored)),
    noValueConversion: true,
  },
};

const outputPath = resolve(process.cwd(), "docs/CURRENCY-DRY-RUN-1405-07-03.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
