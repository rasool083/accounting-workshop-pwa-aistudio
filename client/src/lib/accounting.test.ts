import { describe, expect, it } from "vitest";
import {
  getSettlementBalances,
  adjustInventoryBalance,
  executeProduction,
  refreshProductionRecordPrice,
  normalizeState,
  reconcileLedgerEvents,
  inventoryLedgerDiscrepancies,
  cashLedgerDiscrepancies,
  rebuildCashProjection,
  rebuildInventoryProjection,
  isJalaliLeapYear,
  isValidJalaliDate,
  jalaliDayDifference,
  jalaliMonthDayBasis,
  quantityInBase,
  rebuildCheckAllocations,
  rebuildPurchasePayables,
  settlePurchasePayablesFIFO,
  removeProductionRun,
  settleChecksFIFO,
  refreshIssuedCheckStatuses,
  releasePurchasePayment,
  settleIssuedCheck,
  appendPurchasePaymentCashEvents,
  unitConversionToBase,
  releasePurchasePaymentsForInvoice,
  purchasePaymentIdsExclusiveToInvoice,
  cashAccountReconciliation,
  calculateInvoiceAmount,
  calculateLateProfit,
  calculateEffectiveProfitForAllocation,
  auditDataIntegrity,
  calculateBankTransferFee,
  parseLocalizedNumber,
  jalaliWeekday,
  calculateBaseUnitLine,
} from "./accounting";
import { priceUnitFixture } from "./fixtures/price-unit.fixture";

describe("bank fee rules", () => {
  it("calculates fixed plus percentage and applies bounds", () => {
    const rules = [{ id: "r", name: "بانکی", active: true, percent: 0.05, fixedAmount: 500, minAmount: 5000, maxAmount: 20000 }];
    expect(calculateBankTransferFee(rules, "bank", 1_000_000).fee).toBe(5000);
    expect(calculateBankTransferFee(rules, "bank", 50_000_000).fee).toBe(20000);
  });

  it("prefers a matching account rule over a general rule", () => {
    const rules = [
      { id: "general", name: "عمومی", active: true, percent: 0, fixedAmount: 1000 },
      { id: "bank", name: "بانک خاص", accountId: "bank", active: true, percent: 0, fixedAmount: 3000 },
    ];
    expect(calculateBankTransferFee(rules, "bank", 100_000).fee).toBe(3000);
  });
});

describe("invoice totals", () => {
  it("allows a full discount without rejecting the invoice", () => {
    expect(calculateInvoiceAmount(100_000, 100_000)).toBe(0);
    expect(calculateInvoiceAmount(100_000, 120_000)).toBe(0);
  });

  it("does not allow a negative discount to increase the invoice", () => {
    expect(calculateInvoiceAmount(100_000, -10_000)).toBe(100_000);
  });
});

describe("unit conversion", () => {
  const massProduct = {
    id: "p",
    code: "P",
    name: "ماده",
    unit: "کیلوگرم",
    unit2: "گرم",
    conversionRate: 1000,
    stock: 0,
    minStock: 0,
    price: 100,
  };

  it("converts grams to kilograms", () => {
    expect(unitConversionToBase(massProduct, "گرم")).toBeCloseTo(0.001);
    expect(quantityInBase(massProduct, 360, "گرم")).toBeCloseTo(0.36);
  });

  it("uses the configured ratio for a carton", () => {
    const product = {
      ...massProduct,
      unit: "عدد",
      unit2: "کارتن",
      conversionRate: 36,
    };
    expect(quantityInBase(product, 10, "کارتن")).toBe(360);
  });
});

describe("effective profit at collection", () => {
  it("uses the actual collection date and current production cost", () => {
    const state = normalizeState({
      products: [{ id: "product-a", code: "A", name: "کالای A", unit: "عدد", stock: 0, minStock: 0, price: 300000 }],
      productionRecords: [{
        id: "batch-current", formulaId: "formula-a", outputProductId: "product-a",
        outputProductName: "کالای A", date: "1405/03/01", outputQuantity: 1,
        materialCost: 180000, overheadCost: 0, totalCost: 180000, unitCost: 180000,
        note: "",
      }],
    });
    const invoice = {
      id: "invoice-a", number: "A-1", type: "فروش" as const, date: "1405/01/01",
      items: [{ id: "item-a", productId: "product-a", description: "کالای A", quantity: 1,
        unit: "عدد", unitPrice: 300000, total: 300000, quantityBase: 1,
        unitCostAtSale: 160000 }],
      allocations: [], amount: 300000, paidAmount: 300000, status: "تسویه شده" as const, note: "",
    };
    const check = {
      id: "check-a", number: "A-CHECK", partyId: "customer", receivedDate: "1405/01/01",
      dueDate: "1405/03/01", collectedDate: "1405/03/05", amount: 336000,
      status: "وصول شده" as const, bank: "بانک",
    };
    const result = calculateEffectiveProfitForAllocation(
      state,
      invoice,
      { amount: 336000, principalAmount: 300000 },
      check
    )!;
    expect(result.collectionDate).toBe("1405/03/05");
    expect(result.apparentCost).toBe(160000);
    expect(result.currentCost).toBe(180000);
    expect(result.apparentProfit).toBe(176000);
    expect(result.effectiveProfit).toBe(156000);
    expect(result.apparentRate).toBeCloseTo(1.1);
    expect(result.effectiveRate).toBeCloseTo(156000 / 180000);
  });
});

