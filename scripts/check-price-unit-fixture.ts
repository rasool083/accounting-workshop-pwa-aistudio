import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeState } from "../client/src/lib/accounting";
import { priceUnitFixture } from "../client/src/lib/fixtures/price-unit.fixture";

const state = normalizeState(priceUnitFixture);
const canonical = JSON.stringify(state, Object.keys(state).sort());
const checksum = createHash("sha256").update(canonical).digest("hex");
const output = {
  fixture: "price-unit-fixture",
  schemaVersion: state.schemaVersion,
  checksum,
  counts: {
    products: state.products.length,
    invoices: state.invoices.length,
    invoiceItems: state.invoices.reduce((sum, invoice) => sum + invoice.items.length, 0),
    priceHistory: state.priceHistory.length,
    payments: state.purchasePayments.length,
    checks: state.checks.length,
    transactions: state.transactions.length,
    productionFormulas: state.productionFormulas.length,
  },
};
const outputPath = resolve(process.cwd(), "docs/PRICE-UNIT-FIXTURE-CHECKSUM.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
