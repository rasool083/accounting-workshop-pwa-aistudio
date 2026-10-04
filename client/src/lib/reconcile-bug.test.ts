import { describe, it, expect } from "vitest";
import {
  AppState,
  reconcileLedgerEvents,
  rebuildCashProjection,
  createId,
  Account,
  Transaction,
} from "./accounting";
import { deleteTransactionAndRevert } from "./ledgerMutations";

describe("reconcileLedgerEvents transaction deletion", () => {
  it("reverts exactly 60,000,000 when a 60,000,000 payment transaction is deleted", () => {
    const account: Account = {
      id: "box1",
      name: "صندوق قرض‌الحسنه ابوالفضل",
      type: "صندوق",
      balance: 100000000,
    };

    const initialCashEvent = {
      id: "ce-opening",
      at: "2026-10-01T00:00:00.000Z",
      date: "1405/07/01",
      kind: "opening_balance" as const,
      accountId: "box1",
      amount: 100000000,
      currency: "تومان",
      sourceType: "opening_balance",
      note: "افتتاحیه",
    };

    let state: AppState = {
      accounts: [account],
      transactions: [],
      cashEvents: [initialCashEvent],
      products: [],
      inventoryEvents: [],
      invoices: [],
      checks: [],
      issuedChecks: [],
      people: [],
      warehouses: [],
      settings: {
        currency: "تومان",
        dayBasis: 30,
        monthlyInterestRate: 0,
        companyName: "کارگاه",
      } as any,
      productionFormulas: [],
      productionRecords: [],
      audit: [],
      paymentRules: [],
      checkGroupAllocations: [],
      partnerObligationEvents: [],
    };

    // User adds a 60,000,000 payment transaction
    const tx: Transaction = {
      id: "tx-60m",
      type: "پرداخت",
      date: "1405/07/02",
      accountId: "box1",
      amount: 60000000,
      status: "ثبت شده",
      note: "تراکنش اشتباه",
    };

    // Simulate adding tx through normal reconcile
    const stateWithTx: AppState = {
      ...state,
      accounts: [{ ...account, balance: 40000000 }],
      transactions: [tx],
    };
    const reconciledAfterAdd = reconcileLedgerEvents(state, stateWithTx);
    const projectedAfterAdd = rebuildCashProjection(reconciledAfterAdd);

    expect(projectedAfterAdd.accounts[0].balance).toBe(40000000);

    // Now user deletes the 60,000,000 transaction!
    const deleteResult = deleteTransactionAndRevert(projectedAfterAdd, "tx-60m");

    // Commit state like Home.tsx commitState does:
    const reconciledAfterDelete = reconcileLedgerEvents(projectedAfterAdd, deleteResult.nextState);
    const finalState = rebuildCashProjection(reconciledAfterDelete);

    console.log("FINAL BALANCE AFTER DELETING 60M:", finalState.accounts[0].balance);
    console.log("CASH EVENTS AFTER DELETE:", reconciledAfterDelete.cashEvents);

    // Balance should be exactly 100,000,000!
    expect(finalState.accounts[0].balance).toBe(100000000);
  });

  it("reverts exactly 60,000,000 when a transfer of 60,000,000 is deleted", () => {
    const box: Account = {
      id: "box1",
      name: "صندوق قرض‌الحسنه ابوالفضل",
      type: "صندوق",
      balance: 100000000,
    };
    const bank: Account = {
      id: "bank1",
      name: "بانک ملی",
      type: "بانک",
      balance: 50000000,
    };

    let state: AppState = {
      accounts: [box, bank],
      transactions: [],
      cashEvents: [
        {
          id: "ce-box-opening",
          at: "2026-10-01T00:00:00.000Z",
          date: "1405/07/01",
          kind: "opening_balance" as const,
          accountId: "box1",
          amount: 100000000,
          currency: "تومان",
          sourceType: "opening_balance",
          note: "افتتاحیه صندوق",
        },
        {
          id: "ce-bank-opening",
          at: "2026-10-01T00:00:00.000Z",
          date: "1405/07/01",
          kind: "opening_balance" as const,
          accountId: "bank1",
          amount: 50000000,
          currency: "تومان",
          sourceType: "opening_balance",
          note: "افتتاحیه بانک",
        },
      ],
      products: [],
      inventoryEvents: [],
      invoices: [],
      checks: [],
      issuedChecks: [],
      people: [],
      warehouses: [],
      settings: {
        currency: "تومان",
        dayBasis: 30,
        monthlyInterestRate: 0,
        companyName: "کارگاه",
      } as any,
      productionFormulas: [],
      productionRecords: [],
      audit: [],
      paymentRules: [],
      checkGroupAllocations: [],
      partnerObligationEvents: [],
    };

    // User transfers 60,000,000 from box1 to bank1
    const tx: Transaction = {
      id: "tx-transfer-60m",
      type: "انتقال بین حساب‌ها",
      date: "1405/07/02",
      fromAccountId: "box1",
      toAccountId: "bank1",
      amount: 60000000,
      status: "ثبت شده",
      note: "انتقال وجه اشتباه",
    };

    const stateWithTransfer: AppState = {
      ...state,
      accounts: [
        { ...box, balance: 40000000 },
        { ...bank, balance: 110000000 },
      ],
      transactions: [tx],
    };
    const reconciledAfterAdd = reconcileLedgerEvents(state, stateWithTransfer);
    const projectedAfterAdd = rebuildCashProjection(reconciledAfterAdd);

    expect(projectedAfterAdd.accounts.find(a => a.id === "box1")?.balance).toBe(40000000);
    expect(projectedAfterAdd.accounts.find(a => a.id === "bank1")?.balance).toBe(110000000);

    // Delete the transfer
    const deleteResult = deleteTransactionAndRevert(projectedAfterAdd, "tx-transfer-60m");
    const reconciledAfterDelete = reconcileLedgerEvents(projectedAfterAdd, deleteResult.nextState);
    const finalState = rebuildCashProjection(reconciledAfterDelete);

    expect(finalState.accounts.find(a => a.id === "box1")?.balance).toBe(100000000);
    expect(finalState.accounts.find(a => a.id === "bank1")?.balance).toBe(50000000);
  });

  it("ثبت دو تراکنش ۶۰،۰۰۰،۰۰۰ تومانی، حذف یکی از آن‌ها و بازگشت دقیق ۶۰،۰۰۰،۰۰۰ تومان بدون خطای ۱۷۹،۰۰۰،۰۰۰", () => {
    const box: Account = {
      id: "box-main",
      name: "صندوق کارگاه",
      type: "صندوق",
      balance: 200000000,
    };

    let state: AppState = {
      accounts: [box],
      transactions: [],
      cashEvents: [
        {
          id: "ce-opening-box",
          at: "2026-10-01T00:00:00.000Z",
          date: "1405/07/01",
          kind: "opening_balance",
          accountId: "box-main",
          amount: 200000000,
          currency: "تومان",
          sourceType: "opening_balance",
          note: "افتتاحیه صندوق",
        },
      ],
      products: [],
      inventoryEvents: [],
      invoices: [],
      checks: [],
      issuedChecks: [],
      people: [],
      warehouses: [],
      payrollRecords: [],
      settings: {
        currency: "تومان",
        dayBasis: 30,
        monthlyInterestRate: 0,
        companyName: "کارگاه",
      } as any,
      productionFormulas: [],
      productionRecords: [],
      audit: [],
      paymentRules: [],
      checkGroupAllocations: [],
      partnerObligationEvents: [],
    };

    // User adds TWO 60,000,000 transactions by mistake
    const tx1: Transaction = {
      id: "tx-60m-1",
      type: "پرداخت",
      date: "1405/07/05",
      accountId: "box-main",
      amount: 60000000,
      status: "ثبت شده",
      note: "تراکنش اشتباه اول ۶۰ میلیونی",
    };
    const tx2: Transaction = {
      id: "tx-60m-2",
      type: "پرداخت",
      date: "1405/07/05",
      accountId: "box-main",
      amount: 60000000,
      status: "ثبت شده",
      note: "تراکنش اشتباه دوم ۶۰ میلیونی",
    };

    const stateWithTwoTx: AppState = {
      ...state,
      transactions: [tx1, tx2],
    };
    const rec1 = reconcileLedgerEvents(state, stateWithTwoTx);
    const proj1 = rebuildCashProjection(rec1);

    // Initial 200M - 60M - 60M = 80M
    expect(proj1.accounts[0].balance).toBe(80000000);

    // User deletes the first 60,000,000 transaction:
    const del1 = deleteTransactionAndRevert(proj1, "tx-60m-1");
    const recAfterDel1 = reconcileLedgerEvents(proj1, del1.nextState);
    const projAfterDel1 = rebuildCashProjection(recAfterDel1);

    // Balance MUST return exactly 60,000,000 -> 80M + 60M = 140,000,000 (NOT 179,000,000!)
    expect(projAfterDel1.accounts[0].balance).toBe(140000000);

    // Verify a reversal event was recorded so user sees the deletion record in the ledger
    const reversalEvents = recAfterDel1.cashEvents.filter(e => e.kind === "reversal");
    expect(reversalEvents.length).toBeGreaterThanOrEqual(1);
    expect(reversalEvents.some(e => e.amount === 60000000)).toBe(true);

    // Now delete the second 60,000,000 transaction:
    const del2 = deleteTransactionAndRevert(projAfterDel1, "tx-60m-2");
    const recAfterDel2 = reconcileLedgerEvents(projAfterDel1, del2.nextState);
    const projAfterDel2 = rebuildCashProjection(recAfterDel2);

    // Balance returns to exact 200,000,000
    expect(projAfterDel2.accounts[0].balance).toBe(200000000);
  });
});