describe("FIFO settlement balances", () => {
  it("shows the staged invoice and check balances from the two-check example", () => {
    const invoice = {
      id: "invoice-1",
      number: "1",
      type: "فروش" as const,
      date: "1405/01/04",
      partyId: "party-1",
      paymentRuleId: "rule-1",
      items: [],
      allocations: [],
      amount: 100_000_000,
      paidAmount: 0,
      status: "باز" as const,
      note: "",
    };
    const checks = [
      {
        id: "check-1",
        number: "1",
        partyId: "party-1",
        receivedDate: "1405/01/04",
        dueDate: "1405/02/18",
        amount: 80_000_000,
        status: "نزد ما" as const,
        bank: "",
      },
      {
        id: "check-2",
        number: "2",
        partyId: "party-1",
        receivedDate: "1405/01/04",
        dueDate: "1405/03/02",
        amount: 50_000_000,
        status: "نزد ما" as const,
        bank: "",
      },
    ];
    const rule = {
      id: "rule-1",
      name: "شش درصد بعد از یک ماه",
      active: true,
      dayBasis: 30,
      graceDays: 0,
      tiers: [{ id: "tier-1", maxDays: 9999, rate: 0.06, note: "" }],
    };
    const settlements = settleChecksFIFO(checks, [invoice], [rule], 30);
    const balances = getSettlementBalances(settlements, checks, [invoice]);
    const first = balances.get("check-1:invoice-1")!;
    const second = balances.get("check-2:invoice-1")!;

    expect(first.remainingCheck).toBeCloseTo(0, 2);
    expect(first.remainingInvoice).toBeCloseTo(26_605_504.59, 2);
    expect(second.remainingCheck).toBeCloseTo(20_201_834.86, 2);
    expect(second.remainingInvoice).toBeCloseTo(0, 2);
  });

  it("does not stop on floating-point residue after fully settling invoice 1010", () => {
    const partyId = "person-z006";
    const invoice1010 = {
      id: "invoice-1010",
      number: "1010",
      type: "فروش" as const,
      date: "1405/06/07",
      partyId,
      paymentRuleId: "rule-z006",
      items: [],
      allocations: [],
      amount: 162_000_000,
      paidAmount: 0,
      status: "باز" as const,
      note: "",
    };
    const invoice1011 = {
      ...invoice1010,
      id: "invoice-1011",
      number: "1011",
      amount: 201_600_000,
      date: "1405/06/07",
    };
    const check = {
      id: "check-z006",
      number: "Z006",
      partyId,
      receivedDate: "1405/06/26",
      dueDate: "1405/08/30",
      amount: 350_000_000,
      status: "نزد ما" as const,
      bank: "حساب بانکی",
    };
    const rule = {
      id: "rule-z006",
      name: "St1",
      active: true,
      dayBasis: 30,
      graceDays: 0,
      tiers: [
        { id: "no-profit", maxDays: 30, rate: 0, note: "" },
        { id: "six-percent", maxDays: 365, rate: 0.06, note: "" },
      ],
    };

    const settlements = settleChecksFIFO(
      [check],
      [invoice1010, invoice1011],
      [rule],
      30
    );
    const first = settlements.find(item => item.invoiceId === invoice1010.id)!;
    const second = settlements.find(item => item.invoiceId === invoice1011.id);

    expect(first.principalAmount).toBe(invoice1010.amount);
    expect(second).toBeDefined();
    expect(second?.amount).toBeGreaterThan(0);

    const rebuilt = rebuildCheckAllocations({
      invoices: [invoice1010, invoice1011],
      checks: [check],
      paymentRules: [rule],
      settings: { dayBasis: 30 },
    } as any);
    expect(rebuilt.invoices.find(item => item.id === invoice1010.id)?.status).toBe(
      "تسویه شده"
    );
    expect(rebuilt.invoices.find(item => item.id === invoice1011.id)?.status).toBe(
      "تسویه جزئی"
    );
  });

  it("does not allocate a customer check after it is spent", () => {
    const invoice = {
      id: "purchase-check-invoice", number: "P-1", type: "فروش" as const,
      date: "1405/01/01", partyId: "customer", items: [], allocations: [],
      amount: 1000, paidAmount: 0, status: "باز" as const, note: "",
    };
    const spentCheck = {
      id: "spent-customer-check", number: "C-1", partyId: "customer",
      receivedDate: "1405/01/01", dueDate: "1405/02/01", amount: 1000,
      status: "خرج شده" as const, bank: "", returnPartyId: "supplier",
    };
    expect(settleChecksFIFO([spentCheck], [invoice])).toEqual([]);
  });

  it("keeps a returned check allocation until the check is voided or replaced", () => {
    const invoice = {
      id: "returned-invoice", number: "R-1", type: "فروش" as const,
      date: "1405/01/01", partyId: "returned-party", items: [], allocations: [],
      amount: 1000, paidAmount: 0, status: "باز" as const, note: "",
    };
    const returnedCheck = {
      id: "returned-check", number: "R-C1", partyId: "returned-party",
      receivedDate: "1405/01/01", dueDate: "1405/02/01", amount: 1000,
      status: "برگشتی" as const, bank: "",
    };
    const rebuilt = rebuildCheckAllocations({
      invoices: [invoice], checks: [returnedCheck], paymentRules: [], settings: { dayBasis: 30 },
    } as any);
    expect(rebuilt.invoices[0].status).toBe("تسویه شده");
    expect(rebuilt.invoices[0].allocations[0].checkId).toBe(returnedCheck.id);
    expect(settleChecksFIFO([{ ...returnedCheck, status: "باطل" as const }], [invoice])).toEqual([]);
  });

  it("calculates late profit tier days from invoice date to check due date", () => {
    const check = {
      id: "overdue-check",
      number: "O-1",
      receivedDate: "1405/01/01",
      dueDate: "1405/02/01",
      amount: 1000,
      status: "نزد ما" as const,
      bank: "",
    };
    // From 1405/01/01 to 1405/02/01 is 31 days (Farvardin has 31 days)
    expect(calculateLateProfit(check, undefined, "1405/01/01").days).toBe(31);
  });

  it("allocates a targeted check specifically to the requested invoice, and subsequent checks settle older invoices", () => {
    const partyId = "customer-target";
    const invoiceOld = {
      id: "inv-old",
      number: "101",
      type: "فروش" as const,
      date: "1405/01/10",
      partyId,
      items: [],
      allocations: [],
      amount: 100_000,
      paidAmount: 0,
      status: "باز" as const,
      note: "",
    };
    const invoiceNew = {
      id: "inv-new",
      number: "102",
      type: "فروش" as const,
      date: "1405/02/10",
      partyId,
      items: [],
      allocations: [],
      amount: 50_000,
      paidAmount: 0,
      status: "باز" as const,
      note: "",
    };
    // Check A is targeted specifically to invoiceNew per customer request
    const checkA = {
      id: "chk-targeted",
      number: "A-01",
      partyId,
      targetInvoiceId: "inv-new",
      receivedDate: "1405/02/10",
      dueDate: "1405/02/20",
      amount: 50_000,
      status: "نزد ما" as const,
      bank: "",
    };
    // Check B is a general check with later due date
    const checkB = {
      id: "chk-general",
      number: "B-02",
      partyId,
      receivedDate: "1405/02/10",
      dueDate: "1405/03/20",
      amount: 100_000,
      status: "نزد ما" as const,
      bank: "",
    };
    const settlements = settleChecksFIFO([checkA, checkB], [invoiceOld, invoiceNew]);
    // Check A settled invoiceNew first
    const allocNew = settlements.find(s => s.checkId === checkA.id);
    expect(allocNew?.invoiceId).toBe("inv-new");
    expect(allocNew?.principalAmount).toBe(50_000);

    // Check B then settled the older invoiceOld
    const allocOld = settlements.find(s => s.checkId === checkB.id);
    expect(allocOld?.invoiceId).toBe("inv-old");
    expect(allocOld?.principalAmount).toBe(100_000);
  });

  it("allocates supplier payments across the oldest purchase invoices", () => {
    const invoices = [
      { id: "buy-1", number: "B1", type: "خرید" as const, date: "1405/01/01", partyId: "supplier", items: [], allocations: [], amount: 100, paidAmount: 0, status: "باز" as const, note: "" },
      { id: "buy-2", number: "B2", type: "خرید" as const, date: "1405/01/02", partyId: "supplier", items: [], allocations: [], amount: 80, paidAmount: 0, status: "باز" as const, note: "" },
    ];
    const payments = [{ id: "payment-1", supplierId: "supplier", amount: 130, date: "1405/01/03", method: "چک مشتری" as const, customerCheckId: "customer-check", note: "" }];
    expect(settlePurchasePayablesFIFO(invoices, payments).map(item => item.amount)).toEqual([100, 30]);
    const rebuilt = rebuildPurchasePayables(normalizeState({ invoices, purchasePayments: payments }));
    expect(rebuilt.invoices.find(item => item.id === "buy-1")?.status).toBe("تسویه شده");
    expect(rebuilt.invoices.find(item => item.id === "buy-2")?.status).toBe("تسویه جزئی");
    expect(rebuilt.invoices.find(item => item.id === "buy-2")?.paidAmount).toBe(30);
  });

  it("marks a partner-issued check due on its Jalali due date", () => {
    const state = normalizeState({
      issuedChecks: [
        {
          id: "issued-1", number: "S1", issuerPartyId: "partner", dateIssued: "1405/01/01",
          dueDate: "1405/02/01", amount: 500, status: "صادر شده", purpose: "خرید", note: "",
        },
      ],
    });
    expect(refreshIssuedCheckStatuses(state, "1405/01/31").issuedChecks[0].status).toBe("صادر شده");
    const due = refreshIssuedCheckStatuses(state, "1405/02/01");
    expect(due.issuedChecks[0].status).toBe("سررسید شده");
    expect(due.partnerObligationEvents).toHaveLength(1);
    const paid = settleIssuedCheck(due, "issued-1", "پرداخت شده", "1405/02/02");
    expect(paid.issuedChecks[0].status).toBe("پرداخت شده");
    expect(paid.partnerObligationEvents.at(-1)).toEqual(expect.objectContaining({ kind: "paid", amount: 500 }));
    const returned = settleIssuedCheck(due, "issued-1", "برگشتی", "1405/02/02");
    expect(returned.issuedChecks[0].status).toBe("برگشتی");
    expect(returned.partnerObligationEvents.at(-1)).toEqual(expect.objectContaining({ kind: "returned", amount: 0 }));
  });

  it("releases a purchase payment and returns its customer check to custody", () => {
    const state = normalizeState({
      checks: [{ id: "customer-check", number: "C1", partyId: "customer", receivedDate: "1405/01/01", dueDate: "1405/02/01", amount: 100, status: "خرج شده", bank: "", spentForPaymentId: "payment-1", spentToPartyId: "supplier" }],
      purchasePayments: [{ id: "payment-1", supplierId: "supplier", amount: 100, date: "1405/01/02", method: "چک مشتری", customerCheckId: "customer-check", note: "" }],
      invoices: [{ id: "buy-1", number: "B1", type: "خرید", date: "1405/01/01", partyId: "supplier", items: [], allocations: [], amount: 100, paidAmount: 100, status: "تسویه شده", note: "" }],
    });
    const released = releasePurchasePayment(state, "payment-1");
    expect(released.checks[0].status).toBe("نزد ما");
    expect(released.purchasePayments).toHaveLength(0);
    expect(released.invoices[0].status).toBe("باز");
  });

  it("records cash payment events once and reverses them when released", () => {
    const state = normalizeState({
      accounts: [{ id: "bank-1", name: "بانک", type: "بانک", balance: 0 }],
      purchasePayments: [{ id: "payment-cash", supplierId: "supplier", amount: 250, date: "1405/02/01", method: "نقدی", accountId: "bank-1", note: "" }],
    });
    const withEvent = appendPurchasePaymentCashEvents(state);
    const paymentEvents = withEvent.cashEvents.filter(event => event.sourceType === "purchase_payment");
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0]).toEqual(expect.objectContaining({ kind: "payment", accountId: "bank-1", amount: -250 }));
    expect(appendPurchasePaymentCashEvents(withEvent).cashEvents.filter(event => event.sourceType === "purchase_payment")).toHaveLength(1);
    const released = releasePurchasePayment(withEvent, "payment-cash");
    expect(released.cashEvents.at(-1)).toEqual(expect.objectContaining({ kind: "reversal", reversalOf: paymentEvents[0].id, amount: 250 }));
  });

  it("normalizes legacy positive purchase-payment events as cash outflows", () => {
    const normalized = normalizeState({
      settings: { currency: "تومان" },
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: -250 }],
      cashEvents: [{
        id: "legacy-payment",
        at: "now",
        date: "1405/01/01",
        kind: "payment",
        accountId: "bank",
        amount: 250,
        currency: "تومان",
        sourceType: "purchase_payment",
        sourceId: "payment-legacy",
        note: "پرداخت خرید",
      }],
    });
    expect(normalized.schemaVersion).toBe(5);
    expect(normalized.cashEvents[0].amount).toBe(-250);
    expect(rebuildCashProjection(normalized).accounts[0].balance).toBe(-250);
  });

  it("releases an invoice-only purchase payment but preserves a payment shared by invoices", () => {
    const state = normalizeState({
      invoices: [
        { id: "buy-a", number: "A", type: "خرید", date: "1405/01/01", partyId: "supplier", items: [], allocations: [], amount: 100, paidAmount: 50, status: "تسویه جزئی", note: "" },
        { id: "buy-b", number: "B", type: "خرید", date: "1405/01/02", partyId: "supplier", items: [], allocations: [], amount: 100, paidAmount: 50, status: "تسویه جزئی", note: "" },
      ],
      purchasePayments: [
        { id: "shared", supplierId: "supplier", amount: 100, date: "1405/01/03", method: "نقدی", accountId: "bank", note: "" },
        { id: "exclusive", supplierId: "supplier", amount: 50, date: "1405/01/04", method: "نقدی", accountId: "bank", note: "" },
      ],
      purchasePayableAllocations: [
        { id: "alloc-1", paymentId: "shared", invoiceId: "buy-a", amount: 50, allocatedAt: "now" },
        { id: "alloc-2", paymentId: "shared", invoiceId: "buy-b", amount: 50, allocatedAt: "now" },
        { id: "alloc-3", paymentId: "exclusive", invoiceId: "buy-a", amount: 50, allocatedAt: "now" },
      ],
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 150 }],
      cashEvents: [
        { id: "cash-shared", at: "now", date: "1405/01/03", kind: "payment", accountId: "bank", amount: -100, currency: "تومان", sourceType: "purchase_payment", sourceId: "shared", note: "" },
        { id: "cash-exclusive", at: "now", date: "1405/01/04", kind: "payment", accountId: "bank", amount: -50, currency: "تومان", sourceType: "purchase_payment", sourceId: "exclusive", note: "" },
      ],
    });
    expect(purchasePaymentIdsExclusiveToInvoice(state, "buy-a")).toEqual(new Set(["exclusive"]));
    const released = releasePurchasePaymentsForInvoice(state, "buy-a");
    const afterDelete = rebuildPurchasePayables({
      ...released,
      invoices: released.invoices.filter(invoice => invoice.id !== "buy-a"),
    });
    expect(afterDelete.purchasePayments.map(item => item.id)).toEqual(["shared"]);
    expect(afterDelete.cashEvents.filter(item => item.kind === "reversal")).toHaveLength(1);
    expect(afterDelete.cashEvents.filter(item => item.reversalOf === "cash-exclusive")).toHaveLength(1);
    expect(afterDelete.purchasePayableAllocations).toEqual([
      expect.objectContaining({ paymentId: "shared", invoiceId: "buy-b", amount: 100 }),
    ]);
  });

  it("does not duplicate a cash reversal when an exclusive payment is released twice", () => {
    const state = normalizeState({
      purchasePayments: [{ id: "payment-once", supplierId: "supplier", amount: 10, date: "1405/01/01", method: "نقدی", accountId: "bank", note: "" }],
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 0 }],
      cashEvents: [{ id: "cash-once", at: "now", date: "1405/01/01", kind: "payment", accountId: "bank", amount: -10, currency: "تومان", sourceType: "purchase_payment", sourceId: "payment-once", note: "" }],
    });
    const once = releasePurchasePayment(state, "payment-once");
    const twice = releasePurchasePayment(once, "payment-once");
    expect(twice.cashEvents.filter(item => item.reversalOf === "cash-once")).toHaveLength(1);
  });

  it("rebuilds both sides of an inter-account transfer and reports no discrepancy", () => {
    const state = normalizeState({
      accounts: [
        { id: "bank", name: "بانک", type: "بانک", balance: 900 },
        { id: "cash", name: "صندوق", type: "صندوق", balance: 100 },
      ],
      transactions: [{
        id: "transfer-1", type: "انتقال بین حساب‌ها", date: "1405/01/01",
        fromAccountId: "bank", toAccountId: "cash", amount: 100,
        status: "ثبت شده", note: "انتقال آزمایشی",
      }],
      cashEvents: [
        { id: "bank-opening", at: "now", date: "1405/01/01", kind: "opening_balance", accountId: "bank", amount: 1000, currency: "تومان", sourceType: "opening_balance", note: "" },
        { id: "cash-opening", at: "now", date: "1405/01/01", kind: "opening_balance", accountId: "cash", amount: 0, currency: "تومان", sourceType: "opening_balance", note: "" },
        { id: "transfer-out", at: "now", date: "1405/01/01", kind: "transfer", accountId: "bank", counterAccountId: "cash", amount: -100, currency: "تومان", sourceType: "transaction", sourceId: "transfer-1", note: "" },
        { id: "transfer-in", at: "now", date: "1405/01/01", kind: "transfer", accountId: "cash", counterAccountId: "bank", amount: 100, currency: "تومان", sourceType: "transaction", sourceId: "transfer-1", note: "" },
      ],
    });
    const rows = cashAccountReconciliation(state);
    expect(rows.find(row => row.accountId === "bank")).toEqual(expect.objectContaining({ recorded: 900, projected: 900, difference: 0, eventCount: 2 }));
    expect(rows.find(row => row.accountId === "cash")).toEqual(expect.objectContaining({ recorded: 100, projected: 100, difference: 0, eventCount: 2 }));
  });

  it("keeps an opening balance in the reconstructed account ledger", () => {
    const state = normalizeState({
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 500 }],
      cashEvents: [{ id: "opening", at: "now", date: "1405/01/01", kind: "opening_balance", accountId: "bank", amount: 500, currency: "تومان", sourceType: "opening_balance", note: "" }],
    });
    expect(cashAccountReconciliation(state)[0]).toEqual(expect.objectContaining({ recorded: 500, projected: 500, difference: 0, receipts: 500, payments: 0 }));
  });

  it("runs the integrated purchase, checks, partner obligation, cash and reversal flow", () => {
    const state = normalizeState({
      settings: { currency: "تومان", dayBasis: 30 },
      people: [
        { id: "supplier", code: "S", name: "تأمین‌کننده", type: "تأمین‌کننده", roles: ["تأمین‌کننده"] },
        { id: "customer", code: "C", name: "مشتری", type: "مشتری", roles: ["مشتری"] },
        { id: "partner", code: "P", name: "شریک", type: "شریک", roles: ["شریک"] },
      ],
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 980 }],
      cashEvents: [{
        id: "opening-bank", at: "now", date: "1405/01/01", kind: "opening_balance",
        accountId: "bank", amount: 1000, currency: "تومان", sourceType: "opening_balance", note: "",
      }],
      invoices: [
        { id: "buy-1", number: "B1", type: "خرید" as const, date: "1405/01/01", partyId: "supplier", items: [], allocations: [], amount: 120, paidAmount: 0, status: "باز" as const, note: "" },
        { id: "buy-2", number: "B2", type: "خرید" as const, date: "1405/01/02", partyId: "supplier", items: [], allocations: [], amount: 60, paidAmount: 0, status: "باز" as const, note: "" },
      ],
      checks: [{
        id: "customer-check", number: "C-1", partyId: "customer", receivedDate: "1405/01/01",
        dueDate: "1405/02/01", amount: 100, status: "خرج شده" as const, bank: "",
        spentForPaymentId: "payment-customer", spentToPartyId: "supplier",
      }],
      purchasePayments: [
        { id: "payment-customer", supplierId: "supplier", amount: 100, date: "1405/01/03", method: "چک مشتری" as const, customerCheckId: "customer-check", note: "" },
        { id: "payment-cash", supplierId: "supplier", amount: 20, date: "1405/01/03", method: "نقدی" as const, accountId: "bank", note: "" },
        { id: "payment-partner", supplierId: "supplier", amount: 60, date: "1405/01/03", method: "چک شریک" as const, issuedCheckId: "issued-partner", note: "" },
      ],
      issuedChecks: [{
        id: "issued-partner", number: "P-1", issuerPartyId: "partner", dateIssued: "1405/01/03",
        dueDate: "1405/02/01", amount: 60, status: "صادر شده" as const, purpose: "خرید" as const, note: "",
      }],
    });
    const withPayables = rebuildPurchasePayables(appendPurchasePaymentCashEvents(state));
    expect(withPayables.invoices.map(invoice => [invoice.status, invoice.paidAmount])).toEqual([
      ["تسویه شده", 120],
      ["تسویه شده", 60],
    ]);
    expect(withPayables.cashEvents.find(event => event.sourceId === "payment-cash")?.amount).toBe(-20);
    expect(cashAccountReconciliation(withPayables)[0]).toEqual(expect.objectContaining({ recorded: 980, projected: 980, difference: 0 }));

    const due = refreshIssuedCheckStatuses(withPayables, "1405/02/01");
    expect(due.issuedChecks[0].status).toBe("سررسید شده");
    expect(due.partnerObligationEvents).toEqual([
      expect.objectContaining({ issuedCheckId: "issued-partner", kind: "due", amount: 60 }),
    ]);

    const released = releasePurchasePaymentsForInvoice(due, "buy-1");
    const afterDelete = rebuildPurchasePayables({
      ...released,
      invoices: released.invoices.filter(invoice => invoice.id !== "buy-1"),
    });
    expect(afterDelete.checks[0].status).toBe("نزد ما");
    expect(afterDelete.purchasePayments.map(payment => payment.id)).toEqual(["payment-partner"]);
    expect(afterDelete.invoices[0]).toEqual(expect.objectContaining({ id: "buy-2", status: "تسویه شده", paidAmount: 60 }));
    const cashPaymentEvent = withPayables.cashEvents.find(event => event.sourceId === "payment-cash");
    expect(cashPaymentEvent).toBeDefined();
    expect(afterDelete.cashEvents.filter(event => event.reversalOf === cashPaymentEvent?.id)).toHaveLength(1);
    expect(afterDelete.cashEvents.reduce((sum, event) => sum + event.amount, 0)).toBe(1000);

    const releasedPartner = releasePurchasePayment(afterDelete, "payment-partner");
    expect(releasedPartner.issuedChecks[0].status).toBe("باطل");
    expect(releasedPartner.partnerObligationEvents.at(-1)).toEqual(expect.objectContaining({ kind: "reversal", amount: -60 }));
    expect(rebuildPurchasePayables(releasedPartner).invoices[0]).toEqual(expect.objectContaining({ status: "باز", paidAmount: 0 }));
  });
});

