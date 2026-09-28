import { settleChecksFIFO, type Check, type Invoice, type PaymentRule } from "../client/src/lib/accounting.ts";

const rule: PaymentRule = { id: "rule", name: "۶٪ ماهانه", active: true, dayBasis: 30, graceDays: 0, tiers: [{ id: "tier", maxDays: 9999, rate: 0.06, note: "" }] };
const invoice = (id: string, number: string, date: string, amount: number): Invoice => ({ id, number, type: "فروش", date, partyId: "p", paymentRuleId: "rule", items: [], allocations: [], amount, paidAmount: 0, status: "باز", note: "" });
const check = (id: string, number: string, dueDate: string, amount: number): Check => ({ id, number, partyId: "p", receivedDate: "1405/01/01", dueDate, amount, status: "نزد ما", bank: "" });
const invoices = [invoice("i1", "1", "1405/01/01", 100_000_000), invoice("i2", "2", "1405/01/02", 100_000_000)];
const checks = [check("c2", "2", "1405/02/30", 50_000_000), check("c1", "1", "1405/02/15", 80_000_000)];
const rows = settleChecksFIFO(checks, invoices, [rule]);
if (rows[0]?.checkId !== "c1" || rows[0]?.invoiceId !== "i1") throw new Error("checks were not ordered by due date");
const first = rows.find(row => row.checkId === "c1")!;
const second = rows.find(row => row.checkId === "c2" && row.invoiceId === "i1")!;
const spill = rows.find(row => row.checkId === "c2" && row.invoiceId === "i2")!;
if (Math.abs(first.principalAmount - 73_394_495.41) > 1) throw new Error(`unexpected first principal: ${first.principalAmount}`);
if (!second || Math.abs(second.amount - 29_798_165.14) > 1) throw new Error(`unexpected second allocation: ${second?.amount}`);
if (!spill || Math.abs(spill.amount - 20_201_834.86) > 1) throw new Error(`unexpected check remainder: ${spill?.amount}`);
if (rows.some(row => row.invoiceId === "i1" && row.principalAmount > 100_000_000)) throw new Error("invoice over-settled");
console.log(JSON.stringify(rows, null, 2));
