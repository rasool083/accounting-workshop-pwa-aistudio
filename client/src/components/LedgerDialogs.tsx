import React, { useState, useMemo } from "react";
import {
  X,
  Printer,
  Search,
  WalletCards,
  Banknote,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Layers,
  FileCheck,
  Building2,
  Phone,
  User,
  Hash,
  Eye,
  Calendar,
  CreditCard,
  Receipt,
  Info,
  ChevronLeft,
  Pencil,
  Trash2,
  Plus,
  Save,
} from "lucide-react";
import {
  AppState,
  Person,
  Check as CheckType,
  Invoice,
  Transaction,
  CashEvent,
  formatMoney,
  formatNumber,
  formatDate,
  jalaliDateKey,
  personName,
  partyBalanceDescriptor,
  settleChecksFIFO,
  todayJalali,
} from "@/lib/accounting";
import { PrintActionMenu } from "@/components/PrintPDFModal";
import {
  deleteTransactionAndRevert,
  editTransactionAndRevert,
  deleteInvoiceAndRevert,
  editInvoiceAndRevert,
  deleteInvoiceItemAndRevert,
  editInvoiceItemAndRevert,
  addInvoiceItemAndApply,
  deleteCheckAndRevert,
  editCheckAndRevert,
  deleteCashEventAndRevert,
  editCashEventAndRevert,
} from "@/lib/ledgerMutations";

// Helper for cash direction label
function cashDirectionLabel(type: string) {
  if (
    [
      "دریافت",
      "درآمد",
      "فروش",
      "فروش کالا",
      "دریافت توسط شریک",
      "دریافت تسویه از شریک",
    ].includes(type)
  ) {
    return "ورود به حساب (واریز)";
  }
  if (
    [
      "پرداخت",
      "هزینه",
      "خرید",
      "خرید کالا",
      "هزینه/خرید توسط شریک",
      "مساعده/پرداخت به شریک",
      "پرداخت حقوق",
    ].includes(type)
  ) {
    return "خروج از حساب (برداشت)";
  }
  if (type === "انتقال بین حساب‌ها") {
    return "انتقال وجه";
  }
  return "گردش حساب";
}