describe("Jalali calendar", () => {
  it("uses calendar month lengths for day differences", () => {
    expect(jalaliDayDifference("1405/01/01", "1405/02/15")).toBe(45);
    expect(jalaliDayDifference("1405/06/31", "1405/07/01")).toBe(1);
    expect(jalaliDayDifference("1405/07/30", "1405/08/01")).toBe(1);
  });

  it("handles leap-year Esfand and rejects invalid dates", () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isValidJalaliDate(1403, 12, 30)).toBe(true);
    expect(jalaliDayDifference("1403/12/30", "1404/01/01")).toBe(1);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(isValidJalaliDate(1404, 12, 30)).toBe(false);
    expect(jalaliDayDifference("1404/12/30", "1405/01/01")).toBe(0);
    expect(jalaliMonthDayBasis("1404/12/29")).toBe(29);
  });

  it("does not create a reverse or invalid elapsed period", () => {
    expect(jalaliDayDifference("1405/02/01", "1405/01/31")).toBe(0);
    expect(jalaliDayDifference("not-a-date", "1405/01/01")).toBe(0);
    expect(isValidJalaliDate(1405, 13, 1)).toBe(false);
  });
});

describe("production execution", () => {
  it("records unit cost per base output unit", () => {
    const raw = {
      id: "base-cost-raw", code: "BCR", name: "ماده پایه", unit: "گرم", unit2: "گرم",
      conversionRate: 1, stock: 1000, minStock: 0, price: 1, category: "مواد اولیه" as const,
    };
    const output = {
      id: "base-cost-output", code: "BCO", name: "محصول کیلوگرمی", unit: "کیلوگرم", unit2: "گرم",
      conversionRate: 1000, stock: 0, minStock: 0, price: 0, category: "محصول تولیدی" as const,
    };
    const formula = {
      id: "base-cost-formula", name: "فرمول پایه", formulaType: "قطعه" as const,
      outputProductId: output.id, outputName: output.name, outputQuantity: 1, outputUnit: "کیلوگرم",
      materials: [{ id: "base-cost-line", productId: raw.id, quantity: 100, unit: "گرم" }],
      costs: [], note: "",
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "کیلوگرم"] },
      people: [], products: [raw, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formula], productionRecords: [],
    };
    const record = executeProduction(state, formula.id, 500, "گرم").state.productionRecords[0];
    expect(record.outputQuantityBase).toBeCloseTo(0.5);
    expect(record.unitCost).toBeCloseTo(100);
  });

  it("uses the independent package price instead of package ingredient cost", () => {
    const raw = {
      id: "priced-raw", code: "PR", name: "ماده بسته", unit: "گرم", unit2: "گرم",
      conversionRate: 1, stock: 0, minStock: 0, price: 2, category: "مواد اولیه" as const,
    };
    const pack = {
      id: "priced-pack", code: "PP", name: "بسته قیمت‌گذاری‌شده", unit: "بسته", unit2: "بسته",
      conversionRate: 1, stock: 1, minStock: 0, price: 50, category: "بسته تولید" as const,
    };
    const output = {
      id: "priced-output", code: "PO", name: "محصول با بسته", unit: "عدد", unit2: "عدد",
      conversionRate: 1, stock: 0, minStock: 0, price: 0, category: "محصول تولیدی" as const,
    };
    const formula = {
      id: "priced-formula", name: "محصول با بسته", formulaType: "قطعه" as const,
      outputProductId: output.id, outputName: output.name, outputQuantity: 1, outputUnit: "عدد",
      materials: [{ id: "priced-line", productId: pack.id, quantity: 1, unit: "بسته" }],
      costs: [], note: "",
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "بسته", "عدد"] },
      people: [], products: [raw, pack, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formula], productionRecords: [],
    };
    const result = executeProduction(state, formula.id, 1, "عدد", "1405/07/01");
    expect(result.state.productionRecords[0].materialCost).toBe(50);
    expect(result.state.products.find(item => item.id === pack.id)?.stock).toBe(0);
  });

  it("allows production to leave a missing raw material stock negative", () => {
    const raw = {
      id: "negative-raw", code: "NR", name: "ماده کسری", unit: "گرم", unit2: "گرم",
      conversionRate: 1, stock: 0, minStock: 0, price: 2, category: "مواد اولیه" as const,
    };
    const output = {
      id: "negative-output", code: "NO", name: "محصول کسری", unit: "عدد", unit2: "عدد",
      conversionRate: 1, stock: 0, minStock: 0, price: 0, category: "محصول تولیدی" as const,
    };
    const formula = {
      id: "negative-formula", name: "فرمول کسری", formulaType: "قطعه" as const,
      outputProductId: output.id, outputName: output.name, outputQuantity: 1, outputUnit: "عدد",
      materials: [{ id: "negative-line", productId: raw.id, quantity: 10, unit: "گرم" }],
      costs: [], note: "",
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "عدد"] },
      people: [], products: [raw, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formula], productionRecords: [],
    };
    const result = executeProduction(state, formula.id, 1, "عدد");
    expect(result.state.products.find(item => item.id === raw.id)?.stock).toBe(-10);
  });

  it("applies inventory balance in the selected unit without financial transactions", () => {
    const product = {
      id: "balance-product", code: "BP", name: "ماده بالانس", unit: "کیلوگرم", unit2: "گرم",
      conversionRate: 1000, stock: 100, minStock: 0, price: 20, category: "مواد اولیه" as const,
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "کیلوگرم"] },
      people: [], products: [product], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [], productionRecords: [],
    };
    const balanced = adjustInventoryBalance(state, product.id, 1.5, "کیلوگرم", "شمارش انبار");
    const reduced = adjustInventoryBalance(balanced, product.id, -500, "گرم", "اصلاح شمارش");
    expect(reduced.products[0].stock).toBeCloseTo(101);
    expect(reduced.transactions).toHaveLength(0);
    expect(reduced.audit.at(-1)?.action).toBe("STOCK_ADJUSTMENT");
  });

  it("removes a production batch and reverses actual material and output stock", () => {
    const raw = {
      id: "delete-raw", code: "DR", name: "ماده حذف", unit: "گرم", unit2: "گرم",
      conversionRate: 1, stock: 1000, minStock: 0, price: 2, category: "مواد اولیه" as const,
    };
    const output = {
      id: "delete-output", code: "DO", name: "محصول حذف", unit: "عدد", unit2: "عدد",
      conversionRate: 1, stock: 0, minStock: 0, price: 500, category: "محصول تولیدی" as const,
    };
    const formula = {
      id: "delete-formula", name: "فرمول حذف", formulaType: "قطعه" as const,
      outputProductId: output.id, outputName: output.name, outputQuantity: 1, outputUnit: "عدد",
      standardPieceWeight: 100, standardPieceWeightUnit: "گرم",
      materials: [{ id: "delete-line", productId: raw.id, quantity: 100, unit: "گرم" }],
      costs: [], note: "",
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "عدد"] },
      people: [], products: [raw, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formula], productionRecords: [],
    };
    const produced = executeProduction(state, formula.id, 2, "عدد", "1405/07/01", {
      batchNumber: "B-DELETE", pieceWeight: 100, pieceWeightUnit: "گرم",
    }).state;
    const restored = removeProductionRun(produced, produced.productionRecords[0].id);
    expect(restored.products.find(item => item.id === raw.id)?.stock).toBeCloseTo(1000, 6);
    expect(restored.products.find(item => item.id === output.id)?.stock).toBeCloseTo(0, 6);
    expect(restored.productionRecords).toHaveLength(0);
  });

  it("keeps a production row self-contained after its formula engine is removed", () => {
    const raw = {
      id: "snapshot-raw", code: "SR", name: "ماده snapshot", unit: "گرم", unit2: "گرم",
      conversionRate: 1, stock: 1000, minStock: 0, price: 1, category: "مواد اولیه" as const,
    };
    const output = {
      id: "snapshot-output", code: "SO", name: "محصول snapshot", unit: "عدد", unit2: "عدد",
      conversionRate: 1, stock: 0, minStock: 0, price: 200, category: "محصول تولیدی" as const,
    };
    const formula = {
      id: "snapshot-formula", name: "موتور موقت", formulaType: "قطعه" as const,
      outputProductId: output.id, outputName: output.name, outputQuantity: 1, outputUnit: "عدد",
      materials: [{ id: "snapshot-line", productId: raw.id, quantity: 100, unit: "گرم" }],
      costs: [], note: "",
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "عدد"] },
      people: [], products: [raw, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formula], productionRecords: [],
    };
    const produced = executeProduction(state, formula.id, 1, "عدد", "1405/07/01", {
      batchNumber: "B-SNAPSHOT",
    }).state;
    const engineRemoved = {
      ...produced,
      productionFormulas: [],
    };
    expect(engineRemoved.productionRecords[0].formulaSnapshot?.name).toBe("موتور موقت");
    const restored = removeProductionRun(engineRemoved, engineRemoved.productionRecords[0].id);
    expect(restored.products.find(item => item.id === raw.id)?.stock).toBeCloseTo(1000, 6);
    expect(restored.products.find(item => item.id === output.id)?.stock).toBeCloseTo(0, 6);
  });

  it("scales material usage by actual piece weight and records batch adjustments", () => {
    const raw = {
      id: "weighted-raw",
      code: "WR",
      name: "پودر تست",
      unit: "گرم",
      unit2: "گرم",
      conversionRate: 1,
      stock: 10_000,
      minStock: 0,
      price: 2,
      category: "مواد اولیه" as const,
    };
    const output = {
      id: "weighted-output",
      code: "WO",
      name: "لقمه تست",
      unit: "عدد",
      unit2: "کارتن",
      conversionRate: 36,
      stock: 0,
      minStock: 0,
      price: 999_000,
      category: "محصول تولیدی" as const,
    };
    const formula = {
      id: "weighted-formula",
      name: "لقمه ۴۰۰ گرمی",
      formulaType: "قطعه" as const,
      outputProductId: output.id,
      outputName: output.name,
      outputQuantity: 1,
      outputUnit: "عدد",
      standardPieceWeight: 400,
      standardPieceWeightUnit: "گرم",
      materials: [
        { id: "weighted-line", productId: raw.id, quantity: 400, unit: "گرم" },
      ],
      costs: [],
      note: "",
    };
    const state = {
      schemaVersion: 2,
      revision: 1,
      updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "عدد"] },
      people: [], products: [raw, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formula], productionRecords: [],
    };
    const result = executeProduction(state, formula.id, 10, "عدد", "1405/07/01", {
      batchNumber: "B-001",
      pieceWeight: 430,
      pieceWeightUnit: "گرم",
      wastePercent: 10,
      materialAdjustments: { "weighted-line": 5 },
      note: "خشک‌کردن بیشتر پودر",
    });
    const updatedRaw = result.state.products.find(item => item.id === raw.id)!;
    const updatedOutput = result.state.products.find(item => item.id === output.id)!;
    const record = result.state.productionRecords[0];

    expect(updatedRaw.stock).toBeCloseTo(5_265, 6);
    expect(updatedOutput.stock).toBe(10);
    expect(updatedOutput.price).toBe(999_000);
    expect(record.batchNumber).toBe("B-001");
    expect(record.pieceWeight).toBe(430);
    expect(record.wastePercent).toBe(10);
    expect(record.materialUsage?.[0].plannedQuantity).toBeCloseTo(4300, 6);
    expect(record.materialUsage?.[0].adjustmentQuantity).toBe(5);
    expect(record.materialUsage?.[0].actualQuantity).toBeCloseTo(4735, 6);
  });

  it("produces nested packages and converts decimal quantities to base stock", () => {
    const raw = {
      id: "raw",
      code: "R",
      name: "ماده",
      unit: "گرم",
      unit2: "گرم",
      conversionRate: 1,
      stock: 1000,
      minStock: 0,
      price: 2,
      category: "مواد اولیه" as const,
    };
    const pack = {
      id: "pack",
      code: "P",
      name: "بسته نیمه‌آماده",
      unit: "بسته",
      unit2: "بسته",
      conversionRate: 1,
      stock: 0,
      minStock: 0,
      price: 0,
      category: "بسته تولید" as const,
    };
    const output = {
      id: "output",
      code: "O",
      name: "محصول نهایی",
      unit: "عدد",
      unit2: "عدد",
      conversionRate: 1,
      stock: 0,
      minStock: 0,
      price: 0,
      category: "محصول تولیدی" as const,
    };
    const state = {
      schemaVersion: 2,
      revision: 1,
      updatedAt: "1405/01/01",
      settings: {
        businessName: "آزمون",
        currency: "تومان",
        dayBasis: 30 as const,
        units: ["گرم", "بسته", "عدد"],
      },
      people: [], products: [raw, pack, output], warehouses: [], invoices: [],
      priceHistory: [], paymentRules: [], transactions: [], checks: [],
      accounts: [], audit: [],
      productionFormulas: [
        {
          id: "pack-formula", name: "بسته", formulaType: "بسته تولید" as const,
          outputProductId: "pack", outputName: "بسته نیمه‌آماده", outputQuantity: 1,
          outputUnit: "بسته", materials: [{ id: "pm", productId: "raw", quantity: 100, unit: "گرم" }],
          costs: [], note: "",
        },
        {
          id: "output-formula", name: "محصول", formulaType: "قطعه" as const,
          outputProductId: "output", outputName: "محصول نهایی", outputQuantity: 1,
          outputUnit: "عدد", materials: [{ id: "om", productId: "pack", quantity: 2, unit: "بسته" }],
          costs: [], note: "",
        },
      ],
      productionRecords: [],
    };
    const result = executeProduction(state, "output-formula", 1, "عدد");
    expect(result.state.products.find(product => product.id === "raw")?.stock).toBe(800);
    expect(result.state.products.find(product => product.id === "pack")?.stock).toBe(0);
    expect(result.state.products.find(product => product.id === "output")?.stock).toBe(1);
    expect(result.state.productionRecords).toHaveLength(2);
    const mainRecord = result.state.productionRecords.find(record => record.formulaId === "output-formula")!;
    expect(mainRecord.materialCost).toBe(400);
    const repriced = refreshProductionRecordPrice(result.state, mainRecord.id, 1, "1405/07/02");
    expect(repriced.productionRecords.find(record => record.id === mainRecord.id)?.priceRevisions).toHaveLength(1);
    expect(repriced.productionRecords.find(record => record.id === mainRecord.id)?.priceRevisions?.[0].unitCost).toBe(400);
  });

  it("always consumes packages while package ticks only control weight inclusion", () => {
    const makeProduct = (id: string, name: string, unit: string, stock: number, category: "مواد اولیه" | "بسته تولید" | "محصول تولیدی", conversionRate = 1) => ({
      id, code: id, name, unit, unit2: unit, conversionRate, stock, minStock: 0, price: 1, category,
    });
    const x = makeProduct("x", "X", "گرم", 100000, "مواد اولیه");
    const y = makeProduct("y", "Y", "گرم", 100000, "مواد اولیه");
    const aRaw = makeProduct("a-raw", "ماده بسته الف", "گرم", 100000, "مواد اولیه");
    const bRaw = makeProduct("b-raw", "ماده بسته ب", "عدد", 100000, "مواد اولیه");
    const packA = makeProduct("pack-a", "بسته الف", "گرم", 0, "بسته تولید");
    const packB = makeProduct("pack-b", "بسته ب", "عدد", 0, "بسته تولید");
    const output = {
      ...makeProduct("piece", "قطعه A", "عدد", 0, "محصول تولیدی", 36),
      unit2: "کارتن",
    };
    const formulaA = {
      id: "formula-a", name: "فرمول A", formulaType: "قطعه" as const,
      outputProductId: output.id, outputName: output.name, outputQuantity: 1, outputUnit: "عدد",
      materials: [
        { id: "x-line", productId: x.id, quantity: 2, unit: "گرم" },
        { id: "y-line", productId: y.id, quantity: 3, unit: "گرم" },
        { id: "a-line", productId: packA.id, quantity: 5, unit: "گرم" },
        { id: "b-line", productId: packB.id, quantity: 1, unit: "عدد" },
      ], costs: [], note: "",
    };
    const formulaAEngine = {
      id: "formula-pack-a", name: "موتور بسته الف", formulaType: "بسته تولید" as const,
      outputProductId: packA.id, outputName: packA.name, outputQuantity: 5, outputUnit: "گرم",
      materials: [{ id: "a-raw-line", productId: aRaw.id, quantity: 5, unit: "گرم" }], costs: [], note: "",
    };
    const formulaBEngine = {
      id: "formula-pack-b", name: "موتور بسته ب", formulaType: "بسته تولید" as const,
      outputProductId: packB.id, outputName: packB.name, outputQuantity: 1, outputUnit: "عدد",
      materials: [{ id: "b-raw-line", productId: bRaw.id, quantity: 1, unit: "عدد" }], costs: [], note: "",
    };
    const state = {
      schemaVersion: 2, revision: 1, updatedAt: "1405/01/01",
      settings: { businessName: "آزمون", currency: "تومان", dayBasis: 30 as const, units: ["گرم", "عدد", "کارتن"] },
      people: [], products: [x, y, aRaw, bRaw, packA, packB, output], warehouses: [], invoices: [], priceHistory: [],
      paymentRules: [], transactions: [], checks: [], accounts: [], audit: [],
      productionFormulas: [formulaA, formulaAEngine, formulaBEngine], productionRecords: [],
    };
    const result = executeProduction(state, formulaA.id, 11, "کارتن", "1405/07/01", {
      batchNumber: "B-430-11C", pieceWeight: 430, pieceWeightUnit: "گرم", excludedMaterialIds: ["b-line"],
    });
    const stocks = new Map(result.state.products.map(product => [product.id, product.stock]));
    expect(stocks.get(x.id)).toBeCloseTo(100000 - 11 * 36 * 2 * 43, 6);
    expect(stocks.get(y.id)).toBeCloseTo(100000 - 11 * 36 * 3 * 43, 6);
    expect(stocks.get(aRaw.id)).toBeCloseTo(100000 - 11 * 36 * 5 * 43, 6);
    expect(stocks.get(bRaw.id)).toBe(100000 - 396);
    expect(stocks.get(packB.id)).toBe(0);
    expect(stocks.get(output.id)).toBe(396);
    const mainRecord = result.state.productionRecords.find(record => record.formulaId === formulaA.id)!;
    expect(mainRecord.excludedMaterialIds).toEqual(["b-line"]);
    expect(mainRecord.pieceWeight).toBe(430);
  });
});

