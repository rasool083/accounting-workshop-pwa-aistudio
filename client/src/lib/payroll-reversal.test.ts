import { describe, it, expect } from "vitest";
import {
  AppState,
  reconcileLedgerEvents,
  rebuildCashProjection,
  createId,
  Account,
  PayrollRecord,
  Transaction,
} from "./accounting";

function createTestState(initialBankBalance = 1000): AppState {
  const bank: Account = {
    id: "bank-1",
    name: "بانک ملی",
    type: "بانک",
    balance: initialBankBalance,
  };

  return {
    accounts: [bank],
    transactions: [],
    cashEvents: [
      {
        id: "ce-opening",
        at: "2026-10-01T00:00:00.000Z",
        date: "1405/07/01",
        kind: "opening_balance",
        accountId: "bank-1",
        amount: initialBankBalance,
        currency: "تومان",
        sourceType: "opening_balance",
        note: "افتتاحیه",
      },
    ],
    products: [],
    inventoryEvents: [],
    invoices: [],
    checks: [],
    issuedChecks: [],
    people: [
      {
        id: "worker-1",
        code: "W01",
        name: "علی رضایی",
        type: "سایر",
        roles: ["کارگر"],
        phone: "0912",
        note: "",
        initialBalance: 0,
      },
    ],
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
}

describe("Payroll accounting tests (ثبت، پرداخت، ویرایش، ابطال)", () => {
  it("مثال ۱: ثبت حقوق پرداختنی هیچ اثری بر موجودی بانک ندارد", () => {
    const state = createTestState(1000);
    const payrollId = createId("payroll");
    const record: PayrollRecord = {
      id: payrollId,
      employeeName: "علی رضایی",
      personId: "worker-1",
      amount: 200,
      feeAmount: 0,
      period: "1405/07",
      date: "1405/07/10",
      status: "پرداختنی",
      note: "حقوق مهر",
    };

    const nextState: AppState = {
      ...state,
      payrollRecords: [record, ...state.payrollRecords],
    };

    const reconciled = reconcileLedgerEvents(state, nextState);
    const finalState = rebuildCashProjection(reconciled);

    expect(finalState.accounts[0].balance).toBe(1000); // بدون تغییر
  });

  it("مثال ۲: پرداخت حقوق ۲۰۰ تومان دقیقاً ۲۰۰ تومان از حساب کسر می‌کند", () => {
    const state = createTestState(1000);
    const payrollId = createId("payroll");
    const txId = createId("payroll-payment");
    const record: PayrollRecord = {
      id: payrollId,
      employeeName: "علی رضایی",
      personId: "worker-1",
      amount: 200,
      feeAmount: 0,
      period: "1405/07",
      date: "1405/07/10",
      status: "پرداخت‌شده",
      accountId: "bank-1",
      transactionId: txId,
      paidAt: "1405/07/10",
      note: "پرداخت حقوق مهر",
    };
    const transaction: Transaction = {
      id: txId,
      type: "پرداخت حقوق",
      date: "1405/07/10",
      accountId: "bank-1",
      referenceType: "هزینه",
      referenceId: payrollId,
      referenceLabel: "حقوق علی رضایی",
      amount: 200,
      feeAmount: 0,
      status: "ثبت شده",
      note: "پرداخت حقوق علی رضایی",
    };

    // Route: Payroll Transaction -> reconcileLedgerEvents -> Cash Event -> rebuildCashProjection
    // No manual accounts.balance mutation!
    const nextState: AppState = {
      ...state,
      payrollRecords: [record, ...state.payrollRecords],
      transactions: [transaction, ...state.transactions],
    };

    const reconciled = reconcileLedgerEvents(state, nextState);
    const finalState = rebuildCashProjection(reconciled);

    expect(finalState.accounts[0].balance).toBe(800); // 1000 - 200 = 800
  });

  it("مثال ۳: پرداخت حقوق ۲۰۰ با کارمزد ۵ تومان دقیقاً ۲۰۵ تومان کسر می‌کند", () => {
    const state = createTestState(1000);
    const payrollId = createId("payroll");
    const txId = createId("payroll-payment");
    const record: PayrollRecord = {
      id: payrollId,
      employeeName: "علی رضایی",
      personId: "worker-1",
      amount: 200,
      feeAmount: 5,
      period: "1405/07",
      date: "1405/07/10",
      status: "پرداخت‌شده",
      accountId: "bank-1",
      transactionId: txId,
      paidAt: "1405/07/10",
      note: "پرداخت حقوق مهر با کارمزد",
    };
    const transaction: Transaction = {
      id: txId,
      type: "پرداخت حقوق",
      date: "1405/07/10",
      accountId: "bank-1",
      referenceType: "هزینه",
      referenceId: payrollId,
      referenceLabel: "حقوق علی رضایی",
      amount: 200,
      feeAmount: 5,
      status: "ثبت شده",
      note: "پرداخت حقوق علی رضایی",
    };

    const nextState: AppState = {
      ...state,
      payrollRecords: [record, ...state.payrollRecords],
      transactions: [transaction, ...state.transactions],
    };

    const reconciled = reconcileLedgerEvents(state, nextState);
    const finalState = rebuildCashProjection(reconciled);

    expect(finalState.accounts[0].balance).toBe(795); // 1000 - 200 - 5 = 795
  });

  it("مثال ۴: ابطال حقوق دقیقاً اثر قبلی را برمی‌گرداند بدون خطای چندبرابری", () => {
    const state = createTestState(1000);
    const payrollId = createId("payroll");
    const txId = createId("payroll-payment");
    const record: PayrollRecord = {
      id: payrollId,
      employeeName: "علی رضایی",
      personId: "worker-1",
      amount: 150,
      feeAmount: 7,
      period: "1405/07",
      date: "1405/07/10",
      status: "پرداخت‌شده",
      accountId: "bank-1",
      transactionId: txId,
      paidAt: "1405/07/10",
      note: "پرداخت حقوق",
    };
    const transaction: Transaction = {
      id: txId,
      type: "پرداخت حقوق",
      date: "1405/07/10",
      accountId: "bank-1",
      referenceType: "هزینه",
      referenceId: payrollId,
      referenceLabel: "حقوق علی رضایی",
      amount: 150,
      feeAmount: 7,
      status: "ثبت شده",
      note: "پرداخت حقوق علی رضایی",
    };

    // Step 1: Pay
    const paidState = rebuildCashProjection(
      reconcileLedgerEvents(state, {
        ...state,
        payrollRecords: [record, ...state.payrollRecords],
        transactions: [transaction, ...state.transactions],
      })
    );
    expect(paidState.accounts[0].balance).toBe(843); // 1000 - 150 - 7 = 843

    // Step 2: Void
    const voidState = rebuildCashProjection(
      reconcileLedgerEvents(paidState, {
        ...paidState,
        payrollRecords: paidState.payrollRecords.map(r =>
          r.id === payrollId ? { ...r, status: "باطل" } : r
        ),
        transactions: paidState.transactions.map(t =>
          t.id === txId ? { ...t, status: "باطل" } : t
        ),
      })
    );

    expect(voidState.accounts[0].balance).toBe(1000); // برگشت دقیق به ۱۰۰۰
  });

  it("مثال ۵: ویرایش مبلغ و کارمزد حقوق از ۲۰۰+۵ به ۳۰۰+۱۰ مانده را به ۶۹۰ می‌رساند", () => {
    const state = createTestState(1000);
    const payrollId = createId("payroll");
    const txId = createId("payroll-payment");

    // Pay 200 + 5
    const record: PayrollRecord = {
      id: payrollId,
      employeeName: "علی رضایی",
      personId: "worker-1",
      amount: 200,
      feeAmount: 5,
      period: "1405/07",
      date: "1405/07/10",
      status: "پرداخت‌شده",
      accountId: "bank-1",
      transactionId: txId,
      paidAt: "1405/07/10",
      note: "پرداخت اولیه",
    };
    const transaction: Transaction = {
      id: txId,
      type: "پرداخت حقوق",
      date: "1405/07/10",
      accountId: "bank-1",
      amount: 200,
      feeAmount: 5,
      status: "ثبت شده",
      note: "پرداخت اولیه",
    };

    const paidState = rebuildCashProjection(
      reconcileLedgerEvents(state, {
        ...state,
        payrollRecords: [record],
        transactions: [transaction],
      })
    );
    expect(paidState.accounts[0].balance).toBe(795);

    // Edit to 300 + 10
    const editedRecord: PayrollRecord = {
      ...record,
      amount: 300,
      feeAmount: 10,
    };
    const editedTransaction: Transaction = {
      ...transaction,
      amount: 300,
      feeAmount: 10,
    };

    const editedState = rebuildCashProjection(
      reconcileLedgerEvents(paidState, {
        ...paidState,
        payrollRecords: [editedRecord],
        transactions: [editedTransaction],
      })
    );

    // 1000 - 300 - 10 = 690!
    expect(editedState.accounts[0].balance).toBe(690);
  });
});
