import {
  AppState,
  Transaction,
  Invoice,
  InvoiceItem,
  Check,
  CashEvent,
  Account,
  Product,
  rebuildCheckAllocations,
  releasePurchasePaymentsForInvoice,
  calculateInvoiceAmount,
  calculateBaseUnitLine,
  formatMoney,
  createId,
} from "./accounting";

/**
 * Applies or reverses the account balance changes caused by a transaction.
 * Multiplier = 1 applies the effect; Multiplier = -1 reverses it.
 */
export function applyAccountEffect(
  accounts: Account[],
  transaction: Transaction,
  multiplier: 1 | -1
): Account[] {
  const totalTransferOutflow =
    transaction.amount +
    (transaction.type === "انتقال بین حساب‌ها"
      ? Math.max(0, transaction.feeAmount || 0)
      : 0);

  return accounts.map(account => {
    if (transaction.fromAccountId === account.id) {
      return {
        ...account,
        balance: account.balance - totalTransferOutflow * multiplier,
      };
    }
    if (transaction.toAccountId === account.id) {
      return {
        ...account,
        balance: account.balance + transaction.amount * multiplier,
      };
    }
    if (transaction.accountId === account.id && transaction.partnerEffect) {
      const delta =
        transaction.partnerEffect === "افزایش طلب شریک" ||
        transaction.partnerEffect === "افزایش طلب کارگاه از شریک"
          ? transaction.amount
          : -transaction.amount;
      return { ...account, balance: account.balance + delta * multiplier };
    }
    if (
      transaction.accountId === account.id &&
      !transaction.partnerEffect &&
      transaction.type !== "انتقال بین حساب‌ها"
    ) {
      // Direct deposit or withdrawal
      const isDeposit =
        transaction.type === "دریافت" ||
        transaction.type === "درآمد" ||
        transaction.type === "فروش" ||
        transaction.type === "فروش کالا" ||
        transaction.type === "دریافت تسویه از شریک";
      const delta = isDeposit ? transaction.amount : -transaction.amount;
      return { ...account, balance: account.balance + delta * multiplier };
    }
    return account;
  });
}

/**
 * Applies or reverses inventory stock changes caused by a stock operation.
 * Multiplier = 1 applies; Multiplier = -1 reverses.
 */
export function applyProductEffect(
  products: Product[],
  transaction: Transaction,
  multiplier: 1 | -1
): Product[] {
  if (!transaction.productId || !transaction.quantity) return products;
  const direction = transaction.type === "خرید کالا" ? 1 : -1;
  return products.map(product =>
    product.id === transaction.productId
      ? {
          ...product,
          stock:
            product.stock + direction * transaction.quantity! * multiplier,
        }
      : product
  );
}

// ============================================================================
// TRANSACTION MUTATIONS
// ============================================================================

export function deleteTransactionAndRevert(
  state: AppState,
  transactionId: string
): { nextState: AppState; message: string } {
  const tx = state.transactions.find(t => t.id === transactionId);
  if (!tx) return { nextState: state, message: "تراکنش یافت نشد" };

  const nextAccounts = applyAccountEffect(state.accounts, tx, -1);
  const nextProducts = applyProductEffect(state.products, tx, -1);

  // If this transaction was linked to any payroll record, revert it to payable cleanly
  const nextPayrollRecords = (state.payrollRecords || []).map(pr => {
    if (pr.transactionId === transactionId) {
      return {
        ...pr,
        status: "پرداختنی" as const,
        transactionId: undefined,
        paidAt: undefined,
      };
    }
    return pr;
  });

  const nextState: AppState = {
    ...state,
    accounts: nextAccounts,
    products: nextProducts,
    payrollRecords: nextPayrollRecords,
    transactions: state.transactions.filter(t => t.id !== transactionId),
  };

  return {
    nextState,
    message: `تراکنش «${tx.type}» حذف شد و اثر مالی آن بر حساب‌ها و موجودی بازگردانده شد.`,
  };
}