describe("event ledger projections", () => {
  it("migrates legacy stock and account balances into opening events", () => {
    const legacy = normalizeState({
      schemaVersion: 2,
      products: [{ id: "p", name: "کالا", code: "P", unit: "عدد", stock: 12, price: 0 }],
      accounts: [{ id: "cash", name: "صندوق", type: "صندوق", balance: 500 }],
    });
    expect(legacy.schemaVersion).toBe(5);
    expect(legacy.inventoryEvents).toHaveLength(1);
    expect(legacy.inventoryEvents[0].quantityBase).toBe(12);
    expect(legacy.cashEvents).toHaveLength(1);
    expect(legacy.cashEvents[0].amount).toBe(500);
    expect(rebuildInventoryProjection(legacy).products[0].stock).toBe(12);
    expect(rebuildCashProjection(legacy).accounts[0].balance).toBe(500);
  });

  it("records production input and output events that rebuild stock", () => {
    const raw = {
      id: "ledger-raw", code: "LR", name: "ماده", unit: "گرم", unit2: "گرم",
      conversionRate: 1, stock: 100, minStock: 0, price: 2, category: "مواد اولیه" as const,
    };
    const output = {
      id: "ledger-output", code: "LO", name: "محصول", unit: "عدد", unit2: "عدد",
      conversionRate: 1, stock: 0, minStock: 0, price: 0, category: "محصول تولیدی" as const,
    };
    const state = normalizeState({
      schemaVersion: 3, products: [raw, output], accounts: [], warehouses: [],
      productionFormulas: [{
        id: "ledger-formula", name: "فرمول", outputProductId: output.id,
        outputQuantity: 1, outputUnit: "عدد", materials: [{ id: "line", productId: raw.id, quantity: 10, unit: "گرم" }],
        costs: [], note: "",
      }], productionRecords: [],
    });
    const result = executeProduction(state, "ledger-formula", 3, "عدد", "1405/01/01");
    expect(result.state.inventoryEvents.filter(event => event.sourceType === "production")).toHaveLength(2);
    const rebuilt = rebuildInventoryProjection({ ...result.state, products: result.state.products.map(product => ({ ...product, stock: 0 })) });
    expect(rebuilt.products.find(product => product.id === raw.id)?.stock).toBe(70);
    expect(rebuilt.products.find(product => product.id === output.id)?.stock).toBe(3);
  });

  it("bridges a legacy stock and cash mutation exactly once", () => {
    const previous = normalizeState({
      products: [{ id: "p", name: "کالا", code: "P", unit: "عدد", stock: 10, price: 0 }],
      accounts: [{ id: "cash", name: "صندوق", type: "صندوق", balance: 100 }],
    });
    const next = { ...previous,
      products: previous.products.map(product => ({ ...product, stock: 7 })),
      accounts: previous.accounts.map(account => ({ ...account, balance: 130 })),
    };
    const bridged = reconcileLedgerEvents(previous, next);
    expect(bridged.inventoryEvents.at(-1)?.quantityBase).toBe(-3);
    expect(bridged.cashEvents.at(-1)?.amount).toBe(30);
    expect(rebuildInventoryProjection(bridged).products[0].stock).toBe(7);
    expect(rebuildCashProjection(bridged).accounts[0].balance).toBe(130);
  });

  it("reports a stock projection mismatch instead of hiding it", () => {
    const state = normalizeState({
      products: [{ id: "p", name: "کالا", code: "P", unit: "عدد", stock: 10, price: 0 }],
      accounts: [],
    });
    const altered = {
      ...state,
      products: state.products.map(product => ({ ...product, stock: 12 })),
    };
    expect(inventoryLedgerDiscrepancies(altered)).toEqual([
      expect.objectContaining({ id: "p", recorded: 12, projected: 10, difference: 2 }),
    ]);
  });

  it("classifies a new purchase as inventory purchase and cash payment", () => {
    const previous = normalizeState({
      products: [{ id: "p", name: "کالا", code: "P", unit: "عدد", stock: 10, price: 0 }],
      accounts: [{ id: "cash", name: "صندوق", type: "صندوق", balance: 100 }],
    });
    const transaction = {
      id: "tx-purchase", type: "خرید کالا" as const, date: "1405/07/01",
      productId: "p", warehouseId: "w", quantity: 2, unit: "عدد",
      accountId: "cash", partyId: "person", amount: 50,
      status: "ثبت شده" as const, note: "خرید آزمایشی",
    };
    const next = {
      ...previous,
      products: previous.products.map(product => ({ ...product, stock: 12 })),
      accounts: previous.accounts.map(account => ({ ...account, balance: 50 })),
      transactions: [transaction],
    };
    const reconciled = reconcileLedgerEvents(previous, next);
    expect(reconciled.inventoryEvents.at(-1)?.kind).toBe("purchase");
    expect(reconciled.cashEvents.at(-1)?.kind).toBe("payment");
    expect(reconciled.cashEvents.at(-1)?.amount).toBe(-50);
    expect(rebuildInventoryProjection(reconciled).products[0].stock).toBe(12);
    expect(rebuildCashProjection(reconciled).accounts[0].balance).toBe(50);
    expect(inventoryLedgerDiscrepancies(reconciled)).toHaveLength(0);
    expect(cashLedgerDiscrepancies(reconciled)).toHaveLength(0);
  });

  it("records check receipt and reverses it on return", () => {
    const previous = normalizeState({
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 0 }],
      checks: [{
        id: "check-1", number: "۱", partyId: "person", receivedDate: "1405/07/01",
        dueDate: "1405/07/30", amount: 100, status: "نزد ما", bank: "بانک",
      }],
    });
    const received = {
      ...previous,
      accounts: previous.accounts.map(account => ({ ...account, balance: 100 })),
      checks: previous.checks.map(check => ({ ...check, status: "وصول شده" as const, bankAccountId: "bank" })),
    };
    const cleared = reconcileLedgerEvents(previous, received);
    expect(cleared.cashEvents.at(-1)).toEqual(expect.objectContaining({ kind: "check_receipt", amount: 100, accountId: "bank" }));
    expect(rebuildCashProjection(cleared).accounts[0].balance).toBe(100);
    const returned = {
      ...cleared,
      accounts: cleared.accounts.map(account => ({ ...account, balance: 0 })),
      checks: cleared.checks.map(check => ({ ...check, status: "برگشتی" as const })),
    };
    const reversed = reconcileLedgerEvents(cleared, returned);
    expect(reversed.cashEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "reversal", amount: -100, accountId: "bank" }),
      expect.objectContaining({ kind: "check_return", amount: 0, accountId: "bank" }),
    ]));
    expect(rebuildCashProjection(reversed).accounts[0].balance).toBe(0);
  });
});