// -------------------------------------------------------------
// 1. Account Ledger Dialog (ریز تراکنش‌ها و گردش حساب بانک و صندوق)
// -------------------------------------------------------------
export function AccountLedgerDialog({
  account,
  state,
  onClose,
  onSave,
}: {
  account: AppState["accounts"][number];
  state: AppState;
  onClose: () => void;
  onSave?: (next: AppState, message: string) => void;
}) {
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showLinkedChecks, setShowLinkedChecks] = useState<boolean>(false);

  // Drill-down states
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<
    CheckType | AppState["issuedChecks"][number] | null
  >(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [inspectingAccount, setInspectingAccount] = useState<
    AppState["accounts"][number] | null
  >(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  // Compute all chronological activities for this account
  const ledgerEntries = useMemo(() => {
    interface RawActivity {
      id: string;
      date: string;
      rawDate: string;
      type: string;
      typeKind: "inflow" | "outflow" | "transfer" | "adjustment" | "reversal";
      partyId?: string;
      counterAccountId?: string;
      sourceId?: string;
      sourceType?: string;
      note: string;
      inflow: number;
      outflow: number;
      fee: number;
    }

    const activities: RawActivity[] = [];

    // 1. Cash Events for this account
    const processedSourceIds = new Set<string>();
    state.cashEvents
      .filter(e => e.accountId === account.id)
      .forEach(e => {
        if (e.sourceId) processedSourceIds.add(e.sourceId);
        const amount = e.amount;
        const isPositive = amount > 0;
        let typeKind: RawActivity["typeKind"] = isPositive ? "inflow" : "outflow";
        let typeLabel = "رویداد نقدینگی";

        if (e.kind === "transfer") {
          typeKind = "transfer";
          typeLabel = isPositive ? "انتقال ورودی" : "انتقال خروجی";
        } else if (e.kind === "check_receipt") {
          typeKind = "inflow";
          typeLabel = "وصول چک";
        } else if (e.kind === "expense") {
          typeKind = "outflow";
          typeLabel = "کارمزد / هزینه";
        } else if (e.kind === "adjustment") {
          typeKind = "adjustment";
          typeLabel = "اصلاح مانده";
        } else if (e.kind === "receipt") {
          typeKind = "inflow";
          typeLabel = "دریافت وجه";
        } else if (e.kind === "payment") {
          typeKind = "outflow";
          typeLabel = "پرداخت وجه";
        } else if (e.kind === "opening_balance") {
          typeKind = "adjustment";
          typeLabel = "موجودی افتتاحیه";
        } else if (e.kind === "reversal") {
          typeKind = isPositive ? "inflow" : "outflow";
          typeLabel = "ابطال و برگشت سند";
        }

        // Try to resolve party from linked transaction or check
        let partyId: string | undefined;
        if (e.sourceId) {
          const linkedTx = state.transactions.find(t => t.id === e.sourceId);
          if (linkedTx?.partyId) partyId = linkedTx.partyId;
          else {
            const linkedChk = state.checks.find(c => c.id === e.sourceId);
            if (linkedChk?.partyId) partyId = linkedChk.partyId;
          }
        }

        activities.push({
          id: `cash-event-${e.id}`,
          date: e.date,
          rawDate: e.date,
          type: typeLabel,
          typeKind,
          partyId,
          counterAccountId: e.counterAccountId,
          sourceId: e.sourceId,
          sourceType: e.sourceType || e.kind,
          note: e.note,
          inflow: isPositive ? amount : 0,
          outflow: isPositive ? 0 : Math.abs(amount),
          fee: 0,
        });
      });

    // 2. Direct transactions touching this account not already in cashEvents
    state.transactions
      .filter(
        t =>
          (t.accountId === account.id ||
            t.fromAccountId === account.id ||
            t.toAccountId === account.id) &&
          !processedSourceIds.has(t.id)
      )
      .forEach(t => {
        if (t.type === "انتقال بین حساب‌ها") {
          if (t.fromAccountId === account.id) {
            activities.push({
              id: `tx-${t.id}-out`,
              date: t.date,
              rawDate: t.date,
              type: "انتقال خروجی",
              typeKind: "transfer",
              partyId: t.partyId,
              counterAccountId: t.toAccountId,
              sourceId: t.id,
              sourceType: "transaction",
              note: t.note || "انتقال به حساب مقصد",
              inflow: 0,
              outflow: t.amount,
              fee: t.feeAmount || 0,
            });
          }
          if (t.toAccountId === account.id) {
            activities.push({
              id: `tx-${t.id}-in`,
              date: t.date,
              rawDate: t.date,
              type: "انتقال ورودی",
              typeKind: "transfer",
              partyId: t.partyId,
              counterAccountId: t.fromAccountId,
              sourceId: t.id,
              sourceType: "transaction",
              note: t.note || "انتقال از حساب مبدأ",
              inflow: t.amount,
              outflow: 0,
              fee: 0,
            });
          }
        } else {
          const isDeposit = [
            "دریافت",
            "درآمد",
            "فروش",
            "فروش کالا",
            "دریافت توسط شریک",
            "دریافت تسویه از شریک",
          ].includes(t.type);
          activities.push({
            id: `tx-${t.id}`,
            date: t.date,
            rawDate: t.date,
            type: t.type,
            typeKind: isDeposit ? "inflow" : "outflow",
            partyId: t.partyId,
            counterAccountId: undefined,
            sourceId: t.id,
            sourceType: "transaction",
            note: t.note || "",
            inflow: isDeposit ? t.amount : 0,
            outflow: isDeposit ? 0 : t.amount,
            fee: t.feeAmount || 0,
          });
        }
      });

    // 3. Checks collected directly linked to this bank account
    state.checks
      .filter(
        c =>
          c.bankAccountId === account.id &&
          c.status === "وصول شده" &&
          !processedSourceIds.has(c.id)
      )
      .forEach(c => {
        activities.push({
          id: `check-${c.id}`,
          date: c.collectedDate || c.dueDate,
          rawDate: c.collectedDate || c.dueDate,
          type: "وصول چک",
          typeKind: "inflow",
          partyId: c.partyId,
          counterAccountId: undefined,
          sourceId: c.id,
          sourceType: "check",
          note: `وصول چک شماره ${c.number || c.sayadNumber || "—"} (${c.bank || "بانک"})`,
          inflow: c.amount,
          outflow: 0,
          fee: c.feeAmount || 0,
        });
      });

    // 4. Issued checks paid directly from this account
    state.issuedChecks
      .filter(
        ic =>
          ic.bankAccountId === account.id &&
          ic.status === "پرداخت شده" &&
          !processedSourceIds.has(ic.id)
      )
      .forEach(ic => {
        const partyId = ic.beneficiaryPartyId || ic.issuerPartyId;
        activities.push({
          id: `issued-check-${ic.id}`,
          date: ic.dueDate,
          rawDate: ic.dueDate,
          type: "پرداخت چک صادره",
          typeKind: "outflow",
          partyId,
          counterAccountId: undefined,
          sourceId: ic.id,
          sourceType: "issued_check",
          note: `پرداخت چک صادره شماره ${ic.number} (${ic.purpose})`,
          inflow: 0,
          outflow: ic.amount,
          fee: 0,
        });
      });

    // Sort chronologically
    activities.sort(
      (a, b) =>
        jalaliDateKey(a.rawDate).localeCompare(jalaliDateKey(b.rawDate)) ||
        a.id.localeCompare(b.id)
    );

    // Compute running balance
    const totalActivityNet = activities.reduce(
      (sum, item) => sum + (item.inflow - item.outflow - item.fee),
      0
    );
    const openingBalance = account.balance - totalActivityNet;

    let running = openingBalance;
    const result: Array<
      RawActivity & {
        runningBalance: number;
        counterAccountName?: string;
        partyName?: string;
      }
    > = [];

    // If there is an opening balance, insert it as the first row
    if (Math.abs(openingBalance) > 0.01) {
      result.push({
        id: `opening-${account.id}`,
        date: activities[0]?.date || "ابتدای دوره",
        rawDate: activities[0]?.rawDate || "0000/00/00",
        type: "موجودی اولیه / پایه افتتاحیه",
        typeKind: openingBalance >= 0 ? "inflow" : "outflow",
        partyId: undefined,
        counterAccountId: undefined,
        note: "تراز اولیه ثبت‌شده حساب",
        inflow: openingBalance > 0 ? openingBalance : 0,
        outflow: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        fee: 0,
        runningBalance: openingBalance,
        partyName: "سیستم",
      });
    }

    for (const item of activities) {
      running += item.inflow - item.outflow - item.fee;
      const counterAccount = item.counterAccountId
        ? state.accounts.find(a => a.id === item.counterAccountId)
        : undefined;
      result.push({
        ...item,
        runningBalance: running,
        counterAccountName: counterAccount
          ? `${counterAccount.name} (${counterAccount.type})`
          : undefined,
        partyName: item.partyId ? personName(state, item.partyId) : undefined,
      });
    }

    return result;
  }, [account, state]);

  // Filtered rows
  const filteredEntries = useMemo(() => {
    return ledgerEntries.filter(row => {
      // Filter by type
      if (filterType === "inflows" && row.inflow <= 0) return false;
      if (filterType === "outflows" && row.outflow <= 0) return false;
      if (filterType === "transfers" && row.typeKind !== "transfer") return false;
      if (filterType === "checks" && !row.type.includes("چک")) return false;
      if (filterType === "adjustments" && row.typeKind !== "adjustment") return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesNote = row.note?.toLowerCase().includes(q);
        const matchesParty = row.partyName?.toLowerCase().includes(q);
        const matchesType = row.type?.toLowerCase().includes(q);
        const matchesCounter = row.counterAccountName?.toLowerCase().includes(q);
        if (!matchesNote && !matchesParty && !matchesType && !matchesCounter) {
          return false;
        }
      }
      return true;
    });
  }, [ledgerEntries, filterType, searchQuery]);

  // Linked checks for this account
  const linkedReceivedChecks = useMemo(
    () => state.checks.filter(c => c.bankAccountId === account.id),
    [state.checks, account.id]
  );
  const linkedIssuedChecks = useMemo(
    () => state.issuedChecks.filter(ic => ic.bankAccountId === account.id),
    [state.issuedChecks, account.id]
  );

  // Totals
  const totalInflows = ledgerEntries.reduce((sum, r) => sum + r.inflow, 0);
  const totalOutflows = ledgerEntries.reduce((sum, r) => sum + r.outflow, 0);
  const totalFees = ledgerEntries.reduce((sum, r) => sum + r.fee, 0);

  // Row click handler to drill-down into detailed information
  function handleRowClick(row: (typeof filteredEntries)[number]) {
    // 1. Transaction row
    if (row.id.startsWith("tx-")) {
      const txId = row.id.replace(/^tx-/, "").replace(/-(in|out)$/, "");
      const tx = state.transactions.find(t => t.id === txId);
      if (tx) {
        setSelectedTx(tx);
        return;
      }
    }

    // 2. Check collection row
    if (row.id.startsWith("check-")) {
      const chkId = row.id.replace(/^check-/, "");
      const chk = state.checks.find(c => c.id === chkId);
      if (chk) {
        setSelectedCheck(chk);
        return;
      }
    }

    // 3. Issued check payment row
    if (row.id.startsWith("issued-check-")) {
      const chkId = row.id.replace(/^issued-check-/, "");
      const chk = state.issuedChecks.find(c => c.id === chkId);
      if (chk) {
        setSelectedCheck(chk as any);
        return;
      }
    }

    // 4. Cash event with sourceId
    if (row.sourceId) {
      const tx = state.transactions.find(t => t.id === row.sourceId);
      if (tx) {
        setSelectedTx(tx);
        return;
      }
      const chk = state.checks.find(c => c.id === row.sourceId);
      if (chk) {
        setSelectedCheck(chk);
        return;
      }
      const iss = state.issuedChecks.find(c => c.id === row.sourceId);
      if (iss) {
        setSelectedCheck(iss as any);
        return;
      }
    }

    // 5. Cash adjustment, opening balance, or generic event
    setSelectedEvent(row);
  }

  function handleRowEdit(row: (typeof filteredEntries)[number], e: React.MouseEvent) {
    e.stopPropagation();
    handleRowClick(row);
  }

  function handleRowDelete(row: (typeof filteredEntries)[number], e: React.MouseEvent) {
    e.stopPropagation();
    if (!onSave) return;

    const rowAmount = row.inflow > 0 ? row.inflow : row.outflow;
    const amountFormatted = formatMoney(rowAmount, state.settings.currency);

    // 1. Transaction row
    let targetTxId: string | undefined;
    if (row.id.startsWith("tx-")) {
      targetTxId = row.id.replace(/^tx-/, "").replace(/-(in|out)$/, "");
    } else if (row.sourceId && state.transactions.some(t => t.id === row.sourceId)) {
      targetTxId = row.sourceId;
    }

    if (targetTxId) {
      const tx = state.transactions.find(t => t.id === targetTxId);
      if (
        !window.confirm(
          `آیا از حذف این سند مالی («${tx?.type || row.type}» به مبلغ ${amountFormatted}) مطمئنید؟\nاثر مالی آن بر موجودی حساب و دفاتر معکوس شده و رکورد برگشت سند ثبت خواهد شد.`
        )
      ) {
        return;
      }
      const res = deleteTransactionAndRevert(state, targetTxId);
      onSave(res.nextState, res.message);
      return;
    }

    // 2. Check row
    let targetCheckId: string | undefined;
    if (row.id.startsWith("check-")) {
      targetCheckId = row.id.replace(/^check-/, "");
    } else if (row.sourceType === "check" && row.sourceId) {
      targetCheckId = row.sourceId;
    }
    if (targetCheckId) {
      if (
        !window.confirm(
          `آیا از حذف/برگشت چک دریافتی به مبلغ ${amountFormatted} مطمئنید؟`
        )
      ) {
        return;
      }
      const res = deleteCheckAndRevert(state, targetCheckId);
      onSave(res.nextState, res.message);
      return;
    }

    // 3. Issued check row
    let targetIssuedCheckId: string | undefined;
    if (row.id.startsWith("issued-check-")) {
      targetIssuedCheckId = row.id.replace(/^issued-check-/, "");
    }
    if (targetIssuedCheckId) {
      if (
        !window.confirm(
          `آیا از حذف/ابطال چک صادره به مبلغ ${amountFormatted} مطمئنید؟`
        )
      ) {
        return;
      }
      const ic = state.issuedChecks.find(c => c.id === targetIssuedCheckId);
      if (ic) {
        const nextIssuedChecks = state.issuedChecks.filter(c => c.id !== targetIssuedCheckId);
        let nextAccounts = state.accounts;
        if (ic.status === "پرداخت شده" && ic.bankAccountId) {
          nextAccounts = nextAccounts.map(acc =>
            acc.id === ic.bankAccountId ? { ...acc, balance: acc.balance + ic.amount } : acc
          );
        }
        onSave(
          { ...state, accounts: nextAccounts, issuedChecks: nextIssuedChecks },
          `چک صادره شماره ${ic.number} حذف شد و اثر حساب آن معکوس گردید.`
        );
      }
      return;
    }

    // 4. Cash event or adjustment
    const eventId = row.id.startsWith("cash-event-")
      ? row.id.replace(/^cash-event-/, "")
      : row.sourceId || row.id;
    if (
      !window.confirm(
        `آیا از حذف این رویداد نقدینگی به مبلغ ${amountFormatted} مطمئنید؟ مانده حساب دقیقاً به مقدار اولیه بازگردانده خواهد شد.`
      )
    ) {
      return;
    }
    const res = deleteCashEventAndRevert(state, eventId);
    onSave(res.nextState, res.message);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide"
        onMouseDown={e => e.stopPropagation()}
        style={{ width: "min(1100px, 98vw)", maxHeight: "92vh" }}
      >
        {/* Dialog Header */}
        <div className="dialog-header" style={{ marginBottom: 14 }}>
          <div>
            <span className="section-kicker">دفتر معین نقدینگی و بانک</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <h3 style={{ margin: 0 }}>
                ریز تراکنش‌ها و گردش حساب: {account.name}
              </h3>
              <span className="soft-tag">{account.type}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintActionMenu
              title={`گردش حساب و دفتر معین: ${account.name} (${account.type})`}
              filename={`گردش-حساب-${account.name.replace(/\s+/g, "_")}`}
              getTargetElement={() =>
                document.getElementById(`account-ledger-print-${account.id}`)
              }
              onDirectPrint={() => window.print()}
              buttonLabel="چاپ و دانلود طومار"
              style={{ padding: "6px 12px", fontSize: "0.82rem" }}
            />
            <button className="icon-button" onClick={onClose} title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Content Wrapper */}
        <div id={`account-ledger-print-${account.id}`} style={{ width: "100%", background: "#ffffff" }}>
        {/* Account Financial Metric Strip */}
        <div className="ledger-stat-strip">
          <div className="ledger-stat-item">
            <span>موجودی جاری</span>
            <strong style={{ color: account.balance >= 0 ? "#15803d" : "#b91c1c" }}>
              {formatMoney(account.balance, state.settings.currency)}
            </strong>
          </div>
          <div className="ledger-stat-item">
            <span>مجموع واریزها (ورود)</span>
            <strong style={{ color: "#15803d" }}>
              {formatMoney(totalInflows, state.settings.currency)}
            </strong>
          </div>
          <div className="ledger-stat-item">
            <span>مجموع برداشت‌ها (خروج)</span>
            <strong style={{ color: "#b91c1c" }}>
              {formatMoney(totalOutflows, state.settings.currency)}
            </strong>
          </div>
          {totalFees > 0 && (
            <div className="ledger-stat-item">
              <span>کارمزد بانکی کسرشده</span>
              <strong style={{ color: "#b45309" }}>
                {formatMoney(totalFees, state.settings.currency)}
              </strong>
            </div>
          )}
          <div className="ledger-stat-item">
            <span>تعداد گردش‌ها</span>
            <strong>{formatNumber(ledgerEntries.length)} تراکنش</strong>
          </div>
          <div className="ledger-stat-item">
            <span>چک‌های متصل</span>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowLinkedChecks(!showLinkedChecks)}
              style={{ fontWeight: 600, fontSize: "0.95rem", textAlign: "right" }}
            >
              {formatNumber(linkedReceivedChecks.length + linkedIssuedChecks.length)} چک{" "}
              <small>({showLinkedChecks ? "بستن لیست" : "مشاهده"})</small>
            </button>
          </div>
        </div>

        {/* Linked Checks Section (Collapsible) */}
        {showLinkedChecks && (
          <div
            style={{
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: "0.85rem", color: "#334155" }}>
                چک‌های دریافتی و صادره متصل به «{account.name}» (برای مشاهده جزئیات چک، روی ردیف کلیک کنید)
              </strong>
              <button
                className="icon-button"
                onClick={() => setShowLinkedChecks(false)}
                title="بستن"
              >
                <X size={14} />
              </button>
            </div>
            {linkedReceivedChecks.length === 0 && linkedIssuedChecks.length === 0 ? (
              <span className="muted-cell" style={{ fontSize: "0.8rem" }}>
                هیچ چکی به این حساب متصل نشده است.
              </span>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 180, overflowY: "auto" }}>
                <table style={{ fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th>نوع چک</th>
                      <th>شماره چک / صیادی</th>
                      <th>طرف حساب</th>
                      <th>سررسید</th>
                      <th>مبلغ</th>
                      <th>وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedReceivedChecks.map(chk => (
                      <tr
                        key={`rcv-${chk.id}`}
                        className="clickable-row"
                        onClick={() => setSelectedCheck(chk)}
                        title="برای مشاهده جزئیات کامل چک کلیک کنید"
                      >
                        <td>
                          <span className="badge teal">دریافتی</span>
                        </td>
                        <td>
                          <strong>{chk.sayadNumber || chk.number}</strong>
                        </td>
                        <td>{chk.partyId ? personName(state, chk.partyId) : "—"}</td>
                        <td>{formatDate(chk.dueDate)}</td>
                        <td className="amount-cell">
                          <strong>{formatMoney(chk.amount, state.settings.currency)}</strong>
                        </td>
                        <td>
                          <span className="status-pill">{chk.status}</span>
                        </td>
                      </tr>
                    ))}
                    {linkedIssuedChecks.map(chk => (
                      <tr
                        key={`iss-${chk.id}`}
                        className="clickable-row"
                        onClick={() => setSelectedCheck(chk as any)}
                        title="برای مشاهده جزئیات کامل چک صادره کلیک کنید"
                      >
                        <td>
                          <span className="badge amber">صادره</span>
                        </td>
                        <td>
                          <strong>{chk.number}</strong>
                        </td>
                        <td>
                          {chk.beneficiaryPartyId || chk.issuerPartyId
                            ? personName(
                                state,
                                chk.beneficiaryPartyId || chk.issuerPartyId
                              )
                            : "—"}
                        </td>
                        <td>{formatDate(chk.dueDate)}</td>
                        <td className="amount-cell">
                          <strong>{formatMoney(chk.amount, state.settings.currency)}</strong>
                        </td>
                        <td>
                          <span className="status-pill">{chk.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div className="party-tabs" style={{ margin: 0, padding: 0, border: "none" }}>
            {[
              { id: "all", label: "همه گردش‌ها" },
              { id: "inflows", label: "واریز و دریافت" },
              { id: "outflows", label: "برداشت و پرداخت" },
              { id: "transfers", label: "انتقال بین حساب‌ها" },
              { id: "checks", label: "وصول چک" },
              { id: "adjustments", label: "اصلاحات مانده" },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`party-tab ${filterType === tab.id ? "active" : ""}`}
                onClick={() => setFilterType(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="search-box compact" style={{ minWidth: 220 }}>
            <Search size={14} />
            <input
              placeholder="جست‌وجو در شرح یا طرف حساب..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Detailed Ledger Table */}
        <div className="table-wrap" style={{ maxHeight: "calc(92vh - 280px)", overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: "9%" }}>تاریخ</th>
                <th style={{ width: "12%" }}>نوع گردش</th>
                <th style={{ width: "16%" }}>طرف حساب / حساب مقابل</th>
                <th style={{ width: "20%" }}>شرح و جزئیات</th>
                <th style={{ width: "11%" }}>واریز / ورود (+)</th>
                <th style={{ width: "11%" }}>برداشت / خروج (-)</th>
                <th style={{ width: "11%" }}>مانده پس از رویداد</th>
                <th style={{ width: "10%", textAlign: "center" }}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length ? (
                filteredEntries.map(row => (
                  <tr
                    key={row.id}
                    className="clickable-row"
                    onClick={() => handleRowClick(row)}
                    title="برای مشاهده ریز جزئیات و پرونده سند کلیک کنید"
                  >
                    <td>
                      <strong>{formatDate(row.date)}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          row.typeKind === "inflow"
                            ? "status-success"
                            : row.typeKind === "outflow"
                              ? "status-danger"
                              : "status-warning"
                        }`}
                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td>
                      {row.counterAccountName ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={e => {
                            e.stopPropagation();
                            const acc = state.accounts.find(
                              a => a.id === row.counterAccountId
                            );
                            if (acc) setInspectingAccount(acc);
                          }}
                          title="مشاهده گردش حساب مقابل"
                        >
                          <strong style={{ color: "#0369a1" }}>
                            {row.counterAccountName}
                          </strong>
                          <small
                            style={{
                              display: "block",
                              color: "#64748b",
                              fontSize: "0.72rem",
                            }}
                          >
                            انتقال دوطرفه (کلیک کنید)
                          </small>
                        </button>
                      ) : row.partyName ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={e => {
                            e.stopPropagation();
                            const p = state.people.find(
                              person => person.id === row.partyId
                            );
                            if (p) setSelectedPerson(p);
                          }}
                          title="مشاهده پرونده مالی شخص"
                        >
                          <strong style={{ color: "#1e293b" }}>{row.partyName}</strong>
                        </button>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: "0.82rem" }}>{row.note || "—"}</span>
                      {row.fee > 0 && (
                        <small
                          style={{
                            display: "block",
                            color: "#b45309",
                            fontSize: "0.72rem",
                          }}
                        >
                          کارمزد بانکی: {formatMoney(row.fee, state.settings.currency)}
                        </small>
                      )}
                    </td>
                    <td
                      className="amount-cell"
                      style={{ color: row.inflow > 0 ? "#15803d" : "#94a3b8" }}
                    >
                      {row.inflow > 0 ? (
                        <strong>+{formatMoney(row.inflow, state.settings.currency)}</strong>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className="amount-cell"
                      style={{ color: row.outflow > 0 ? "#b91c1c" : "#94a3b8" }}
                    >
                      {row.outflow > 0 ? (
                        <strong>-{formatMoney(row.outflow, state.settings.currency)}</strong>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className="amount-cell"
                      style={{
                        fontWeight: 700,
                        color: row.runningBalance >= 0 ? "#0f172a" : "#b91c1c",
                      }}
                    >
                      {formatMoney(row.runningBalance, state.settings.currency)}
                    </td>
                    <td
                      style={{ textAlign: "center", whiteSpace: "nowrap" }}
                      onClick={e => e.stopPropagation()}
                    >
                      {row.id.startsWith("opening-") ? (
                        <span className="soft-tag" style={{ fontSize: "0.72rem" }}>
                          پایه دوره
                        </span>
                      ) : row.typeKind === "reversal" ||
                        row.type.includes("ابطال") ||
                        row.type.includes("معکوس") ? (
                        <span className="badge amber" style={{ fontSize: "0.72rem" }}>
                          سند باطل‌شده
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            justifyContent: "center",
                          }}
                        >
                          <button
                            type="button"
                            className="button button-ghost button-small"
                            onClick={e => handleRowEdit(row, e)}
                            title="ویرایش این سند"
                            style={{
                              padding: "2px 6px",
                              fontSize: "0.72rem",
                              color: "#0284c7",
                            }}
                          >
                            <Pencil size={12} />
                            ویرایش
                          </button>
                          {onSave && (
                            <button
                              type="button"
                              className="button button-ghost button-small"
                              onClick={e => handleRowDelete(row, e)}
                              title="حذف سند و بازگشت اثر به حساب"
                              style={{
                                padding: "2px 6px",
                                fontSize: "0.72rem",
                                color: "#dc2626",
                              }}
                            >
                              <Trash2 size={12} />
                              حذف
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "24px 0" }}>
                    <span className="muted-cell">
                      هیچ تراکنش یا انتقالی با شرایط انتخاب‌شده یافت نشد.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* Drill-down Modals */}
      {selectedTx && (
        <TransactionDetailDialog
          transaction={selectedTx}
          state={state}
          onClose={() => setSelectedTx(null)}
          onSave={onSave}
          onOpenParty={p => setSelectedPerson(p)}
          onOpenAccount={a => setInspectingAccount(a)}
          onOpenCheck={c => setSelectedCheck(c)}
        />
      )}

      {selectedCheck && (
        <CheckDetailDialog
          check={selectedCheck}
          state={state}
          onClose={() => setSelectedCheck(null)}
          onSave={onSave}
          onOpenParty={p => setSelectedPerson(p)}
          onOpenAccount={a => setInspectingAccount(a)}
        />
      )}

      {selectedPerson && (
        <PartyLedgerDialog
          person={selectedPerson}
          state={state}
          onClose={() => setSelectedPerson(null)}
          onSave={onSave}
        />
      )}

      {inspectingAccount && (
        <AccountLedgerDialog
          account={inspectingAccount}
          state={state}
          onClose={() => setInspectingAccount(null)}
          onSave={onSave}
        />
      )}

      {selectedEvent && (
        <EventDetailDialog
          event={selectedEvent}
          account={account}
          state={state}
          onClose={() => setSelectedEvent(null)}
          onSave={onSave}
          onOpenParty={p => setSelectedPerson(p)}
          onOpenCounterAccount={a => setInspectingAccount(a)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 2. Party Ledger Dialog (پرونده مالی، صورت‌حساب و گردش حساب طرف حساب)
// -------------------------------------------------------------
export function PartyLedgerDialog({
  person,
  state,
  onClose,
  onSave,
}: {
  person: Person;
  state: AppState;
  onClose: () => void;
  onSave?: (next: AppState, message: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "statement" | "invoices" | "checks" | "issuedChecks" | "transactions"
  >("statement");
  const [searchQuery, setSearchQuery] = useState("");

  // Drill-down states
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<
    CheckType | AppState["issuedChecks"][number] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<
    AppState["accounts"][number] | null
  >(null);

  // Invoices for this person
  const personInvoices = useMemo(
    () =>
      state.invoices
        .filter(i => i.partyId === person.id && i.status !== "باطل")
        .sort((a, b) => jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date))),
    [state.invoices, person.id]
  );

  // Received Checks from this person
  const personChecks = useMemo(
    () =>
      state.checks
        .filter(c => c.partyId === person.id)
        .sort((a, b) => jalaliDateKey(b.dueDate).localeCompare(jalaliDateKey(a.dueDate))),
    [state.checks, person.id]
  );

  // Issued checks to this person
  const personIssuedChecks = useMemo(
    () =>
      state.issuedChecks
        .filter(ic => ic.beneficiaryPartyId === person.id || ic.issuerPartyId === person.id)
        .sort((a, b) => jalaliDateKey(b.dueDate).localeCompare(jalaliDateKey(a.dueDate))),
    [state.issuedChecks, person.id]
  );

  // Direct transactions with this person
  const personTransactions = useMemo(
    () =>
      state.transactions
        .filter(t => t.partyId === person.id)
        .sort((a, b) => jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date))),
    [state.transactions, person.id]
  );

  // Unified Chronological Statement (صورت‌حساب دفتر معین)
  const statementRows = useMemo(() => {
    interface StatementEvent {
      id: string;
      date: string;
      rawDate: string;
      docType: string;
      reference: string;
      note: string;
      debit: number; // افزایش طلب کارگاه از شخص
      credit: number; // افزایش بستانکاری شخص / پرداختی شخص
    }

    const events: StatementEvent[] = [];

    // Invoices
    personInvoices.forEach(inv => {
      if (inv.type === "فروش") {
        events.push({
          id: `inv-${inv.id}`,
          date: inv.date,
          rawDate: inv.date,
          docType: "فاکتور فروش",
          reference: `فاکتور شماره ${inv.number}`,
          note: inv.items?.map(it => it.productId).join("، ") || "فروش کالا/خدمات",
          debit: inv.amount,
          credit: 0,
        });
      } else {
        events.push({
          id: `inv-${inv.id}`,
          date: inv.date,
          rawDate: inv.date,
          docType: "فاکتور خرید",
          reference: `فاکتور خرید ${inv.number}`,
          note: inv.items?.map(it => it.productId).join("، ") || "خرید کالا/مواد اولیه",
          debit: 0,
          credit: inv.amount,
        });
      }
    });

    // Direct Transactions
    personTransactions.forEach(t => {
      if (["دریافت", "درآمد", "دریافت توسط شریک", "دریافت تسویه از شریک"].includes(t.type)) {
        events.push({
          id: `tx-${t.id}`,
          date: t.date,
          rawDate: t.date,
          docType: t.type,
          reference: `رسید دریافت نقدی/بانکی`,
          note: t.note || "دریافت وجه",
          debit: 0,
          credit: t.amount,
        });
      } else if (
        [
          "پرداخت",
          "هزینه",
          "هزینه/خرید توسط شریک",
          "مساعده/پرداخت به شریک",
          "پرداخت حقوق",
        ].includes(t.type)
      ) {
        events.push({
          id: `tx-${t.id}`,
          date: t.date,
          rawDate: t.date,
          docType: t.type,
          reference: `رسید پرداخت نقدی/بانکی`,
          note: t.note || "پرداخت وجه",
          debit: t.amount,
          credit: 0,
        });
      }
    });

    // Received Checks
    personChecks.forEach(c => {
      events.push({
        id: `chk-${c.id}`,
        date: c.receivedDate || c.dueDate,
        rawDate: c.receivedDate || c.dueDate,
        docType: "چک دریافتی",
        reference: `چک صیادی ${c.sayadNumber || c.number || "—"} (${c.bank || "بانک"})`,
        note: `سررسید: ${formatDate(c.dueDate)} · وضعیت: ${c.status}`,
        debit: 0,
        credit: c.amount,
      });
    });

    // Issued Checks
    personIssuedChecks.forEach(ic => {
      events.push({
        id: `iss-chk-${ic.id}`,
        date: ic.dueDate,
        rawDate: ic.dueDate,
        docType: "چک صادره",
        reference: `چک صادره کارگاه شماره ${ic.number}`,
        note: `بابت ${ic.purpose} · وضعیت: ${ic.status}`,
        debit: ic.amount,
        credit: 0,
      });
    });

    // Sort chronologically from earliest to latest
    events.sort(
      (a, b) =>
        jalaliDateKey(a.rawDate).localeCompare(jalaliDateKey(b.rawDate)) ||
        a.id.localeCompare(b.id)
    );

    // Calculate running balance
    let running = 0;
    return events.map(e => {
      running += e.debit - e.credit;
      return {
        ...e,
        runningBalance: running,
      };
    });
  }, [personInvoices, personChecks, personIssuedChecks, personTransactions]);

  // Overall financial totals
  const totalSales = personInvoices
    .filter(i => i.type === "فروش")
    .reduce((sum, i) => sum + i.amount, 0);
  const totalPurchases = personInvoices
    .filter(i => i.type === "خرید")
    .reduce((sum, i) => sum + i.amount, 0);
  const totalDebits = statementRows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredits = statementRows.reduce((sum, r) => sum + r.credit, 0);
  const balanceDesc = partyBalanceDescriptor(state, person.id);

  // Search filtered statement rows
  const filteredStatement = useMemo(() => {
    if (!searchQuery.trim()) return statementRows;
    const q = searchQuery.trim().toLowerCase();
    return statementRows.filter(
      r =>
        r.docType.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q)
    );
  }, [statementRows, searchQuery]);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide"
        onMouseDown={e => e.stopPropagation()}
        style={{ width: "min(1100px, 98vw)", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="dialog-header" style={{ marginBottom: 14 }}>
          <div>
            <span className="section-kicker">پرونده مالی و کاردکس طرف حساب</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <h3 style={{ margin: 0 }}>
                {person.name} {person.code ? `(کد: ${person.code})` : ""}
              </h3>
              <div style={{ display: "flex", gap: 4 }}>
                {(person.roles?.length ? person.roles : [person.type]).map(r => (
                  <span className="soft-tag" key={r}>
                    {r}
                  </span>
                ))}
              </div>
              {person.phone && (
                <span className="muted-cell" style={{ fontSize: "0.8rem", marginRight: 8 }}>
                  <Phone size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} />
                  {person.phone}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintActionMenu
              title={`صورت‌حساب و پرونده مالی: ${person.name}`}
              filename={`صورتحساب-${person.name.replace(/\s+/g, "_")}`}
              getTargetElement={() =>
                document.getElementById(`party-ledger-print-${person.id}`)
              }
              onDirectPrint={() => window.print()}
              buttonLabel="چاپ و دانلود طومار"
              style={{ padding: "6px 12px", fontSize: "0.82rem" }}
            />
            <button className="icon-button" onClick={onClose} title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Content Wrapper */}
        <div id={`party-ledger-print-${person.id}`} style={{ width: "100%", background: "#ffffff" }}>
        {/* Financial Summary Strip */}
        <div className="ledger-stat-strip">
          <div className="ledger-stat-item">
            <span>وضعیت مانده نهایی</span>
            <strong className={balanceDesc.tone}>
              {balanceDesc.amount
                ? `${formatMoney(balanceDesc.amount, state.settings.currency)} (${balanceDesc.label})`
                : balanceDesc.label}
            </strong>
          </div>
          <div className="ledger-stat-item">
            <span>کل فاکتورهای فروش</span>
            <strong style={{ color: "#0369a1" }}>
              {formatMoney(totalSales, state.settings.currency)}
            </strong>
          </div>
          <div className="ledger-stat-item">
            <span>کل فاکتورهای خرید</span>
            <strong style={{ color: "#b45309" }}>
              {formatMoney(totalPurchases, state.settings.currency)}
            </strong>
          </div>
          <div className="ledger-stat-item">
            <span>کل بستانکاری / دریافتی</span>
            <strong style={{ color: "#15803d" }}>
              {formatMoney(totalCredits, state.settings.currency)}
            </strong>
          </div>
          <div className="ledger-stat-item">
            <span>تعداد فاکتورها</span>
            <strong>{formatNumber(personInvoices.length)} فاکتور</strong>
          </div>
          <div className="ledger-stat-item">
            <span>تعداد چک‌ها</span>
            <strong>
              {formatNumber(personChecks.length)} دریافتی /{" "}
              {formatNumber(personIssuedChecks.length)} صادره
            </strong>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div className="party-tabs" style={{ margin: 0, padding: 0, border: "none" }}>
            <button
              type="button"
              className={`party-tab ${activeTab === "statement" ? "active" : ""}`}
              onClick={() => setActiveTab("statement")}
            >
              صورت‌حساب و کاردکس مالی ({formatNumber(statementRows.length)})
            </button>
            <button
              type="button"
              className={`party-tab ${activeTab === "invoices" ? "active" : ""}`}
              onClick={() => setActiveTab("invoices")}
            >
              فاکتورها ({formatNumber(personInvoices.length)})
            </button>
            <button
              type="button"
              className={`party-tab ${activeTab === "checks" ? "active" : ""}`}
              onClick={() => setActiveTab("checks")}
            >
              چک‌های دریافتی ({formatNumber(personChecks.length)})
            </button>
            {personIssuedChecks.length > 0 && (
              <button
                type="button"
                className={`party-tab ${activeTab === "issuedChecks" ? "active" : ""}`}
                onClick={() => setActiveTab("issuedChecks")}
              >
                چک‌های صادره ({formatNumber(personIssuedChecks.length)})
              </button>
            )}
            <button
              type="button"
              className={`party-tab ${activeTab === "transactions" ? "active" : ""}`}
              onClick={() => setActiveTab("transactions")}
            >
              عملیات مالی ({formatNumber(personTransactions.length)})
            </button>
          </div>
          <div className="search-box compact" style={{ minWidth: 200 }}>
            <Search size={14} />
            <input
              placeholder="جست‌وجو در اقلام..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Content based on Active Tab */}
        <div className="table-wrap" style={{ maxHeight: "calc(92vh - 280px)", overflowY: "auto" }}>
          {activeTab === "statement" && (
            <table>
              <thead>
                <tr>
                  <th style={{ width: "10%" }}>تاریخ</th>
                  <th style={{ width: "13%" }}>نوع سند</th>
                  <th style={{ width: "22%" }}>شماره سند / مرجع</th>
                  <th style={{ width: "23%" }}>شرح عملیات</th>
                  <th style={{ width: "11%" }}>بدهکار (+)</th>
                  <th style={{ width: "11%" }}>بستانکار (-)</th>
                  <th style={{ width: "10%" }}>مانده کارگاه</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatement.length ? (
                  filteredStatement.map(row => (
                    <tr
                      key={row.id}
                      className="clickable-row"
                      onClick={() => {
                        if (row.id.startsWith("inv-")) {
                          const invId = row.id.replace(/^inv-/, "");
                          const inv = state.invoices.find(i => i.id === invId);
                          if (inv) setSelectedInvoice(inv);
                        } else if (row.id.startsWith("chk-")) {
                          const chkId = row.id.replace(/^chk-/, "");
                          const chk = state.checks.find(c => c.id === chkId);
                          if (chk) setSelectedCheck(chk);
                        } else if (row.id.startsWith("iss-chk-")) {
                          const chkId = row.id.replace(/^iss-chk-/, "");
                          const chk = state.issuedChecks.find(c => c.id === chkId);
                          if (chk) setSelectedCheck(chk as any);
                        } else if (row.id.startsWith("tx-")) {
                          const txId = row.id.replace(/^tx-/, "");
                          const tx = state.transactions.find(t => t.id === txId);
                          if (tx) setSelectedTransaction(tx);
                        }
                      }}
                      title="برای مشاهده ریز و جزئیات سند کلیک کنید"
                    >
                      <td>
                        <strong>{formatDate(row.date)}</strong>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            row.debit > 0 ? "status-warning" : "status-success"
                          }`}
                          style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                        >
                          {row.docType}
                        </span>
                      </td>
                      <td>
                        <strong>{row.reference}</strong>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.82rem" }}>{row.note}</span>
                      </td>
                      <td
                        className="amount-cell"
                        style={{ color: row.debit > 0 ? "#b45309" : "#94a3b8" }}
                      >
                        {row.debit > 0 ? (
                          <strong>{formatMoney(row.debit, state.settings.currency)}</strong>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="amount-cell"
                        style={{ color: row.credit > 0 ? "#15803d" : "#94a3b8" }}
                      >
                        {row.credit > 0 ? (
                          <strong>{formatMoney(row.credit, state.settings.currency)}</strong>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="amount-cell"
                        style={{
                          fontWeight: 700,
                          color:
                            row.runningBalance > 0
                              ? "#b45309"
                              : row.runningBalance < 0
                                ? "#15803d"
                                : "#64748b",
                        }}
                      >
                        {Math.abs(row.runningBalance) > 0.01 ? (
                          <span>
                            {formatMoney(
                              Math.abs(row.runningBalance),
                              state.settings.currency
                            )}
                            <small
                              style={{
                                display: "block",
                                fontSize: "0.7rem",
                                color: "#64748b",
                              }}
                            >
                              {row.runningBalance > 0
                                ? "(طلب کارگاه)"
                                : "(بستانکار شخص)"}
                            </small>
                          </span>
                        ) : (
                          <span className="muted-cell">تسویه</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "24px 0" }}>
                      <span className="muted-cell">هیچ رکوردی در صورت‌حساب وجود ندارد.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "invoices" && (
            <table>
              <thead>
                <tr>
                  <th>شماره فاکتور</th>
                  <th>تاریخ</th>
                  <th>نوع</th>
                  <th>مبلغ فاکتور</th>
                  <th>تسویه‌شده</th>
                  <th>مانده</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {personInvoices.length ? (
                  personInvoices.map(inv => (
                    <tr
                      key={inv.id}
                      className="clickable-row"
                      onClick={() => setSelectedInvoice(inv)}
                      title="برای مشاهده مشخصات کامل فاکتور و اقلام کلیک کنید"
                    >
                      <td>
                        <strong>{inv.number}</strong>
                      </td>
                      <td>{formatDate(inv.date)}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            inv.type === "فروش" ? "status-success" : "status-warning"
                          }`}
                        >
                          {inv.type}
                        </span>
                      </td>
                      <td className="amount-cell">
                        <strong>{formatMoney(inv.amount, state.settings.currency)}</strong>
                      </td>
                      <td className="amount-cell">
                        {formatMoney(inv.paidAmount || 0, state.settings.currency)}
                      </td>
                      <td className="amount-cell">
                        <strong>
                          {formatMoney(
                            Math.max(0, inv.amount - (inv.paidAmount || 0)),
                            state.settings.currency
                          )}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            inv.status === "تسویه شده"
                              ? "status-success"
                              : "status-warning"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "24px 0" }}>
                      <span className="muted-cell">فاکتوری برای این طرف حساب ثبت نشده است.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "checks" && (
            <table>
              <thead>
                <tr>
                  <th>شماره چک / صیادی</th>
                  <th>سررسید</th>
                  <th>مبلغ چک</th>
                  <th>بانک</th>
                  <th>وضعیت</th>
                  <th>فاکتور هدف / تخصیص</th>
                </tr>
              </thead>
              <tbody>
                {personChecks.length ? (
                  personChecks.map(chk => (
                    <tr
                      key={chk.id}
                      className="clickable-row"
                      onClick={() => setSelectedCheck(chk)}
                      title="برای مشاهده جزئیات چک و فاکتورهای تسویه‌شده کلیک کنید"
                    >
                      <td>
                        <strong>{chk.sayadNumber || chk.number}</strong>
                      </td>
                      <td>{formatDate(chk.dueDate)}</td>
                      <td className="amount-cell">
                        <strong>{formatMoney(chk.amount, state.settings.currency)}</strong>
                      </td>
                      <td>{chk.bank || "—"}</td>
                      <td>
                        <span className="status-pill">{chk.status}</span>
                      </td>
                      <td>
                        {chk.targetInvoiceId ? (
                          <span className="badge amber">
                            هدف: فاکتور{" "}
                            {state.invoices.find(i => i.id === chk.targetInvoiceId)
                              ?.number || "اختصاصی"}
                          </span>
                        ) : (
                          <span className="muted-cell">تخصیص عمومی FIFO</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "24px 0" }}>
                      <span className="muted-cell">چک دریافتی از این شخص ثبت نشده است.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "issuedChecks" && (
            <table>
              <thead>
                <tr>
                  <th>شماره چک صادره</th>
                  <th>سررسید</th>
                  <th>مبلغ چک</th>
                  <th>بانک مبدأ</th>
                  <th>بابت / هدف</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {personIssuedChecks.length ? (
                  personIssuedChecks.map(chk => (
                    <tr
                      key={chk.id}
                      className="clickable-row"
                      onClick={() => setSelectedCheck(chk as any)}
                      title="برای مشاهده مشخصات چک صادره کلیک کنید"
                    >
                      <td>
                        <strong>{chk.number}</strong>
                      </td>
                      <td>{formatDate(chk.dueDate)}</td>
                      <td className="amount-cell">
                        <strong>{formatMoney(chk.amount, state.settings.currency)}</strong>
                      </td>
                      <td>{chk.bankName || "—"}</td>
                      <td>{chk.purpose}</td>
                      <td>
                        <span className="status-pill">{chk.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "24px 0" }}>
                      <span className="muted-cell">چک صادره‌ای به این شخص ثبت نشده است.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "transactions" && (
            <table>
              <thead>
                <tr>
                  <th>نوع عملیات</th>
                  <th>تاریخ</th>
                  <th>مبلغ</th>
                  <th>حساب مرتبط</th>
                  <th>شرح</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {personTransactions.length ? (
                  personTransactions.map(t => {
                    const acc = state.accounts.find(
                      a =>
                        a.id === t.accountId ||
                        a.id === t.toAccountId ||
                        a.id === t.fromAccountId
                    );
                    return (
                      <tr
                        key={t.id}
                        className="clickable-row"
                        onClick={() => setSelectedTransaction(t)}
                        title="برای مشاهده جزئیات تراکنش کلیک کنید"
                      >
                        <td>
                          <span className="status-pill">{t.type}</span>
                        </td>
                        <td>{formatDate(t.date)}</td>
                        <td className="amount-cell">
                          <strong>{formatMoney(t.amount, state.settings.currency)}</strong>
                        </td>
                        <td>
                          {acc ? (
                            <button
                              type="button"
                              className="text-button"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedAccount(acc);
                              }}
                              title="مشاهده گردش حساب"
                            >
                              <strong style={{ color: "#0369a1" }}>{acc.name}</strong>
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{t.note || "—"}</td>
                        <td>
                          <span className="status-pill">{t.status}</span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "24px 0" }}>
                      <span className="muted-cell">عملیات مالی مستقیمی ثبت نشده است.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>

      {/* Drill-down Modals */}
      {selectedInvoice && (
        <InvoiceDetailDialog
          invoice={selectedInvoice}
          state={state}
          onClose={() => setSelectedInvoice(null)}
          onSave={onSave}
          onOpenCheck={c => setSelectedCheck(c)}
        />
      )}

      {selectedCheck && (
        <CheckDetailDialog
          check={selectedCheck}
          state={state}
          onClose={() => setSelectedCheck(null)}
          onSave={onSave}
          onOpenInvoice={i => setSelectedInvoice(i)}
          onOpenAccount={a => setSelectedAccount(a)}
        />
      )}

      {selectedTransaction && (
        <TransactionDetailDialog
          transaction={selectedTransaction}
          state={state}
          onClose={() => setSelectedTransaction(null)}
          onSave={onSave}
          onOpenAccount={a => setSelectedAccount(a)}
          onOpenCheck={c => setSelectedCheck(c)}
        />
      )}

      {selectedAccount && (
        <AccountLedgerDialog
          account={selectedAccount}
          state={state}
          onClose={() => setSelectedAccount(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 3. Invoice Detail Dialog (مشخصات و ریز فاکتور و چک‌های تخصیص‌یافته)
// -------------------------------------------------------------
export function InvoiceDetailDialog({
  invoice,
  state,
  onClose,
  onSave,
  onOpenParty,
  onOpenCheck,
}: {
  invoice: Invoice;
  state: AppState;
  onClose: () => void;
  onSave?: (next: AppState, message: string) => void;
  onOpenParty?: (person: Person) => void;
  onOpenCheck?: (check: CheckType) => void;
}) {
  const [currentInvoice, setCurrentInvoice] = useState<Invoice>(invoice);
  const [inspectingPerson, setInspectingPerson] = useState<Person | null>(null);
  const [inspectingCheck, setInspectingCheck] = useState<CheckType | null>(null);

  // Edit invoice header state
  const [isEditingInvoice, setIsEditingInvoice] = useState(false);
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    number: currentInvoice.number,
    date: currentInvoice.date,
    discountAmount: currentInvoice.discountAmount || 0,
    note: currentInvoice.note || "",
    status: currentInvoice.status,
  });

  // Edit item state
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState({
    quantity: 1,
    unitPrice: 0,
    description: "",
    unit: "",
  });

  // Add item state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    productId: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    unit: "",
  });

  const party = currentInvoice.partyId
    ? state.people.find(p => p.id === currentInvoice.partyId)
    : undefined;

  // Compute FIFO check allocations for this invoice
  const allocations = useMemo(() => {
    return settleChecksFIFO(
      state.checks,
      state.invoices,
      state.paymentRules,
      state.settings.dayBasis,
      state.checkGroupAllocations || []
    ).filter(item => item.invoiceId === currentInvoice.id);
  }, [state, currentInvoice.id]);

  const itemsTotal = (currentInvoice.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );

  function handleDeleteInvoice() {
    if (
      !window.confirm(
        `آیا از حذف کامل فاکتور شماره ${currentInvoice.number} مطمئنید؟\nکالاهای این فاکتور به انبار بازگشت داده شده و کلیه تسویه‌ها برگشت خواهند خورد.`
      )
    )
      return;
    const res = deleteInvoiceAndRevert(state, currentInvoice.id);
    onSave?.(res.nextState, res.message);
    onClose();
  }

  function handleSaveInvoiceHeader(e: React.FormEvent) {
    e.preventDefault();
    const res = editInvoiceAndRevert(state, currentInvoice.id, {
      number: editInvoiceForm.number,
      date: editInvoiceForm.date,
      discountAmount: Number(editInvoiceForm.discountAmount) || 0,
      note: editInvoiceForm.note,
      status: editInvoiceForm.status as any,
    });
    const updated = res.nextState.invoices.find(i => i.id === currentInvoice.id);
    if (updated) setCurrentInvoice(updated);
    setIsEditingInvoice(false);
    onSave?.(res.nextState, res.message);
  }

  function handleSaveItemEdit(idx: number) {
    const res = editInvoiceItemAndRevert(state, currentInvoice.id, idx, {
      quantity: Number(itemForm.quantity) || 1,
      unitPrice: Number(itemForm.unitPrice) || 0,
      description: itemForm.description,
      unit: itemForm.unit,
    });
    const updated = res.nextState.invoices.find(i => i.id === currentInvoice.id);
    if (updated) setCurrentInvoice(updated);
    setEditingItemIdx(null);
    onSave?.(res.nextState, res.message);
  }

  function handleDeleteItem(idx: number, itemDesc: string) {
    if (
      !window.confirm(
        `قلم «${itemDesc}» حذف شود؟\nاثر آن بر موجودی انبار و مبلغ کل فاکتور بلافاصله برگشت داده می‌شود.`
      )
    )
      return;
    const res = deleteInvoiceItemAndRevert(state, currentInvoice.id, idx);
    const updated = res.nextState.invoices.find(i => i.id === currentInvoice.id);
    if (updated) setCurrentInvoice(updated);
    onSave?.(res.nextState, res.message);
  }

  function handleAddNewItem(e: React.FormEvent) {
    e.preventDefault();
    const res = addInvoiceItemAndApply(state, currentInvoice.id, {
      productId: newItemForm.productId || undefined,
      description: newItemForm.description,
      quantity: Number(newItemForm.quantity) || 1,
      unitPrice: Number(newItemForm.unitPrice) || 0,
      unit: newItemForm.unit,
    });
    const updated = res.nextState.invoices.find(i => i.id === currentInvoice.id);
    if (updated) setCurrentInvoice(updated);
    setIsAddingItem(false);
    setNewItemForm({ productId: "", description: "", quantity: 1, unitPrice: 0, unit: "" });
    onSave?.(res.nextState, res.message);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide"
        onMouseDown={e => e.stopPropagation()}
        style={{ width: "min(960px, 96vw)", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="dialog-header" style={{ marginBottom: 14 }}>
          <div>
            <span className="section-kicker">دفتر فاکتورها</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <h3 style={{ margin: 0 }}>
                فاکتور {currentInvoice.type}: {currentInvoice.number}
              </h3>
              <span
                className={`status-pill ${
                  currentInvoice.type === "فروش" ? "status-success" : "status-warning"
                }`}
              >
                {currentInvoice.type}
              </span>
              <span
                className={`status-pill ${
                  currentInvoice.status === "تسویه شده" ? "status-success" : "status-warning"
                }`}
              >
                {currentInvoice.status}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintActionMenu
              title={`فاکتور ${currentInvoice.type}: ${currentInvoice.number}`}
              filename={`فاکتور-${currentInvoice.number}`}
              getTargetElement={() =>
                document.getElementById(`invoice-detail-print-${currentInvoice.id}`)
              }
              onDirectPrint={() => window.print()}
              buttonLabel="چاپ و دانلود طومار"
              style={{ padding: "6px 12px", fontSize: "0.82rem" }}
            />
            {onSave && (
              <>
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    setIsEditingInvoice(!isEditingInvoice);
                    setEditInvoiceForm({
                      number: currentInvoice.number,
                      date: currentInvoice.date,
                      discountAmount: currentInvoice.discountAmount || 0,
                      note: currentInvoice.note || "",
                      status: currentInvoice.status,
                    });
                  }}
                  title="ویرایش مشخصات فاکتور"
                  style={{ color: "#0369a1" }}
                >
                  <Pencil size={15} />
                  {isEditingInvoice ? "لغو ویرایش" : "ویرایش فاکتور"}
                </button>
                <button
                  className="button button-ghost button-small"
                  onClick={handleDeleteInvoice}
                  title="حذف کامل فاکتور و بازگشت کالاها به انبار"
                  style={{ color: "#dc2626" }}
                >
                  <Trash2 size={15} />
                  حذف فاکتور
                </button>
              </>
            )}
            <button className="icon-button" onClick={onClose} title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Content Wrapper */}
        <div id={`invoice-detail-print-${currentInvoice.id}`} style={{ width: "100%", background: "#ffffff" }}>

        {/* Invoice Header Edit Form (when active) */}
        {isEditingInvoice && (
          <form
            onSubmit={handleSaveInvoiceHeader}
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0369a1", fontSize: "0.9rem" }}>
              ویرایش مشخصات اصلی فاکتور
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  شماره فاکتور:
                </label>
                <input
                  type="text"
                  value={editInvoiceForm.number}
                  onChange={e =>
                    setEditInvoiceForm({ ...editInvoiceForm, number: e.target.value })
                  }
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  تاریخ فاکتور:
                </label>
                <input
                  type="text"
                  value={editInvoiceForm.date}
                  onChange={e =>
                    setEditInvoiceForm({ ...editInvoiceForm, date: e.target.value })
                  }
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  تخفیف فاکتور:
                </label>
                <input
                  type="number"
                  value={editInvoiceForm.discountAmount}
                  onChange={e =>
                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      discountAmount: Number(e.target.value) || 0,
                    })
                  }
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  وضعیت فاکتور:
                </label>
                <select
                  value={editInvoiceForm.status}
                  onChange={e =>
                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      status: e.target.value as any,
                    })
                  }
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                >
                  <option value="باز">باز</option>
                  <option value="تسویه جزئی">تسویه جزئی</option>
                  <option value="تسویه شده">تسویه شده</option>
                  <option value="باطل">باطل</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                یادداشت یا توضیحات:
              </label>
              <input
                type="text"
                value={editInvoiceForm.note}
                onChange={e =>
                  setEditInvoiceForm({ ...editInvoiceForm, note: e.target.value })
                }
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setIsEditingInvoice(false)}
              >
                انصراف
              </button>
              <button type="submit" className="button button-primary button-small">
                ذخیره تغییرات فاکتور
              </button>
            </div>
          </form>
        )}

        {/* Customer & Info Card */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              {currentInvoice.type === "فروش" ? "خریدار / مشتری:" : "فروشنده / تأمین‌کننده:"}
            </span>
            <div style={{ marginTop: 2 }}>
              {party ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    if (onOpenParty) onOpenParty(party);
                    else setInspectingPerson(party);
                  }}
                  title="مشاهده پرونده مالی طرف حساب"
                >
                  <strong style={{ color: "#0369a1", fontSize: "1rem" }}>
                    {party.name} {party.code ? `(کد: ${party.code})` : ""}
                  </strong>
                </button>
              ) : (
                <strong>بدون طرف حساب</strong>
              )}
            </div>
            {party?.phone && (
              <small style={{ color: "#64748b", display: "block", marginTop: 2 }}>
                شماره تماس: {party.phone}
              </small>
            )}
          </div>

          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>تاریخ صدور فاکتور:</span>
            <div style={{ fontWeight: 700, fontSize: "1rem", marginTop: 2 }}>
              {formatDate(currentInvoice.date)}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>مبلغ کل فاکتور:</span>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0f172a", marginTop: 2 }}>
              {formatMoney(currentInvoice.amount, state.settings.currency)}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>مانده تسویه‌نشده:</span>
            <div
              style={{
                fontWeight: 800,
                fontSize: "1.15rem",
                color:
                  currentInvoice.amount - (currentInvoice.paidAmount || 0) > 0
                    ? "#b91c1c"
                    : "#15803d",
                marginTop: 2,
              }}
            >
              {formatMoney(
                Math.max(0, currentInvoice.amount - (currentInvoice.paidAmount || 0)),
                state.settings.currency
              )}
            </div>
          </div>
        </div>

        {/* Invoice Items Table */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong style={{ fontSize: "0.9rem", color: "#334155" }}>
              اقلام و ردیف‌های فاکتور ({formatNumber((currentInvoice.items || []).length)} ردیف)
            </strong>
            {onSave && (
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setIsAddingItem(!isAddingItem)}
                style={{ fontSize: "0.78rem", color: "#0369a1", gap: 4 }}
              >
                <Plus size={14} />
                افزودن قلم به فاکتور
              </button>
            )}
          </div>

          {/* Add Item Inline Form */}
          {isAddingItem && (
            <form
              onSubmit={handleAddNewItem}
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                gap: 8,
                alignItems: "end",
              }}
            >
              <div>
                <label style={{ fontSize: "0.74rem", color: "#374151", display: "block" }}>
                  انتخاب کالا / عنوان:
                </label>
                <select
                  value={newItemForm.productId}
                  onChange={e => {
                    const sel = state.products.find(p => p.id === e.target.value);
                    setNewItemForm({
                      ...newItemForm,
                      productId: e.target.value,
                      description: sel ? sel.name : "",
                      unitPrice: sel?.price || 0,
                      unit: sel?.unit || "عدد",
                    });
                  }}
                  style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                >
                  <option value="">-- کالا آزاد / دلخواه --</option>
                  {state.products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (موجودی: {formatNumber(p.stock)} {p.unit})
                    </option>
                  ))}
                </select>
                {!newItemForm.productId && (
                  <input
                    type="text"
                    placeholder="شرح کالا"
                    value={newItemForm.description}
                    onChange={e =>
                      setNewItemForm({ ...newItemForm, description: e.target.value })
                    }
                    required
                    style={{
                      width: "100%",
                      padding: "5px 6px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      marginTop: 4,
                    }}
                  />
                )}
              </div>
              <div>
                <label style={{ fontSize: "0.74rem", color: "#374151", display: "block" }}>
                  تعداد:
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={newItemForm.quantity}
                  onChange={e =>
                    setNewItemForm({ ...newItemForm, quantity: Number(e.target.value) || 1 })
                  }
                  required
                  style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.74rem", color: "#374151", display: "block" }}>
                  قیمت واحد:
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newItemForm.unitPrice}
                  onChange={e =>
                    setNewItemForm({ ...newItemForm, unitPrice: Number(e.target.value) || 0 })
                  }
                  required
                  style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.74rem", color: "#374151", display: "block" }}>
                  جمع کل:
                </label>
                <div style={{ fontWeight: 700, padding: "5px 0", fontSize: "0.85rem" }}>
                  {formatMoney(newItemForm.quantity * newItemForm.unitPrice, state.settings.currency)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="submit" className="button button-primary button-small">
                  ثبت قلم
                </button>
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={() => setIsAddingItem(false)}
                >
                  لغو
                </button>
              </div>
            </form>
          )}

          <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "5%" }}>#</th>
                  <th style={{ width: "30%" }}>شرح کالا یا خدمت</th>
                  <th style={{ width: "14%" }}>مقدار / تعداد</th>
                  <th style={{ width: "10%" }}>واحد</th>
                  <th style={{ width: "14%" }}>قیمت واحد</th>
                  <th style={{ width: "15%" }}>جمع ردیف</th>
                  {onSave && <th style={{ width: "12%" }}>عملیات</th>}
                </tr>
              </thead>
              <tbody>
                {(currentInvoice.items || []).map((item, idx) => {
                  const product = state.products.find(p => p.id === item.productId);
                  const qty = Number(item.quantity) || 0;
                  const price = Number(item.unitPrice) || 0;
                  const isEditingThis = editingItemIdx === idx;

                  if (isEditingThis) {
                    return (
                      <tr key={`edit-${idx}`} style={{ background: "#f0fdf4" }}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong>{product?.name || item.description}</strong>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={itemForm.quantity}
                            onChange={e =>
                              setItemForm({
                                ...itemForm,
                                quantity: Number(e.target.value) || 0,
                              })
                            }
                            style={{ width: "80px", padding: "4px" }}
                          />
                        </td>
                        <td>{item.unit || product?.unit || "عدد"}</td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={itemForm.unitPrice}
                            onChange={e =>
                              setItemForm({
                                ...itemForm,
                                unitPrice: Number(e.target.value) || 0,
                              })
                            }
                            style={{ width: "100px", padding: "4px" }}
                          />
                        </td>
                        <td className="amount-cell">
                          <strong>
                            {formatMoney(
                              itemForm.quantity * itemForm.unitPrice,
                              state.settings.currency
                            )}
                          </strong>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              className="button button-primary button-small"
                              onClick={() => handleSaveItemEdit(idx)}
                              title="ذخیره اصلاح"
                            >
                              <Save size={13} />
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button-small"
                              onClick={() => setEditingItemIdx(null)}
                              title="انصراف"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={`${item.productId}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{product?.name || item.description}</strong>
                        {product?.code && (
                          <small className="muted-cell" style={{ marginRight: 6 }}>
                            ({product.code})
                          </small>
                        )}
                      </td>
                      <td>{formatNumber(qty)}</td>
                      <td>{item.unit || product?.unit || "عدد"}</td>
                      <td className="amount-cell">
                        {formatMoney(price, state.settings.currency)}
                      </td>
                      <td className="amount-cell">
                        <strong>{formatMoney(qty * price, state.settings.currency)}</strong>
                      </td>
                      {onSave && (
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => {
                                setEditingItemIdx(idx);
                                setItemForm({
                                  quantity: qty,
                                  unitPrice: price,
                                  description: item.description,
                                  unit: item.unit || product?.unit || "عدد",
                                });
                              }}
                              title="ویرایش تعداد و قیمت این قلم"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                handleDeleteItem(idx, product?.name || item.description)
                              }
                              title="حذف این قلم از فاکتور و بازگشت موجودی"
                              style={{ color: "#dc2626" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Check Settlements / Allocations Subtable */}
        <div>
          <strong style={{ fontSize: "0.9rem", color: "#334155", display: "block", marginBottom: 6 }}>
            چک‌ها و پرداخت‌های تخصیص‌یافته به این فاکتور ({formatNumber(allocations.length)} مورد)
          </strong>
          {allocations.length ? (
            <div className="table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>اطلاعات چک</th>
                    <th>سررسید و بانک</th>
                    <th>روزهای دیرکرد و درصد</th>
                    <th>هزینه دیرکرد</th>
                    <th>مبلغ تسویه‌شده از چک</th>
                    <th>مانده چک</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(alloc => {
                    const check = state.checks.find(c => c.id === alloc.checkId);
                    return (
                      <tr
                        key={`${alloc.checkId}-${alloc.invoiceId}`}
                        className="clickable-row"
                        onClick={() => {
                          if (check) {
                            if (onOpenCheck) onOpenCheck(check);
                            else setInspectingCheck(check);
                          }
                        }}
                        title="برای مشاهده جزئیات کامل چک کلیک کنید"
                      >
                        <td>
                          <strong>{check?.sayadNumber || check?.number || "—"}</strong>
                          <span
                            className="badge teal"
                            style={{ display: "inline-block", marginRight: 6 }}
                          >
                            {formatMoney(check?.amount || 0, state.settings.currency)}
                          </span>
                        </td>
                        <td>
                          <div>{formatDate(check?.dueDate || "")}</div>
                          <small className="muted-cell">{check?.bank || "بانک"}</small>
                        </td>
                        <td>
                          <strong>{formatNumber(alloc.days || 0)} روز</strong>
                          {alloc.totalRate !== undefined && (
                            <small className="table-subline">
                              نرخ: {formatNumber(alloc.totalRate * 100)}%
                            </small>
                          )}
                        </td>
                        <td className="amount-cell" style={{ color: "#b45309" }}>
                          {alloc.lateFee
                            ? formatMoney(alloc.lateFee, state.settings.currency)
                            : "—"}
                        </td>
                        <td className="amount-cell" style={{ color: "#15803d" }}>
                          <strong>
                            {formatMoney(alloc.amount, state.settings.currency)}
                          </strong>
                        </td>
                        <td className="amount-cell">
                          {alloc.remainingCheck !== undefined
                            ? formatMoney(alloc.remainingCheck, state.settings.currency)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: 8,
                padding: "16px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              هنوز چکی به این فاکتور تخصیص نیافته است یا فاکتور به صورت نقدی ثبت شده است.
            </div>
          )}
        </div>

        {currentInvoice.note && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 8,
              fontSize: "0.85rem",
            }}
          >
            <span style={{ color: "#64748b" }}>یادداشت فاکتور: </span>
            <strong>{currentInvoice.note}</strong>
          </div>
        )}
        </div>
      </div>

      {inspectingPerson && (
        <PartyLedgerDialog
          person={inspectingPerson}
          state={state}
          onClose={() => setInspectingPerson(null)}
          onSave={onSave}
        />
      )}

      {inspectingCheck && (
        <CheckDetailDialog
          check={inspectingCheck}
          state={state}
          onClose={() => setInspectingCheck(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 4. Check Detail Dialog (مشخصات و جزئیات چک و فاکتورهای تسویه‌شده)
// -------------------------------------------------------------
export function CheckDetailDialog({
  check,
  state,
  onClose,
  onSave,
  onOpenParty,
  onOpenAccount,
  onOpenInvoice,
}: {
  check: CheckType | AppState["issuedChecks"][number];
  state: AppState;
  onClose: () => void;
  onSave?: (next: AppState, message: string) => void;
  onOpenParty?: (person: Person) => void;
  onOpenAccount?: (account: AppState["accounts"][number]) => void;
  onOpenInvoice?: (invoice: Invoice) => void;
}) {
  const [currentCheck, setCurrentCheck] = useState<CheckType>(check as CheckType);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    number: currentCheck.number,
    sayadNumber: (currentCheck as any).sayadNumber || "",
    amount: currentCheck.amount,
    dueDate: currentCheck.dueDate,
    status: currentCheck.status,
    bank: currentCheck.bank || "",
    bankAccountId: currentCheck.bankAccountId || "",
    note: currentCheck.note || "",
    feeAmount: currentCheck.feeAmount || 0,
  });

  const [inspectingPerson, setInspectingPerson] = useState<Person | null>(null);
  const [inspectingAccount, setInspectingAccount] = useState<
    AppState["accounts"][number] | null
  >(null);
  const [inspectingInvoice, setInspectingInvoice] = useState<Invoice | null>(null);

  const isIssued = "beneficiaryPartyId" in currentCheck || "purpose" in currentCheck;

  const partyId = isIssued
    ? (currentCheck as any).beneficiaryPartyId || (currentCheck as any).issuerPartyId
    : (currentCheck as CheckType).partyId;
  const party = partyId ? state.people.find(p => p.id === partyId) : undefined;

  const bankAccount = currentCheck.bankAccountId
    ? state.accounts.find(a => a.id === currentCheck.bankAccountId)
    : undefined;

  // Compute FIFO settled invoices for received checks
  const settlements = useMemo(() => {
    if (isIssued) return [];
    return settleChecksFIFO(
      state.checks,
      state.invoices,
      state.paymentRules,
      state.settings.dayBasis,
      state.checkGroupAllocations || []
    ).filter(item => item.checkId === currentCheck.id);
  }, [state, currentCheck.id, isIssued]);

  function handleDeleteCheck() {
    if (
      !window.confirm(
        `آیا از حذف چک شماره ${currentCheck.number} مطمئنید؟\nدر صورت وصول بودن، اثر آن بر مانده حساب بانک معکوس شده و کلیه تسویه‌های فاکتور لغو می‌شود.`
      )
    )
      return;
    const res = deleteCheckAndRevert(state, currentCheck.id);
    onSave?.(res.nextState, res.message);
    onClose();
  }

  function handleSaveCheck(e: React.FormEvent) {
    e.preventDefault();
    const res = editCheckAndRevert(state, currentCheck.id, {
      number: editForm.number,
      sayadNumber: editForm.sayadNumber,
      amount: Number(editForm.amount) || 0,
      dueDate: editForm.dueDate,
      status: editForm.status as any,
      bank: editForm.bank,
      bankAccountId: editForm.bankAccountId || undefined,
      note: editForm.note,
      feeAmount: Number(editForm.feeAmount) || 0,
    });
    const updated = res.nextState.checks.find(c => c.id === currentCheck.id);
    if (updated) setCurrentCheck(updated);
    setIsEditing(false);
    onSave?.(res.nextState, res.message);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide"
        onMouseDown={e => e.stopPropagation()}
        style={{ width: "min(960px, 96vw)", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="dialog-header" style={{ marginBottom: 14 }}>
          <div>
            <span className="section-kicker">
              {isIssued ? "دفتر چک‌های صادره کارگاه" : "دفتر چک‌های دریافتی"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <h3 style={{ margin: 0 }}>
                {isIssued ? "چک صادره" : "چک دریافتی"} شماره:{" "}
                {(currentCheck as any).sayadNumber || currentCheck.number}
              </h3>
              <span className={`status-pill`}>{currentCheck.status}</span>
              {!(currentCheck as any).sayadNumber && (
                <small className="muted-cell">چک سنتی / عادی</small>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintActionMenu
              title={`چک ${currentCheck.number} (${currentCheck.status})`}
              filename={`چک-${currentCheck.number}`}
              getTargetElement={() =>
                document.getElementById(`check-detail-print-${currentCheck.id}`)
              }
              onDirectPrint={() => window.print()}
              buttonLabel="چاپ و دانلود طومار"
              style={{ padding: "6px 12px", fontSize: "0.82rem" }}
            />
            {onSave && !isIssued && (
              <>
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    setIsEditing(!isEditing);
                    setEditForm({
                      number: currentCheck.number,
                      sayadNumber: (currentCheck as any).sayadNumber || "",
                      amount: currentCheck.amount,
                      dueDate: currentCheck.dueDate,
                      status: currentCheck.status,
                      bank: currentCheck.bank || "",
                      bankAccountId: currentCheck.bankAccountId || "",
                      note: currentCheck.note || "",
                      feeAmount: currentCheck.feeAmount || 0,
                    });
                  }}
                  title="ویرایش مشخصات چک"
                  style={{ color: "#0369a1" }}
                >
                  <Pencil size={15} />
                  {isEditing ? "لغو ویرایش" : "ویرایش چک"}
                </button>
                <button
                  className="button button-ghost button-small"
                  onClick={handleDeleteCheck}
                  title="حذف کامل چک و برگشت آثار مالی"
                  style={{ color: "#dc2626" }}
                >
                  <Trash2 size={15} />
                  حذف چک
                </button>
              </>
            )}
            <button className="icon-button" onClick={onClose} title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Content Wrapper */}
        <div id={`check-detail-print-${currentCheck.id}`} style={{ width: "100%", background: "#ffffff" }}>

        {/* Check Edit Form (when active) */}
        {isEditing && (
          <form
            onSubmit={handleSaveCheck}
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0369a1", fontSize: "0.9rem" }}>
              ویرایش مشخصات و وضعیت چک
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
              }}
            >
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  شماره چک:
                </label>
                <input
                  type="text"
                  value={editForm.number}
                  onChange={e => setEditForm({ ...editForm, number: e.target.value })}
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  شناسه صیادی (۱۶ رقمی):
                </label>
                <input
                  type="text"
                  value={editForm.sayadNumber}
                  onChange={e => setEditForm({ ...editForm, sayadNumber: e.target.value })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  مبلغ چک:
                </label>
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) || 0 })}
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  تاریخ سررسید:
                </label>
                <input
                  type="text"
                  value={editForm.dueDate}
                  onChange={e => setEditForm({ ...editForm, dueDate: e.target.value })}
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  وضعیت چک:
                </label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                >
                  <option value="در جریان وصول">در جریان وصول</option>
                  <option value="وصول شده">وصول شده</option>
                  <option value="برگشتی">برگشتی</option>
                  <option value="عودت">عودت داده شده</option>
                  <option value="باطل">باطل</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  بانک / شعبه:
                </label>
                <input
                  type="text"
                  value={editForm.bank}
                  onChange={e => setEditForm({ ...editForm, bank: e.target.value })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  حساب بانکی وصول/واریز:
                </label>
                <select
                  value={editForm.bankAccountId}
                  onChange={e => setEditForm({ ...editForm, bankAccountId: e.target.value })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                >
                  <option value="">-- بدون حساب بانکی --</option>
                  {state.accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                  کارمزد یا سود:
                </label>
                <input
                  type="number"
                  value={editForm.feeAmount}
                  onChange={e => setEditForm({ ...editForm, feeAmount: Number(e.target.value) || 0 })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", color: "#475569", display: "block" }}>
                یادداشت:
              </label>
              <input
                type="text"
                value={editForm.note}
                onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setIsEditing(false)}
              >
                انصراف
              </button>
              <button type="submit" className="button button-primary button-small">
                ذخیره تغییرات چک
              </button>
            </div>
          </form>
        )}

        {/* Main Details Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>مبلغ چک:</span>
            <div
              style={{
                fontWeight: 900,
                fontSize: "1.3rem",
                color: isIssued ? "#b91c1c" : "#15803d",
                marginTop: 2,
              }}
            >
              {formatMoney(check.amount, state.settings.currency)}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>تاریخ سررسید:</span>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", marginTop: 2 }}>
              {formatDate(check.dueDate)}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              بانک و شعبه صادرکننده:
            </span>
            <div style={{ fontWeight: 700, marginTop: 2 }}>
              {(check as any).bank || (check as any).bankName || "نامشخص"}{" "}
              {(check as any).branch ? `· شعبه ${(check as any).branch}` : ""}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              {isIssued ? "دریافت‌کننده / ذی‌نفع:" : "واگذارکننده / طرف حساب:"}
            </span>
            <div style={{ marginTop: 2 }}>
              {party ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    if (onOpenParty) onOpenParty(party);
                    else setInspectingPerson(party);
                  }}
                  title="مشاهده پرونده مالی شخص"
                >
                  <strong style={{ color: "#0369a1", fontSize: "1rem" }}>
                    {party.name} {party.code ? `(کد: ${party.code})` : ""}
                  </strong>
                </button>
              ) : (
                <strong>نامشخص</strong>
              )}
            </div>
          </div>
        </div>

        {/* Bank Account Connection Strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            background: "#f1f5f9",
            border: "1px solid #cbd5e1",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              حساب بانکی یا صندوق متصل:
            </span>
            <div style={{ marginTop: 2 }}>
              {bankAccount ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    if (onOpenAccount) onOpenAccount(bankAccount);
                    else setInspectingAccount(bankAccount);
                  }}
                  title="مشاهده گردش حساب بانکی"
                >
                  <strong style={{ color: "#0369a1", fontSize: "0.95rem" }}>
                    {bankAccount.name} ({bankAccount.type})
                  </strong>
                  <small style={{ color: "#64748b", marginRight: 8 }}>
                    موجودی: {formatMoney(bankAccount.balance, state.settings.currency)}
                  </small>
                </button>
              ) : (
                <span className="muted-cell">هنوز حسابی متصل نشده است.</span>
              )}
            </div>
          </div>

          {!(check as any).isIssued && (check as CheckType).targetInvoiceId && (
            <div>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>فاکتور هدف اختصاصی:</span>
              <div>
                <span className="badge amber">
                  فاکتور{" "}
                  {state.invoices.find(
                    i => i.id === (check as CheckType).targetInvoiceId
                  )?.number || "اختصاصی"}
                </span>
              </div>
            </div>
          )}

          {check.status === "وصول شده" && (
            <div>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>تاریخ وصول:</span>
              <div style={{ fontWeight: 700, color: "#15803d" }}>
                {formatDate((check as any).collectedDate || check.dueDate)}
              </div>
            </div>
          )}
        </div>

        {/* Settled Invoices Table (for Received Checks) */}
        {!isIssued && (
          <div>
            <strong
              style={{
                fontSize: "0.9rem",
                color: "#334155",
                display: "block",
                marginBottom: 6,
              }}
            >
              فاکتورهای تسویه‌شده با این چک ({formatNumber(settlements.length)} فاکتور)
            </strong>
            {settlements.length ? (
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>شماره فاکتور</th>
                      <th>تاریخ فاکتور</th>
                      <th>مبلغ فاکتور</th>
                      <th>روزهای دیرکرد و درصد</th>
                      <th>کارمزد دیرکرد</th>
                      <th>مبلغ تسویه از این چک</th>
                      <th>مانده فاکتور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map(item => {
                      const invoice = state.invoices.find(i => i.id === item.invoiceId);
                      return (
                        <tr
                          key={`${item.checkId}-${item.invoiceId}`}
                          className="clickable-row"
                          onClick={() => {
                            if (invoice) {
                              if (onOpenInvoice) onOpenInvoice(invoice);
                              else setInspectingInvoice(invoice);
                            }
                          }}
                          title="برای مشاهده جزئیات کامل فاکتور کلیک کنید"
                        >
                          <td>
                            <strong>{invoice?.number || "—"}</strong>
                          </td>
                          <td>{formatDate(invoice?.date || "")}</td>
                          <td className="amount-cell">
                            {formatMoney(invoice?.amount || 0, state.settings.currency)}
                          </td>
                          <td>
                            <strong>{formatNumber(item.days || 0)} روز</strong>
                            {item.totalRate !== undefined && (
                              <small className="table-subline">
                                نرخ: {formatNumber(item.totalRate * 100)}%
                              </small>
                            )}
                          </td>
                          <td className="amount-cell" style={{ color: "#b45309" }}>
                            {item.lateFee
                              ? formatMoney(item.lateFee, state.settings.currency)
                              : "—"}
                          </td>
                          <td className="amount-cell" style={{ color: "#15803d" }}>
                            <strong>
                              {formatMoney(item.amount, state.settings.currency)}
                            </strong>
                          </td>
                          <td className="amount-cell">
                            {item.remainingInvoiceBase !== undefined
                              ? formatMoney(
                                  item.remainingInvoiceBase,
                                  state.settings.currency
                                )
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 8,
                  padding: "16px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                هنوز فاکتوری با این چک تسویه نشده است (مبلغ چک آزاد است).
              </div>
            )}
          </div>
        )}

        {/* Issued check purpose / notes */}
        {isIssued && (
          <div
            style={{
              padding: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          >
            <span style={{ color: "#64748b", fontSize: "0.8rem" }}>بابت / شرح صدور: </span>
            <strong>{(currentCheck as any).purpose || "—"}</strong>
          </div>
        )}
        </div>
      </div>

      {inspectingPerson && (
        <PartyLedgerDialog
          person={inspectingPerson}
          state={state}
          onClose={() => setInspectingPerson(null)}
          onSave={onSave}
        />
      )}

      {inspectingAccount && (
        <AccountLedgerDialog
          account={inspectingAccount}
          state={state}
          onClose={() => setInspectingAccount(null)}
          onSave={onSave}
        />
      )}

      {inspectingInvoice && (
        <InvoiceDetailDialog
          invoice={inspectingInvoice}
          state={state}
          onClose={() => setInspectingInvoice(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 5. Transaction Detail Dialog (جزئیات کامل یک عملیات مالی)
// -------------------------------------------------------------
export function TransactionDetailDialog({
  transaction,
  state,
  onClose,
  onSave,
  onOpenParty,
  onOpenAccount,
  onOpenCheck,
}: {
  transaction: Transaction;
  state: AppState;
  onClose: () => void;
  onSave?: (next: AppState, message: string) => void;
  onOpenParty?: (person: Person) => void;
  onOpenAccount?: (account: AppState["accounts"][number]) => void;
  onOpenCheck?: (check: CheckType) => void;
}) {
  const [currentTx, setCurrentTx] = useState<Transaction>(transaction);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    amount: currentTx.amount,
    date: currentTx.date,
    type: currentTx.type,
    accountId: currentTx.accountId || "",
    fromAccountId: currentTx.fromAccountId || "",
    toAccountId: currentTx.toAccountId || "",
    partyId: currentTx.partyId || "",
    note: currentTx.note || "",
    feeAmount: currentTx.feeAmount || 0,
    partnerEffect: currentTx.partnerEffect,
  });

  const [inspectingPerson, setInspectingPerson] = useState<Person | null>(null);
  const [inspectingAccount, setInspectingAccount] = useState<
    AppState["accounts"][number] | null
  >(null);
  const [inspectingCheck, setInspectingCheck] = useState<CheckType | null>(null);

  const party = currentTx.partyId
    ? state.people.find(p => p.id === currentTx.partyId)
    : undefined;
  const account = currentTx.accountId
    ? state.accounts.find(a => a.id === currentTx.accountId)
    : undefined;
  const fromAccount = currentTx.fromAccountId
    ? state.accounts.find(a => a.id === currentTx.fromAccountId)
    : undefined;
  const toAccount = currentTx.toAccountId
    ? state.accounts.find(a => a.id === currentTx.toAccountId)
    : undefined;
  const product = currentTx.productId
    ? state.products.find(p => p.id === currentTx.productId)
    : undefined;
  const warehouse = currentTx.warehouseId
    ? state.warehouses.find(w => w.id === currentTx.warehouseId)
    : undefined;
  const check = currentTx.checkId
    ? state.checks.find(c => c.id === currentTx.checkId)
    : undefined;

  function handleDeleteTransaction() {
    if (
      !window.confirm(
        `آیا از حذف این سند مالی مطمئنید؟\nاثر آن بر مانده حساب‌ها و موجودی کالا به حالت پیش از این تراکنش بازگردانده می‌شود.`
      )
    )
      return;
    const res = deleteTransactionAndRevert(state, currentTx.id);
    onSave?.(res.nextState, res.message);
    onClose();
  }

  function handleSaveTransaction(e: React.FormEvent) {
    e.preventDefault();
    const res = editTransactionAndRevert(state, currentTx.id, {
      amount: Number(editForm.amount) || 0,
      date: editForm.date,
      type: editForm.type as any,
      accountId: editForm.accountId || undefined,
      fromAccountId: editForm.fromAccountId || undefined,
      toAccountId: editForm.toAccountId || undefined,
      partyId: editForm.partyId || undefined,
      note: editForm.note,
      feeAmount: Number(editForm.feeAmount) || 0,
      partnerEffect: editForm.partnerEffect as any,
    });
    const updated = res.nextState.transactions.find(t => t.id === currentTx.id);
    if (updated) setCurrentTx(updated);
    setIsEditing(false);
    onSave?.(res.nextState, res.message);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        onMouseDown={e => e.stopPropagation()}
        style={{ width: "min(640px, 95vw)" }}
      >
        <div className="dialog-header">
          <div>
            <span className="section-kicker">دفتر عملیات مالی</span>
            <h3>جزئیات سند: {currentTx.type}</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintActionMenu
              title={`سند مالی: ${currentTx.type} (${formatDate(currentTx.date)})`}
              filename={`سند-${currentTx.type.replace(/\s+/g, "_")}`}
              getTargetElement={() =>
                document.getElementById(`transaction-detail-print-${currentTx.id}`)
              }
              onDirectPrint={() => window.print()}
              buttonLabel="چاپ و دانلود"
              style={{ padding: "5px 10px", fontSize: "0.8rem" }}
            />
            {onSave && (
              <>
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    setIsEditing(!isEditing);
                    setEditForm({
                      amount: currentTx.amount,
                      date: currentTx.date,
                      type: currentTx.type,
                      accountId: currentTx.accountId || "",
                      fromAccountId: currentTx.fromAccountId || "",
                      toAccountId: currentTx.toAccountId || "",
                      partyId: currentTx.partyId || "",
                      note: currentTx.note || "",
                      feeAmount: currentTx.feeAmount || 0,
                      partnerEffect: currentTx.partnerEffect,
                    });
                  }}
                  title="ویرایش این سند"
                  style={{ color: "#0369a1" }}
                >
                  <Pencil size={14} />
                  {isEditing ? "لغو ویرایش" : "ویرایش"}
                </button>
                <button
                  className="button button-ghost button-small"
                  onClick={handleDeleteTransaction}
                  title="حذف سند و بازگشت مانده حساب‌ها"
                  style={{ color: "#dc2626" }}
                >
                  <Trash2 size={14} />
                  حذف
                </button>
              </>
            )}
            <button className="icon-button" onClick={onClose} title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Content Wrapper */}
        <div id={`transaction-detail-print-${currentTx.id}`} style={{ width: "100%", background: "#ffffff" }}>

        {/* Edit Form */}
        {isEditing && (
          <form
            onSubmit={handleSaveTransaction}
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0369a1", fontSize: "0.88rem" }}>
              ویرایش سند مالی و اثرات حسابی
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                  مبلغ:
                </label>
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) || 0 })}
                  required
                  style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                  تاریخ:
                </label>
                <input
                  type="text"
                  value={editForm.date}
                  onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                  required
                  style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>
            {currentTx.type === "انتقال بین حساب‌ها" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                    حساب مبدأ:
                  </label>
                  <select
                    value={editForm.fromAccountId}
                    onChange={e => setEditForm({ ...editForm, fromAccountId: e.target.value })}
                    style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  >
                    {state.accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                    حساب مقصد:
                  </label>
                  <select
                    value={editForm.toAccountId}
                    onChange={e => setEditForm({ ...editForm, toAccountId: e.target.value })}
                    style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  >
                    {state.accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                    کارمزد:
                  </label>
                  <input
                    type="number"
                    value={editForm.feeAmount}
                    onChange={e => setEditForm({ ...editForm, feeAmount: Number(e.target.value) || 0 })}
                    style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                  حساب مالی مرتبط:
                </label>
                <select
                  value={editForm.accountId}
                  onChange={e => setEditForm({ ...editForm, accountId: e.target.value })}
                  style={{ width: "100%", padding: "5px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                >
                  <option value="">-- بدون حساب --</option>
                  {state.accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                یادداشت:
              </label>
              <input
                type="text"
                value={editForm.note}
                onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setIsEditing(false)}
              >
                انصراف
              </button>
              <button type="submit" className="button button-primary button-small">
                ذخیره تغییرات سند
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Main Strip */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>مبلغ تراکنش</span>
              <div
                style={{
                  fontSize: "1.3rem",
                  fontWeight: 800,
                  color: "#1e293b",
                  marginTop: 2,
                }}
              >
                {formatMoney(transaction.amount, state.settings.currency)}
              </div>
              <small style={{ color: "#0369a1", fontWeight: 600 }}>
                {cashDirectionLabel(transaction.type)}
              </small>
            </div>
            <div style={{ textAlign: "left" }}>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>تاریخ سند</span>
              <div style={{ fontWeight: 700, marginTop: 2 }}>
                {formatDate(transaction.date)}
              </div>
              <span
                className="status-pill"
                style={{ marginTop: 4, display: "inline-block" }}
              >
                {transaction.status}
              </span>
            </div>
          </div>

          {/* Details list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: "0.85rem",
            }}
          >
            {party && (
              <div
                className="clickable-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
                onClick={() => {
                  if (onOpenParty) onOpenParty(party);
                  else setInspectingPerson(party);
                }}
                title="مشاهده پرونده مالی شخص"
              >
                <span style={{ color: "#64748b" }}>طرف حساب / شخص:</span>
                <strong style={{ color: "#0369a1" }}>
                  {party.name} {party.code ? `(کد: ${party.code})` : ""}
                </strong>
              </div>
            )}

            {transaction.type === "انتقال بین حساب‌ها" ? (
              <>
                <div
                  className="clickable-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#f1f5f9",
                    borderRadius: 8,
                  }}
                  onClick={() => {
                    if (fromAccount) {
                      if (onOpenAccount) onOpenAccount(fromAccount);
                      else setInspectingAccount(fromAccount);
                    }
                  }}
                  title="مشاهده گردش حساب مبدأ"
                >
                  <span style={{ color: "#64748b" }}>حساب مبدأ (برداشت):</span>
                  <strong style={{ color: "#b91c1c" }}>
                    {fromAccount ? `${fromAccount.name} (${fromAccount.type})` : "—"}
                  </strong>
                </div>
                <div
                  className="clickable-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#f1f5f9",
                    borderRadius: 8,
                  }}
                  onClick={() => {
                    if (toAccount) {
                      if (onOpenAccount) onOpenAccount(toAccount);
                      else setInspectingAccount(toAccount);
                    }
                  }}
                  title="مشاهده گردش حساب مقصد"
                >
                  <span style={{ color: "#64748b" }}>حساب مقصد (واریز):</span>
                  <strong style={{ color: "#15803d" }}>
                    {toAccount ? `${toAccount.name} (${toAccount.type})` : "—"}
                  </strong>
                </div>
                {transaction.feeAmount && transaction.feeAmount > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "#fef3c7",
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ color: "#92400e" }}>کارمزد بانکی انتقال:</span>
                    <strong style={{ color: "#92400e" }}>
                      {formatMoney(transaction.feeAmount, state.settings.currency)} (از
                      مبدأ)
                    </strong>
                  </div>
                ) : null}
              </>
            ) : (
              account && (
                <div
                  className="clickable-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#f1f5f9",
                    borderRadius: 8,
                  }}
                  onClick={() => {
                    if (onOpenAccount) onOpenAccount(account);
                    else setInspectingAccount(account);
                  }}
                  title="مشاهده گردش حساب مالی"
                >
                  <span style={{ color: "#64748b" }}>حساب مالی / صندوق:</span>
                  <strong style={{ color: "#0369a1" }}>
                    {account.name} ({account.type})
                  </strong>
                </div>
              )
            )}

            {product && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: "#64748b" }}>کالا و مقدار:</span>
                <strong>
                  {product.name} · {formatNumber(transaction.quantity || 0)}{" "}
                  {transaction.unit || product.unit}
                </strong>
              </div>
            )}

            {warehouse && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: "#64748b" }}>انبار مرتبط:</span>
                <strong>{warehouse.name}</strong>
              </div>
            )}

            {check && (
              <div
                className="clickable-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
                onClick={() => {
                  if (onOpenCheck) onOpenCheck(check);
                  else setInspectingCheck(check);
                }}
                title="مشاهده مشخصات کامل چک"
              >
                <span style={{ color: "#64748b" }}>چک پرداختی متصل:</span>
                <strong style={{ color: "#0369a1" }}>
                  شماره {check.number} (سررسید: {formatDate(check.dueDate)})
                </strong>
              </div>
            )}

            {transaction.partnerEffect && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: "#64748b" }}>اثر بر مانده شریک:</span>
                <span className="badge amber">{transaction.partnerEffect}</span>
              </div>
            )}

            {transaction.note && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    display: "block",
                    color: "#64748b",
                    fontSize: "0.75rem",
                    marginBottom: 2,
                  }}
                >
                  شرح و مستندات:
                </span>
                <strong>{currentTx.note || transaction.note}</strong>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {inspectingPerson && (
        <PartyLedgerDialog
          person={inspectingPerson}
          state={state}
          onClose={() => setInspectingPerson(null)}
          onSave={onSave}
        />
      )}

      {inspectingAccount && (
        <AccountLedgerDialog
          account={inspectingAccount}
          state={state}
          onClose={() => setInspectingAccount(null)}
          onSave={onSave}
        />
      )}

      {inspectingCheck && (
        <CheckDetailDialog
          check={inspectingCheck}
          state={state}
          onClose={() => setInspectingCheck(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 6. Event Detail Dialog (جزئیات اصلاح مانده و افتتاحیه نقدینگی)
// -------------------------------------------------------------
export function EventDetailDialog({
  event,
  account,
  state,
  onClose,
  onSave,
  onOpenParty,
  onOpenCounterAccount,
}: {
  event: any;
  account: AppState["accounts"][number];
  state: AppState;
  onClose: () => void;
  onSave?: (next: AppState, message: string) => void;
  onOpenParty?: (p: Person) => void;
  onOpenCounterAccount?: (a: AppState["accounts"][number]) => void;
}) {
  const [currentEvent, setCurrentEvent] = useState(event);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    amount: currentEvent.inflow || currentEvent.outflow || currentEvent.amount || 0,
    note: currentEvent.note || "",
    date: currentEvent.date || todayJalali(),
  });

  const party = currentEvent.partyId
    ? state.people.find(p => p.id === currentEvent.partyId)
    : undefined;
  const counterAccount = currentEvent.counterAccountId
    ? state.accounts.find(a => a.id === currentEvent.counterAccountId)
    : undefined;

  function handleDeleteEvent() {
    if (
      !window.confirm(
        "آیا از حذف این رویداد نقدینگی مطمئنید؟ مانده حساب به مقدار اولیه برگشت داده می‌شود."
      )
    )
      return;
    const res = deleteCashEventAndRevert(state, currentEvent.sourceId || currentEvent.id);
    onSave?.(res.nextState, res.message);
    onClose();
  }

  function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    const res = editCashEventAndRevert(state, currentEvent.sourceId || currentEvent.id, {
      amount: Number(editForm.amount) || 0,
      note: editForm.note,
      date: editForm.date,
    });
    const updated = res.nextState.cashEvents.find(
      ev => ev.id === (currentEvent.sourceId || currentEvent.id)
    );
    if (updated) setCurrentEvent(updated);
    setIsEditing(false);
    onSave?.(res.nextState, res.message);
  }

  const eventAmount =
    currentEvent.inflow !== undefined
      ? currentEvent.inflow > 0
        ? currentEvent.inflow
        : currentEvent.outflow
      : currentEvent.amount || 0;

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        onMouseDown={e => e.stopPropagation()}
        style={{ width: "min(560px, 95vw)" }}
      >
        <div className="dialog-header">
          <div>
            <span className="section-kicker">دفتر معین نقدینگی</span>
            <h3>جزئیات رویداد: {currentEvent.type || "اصلاح نقدینگی"}</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintActionMenu
              title={`رویداد نقدینگی: ${currentEvent.type || "اصلاح"} (${account.name})`}
              filename={`رویداد-${account.name}`}
              getTargetElement={() =>
                document.getElementById(`event-detail-print-${currentEvent.id}`)
              }
              onDirectPrint={() => window.print()}
              buttonLabel="چاپ و دانلود"
              style={{ padding: "5px 10px", fontSize: "0.8rem" }}
            />
            {onSave && (
              <>
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    setIsEditing(!isEditing);
                    setEditForm({
                      amount: eventAmount,
                      note: currentEvent.note || "",
                      date: currentEvent.date || todayJalali(),
                    });
                  }}
                  title="ویرایش این سند"
                  style={{ color: "#0369a1" }}
                >
                  <Pencil size={14} />
                  {isEditing ? "لغو ویرایش" : "ویرایش"}
                </button>
                <button
                  className="button button-ghost button-small"
                  onClick={handleDeleteEvent}
                  title="حذف سند و بازگشت مانده حساب"
                  style={{ color: "#dc2626" }}
                >
                  <Trash2 size={14} />
                  حذف
                </button>
              </>
            )}
            <button className="icon-button" onClick={onClose} title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Content Wrapper */}
        <div id={`event-detail-print-${currentEvent.id}`} style={{ width: "100%", background: "#ffffff" }}>

        {isEditing && (
          <form
            onSubmit={handleSaveEvent}
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0369a1", fontSize: "0.88rem" }}>
              ویرایش سند نقدینگی و مانده حساب
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                  مبلغ:
                </label>
                <input
                  type="number"
                  value={editForm.amount}
                  onChange={e =>
                    setEditForm({ ...editForm, amount: Number(e.target.value) || 0 })
                  }
                  required
                  style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                  تاریخ:
                </label>
                <input
                  type="text"
                  value={editForm.date}
                  onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                  required
                  style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "0.76rem", color: "#475569", display: "block" }}>
                یادداشت:
              </label>
              <input
                type="text"
                value={editForm.note}
                onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => setIsEditing(false)}
              >
                انصراف
              </button>
              <button type="submit" className="button button-primary button-small">
                ذخیره تغییرات رویداد
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Main Strip */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>مبلغ رویداد</span>
              <div
                style={{
                  fontSize: "1.3rem",
                  fontWeight: 800,
                  color: event.inflow > 0 ? "#15803d" : "#b91c1c",
                  marginTop: 2,
                }}
              >
                {event.inflow > 0
                  ? `+${formatMoney(event.inflow, state.settings.currency)}`
                  : `-${formatMoney(event.outflow, state.settings.currency)}`}
              </div>
              <small style={{ color: "#0369a1", fontWeight: 600 }}>{event.type}</small>
            </div>
            <div style={{ textAlign: "left" }}>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>تاریخ</span>
              <div style={{ fontWeight: 700, marginTop: 2 }}>
                {formatDate(event.date)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: "0.85rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#f1f5f9",
                borderRadius: 8,
              }}
            >
              <span style={{ color: "#64748b" }}>حساب جاری:</span>
              <strong>
                {account.name} ({account.type})
              </strong>
            </div>

            {event.runningBalance !== undefined && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: "#64748b" }}>مانده پس از این رویداد:</span>
                <strong>
                  {formatMoney(event.runningBalance, state.settings.currency)}
                </strong>
              </div>
            )}

            {party && (
              <div
                className="clickable-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
                onClick={() => onOpenParty && onOpenParty(party)}
                title="مشاهده پرونده مالی شخص"
              >
                <span style={{ color: "#64748b" }}>طرف حساب مرتبط:</span>
                <strong style={{ color: "#0369a1" }}>
                  {party.name} {party.code ? `(کد: ${party.code})` : ""}
                </strong>
              </div>
            )}

            {counterAccount && (
              <div
                className="clickable-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 8,
                }}
                onClick={() => onOpenCounterAccount && onOpenCounterAccount(counterAccount)}
                title="مشاهده گردش حساب مقابل"
              >
                <span style={{ color: "#64748b" }}>حساب مقابل (انتقال):</span>
                <strong style={{ color: "#0369a1" }}>
                  {counterAccount.name} ({counterAccount.type})
                </strong>
              </div>
            )}

            {currentEvent.note && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    display: "block",
                    color: "#64748b",
                    fontSize: "0.75rem",
                    marginBottom: 2,
                  }}
                >
                  شرح و توضیحات:
                </span>
                <strong>{currentEvent.note}</strong>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