export function editTransactionAndRevert(
  state: AppState,
  transactionId: string,
  updatedFields: Partial<Transaction>
): { nextState: AppState; message: string } {
  const oldTx = state.transactions.find(t => t.id === transactionId);
  if (!oldTx) return { nextState: state, message: "تراکنش یافت نشد" };

  // 1. Revert old transaction effect
  const accountsWithoutOld = applyAccountEffect(state.accounts, oldTx, -1);
  const productsWithoutOld = applyProductEffect(state.products, oldTx, -1);

  // 2. Build new transaction
  const newTx: Transaction = {
    ...oldTx,
    ...updatedFields,
  };

  // 3. Apply new transaction effect
  const nextAccounts = applyAccountEffect(accountsWithoutOld, newTx, 1);
  const nextProducts = applyProductEffect(productsWithoutOld, newTx, 1);

  // 4. Update linked payroll record if exists
  const nextPayrollRecords = (state.payrollRecords || []).map(pr => {
    if (pr.transactionId === transactionId) {
      return {
        ...pr,
        amount: newTx.amount,
        feeAmount: newTx.feeAmount || 0,
        date: newTx.date,
        paidAt: newTx.date,
        accountId: newTx.accountId,
      };
    }
    return pr;
  });

  const nextState: AppState = {
    ...state,
    accounts: nextAccounts,
    products: nextProducts,
    payrollRecords: nextPayrollRecords,
    transactions: state.transactions.map(t =>
      t.id === transactionId ? newTx : t
    ),
  };

  return {
    nextState,
    message: `تراکنش «${newTx.type}» اصلاح شد و مانده حساب‌ها به‌روزرسانی گردید.`,
  };
}

// ============================================================================
// INVOICE & INVOICE ITEMS MUTATIONS
// ============================================================================

export function deleteInvoiceAndRevert(
  state: AppState,
  invoiceId: string
): { nextState: AppState; message: string } {
  const invoice = state.invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return { nextState: state, message: "فاکتور یافت نشد" };

  // 1. Revert product stocks for all items
  const products =
    invoice.status === "باطل"
      ? state.products
      : state.products.map(product => {
          const movement = invoice.items
            .filter(item => item.productId === product.id)
            .reduce(
              (sum, item) => sum + (item.quantityBase ?? item.quantity),
              0
            );
          return {
            ...product,
            stock:
              product.stock +
              (invoice.type === "فروش" ? movement : -movement),
          };
        });

  // 2. Release purchase payments if purchase invoice
  const released =
    invoice.type === "خرید"
      ? releasePurchasePaymentsForInvoice(state, invoice.id)
      : state;

  // 3. Remove invoice and rebuild check allocations
  const nextState = rebuildCheckAllocations({
    ...released,
    products,
    invoices: released.invoices.filter(item => item.id !== invoiceId),
    checkGroupAllocations: (state.checkGroupAllocations || []).map(group => ({
      ...group,
      invoiceIds: group.invoiceIds.filter(id => id !== invoiceId),
    })),
  });

  return {
    nextState,
    message: `فاکتور شماره ${invoice.number} حذف شد و کالاهای آن به انبار بازگشت داده شدند.`,
  };
}

export function editInvoiceAndRevert(
  state: AppState,
  invoiceId: string,
  updatedFields: Partial<Invoice>
): { nextState: AppState; message: string } {
  const invoice = state.invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return { nextState: state, message: "فاکتور یافت نشد" };

  const updatedInvoice: Invoice = {
    ...invoice,
    ...updatedFields,
  };

  // Recalculate amount if discount or items changed
  const subtotal = (updatedInvoice.items || []).reduce(
    (sum, item) => sum + (Number(item.total) || 0),
    0
  );
  updatedInvoice.amount = calculateInvoiceAmount(
    subtotal,
    updatedInvoice.discountAmount || 0
  );

  const nextState = rebuildCheckAllocations({
    ...state,
    invoices: state.invoices.map(inv =>
      inv.id === invoiceId ? updatedInvoice : inv
    ),
  });

  return {
    nextState,
    message: `مشخصات فاکتور شماره ${updatedInvoice.number} به‌روزرسانی شد.`,
  };
}