describe("data integrity audit", () => {
  it("detects duplicate invoice numbers and broken allocation references", () => {
    const state = normalizeState({
      people: [],
      products: [],
      invoices: [
        { id: "i-1", number: "100", type: "فروش", date: "1405/01/01", items: [], allocations: [{ checkId: "missing", amount: 10, allocatedAt: "1405/01/01" }], amount: 100, paidAmount: 10, status: "باز", note: "" },
        { id: "i-2", number: "100", type: "خرید", date: "1405/01/02", items: [], allocations: [], amount: 50, paidAmount: 0, status: "باز", note: "" },
      ],
    });
    const findings = auditDataIntegrity(state);
    expect(findings.some(item => item.message.includes("شماره فاکتور") && item.severity === "خطا")).toBe(true);
    expect(findings.some(item => item.message.includes("چک تخصیص‌یافته") && item.severity === "خطا")).toBe(true);
  });
});


describe("late-cost allocation integrity", () => {
  it("does not flag late cost as invoice over-allocation", () => {
    const state = normalizeState({
      people: [{ id: "customer", code: "C1", name: "مشتری", type: "مشتری", roles: ["مشتری"], phone: "", balance: 0 }],
      invoices: [{
        id: "invoice-1010", number: "1010", type: "فروش", date: "1405/06/07", partyId: "customer",
        items: [], allocations: [{ checkId: "check-z006", amount: 188338064.51612905, principalAmount: 161999999.99999997, profit: 26338064.516129047, allocatedAt: "1405/06/26" }],
        amount: 162000000, paidAmount: 161999999.99999997, status: "تسویه جزئی", note: "",
      }],
      checks: [{ id: "check-z006", number: "Z006", partyId: "customer", dueDate: "1405/08/30", receivedDate: "1405/06/26", amount: 350000000, status: "نزد ما", bank: "حساب بانکی" }],
    });
    expect(state.invoices[0].status).toBe("تسویه شده");
    const findings = auditDataIntegrity(state);
    expect(findings.some(item => item.id === "invoice-allocation-invoice-1010")).toBe(false);
  });
});


describe("payroll accounting", () => {
  it("records a direct payroll payment as cash outflow without a party balance", () => {
    const previous = normalizeState({
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 1000 }],
      transactions: [],
      payrollRecords: [],
    });
    const next = {
      ...previous,
      accounts: previous.accounts.map(account => account.id === "bank" ? { ...account, balance: 950 } : account),
      payrollRecords: [{
        id: "payroll-1", date: "1405/07/03", period: "1405/06", employeeName: "علی رضایی",
        amount: 50, status: "پرداخت‌شده" as const, accountId: "bank", transactionId: "payroll-payment-1", note: "",
      }],
      transactions: [{
        id: "payroll-payment-1", type: "پرداخت حقوق" as const, date: "1405/07/03", accountId: "bank",
        referenceType: "هزینه" as const, referenceId: "payroll-1", amount: 50, status: "ثبت شده" as const, note: "حقوق علی رضایی",
      }],
    };
    const reconciled = reconcileLedgerEvents(previous, next);
    expect(reconciled.transactions[0].partyId).toBeUndefined();
    expect(reconciled.cashEvents.at(-1)).toEqual(expect.objectContaining({ accountId: "bank", amount: -50, kind: "payment", sourceId: "payroll-payment-1" }));
    expect(rebuildCashProjection(reconciled).accounts.find(account => account.id === "bank")?.balance).toBe(950);
  });
});