export function deleteInvoiceItemAndRevert(
  state: AppState,
  invoiceId: string,
  itemIndex: number
): { nextState: AppState; message: string } {
  const invoice = state.invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return { nextState: state, message: "فاکتور یافت نشد" };

  const targetItem = invoice.items[itemIndex];
  if (!targetItem) return { nextState: state, message: "قلم مورد نظر یافت نشد" };

  // Revert stock of target item
  const movement = targetItem.quantityBase ?? targetItem.quantity;
  const products = targetItem.productId
    ? state.products.map(p =>
        p.id === targetItem.productId
          ? {
              ...p,
              stock:
                p.stock + (invoice.type === "فروش" ? movement : -movement),
            }
          : p
      )
    : state.products;

  const nextItems = invoice.items.filter((_, idx) => idx !== itemIndex);
  const subtotal = nextItems.reduce(
    (sum, item) => sum + (Number(item.total) || 0),
    0
  );
  const amount = calculateInvoiceAmount(
    subtotal,
    invoice.discountAmount || 0
  );

  const updatedInvoice: Invoice = {
    ...invoice,
    items: nextItems,
    amount,
  };

  const nextState = rebuildCheckAllocations({
    ...state,
    products,
    invoices: state.invoices.map(inv =>
      inv.id === invoiceId ? updatedInvoice : inv
    ),
  });

  return {
    nextState,
    message: `قلم «${targetItem.description}» حذف شد و اثر موجودی آن در انبار اعمال گردید.`,
  };
}

export function editInvoiceItemAndRevert(
  state: AppState,
  invoiceId: string,
  itemIndex: number,
  updatedValues: {
    quantity: number;
    unitPrice: number;
    unit?: string;
    description?: string;
  }
): { nextState: AppState; message: string } {
  const invoice = state.invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return { nextState: state, message: "فاکتور یافت نشد" };

  const oldItem = invoice.items[itemIndex];
  if (!oldItem) return { nextState: state, message: "قلم مورد نظر یافت نشد" };

  const product = oldItem.productId
    ? state.products.find(p => p.id === oldItem.productId)
    : undefined;

  const quantity = updatedValues.quantity;
  const unitPrice = updatedValues.unitPrice;
  const unit = updatedValues.unit || oldItem.unit || product?.unit || "عدد";

  const line = product
    ? calculateBaseUnitLine(product, quantity, unit, unitPrice)
    : {
        quantity,
        unit,
        unitPrice,
        total: quantity * unitPrice,
        quantityBase: quantity,
        conversionRate: 1,
        baseUnit: unit,
      };

  const newItem: InvoiceItem = {
    ...oldItem,
    description: updatedValues.description || oldItem.description,
    quantity,
    unit,
    unitPrice,
    total: line.total,
    quantityBase: line.quantityBase,
    conversionRate: line.conversionRate,
    baseUnit: line.baseUnit,
  };

  // Calculate delta stock movement
  const oldBaseQty = oldItem.quantityBase ?? oldItem.quantity;
  const newBaseQty = newItem.quantityBase ?? newItem.quantity;
  const delta = newBaseQty - oldBaseQty;

  const products = product
    ? state.products.map(p =>
        p.id === product.id
          ? {
              ...p,
              stock:
                p.stock + (invoice.type === "فروش" ? -delta : delta),
            }
          : p
      )
    : state.products;

  const nextItems = invoice.items.map((item, idx) =>
    idx === itemIndex ? newItem : item
  );
  const subtotal = nextItems.reduce(
    (sum, item) => sum + (Number(item.total) || 0),
    0
  );
  const amount = calculateInvoiceAmount(
    subtotal,
    invoice.discountAmount || 0
  );

  const updatedInvoice: Invoice = {
    ...invoice,
    items: nextItems,
    amount,
  };

  const nextState = rebuildCheckAllocations({
    ...state,
    products,
    invoices: state.invoices.map(inv =>
      inv.id === invoiceId ? updatedInvoice : inv
    ),
  });

  return {
    nextState,
    message: `قلم «${newItem.description}» اصلاح شد؛ موجودی انبار و سرجمع فاکتور به‌روز شد.`,
  };
}

export function addInvoiceItemAndApply(
  state: AppState,
  invoiceId: string,
  values: {
    productId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
  }
): { nextState: AppState; message: string } {
  const invoice = state.invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return { nextState: state, message: "فاکتور یافت نشد" };

  const product = values.productId
    ? state.products.find(p => p.id === values.productId)
    : undefined;

  const quantity = values.quantity;
  const unitPrice = values.unitPrice;
  const unit = values.unit || product?.unit || "عدد";

  const line = product
    ? calculateBaseUnitLine(product, quantity, unit, unitPrice)
    : {
        quantity,
        unit,
        unitPrice,
        total: quantity * unitPrice,
        quantityBase: quantity,
        conversionRate: 1,
        baseUnit: unit,
      };

  const newItem: InvoiceItem = {
    id: createId("inv-item"),
    productId: values.productId,
    description: values.description || product?.name || "کالای بدون عنوان",
    quantity,
    unit,
    unitPrice,
    total: line.total,
    quantityBase: line.quantityBase,
    conversionRate: line.conversionRate,
    baseUnit: line.baseUnit,
    unitCostAtSale: (product as any)?.unitCost ?? product?.price,
  };

  // Adjust stock
  const products = product
    ? state.products.map(p =>
        p.id === product.id
          ? {
              ...p,
              stock:
                p.stock +
                (invoice.type === "فروش"
                  ? -line.quantityBase
                  : line.quantityBase),
            }
          : p
      )
    : state.products;

  const nextItems = [...(invoice.items || []), newItem];
  const subtotal = nextItems.reduce(
    (sum, item) => sum + (Number(item.total) || 0),
    0
  );
  const amount = calculateInvoiceAmount(
    subtotal,
    invoice.discountAmount || 0
  );

  const updatedInvoice: Invoice = {
    ...invoice,
    items: nextItems,
    amount,
  };

  const nextState = rebuildCheckAllocations({
    ...state,
    products,
    invoices: state.invoices.map(inv =>
      inv.id === invoiceId ? updatedInvoice : inv
    ),
  });

  return {
    nextState,
    message: `قلم جدید به فاکتور افزوده شد و موجودی انبار ثبت گردید.`,
  };
}

// ============================================================================
// CHECK MUTATIONS
// ============================================================================

export function deleteCheckAndRevert(
  state: AppState,
  checkId: string
): { nextState: AppState; message: string } {
  const check = state.checks.find(c => c.id === checkId);
  if (!check) return { nextState: state, message: "چک یافت نشد" };

  // If check was cashed into a bank account, revert the bank balance!
  let nextAccounts = state.accounts;
  if (check.status === "وصول شده" && check.bankAccountId) {
    nextAccounts = state.accounts.map(acc => {
      if (acc.id === check.bankAccountId) {
        // If received check was cashed: credit was added, so subtract it
        return { ...acc, balance: acc.balance - check.amount };
      }
      return acc;
    });
  }

  // Remove linked transactions created automatically for this check
  const nextTransactions = state.transactions.filter(
    tx =>
      !tx.note?.includes(`__check:${check.id}`) &&
      tx.checkId !== check.id
  );

  // Remove check and clean replacements
  const nextChecks = state.checks
    .filter(item => item.id !== check.id)
    .map(item => ({
      ...item,
      replacementIds: item.replacementIds?.filter(id => id !== check.id),
    }));

  // Clean from checkGroupAllocations
  const nextGroups = (state.checkGroupAllocations || []).map(group => ({
    ...group,
    checkIds: group.checkIds.filter(id => id !== check.id),
  }));

  const nextState = rebuildCheckAllocations({
    ...state,
    accounts: nextAccounts,
    transactions: nextTransactions,
    checks: nextChecks,
    checkGroupAllocations: nextGroups,
  });

  return {
    nextState,
    message: `چک شماره ${check.number} حذف شد و تمام آثار مالی و تسویه‌های آن برگشت داده شد.`,
  };
}

export function editCheckAndRevert(
  state: AppState,
  checkId: string,
  updatedFields: Partial<Check>
): { nextState: AppState; message: string } {
  const oldCheck = state.checks.find(c => c.id === checkId);
  if (!oldCheck) return { nextState: state, message: "چک یافت نشد" };

  const newCheck: Check = {
    ...oldCheck,
    ...updatedFields,
  };

  // Reconcile bank account impact if status or amount or bankAccountId changed
  let nextAccounts = state.accounts;
  const wasCashed = oldCheck.status === "وصول شده" && oldCheck.bankAccountId;
  const isCashed = newCheck.status === "وصول شده" && newCheck.bankAccountId;

  if (wasCashed && !isCashed) {
    // Check un-cashed: deduct from old account
    nextAccounts = nextAccounts.map(acc =>
      acc.id === oldCheck.bankAccountId
        ? { ...acc, balance: acc.balance - oldCheck.amount }
        : acc
    );
  } else if (!wasCashed && isCashed) {
    // Check now cashed: add to new account
    nextAccounts = nextAccounts.map(acc =>
      acc.id === newCheck.bankAccountId
        ? { ...acc, balance: acc.balance + newCheck.amount }
        : acc
    );
  } else if (wasCashed && isCashed) {
    // Was cashed and remains cashed, but amount or account might have changed
    if (oldCheck.bankAccountId === newCheck.bankAccountId) {
      const diff = newCheck.amount - oldCheck.amount;
      nextAccounts = nextAccounts.map(acc =>
        acc.id === newCheck.bankAccountId
          ? { ...acc, balance: acc.balance + diff }
          : acc
      );
    } else {
      nextAccounts = nextAccounts.map(acc => {
        if (acc.id === oldCheck.bankAccountId) {
          return { ...acc, balance: acc.balance - oldCheck.amount };
        }
        if (acc.id === newCheck.bankAccountId) {
          return { ...acc, balance: acc.balance + newCheck.amount };
        }
        return acc;
      });
    }
  }

  const nextChecks = state.checks.map(c => (c.id === checkId ? newCheck : c));

  const nextState = rebuildCheckAllocations({
    ...state,
    accounts: nextAccounts,
    checks: nextChecks,
  });

  return {
    nextState,
    message: `مشخصات چک شماره ${newCheck.number} اصلاح شد و وضعیت تسویه‌ها و مانده بانک به‌روزرسانی گردید.`,
  };
}