describe("payroll person links", () => {
  it("keeps linked worker, employee, and partner references non-financial", () => {
    const state = normalizeState({
      people: [
        { id: "worker", name: "کارگر", roles: ["کارگر"] },
        { id: "employee", name: "کارمند", roles: ["کارمند"] },
        { id: "partner", name: "شریک", roles: ["شریک"] },
      ],
      payrollRecords: [
        { id: "p1", date: "1405/07/03", period: "1405/06", employeeName: "کارگر", personId: "worker", amount: 10, status: "پرداختنی", note: "" },
        { id: "p2", date: "1405/07/03", period: "1405/06", employeeName: "کارمند", personId: "employee", amount: 20, status: "پرداختنی", note: "" },
        { id: "p3", date: "1405/07/03", period: "1405/06", employeeName: "شریک", personId: "partner", amount: 30, status: "پرداختنی", note: "" },
      ],
    });
    expect(state.payrollRecords.map(record => record.personId)).toEqual(["worker", "employee", "partner"]);
    expect(auditDataIntegrity(state).some(finding => finding.area === "حقوق و دستمزد" && finding.severity === "خطا")).toBe(false);
  });

  it("detects a payroll record linked to a deleted person", () => {
    const state = normalizeState({
      payrollRecords: [{ id: "p-missing", date: "1405/07/03", period: "1405/06", employeeName: "حذف‌شده", personId: "missing", amount: 10, status: "پرداختنی", note: "" }],
    });
    expect(auditDataIntegrity(state)).toContainEqual(expect.objectContaining({ id: "payroll-person-p-missing", severity: "خطا" }));
  });
});


describe("bank transfer fees", () => {
  const opening = {
    schemaVersion: 5,
    revision: 1,
    updatedAt: "1405/07/03",
    settings: { businessName: "کارگاه", currency: "تومان", dayBasis: "شمسی" as const, units: [] },
    accounts: [
      { id: "from", name: "بانک مبدأ", type: "بانک" as const, balance: 1000 },
      { id: "to", name: "بانک مقصد", type: "بانک" as const, balance: 0 },
    ],
    cashEvents: [
      { id: "opening-from", at: "2026-09-24T00:00:00Z", date: "1405/07/03", kind: "opening_balance" as const, accountId: "from", amount: 1000, currency: "تومان", sourceType: "opening", note: "" },
      { id: "opening-to", at: "2026-09-24T00:00:00Z", date: "1405/07/03", kind: "opening_balance" as const, accountId: "to", amount: 0, currency: "تومان", sourceType: "opening", note: "" },
    ],
    transactions: [],
  };

  it("delivers the full principal and deducts the fee only from the source", () => {
    const previous = normalizeState(opening);
    const next = normalizeState({
      ...previous,
      accounts: previous.accounts.map(account => account.id === "from" ? { ...account, balance: 895 } : account.id === "to" ? { ...account, balance: 100 } : account),
      transactions: [{ id: "transfer-1", type: "انتقال بین حساب‌ها", date: "1405/07/03", fromAccountId: "from", toAccountId: "to", amount: 100, feeAmount: 5, feeSource: "دستی", status: "ثبت شده", note: "" }],
    });
    const reconciled = reconcileLedgerEvents(previous, next);
    expect(reconciled.cashEvents.filter(event => event.sourceId === "transfer-1").map(event => event.amount)).toContain(-100);
    expect(reconciled.cashEvents.find(event => event.sourceId === "transfer-1:fee")?.amount).toBe(-5);
    expect(rebuildCashProjection(reconciled).accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "from", balance: 895 }),
      expect.objectContaining({ id: "to", balance: 100 }),
    ]));
    expect(cashLedgerDiscrepancies(reconciled)).toEqual([]);
  });

  it("reverses the old fee event when an existing transfer fee is corrected", () => {
    const previous = normalizeState(opening);
    const first = normalizeState({
      ...previous,
      accounts: previous.accounts.map(account => account.id === "from" ? { ...account, balance: 895 } : account.id === "to" ? { ...account, balance: 100 } : account),
      transactions: [{ id: "transfer-1", type: "انتقال بین حساب‌ها", date: "1405/07/03", fromAccountId: "from", toAccountId: "to", amount: 100, feeAmount: 5, feeSource: "دستی", status: "ثبت شده", note: "" }],
    });
    const ledger = reconcileLedgerEvents(previous, first);
    const corrected = normalizeState({
      ...ledger,
      accounts: ledger.accounts.map(account => account.id === "from" ? { ...account, balance: 892 } : account),
      transactions: ledger.transactions.map(transaction => ({ ...transaction, feeAmount: 8 })),
    });
    const reconciled = reconcileLedgerEvents(ledger, corrected);
    expect(rebuildCashProjection(reconciled).accounts.find(account => account.id === "from")?.balance).toBe(892);
    expect(reconciled.cashEvents.filter(event => event.sourceId === "transfer-1:fee").reduce((sum, event) => sum + event.amount, 0)).toBe(-8);
    expect(cashLedgerDiscrepancies(reconciled)).toEqual([]);
  });
});