// ============================================================================
// CASH EVENT / ADJUSTMENT MUTATIONS
// ============================================================================

export function deleteCashEventAndRevert(
  state: AppState,
  eventId: string
): { nextState: AppState; message: string } {
  const cleanId = eventId.replace(/^cash-event-/, "");
  const event = state.cashEvents.find(e => e.id === cleanId || e.id === eventId);
  if (!event) {
    // If not found in cashEvents, check if it was a transaction id
    const txId = eventId.replace(/^tx-/, "").replace(/-(in|out)$/, "");
    if (state.transactions.some(t => t.id === txId)) {
      return deleteTransactionAndRevert(state, txId);
    }
    return { nextState: state, message: "رویداد نقدینگی یافت نشد" };
  }

  // If this cash event is linked to a transaction, delegate directly to deleteTransactionAndRevert
  if (event.sourceId && state.transactions.some(t => t.id === event.sourceId)) {
    return deleteTransactionAndRevert(state, event.sourceId);
  }

  // Standalone cash event (e.g. manual adjustment, opening balance, or unlinked cash event)
  const nextAccounts = state.accounts.map(acc => {
    if (acc.id === event.accountId) {
      return { ...acc, balance: acc.balance - event.amount };
    }
    return acc;
  });

  const nextState: AppState = {
    ...state,
    accounts: nextAccounts,
    cashEvents: state.cashEvents.filter(e => e.id !== event.id),
  };

  return {
    nextState,
    message: `سند گردش نقدینگی حذف شد و مانده حساب به مقدار اولیه برگشت داده شد.`,
  };
}

export function editCashEventAndRevert(
  state: AppState,
  eventId: string,
  updatedFields: { amount?: number; note?: string; date?: string }
): { nextState: AppState; message: string } {
  const cleanId = eventId.replace(/^cash-event-/, "");
  const oldEvent = state.cashEvents.find(e => e.id === cleanId || e.id === eventId);
  if (!oldEvent) return { nextState: state, message: "رویداد نقدینگی یافت نشد" };

  const newAmount =
    updatedFields.amount !== undefined ? updatedFields.amount : oldEvent.amount;
  const diff = newAmount - oldEvent.amount;

  const nextAccounts = state.accounts.map(acc => {
    if (acc.id === oldEvent.accountId) {
      return { ...acc, balance: acc.balance + diff };
    }
    return acc;
  });

  let nextTransactions = state.transactions;
  if (oldEvent.sourceId) {
    nextTransactions = state.transactions.map(t =>
      t.id === oldEvent.sourceId
        ? {
            ...t,
            amount: Math.abs(newAmount),
            date: updatedFields.date || t.date,
            note: updatedFields.note !== undefined ? updatedFields.note : t.note,
          }
        : t
    );
  }

  const newEvent: CashEvent = {
    ...oldEvent,
    amount: newAmount,
    note: updatedFields.note !== undefined ? updatedFields.note : oldEvent.note,
    date: updatedFields.date !== undefined ? updatedFields.date : oldEvent.date,
  };

  const nextState: AppState = {
    ...state,
    accounts: nextAccounts,
    transactions: nextTransactions,
    cashEvents: state.cashEvents.map(e => (e.id === oldEvent.id ? newEvent : e)),
  };

  return {
    nextState,
    message: `سند اصلاح مانده ویرایش شد و مانده حساب متناسب با تغییر به‌روز گردید.`,
  };
}