describe("fees across cash workflows", () => {
  it("records and reverses a purchase-payment fee without changing supplier principal", () => {
    const state = normalizeState({
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 1000 }],
      cashEvents: [{ id: "opening", at: "now", date: "1405/07/03", kind: "opening_balance", accountId: "bank", amount: 1000, currency: "تومان", sourceType: "opening", note: "" }],
      purchasePayments: [{ id: "p", supplierId: "s", amount: 100, feeAmount: 7, date: "1405/07/03", method: "نقدی", accountId: "bank", note: "" }],
    });
    const withEvents = appendPurchasePaymentCashEvents(state);
    expect(withEvents.cashEvents.find(event => event.sourceType === "purchase_payment_fee")?.amount).toBe(-7);
    expect(withEvents.accounts[0].balance).toBe(893);
    const released = releasePurchasePayment(withEvents, "p");
    expect(rebuildCashProjection(released).accounts[0].balance).toBe(1000);
  });

  it("records a check collection fee as a separate bank expense", () => {
    const previous = normalizeState({
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 0 }],
      checks: [{ id: "c", number: "C1", receivedDate: "1405/07/03", dueDate: "1405/07/30", amount: 100, feeAmount: 3, status: "نزد ما", bank: "" }],
    });
    const next = { ...previous, accounts: previous.accounts.map(account => ({ ...account, balance: 97 })), checks: previous.checks.map(check => ({ ...check, status: "وصول شده" as const, bankAccountId: "bank" })) };
    const reconciled = reconcileLedgerEvents(previous, next);
    expect(reconciled.cashEvents.find(event => event.sourceType === "check_fee")?.amount).toBe(-3);
    expect(rebuildCashProjection(reconciled).accounts[0].balance).toBe(97);
  });
});


describe("localized inputs and shared Jalali calendar", () => {
  it("parses Persian and Arabic digits with decimal and grouping separators", () => {
    expect(parseLocalizedNumber("۱۲۳٬۴۵۶٫۷۸")).toBeCloseTo(123456.78);
    expect(parseLocalizedNumber("-١٢٣٫٥")).toBeCloseTo(-123.5);
    expect(parseLocalizedNumber("۱٬۲۳۴٬۵۶۷")).toBe(1234567);
  });

  it("uses the shared Jalali month basis for leap-day boundaries", () => {
    expect(jalaliMonthDayBasis("1404/12/01")).toBe(29);
    expect(jalaliMonthDayBasis("1403/12/01")).toBe(30);
    expect(jalaliWeekday(1405, 1, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe("append-only reversal regressions", () => {
  it("reverses a cash event when its transaction is deleted", () => {
    const previous = normalizeState({
      transactions: [{ id: "t1", type: "دریافت", date: "1405/07/01", accountId: "bank", amount: 1000, status: "ثبت شده", note: "" }],
      accounts: [{ id: "bank", name: "بانک", type: "بانک", balance: 1000 }],
      cashEvents: [{ id: "cash-t1", at: "2026-09-23T00:00:00Z", date: "1405/07/01", kind: "receipt", accountId: "bank", amount: 1000, currency: "تومان", sourceType: "transaction", sourceId: "t1", note: "" }],
    });
    const next = reconcileLedgerEvents(previous, { ...previous, transactions: [] });
    expect(next.cashEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "reversal", reversalOf: "cash-t1", amount: -1000 }),
    ]));
  });

  it("reverses production events when a production run is removed", () => {
    const state = normalizeState({
      products: [
        { id: "output", code: "O", name: "محصول", unit: "عدد", stock: 0, minStock: 0, price: 10 },
        { id: "material", code: "M", name: "ماده", unit: "کیلوگرم", stock: 10, minStock: 0, price: 2 },
      ],
      productionFormulas: [{ id: "formula", name: "فرمول", formulaType: "قطعه", outputProductId: "output", outputQuantity: 1, outputUnit: "عدد", materials: [{ id: "line", productId: "material", quantity: 1, unit: "کیلوگرم" }], costs: [], note: "" }],
    });
    const produced = executeProduction(state, "formula", 1).state;
    const removed = removeProductionRun(produced, produced.productionRecords[0].id);
    expect(inventoryLedgerDiscrepancies(removed)).toEqual([]);
    expect(removed.inventoryEvents.filter(event => event.kind === "reversal")).toHaveLength(2);
  });

  it("reconciles legacy deltas for entities not covered by a simultaneous explicit event", () => {
    const previous = normalizeState({
      products: [
        { id: "p1", code: "P1", name: "یک", unit: "عدد", stock: 0, minStock: 0, price: 1 },
        { id: "p2", code: "P2", name: "دو", unit: "عدد", stock: 0, minStock: 0, price: 1 },
      ],
      accounts: [
        { id: "a1", name: "یک", type: "بانک", balance: 0 },
        { id: "a2", name: "دو", type: "بانک", balance: 0 },
      ],
    });
    const next = reconcileLedgerEvents(previous, {
      ...previous,
      products: previous.products.map(product => ({ ...product, stock: product.id === "p1" ? 1 : 2 })),
      accounts: previous.accounts.map(account => ({ ...account, balance: account.id === "a1" ? 10 : 20 })),
      inventoryEvents: [...previous.inventoryEvents, { id: "explicit-p1", at: "2026-09-25T00:00:00Z", date: "1405/07/03", kind: "adjustment", productId: "p1", quantityEntered: 1, unitEntered: "عدد", quantityBase: 1, baseUnit: "عدد", sourceType: "manual", note: "" }],
      cashEvents: [...previous.cashEvents, { id: "explicit-a1", at: "2026-09-25T00:00:00Z", date: "1405/07/03", kind: "adjustment", accountId: "a1", amount: 10, currency: "تومان", sourceType: "manual", note: "" }],
    });
    expect(next.inventoryEvents).toEqual(expect.arrayContaining([expect.objectContaining({ productId: "p2", quantityBase: 2, sourceType: "projection_reconciliation" })]));
    expect(next.cashEvents).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: "a2", amount: 20, sourceType: "projection_reconciliation" })]));
  });
});


describe("base-unit price contract", () => {
  it("calculates ten cartons at the base-unit price", () => {
    const product = priceUnitFixture.products[0];
    const line = calculateBaseUnitLine(product, 10, "کارتن", 300_000);
    expect(line).toMatchObject({
      quantity: 10,
      enteredUnit: "کارتن",
      baseUnit: "عدد",
      conversionRate: 36,
      quantityBase: 360,
      unitPrice: 300_000,
      priceBasis: "baseUnit",
      total: 108_000_000,
    });
  });

  it("calculates grams using the kilogram base price", () => {
    const product = priceUnitFixture.products[1];
    const line = calculateBaseUnitLine(product, 2500, "گرم", 180_000);
    expect(line.baseUnit).toBe("کیلوگرم");
    expect(line.quantityBase).toBeCloseTo(2.5);
    expect(line.total).toBeCloseTo(450_000);
  });

  it("preserves explicit price meaning on fixture invoice rows", () => {
    const state = normalizeState(priceUnitFixture);
    const sale = state.invoices.find(invoice => invoice.id === "fixture-invoice-sale");
    expect(sale?.items[0]).toMatchObject({
      baseUnit: "عدد",
      priceBasis: "baseUnit",
      conversionRate: 36,
      quantityBase: 360,
      total: 108_000_000,
    });
  });
});


describe("base-unit validation", () => {
  it("rejects an unknown unit instead of silently assuming factor one", () => {
    const product = priceUnitFixture.products[0];
    expect(() => calculateBaseUnitLine(product, 1, "واحد ناشناخته", 300_000)).toThrow(
      "واحد «واحد ناشناخته» برای کالا تعریف نشده است"
    );
  });
});


describe("localized quantity with base-unit pricing", () => {
  it("supports Persian quantity text after normalization", () => {
    const product = priceUnitFixture.products[0];
    const quantity = parseLocalizedNumber("۱۰");
    const line = calculateBaseUnitLine(product, quantity, "کارتن", 300_000);
    expect(line.quantityBase).toBe(360);
    expect(line.total).toBe(108_000_000);
  });
});
