import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  Check,
  Calendar,
  ChevronDown,
  Clock3,
  Cloud,
  CloudDownload,
  CloudUpload,
  FileClock,
  FileDown,
  FileJson,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Pencil,
  Plus,
  Percent,
  RefreshCw,
  Tags,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  Trash2,
  Undo2,
  Redo2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  AppState,
  BankFeeRule,
  CheckGroupAllocation,
  CheckStatus,
  PERSON_TYPES,
  ProductionCost,
  ProductionMaterial,
  ProductionFormula,
  ProductionRecord,
  Product,
  PartnerSettlementDirection,
  PageId,
  TransactionType,
  appendAudit,
  calculateMetrics,
  createId,
  formatDate,
  formatMoney,
  formatNumber,
  currencyLabel,
  normalizeCurrencyCode,
  parseLocalizedNumber,
  calculateInvoiceAmount,
  loadState,
  navItems,
  personName,
  saveState,
  todayJalali,
  jalaliDayDifference,
  jalaliDateKey,
  jalaliMonthDayBasis,
  jalaliWeekday,
  transactionLabel,
  calculateLateProfit,
  calculateEffectiveProfitForAllocation,
  buildCollectionProfitReport,
  settleChecksFIFO,
  getSettlementBalances,
  allocateCheckFIFO,
  rebuildCheckAllocations,
  rebuildPurchasePayables,
  rebuildCashProjection,
  createEmptyState,
  suggestNextNumber,
  suggestNextPartyNumber,
  quantityInBase,
  unitConversionToBase,
  calculateBaseUnitLine,
  adjustInventoryBalance,
  executeProduction,
  calculateCurrentProductionUnitCost,
  refreshProductionRecordPrice,
  removeProductionRun,
  reconcileLedgerEvents,
  inventoryLedgerDiscrepancies,
  cashLedgerDiscrepancies,
  auditDataIntegrity,
  cashAccountReconciliation,
  calculateBankTransferFee,
  refreshIssuedCheckStatuses,
  settleIssuedCheck,
  appendPurchasePaymentCashEvents,
  releasePurchasePaymentsForInvoice,
  purchasePaymentIdsExclusiveToInvoice,
  STORAGE_KEY,
} from "@/lib/accounting";
import {
  createGoogleDriveAdapter,
  getDriveAccessToken,
  LAST_VERIFIED_BACKUP,
  PROJECT_BACKUPS_FOLDER_ID,
  PROJECT_BACKUPS_FOLDER_URL,
  PROJECT_DRIVE_FOLDER_URL,
  getDriveClientId,
  requestDriveAccessToken,
  setDriveClientId,
  type DriveBackupFile,
} from "@/lib/googleDrive";
import {
  completeDropboxAuth,
  disconnectDropbox,
  downloadDropboxBackup,
  getDropboxAppKey,
  isDropboxConnected,
  listDropboxBackups,
  startDropboxAuth,
  uploadDropboxBackup,
  type DropboxBackupFile,
} from "@/lib/dropbox";
import {
  deleteRestoreSnapshot,
  exportUnifiedPayload,
  importUnifiedPayload,
  listRestoreSnapshots,
  saveRestoreSnapshot,
  type RestoreSnapshot,
} from "@/lib/backup";
import { loadVendorDirectory, saveVendorDirectory } from "@/lib/vendorDirectory";
import { BUILD_IDENTITY, buildIdentityLabel } from "@/lib/buildIdentity";
import {
  createCredential,
  hasLocalCredential,
  validatePassword,
  validatePin,
  verifyCredential,
  type LocalSecuritySettings,
} from "@/lib/security";
import VendorDirectory from "@/pages/VendorDirectory";
import { PWAInstallButton } from "@/components/PWAInstallButton";

const iconMap = {
  "layout-dashboard": LayoutDashboard,
  "file-text": FileText,
  "arrow-left-right": ArrowLeftRight,
  users: Users,
  boxes: Boxes,
  "file-clock": FileClock,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "clipboard-list": ClipboardList,
  "cloud-cog": Cloud,
  settings: Settings2,
  tags: Tags,
  percent: Percent,
  "lock-keyhole": LockKeyhole,
  "wallet-cards": WalletCards,
} as const;

function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof iconMap;
  size?: number;
}) {
  const Component = iconMap[name];
  return <Component size={size} strokeWidth={1.8} />;
}

function statusClass(status: string) {
  if (["وصول شده", "ثبت شده", "تودیع شده", "پرداخت‌شده"].includes(status))
    return "status-success";
  if (["برگشتی", "باطل"].includes(status)) return "status-danger";
  return "status-warning";
}

function invoiceDirectionLabel(type: "فروش" | "خرید") {
  return type === "فروش" ? "فروش · طلب از مشتری" : "خرید · بدهی به تأمین‌کننده";
}

function invoiceBalanceLabel(type: "فروش" | "خرید") {
  return type === "فروش" ? "مانده طلب" : "مانده بدهی";
}

function cashDirectionLabel(type: string) {
  return ["دریافت", "درآمد", "فروش کالا"].includes(type)
    ? "ورود وجه / افزایش موجودی حساب"
    : "خروج وجه / کاهش موجودی حساب";
}

function partyBalanceDescriptor(state: AppState, personId: string) {
  const invoices = state.invoices.filter(
    invoice => invoice.partyId === personId && invoice.status !== "باطل"
  );
  const salesOutstanding = invoices
    .filter(invoice => invoice.type === "فروش")
    .reduce(
      (sum, invoice) =>
        sum + Math.max(0, invoice.amount - (invoice.paidAmount || 0)),
      0
    );
  const purchaseTotal = invoices
    .filter(invoice => invoice.type === "خرید")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const purchasePaid = state.purchasePayments
    .filter(payment => payment.supplierId === personId)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const net = salesOutstanding - Math.max(0, purchaseTotal - purchasePaid);
  if (Math.abs(net) < 0.01)
    return { amount: 0, label: "تسویه / بدون مانده", tone: "muted-cell" };
  return net > 0
    ? { amount: net, label: "طلب از طرف حساب", tone: "amount-negative" }
    : { amount: Math.abs(net), label: "بدهی به طرف حساب", tone: "amount-positive" };
}

function printWithTarget(
  target: string,
  landscape = false,
  onCleanup?: () => void
) {
  const className = `print-${target}`;
  const orientationClass = "print-landscape";
  document.body.classList.add(className);
  document.body.classList.toggle(orientationClass, landscape);
  const cleanup = () => {
    document.body.classList.remove(className);
    document.body.classList.remove(orientationClass);
    onCleanup?.();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  window.setTimeout(cleanup, 1500);
}

function backupDateKey() {
  return todayJalali().replace(/\//g, "-");
}

function backupFilename(dateKey: string, sequence: number) {
  return `backup-${dateKey}-${String(sequence).padStart(3, "0")}.json`;
}

function nextLocalBackupSequence(dateKey: string) {
  const key = `accounting-workshop-pwa-aistudio:backup-sequence:${dateKey}`;
  const next = (Number(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

function nextDriveBackupSequence(files: DriveBackupFile[], dateKey: string) {
  const prefix = `backup-${dateKey}-`;
  return (
    (files.reduce((max, file) => {
      if (!file.name.startsWith(prefix) || !file.name.endsWith(".json"))
        return max;
      const sequence = Number(file.name.slice(prefix.length, -".json".length));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0) || 0) + 1
  );
}

function nextDropboxBackupSequence(files: DropboxBackupFile[], dateKey: string) {
  const prefix = `dropbox-backup-${dateKey}-`;
  return (
    (files.reduce((max, file) => {
      if (!file.name.startsWith(prefix) || !file.name.endsWith(".json")) return max;
      const sequence = Number(file.name.slice(prefix.length, -".json".length));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0) || 0) + 1
  );
}

function SortControl({
  direction,
  onChange,
  ascLabel = "از ابتدا",
  descLabel = "از انتها",
}: {
  direction: "asc" | "desc";
  onChange: (direction: "asc" | "desc") => void;
  ascLabel?: string;
  descLabel?: string;
}) {
  return (
    <div className="sort-control" role="group" aria-label="مرتب‌سازی">
      <button
        type="button"
        className={direction === "asc" ? "active" : ""}
        onClick={() => onChange("asc")}
      >
        {ascLabel}
      </button>
      <button
        type="button"
        className={direction === "desc" ? "active" : ""}
        onClick={() => onChange("desc")}
      >
        {descLabel}
      </button>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const visiblePages = pageCount <= 7
    ? pages
    : Array.from(new Set([1, page - 1, page, page + 1, pageCount]))
        .filter(value => value >= 1 && value <= pageCount)
        .sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="صفحه‌بندی فهرست">
      <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>قبلی</button>
      {visiblePages.map((value, index) => (
        <Fragment key={value}>
          {index > 0 && value - visiblePages[index - 1] > 1 && <span>…</span>}
          <button
            type="button"
            className={value === page ? "active" : ""}
            onClick={() => onChange(value)}
            aria-current={value === page ? "page" : undefined}
          >
            {formatNumber(value)}
          </button>
        </Fragment>
      ))}
      <button type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>بعدی</button>
    </nav>
  );
}

function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const today = todayJalali().split("/").map(Number);
  const parsed = value
    ? value.replace(/-/g, "/").split("/").map(Number)
    : today;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({
    year: parsed[0] || today[0],
    month: parsed[1] || today[1],
  });
  const monthNames = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];
  const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
  const daysInMonth = jalaliMonthDayBasis(`${view.year}/${view.month}/01`);
  const firstDay = jalaliWeekday(view.year, view.month, 1);
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1
  );
  function shiftMonth(delta: number) {
    setView(current =>
      current.month + delta > 12
        ? { year: current.year + 1, month: 1 }
        : current.month + delta < 1
          ? { year: current.year - 1, month: 12 }
          : { year: current.year, month: current.month + delta }
    );
  }
  return (
    <div className="jalali-picker">
      <button
        type="button"
        className="jalali-picker-trigger"
        onClick={() => {
          setView({
            year: parsed[0] || today[0],
            month: parsed[1] || today[1],
          });
          setOpen(current => !current);
        }}
      >
        <Calendar size={15} />
        <span>{value ? formatDate(value) : placeholder}</span>
      </button>
      {open && (
        <div className="jalali-calendar" role="dialog" aria-label="تقویم شمسی">
          <div className="jalali-calendar-head">
            <button type="button" onClick={() => shiftMonth(1)}>
              ›
            </button>
            <strong>
              {monthNames[view.month - 1]} {formatNumber(view.year)}
            </strong>
            <button type="button" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
          </div>
          <div className="jalali-weekdays">
            {weekdays.map(day => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="jalali-days">
            {cells.map((day, index) =>
              day ? (
                <button
                  type="button"
                  key={day}
                  className={
                    value ===
                    `${view.year}/${String(view.month).padStart(2, "0")}/${String(day).padStart(2, "0")}`
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    onChange(
                      `${view.year}/${String(view.month).padStart(2, "0")}/${String(day).padStart(2, "0")}`
                    );
                    setOpen(false);
                  }}
                >
                  {formatNumber(day)}
                </button>
              ) : (
                <span key={`empty-${index}`} />
              )
            )}
          </div>
          <button
            type="button"
            className="jalali-today"
            onClick={() => {
              onChange(todayJalali());
              setView({ year: today[0], month: today[1] });
              setOpen(false);
            }}
          >
            امروز
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
  onAction,
  actionLabel,
}: {
  title: string;
  description: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FileJson size={22} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      {onAction && actionLabel && (
        <button
          className="button button-primary button-small"
          onClick={onAction}
        >
          <Plus size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function LocalLockScreen({
  security,
  onUnlock,
}: {
  security?: LocalSecuritySettings;
  onUnlock: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const hasPassword = Boolean(security?.password?.hash);
  const hasPin = Boolean(security?.pin?.hash);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!value || checking) return;
    setChecking(true);
    setError("");
    const valid =
      (hasPassword && security?.password
        ? await verifyCredential(value, security.password)
        : false) ||
      (hasPin && security?.pin
        ? await verifyCredential(value, security.pin)
        : false);
    setChecking(false);
    if (!valid) {
      setValue("");
      setError("رمز عبور یا PIN صحیح نیست");
      return;
    }
    onUnlock();
  }

  return (
    <div className="lock-screen" dir="rtl">
      <div className="lock-card">
        <div className="backup-hero-icon"><LockKeyhole size={26} /></div>
        <span className="section-kicker">امنیت محلی</span>
        <h1>قفل کارگاه</h1>
        <p>برای ورود به اطلاعات حسابداری، رمز عبور یا PIN ثبت‌شده را وارد کنید.</p>
        <form onSubmit={unlock} className="lock-form">
          <label>
            رمز عبور یا PIN
            <input
              autoFocus
              type="password"
              inputMode={hasPin && !hasPassword ? "numeric" : "text"}
              autoComplete="current-password"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={hasPassword && hasPin ? "رمز عبور یا PIN" : hasPin ? "PIN" : "رمز عبور"}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary" type="submit" disabled={checking || !value}>
            <LockKeyhole size={16} /> {checking ? "در حال بررسی…" : "ورود به کارگاه"}
          </button>
        </form>
        <small className="muted-cell">این قفل محلی است و جایگزین احراز هویت سرور یا رمزگذاری فایل پشتیبان نیست.</small>
      </div>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [isUnlocked, setIsUnlocked] = useState(() =>
    !hasLocalCredential(loadState().settings.security)
  );
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([
    LAST_VERIFIED_BACKUP,
  ]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [dropboxBackups, setDropboxBackups] = useState<DropboxBackupFile[]>([]);
  const [dropboxLoading, setDropboxLoading] = useState(false);
  const [dropboxAppKey, setDropboxAppKeyState] = useState(() => getDropboxAppKey());
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [driveClientId, setDriveClientIdState] = useState(() =>
    getDriveClientId()
  );
  const [pastStates, setPastStates] = useState<AppState[]>([]);
  const [futureStates, setFutureStates] = useState<AppState[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (activePage === "backup") void handleDriveRefresh();
  }, [activePage]);
  useEffect(() => {
    void completeDropboxAuth()
      .then(connected => {
        if (connected) {
          setNotice("Dropbox با موفقیت برای این مرورگر متصل شد");
          void handleDropboxRefresh();
        }
      })
      .catch(error => {
        setNotice(error instanceof Error ? error.message : "اتصال Dropbox ناموفق بود");
      });
  }, []);
  useEffect(() => {
    setMobileNav(false);
  }, [activePage]);
  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undoState();
      } else if (
        event.key.toLowerCase() === "y" ||
        (event.key.toLowerCase() === "z" && event.shiftKey)
      ) {
        event.preventDefault();
        redoState();
      }
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  });

  const metrics = useMemo(() => calculateMetrics(state), [state]);
  const activeNav =
    navItems.find(item => item.id === activePage) || navItems[0];

  function commitState(
    next: AppState,
    message: string,
    action: string = "UPDATE"
  ) {
    setPastStates(items => [...items.slice(-49), state]);
    setFutureStates([]);
    const reconciled = reconcileLedgerEvents(
      state,
      refreshIssuedCheckStatuses(rebuildPurchasePayables(next))
    );
    setState(saveState(appendAudit(rebuildCashProjection(reconciled), action, message)));
    setNotice(message);
  }

  function updateState(next: AppState, message: string) {
    commitState(next, message);
  }

  function undoState() {
    if (!pastStates.length) {
      setNotice("تغییری برای بازگشت وجود ندارد");
      return;
    }
    const previous = pastStates[pastStates.length - 1];
    setPastStates(items => items.slice(0, -1));
    setFutureStates(items => [state, ...items].slice(0, 50));
    setState(saveState(previous));
    setNotice("آخرین تغییر بازگردانده شد");
  }

  function redoState() {
    if (!futureStates.length) {
      setNotice("تغییری برای انجام دوباره وجود ندارد");
      return;
    }
    const next = futureStates[0];
    setFutureStates(items => items.slice(1));
    setPastStates(items => [...items.slice(-49), state]);
    setState(saveState(next));
    setNotice("تغییر دوباره اعمال شد");
  }

  if (!isUnlocked) {
    return (
      <LocalLockScreen
        security={state.settings.security}
        onUnlock={() => setIsUnlocked(true)}
      />
    );
  }

  function handleExport() {
    const dateKey = backupDateKey();
    const sequence = nextLocalBackupSequence(dateKey);
    const blob = new Blob([exportUnifiedPayload(state, loadVendorDirectory())], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFilename(dateKey, sequence);
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      `نسخهٔ پشتیبان ${dateKey} · ردیف ${formatNumber(sequence)} آماده شد`
    );
  }

  function importAndRepairAllocations(payload: string) {
    const imported = importUnifiedPayload(payload);
    return {
      state: rebuildCheckAllocations(imported.accounting),
      vendorDirectory: imported.vendorDirectory,
      unified: imported.unified,
    };
  }

  function applyImportedBackup(payload: string, message: string, action: string) {
    const imported = importAndRepairAllocations(payload);
    saveRestoreSnapshot(exportUnifiedPayload(state, loadVendorDirectory()));
    setSnapshotRevision(current => current + 1);
    if (imported.vendorDirectory) saveVendorDirectory(imported.vendorDirectory);
    commitState(imported.state, message, action);
    return imported.unified;
  }

  function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const unified = applyImportedBackup(
          String(reader.result),
          `بازیابی از ${file.name}`,
          "RESTORE"
        );
        if (!unified) setNotice("نسخهٔ قدیمی حسابداری بازیابی شد؛ دفتر تأمین‌کنندگان تغییری نکرد");
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "خواندن فایل ناموفق بود"
        );
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function handleManualImport(payload: string) {
    try {
      if (!window.confirm("اطلاعات فعلی با این متن پشتیبان جایگزین شود؟"))
        return;
      applyImportedBackup(payload.trim(), "بازیابی با متن JSON", "RESTORE_MANUAL");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "متن پشتیبان معتبر نیست"
      );
    }
  }

  function handleRestoreSnapshot(snapshot: RestoreSnapshot) {
    if (
      !window.confirm(
        "وضعیت فعلی با snapshot محلی جایگزین شود؟ پیش از این کار یک snapshot جدید از وضعیت فعلی ساخته می‌شود."
      )
    )
      return;
    try {
      applyImportedBackup(
        snapshot.payload,
        `بازیابی از snapshot محلی ${formatDate(snapshot.createdAt.slice(0, 10))}`,
        "RESTORE_LOCAL_SNAPSHOT"
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "بازیابی snapshot ناموفق بود"
      );
    }
  }

  function handleDeleteSnapshot(snapshot: RestoreSnapshot) {
    if (!window.confirm("این snapshot محلی حذف شود؟")) return;
    deleteRestoreSnapshot(snapshot.id);
    setSnapshotRevision(current => current + 1);
    setNotice("snapshot محلی حذف شد");
  }

  function handleClearAll() {
    handleExport();
    const cleared = createEmptyState(state);
    commitState(
      cleared,
      "ابتدا بکاپ دانلود و سپس اطلاعات کسب‌وکار پاک شد",
      "CLEAR_ALL"
    );
  }

  async function handleDriveUpload() {
    const token = getDriveAccessToken();
    if (!token) {
      setNotice(
        "Google Drive به این مرورگر متصل نیست؛ مجوز OAuth موقت دریافت نشده است. بکاپ محلی آماده دانلود است."
      );
      handleExport();
      return;
    }
    try {
      let adapter = createGoogleDriveAdapter(token, PROJECT_BACKUPS_FOLDER_ID);
      const dateKey = backupDateKey();
      let existing: DriveBackupFile[];
      try {
        existing = await adapter.listBackups();
      } catch {
        adapter = createGoogleDriveAdapter(token);
        existing = await adapter.listBackups();
        setNotice(
          "پوشه قدیمی Drive قابل دسترسی نبود؛ نسخه در فضای برنامه ذخیره می‌شود"
        );
      }
      const sequence = nextDriveBackupSequence(existing, dateKey);
      const filename = backupFilename(dateKey, sequence);
      const uploaded = await adapter.uploadBackup(
        filename,
        exportUnifiedPayload(state, loadVendorDirectory())
      );
      setDriveBackups(current => [
        uploaded,
        ...current.filter(file => file.id !== uploaded.id),
      ]);
      setNotice(
        `پشتیبان ${dateKey} · ردیف ${formatNumber(sequence)} در Drive ذخیره شد`
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "بارگذاری در Drive ناموفق بود"
      );
    }
  }

  async function handleDriveConnect(clientId: string) {
    setNotice("در حال بازکردن پنجرهٔ مجوز Google Drive...");
    try {
      setDriveClientId(clientId);
      setDriveClientIdState(clientId.trim());
      const token = await requestDriveAccessToken(clientId);
      window.__ACCOUNTING_DRIVE_ACCESS_TOKEN__ = token;
      setNotice("Google Drive با موفقیت برای این مرورگر متصل شد");
      await handleDriveRefresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "اتصال Google Drive ناموفق بود";
      setNotice(
        message.toLowerCase().includes("invalid_client")
          ? "Google Client ID قدیمی یا نامعتبر است؛ صفحه را با بازکردن دوبارهٔ لینک به‌روز کنید و دوباره تلاش کنید."
          : message
      );
    }
  }

  async function handleDriveRefresh() {
    const token = getDriveAccessToken();
    if (!token) {
      setNotice(
        "Google Drive به این مرورگر متصل نیست؛ برای بازیابی، فایل JSON را از پوشه Drive دانلود و در بخش بازیابی دستی وارد کنید."
      );
      return;
    }
    setDriveLoading(true);
    try {
      let files: DriveBackupFile[];
      try {
        files = await createGoogleDriveAdapter(
          token,
          PROJECT_BACKUPS_FOLDER_ID
        ).listBackups();
      } catch {
        files = await createGoogleDriveAdapter(token).listBackups();
        setNotice(
          "پوشه قدیمی قابل خواندن نبود؛ فهرست فایل‌های برنامه خوانده شد"
        );
      }
      setDriveBackups(files.length ? files : [LAST_VERIFIED_BACKUP]);
      setNotice(
        `${formatNumber(files.length)} نسخهٔ پشتیبان از Drive خوانده شد`
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "خواندن فهرست Drive ناموفق بود"
      );
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleDriveRestore(fileId = LAST_VERIFIED_BACKUP.id) {
    if (
      !window.confirm(
        "داده‌های محلی با آخرین نسخه Google Drive جایگزین شود؟ قبل از ادامه، از داده فعلی بکاپ بگیرید."
      )
    )
      return;
    const token = getDriveAccessToken();
    if (!token) {
      setNotice(
        "Google Drive به این مرورگر متصل نیست؛ از لینک پوشه فایل JSON را دانلود و در بخش بازیابی دستی وارد کنید."
      );
      return;
    }
    try {
      const file =
        driveBackups.find(item => item.id === fileId) || LAST_VERIFIED_BACKUP;
      const payload = await createGoogleDriveAdapter(
        token,
        PROJECT_BACKUPS_FOLDER_ID
      ).downloadBackup(file.id);
      applyImportedBackup(payload, `بازیابی از ${file.name}`, "RESTORE_DRIVE");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "بازیابی از Drive ناموفق بود"
      );
    }
  }

  async function handleDropboxUpload() {
    if (!isDropboxConnected()) {
      setNotice("Dropbox به این مرورگر متصل نیست؛ ابتدا اتصال Dropbox را انجام دهید");
      return;
    }
    setDropboxLoading(true);
    try {
      const existing = await listDropboxBackups();
      const dateKey = backupDateKey();
      const sequence = nextDropboxBackupSequence(existing, dateKey);
      const filename = `dropbox-backup-${dateKey}-${String(sequence).padStart(3, "0")}.json`;
      const uploaded = await uploadDropboxBackup(
        filename,
        exportUnifiedPayload(state, loadVendorDirectory())
      );
      setDropboxBackups(current => [uploaded, ...current.filter(file => file.id !== uploaded.id)]);
      setNotice(`پشتیبان ${dateKey} · ردیف ${formatNumber(sequence)} در Dropbox ذخیره شد`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "ذخیره در Dropbox ناموفق بود");
    } finally {
      setDropboxLoading(false);
    }
  }

  async function handleDropboxConnect(appKey: string) {
    try {
      setDropboxAppKeyState(appKey.trim());
      await startDropboxAuth(appKey);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "اتصال Dropbox ناموفق بود");
    }
  }

  async function handleDropboxRefresh() {
    if (!isDropboxConnected()) return;
    setDropboxLoading(true);
    try {
      const files = await listDropboxBackups();
      setDropboxBackups(files);
      setNotice(`${formatNumber(files.length)} نسخهٔ پشتیبان از Dropbox خوانده شد`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "خواندن فهرست Dropbox ناموفق بود");
    } finally {
      setDropboxLoading(false);
    }
  }

  async function handleDropboxRestore(fileId: string) {
    if (!window.confirm("داده‌های محلی با نسخهٔ انتخاب‌شدهٔ Dropbox جایگزین شود؟ قبل از ادامه، از داده فعلی بکاپ بگیرید.")) return;
    const file = dropboxBackups.find(item => item.id === fileId);
    if (!file) {
      setNotice("نسخهٔ انتخاب‌شدهٔ Dropbox پیدا نشد");
      return;
    }
    try {
      const payload = await downloadDropboxBackup(file.id);
      applyImportedBackup(payload, `بازیابی از ${file.name}`, "RESTORE_DROPBOX");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "بازیابی از Dropbox ناموفق بود");
    }
  }

  function addTransaction(input: {
    type: TransactionType;
    amount: number;
    partyId?: string;
    note: string;
    date: string;
  }) {
    const next = {
      ...state,
      transactions: [
        { id: createId("txn"), status: "ثبت شده" as const, ...input },
        ...state.transactions,
      ],
    };
    updateState(next, `ثبت ${transactionLabel(input.type)} جدید`);
    setQuickOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <span>ک</span>
          </div>
          <div>
            <strong>کارگاه</strong>
            <small>دفتر هوشمند</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">ک</div>
          <div>
            <strong>{state.settings.businessName}</strong>
            <small>نسخه محلی فعال</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">منوی اصلی</div>
        <nav className="main-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => {
                setActivePage(item.id);
                setMobileNav(false);
              }}
            >
              <span className="nav-icon">
                <Icon name={item.icon as keyof typeof iconMap} size={18} />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.caption}</small>
              </span>
              {item.id === "checks" &&
                state.checks.filter(check => check.status === "برگشتی").length >
                  0 && (
                  <b className="nav-count">
                    {
                      state.checks.filter(check => check.status === "برگشتی")
                        .length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-card">
            <div className="online-dot" />
            <div>
              <strong>ذخیره‌سازی محلی</strong>
              <small>اطلاعات روی همین دستگاه</small>
            </div>
          </div>
          <div
            className="build-identity"
            title={`منبع: ${BUILD_IDENTITY.repository} · شاخه: ${BUILD_IDENTITY.branch}`}
            data-build-identity={BUILD_IDENTITY.repository}
          >
            <strong>{BUILD_IDENTITY.sourceLabel}</strong>
            <small>{buildIdentityLabel()}</small>
          </div>
          <button
            className="settings-link"
            onClick={() => setActivePage("settings")}
          >
            <Settings2 size={17} />
            تنظیمات برنامه
          </button>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="بستن منو"
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}>
              <Menu size={21} />
            </button>
            <div>
              <div className="eyebrow">{todayJalali()}</div>
              <h1>{activeNav.label}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <PWAInstallButton />
            <div className="save-indicator">
              <span />
              <span>ذخیره خودکار فعال</span>
            </div>
            <button
              className="icon-button history-button"
              title="برگشت یک مرحله (Ctrl/Cmd+Z)"
              aria-label="برگشت یک مرحله"
              disabled={!pastStates.length}
              onClick={undoState}
            >
              <Undo2 size={18} />
              <span className="history-label">Undo</span>
            </button>
            <button
              className="icon-button history-button"
              title="انجام دوباره (Ctrl/Cmd+Y)"
              aria-label="انجام دوباره"
              disabled={!futureStates.length}
              onClick={redoState}
            >
              <Redo2 size={18} />
              <span className="history-label">Redo</span>
            </button>
            <button
              className="icon-button"
              title="پشتیبان‌گیری"
              onClick={handleExport}
            >
              <FileDown size={18} />
            </button>
            <button className="user-chip">
              <span className="user-avatar">م</span>
              <span className="user-name">مدیر کارگاه</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <div className="content-wrap">
          {activePage === "invoices" && (
            <Invoices
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "vendorDirectory" && (
            <VendorDirectory onNotice={setNotice} />
          )}
          {activePage === "dashboard" && (
            <Dashboard
              state={state}
              metrics={metrics}
              onQuick={() => setQuickOpen(true)}
              onNavigate={setActivePage}
            />
          )}
          {activePage === "transactions" && (
            <Transactions
              state={state}
              onQuick={() => setQuickOpen(true)}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "payroll" && (
            <PayrollPage
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "banks" && (
            <BankAccounts
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "people" && (
            <People
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "inventory" && (
            <Inventory
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "production" && (
            <Production
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "prices" && (
            <Prices
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "paymentRules" && (
            <PaymentRules
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "checks" && (
            <Checks
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "monthClose" && (
            <MonthClose
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
          {activePage === "reports" && (
            <Reports state={state} metrics={metrics} />
          )}
          {activePage === "backup" && (
            <BackupPage
              state={state}
              onExport={handleExport}
              onImport={() => fileInput.current?.click()}
              onManualImport={handleManualImport}
              onClearAll={handleClearAll}
              onDriveRestore={handleDriveRestore}
              onDriveUpload={handleDriveUpload}
              driveBackups={driveBackups}
              driveLoading={driveLoading}
              onDriveRefresh={handleDriveRefresh}
              driveClientId={driveClientId}
              onDriveConnect={handleDriveConnect}
              dropboxBackups={dropboxBackups}
              dropboxLoading={dropboxLoading}
              onDropboxRefresh={handleDropboxRefresh}
              onDropboxUpload={handleDropboxUpload}
              onDropboxRestore={handleDropboxRestore}
              dropboxAppKey={dropboxAppKey}
              onDropboxConnect={handleDropboxConnect}
              onDropboxDisconnect={async () => {
                await disconnectDropbox();
                setDropboxBackups([]);
                setNotice("Dropbox از این مرورگر قطع شد");
              }}
              snapshotRevision={snapshotRevision}
              onRestoreSnapshot={handleRestoreSnapshot}
              onDeleteSnapshot={handleDeleteSnapshot}
            />
          )}
          {activePage === "settings" && (
            <SettingsPage
              state={state}
              onSave={(next, msg) => updateState(next, msg)}
            />
          )}
        </div>
      </main>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleImport}
      />
      {quickOpen && (
        <QuickAdd
          onClose={() => setQuickOpen(false)}
          people={state.people}
          currency={state.settings.currency}
          onSave={addTransaction}
        />
      )}
      {notice && (
        <div className="toast">
          <Check size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}

function Dashboard({
  state,
  metrics,
  onQuick,
  onNavigate,
}: {
  state: AppState;
  metrics: ReturnType<typeof calculateMetrics>;
  onQuick: () => void;
  onNavigate: (page: PageId) => void;
}) {
  const recent = state.transactions.slice(0, 5);
  return (
    <div className="page-stack page-enter">
      <section className="welcome-row">
        <div>
          <div className="eyebrow accent-eyebrow">مرکز کنترل کارگاه</div>
          <h2>
            خلاصهٔ امروز، <em>روشن و ساده</em>
          </h2>
          <p>
            اطلاعات مالی و عملیاتی را یک‌جا ببینید و با خیال راحت جلو بروید.
          </p>
        </div>
        <button className="button button-primary" onClick={onQuick}>
          <Plus size={18} />
          ثبت عملیات جدید
        </button>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="دریافت این دوره"
          value={formatMoney(metrics.receipts, state.settings.currency)}
          helper="نقدینگی واردشده"
          icon={<ArrowDownLeft size={20} />}
          tone="mint"
        />
        <MetricCard
          label="پرداخت و هزینه"
          value={formatMoney(metrics.payments, state.settings.currency)}
          helper="خروجی ثبت‌شده"
          icon={<ArrowUpRight size={20} />}
          tone="rose"
        />
        <MetricCard
          label="مانده خالص"
          value={formatMoney(metrics.balance, state.settings.currency)}
          helper="دریافت منهای پرداخت"
          icon={<WalletCards size={20} />}
          tone="indigo"
        />
        <MetricCard
          label="چک‌های در جریان"
          value={formatMoney(
            metrics.outstandingChecks,
            state.settings.currency
          )}
          helper={`${formatNumber(state.checks.length)} فقره ثبت‌شده`}
          icon={<FileClock size={20} />}
          tone="amber"
        />
      </section>
      <section className="dashboard-grid">
        <div className="panel large-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">گردش مالی</span>
              <h3>آخرین عملیات</h3>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("transactions")}
            >
              مشاهده همه <ArrowLeftRight size={15} />
            </button>
          </div>
          {recent.length ? (
            <div className="activity-list">
              {recent.map(item => (
                <ActivityRow key={item.id} item={item} state={state} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="هنوز عملیاتی ثبت نشده"
              description="اولین فروش، دریافت یا هزینهٔ کارگاه را ثبت کنید تا گردش مالی اینجا نمایش داده شود."
              onAction={onQuick}
              actionLabel="ثبت اولین عملیات"
            />
          )}
        </div>
        <div className="panel action-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">دسترسی سریع</span>
              <h3>کارهای روزانه</h3>
            </div>
            <span className="panel-dot" />
          </div>
          <div className="quick-actions">
            <QuickAction
              icon={<ArrowDownLeft />}
              label="ثبت دریافت"
              tone="mint"
              onClick={onQuick}
            />
            <QuickAction
              icon={<ArrowUpRight />}
              label="ثبت پرداخت"
              tone="rose"
              onClick={onQuick}
            />
            <QuickAction
              icon={<Users />}
              label="طرف حساب جدید"
              tone="violet"
              onClick={() => onNavigate("people")}
            />
            <QuickAction
              icon={<Boxes />}
              label="بررسی موجودی"
              tone="amber"
              onClick={() => onNavigate("inventory")}
            />
          </div>
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <span>
              <strong>داده‌ها در امان‌اند</strong>
              <small>ذخیره خودکار روی دستگاه شما فعال است.</small>
            </span>
          </div>
        </div>
      </section>
      <section className="bottom-grid">
        <div className="mini-panel">
          <div className="mini-panel-title">
            <span className="mini-icon mint">
              <Users size={17} />
            </span>
            <span>
              <strong>طرف حساب‌ها</strong>
              <small>دفتر ارتباطات مالی</small>
            </span>
          </div>
          <strong className="big-number">
            {formatNumber(state.people.length)}
          </strong>
          <button className="under-button" onClick={() => onNavigate("people")}>
            مدیریت طرف حساب‌ها <ArrowLeftRight size={14} />
          </button>
        </div>
        <div className="mini-panel">
          <div className="mini-panel-title">
            <span className="mini-icon amber">
              <Boxes size={17} />
            </span>
            <span>
              <strong>موجودی کالا</strong>
              <small>کالاهای قابل پیگیری</small>
            </span>
          </div>
          <strong className="big-number">
            {formatNumber(state.products.length)}
          </strong>
          <button
            className="under-button"
            onClick={() => onNavigate("inventory")}
          >
            مشاهده انبار <ArrowLeftRight size={14} />
          </button>
        </div>
        <div className="mini-panel">
          <div className="mini-panel-title">
            <span className="mini-icon violet">
              <Banknote size={17} />
            </span>
            <span>
              <strong>حساب‌های نقدی</strong>
              <small>بانک و صندوق</small>
            </span>
          </div>
          <strong className="big-number">
            {formatMoney(
              state.accounts.reduce((sum, account) => sum + account.balance, 0),
              state.settings.currency
            )}
          </strong>
          <button
            className="under-button"
            onClick={() => onNavigate("reports")}
          >
            گزارش نقدینگی <ArrowLeftRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
      <div className="metric-spark">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
function QuickAction({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className={`quick-icon ${tone}`}>{icon}</span>
      <span>{label}</span>
      <ArrowLeftRight size={14} />
    </button>
  );
}
function ActivityRow({
  item,
  state,
}: {
  item: AppState["transactions"][number];
  state: AppState;
}) {
  const incoming = ["دریافت", "درآمد"].includes(item.type);
  return (
    <div className="activity-row">
      <span className={`activity-icon ${incoming ? "mint" : "rose"}`}>
        {incoming ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
      </span>
      <span className="activity-main">
        <strong>{transactionLabel(item.type)}</strong>
        <small>
          {personName(state, item.partyId)} · {formatDate(item.date)}
        </small>
      </span>
      <strong className={incoming ? "amount-positive" : "amount-negative"}>
        {incoming ? "+" : "−"}
        {formatMoney(item.amount, state.settings.currency)}
        <small className="table-subline">{cashDirectionLabel(item.type)}</small>
      </strong>
      <span className={`status-pill ${statusClass(item.status)}`}>
        {item.status}
      </span>
    </div>
  );
}

function Invoices({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<
    AppState["invoices"][number] | null
  >(null);
  const [selectedInvoice, setSelectedInvoice] = useState<
    AppState["invoices"][number] | null
  >(null);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(
    new Set()
  );
  const [invoiceSortDirection, setInvoiceSortDirection] = useState<
    "asc" | "desc"
  >("desc");
  const [invoicePartyFilter, setInvoicePartyFilter] = useState("همه");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<"همه" | "فروش" | "خرید">("همه");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("همه");
  const [printingInvoices, setPrintingInvoices] = useState(false);
  const [groupAllocOpen, setGroupAllocOpen] = useState(false);
  const [invoicePage, setInvoicePage] = useState(1);
  const invoicePageSize = 25;
  const blankItem = { productId: "", quantity: "1", unit: "", unitPrice: "" };
  const blankPayment = {
    method: "نقدی" as "نقدی" | "چک مشتری" | "چک شریک" | "حساب داخلی",
    amount: "",
    feeAmount: "",
    accountId: "",
    customerCheckId: "",
    issuerPartyId: "",
    issuedCheckNumber: "",
    issuedCheckDueDate: todayJalali(),
    note: "",
  };
  const [form, setForm] = useState({
    number: "",
    type: "فروش" as "فروش" | "خرید",
    date: todayJalali(),
    partyId: "",
    paymentRuleId: "",
    priceHistoryId: "",
    items: [blankItem],
    discount: "",
    note: "",
    payments: [blankPayment],
  });
  const party = state.people.find(item => item.id === form.partyId);
  const invoiceProducts = useMemo(() => {
    const allowedWarehouses = state.warehouses.filter(warehouse =>
      form.type === "خرید"
        ? warehouse.name.includes("مواد")
        : warehouse.name.includes("محصول") ||
          warehouse.name.includes("بازرگانی")
    );
    const allowedIds = new Set(
      allowedWarehouses.map(warehouse => warehouse.id)
    );
    return state.products.filter(product => {
      if (product.category === "بسته تولید" && form.type === "فروش")
        return false;
      return product.warehouseId ? allowedIds.has(product.warehouseId) : true;
    });
  }, [state.products, state.warehouses, form.type]);
  const invoiceAllocations = useMemo(
    () =>
      settleChecksFIFO(
        state.checks,
        state.invoices,
        state.paymentRules,
        state.settings.dayBasis,
        state.checkGroupAllocations || []
      ),
    [
      state.checks,
      state.invoices,
      state.paymentRules,
      state.settings.dayBasis,
      state.checkGroupAllocations,
    ]
  );
  const allocationBalances = useMemo(
    () =>
      getSettlementBalances(
        invoiceAllocations,
        state.checks,
        state.invoices
      ),
    [invoiceAllocations, state.checks, state.invoices]
  );
  const validSales = useMemo(
    () =>
      state.invoices.filter(
        invoice => invoice.type === "فروش" && invoice.status !== "باطل"
      ),
    [state.invoices]
  );
  const paidByInvoice = useMemo(() => {
    const result = new Map<string, number>();
    invoiceAllocations.forEach(item => {
      result.set(
        item.invoiceId,
        (result.get(item.invoiceId) || 0) + item.principalAmount
      );
    });
    return result;
  }, [invoiceAllocations]);
  const registeredSales = validSales.reduce(
    (sum, invoice) => sum + invoice.amount,
    0
  );
  const outstandingSales = validSales.reduce(
    (sum, invoice) =>
      sum + Math.max(0, invoice.amount - (paidByInvoice.get(invoice.id) || 0)),
    0
  );
  const nextInvoiceNumber = useMemo(
    () =>
      suggestNextPartyNumber(
        state.invoices,
        form.partyId,
        party?.code,
        state.invoices.map(item => item.number)
      ),
    [state.invoices, form.partyId, party?.code]
  );
  const visibleInvoices = useMemo(() => {
    return state.invoices.filter(invoice => {
      if (invoicePartyFilter !== "همه" && invoice.partyId !== invoicePartyFilter) return false;
      if (invoiceTypeFilter !== "همه" && invoice.type !== invoiceTypeFilter) return false;
      if (invoiceStatusFilter !== "همه" && invoice.status !== invoiceStatusFilter) return false;
      return true;
    });
  }, [state.invoices, invoicePartyFilter, invoiceTypeFilter, invoiceStatusFilter]);

  const sortedInvoices = useMemo(
    () =>
      [...visibleInvoices].sort(
        (a, b) =>
          (invoiceSortDirection === "asc" ? 1 : -1) *
          (jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date)) ||
            a.id.localeCompare(b.id))
      ),
    [invoiceSortDirection, visibleInvoices]
  );
  const invoicePageCount = Math.max(1, Math.ceil(sortedInvoices.length / invoicePageSize));
  const safeInvoicePage = Math.min(invoicePage, invoicePageCount);
  const paginatedInvoices = sortedInvoices.slice(
    (safeInvoicePage - 1) * invoicePageSize,
    safeInvoicePage * invoicePageSize
  );
  const displayInvoices = printingInvoices ? sortedInvoices : paginatedInvoices;
  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceSortDirection, invoicePartyFilter, invoiceTypeFilter, invoiceStatusFilter]);
  function suggestedPrice(
    productId: string,
    unit: string,
    partyId = form.partyId
  ) {
    const product = state.products.find(item => item.id === productId);
    if (!product) return "";
    const matches = state.priceHistory
      .filter(
        price =>
          (price.productName === product.name ||
            price.productId === product.id) &&
          (price.priceBasis === "baseUnit" || !price.priceBasis) &&
          (price.baseUnit || price.unit) === product.unit &&
          price.effectiveDate <= form.date &&
          (price.scope === "عمومی" || price.partyIds?.includes(partyId))
      )
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return String(matches[0]?.price ?? product.price ?? "");
  }
  const subtotal = form.items.reduce((sum, item) => {
    const product = state.products.find(row => row.id === item.productId);
    const line = product
      ? calculateBaseUnitLine(
          product,
          parseLocalizedNumber(item.quantity) || 0,
          item.unit,
          parseLocalizedNumber(item.unitPrice) || 0
        )
      : null;
    return (
      sum +
      (line?.total ??
        (parseLocalizedNumber(item.quantity) || 0) * (parseLocalizedNumber(item.unitPrice) || 0))
    );
  }, 0);
  const discountInput = parseLocalizedNumber(form.discount) || 0;
  const discount = Math.min(subtotal, Math.max(0, discountInput));
  const calculatedAmount = calculateInvoiceAmount(subtotal, discount);
  const purchasePaymentTotal = form.payments.reduce(
    (sum, payment) => sum + (parseLocalizedNumber(payment.amount) || 0),
    0
  );
  function voidInvoice(invoice: AppState["invoices"][number]) {
    if (invoice.status === "باطل") return;
    const released = invoice.type === "خرید"
      ? releasePurchasePaymentsForInvoice(state, invoice.id)
      : state;
    const products = state.products.map(product => {
      const movement = invoice.items
        .filter(item => item.productId === product.id)
        .reduce((sum, item) => sum + (item.quantityBase ?? item.quantity), 0);
      if (!movement) return product;
      return {
        ...product,
        stock: product.stock + (invoice.type === "فروش" ? movement : -movement),
      };
    });
    onSave(
      rebuildCheckAllocations({
        ...released,
        products,
        invoices: released.invoices.map(item =>
          item.id === invoice.id ? { ...item, status: "باطل" as const } : item
        ),
      }),
      `فاکتور ${invoice.number} باطل شد و موجودی اصلاح گردید`
    );
    setSelectedInvoice(null);
  }
  function updateItem(index: number, patch: Partial<typeof blankItem>) {
    setForm({
      ...form,
      items: form.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    });
  }
  function openEdit(invoice: AppState["invoices"][number]) {
    if (invoice.status === "باطل") return;
    setEditingInvoice(invoice);
    const exclusivePaymentIds = purchasePaymentIdsExclusiveToInvoice(
      state,
      invoice.id
    );
    setForm({
      number: invoice.number,
      type: invoice.type,
      date: invoice.date,
      partyId: invoice.partyId || "",
      paymentRuleId: invoice.paymentRuleId || "",
      priceHistoryId: invoice.priceHistoryId || "",
      items: invoice.items.map(item => ({
        productId: item.productId || "",
        quantity: String(item.quantity),
        unit: item.unit,
        unitPrice: String(item.unitPrice),
      })),
      discount: String(invoice.discountAmount || ""),
      note: invoice.note,
      payments:
        invoice.type === "خرید"
          ? state.purchasePayments
              .filter(
                payment =>
                  payment.supplierId === invoice.partyId &&
                  exclusivePaymentIds.has(payment.id)
              )
              .map(payment => ({
                ...blankPayment,
                method: payment.method,
                amount: String(payment.amount),
                feeAmount: String(payment.feeAmount || ""),
                accountId: payment.accountId || "",
                customerCheckId: payment.customerCheckId || "",
                note: payment.note,
              }))
          : [blankPayment],
    });
    setSelectedInvoice(null);
    setOpen(true);
  }
  function deleteInvoice(invoice: AppState["invoices"][number]) {
    if (!window.confirm(`فاکتور ${invoice.number} حذف شود؟`)) return;
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
    const released = invoice.type === "خرید"
      ? releasePurchasePaymentsForInvoice(state, invoice.id)
      : state;
    onSave(
      rebuildCheckAllocations({
        ...released,
        products,
        invoices: released.invoices.filter(item => item.id !== invoice.id),
      }),
      invoice.status === "باطل"
        ? `فاکتور باطل ${invoice.number} حذف شد`
        : `فاکتور ${invoice.number} حذف شد و موجودی اصلاح گردید`
    );
    setSelectedInvoice(null);
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (subtotal <= 0) return;
    const items = form.items.map(row => {
      const product = state.products.find(item => item.id === row.productId);
      const quantity = parseLocalizedNumber(row.quantity) || 0;
      const unitPrice = parseLocalizedNumber(row.unitPrice) || 0;
      const unit = row.unit || product?.unit || "عدد";
      const line = product
        ? calculateBaseUnitLine(product, quantity, unit, unitPrice)
        : {
            quantity,
            enteredUnit: unit,
            baseUnit: unit,
            conversionRate: 1,
            quantityBase: quantity,
            unitPrice,
            priceBasis: "baseUnit" as const,
            total: quantity * unitPrice,
          };
      const existingItem = editingInvoice?.items.find(item => item.productId === row.productId);
      const latestCost = [...state.productionRecords]
        .filter(record =>
          record.outputProductId === row.productId &&
          jalaliDateKey(record.date) <= jalaliDateKey(form.date) &&
          Number.isFinite(record.unitCost) &&
          record.unitCost >= 0
        )
        .sort((a, b) => jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date)))[0]
        ?.unitCost;
      return {
        id: createId("invoice-item"),
        productId: row.productId || undefined,
        description: product?.name || "خدمت/کالای آزاد",
        quantity,
        unit,
        conversionRate: line.conversionRate,
        quantityBase: line.quantityBase,
        baseUnit: line.baseUnit,
        priceBasis: line.priceBasis,
        unitPrice,
        total: line.total,
        unitCostAtSale:
          form.type === "فروش"
            ? existingItem?.unitCostAtSale ?? latestCost
            : undefined,
      };
    });
    const invoice = {
      id: editingInvoice?.id || createId("invoice"),
      number: form.number.trim() || nextInvoiceNumber,
      type: form.type,
      date: form.date,
      partyId: form.partyId || undefined,
      paymentRuleId:
        form.paymentRuleId ||
        party?.defaultPaymentRuleId ||
        state.paymentRules.find(item => item.active)?.id,
      priceHistoryId: form.priceHistoryId || undefined,
      items,
      allocations: editingInvoice?.allocations || [],
      discountAmount: discount,
      amount: calculatedAmount,
      paidAmount: Math.min(editingInvoice?.paidAmount || 0, calculatedAmount),
      status:
        editingInvoice && editingInvoice.paidAmount >= calculatedAmount
          ? ("تسویه شده" as const)
          : editingInvoice && editingInvoice.paidAmount > 0
            ? ("تسویه جزئی" as const)
            : ("باز" as const),
      note: form.note,
    };
    const releasedState = editingInvoice && editingInvoice.type === "خرید"
      ? releasePurchasePaymentsForInvoice(state, editingInvoice.id)
      : state;
    const products = state.products.map(product => {
      const oldMovement =
        editingInvoice?.items
          .filter(item => item.productId === product.id)
          .reduce(
            (sum, item) => sum + (item.quantityBase ?? item.quantity),
            0
          ) || 0;
      const newMovement = items
        .filter(item => item.productId === product.id)
        .reduce((sum, item) => sum + (item.quantityBase ?? item.quantity), 0);
      const restored = editingInvoice
        ? editingInvoice.type === "خرید"
          ? -oldMovement
          : oldMovement
        : 0;
      const applied = form.type === "خرید" ? newMovement : -newMovement;
      return { ...product, stock: product.stock + restored + applied };
    });
    const payments = form.type === "خرید" && form.partyId
      ? form.payments
          .map(payment => ({
            ...payment,
            amount: parseLocalizedNumber(payment.amount) || 0,
            feeAmount: Math.max(0, parseLocalizedNumber(payment.feeAmount) || 0),
          }))
          .filter(payment => payment.amount > 0)
      : [];
    const purchasePaymentRecords = payments.map(payment => ({
      id: createId("purchase-payment"),
      supplierId: form.partyId,
      amount: payment.amount,
      feeAmount: payment.feeAmount,
      date: form.date,
      method: payment.method,
      accountId: payment.accountId || undefined,
      customerCheckId: payment.customerCheckId || undefined,
      note: payment.note,
    }));
    const issuedChecks = payments
      .map((payment, index) =>
        payment.method === "چک شریک"
          ? {
              id: createId("issued-check"),
              paymentIndex: index,
              number: payment.issuedCheckNumber || `ش-${index + 1}`,
              issuerPartyId: payment.issuerPartyId || form.partyId,
              beneficiaryPartyId: form.partyId,
              purchaseInvoiceId: invoice.id,
              dateIssued: form.date,
              dueDate: payment.issuedCheckDueDate,
              amount: payment.amount,
              status: "صادر شده" as const,
              purpose: "خرید" as const,
              note: payment.note,
            }
          : null
      )
      .filter(Boolean);
    const paymentRecordsWithIssuedChecks = purchasePaymentRecords.map((payment, index) => ({
      ...payment,
      issuedCheckId: issuedChecks.find(
        check => check && (check as { paymentIndex?: number }).paymentIndex === index
      )?.id,
    }));
    const invoices = editingInvoice
      ? releasedState.invoices.map(item =>
          item.id === editingInvoice.id ? invoice : item
        )
      : [invoice, ...releasedState.invoices];
    const spentCheckIds = paymentRecordsWithIssuedChecks
      .filter(payment => payment.method === "چک مشتری" && payment.customerCheckId)
      .map(payment => payment.customerCheckId!);
    const nextChecks = releasedState.checks.map(check =>
      spentCheckIds.includes(check.id)
        ? {
            ...check,
            status: "خرج شده" as const,
            spentForPaymentId: paymentRecordsWithIssuedChecks.find(
              payment => payment.customerCheckId === check.id
            )?.id,
            spentToPartyId: form.partyId,
          }
        : check
    );
    const nextState = appendPurchasePaymentCashEvents(rebuildPurchasePayables(
      rebuildCheckAllocations({
        ...releasedState,
        products,
        invoices,
        checks: nextChecks,
        purchasePayments: editingInvoice
          ? releasedState.purchasePayments.concat(paymentRecordsWithIssuedChecks)
          : [...releasedState.purchasePayments, ...paymentRecordsWithIssuedChecks],
        issuedChecks: editingInvoice
          ? releasedState.issuedChecks.filter(check => check.purchaseInvoiceId !== invoice.id)
              .concat(issuedChecks as AppState["issuedChecks"])
          : [...releasedState.issuedChecks, ...issuedChecks as AppState["issuedChecks"]],
      })
    ));
    onSave(
      nextState,
      editingInvoice
        ? `فاکتور ${invoice.number} ویرایش شد و موجودی اصلاح گردید`
        : form.type === "فروش"
          ? "فاکتور فروش ثبت شد و خروج کالا از انبار انجام شد"
          : "فاکتور خرید ثبت شد و ورود کالا به انبار انجام شد"
    );
    setOpen(false);
    setEditingInvoice(null);
    setForm({
      number: "",
      type: "فروش",
      date: todayJalali(),
      partyId: "",
      paymentRuleId: "",
      priceHistoryId: "",
      items: [blankItem],
      discount: "",
      note: "",
      payments: [blankPayment],
    });
  }
  return (
    <div className="page-stack page-enter invoices-page">
      <PageIntro
        kicker="مرکز اسناد"
        title="فاکتورها"
        description="چند ردیف کالا/خدمت را ثبت کنید؛ مبلغ کل و گردش موجودی خودکار محاسبه می‌شود."
        actionLabel="ثبت فاکتور"
        onAction={() => {
          setEditingInvoice(null);
          setForm(current => ({
            ...current,
            number: nextInvoiceNumber,
            date: todayJalali(),
          }));
          setOpen(true);
        }}
      />
      <section className="metric-grid">
        <MetricCard
          label="فاکتورهای باز"
          value={formatNumber(
            state.invoices.filter(invoice => invoice.status !== "تسویه شده")
              .length
          )}
          helper="اسناد دارای مانده"
          icon={<FileText size={20} />}
          tone="amber"
        />
        <MetricCard
          label="مانده فروش معتبر"
          value={formatMoney(outstandingSales, state.settings.currency)}
          helper="پس از تخصیص FIFO و حذف فاکتور باطل"
          icon={<WalletCards size={20} />}
          tone="rose"
        />
        <MetricCard
          label="فروش معتبر ثبت‌شده"
          value={formatMoney(registeredSales, state.settings.currency)}
          helper="قبل از تسویه"
          icon={<ArrowDownLeft size={20} />}
          tone="mint"
        />
        <MetricCard
          label="خرید ثبت‌شده"
          value={formatMoney(
            state.invoices
              .filter(invoice => invoice.type === "خرید")
              .reduce((sum, invoice) => sum + invoice.amount, 0),
            state.settings.currency
          )}
          helper="ورودی انبار"
          icon={<Boxes size={20} />}
          tone="indigo"
        />
        <MetricCard
          label="تعهد چک شریک"
          value={formatMoney(
            state.issuedChecks
              .filter(check => !["پرداخت شده", "باطل"].includes(check.status))
              .reduce((sum, check) => sum + check.amount, 0),
            state.settings.currency
          )}
          helper="سررسیدنشده و سررسیدشده"
          icon={<FileClock size={20} />}
          tone="violet"
        />
      </section>
      <div className="print-customer-summary print-roll-banner">
        <div className="print-roll-title">
          <span>کارگاه صنعتی — گزارش طوماری فاکتورها و وضعیت تسویه (افقی)</span>
          <strong>{invoicePartyFilter === "همه" ? "کلیه طرف‌حساب‌ها و فاکتورها" : `طرف حساب: ${personName(state, invoicePartyFilter)}`}</strong>
        </div>
        <div className="print-roll-meta">
          <span>تاریخ گزارش: {todayJalali()}</span>
          <span>تعداد فاکتورها: {formatNumber(displayInvoices.length)} فقره</span>
          <span>مجموع مبلغ فاکتورها: {formatMoney(displayInvoices.reduce((sum, inv) => sum + inv.amount, 0), state.settings.currency)}</span>
          <span>مانده تسویه‌نشده: {formatMoney(displayInvoices.reduce((sum, inv) => sum + Math.max(0, inv.amount - (inv.paidAmount || 0)), 0), state.settings.currency)}</span>
        </div>
      </div>
      <div className="toolbar invoice-filters">
        <label>
          نوع فاکتور
          <select
            value={invoiceTypeFilter}
            onChange={e => setInvoiceTypeFilter(e.target.value as "همه" | "فروش" | "خرید")}
          >
            <option value="همه">همه نوع‌ها</option>
            <option value="فروش">فروش</option>
            <option value="خرید">خرید</option>
          </select>
        </label>
        <label>
          وضعیت
          <select
            value={invoiceStatusFilter}
            onChange={e => setInvoiceStatusFilter(e.target.value)}
          >
            <option value="همه">همه وضعیت‌ها</option>
            <option value="باز">باز</option>
            <option value="تسویه جزئی">تسویه جزئی</option>
            <option value="تسویه شده">تسویه شده</option>
            <option value="باطل">باطل</option>
          </select>
        </label>
        <label>
          مشتری / طرف حساب
          <select
            value={invoicePartyFilter}
            onChange={e => setInvoicePartyFilter(e.target.value)}
          >
            <option value="همه">همه طرف‌حساب‌ها</option>
            {state.people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => setGroupAllocOpen(true)}
        >
          تخصیص گروهی چک به فاکتور
        </button>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => {
            setPrintingInvoices(true);
            setExpandedInvoiceIds(new Set(sortedInvoices.map(inv => inv.id)));
            window.setTimeout(
              () => printWithTarget("invoices-roll", true, () => setPrintingInvoices(false)),
              0
            );
          }}
        >
          چاپ طومار فاکتورها برای مشتری (افقی)
        </button>
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            {state.issuedChecks.length > 0 && (
              <div className="full-field"><strong>دفتر چک‌های صادرشدهٔ شریک</strong>{" "}
                {state.issuedChecks.map(check => (
                  <span className="soft-tag" key={check.id}>
                    {check.number} · {formatMoney(check.amount, state.settings.currency)} · {check.status}
                    {!["پرداخت شده", "برگشتی", "باطل"].includes(check.status) && <>
                      <button type="button" className="text-button" onClick={() => onSave(settleIssuedCheck(state, check.id, "پرداخت شده"), `چک شریک ${check.number} پرداخت شد`)}>پرداخت شد</button>
                      <button type="button" className="text-button" onClick={() => onSave(settleIssuedCheck(state, check.id, "برگشتی"), `چک شریک ${check.number} برگشت خورد`)}>برگشت</button>
                    </>}
                  </span>
                ))}
              </div>
            )}
            <span className="section-kicker">دفتر فاکتور</span>
            <h3>{formatNumber(state.invoices.length)} فاکتور</h3>
          </div>
          <div className="panel-heading-actions">
            <SortControl
              direction={invoiceSortDirection}
              onChange={setInvoiceSortDirection}
              ascLabel="قدیمی‌تر"
              descLabel="جدیدتر"
            />
            <span className="soft-tag">نوع سند و جهت مانده در هر ردیف مشخص است</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شماره</th>
                <th>تاریخ</th>
                <th>نوع و جهت</th>
                <th>طرف حساب</th>
                <th>نام کالا</th>
                <th>تعداد</th>
                <th>قیمت پایه</th>
                <th>مبلغ</th>
                <th>تسویه</th>
                <th>مانده</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.length ? (
                displayInvoices.map(invoice => {
                    const expanded = expandedInvoiceIds.has(invoice.id);
                    const allocations = invoiceAllocations.filter(
                      item => item.invoiceId === invoice.id
                    );
                    const invGroup = state.checkGroupAllocations?.find(
                      g => g.invoiceIds.includes(invoice.id)
                    );
                    return (
                      <Fragment key={invoice.id}>
                        <tr>
                          <td>
                            <button
                              type="button"
                              className={`allocation-toggle ${expanded ? "is-expanded" : ""}`}
                              onClick={() =>
                                setExpandedInvoiceIds(current => {
                                  const next = new Set(current);
                                  if (next.has(invoice.id))
                                    next.delete(invoice.id);
                                  else next.add(invoice.id);
                                  return next;
                                })
                              }
                              title="نمایش چک‌های تخصیص‌یافته و مشخصات مشتری"
                            >
                              <ChevronDown size={14} />
                              <strong>{invoice.number}</strong>
                            </button>
                            {invGroup && (
                              <small
                                className="badge teal"
                                style={{ display: "inline-block", marginTop: 2, marginRight: 4 }}
                              >
                                گروه: {invGroup.name}
                              </small>
                            )}
                          </td>
                          <td>{formatDate(invoice.date)}</td>
                          <td>
                            <span className={`status-pill ${invoice.type === "فروش" ? "status-success" : "status-warning"}`}>
                              {invoiceDirectionLabel(invoice.type)}
                            </span>
                          </td>
                          <td>{personName(state, invoice.partyId)}</td>
                          <td>
                            <div className="invoice-cell-list">
                              {invoice.items.map((item, index) => (
                                <span key={`${item.productId}-name-${index}`}>
                                  {state.products.find(
                                    product => product.id === item.productId
                                  )?.name || "کالا/خدمت آزاد"}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="invoice-cell-list">
                              {invoice.items.map((item, index) => (
                                <span key={`${item.productId}-qty-${index}`}>
                                  {formatNumber(Number(item.quantity) || 0)}{" "}
                                  {item.unit}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="invoice-cell-list">
                              {invoice.items.map((item, index) => (
                                <span key={`${item.productId}-price-${index}`}>
                                  {formatMoney(
                                    Number(item.unitPrice) || 0,
                                    state.settings.currency
                                  )} {state.products.find(
                                    product => product.id === item.productId
                                  )?.unit || "واحد پایه"}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="amount-cell">
                            <strong>{formatMoney(invoice.amount, state.settings.currency)}</strong>
                            <small className="table-subline">{invoice.type === "فروش" ? "طلب ایجادشده" : "بدهی ایجادشده"}</small>
                          </td>
                          <td>
                            <strong>{formatMoney(invoice.paidAmount, state.settings.currency)}</strong>
                            <small className="table-subline">{invoice.type === "فروش" ? "وصول" : "پرداخت"}</small>
                          </td>
                          <td className="amount-cell">
                            <strong>{formatMoney(Math.max(0, invoice.amount - invoice.paidAmount), state.settings.currency)}</strong>
                            <small className="table-subline">{invoiceBalanceLabel(invoice.type)}</small>
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => setSelectedInvoice(invoice)}
                            >
                              جزئیات
                            </button>{" "}
                            <span
                              className={`status-pill ${invoice.status === "تسویه شده" ? "status-success" : invoice.status === "باطل" ? "status-danger" : "status-warning"}`}
                            >
                              {invoice.status}
                            </span>
                            {invoice.status !== "باطل" && (
                              <button
                                className="icon-button row-action"
                                title="ویرایش فاکتور"
                                onClick={() => openEdit(invoice)}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            <button
                              className="icon-button row-action"
                              title="حذف فاکتور"
                              onClick={() => deleteInvoice(invoice)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="allocation-detail-row">
                            <td colSpan={11}>
                              <div className="invoice-accordion-box">
                                {(() => {
                                  const person = state.people.find(p => p.id === invoice.partyId);
                                  return (
                                    <>
                                      <div className="invoice-customer-info-strip">
                                        <div>
                                          <strong>مشتری / طرف حساب:</strong> {person?.name || "نامشخص"} {person?.code ? `(کد: ${person.code})` : ""}
                                        </div>
                                        {person?.phone && (
                                          <div><strong>شماره تماس:</strong> {person.phone}</div>
                                        )}
                                        {invGroup && (
                                          <div><span className="soft-tag">تخصیص گروهی: {invGroup.name}</span></div>
                                        )}
                                        <div>
                                          <strong>تاریخ صدور:</strong> {formatDate(invoice.date)} | <strong>نوع:</strong> {invoice.type}
                                        </div>
                                        <div>
                                          <strong>مبلغ فاکتور:</strong> {formatMoney(invoice.amount, state.settings.currency)}
                                        </div>
                                        <div>
                                          <strong>مانده تسویه‌نشده:</strong> {formatMoney(Math.max(0, invoice.amount - (invoice.paidAmount || 0)), state.settings.currency)}
                                        </div>
                                      </div>

                                      {invoice.items && invoice.items.length > 0 && (
                                        <div className="invoice-items-mini-table">
                                          <span className="mini-table-title">اقلام و کالاهای فاکتور:</span>
                                          {invoice.items.map((item, index) => {
                                            const product = state.products.find(p => p.id === item.productId);
                                            return (
                                              <span className="mini-item-badge" key={index}>
                                                {product?.name || "کالا"} · {formatNumber(Number(item.quantity) || 0)} {item.unit || "عدد"} · فی: {formatMoney(Number(item.unitPrice) || 0, state.settings.currency)}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}

                                {allocations.length ? (
                                  <div className="roll-subtable-wrap">
                                    <table className="roll-subtable">
                                      <thead>
                                        <tr>
                                          <th style={{ width: "16%" }}>شماره و سررسید چک</th>
                                          <th style={{ width: "13%" }}>مبلغ چک</th>
                                          <th style={{ width: "10%" }}>وضعیت چک</th>
                                          <th style={{ width: "11%" }}>روزهای دیرکرد</th>
                                          <th style={{ width: "16%" }}>نرخ و سود دیرکرد</th>
                                          <th style={{ width: "18%" }}>مبلغ تسویه (اصل + سود)</th>
                                          <th style={{ width: "13%" }}>مانده فاکتور</th>
                                          <th style={{ width: "13%" }}>مانده چک جهت انتقال</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {allocations.map(item => {
                                          const check = state.checks.find(
                                            row => row.id === item.checkId
                                          );
                                          const allocationBalance =
                                            allocationBalances.get(
                                              `${item.checkId}:${item.invoiceId}`
                                            );
                                          const rule =
                                            state.paymentRules.find(
                                              r => r.id === invoice.paymentRuleId
                                            ) || state.paymentRules.find(r => r.active);
                                          const probe = check
                                            ? calculateLateProfit(
                                                check,
                                                rule,
                                                invoice.date,
                                                invoice.amount,
                                                state.settings.dayBasis
                                              )
                                            : null;
                                          return (
                                            <tr key={`${item.checkId}-${item.invoiceId}`}>
                                              <td>
                                                <strong>چک {check?.number || "—"}</strong>
                                                <small style={{ display: "block", color: "#555" }}>
                                                  سررسید: {formatDate(check?.dueDate || "")}
                                                </small>
                                              </td>
                                              <td>{check ? formatMoney(check.amount, state.settings.currency) : "—"}</td>
                                              <td>{check?.status || "—"}</td>
                                              <td>{formatNumber(item.days || 0)} روز</td>
                                              <td>
                                                {item.profit > 0 ? (
                                                  <span>
                                                    {formatMoney(item.profit, state.settings.currency)}
                                                    <small style={{ display: "block", color: "#555" }}>
                                                      ({formatNumber((probe?.rate || 0) * 100)}٪)
                                                    </small>
                                                  </span>
                                                ) : (
                                                  <span className="muted-cell">بدون دیرکرد (۰٪)</span>
                                                )}
                                              </td>
                                              <td>
                                                <strong>{formatMoney(item.amount, state.settings.currency)}</strong>
                                                <small style={{ display: "block", color: "#555" }}>
                                                  اصل: {formatMoney(item.principalAmount, state.settings.currency)}
                                                </small>
                                              </td>
                                              <td>
                                                <strong>
                                                  {formatMoney(
                                                    allocationBalance?.remainingInvoice ?? 0,
                                                    state.settings.currency
                                                  )}
                                                </strong>
                                              </td>
                                              <td>
                                                <strong>
                                                  {formatMoney(
                                                    allocationBalance?.remainingCheck ?? 0,
                                                    state.settings.currency
                                                  )}
                                                </strong>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <span className="muted-cell" style={{ display: "block", marginTop: 4 }}>
                                    چکی برای این فاکتور تخصیص داده نشده است.
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      title="فاکتوری ثبت نشده"
                      description="اولین فاکتور را با چند ردیف کالا ثبت کنید."
                      onAction={() => setOpen(true)}
                      actionLabel="ثبت فاکتور"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safeInvoicePage}
          pageCount={invoicePageCount}
          onChange={setInvoicePage}
        />
      </div>
      {open && (
        <Dialog
          title={
            editingInvoice
              ? `ویرایش فاکتور ${editingInvoice.number}`
              : "ثبت فاکتور چندردیفی"
          }
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="form-grid">
            <label>
              شماره فاکتور
              <input
                value={form.number}
                inputMode="text"
                placeholder={`پیشنهاد: ${nextInvoiceNumber}`}
                onChange={e => setForm({ ...form, number: e.target.value })}
              />
            </label>
            <label>
              نوع فاکتور
              <select
                value={form.type}
                onChange={e =>
                  setForm({ ...form, type: e.target.value as "فروش" | "خرید" })
                }
              >
                <option>فروش</option>
                <option>خرید</option>
              </select>
            </label>
            <label>
              تاریخ فاکتور
              <JalaliDatePicker
                value={form.date}
                onChange={date => setForm({ ...form, date })}
              />
            </label>
            <label>
              طرف حساب
              <select
                value={form.partyId}
                onChange={e => {
                  const selected = state.people.find(
                    item => item.id === e.target.value
                  );
                  setForm(current => ({
                    ...current,
                    number: editingInvoice
                      ? current.number
                      : suggestNextPartyNumber(
                          state.invoices,
                          e.target.value,
                          selected?.code,
                          state.invoices.map(item => item.number)
                        ),
                    partyId: e.target.value,
                    paymentRuleId: "",
                    items: current.items.map(item =>
                      item.productId
                        ? {
                            ...item,
                            unitPrice: suggestedPrice(
                              item.productId,
                              item.unit,
                              e.target.value
                            ),
                          }
                        : item
                    ),
                  }));
                }}
              >
                <option value="">بدون طرف حساب</option>
                {state.people.map(person => (
                  <option value={person.id} key={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              شرایط پرداخت
              <select
                value={form.paymentRuleId || party?.defaultPaymentRuleId || ""}
                onChange={e =>
                  setForm({ ...form, paymentRuleId: e.target.value })
                }
              >
                <option value="">پیش‌فرض طرف حساب/فعال</option>
                {state.paymentRules.map(rule => (
                  <option value={rule.id} key={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="full-field invoice-items-editor">
              <div className="tier-editor-head">
                <span>ریزاقلام فاکتور</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setForm({ ...form, items: [...form.items, blankItem] })
                  }
                >
                  <Plus size={14} />
                  افزودن ردیف
                </button>
              </div>
            {form.items.map((row, index) => (
                <div className="invoice-item-row" key={index}>
                  <select
                    value={row.productId}
                    onChange={e => {
                      const product = state.products.find(
                        item => item.id === e.target.value
                      );
                      updateItem(index, {
                        productId: e.target.value,
                        unit: product?.unit || "",
                        unitPrice: product
                          ? suggestedPrice(product.id, product.unit)
                          : row.unitPrice,
                      });
                    }}
                  >
                    <option value="">کالا/خدمت آزاد</option>
                    {invoiceProducts.map(product => (
                      <option value={product.id} key={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={e =>
                      updateItem(index, { quantity: e.target.value })
                    }
                    placeholder="تعداد"
                  />
                  <input
                    value={formatNumber(
                      (Number(row.quantity) || 0) *
                        (state.products.find(
                          product => product.id === row.productId
                        )
                          ? unitConversionToBase(
                              state.products.find(
                                product => product.id === row.productId
                              )!,
                              row.unit
                            )
                          : 1)
                    )}
                    readOnly
                    aria-label="تعداد کل به واحد پایه"
                    placeholder="تعداد کل پایه"
                  />
                  <select
                    value={row.unit}
                    onChange={e =>
                      updateItem(index, {
                        unit: e.target.value,
                        unitPrice: suggestedPrice(
                          row.productId,
                          e.target.value
                        ),
                      })
                    }
                  >
                    <option value="">واحد پایه</option>
                    {!state.products.find(
                      product => product.id === row.productId
                    ) &&
                      state.settings.units.map(unit => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    {state.products.find(
                      product => product.id === row.productId
                    ) &&
                      [
                        state.products.find(
                          product => product.id === row.productId
                        )!.unit,
                        state.products.find(
                          product => product.id === row.productId
                        )!.unit2,
                      ]
                        .filter(Boolean)
                        .map(unit => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                  </select>
                  <input
                    inputMode="numeric"
                    value={row.unitPrice}
                    onChange={e =>
                      updateItem(index, { unitPrice: e.target.value })
                    }
                    placeholder="قیمت واحد پایه"
                  />
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() =>
                        setForm({
                          ...form,
                          items: form.items.filter(
                            (_, itemIndex) => itemIndex !== index
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {form.type === "خرید" && (
              <div className="full-field invoice-items-editor">
                <div className="tier-editor-head">
                  <span>پرداخت‌های فاکتور خرید</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setForm({ ...form, payments: [...form.payments, blankPayment] })}
                  >
                    <Plus size={14} />
                    افزودن پرداخت
                  </button>
                </div>
                {form.payments.map((payment, index) => {
                  const availableChecks = state.checks.filter(
                    check =>
                      !["خرج شده", "باطل", "برگشتی", "عودت داده شده", "جایگزین شده"].includes(check.status) &&
                      !state.purchasePayments.some(item => item.customerCheckId === check.id)
                  );
                  return (
                    <div className="invoice-item-row" key={index}>
                      <select
                        value={payment.method}
                        onChange={event =>
                          setForm({
                            ...form,
                            payments: form.payments.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, method: event.target.value as typeof item.method }
                                : item
                            ),
                          })
                        }
                      >
                        <option value="نقدی">نقدی</option>
                        <option value="چک مشتری">چک دریافتی مشتری</option>
                        <option value="چک شریک">چک شریک</option>
                        <option value="حساب داخلی">حساب داخلی</option>
                      </select>
                      <input
                        inputMode="decimal"
                        value={payment.amount}
                        onChange={event =>
                          setForm({
                            ...form,
                            payments: form.payments.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, amount: event.target.value, feeAmount: String(calculateBankTransferFee(state.settings.bankFeeRules, item.accountId, parseLocalizedNumber(event.target.value)).fee || "") }
                                : item
                            ),
                          })
                        }
                        placeholder="مبلغ پرداخت"
                      />
                      {(payment.method === "نقدی" || payment.method === "حساب داخلی") && (
                        <input
                          inputMode="numeric"
                          value={payment.feeAmount}
                          onChange={event => setForm({ ...form, payments: form.payments.map((item, rowIndex) => rowIndex === index ? { ...item, feeAmount: event.target.value } : item) })}
                          placeholder="کارمزد بانکی"
                        />
                      )}
                      {payment.method === "چک مشتری" ? (
                        <select
                          value={payment.customerCheckId}
                          onChange={event =>
                            setForm({
                              ...form,
                              payments: form.payments.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, customerCheckId: event.target.value } : item
                              ),
                            })
                          }
                        >
                          <option value="">انتخاب چک مشتری</option>
                          {availableChecks.map(check => (
                            <option key={check.id} value={check.id}>
                              {check.number} · {formatMoney(check.amount, state.settings.currency)} · {personName(state, check.partyId)}
                            </option>
                          ))}
                        </select>
                      ) : payment.method === "چک شریک" ? (
                        <>
                          <select
                            value={payment.issuerPartyId}
                            onChange={event =>
                              setForm({
                                ...form,
                                payments: form.payments.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, issuerPartyId: event.target.value } : item
                                ),
                              })
                            }
                          >
                            <option value="">انتخاب شریک صادرکننده</option>
                            {state.people.filter(person => person.roles?.includes("شریک") || person.type === "شریک").map(person => (
                              <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                          </select>
                          <input
                            value={payment.issuedCheckNumber}
                            onChange={event =>
                              setForm({
                                ...form,
                                payments: form.payments.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, issuedCheckNumber: event.target.value } : item
                                ),
                              })
                            }
                            placeholder="شماره چک شریک"
                          />
                          <JalaliDatePicker
                            value={payment.issuedCheckDueDate}
                            onChange={date =>
                              setForm({
                                ...form,
                                payments: form.payments.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, issuedCheckDueDate: date } : item
                                ),
                              })
                            }
                          />
                        </>
                      ) : (
                        <select
                          value={payment.accountId}
                          onChange={event =>
                            setForm({
                              ...form,
                              payments: form.payments.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, accountId: event.target.value, feeAmount: String(calculateBankTransferFee(state.settings.bankFeeRules, event.target.value, parseLocalizedNumber(item.amount)).fee || "") }
                                : item
                              ),
                            })
                          }
                        >
                          <option value="">انتخاب حساب</option>
                          {state.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      )}
                      {form.payments.length > 1 && (
                        <button type="button" className="icon-button" onClick={() => setForm({ ...form, payments: form.payments.filter((_, rowIndex) => rowIndex !== index) })}>×</button>
                      )}
                    </div>
                  );
                })}
                <div className="invoice-total">
                  <span>جمع پرداخت‌ها: {formatMoney(purchasePaymentTotal, state.settings.currency)}</span>
                  <strong>
                    {purchasePaymentTotal <= calculatedAmount
                      ? `مانده بدهی: ${formatMoney(calculatedAmount - purchasePaymentTotal, state.settings.currency)}`
                      : `اضافه پرداخت: ${formatMoney(purchasePaymentTotal - calculatedAmount, state.settings.currency)}`}
                  </strong>
                </div>
              </div>
            )}
            <div className="panel invoice-total">
              <span>
                جمع اقلام: {formatMoney(subtotal, state.settings.currency)}
              </span>
              <label className="invoice-discount-field">
                تخفیف
                <input
                  inputMode="numeric"
                  value={form.discount}
                  onChange={e => setForm({ ...form, discount: e.target.value })}
                  placeholder="مبلغ تخفیف"
                />
              </label>
              <strong>
                مبلغ نهایی:{" "}
                {formatMoney(calculatedAmount, state.settings.currency)}
              </strong>
            </div>
            <label className="full-field">
              توضیحات
              <input
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={17} />
                ذخیره فاکتور
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {selectedInvoice && (
        <Dialog
          title={`جزئیات فاکتور ${selectedInvoice.number}`}
          onClose={() => setSelectedInvoice(null)}
        >
          <div className="invoice-detail">
            <div className="print-customer-summary">
              خلاصه وضعیت فاکتور {selectedInvoice.number} · {personName(state, selectedInvoice.partyId)}
            </div>
            <div className="detail-meta">
              <span>تاریخ {formatDate(selectedInvoice.date)}</span>
              <span>{personName(state, selectedInvoice.partyId)}</span>
            <span className={`status-pill ${selectedInvoice.type === "فروش" ? "status-success" : "status-warning"}`}>
              {invoiceDirectionLabel(selectedInvoice.type)}
            </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شرح</th>
                    <th>تعداد</th>
                    <th>واحد</th>
                    <th>قیمت واحد</th>
                    <th>جمع</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map(item => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{formatNumber(item.quantity)}</td>
                      <td>{item.unit}</td>
                      <td>
                        {formatMoney(item.unitPrice, state.settings.currency)}
                      </td>
                      <td>
                        {formatMoney(item.total, state.settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="invoice-detail-total">
              <span>
                جمع اقلام:{" "}
                {formatMoney(
                  selectedInvoice.items.reduce(
                    (sum, item) => sum + item.total,
                    0
                  ),
                  state.settings.currency
                )}
                {selectedInvoice.discountAmount
                  ? ` · تخفیف: ${formatMoney(selectedInvoice.discountAmount, state.settings.currency)}`
                  : ""}
              </span>
              <strong>
                {selectedInvoice.type === "فروش" ? "طلب این فاکتور:" : "بدهی این فاکتور:"}{" "}
                {formatMoney(selectedInvoice.amount, state.settings.currency)}
              </strong>
            </div>
            <section className="invoice-print-allocations">
              <h4>چک‌های تخصیص‌یافته به این فاکتور</h4>
              {invoiceAllocations.filter(item => item.invoiceId === selectedInvoice.id).length ? (
                <div className="allocation-detail-grid">
                  {invoiceAllocations
                    .filter(item => item.invoiceId === selectedInvoice.id)
                    .map(item => {
                      const check = state.checks.find(row => row.id === item.checkId);
                      return (
                        <div className="allocation-detail-card" key={`${item.checkId}-${item.invoiceId}`}>
                          <strong>چک {check?.number || "—"}</strong>
                          <span>وضعیت: {check?.status || "—"}</span>
                          <span>سررسید: {check ? formatDate(check.dueDate) : "—"}</span>
                          <span>مبلغ تخصیص: {formatMoney(item.amount, state.settings.currency)}</span>
                          <span>تعداد روز: {formatNumber(item.days || 0)} روز</span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="muted-cell">چکی برای این فاکتور تخصیص داده نشده است.</p>
              )}
            </section>
            <div className="form-actions">
              {selectedInvoice.status !== "باطل" ? (
                <>
                  <button
                    className="button button-ghost"
                    onClick={() => printWithTarget("invoice")}
                  >
                    چاپ فاکتور
                  </button>
                  <button
                    className="button button-ghost"
                    onClick={() => printWithTarget("invoice", true)}
                  >
                    چاپ فاکتور (افقی)
                  </button>
                  {selectedInvoice.paidAmount === 0 && (
                    <button
                      className="button button-ghost"
                      onClick={() => openEdit(selectedInvoice)}
                    >
                      ویرایش فاکتور
                    </button>
                  )}
                  <button
                    className="button button-danger"
                    onClick={() => voidInvoice(selectedInvoice)}
                  >
                    ابطال فاکتور و اصلاح موجودی
                  </button>
                </>
              ) : (
                <>
                  <span className="status-pill status-danger">
                    این فاکتور باطل است
                  </span>
                  <button
                    className="button button-danger"
                    onClick={() => deleteInvoice(selectedInvoice)}
                  >
                    حذف کامل فاکتور باطل
                  </button>
                </>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {groupAllocOpen && (
        <GroupAllocationDialog
          open={groupAllocOpen}
          onClose={() => setGroupAllocOpen(false)}
          state={state}
          onSave={onSave}
          defaultPartyId={invoicePartyFilter !== "همه" ? invoicePartyFilter : ""}
        />
      )}
    </div>
  );
}

function GroupAllocationDialog({
  open,
  onClose,
  state,
  onSave,
  defaultPartyId = "",
}: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  onSave: (nextState: AppState, message: string) => void;
  defaultPartyId?: string;
}) {
  const [partyId, setPartyId] = useState(defaultPartyId);
  const [groupName, setGroupName] = useState("");
  const [selectedCheckIds, setSelectedCheckIds] = useState<Set<string>>(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  const candidateChecks = useMemo(() => {
    return state.checks
      .filter(c => !["باطل", "عودت داده شده", "جایگزین شده", "خرج شده"].includes(c.status))
      .filter(c => !partyId || c.partyId === partyId);
  }, [state.checks, partyId]);

  const candidateInvoices = useMemo(() => {
    return state.invoices
      .filter(i => i.type === "فروش" && i.status !== "باطل")
      .filter(i => !partyId || i.partyId === partyId);
  }, [state.invoices, partyId]);

  const existingGroups = state.checkGroupAllocations || [];

  const totalSelectedChecks = candidateChecks
    .filter(c => selectedCheckIds.has(c.id))
    .reduce((sum, c) => sum + c.amount, 0);

  const totalSelectedInvoices = candidateInvoices
    .filter(i => selectedInvoiceIds.has(i.id))
    .reduce((sum, i) => sum + i.amount, 0);

  function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) {
      window.alert("لطفاً نام یا عنوانی برای این گروه تخصیص وارد کنید.");
      return;
    }
    if (selectedCheckIds.size === 0 || selectedInvoiceIds.size === 0) {
      window.alert("لطفاً حداقل یک چک و یک فاکتور برای تخصیص گروهی انتخاب کنید.");
      return;
    }

    const newGroup: CheckGroupAllocation = {
      id: createId("grp-alloc"),
      name: groupName.trim(),
      partyId: partyId || undefined,
      checkIds: Array.from(selectedCheckIds),
      invoiceIds: Array.from(selectedInvoiceIds),
      createdAt: todayJalali(),
    };

    const nextGroups = [...existingGroups, newGroup];
    const nextState = rebuildCheckAllocations({
      ...state,
      checkGroupAllocations: nextGroups,
    });

    onSave(nextState, `تخصیص گروهی «${newGroup.name}» ثبت و محاسبات به‌روزرسانی شد`);
    setGroupName("");
    setSelectedCheckIds(new Set());
    setSelectedInvoiceIds(new Set());
  }

  function handleDeleteGroup(groupId: string) {
    const target = existingGroups.find(g => g.id === groupId);
    if (!target) return;
    if (!window.confirm(`آیا از لغو و حذف تخصیص گروهی «${target.name}» اطمینان دارید؟`)) return;

    const nextGroups = existingGroups.filter(g => g.id !== groupId);
    const nextState = rebuildCheckAllocations({
      ...state,
      checkGroupAllocations: nextGroups,
    });
    onSave(nextState, `تخصیص گروهی «${target.name}» لغو شد`);
  }

  function toggleCheck(id: string) {
    setSelectedCheckIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleInvoice(id: string) {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllChecks() {
    setSelectedCheckIds(new Set(candidateChecks.map(c => c.id)));
  }

  function clearAllChecks() {
    setSelectedCheckIds(new Set());
  }

  function selectAllInvoices() {
    setSelectedInvoiceIds(new Set(candidateInvoices.map(i => i.id)));
  }

  function clearAllInvoices() {
    setSelectedInvoiceIds(new Set());
  }

  return (
    <Dialog title="مدیریت تخصیص دستی گروهی چک به گروه فاکتورها" onClose={onClose}>
      <div className="group-allocation-dialog-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p className="helper-text" style={{ margin: 0, fontSize: 13, color: "#555" }}>
          در این بخش می‌توانید دسته‌ای از چک‌ها را مستقیماً به دسته‌ای از فاکتورها تخصیص دهید (مثلاً چک‌های z1 تا z4 به فاکتورهای ۱۰۱۰ تا ۱۰۱۲).
          محاسبه دیرکرد و تسویه ابتدا بین این دو دسته به ترتیب سررسید و تاریخ انجام شده و باقیمانده‌ها به چرخه عادی می‌روند.
        </p>

        <form onSubmit={handleCreateGroup} style={{ border: "1px solid #dcdcdc", borderRadius: 8, padding: 14, background: "#fafafa" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#142d31" }}>ایجاد تخصیص گروهی جدید</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label>
              طرف حساب / مشتری
              <select value={partyId} onChange={e => {
                setPartyId(e.target.value);
                setSelectedCheckIds(new Set());
                setSelectedInvoiceIds(new Set());
              }}>
                <option value="">همه طرف‌حساب‌ها</option>
                {state.people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              عنوان یا نام گروه تخصیص *
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="مثلاً: تسویه چک‌های پاییز با فاکتورهای سری A"
                required
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
            {/* انتخاب چک‌ها */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>۱. انتخاب چک‌ها ({selectedCheckIds.size} از {candidateChecks.length})</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="text-button" onClick={selectAllChecks} style={{ fontSize: 11 }}>انتخاب همه</button>
                  <button type="button" className="text-button" onClick={clearAllChecks} style={{ fontSize: 11, color: "#888" }}>لغو همه</button>
                </div>
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 4, padding: 6 }}>
                {candidateChecks.length ? (
                  candidateChecks.map(check => (
                    <label key={check.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer", borderBottom: "1px dashed #f0f0f0", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={selectedCheckIds.has(check.id)}
                        onChange={() => toggleCheck(check.id)}
                      />
                      <span>
                        <strong>چک {check.number}</strong> · {formatMoney(check.amount, state.settings.currency)}
                        <small style={{ display: "block", color: "#666" }}>سررسید: {formatDate(check.dueDate)} ({check.status})</small>
                      </span>
                    </label>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: 12 }}>چکی برای این طرف حساب موجود نیست</div>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: "#1b4d3e" }}>
                مجموع مبلغ چک‌ها: {formatMoney(totalSelectedChecks, state.settings.currency)}
              </div>
            </div>

            {/* انتخاب فاکتورها */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>۲. انتخاب فاکتورها ({selectedInvoiceIds.size} از {candidateInvoices.length})</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="text-button" onClick={selectAllInvoices} style={{ fontSize: 11 }}>انتخاب همه</button>
                  <button type="button" className="text-button" onClick={clearAllInvoices} style={{ fontSize: 11, color: "#888" }}>لغو همه</button>
                </div>
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 4, padding: 6 }}>
                {candidateInvoices.length ? (
                  candidateInvoices.map(inv => (
                    <label key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer", borderBottom: "1px dashed #f0f0f0", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.has(inv.id)}
                        onChange={() => toggleInvoice(inv.id)}
                      />
                      <span>
                        <strong>فاکتور {inv.number}</strong> · {formatMoney(inv.amount, state.settings.currency)}
                        <small style={{ display: "block", color: "#666" }}>
                          تاریخ: {formatDate(inv.date)} · مانده: {formatMoney(Math.max(0, inv.amount - (inv.paidAmount || 0)), state.settings.currency)}
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: 12 }}>فاکتوری برای این طرف حساب موجود نیست</div>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: "#1b4d3e" }}>
                مجموع مبلغ فاکتورها: {formatMoney(totalSelectedInvoices, state.settings.currency)}
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 8 }}>
            <button type="submit" className="button button-primary">
              <Check size={16} />
              ثبت و اعمال تخصیص گروهی
            </button>
          </div>
        </form>

        {/* لیست تخصیص‌های قبلی */}
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#142d31" }}>
            تخصیص‌های گروهی تعریف‌شده ({existingGroups.length})
          </h4>
          {existingGroups.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {existingGroups.map(group => {
                const person = state.people.find(p => p.id === group.partyId);
                const checkList = state.checks.filter(c => group.checkIds.includes(c.id));
                const invoiceList = state.invoices.filter(i => group.invoiceIds.includes(i.id));
                const groupChecksAmount = checkList.reduce((sum, c) => sum + c.amount, 0);
                const groupInvoicesAmount = invoiceList.reduce((sum, i) => sum + i.amount, 0);
                return (
                  <div key={group.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid #d4ded9", borderRadius: 6, background: "#fff" }}>
                    <div>
                      <strong style={{ fontSize: 13, color: "#142d31" }}>{group.name}</strong>
                      {person && <span className="soft-tag" style={{ marginRight: 8 }}>طرف حساب: {person.name}</span>}
                      <small style={{ display: "block", color: "#666", marginTop: 4 }}>
                        چک‌ها ({checkList.length} فقره به مبلغ {formatMoney(groupChecksAmount, state.settings.currency)}): {checkList.map(c => `چک ${c.number}`).join("، ") || "—"}
                      </small>
                      <small style={{ display: "block", color: "#666", marginTop: 2 }}>
                        فاکتورها ({invoiceList.length} فقره به مبلغ {formatMoney(groupInvoicesAmount, state.settings.currency)}): {invoiceList.map(i => `فاکتور ${i.number}`).join("، ") || "—"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      style={{ color: "#d9534f" }}
                      onClick={() => handleDeleteGroup(group.id)}
                      title="لغو و حذف این تخصیص گروهی"
                    >
                      <Trash2 size={14} />
                      لغو تخصیص
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#888", padding: 12, textAlign: "center", border: "1px dashed #dcdcdc", borderRadius: 6 }}>
              هنوز هیچ تخصیص گروهی ثبت نشده است.
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function BankAccounts({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (next: AppState, message: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "بانک" as "بانک" | "صندوق" | "شریک",
    balance: "0",
    adjustment: "",
  });
  const [sort, setSort] = useState<"asc" | "desc">("asc");

  const accounts = useMemo(
    () =>
      [...state.accounts].sort(
        (a, b) => (sort === "asc" ? 1 : -1) * a.name.localeCompare(b.name, "fa")
      ),
    [state.accounts, sort]
  );
  const totals = useMemo(
    () => ({
      all: state.accounts.reduce((sum, account) => sum + account.balance, 0),
      banks: state.accounts
        .filter(account => account.type === "بانک")
        .reduce((sum, account) => sum + account.balance, 0),
      cash: state.accounts
        .filter(account => account.type === "صندوق")
        .reduce((sum, account) => sum + account.balance, 0),
    }),
    [state.accounts]
  );

  function reset() {
    setEditingId(null);
    setForm({ name: "", type: "بانک", balance: "0", adjustment: "" });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const enteredBalance = parseLocalizedNumber(form.balance) || 0;
    const existing = editingId ? state.accounts.find(account => account.id === editingId) : undefined;
    const adjustment = existing && form.adjustment.trim() !== ""
      ? parseLocalizedNumber(form.adjustment) || 0
      : 0;
    const balance = existing && form.adjustment.trim() !== ""
      ? existing.balance + adjustment
      : enteredBalance;
    const balanceDelta = existing ? balance - existing.balance : balance;
    const nextAccounts = editingId
      ? state.accounts.map(account =>
          account.id === editingId
            ? { ...account, name, type: form.type, balance }
            : account
        )
      : [
          ...state.accounts,
          { id: createId("account"), name, type: form.type, balance },
        ];
    const cashEvent = (existing || balanceDelta !== 0) && (form.type === "بانک" || form.type === "صندوق")
      ? {
          id: createId("cash-account-adjustment"),
          at: new Date().toISOString(),
          date: todayJalali(),
          kind: "adjustment" as const,
          accountId: editingId || nextAccounts[nextAccounts.length - 1].id,
          amount: balanceDelta,
          currency: state.settings.currency,
          sourceType: "account_balance_adjustment",
          note: existing ? `اصلاح ماندهٔ ${name} از طریق صفحهٔ حساب‌ها` : `موجودی افتتاحیهٔ ${name}`,
        }
      : undefined;
    onSave(
      { ...state, accounts: nextAccounts, cashEvents: cashEvent ? [...state.cashEvents, cashEvent] : state.cashEvents },
      editingId ? "حساب بانکی اصلاح شد" : "حساب جدید اضافه شد"
    );
    reset();
  }

  function edit(account: AppState["accounts"][number]) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      balance: String(account.balance),
      adjustment: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remove(account: AppState["accounts"][number]) {
    const referenced = state.checks.some(
      check => check.bankAccountId === account.id
    );
    if (referenced) {
      window.alert(
        "این حساب در چک‌ها استفاده شده و برای حفظ یکپارچگی قابل حذف نیست."
      );
      return;
    }
    if (!window.confirm(`حساب «${account.name}» حذف شود؟`)) return;
    onSave(
      {
        ...state,
        accounts: state.accounts.filter(item => item.id !== account.id),
      },
      "حساب حذف شد"
    );
  }

  return (
    <div className="page-stack page-enter bank-page">
      <PageIntro
        kicker="مدیریت نقدینگی"
        title="بانک‌ها و صندوق‌ها"
        description="حساب‌های بانکی، صندوق و شریک را جداگانه مدیریت کنید؛ موجودی وصول چک‌ها در همین صفحه قابل ردیابی است."
        actionLabel={editingId ? "انصراف از ویرایش" : "حساب جدید"}
        onAction={reset}
      />
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-icon mint">
            <WalletCards size={19} />
          </div>
          <div className="metric-copy">
            <span>مجموع نقدینگی</span>
            <strong>{formatMoney(totals.all, state.settings.currency)}</strong>
            <small>{formatNumber(state.accounts.length)} حساب</small>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon indigo">
            <Banknote size={19} />
          </div>
          <div className="metric-copy">
            <span>موجودی بانک‌ها</span>
            <strong>
              {formatMoney(totals.banks, state.settings.currency)}
            </strong>
            <small>پس از ثبت وصول چک به‌روزرسانی می‌شود</small>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon amber">
            <WalletCards size={19} />
          </div>
          <div className="metric-copy">
            <span>موجودی صندوق</span>
            <strong>{formatMoney(totals.cash, state.settings.currency)}</strong>
            <small>صندوق‌های فعال</small>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon violet">
            <FileClock size={19} />
          </div>
          <div className="metric-copy">
            <span>چک‌های متصل به بانک</span>
            <strong>
              {formatNumber(
                state.checks.filter(check => check.bankAccountId).length
              )}
            </strong>
            <small>مرجع حساب بانکی ثبت‌شده</small>
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="panel table-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">دفتر حساب‌ها</span>
              <h3>حساب‌های ثبت‌شده</h3>
            </div>
            <SortControl direction={sort} onChange={setSort} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام حساب</th>
                  <th>نوع</th>
                  <th>موجودی</th>
                  <th>چک‌های مرتبط</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => {
                  const linkedChecks = state.checks.filter(
                    check => check.bankAccountId === account.id
                  );
                  return (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.name}</strong>
                      </td>
                      <td>
                        <span className="soft-tag">{account.type}</span>
                      </td>
                      <td className="amount-cell">
                        {formatMoney(account.balance, state.settings.currency)}
                      </td>
                      <td>{formatNumber(linkedChecks.length)}</td>
                      <td>
                        <button
                          className="icon-button row-action edit-action"
                          title="ویرایش حساب"
                          onClick={() => edit(account)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button row-action delete-action"
                          title="حذف حساب"
                          onClick={() => remove(account)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading full-field">
            <div>
              <span className="section-kicker">ثبت و اصلاح</span>
              <h3>{editingId ? "ویرایش حساب" : "افزودن حساب جدید"}</h3>
            </div>
          </div>
          <label>
            نام حساب
            <input
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder="مثلاً بانک ملت"
              required
            />
          </label>
          <label>
            نوع حساب
            <select
              value={form.type}
              onChange={event =>
                setForm({
                  ...form,
                  type: event.target.value as typeof form.type,
                })
              }
            >
              <option value="بانک">بانک</option>
              <option value="صندوق">صندوق</option>
              <option value="شریک">شریک</option>
            </select>
          </label>
          <label className="full-field">
            موجودی اولیه / ماندهٔ ثبت‌شده
            <input
              inputMode="decimal"
              value={form.balance}
              onChange={event =>
                setForm({ ...form, balance: event.target.value })
              }
            />
          </label>
          {editingId && (
            <label className="full-field">
              اصلاح موجودی (+/-)
              <input inputMode="decimal" value={form.adjustment} onChange={event => setForm({ ...form, adjustment: event.target.value })} placeholder="مثلاً +1.5 یا -2500" />
              <small className="muted-cell">این مقدار به ماندهٔ قبلی اضافه یا از آن کم می‌شود و در دفتر نقدی به‌صورت رویداد مستقل ثبت خواهد شد.</small>
            </label>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={reset}
            >
              پاک‌کردن فرم
            </button>
            <button type="submit" className="button button-primary">
              {editingId ? "ذخیره اصلاح" : "افزودن حساب"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayrollPage({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (next: AppState, message: string) => void;
}) {
  const [form, setForm] = useState({
    employeeName: "",
    personId: "",
    amount: "",
    feeAmount: "",
    period: todayJalali().slice(0, 7),
    date: todayJalali(),
    accountId: "",
    status: "پرداخت‌شده" as "پرداخت‌شده" | "پرداختنی",
    note: "",
  });
  const payrollPeople = state.people.filter(person =>
    person.roles.some(role => ["کارگر", "کارمند", "شریک"].includes(role))
  );
  const cashAccounts = state.accounts.filter(account => account.type === "بانک" || account.type === "صندوق");
  const activeRecords = state.payrollRecords.filter(record => record.status !== "باطل");
  const [filters, setFilters] = useState({ personId: "", role: "", status: "همه", period: "" });
  const filteredRecords = activeRecords.filter(record => {
    const person = record.personId ? state.people.find(item => item.id === record.personId) : undefined;
    const roles = person?.roles || [];
    return (!filters.personId || record.personId === filters.personId)
      && (!filters.role || roles.includes(filters.role as typeof PERSON_TYPES[number]))
      && (filters.status === "همه" || record.status === filters.status)
      && (!filters.period || record.period.includes(filters.period.trim()));
  });
  const monthlySummary = activeRecords.reduce((result, record) => {
    const row = result[record.period] || { paid: 0, payable: 0, count: 0 };
    row.count += 1;
    if (record.status === "پرداخت‌شده") row.paid += record.amount;
    if (record.status === "پرداختنی") row.payable += record.amount;
    result[record.period] = row;
    return result;
  }, {} as Record<string, { paid: number; payable: number; count: number }>);
  const summaryRows = Object.entries(monthlySummary).sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);
  const totals = activeRecords.reduce(
    (result, record) => {
      if (record.status !== "باطل") result[record.status] += record.amount;
      return result;
    },
    { "پرداخت‌شده": 0, "پرداختنی": 0 } as Record<"پرداخت‌شده" | "پرداختنی", number>
  );

  function createPayroll(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseLocalizedNumber(form.amount);
    const account = cashAccounts.find(item => item.id === form.accountId);
    const employeeName = form.employeeName.trim();
    if (!employeeName || !Number.isFinite(amount) || amount <= 0) return;
    if (form.status === "پرداخت‌شده" && !account) {
      window.alert("برای حقوق پرداخت‌شده، بانک یا صندوق پرداخت‌کننده را انتخاب کنید.");
      return;
    }
    const id = createId("payroll");
    const transactionId = form.status === "پرداخت‌شده" ? createId("payroll-payment") : undefined;
    const record = {
      id,
      date: form.date,
      period: form.period,
      employeeName,
      personId: form.personId || undefined,
      amount,
      feeAmount: form.status === "پرداخت‌شده" ? Math.max(0, parseLocalizedNumber(form.feeAmount) || 0) : 0,
      status: form.status,
      accountId: account?.id,
      transactionId,
      paidAt: form.status === "پرداخت‌شده" ? form.date : undefined,
      note: form.note.trim(),
    } as const;
    const transaction = transactionId
      ? {
          id: transactionId,
          type: "پرداخت حقوق" as const,
          date: form.date,
          accountId: account!.id,
          referenceType: "هزینه" as const,
          referenceId: id,
          referenceLabel: `حقوق ${employeeName}`,
          amount,
          feeAmount: Math.max(0, parseLocalizedNumber(form.feeAmount) || 0),
          status: "ثبت شده" as const,
          note: `پرداخت حقوق ${employeeName} · دوره ${form.period}${form.note.trim() ? ` · ${form.note.trim()}` : ""}`,
        }
      : undefined;
    onSave(
      {
        ...state,
        payrollRecords: [record, ...state.payrollRecords],
        transactions: transaction ? [transaction, ...state.transactions] : state.transactions,
        accounts: transaction
          ? state.accounts.map(item => item.id === account!.id ? { ...item, balance: item.balance - amount - Math.max(0, parseLocalizedNumber(form.feeAmount) || 0) } : item)
          : state.accounts,
      },
      form.status === "پرداخت‌شده" ? "پرداخت حقوق ثبت شد؛ حساب شخص تغییری نکرد" : "حقوق پرداختنی ثبت شد"
    );
    setForm(current => ({ ...current, employeeName: "", personId: "", amount: "", note: "" }));
  }

  function payRecord(record: AppState["payrollRecords"][number]) {
    const account = cashAccounts.find(item => item.id === form.accountId);
    if (!account) {
      window.alert("برای پرداخت حقوق پرداختنی، بانک یا صندوق را انتخاب کنید.");
      return;
    }
    const transactionId = createId("payroll-payment");
    const transaction = {
      id: transactionId,
      type: "پرداخت حقوق" as const,
      date: todayJalali(),
      accountId: account.id,
      referenceType: "هزینه" as const,
      referenceId: record.id,
      referenceLabel: `حقوق ${record.employeeName}`,
      amount: record.amount,
      feeAmount: Math.max(0, Number(record.feeAmount) || 0),
      status: "ثبت شده" as const,
      note: `پرداخت حقوق پرداختنی ${record.employeeName} · دوره ${record.period}`,
    };
    onSave(
      {
        ...state,
        payrollRecords: state.payrollRecords.map(item => item.id === record.id ? { ...item, status: "پرداخت‌شده", accountId: account.id, transactionId, paidAt: todayJalali() } : item),
        transactions: [transaction, ...state.transactions],
        accounts: state.accounts.map(item => item.id === account.id ? { ...item, balance: item.balance - record.amount - (Number(record.feeAmount) || 0) } : item),
      },
      "حقوق پرداختنی پرداخت شد؛ حساب شخص تغییری نکرد"
    );
  }

  function voidRecord(record: AppState["payrollRecords"][number]) {
    if (!window.confirm(`رکورد حقوق ${record.employeeName} باطل شود؟`)) return;
    const transaction = record.transactionId ? state.transactions.find(item => item.id === record.transactionId) : undefined;
    onSave(
      {
        ...state,
        payrollRecords: state.payrollRecords.map(item => item.id === record.id ? { ...item, status: "باطل" } : item),
        transactions: transaction
          ? state.transactions.map(item => item.id === transaction.id ? { ...item, status: "باطل" } : item)
          : state.transactions,
        accounts: record.status === "پرداخت‌شده" && record.accountId
          ? state.accounts.map(item => item.id === record.accountId ? { ...item, balance: item.balance + record.amount + (Number(record.feeAmount) || 0) } : item)
          : state.accounts,
      },
      "رکورد حقوق باطل و اثر حساب آن معکوس شد"
    );
  }

  return (
    <div className="page-stack page-enter">
      <PageIntro kicker="دفتر پرسنل" title="حقوق و دستمزد" description="پرداخت مستقیم حقوق، ثبت حقوق پرداختنی و ابطال برگشت‌پذیر؛ بدون اثر بر ماندهٔ طرف‌حساب." />
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-icon indigo"><WalletCards size={19} /></div><div className="metric-copy"><span>پرداخت‌شده</span><strong>{formatMoney(totals["پرداخت‌شده"], state.settings.currency)}</strong><small>کاهش بانک یا صندوق</small></div></div>
        <div className="metric-card"><div className="metric-icon amber"><Clock3 size={19} /></div><div className="metric-copy"><span>حقوق پرداختنی</span><strong>{formatMoney(totals["پرداختنی"], state.settings.currency)}</strong><small>بدون تغییر حساب شخص</small></div></div>
        <div className="metric-card"><div className="metric-icon mint"><Users size={19} /></div><div className="metric-copy"><span>رکوردهای فعال</span><strong>{filteredRecords.length}</strong><small>مطابق فیلتر فعلی</small></div></div>
      </div>
      <form className="panel form-grid" onSubmit={createPayroll}>
        <div className="panel-heading full-field"><div><span className="section-kicker">ثبت جدید</span><h3>پرداخت یا شناسایی حقوق</h3></div><span className="soft-tag">اثر طرف‌حساب: صفر</span></div>
        <label>نام کارگر / دریافت‌کننده<input value={form.employeeName} onChange={event => setForm({ ...form, employeeName: event.target.value })} placeholder="مثلاً علی رضایی" required /></label>
        <label>اتصال به کارگر، کارمند یا شریک<select value={form.personId} onChange={event => { const person = payrollPeople.find(item => item.id === event.target.value); setForm({ ...form, personId: event.target.value, employeeName: person?.name || form.employeeName }); }}><option value="">بدون اتصال به دفتر اشخاص</option>{payrollPeople.map(person => <option key={person.id} value={person.id}>{person.name} · {person.roles.filter(role => ["کارگر", "کارمند", "شریک"].includes(role)).join("، ")}</option>)}</select></label>
        <label>مبلغ حقوق<input inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value, feeAmount: String(calculateBankTransferFee(state.settings.bankFeeRules, form.accountId, parseLocalizedNumber(event.target.value)).fee || "") })} placeholder="مبلغ به تومان" required /></label>
        <label>کارمزد بانکی پرداخت حقوق<input inputMode="numeric" value={form.feeAmount} onChange={event => setForm({ ...form, feeAmount: event.target.value })} placeholder="در صورت کسر بانک" disabled={form.status === "پرداختنی"} /></label>
        <label>دوره حقوق<input value={form.period} onChange={event => setForm({ ...form, period: event.target.value })} placeholder="۱۴۰۵/۰۶" required /></label>
        <label>تاریخ ثبت<input value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required /></label>
        <label>نوع ثبت<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as "پرداخت‌شده" | "پرداختنی" })}><option value="پرداخت‌شده">همین حالا پرداخت می‌شود</option><option value="پرداختنی">حقوق پرداختنی؛ پرداخت در آینده</option></select></label>
        <label>بانک / صندوق پرداخت‌کننده<select value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value, feeAmount: String(calculateBankTransferFee(state.settings.bankFeeRules, event.target.value, parseLocalizedNumber(form.amount)).fee || "") })} disabled={form.status === "پرداختنی"}><option value="">انتخاب حساب</option>{cashAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · موجودی {formatMoney(account.balance, state.settings.currency)}</option>)}</select></label>
        <label className="full-field">توضیحات<textarea value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="مثلاً حقوق ماهانه، اضافه‌کاری یا پاداش" /></label>
        <div className="full-field form-actions"><button className="button button-primary" type="submit"><WalletCards size={16} /> ثبت حقوق</button></div>
      </form>
      <div className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">گزارش حقوق</span><h3>خلاصهٔ دوره‌ای</h3></div><span className="soft-tag">رکورد باطل‌شده محاسبه نمی‌شود</span></div><div className="table-wrap"><table><thead><tr><th>دوره</th><th>تعداد</th><th>پرداخت‌شده</th><th>پرداختنی</th><th>جمع تعهد دوره</th></tr></thead><tbody>{summaryRows.length ? summaryRows.map(([period, row]) => <tr key={period}><td><strong>{period}</strong></td><td>{row.count}</td><td>{formatMoney(row.paid, state.settings.currency)}</td><td>{formatMoney(row.payable, state.settings.currency)}</td><td>{formatMoney(row.paid + row.payable, state.settings.currency)}</td></tr>) : <tr><td colSpan={5}>هنوز رکورد فعال حقوقی ثبت نشده است.</td></tr>}</tbody></table></div></div>
      <div className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">دفتر حقوق</span><h3>سوابق پرداخت و حقوق پرداختنی</h3></div><span className="soft-tag">حساب شخص درگیر نمی‌شود</span></div><div className="filter-grid"><label>شخص<select value={filters.personId} onChange={event => setFilters({ ...filters, personId: event.target.value })}><option value="">همهٔ اشخاص</option>{payrollPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>نقش<select value={filters.role} onChange={event => setFilters({ ...filters, role: event.target.value })}><option value="">همهٔ نقش‌ها</option><option value="کارگر">کارگر</option><option value="کارمند">کارمند</option><option value="شریک">شریک</option></select></label><label>وضعیت<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="همه">همهٔ وضعیت‌ها</option><option value="پرداخت‌شده">پرداخت‌شده</option><option value="پرداختنی">پرداختنی</option></select></label><label>دوره<input value={filters.period} onChange={event => setFilters({ ...filters, period: event.target.value })} placeholder="مثلاً ۱۴۰۵/۰۶" /></label></div><div className="table-wrap"><table><thead><tr><th>دوره</th><th>دریافت‌کننده</th><th>مبلغ</th><th>وضعیت</th><th>حساب پرداخت</th><th>عملیات</th></tr></thead><tbody>{filteredRecords.length ? filteredRecords.map(record => { const linkedPerson = record.personId ? state.people.find(item => item.id === record.personId) : undefined; return <tr key={record.id}><td>{record.period}</td><td><strong>{linkedPerson?.name || record.employeeName}</strong><small className="table-subline">{linkedPerson ? `اتصال: ${linkedPerson.roles.join("، ")}` : "بدون اتصال به دفتر اشخاص"}{record.note ? ` · ${record.note}` : ""}</small></td><td>{formatMoney(record.amount, state.settings.currency)}</td><td><span className={`status-pill ${statusClass(record.status)}`}>{record.status}</span></td><td>{record.accountId ? state.accounts.find(item => item.id === record.accountId)?.name || "حذف‌شده" : "—"}</td><td className="table-actions">{record.status === "پرداختنی" && <button className="text-button" type="button" onClick={() => payRecord(record)}>پرداخت</button>}{record.status !== "باطل" && <button className="text-button danger" type="button" onClick={() => voidRecord(record)}>ابطال</button>}</td></tr>; }) : <tr><td colSpan={6}>رکوردی با فیلتر فعلی پیدا نشد.</td></tr>}</tbody></table></div></div>
      <div className="panel soft-panel"><strong>منطق حسابداری این صفحه</strong><p>نام کارگر، کارمند یا شریک به رکورد حقوق متصل می‌شود تا تغییر نام، گزارش و فیلترها یکپارچه باشند؛ اما تراکنش حقوق عمداً طرف‌حساب مالی ندارد. در پرداخت مستقیم، حساب بانک یا صندوق کاهش می‌یابد و هزینهٔ حقوق ثبت می‌شود. در ثبت حقوق پرداختنی، تا زمان پرداخت هیچ حساب بانکی و هیچ ماندهٔ شخصی تغییر نمی‌کند.</p></div>
    </div>
  );
}

function Transactions({
  state,
  onQuick,
  onSave,
}: {
  state: AppState;
  onQuick: () => void;
  onSave: (state: AppState, message: string) => void;
}) {
  const [editingTransaction, setEditingTransaction] = useState<
    AppState["transactions"][number] | null
  >(null);
  const [editForm, setEditForm] = useState({
    type: "دریافت" as TransactionType,
    amount: "",
    feeAmount: "",
    partyId: "",
    note: "",
    date: todayJalali(),
  });
  const [accountOperation, setAccountOperation] = useState({
    type: "انتقال بین حساب‌ها" as TransactionType,
    amount: "",
    feeAmount: "",
    fromAccountId: "",
    toAccountId: "",
    accountId: "",
    partyId: "",
    productId: "",
    warehouseId: "",
    quantity: "",
    unit: "",
    checkId: "",
    settlementDirection:
      "پرداخت بدهی کارگاه به شریک" as PartnerSettlementDirection,
    referenceType: "سایر" as "فاکتور خرید" | "چک" | "هزینه" | "سایر",
    referenceId: "",
    date: todayJalali(),
    note: "",
    partnerEffect: "افزایش طلب شریک" as
      | "افزایش طلب شریک"
      | "کاهش طلب شریک"
      | "افزایش طلب کارگاه از شریک"
      | "کاهش طلب کارگاه از شریک",
  });
  const [feeManuallyEdited, setFeeManuallyEdited] = useState(false);
  const accounts = state.accounts;
  const partners = state.people.filter(person => person.roles.includes("شریک"));
  const operationProducts = state.products;
  const operationChecks = state.checks.filter(check => check.status !== "باطل");
  const cashDiscrepancies = cashLedgerDiscrepancies(state);
  const isPartnerSettlementType = [
    "مساعده/پرداخت به شریک",
    "دریافت تسویه از شریک",
  ].includes(accountOperation.type);
  const parsedTransferAmount = parseLocalizedNumber(accountOperation.amount) || 0;
  const suggestedTransferFee = calculateBankTransferFee(
    state.settings.bankFeeRules,
    accountOperation.fromAccountId,
    parsedTransferAmount
  );
  useEffect(() => {
    if (accountOperation.type !== "انتقال بین حساب‌ها" || feeManuallyEdited) return;
    setAccountOperation(current => ({
      ...current,
      feeAmount: suggestedTransferFee.fee ? String(suggestedTransferFee.fee) : "",
    }));
  }, [accountOperation.type, accountOperation.amount, accountOperation.fromAccountId, feeManuallyEdited, suggestedTransferFee.fee]);
  function beginTransactionEdit(item: AppState["transactions"][number]) {
    setEditingTransaction(item);
    setEditForm({
      type: item.type,
      amount: String(item.amount),
      feeAmount: item.feeAmount ? String(item.feeAmount) : "",
      partyId: item.partyId || "",
      note: item.note || "",
      date: item.date,
    });
  }
  function applyAccountEffect(
    accounts: AppState["accounts"],
    transaction: AppState["transactions"][number],
    multiplier: 1 | -1
  ) {
    const totalTransferOutflow = transaction.amount + (transaction.type === "انتقال بین حساب‌ها" ? Math.max(0, transaction.feeAmount || 0) : 0);
    return accounts.map(account => {
      if (transaction.fromAccountId === account.id)
        return {
          ...account,
          balance: account.balance - totalTransferOutflow * multiplier,
        };
      if (transaction.toAccountId === account.id)
        return {
          ...account,
          balance: account.balance + transaction.amount * multiplier,
        };
      if (transaction.accountId === account.id && transaction.partnerEffect) {
        const delta =
          transaction.partnerEffect === "افزایش طلب شریک" ||
          transaction.partnerEffect === "افزایش طلب کارگاه از شریک"
            ? transaction.amount
            : -transaction.amount;
        return { ...account, balance: account.balance + delta * multiplier };
      }
      return account;
    });
  }
  function applyProductEffect(
    products: AppState["products"],
    transaction: AppState["transactions"][number],
    multiplier: 1 | -1
  ) {
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
  function saveTransactionEdit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseLocalizedNumber(editForm.amount);
    const feeAmount = Math.max(0, parseLocalizedNumber(editForm.feeAmount) || 0);
    if (!amount || !editingTransaction) return;
    const updatedTransaction = {
      ...editingTransaction,
      type: editForm.type,
      amount,
      feeAmount: editForm.type === "انتقال بین حساب‌ها" ? feeAmount : undefined,
      feeSource: editForm.type === "انتقال بین حساب‌ها" && feeAmount ? ("دستی" as const) : undefined,
      partyId: editForm.partyId || undefined,
      note: editForm.note,
      date: editForm.date,
    };
    let nextAccounts = state.accounts;
    let nextProducts = state.products;
    if (
      editingTransaction.accountId ||
      editingTransaction.fromAccountId ||
      editingTransaction.toAccountId
    ) {
      nextAccounts = applyAccountEffect(nextAccounts, editingTransaction, -1);
      nextAccounts = applyAccountEffect(nextAccounts, updatedTransaction, 1);
    }
    nextProducts = applyProductEffect(nextProducts, editingTransaction, -1);
    nextProducts = applyProductEffect(nextProducts, updatedTransaction, 1);
    onSave(
      {
        ...state,
        accounts: nextAccounts,
        products: nextProducts,
        transactions: state.transactions.map(row =>
          row.id === editingTransaction.id ? updatedTransaction : row
        ),
      },
      "تمام اطلاعات عملیات ویرایش شد"
    );
    setEditingTransaction(null);
  }
  function saveAccountOperation(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseLocalizedNumber(accountOperation.amount);
    const feeAmount = Math.max(0, parseLocalizedNumber(accountOperation.feeAmount) || 0);
    if (!amount || amount <= 0) return;
    const isTransfer = accountOperation.type === "انتقال بین حساب‌ها";
    const isStockOperation = ["خرید کالا", "فروش کالا"].includes(
      accountOperation.type
    );
    const isPartnerSettlement = [
      "مساعده/پرداخت به شریک",
      "دریافت تسویه از شریک",
    ].includes(accountOperation.type);
    const selectedProduct = state.products.find(
      product => product.id === accountOperation.productId
    );
    const quantity = parseLocalizedNumber(accountOperation.quantity);
    const quantityBase = selectedProduct
      ? quantityInBase(
          selectedProduct,
          quantity,
          accountOperation.unit || selectedProduct.unit
        )
      : quantity;
    if (
      isTransfer &&
      (!accountOperation.fromAccountId ||
        !accountOperation.toAccountId ||
        accountOperation.fromAccountId === accountOperation.toAccountId)
    ) {
      window.alert("حساب مبدأ و مقصد را متفاوت انتخاب کنید.");
      return;
    }
    if (
      !isTransfer &&
      !isStockOperation &&
      (!accountOperation.accountId || !accountOperation.partyId)
    ) {
      window.alert("حساب شریک و طرف حساب شریک را انتخاب کنید.");
      return;
    }
    if (
      isPartnerSettlement &&
      (!accountOperation.fromAccountId ||
        !accountOperation.toAccountId ||
        accountOperation.fromAccountId === accountOperation.toAccountId)
    ) {
      window.alert("حساب مبدأ و مقصد تسویه شریک را متفاوت انتخاب کنید.");
      return;
    }
    if (
      isStockOperation &&
      (!selectedProduct ||
        !accountOperation.warehouseId ||
        !accountOperation.partyId ||
        !accountOperation.accountId ||
        !quantity)
    ) {
      window.alert(
        "برای خرید یا فروش، کالا، انبار، طرف حساب و حساب مالی را انتخاب کنید."
      );
      return;
    }
    const nextAccounts = state.accounts.map(account => {
      if (isPartnerSettlement && account.id === accountOperation.fromAccountId)
        return { ...account, balance: account.balance - amount };
      if (isPartnerSettlement && account.id === accountOperation.toAccountId)
        return { ...account, balance: account.balance + amount };
      if (isTransfer && account.id === accountOperation.fromAccountId)
        return { ...account, balance: account.balance - amount - feeAmount };
      if (isTransfer && account.id === accountOperation.toAccountId)
        return { ...account, balance: account.balance + amount };
      if (isStockOperation && account.id === accountOperation.accountId) {
        return {
          ...account,
          balance:
            account.balance +
            (accountOperation.type === "خرید کالا" ? -amount : amount),
        };
      }
      if (
        !isTransfer &&
        !isStockOperation &&
        !isPartnerSettlement &&
        account.id === accountOperation.accountId
      ) {
        const delta =
          accountOperation.partnerEffect === "افزایش طلب شریک" ||
          accountOperation.partnerEffect === "افزایش طلب کارگاه از شریک"
            ? amount
            : -amount;
        return { ...account, balance: account.balance + delta };
      }
      return account;
    });
    const nextProducts =
      isStockOperation && selectedProduct
        ? state.products.map(product =>
            product.id === selectedProduct.id
              ? {
                  ...product,
                  warehouseId: accountOperation.warehouseId,
                  stock:
                    product.stock +
                    (accountOperation.type === "خرید کالا"
                      ? quantityBase
                      : -quantityBase),
                }
              : product
          )
        : state.products;
    const fromName = state.accounts.find(
      account => account.id === accountOperation.fromAccountId
    )?.name;
    const toName = state.accounts.find(
      account => account.id === accountOperation.toAccountId
    )?.name;
    const accountName = state.accounts.find(
      account => account.id === accountOperation.accountId
    )?.name;
    const warehouseName = state.warehouses.find(
      warehouse => warehouse.id === accountOperation.warehouseId
    )?.name;
    const productName = selectedProduct?.name;
    const referenceLabel =
      accountOperation.referenceType === "فاکتور خرید"
        ? state.invoices.find(
            invoice => invoice.id === accountOperation.referenceId
          )?.number
        : accountOperation.referenceType === "چک"
          ? state.checks.find(
              check => check.id === accountOperation.referenceId
            )?.number
          : undefined;
    const note = isTransfer
      ? `انتقال از ${fromName} به ${toName}${accountOperation.note ? ` · ${accountOperation.note}` : ""}`
      : isStockOperation
        ? `${accountOperation.type} · ${productName} · ${quantity} ${accountOperation.unit || selectedProduct?.unit} · انبار ${warehouseName} · حساب ${accountName}${accountOperation.checkId ? ` · چک ${state.checks.find(check => check.id === accountOperation.checkId)?.number || ""}` : ""}${accountOperation.note ? ` · ${accountOperation.note}` : ""}`
        : `${accountOperation.settlementDirection || accountOperation.partnerEffect} · ${accountName}${referenceLabel ? ` · مرجع ${accountOperation.referenceType}: ${referenceLabel}` : ""}${accountOperation.note ? ` · ${accountOperation.note}` : ""}`;
    const transaction: AppState["transactions"][number] = {
      id: createId("account-operation"),
      type: accountOperation.type,
      date: accountOperation.date,
      partyId: accountOperation.partyId || undefined,
      accountId: accountOperation.accountId || undefined,
      fromAccountId: accountOperation.fromAccountId || undefined,
      toAccountId: accountOperation.toAccountId || undefined,
      productId: accountOperation.productId || undefined,
      warehouseId: accountOperation.warehouseId || undefined,
      quantity: isStockOperation ? quantityBase : undefined,
      unit: accountOperation.unit || undefined,
      checkId: accountOperation.checkId || undefined,
      partnerEffect: isTransfer ? undefined : accountOperation.partnerEffect,
      settlementDirection: isPartnerSettlement
        ? accountOperation.settlementDirection
        : undefined,
      referenceType: isPartnerSettlement
        ? accountOperation.referenceType
        : undefined,
      referenceId: isPartnerSettlement
        ? accountOperation.referenceId || undefined
        : undefined,
      referenceLabel: isPartnerSettlement ? referenceLabel : undefined,
      amount,
      feeAmount: isTransfer ? feeAmount : undefined,
      feeSource: isTransfer && feeAmount
        ? (feeManuallyEdited ? ("دستی" as const) : ("تعرفه" as const))
        : undefined,
      status: "ثبت شده",
      note,
    };
    onSave(
      {
        ...state,
        accounts: nextAccounts,
        products: nextProducts,
        transactions: [transaction, ...state.transactions],
      },
      isTransfer
        ? "انتقال بین حساب‌ها ثبت شد"
        : isStockOperation
          ? `${accountOperation.type} با لینک کالا، انبار و حساب ثبت شد`
          : "عملیات شریک و اثر آن در حساب ثبت شد"
    );
    setAccountOperation({
      type: "انتقال بین حساب‌ها",
      amount: "",
      feeAmount: "",
      fromAccountId: "",
      toAccountId: "",
      accountId: "",
      partyId: "",
      productId: "",
      warehouseId: "",
      quantity: "",
      unit: "",
      checkId: "",
      settlementDirection: "پرداخت بدهی کارگاه به شریک",
      referenceType: "سایر",
      referenceId: "",
      date: todayJalali(),
      note: "",
      partnerEffect: "افزایش طلب شریک",
    });
    setFeeManuallyEdited(false);
  }
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="دفتر عملیات"
        title="عملیات مالی"
        description="فروش، خرید، دریافت، پرداخت و هزینه‌ها را در یک دفتر شفاف مدیریت کنید."
        actionLabel="ثبت عملیات"
        onAction={onQuick}
      />
      <div className="inventory-summary">
        <div>
          <ShieldCheck size={19} />
          <span>مغایرت دفتر نقدینگی</span>
          <strong>{formatNumber(cashDiscrepancies.length)}</strong>
        </div>
        <div>
          <WalletCards size={19} />
          <span>تعداد رویدادهای نقدینگی</span>
          <strong>{formatNumber(state.cashEvents.length)}</strong>
        </div>
      </div>
      <form
        className="panel form-grid account-operation-panel"
        onSubmit={saveAccountOperation}
      >
        <div className="panel-heading full-field">
          <div>
            <span className="section-kicker">گردش حساب و شریک</span>
            <h3>انتقال و تسویهٔ دوطرفه</h3>
          </div>
        </div>
        <label>
          نوع عملیات
          <select
            value={accountOperation.type}
            onChange={event =>
              setAccountOperation({
                ...accountOperation,
                type: event.target.value as TransactionType,
              })
            }
          >
            <option value="انتقال بین حساب‌ها">انتقال بین حساب‌ها</option>
            <option value="خرید کالا">خرید کالا / ورود به انبار</option>
            <option value="فروش کالا">فروش کالا / خروج از انبار</option>
            <option value="هزینه/خرید توسط شریک">هزینه/خرید توسط شریک</option>
            <option value="دریافت توسط شریک">دریافت وجه توسط شریک</option>
            <option value="مساعده/پرداخت به شریک">
              مساعده / پرداخت به شریک
            </option>
            <option value="دریافت تسویه از شریک">دریافت تسویه از شریک</option>
          </select>
          <div
            className="operation-type-grid"
            aria-label="انتخاب سریع نوع عملیات"
          >
            {(
              [
                ["انتقال بین حساب‌ها", "انتقال"],
                ["خرید کالا", "خرید کالا"],
                ["فروش کالا", "فروش کالا"],
                ["هزینه/خرید توسط شریک", "خرید شریک"],
                ["دریافت توسط شریک", "دریافت شریک"],
                ["مساعده/پرداخت به شریک", "مساعده"],
                ["دریافت تسویه از شریک", "تسویه شریک"],
              ] as Array<[TransactionType, string]>
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={accountOperation.type === value ? "active" : ""}
                onClick={() =>
                  setAccountOperation({ ...accountOperation, type: value })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <label>
          مبلغ
          <input
            inputMode="numeric"
            value={accountOperation.amount}
            onChange={event =>
              setAccountOperation({
                ...accountOperation,
                amount: event.target.value,
              })
            }
            placeholder="مبلغ"
            required
          />
        </label>
        {accountOperation.type === "انتقال بین حساب‌ها" && (
          <label>
            کارمزد بانکی از مبدأ
            <input
              inputMode="numeric"
              value={accountOperation.feeAmount}
              onChange={event =>
                (setFeeManuallyEdited(true), setAccountOperation({
                  ...accountOperation,
                  feeAmount: event.target.value,
                }))
              }
              placeholder="اگر ندارد، صفر"
            />
            <small className="muted-cell">
              {suggestedTransferFee.rule
                ? `تعرفه «${suggestedTransferFee.rule.name}» · پیشنهاد: ${formatMoney(suggestedTransferFee.fee, state.settings.currency)}`
                : "تعرفه‌ای برای این حساب ثبت نشده؛ مبلغ را در صورت نیاز دستی وارد کنید."}
              <br />اصل مبلغ کامل به حساب مقصد می‌رسد؛ کارمزد از مبدأ کسر می‌شود.
            </small>
          </label>
        )}
        {accountOperation.type === "انتقال بین حساب‌ها" ? (
          <>
            <label>
              حساب مبدأ
              <select
                value={accountOperation.fromAccountId}
                onChange={event =>
                  (setFeeManuallyEdited(false), setAccountOperation({
                    ...accountOperation,
                    fromAccountId: event.target.value,
                  }))
                }
              >
                <option value="">انتخاب مبدأ</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              حساب مقصد
              <select
                value={accountOperation.toAccountId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    toAccountId: event.target.value,
                  })
                }
              >
                <option value="">انتخاب مقصد</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.type}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : ["خرید کالا", "فروش کالا"].includes(accountOperation.type) ? (
          <>
            <label>
              کالا
              <select
                value={accountOperation.productId}
                onChange={event => {
                  const product = state.products.find(
                    item => item.id === event.target.value
                  );
                  setAccountOperation({
                    ...accountOperation,
                    productId: event.target.value,
                    unit: product?.unit || "",
                    warehouseId: product?.warehouseId || "",
                  });
                }}
              >
                <option value="">انتخاب کالا</option>
                {operationProducts.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              انبار نگهداری
              <select
                value={accountOperation.warehouseId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    warehouseId: event.target.value,
                  })
                }
              >
                <option value="">انتخاب انبار</option>
                {state.warehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              طرف حساب
              <select
                value={accountOperation.partyId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    partyId: event.target.value,
                  })
                }
              >
                <option value="">انتخاب مشتری / تأمین‌کننده</option>
                {state.people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.roles.join("، ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              حساب پرداخت / دریافت
              <select
                value={accountOperation.accountId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    accountId: event.target.value,
                  })
                }
              >
                <option value="">انتخاب حساب</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              تعداد و واحد
              <div className="inline-form-fields">
                <input
                  inputMode="decimal"
                  value={accountOperation.quantity}
                  onChange={event =>
                    setAccountOperation({
                      ...accountOperation,
                      quantity: event.target.value,
                    })
                  }
                  placeholder="تعداد"
                />
                <select
                  value={accountOperation.unit}
                  onChange={event =>
                    setAccountOperation({
                      ...accountOperation,
                      unit: event.target.value,
                    })
                  }
                >
                  <option value="">واحد</option>
                  {[
                    accountOperation.productId &&
                      operationProducts.find(
                        product => product.id === accountOperation.productId
                      )?.unit,
                    accountOperation.productId &&
                      operationProducts.find(
                        product => product.id === accountOperation.productId
                      )?.unit2,
                  ]
                    .filter(Boolean)
                    .map(unit => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                </select>
              </div>
            </label>
            <label>
              چک پرداختی (اختیاری)
              <select
                value={accountOperation.checkId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    checkId: event.target.value,
                  })
                }
              >
                <option value="">بدون چک</option>
                {operationChecks.map(check => (
                  <option key={check.id} value={check.id}>
                    {check.number} ·{" "}
                    {formatMoney(check.amount, state.settings.currency)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              حساب مالی شریک
              <select
                value={accountOperation.accountId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    accountId: event.target.value,
                  })
                }
              >
                <option value="">انتخاب حساب شریک</option>
                {accounts
                  .filter(account => account.type === "شریک")
                  .map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              طرف حساب شریک / ذی‌نفع
              <select
                value={accountOperation.partyId}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    partyId: event.target.value,
                  })
                }
              >
                <option value="">انتخاب شریک</option>
                {partners.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              اثر بر مانده شریک
              <select
                value={accountOperation.partnerEffect}
                onChange={event =>
                  setAccountOperation({
                    ...accountOperation,
                    partnerEffect: event.target
                      .value as typeof accountOperation.partnerEffect,
                  })
                }
              >
                <option value="افزایش طلب شریک">
                  افزایش طلب شریک / بدهی کارگاه
                </option>
                <option value="کاهش طلب شریک">کاهش طلب شریک / تسویه</option>
                <option value="افزایش طلب کارگاه از شریک">
                  افزایش طلب کارگاه از شریک
                </option>
                <option value="کاهش طلب کارگاه از شریک">
                  کاهش طلب کارگاه از شریک / بازپرداخت
                </option>
              </select>
            </label>
            {isPartnerSettlementType && (
              <>
                <div className="partner-settlement-hint full-field">
                  پرداخت بدهی کارگاه به شریک یعنی پول از حساب کارگاه به حساب
                  شریک می‌رود؛ دریافت طلب کارگاه از شریک یعنی وجه فاکتور/چک از
                  حساب شریک به حساب کارگاه منتقل می‌شود.
                </div>
                <label>
                  جهت تسویه
                  <select
                    value={accountOperation.settlementDirection}
                    onChange={event =>
                      setAccountOperation({
                        ...accountOperation,
                        settlementDirection: event.target
                          .value as PartnerSettlementDirection,
                        partnerEffect:
                          event.target.value === "پرداخت بدهی کارگاه به شریک"
                            ? "کاهش طلب شریک"
                            : "کاهش طلب کارگاه از شریک",
                      })
                    }
                  >
                    <option value="پرداخت بدهی کارگاه به شریک">
                      پرداخت بدهی کارگاه به شریک
                    </option>
                    <option value="دریافت طلب کارگاه از شریک">
                      دریافت طلب کارگاه از شریک
                    </option>
                  </select>
                </label>
                <label>
                  حساب مبدأ تسویه
                  <select
                    value={accountOperation.fromAccountId}
                    onChange={event =>
                      setAccountOperation({
                        ...accountOperation,
                        fromAccountId: event.target.value,
                      })
                    }
                  >
                    <option value="">انتخاب حساب مبدأ</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  حساب مقصد تسویه
                  <select
                    value={accountOperation.toAccountId}
                    onChange={event =>
                      setAccountOperation({
                        ...accountOperation,
                        toAccountId: event.target.value,
                      })
                    }
                  >
                    <option value="">انتخاب حساب مقصد</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نوع مرجع
                  <select
                    value={accountOperation.referenceType}
                    onChange={event =>
                      setAccountOperation({
                        ...accountOperation,
                        referenceType: event.target
                          .value as typeof accountOperation.referenceType,
                        referenceId: "",
                      })
                    }
                  >
                    <option value="فاکتور خرید">فاکتور خرید</option>
                    <option value="چک">چک</option>
                    <option value="هزینه">هزینه</option>
                    <option value="سایر">سایر</option>
                  </select>
                </label>
                {accountOperation.referenceType === "فاکتور خرید" && (
                  <label>
                    فاکتور مرجع
                    <select
                      value={accountOperation.referenceId}
                      onChange={event =>
                        setAccountOperation({
                          ...accountOperation,
                          referenceId: event.target.value,
                        })
                      }
                    >
                      <option value="">انتخاب فاکتور خرید</option>
                      {state.invoices
                        .filter(
                          invoice =>
                            invoice.type === "خرید" &&
                            invoice.status !== "باطل" &&
                            (!accountOperation.partyId ||
                              invoice.partyId === accountOperation.partyId)
                        )
                        .map(invoice => (
                          <option key={invoice.id} value={invoice.id}>
                            {invoice.number} ·{" "}
                            {formatMoney(
                              invoice.amount,
                              state.settings.currency
                            )}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {accountOperation.referenceType === "چک" && (
                  <label>
                    چک مرجع
                    <select
                      value={accountOperation.referenceId}
                      onChange={event =>
                        setAccountOperation({
                          ...accountOperation,
                          referenceId: event.target.value,
                        })
                      }
                    >
                      <option value="">انتخاب چک</option>
                      {operationChecks
                        .filter(
                          check =>
                            !accountOperation.partyId ||
                            check.partyId === accountOperation.partyId
                        )
                        .map(check => (
                          <option key={check.id} value={check.id}>
                            {check.number} ·{" "}
                            {formatMoney(check.amount, state.settings.currency)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </>
        )}
        <label>
          تاریخ
          <JalaliDatePicker
            value={accountOperation.date}
            onChange={date =>
              setAccountOperation({ ...accountOperation, date })
            }
          />
        </label>
        <label className="full-field">
          شرح عملیاتی
          <input
            value={accountOperation.note}
            onChange={event =>
              setAccountOperation({
                ...accountOperation,
                note: event.target.value,
              })
            }
            placeholder="مثلاً خرید مواد اولیه توسط شریک یا مساعده"
          />
        </label>
        <div className="form-actions full-field">
          <button className="button button-primary" type="submit">
            ثبت گردش حساب
          </button>
        </div>
      </form>
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input placeholder="جست‌وجوی عملیات یا طرف حساب..." />
        </div>
        <button className="filter-button">
          همه عملیات <ChevronDown size={15} />
        </button>
        <button className="filter-button">
          این ماه <ChevronDown size={15} />
        </button>
      </div>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نوع عملیات</th>
                <th>تاریخ</th>
                <th>طرف حساب / شرح</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {state.transactions.length ? (
                state.transactions.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="table-type">
                        <span
                          className={`table-dot ${["دریافت", "درآمد"].includes(item.type) ? "mint" : "rose"}`}
                        />
                        {transactionLabel(item.type)}
                      </span>
                    </td>
                    <td>{formatDate(item.date)}</td>
                    <td>
                      <div>{personName(state, item.partyId)}</div>
                      {item.note && (
                        <small className="muted-cell">{item.note}</small>
                      )}
                    </td>
                    <td className="amount-cell">
                      {formatMoney(item.amount, state.settings.currency)}
                      <small className="table-subline">{cashDirectionLabel(item.type)}</small>
                      {!!item.feeAmount && <small className="table-subline">کارمزد: {formatMoney(item.feeAmount, state.settings.currency)} از مبدأ</small>}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                      <button
                        className="icon-button row-action"
                        title="ویرایش کامل عملیات"
                        onClick={() => beginTransactionEdit(item)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button row-action"
                        title="حذف عملیات"
                        onClick={() => {
                          if (!window.confirm("عملیات حذف شود؟")) return;
                          const nextAccounts =
                            item.accountId ||
                            item.fromAccountId ||
                            item.toAccountId
                              ? applyAccountEffect(state.accounts, item, -1)
                              : state.accounts;
                          const nextProducts = applyProductEffect(
                            state.products,
                            item,
                            -1
                          );
                          onSave(
                            {
                              ...state,
                              accounts: nextAccounts,
                              products: nextProducts,
                              transactions: state.transactions.filter(
                                row => row.id !== item.id
                              ),
                            },
                            "عملیات حذف شد و اثر حسابی آن برگشت داده شد"
                          );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      title="دفتر عملیات خالی است"
                      description="هنوز رکوردی برای نمایش وجود ندارد."
                      onAction={onQuick}
                      actionLabel="ثبت عملیات"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editingTransaction && (
        <Dialog
          title="ویرایش کامل عملیات مالی"
          onClose={() => setEditingTransaction(null)}
        >
          <form className="form-grid" onSubmit={saveTransactionEdit}>
            <label>
              نوع عملیات
              <select
                value={editForm.type}
                onChange={e =>
                  setEditForm({
                    ...editForm,
                    type: e.target.value as TransactionType,
                  })
                }
              >
                {(
                  [
                    "انتقال بین حساب‌ها",
                    "دریافت",
                    "پرداخت",
                    "فروش",
                    "خرید",
                    "هزینه",
                    "درآمد",
                    "اصلاحیه",
                  ] as TransactionType[]
                ).map(type => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              مبلغ
              <input
                inputMode="numeric"
                value={editForm.amount}
                onChange={e =>
                  setEditForm({ ...editForm, amount: e.target.value })
                }
              />
            </label>
            {editForm.type === "انتقال بین حساب‌ها" && (
              <label>
                کارمزد بانکی از مبدأ
                <input
                  inputMode="numeric"
                  value={editForm.feeAmount}
                  onChange={e => setEditForm({ ...editForm, feeAmount: e.target.value })}
                />
              </label>
            )}
            <label>
              تاریخ
              <JalaliDatePicker
                value={editForm.date}
                onChange={date => setEditForm({ ...editForm, date })}
              />
            </label>
            <label>
              طرف حساب
              <select
                value={editForm.partyId}
                onChange={e =>
                  setEditForm({ ...editForm, partyId: e.target.value })
                }
              >
                <option value="">بدون طرف حساب</option>
                {state.people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-field">
              توضیحات
              <input
                value={editForm.note}
                onChange={e =>
                  setEditForm({ ...editForm, note: e.target.value })
                }
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setEditingTransaction(null)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                ذخیره ویرایش عملیات
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function People({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const blank = {
    code: "",
    name: "",
    roles: ["مشتری"] as AppState["people"][number]["roles"],
    phone: "",
    defaultPaymentRuleId: "",
  };
  const [open, setOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<
    AppState["people"][number] | null
  >(null);
  const [peopleSortDirection, setPeopleSortDirection] = useState<
    "asc" | "desc"
  >("asc");
  const [form, setForm] = useState(blank);
  const nextPersonCode = useMemo(
    () =>
      suggestNextNumber(
        state.people.map(item => item.code),
        1
      ).padStart(3, "0"),
    [state.people]
  );
  function beginEdit(person: AppState["people"][number]) {
    setEditingPerson(person);
    setForm({
      code: person.code || nextPersonCode,
      name: person.name,
      roles: person.roles?.length ? person.roles : [person.type],
      phone: person.phone || "",
      defaultPaymentRuleId: person.defaultPaymentRuleId || "",
    });
    setOpen(true);
  }
  function toggleRole(role: AppState["people"][number]["roles"][number]) {
    setForm({
      ...form,
      roles: form.roles.includes(role)
        ? form.roles.filter(item => item !== role)
        : [...form.roles, role],
    });
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.roles.length) return;
    const person = {
      id: editingPerson?.id || createId("person"),
      code: form.code.trim() || nextPersonCode,
      name: form.name.trim(),
      type: form.roles[0],
      roles: form.roles,
      phone: form.phone,
      defaultPaymentRuleId: form.defaultPaymentRuleId || undefined,
      balance: editingPerson?.balance || 0,
    };
    const people = editingPerson
      ? state.people.map(item => (item.id === editingPerson.id ? person : item))
      : [person, ...state.people];
    onSave(
      { ...state, people },
      editingPerson
        ? "تمام اطلاعات طرف حساب ویرایش شد"
        : "طرف حساب با نقش‌های انتخاب‌شده ثبت شد"
    );
    setForm(blank);
    setEditingPerson(null);
    setOpen(false);
  }
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="دفتر اشخاص"
        title="طرف حساب‌ها"
        description="یک نفر می‌تواند هم‌زمان مشتری، تأمین‌کننده، شریک یا هر نقش دیگری داشته باشد."
        actionLabel="افزودن طرف حساب"
        onAction={() => {
          setEditingPerson(null);
          setForm(blank);
          setOpen(true);
        }}
      />
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">دفتر اشخاص</span>
            <h3>{formatNumber(state.people.length)} رکورد</h3>
          </div>
          <div className="panel-heading-actions">
            <SortControl
              direction={peopleSortDirection}
              onChange={setPeopleSortDirection}
              ascLabel="الفبایی"
              descLabel="معکوس"
            />
            <div className="search-box compact">
              <Search size={16} />
              <input placeholder="جست‌وجو..." />
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>نام</th>
                <th>نقش‌ها</th>
                <th>تلفن</th>
                <th>مانده</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {state.people.length ? (
                [...state.people]
                  .sort(
                    (a, b) =>
                      (peopleSortDirection === "asc" ? 1 : -1) *
                      a.name.localeCompare(b.name, "fa")
                  )
                  .map(person => {
                    const balance = partyBalanceDescriptor(state, person.id);
                    return <tr key={person.id}>
                      <td className="muted-cell">{person.code}</td>
                      <td>
                        <strong>{person.name}</strong>
                      </td>
                      <td>
                        <div className="role-tags">
                          {(person.roles?.length
                            ? person.roles
                            : [person.type]
                          ).map(role => (
                            <span className="soft-tag" key={role}>
                              {role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{person.phone || "—"}</td>
                      <td className={balance.tone}>
                        <strong>{balance.amount ? formatMoney(balance.amount, state.settings.currency) : "—"}</strong>
                        <small className="table-subline">{balance.label}</small>
                      </td>
                      <td>
                        <button
                          className="icon-button row-action"
                          title="ویرایش کامل طرف حساب"
                          onClick={() => beginEdit(person)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button row-action"
                          title="حذف طرف حساب"
                          onClick={() =>
                            window.confirm("طرف حساب حذف شود؟") &&
                            onSave(
                              {
                                ...state,
                                people: state.people.filter(
                                  item => item.id !== person.id
                                ),
                              },
                              "طرف حساب حذف شد"
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>;
                  })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="هنوز طرف حسابی ندارید"
                      description="با ساختن اولین مخاطب، ثبت عملیات مالی سریع‌تر می‌شود."
                      onAction={() => setOpen(true)}
                      actionLabel="افزودن طرف حساب"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <Dialog
          title={editingPerson ? "ویرایش کامل طرف حساب" : "طرف حساب جدید"}
          onClose={() => {
            setOpen(false);
            setEditingPerson(null);
          }}
        >
          <form onSubmit={submit} className="form-grid">
            <label>
              کد طرف حساب
              <input
                inputMode="numeric"
                value={form.code}
                placeholder={`پیشنهاد: ${nextPersonCode}`}
                onChange={e => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label className="full-field">
              نام و نام خانوادگی
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <fieldset className="role-fieldset">
              <legend>
                نقش‌های طرف حساب <small>(امکان انتخاب چند مورد)</small>
              </legend>
              <div className="checkbox-grid">
                {PERSON_TYPES.map(role => (
                  <label className="checkbox-option" key={role}>
                    <input
                      type="checkbox"
                      checked={form.roles.includes(role)}
                      onChange={() => toggleRole(role)}
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              شماره تماس
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              شرایط پرداخت پیش‌فرض
              <select
                value={form.defaultPaymentRuleId}
                onChange={e =>
                  setForm({ ...form, defaultPaymentRuleId: e.target.value })
                }
              >
                <option value="">بدون پیش‌فرض</option>
                {state.paymentRules.map(rule => (
                  <option value={rule.id} key={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                {editingPerson ? "ذخیره ویرایش" : "ذخیره طرف حساب"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
function Inventory({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseNote, setWarehouseNote] = useState("");
  const [editingWarehouse, setEditingWarehouse] = useState<
    AppState["warehouses"][number] | null
  >(null);
  const [editingProduct, setEditingProduct] = useState<
    AppState["products"][number] | null
  >(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("همه");
  const [productSortDirection, setProductSortDirection] = useState<
    "asc" | "desc"
  >("asc");
  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    amount: "",
    unit: "",
    note: "",
  });
  const [form, setForm] = useState({
    code: "",
    name: "",
    unit: "عدد",
    unit2: "کارتن",
    conversionRate: "1",
    warehouseId: state.warehouses[0]?.id || "",
    stock: "0",
    stockUnit: "کارتن",
    minStock: "0",
    price: "0",
  });
  const nextProductCode = useMemo(
    () =>
      suggestNextNumber(
        state.products.map(item => item.code),
        1
      ).padStart(3, "0"),
    [state.products]
  );
  function adjustStock(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseLocalizedNumber(adjustForm.amount);
    if (!adjustForm.productId || !amount) return;
    const product = state.products.find(
      item => item.id === adjustForm.productId
    );
    if (!product) return;
    try {
      onSave(
        adjustInventoryBalance(
          state,
          product.id,
          amount,
          adjustForm.unit || product.unit,
          adjustForm.note
        ),
        "بالانس موجودی ثبت شد؛ اثر مالی ندارد"
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "بالانس موجودی ثبت نشد");
      return;
    }
    setAdjustOpen(false);
    setAdjustForm({ productId: "", amount: "", unit: "", note: "" });
  }
  const selectedProduct = state.products.find(
    product => product.id === selectedProductId
  );
  const visibleProducts = state.products
    .filter(product =>
      warehouseFilter === "همه"
        ? true
        : warehouseFilter === "بدون انبار"
          ? !product.warehouseId
          : product.warehouseId === warehouseFilter
    )
    .sort(
      (a, b) =>
        (productSortDirection === "asc" ? 1 : -1) *
        a.name.localeCompare(b.name, "fa")
    );
  const inventoryDiscrepancies = inventoryLedgerDiscrepancies(state);
  const movements = useMemo(() => {
    if (!selectedProduct) return [];
    const rows: Array<{
      id: string;
      date: string;
      reference: string;
      direction: string;
      quantity: number;
      unit: string;
      amount: number;
      warehouse: string;
    }> = [];
    state.invoices
      .filter(invoice => invoice.status !== "باطل")
      .forEach(invoice =>
        invoice.items
          .filter(item => item.productId === selectedProduct.id)
          .forEach(item =>
            rows.push({
              id: `invoice-${invoice.id}-${item.id}`,
              date: invoice.date,
              reference: `فاکتور ${invoice.number}`,
              direction: invoice.type === "خرید" ? "ورود خرید" : "خروج فروش",
              quantity: item.quantityBase || item.quantity,
              unit: item.unit,
              amount: item.total,
              warehouse:
                state.warehouses.find(
                  warehouse => warehouse.id === selectedProduct.warehouseId
                )?.name || "بدون انبار",
            })
          )
      );
    state.transactions
      .filter(
        item =>
          item.status !== "باطل" &&
          item.productId === selectedProduct.id &&
          ["خرید کالا", "فروش کالا"].includes(item.type)
      )
      .forEach(item =>
        rows.push({
          id: `transaction-${item.id}`,
          date: item.date,
          reference: "عملیات مستقیم",
          direction: item.type === "خرید کالا" ? "ورود خرید" : "خروج فروش",
          quantity: item.quantity || 0,
          unit: item.unit || selectedProduct.unit,
          amount: item.amount,
          warehouse:
            state.warehouses.find(
              warehouse => warehouse.id === item.warehouseId
            )?.name || "بدون انبار",
        })
      );
    state.productionRecords.forEach(record => {
      const formula = state.productionFormulas.find(
        item => item.id === record.formulaId
      );
      if (!formula) return;
      if (formula.outputProductId === selectedProduct.id) {
        rows.push({
          id: `production-output-${record.id}`,
          date: record.date,
          reference: `تولید ${formula.name}`,
          direction: "ورود تولید",
          quantity: record.outputQuantityBase ?? record.outputQuantity,
          unit: selectedProduct.unit,
          amount: record.totalCost,
          warehouse:
            state.warehouses.find(
              warehouse => warehouse.id === selectedProduct.warehouseId
            )?.name || "بدون انبار",
        });
      }
      formula.materials
        .filter(material => material.productId === selectedProduct.id)
        .forEach(material =>
          rows.push({
            id: `production-material-${record.id}-${material.id}`,
            date: record.date,
            reference: `مصرف تولید ${formula.name}`,
            direction: "خروج مصرف تولید",
            quantity: quantityInBase(
              selectedProduct,
              material.quantity,
              material.unit
            ),
            unit: selectedProduct.unit,
            amount:
              quantityInBase(
                selectedProduct,
                material.quantity,
                material.unit
              ) * selectedProduct.price,
            warehouse:
              state.warehouses.find(
                warehouse => warehouse.id === selectedProduct.warehouseId
              )?.name || "بدون انبار",
          })
        );
    });
    state.inventoryEvents
      .filter(
        event =>
          event.productId === selectedProduct.id &&
          ["adjustment", "opening_balance", "reversal"].includes(event.kind)
      )
      .forEach(event =>
        rows.push({
          id: `inventory-event-${event.id}`,
          date: event.date,
          reference:
            event.kind === "opening_balance"
              ? "موجودی اولیه / migration"
              : "بالانس بدون اثر مالی",
          direction: event.quantityBase >= 0 ? "ورود اصلاح موجودی" : "خروج اصلاح موجودی",
          quantity: event.quantityEntered,
          unit: event.unitEntered,
          amount: 0,
          warehouse:
            state.warehouses.find(warehouse => warehouse.id === event.warehouseId)?.name ||
            "بدون انبار",
        })
      );
    return rows.sort((a, b) =>
      jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date))
    );
  }, [selectedProduct, state]);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const enteredStock = parseLocalizedNumber(form.stock) || 0;
    const draftProduct = {
      id: "draft",
      code: form.code,
      name: form.name,
      unit: form.unit,
      unit2: form.unit2,
      conversionRate: Number(form.conversionRate) || 1,
      stock: 0,
      minStock: 0,
      price: 0,
    } satisfies Product;
    const product = {
      id: editingProduct?.id || createId("product"),
      code:
        form.code.trim() || String(state.products.length + 1).padStart(3, "0"),
      name: form.name.trim(),
      unit: form.unit,
      unit2: form.unit2,
      conversionRate: draftProduct.conversionRate,
      warehouseId: form.warehouseId || undefined,
      stock: editingProduct
        ? enteredStock
        : quantityInBase(
            draftProduct,
            enteredStock,
            form.stockUnit || form.unit
          ),
      minStock: parseLocalizedNumber(form.minStock) || 0,
      price: parseLocalizedNumber(form.price) || 0,
    };
    const products = editingProduct
      ? state.products.map(row =>
          row.id === editingProduct.id ? product : row
        )
      : [product, ...state.products];
    onSave(
      { ...state, products },
      editingProduct
        ? "تمام اطلاعات کالا ویرایش شد"
        : "کالای جدید با محل نگهداری ثبت شد"
    );
    setOpen(false);
    setEditingProduct(null);
  }
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="کنترل موجودی"
        title="انبار و کالا"
        description="کالا را با واحد اول، واحد دوم، نسبت تبدیل و محل نگهداری ثبت کنید."
        actionLabel="افزودن کالا"
        onAction={() => {
          setEditingProduct(null);
          setForm(current => ({ ...current, code: nextProductCode }));
          setOpen(true);
        }}
      />
      <div className="toolbar">
        <button
          className="button button-ghost button-small"
          onClick={() => setWarehouseOpen(true)}
        >
          افزودن انبار
        </button>
        <button
          className="button button-ghost button-small"
          onClick={() => setAdjustOpen(true)}
        >
          بالانس / اصلاح موجودی
        </button>
        <span className="soft-tag">
          {formatNumber(state.warehouses.length)} انبار فعال
        </span>
      </div>
      <div className="warehouse-strip">
        {state.warehouses.map(warehouse => (
          <span className="warehouse-chip" key={warehouse.id}>
            <Boxes size={14} />
            {warehouse.name}
            <button
              className="icon-button"
              title="ویرایش انبار"
              onClick={() => {
                setEditingWarehouse(warehouse);
                setWarehouseName(warehouse.name);
                setWarehouseNote(warehouse.note || "");
                setWarehouseOpen(true);
              }}
            >
              <Pencil size={12} />
            </button>
            <button
              className="icon-button"
              title="حذف انبار"
              onClick={() =>
                window.confirm("انبار حذف شود؟") &&
                onSave(
                  {
                    ...state,
                    warehouses: state.warehouses.filter(
                      item => item.id !== warehouse.id
                    ),
                  },
                  "انبار حذف شد"
                )
              }
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="warehouse-tabs" role="tablist" aria-label="فیلتر انبار">
        <button
          className={
            warehouseFilter === "همه" ? "warehouse-tab active" : "warehouse-tab"
          }
          onClick={() => setWarehouseFilter("همه")}
        >
          همه کالاها ({formatNumber(state.products.length)})
        </button>
        {state.warehouses.map(warehouse => {
          const count = state.products.filter(
            product => product.warehouseId === warehouse.id
          ).length;
          return (
            <button
              key={warehouse.id}
              className={
                warehouseFilter === warehouse.id
                  ? "warehouse-tab active"
                  : "warehouse-tab"
              }
              onClick={() => setWarehouseFilter(warehouse.id)}
            >
              {warehouse.name} ({formatNumber(count)})
            </button>
          );
        })}
        <button
          className={
            warehouseFilter === "بدون انبار"
              ? "warehouse-tab active"
              : "warehouse-tab"
          }
          onClick={() => setWarehouseFilter("بدون انبار")}
        >
          بدون انبار (
          {formatNumber(
            state.products.filter(product => !product.warehouseId).length
          )}
          )
        </button>
      </div>
      <div className="inventory-summary">
        <div>
          <Boxes size={19} />
          <span>تعداد کالا</span>
          <strong>{formatNumber(state.products.length)}</strong>
        </div>
        <div>
          <WalletCards size={19} />
          <span>ارزش تقریبی موجودی</span>
          <strong>
            {formatMoney(
              state.products.reduce(
                (sum, item) => sum + item.stock * item.price,
                0
              ),
              state.settings.currency
            )}
          </strong>
        </div>
        <div>
          <RefreshCw size={19} />
          <span>نیازمند بررسی</span>
          <strong>
            {formatNumber(
              state.products.filter(item => item.stock <= item.minStock).length
            )}
          </strong>
        </div>
        <div>
          <ShieldCheck size={19} />
          <span>مغایرت دفتر رویداد</span>
          <strong>{formatNumber(inventoryDiscrepancies.length)}</strong>
        </div>
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">دفتر کالا</span>
            <h3>
              {warehouseFilter === "همه"
                ? "وضعیت فعلی انبار"
                : warehouseFilter === "بدون انبار"
                  ? "کالاهای بدون انبار"
                  : state.warehouses.find(item => item.id === warehouseFilter)
                      ?.name}
            </h3>
          </div>
          <div className="panel-heading-actions">
            <SortControl
              direction={productSortDirection}
              onChange={setProductSortDirection}
              ascLabel="الفبایی"
              descLabel="معکوس"
            />
            <span className="soft-tag">واحد اول / واحد دوم</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد کالا</th>
                <th>نام کالا</th>
                <th>واحدها</th>
                <th>انبار</th>
                <th>موجودی</th>
                <th>قیمت پایه</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.length ? (
                visibleProducts.map(product => (
                  <tr key={product.id}>
                    <td className="muted-cell">{product.code}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelectedProductId(product.id)}
                      >
                        <strong>{product.name}</strong>
                      </button>
                    </td>
                    <td>
                      <span className="soft-tag">
                        {product.unit} / {product.unit2 || product.unit} ×{" "}
                        {formatNumber(product.conversionRate || 1)}
                      </span>
                    </td>
                    <td>
                      {state.warehouses.find(
                        warehouse => warehouse.id === product.warehouseId
                      )?.name || "بدون انبار"}
                    </td>
                    <td className="amount-cell">
                      {formatNumber(product.stock)}
                    </td>
                    <td>
                      {formatMoney(product.price, state.settings.currency)}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${product.stock <= product.minStock ? "status-warning" : "status-success"}`}
                      >
                        {product.stock <= product.minStock
                          ? "نیاز به تأمین"
                          : "مناسب"}
                      </span>
                      <button
                        className="icon-button row-action"
                        title="بالانس / اصلاح بدون اثر مالی"
                        onClick={() => {
                          setAdjustForm({
                            productId: product.id,
                            amount: "",
                            unit: product.unit,
                            note: "",
                          });
                          setAdjustOpen(true);
                        }}
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        className="icon-button row-action"
                        title="ویرایش کالا"
                        onClick={() => {
                          setEditingProduct(product);
                          setForm({
                            code: product.code,
                            name: product.name,
                            unit: product.unit,
                            unit2: product.unit2 || product.unit,
                            conversionRate: String(product.conversionRate || 1),
                            warehouseId: product.warehouseId || "",
                            stock: String(product.stock),
                            stockUnit: product.unit,
                            minStock: String(product.minStock),
                            price: String(product.price),
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button row-action"
                        title="حذف کالا"
                        onClick={() =>
                          window.confirm("کالا حذف شود؟") &&
                          onSave(
                            {
                              ...state,
                              products: state.products.filter(
                                item => item.id !== product.id
                              ),
                            },
                            "کالا حذف شد"
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="کالایی ثبت نشده"
                      description="پس از ثبت کالا، موجودی و محل نگهداری نمایش داده می‌شود."
                      onAction={() => setOpen(true)}
                      actionLabel="افزودن کالا"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectedProduct && (
        <div className="panel table-panel cardex-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">کاردکس کالا</span>
              <h3>{selectedProduct.name}</h3>
            </div>
            <span className="soft-tag">فاکتور، تولید و اصلاحات بدون اثر مالی</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>شماره فاکتور</th>
                  <th>نوع گردش</th>
                  <th>تعداد</th>
                  <th>انبار</th>
                  <th>ارزش گردش</th>
                </tr>
              </thead>
              <tbody>
                {movements.length ? (
                  movements.map(row => (
                    <tr key={row.id}>
                      <td>{formatDate(row.date)}</td>
                      <td>{row.reference}</td>
                      <td>
                        <span
                          className={`status-pill ${row.direction.startsWith("ورود") ? "status-success" : "status-warning"}`}
                        >
                          {row.direction}
                        </span>
                      </td>
                      <td>
                        {formatNumber(row.quantity)} {row.unit}
                      </td>
                      <td>{row.warehouse}</td>
                      <td>
                        {formatMoney(row.amount, state.settings.currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      برای این کالا گردش ثبت‌شده‌ای وجود ندارد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {warehouseOpen && (
        <Dialog
          title={editingWarehouse ? "ویرایش کامل انبار" : "افزودن انبار جدید"}
          onClose={() => setWarehouseOpen(false)}
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              if (!warehouseName.trim()) return;
              onSave(
                {
                  ...state,
                  warehouses: editingWarehouse
                    ? state.warehouses.map(row =>
                        row.id === editingWarehouse.id
                          ? {
                              ...row,
                              name: warehouseName.trim(),
                              note: warehouseNote,
                            }
                          : row
                      )
                    : [
                        {
                          id: createId("warehouse"),
                          name: warehouseName.trim(),
                          note: warehouseNote,
                        },
                        ...state.warehouses,
                      ],
                },
                editingWarehouse
                  ? "تمام اطلاعات انبار ویرایش شد"
                  : "انبار جدید ثبت شد"
              );
              setWarehouseName("");
              setWarehouseNote("");
              setEditingWarehouse(null);
              setWarehouseOpen(false);
            }}
            className="form-grid"
          >
            <label className="full-field">
              نام انبار
              <input
                autoFocus
                value={warehouseName}
                onChange={e => setWarehouseName(e.target.value)}
                placeholder="مثلاً انبار محصولات تولید"
              />
            </label>
            <label className="full-field">
              توضیحات انبار
              <textarea
                value={warehouseNote}
                onChange={e => setWarehouseNote(e.target.value)}
                placeholder="مثلاً محل نگهداری محصولات تولید"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setWarehouseOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                ذخیره انبار
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {adjustOpen && (
        <Dialog title="بالانس موجودی بدون اثر مالی" onClose={() => setAdjustOpen(false)}>
          <form onSubmit={adjustStock} className="form-grid">
            <label className="full-field">
              کالا
              <select
                value={adjustForm.productId}
                onChange={e => {
                  const selected = state.products.find(item => item.id === e.target.value);
                  setAdjustForm({
                    ...adjustForm,
                    productId: e.target.value,
                    unit: selected?.unit || "",
                  });
                }}
              >
                <option value="">انتخاب کالا</option>
                {state.products.map(product => (
                  <option value={product.id} key={product.id}>
                    {product.name} · موجودی {formatNumber(product.stock)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              مقدار بالانس موجودی
              <input
                inputMode="decimal"
                value={adjustForm.amount}
                onChange={e =>
                  setAdjustForm({ ...adjustForm, amount: e.target.value })
                }
                placeholder="مثبت=افزایش، منفی=کاهش؛ مثلاً +۱٫۵"
              />
            </label>
            <label>
              واحد بالانس
              <select
                value={adjustForm.unit}
                onChange={e => setAdjustForm({ ...adjustForm, unit: e.target.value })}
                disabled={!adjustForm.productId}
              >
                {(() => {
                  const selected = state.products.find(item => item.id === adjustForm.productId);
                  return Array.from(new Set([selected?.unit, selected?.unit2, ...state.settings.units]))
                    .filter(Boolean)
                    .map(unit => <option key={unit} value={unit}>{unit}</option>);
                })()}
              </select>
            </label>
            <label>
              علت اصلاح
              <input
                value={adjustForm.note}
                onChange={e =>
                  setAdjustForm({ ...adjustForm, note: e.target.value })
                }
                placeholder="مثلاً شمارش پایان ماه"
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setAdjustOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={17} />
                ثبت اصلاح موجودی
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {open && (
        <Dialog
          title={
            editingProduct
              ? `ویرایش کامل کالا: ${editingProduct.name}`
              : "افزودن کالا به انبار"
          }
          onClose={() => {
            setOpen(false);
            setEditingProduct(null);
          }}
        >
          <form onSubmit={submit} className="form-grid">
            <label>
              کد کالا
              <input
                value={form.code}
                inputMode="numeric"
                placeholder={`پیشنهاد: ${nextProductCode}`}
                onChange={e => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label>
              نام کالا
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              واحد اول
              <select
                value={form.unit}
                onChange={e => setForm({ ...form, unit: e.target.value })}
              >
                {state.settings.units.map(unit => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              واحد دوم
              <select
                value={form.unit2}
                onChange={e => setForm({ ...form, unit2: e.target.value })}
              >
                {state.settings.units.map(unit => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              نسبت تبدیل
              <input
                inputMode="numeric"
                value={form.conversionRate}
                onChange={e =>
                  setForm({ ...form, conversionRate: e.target.value })
                }
                placeholder="مثلاً ۳۶"
              />
            </label>
            <label>
              محل نگهداری
              <select
                value={form.warehouseId}
                onChange={e =>
                  setForm({ ...form, warehouseId: e.target.value })
                }
              >
                {state.warehouses.map(warehouse => (
                  <option value={warehouse.id} key={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              موجودی اولیه
              <select
                value={form.stockUnit}
                onChange={e => setForm({ ...form, stockUnit: e.target.value })}
              >
                {[form.unit, form.unit2, ...state.settings.units]
                  .filter(
                    (unit, index, list) => unit && list.indexOf(unit) === index
                  )
                  .map(unit => (
                    <option key={unit}>{unit}</option>
                  ))}
              </select>
              <input
                inputMode="decimal"
                value={form.stock}
                onChange={e => setForm({ ...form, stock: e.target.value })}
              />
            </label>
            <label>
              حداقل موجودی
              <input
                value={form.minStock}
                onChange={e => setForm({ ...form, minStock: e.target.value })}
              />
            </label>
            <label>
              قیمت پایه
              <input
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={17} />
                ذخیره کالا
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
function Prices({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<
    AppState["priceHistory"][number] | null
  >(null);
  const [form, setForm] = useState({
    productName: "",
    effectiveDate: todayJalali(),
    unit: "عدد",
    price: "",
    note: "",
    scope: "عمومی" as "عمومی" | "اختصاصی",
    partyIds: [] as string[],
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const price = parseLocalizedNumber(form.price);
    if (!form.productName.trim() || !price) return;
    const selectedProduct = state.products.find(
      item => item.name === form.productName
    );
    const priceUnit = selectedProduct?.unit || form.unit;
    onSave(
      {
        ...state,
        priceHistory: editingPrice
          ? state.priceHistory.map(item =>
              item.id === editingPrice.id
                ? {
                    ...item,
                    productId: selectedProduct?.id,
                    productName: form.productName.trim(),
                    scope: form.scope,
                    partyIds:
                      form.scope === "اختصاصی" ? form.partyIds : undefined,
                    effectiveDate: form.effectiveDate,
                    unit: priceUnit,
                    price,
                    priceBasis: "baseUnit",
                    baseUnit: selectedProduct?.unit || priceUnit,
                    note: form.note,
                  }
                : item
            )
          : [
              {
                id: createId("price"),
                productId: selectedProduct?.id,
                productName: form.productName.trim(),
                scope: form.scope,
                partyIds: form.scope === "اختصاصی" ? form.partyIds : undefined,
                effectiveDate: form.effectiveDate,
                unit: priceUnit,
                price,
                priceBasis: "baseUnit",
                baseUnit: selectedProduct?.unit || priceUnit,
                note: form.note,
              },
              ...state.priceHistory,
            ],
      },
      editingPrice
        ? "تمام اطلاعات قیمت ویرایش شد"
        : "قیمت جدید با دامنه هدف ثبت شد"
    );
    setOpen(false);
    setEditingPrice(null);
  }
  const sorted = [...state.priceHistory].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate)
  );
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="کنترل قیمت"
        title="تاریخچه قیمت"
        description="قیمت می‌تواند عمومی یا برای طرف حساب‌های انتخاب‌شده باشد و در فاکتور قابل override است."
        actionLabel="ثبت قیمت جدید"
        onAction={() => setOpen(true)}
      />
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کالا</th>
                <th>تاریخ اعتبار</th>
                <th>دامنه</th>
                <th>واحد</th>
                <th>قیمت</th>
                <th>توضیحات</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length ? (
                sorted.map(row => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.productName}</strong>
                    </td>
                    <td>{formatDate(row.effectiveDate)}</td>
                    <td>
                      <span className="soft-tag">
                        {row.scope}
                        {row.scope === "اختصاصی"
                          ? ` · ${formatNumber(row.partyIds?.length || 0)} طرف حساب`
                          : ""}
                      </span>
                    </td>
                    <td>{row.unit}</td>
                    <td className="amount-cell">
                      {formatMoney(row.price, state.settings.currency)}
                    </td>
                    <td>
                      {row.note || "—"}{" "}
                      <button
                        className="icon-button row-action"
                        title="ویرایش قیمت"
                        onClick={() => {
                          setEditingPrice(row);
                          setForm({
                            productName: row.productName,
                            effectiveDate: row.effectiveDate,
                            unit: row.unit,
                            price: String(row.price),
                            note: row.note || "",
                            scope: row.scope,
                            partyIds: row.partyIds || [],
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button row-action"
                        title="حذف قیمت"
                        onClick={() =>
                          window.confirm("رکورد قیمت حذف شود؟") &&
                          onSave(
                            {
                              ...state,
                              priceHistory: state.priceHistory.filter(
                                item => item.id !== row.id
                              ),
                            },
                            "رکورد قیمت حذف شد"
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="تاریخچه قیمتی وجود ندارد"
                      description="برای شروع، قیمت معتبر یک کالا را ثبت کنید."
                      onAction={() => setOpen(true)}
                      actionLabel="ثبت قیمت"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <Dialog
          title={editingPrice ? "ویرایش کامل قیمت" : "ثبت قیمت جدید"}
          onClose={() => {
            setOpen(false);
            setEditingPrice(null);
          }}
        >
          <form onSubmit={submit} className="form-grid">
            <label>
              کالا
              <select
                autoFocus
                value={form.productName}
                onChange={e => {
                  const product = state.products.find(
                    item => item.name === e.target.value
                  );
                  setForm({
                    ...form,
                    productName: e.target.value,
                    unit: product?.unit || form.unit,
                  });
                }}
              >
                <option value="">انتخاب کالا</option>
                {state.products.map(product => (
                  <option key={product.id} value={product.name}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              تاریخ اعتبار
              <JalaliDatePicker
                value={form.effectiveDate}
                onChange={effectiveDate => setForm({ ...form, effectiveDate })}
              />
            </label>
            <label>
              واحد
              <select
              value={form.unit}
                disabled={Boolean(
                  state.products.find(item => item.name === form.productName)
                )}
                onChange={e => setForm({ ...form, unit: e.target.value })}
              >
                {(state.products.find(item => item.name === form.productName)
                  ? [
                      state.products.find(
                        item => item.name === form.productName
                      )!.unit,
                    ]
                  : state.settings.units
                ).map(unit => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              قیمت پایه
              <input
                inputMode="numeric"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label>
              دامنه قیمت
              <select
                value={form.scope}
                onChange={e =>
                  setForm({
                    ...form,
                    scope: e.target.value as "عمومی" | "اختصاصی",
                  })
                }
              >
                <option>عمومی</option>
                <option>اختصاصی</option>
              </select>
            </label>
            {form.scope === "اختصاصی" && (
              <label className="full-field">
                طرف حساب‌های مجاز
                <select
                  multiple
                  value={form.partyIds}
                  onChange={e =>
                    setForm({
                      ...form,
                      partyIds: Array.from(
                        e.target.selectedOptions,
                        option => option.value
                      ),
                    })
                  }
                >
                  {state.people.map(person => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="full-field">
              توضیحات
              <input
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={17} />
                {editingPrice ? "ذخیره ویرایش قیمت" : "ذخیره قیمت"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
function PaymentRules({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<
    AppState["paymentRules"][number] | null
  >(null);
  const [form, setForm] = useState({
    name: "",
    dayBasis: "30",
    graceDays: "0",
    tiers: [{ maxDays: "30", rate: "0", note: "بدون هزینه دیرکرد" }],
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const tiers = form.tiers
      .filter(tier => Number(tier.maxDays) >= 0)
      .map((tier, index) => ({
        id: createId(`tier${index}`),
        maxDays: Number(tier.maxDays),
        rate: Number(tier.rate) / 100,
        note: tier.note,
      }));
    const rule = {
      id: editingRule?.id || createId("rule"),
      name: form.name.trim(),
      active: true,
      dayBasis: Number(form.dayBasis) || 30,
      graceDays: Number(form.graceDays) || 0,
      tiers,
    };
    onSave(
      {
        ...state,
        paymentRules: editingRule
          ? state.paymentRules.map(item =>
              item.id === editingRule.id ? rule : item
            )
          : [rule, ...state.paymentRules],
      },
      editingRule
        ? "تمام اطلاعات شرایط پرداخت ویرایش شد"
        : "شرایط پرداخت و پله‌های هزینه دیرکرد ثبت شد"
    );
    setOpen(false);
    setEditingRule(null);
    setForm({
      name: "",
      dayBasis: "30",
      graceDays: "0",
      tiers: [{ maxDays: "30", rate: "0", note: "بدون هزینه دیرکرد" }],
    });
  }
  function addTier() {
    setForm({
      ...form,
      tiers: [...form.tiers, { maxDays: "90", rate: "10", note: "" }],
    });
  }
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="سیاست تسویه"
        title="شرایط پرداخت و پله‌های هزینه دیرکرد"
        description="قواعد تسویه را یک‌بار تعریف کنید تا محاسبهٔ هزینهٔ روزشمار شفاف و قابل تغییر بماند."
        actionLabel="ساخت شرایط پرداخت"
        onAction={() => setOpen(true)}
      />
      <div className="rule-explainer">
        <div className="mini-icon violet">
          <Percent size={18} />
        </div>
        <div>
          <strong>محاسبه بر اساس اصل بدهی و روزهای واقعی</strong>
          <p>
            هر قاعده می‌تواند مبنای روزشمار و دورهٔ تنفس خودش را داشته باشد.
            پله‌ها از کمترین روز تا بیشترین روز مرتب می‌شوند.
          </p>
        </div>
      </div>
      <div className="rules-grid">
        {state.paymentRules.map(rule => (
          <div className="panel rule-card" key={rule.id}>
            <div className="rule-head">
              <div>
                <span className="section-kicker">شرایط تسویه</span>
                <h3>{rule.name}</h3>
              </div>
              <span
                className={`status-pill ${rule.active ? "status-success" : "status-danger"}`}
              >
                {rule.active ? "فعال" : "غیرفعال"}
              </span>
              {rule.id !== "cash-default" && (
                <button
                  className="icon-button row-action"
                  title="ویرایش نام شرایط"
                  onClick={() => {
                    setEditingRule(rule);
                    setForm({
                      name: rule.name,
                      dayBasis: String(rule.dayBasis),
                      graceDays: String(rule.graceDays),
                      tiers: rule.tiers.map(tier => ({
                        maxDays: String(tier.maxDays),
                        rate: String(tier.rate * 100),
                        note: tier.note || "",
                      })),
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
              {rule.id !== "cash-default" && (
                <button
                  className="icon-button row-action"
                  title="حذف شرایط"
                  onClick={() =>
                    window.confirm("شرایط پرداخت حذف شود؟") &&
                    onSave(
                      {
                        ...state,
                        paymentRules: state.paymentRules.filter(
                          item => item.id !== rule.id
                        ),
                      },
                      "شرایط پرداخت حذف شد"
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="rule-meta">
              <span>
                مبنای روزشمار <strong>{formatNumber(rule.dayBasis)} روز</strong>
              </span>
              <span>
                تنفس <strong>{formatNumber(rule.graceDays)} روز</strong>
              </span>
            </div>
            <div className="tier-list">
              {[...rule.tiers]
                .sort((a, b) => a.maxDays - b.maxDays)
                .map(tier => (
                  <div className="tier-row" key={tier.id}>
                    <span className="tier-badge">
                      {tier.maxDays === 9999 ? "∞" : formatNumber(tier.maxDays)}{" "}
                      روز
                    </span>
                    <strong>{formatNumber(tier.rate * 100)}٪</strong>
                    <small>{tier.note || "پلهٔ هزینه دیرکرد"}</small>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <Dialog
          title={editingRule ? "ویرایش کامل شرایط پرداخت" : "ساخت شرایط پرداخت"}
          onClose={() => {
            setOpen(false);
            setEditingRule(null);
          }}
        >
          <form onSubmit={submit} className="form-grid">
            <label className="full-field">
              نام شرایط
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="مثلاً فروش اعتباری مشتریان"
              />
            </label>
            <label>
              مبنای روزشمار
              <input
                inputMode="numeric"
                value={form.dayBasis}
                onChange={e => setForm({ ...form, dayBasis: e.target.value })}
              />
            </label>
            <label>
              روزهای تنفس
              <input
                inputMode="numeric"
                value={form.graceDays}
                onChange={e => setForm({ ...form, graceDays: e.target.value })}
              />
            </label>
            <div className="tier-editor">
              <div className="tier-editor-head">
                <span>پله‌های هزینه دیرکرد</span>
                <button type="button" className="text-button" onClick={addTier}>
                  <Plus size={14} />
                  افزودن پله
                </button>
              </div>
              {form.tiers.map((tier, index) => (
                <div className="tier-edit-row" key={index}>
                  <input
                    aria-label="حداکثر روز"
                    inputMode="numeric"
                    value={tier.maxDays}
                    onChange={e =>
                      setForm({
                        ...form,
                        tiers: form.tiers.map((item, i) =>
                          i === index
                            ? { ...item, maxDays: e.target.value }
                            : item
                        ),
                      })
                    }
                    placeholder="تا چند روز"
                  />
                  <input
                    aria-label="درصد هزینه دیرکرد"
                    inputMode="decimal"
                    value={tier.rate}
                    onChange={e =>
                      setForm({
                        ...form,
                        tiers: form.tiers.map((item, i) =>
                          i === index ? { ...item, rate: e.target.value } : item
                        ),
                      })
                    }
                    placeholder="درصد"
                  />
                  <input
                    aria-label="یادداشت پله"
                    value={tier.note}
                    onChange={e =>
                      setForm({
                        ...form,
                        tiers: form.tiers.map((item, i) =>
                          i === index ? { ...item, note: e.target.value } : item
                        ),
                      })
                    }
                    placeholder="توضیح پله"
                  />
                </div>
              ))}
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={17} />
                {editingRule ? "ذخیره ویرایش شرایط" : "ذخیره شرایط"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function Checks({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const statuses: CheckStatus[] = [
    "نزد ما",
    "وصول شده",
    "برگشتی",
    "عودت داده شده",
    "جایگزین شده",
    "باطل",
    "خرج شده",
  ];
  const [open, setOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState<
    AppState["checks"][number] | null
  >(null);
  const [replacementParent, setReplacementParent] = useState<
    AppState["checks"][number] | null
  >(null);
  const [replacementLines, setReplacementLines] = useState("");
  const [statusFilter, setStatusFilter] = useState<CheckStatus | "همه">("همه");
  const [checkPartyFilter, setCheckPartyFilter] = useState("همه");
  const [bankFilter, setBankFilter] = useState("همه");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedTo, setReceivedTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [historyCheckId, setHistoryCheckId] = useState<string | null>(null);
  const [expandedCheckIds, setExpandedCheckIds] = useState<Set<string>>(
    new Set()
  );
  const [checkSortDirection, setCheckSortDirection] = useState<"asc" | "desc">(
    "desc"
  );
  const [checkPage, setCheckPage] = useState(1);
  const [printingChecks, setPrintingChecks] = useState(false);
  const [groupAllocOpen, setGroupAllocOpen] = useState(false);
  const checkPageSize = 25;
  const blank = {
    number: "",
    partyId: "",
    bank: "",
    bankAccountId: "",
    returnPartyId: "",
    status: "نزد ما" as CheckStatus,
    replacementOf: "",
    receivedDate: todayJalali(),
    dueDate: todayJalali(),
    amount: "",
    feeAmount: "",
    paymentRuleId: "",
    targetInvoiceId: "",
    note: "",
  };
  const [form, setForm] = useState(blank);
  const nextCheckNumber = useMemo(() => {
    const checkParty = state.people.find(item => item.id === form.partyId);
    return suggestNextPartyNumber(
      state.checks,
      form.partyId,
      checkParty?.code,
      state.checks.map(item => item.number)
    );
  }, [state.checks, state.people, form.partyId]);
  const visibleChecks = state.checks
    .filter(
      check =>
        (statusFilter === "همه" || check.status === statusFilter) &&
        (checkPartyFilter === "همه" || check.partyId === checkPartyFilter) &&
        (bankFilter === "همه" || check.bankAccountId === bankFilter) &&
        (!receivedFrom || check.receivedDate >= receivedFrom) &&
        (!receivedTo || check.receivedDate <= receivedTo) &&
        (!dueFrom || check.dueDate >= dueFrom) &&
        (!dueTo || check.dueDate <= dueTo)
    )
    .sort(
      (a, b) =>
        (checkSortDirection === "asc" ? 1 : -1) *
        (jalaliDateKey(a.receivedDate).localeCompare(jalaliDateKey(b.receivedDate)) ||
          jalaliDateKey(a.dueDate).localeCompare(jalaliDateKey(b.dueDate)) ||
          a.id.localeCompare(b.id))
    );
  const checkPageCount = Math.max(1, Math.ceil(visibleChecks.length / checkPageSize));
  const safeCheckPage = Math.min(checkPage, checkPageCount);
  const paginatedChecks = visibleChecks.slice(
    (safeCheckPage - 1) * checkPageSize,
    safeCheckPage * checkPageSize
  );
  useEffect(() => {
    setCheckPage(1);
  }, [
    checkSortDirection,
    statusFilter,
    checkPartyFilter,
    bankFilter,
    receivedFrom,
    receivedTo,
    dueFrom,
    dueTo,
  ]);
  const allocationDetails = settleChecksFIFO(
    state.checks,
    state.invoices,
    state.paymentRules,
    state.settings.dayBasis
  );
  const allocationBalances = useMemo(
    () =>
      getSettlementBalances(
        allocationDetails,
        state.checks,
        state.invoices
      ),
    [allocationDetails, state.checks, state.invoices]
  );
  function recalculateAllocations() {
    onSave(
      rebuildCheckAllocations(state),
      "تخصیص FIFO همه چک‌ها بر اساس سررسید محاسبه شد"
    );
  }
  function exportChecks() {
    const rows = [
      [
        "شماره چک",
        "طرف حساب",
        "تاریخ دریافت",
        "سررسید",
        "مبلغ",
        "وضعیت",
        "بانک/شخص",
        "توضیحات",
      ],
      ...visibleChecks.map(check => [
        check.number,
        personName(state, check.partyId),
        check.receivedDate,
        check.dueDate,
        check.amount,
        check.status,
        state.accounts.find(account => account.id === check.bankAccountId)
          ?.name || personName(state, check.returnPartyId),
        check.note || "",
      ]),
    ];
    const csv = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "check-register.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function beginEdit(check: AppState["checks"][number]) {
    setEditingCheck(check);
    setForm({
      number: check.number,
      partyId: check.partyId || "",
      bank: check.bank || "",
      bankAccountId: check.bankAccountId || "",
      returnPartyId: check.returnPartyId || "",
      status: check.status,
      replacementOf: check.replacementOf || "",
      receivedDate: check.receivedDate,
      dueDate: check.dueDate,
      amount: String(check.amount),
      feeAmount: String(check.feeAmount || ""),
      paymentRuleId: check.paymentRuleId || "",
      targetInvoiceId: check.targetInvoiceId || "",
      note: check.note || "",
    });
    setReplacementLines("");
    setOpen(true);
  }
  function saveCheckStatus(
    check: AppState["checks"][number],
    status: CheckStatus,
    targetId: string
  ) {
    if (["نزد ما", "وصول شده", "برگشتی"].includes(status) && !targetId) {
      window.alert(
        "برای این وضعیت، ابتدا حساب بانکی مرجع را از ستون بعدی یا فرم ویرایش انتخاب کنید."
      );
      return;
    }
    const accountId = ["نزد ما", "وصول شده", "برگشتی"].includes(status)
      ? targetId
      : check.bankAccountId;
    const returnPartyId = ["عودت داده شده", "خرج شده"].includes(status)
      ? targetId
      : check.returnPartyId;
    let accounts = state.accounts.map(account =>
      account.id === check.bankAccountId && check.status === "وصول شده"
        ? { ...account, balance: account.balance - check.amount }
        : account
    );
    if (status === "وصول شده" && accountId)
      accounts = accounts.map(account =>
        account.id === accountId
          ? { ...account, balance: account.balance + check.amount }
          : account
      );
    let checks = state.checks.map(item =>
      item.id === check.id
        ? {
            ...item,
            status,
            collectedDate:
              status === "وصول شده"
                ? item.status === "وصول شده"
                  ? item.collectedDate || todayJalali()
                  : todayJalali()
                : item.collectedDate,
            bankAccountId: accountId || undefined,
            bank:
              state.accounts.find(item => item.id === accountId)?.name ||
              item.bank,
            returnPartyId: returnPartyId || undefined,
          }
        : item
    );
    checks = checks.map(item => {
      if (item.status !== "جایگزین شده") return item;
      const ids = item.replacementIds?.length
        ? item.replacementIds
        : checks
            .filter(child => child.replacementOf === item.id)
            .map(child => child.id);
      const children = checks.filter(child => ids.includes(child.id));
      return ids.length > 0 &&
        children.length === ids.length &&
        children.every(child => child.status === "وصول شده")
        ? { ...item, status: "وصول شده" as CheckStatus }
        : item;
    });
    onSave(
      rebuildCheckAllocations({
        ...state,
        checks,
        accounts,
        audit: [
          ...state.audit,
          {
            id: createId("check-status"),
            at: new Date().toISOString(),
            action: "CHECK_STATUS_CHANGED",
            note: `چک ${check.number}: ${check.status} ← ${status}`,
          },
        ],
      }),
      "وضعیت چک و مرجع آن به‌روزرسانی شد"
    );
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseLocalizedNumber(form.amount) || 0;
    if (!form.number.trim() || !amount) return;
    if (replacementParent && !editingCheck) {
      const replacement = {
        id: createId("check-replacement"),
        number: form.number.trim(),
        partyId: form.partyId || undefined,
        bank: form.bank,
        bankAccountId: form.bankAccountId || undefined,
        returnPartyId: form.returnPartyId || undefined,
        replacementOf: replacementParent.id,
        status: form.status,
        receivedDate: form.receivedDate,
        dueDate: form.dueDate,
        amount,
        feeAmount: Math.max(0, parseLocalizedNumber(form.feeAmount) || 0),
        paymentRuleId: form.paymentRuleId || undefined,
        replacementIds: [],
        note: form.note || "",
      };
      const checks = state.checks.map(item =>
        item.id === replacementParent.id
          ? {
              ...item,
              status: "جایگزین شده" as CheckStatus,
              replacementIds: [...(item.replacementIds || []), replacement.id],
            }
          : item
      );
      onSave(
        rebuildCheckAllocations({
          ...state,
          checks: [replacement, ...checks],
          audit: [
            ...state.audit,
            {
              id: createId("check-replacement"),
              at: new Date().toISOString(),
              action: "CHECK_REPLACEMENT_CREATED",
              note: `چک ${replacement.number} جایگزین چک ${replacementParent.number} ثبت شد`,
            },
          ],
        }),
        "چک جایگزین جدید ثبت شد"
      );
      setOpen(false);
      setEditingCheck(null);
      setReplacementParent(null);
      setForm(blank);
      return;
    }
    const id = editingCheck?.id || createId("check");
    const next = {
      id,
      number: form.number.trim(),
      partyId: form.partyId || undefined,
      bank: form.bank,
      bankAccountId: form.bankAccountId || undefined,
      returnPartyId: form.returnPartyId || undefined,
      replacementOf: form.replacementOf || undefined,
      status: form.status,
      collectedDate:
        form.status === "وصول شده"
          ? editingCheck?.collectedDate || todayJalali()
          : editingCheck?.collectedDate,
      receivedDate: form.receivedDate,
      dueDate: form.dueDate,
      amount,
      feeAmount: Math.max(0, parseLocalizedNumber(form.feeAmount) || 0),
      paymentRuleId: form.paymentRuleId || undefined,
      targetInvoiceId: form.targetInvoiceId || undefined,
      replacementIds: editingCheck?.replacementIds || [],
      note: editingCheck?.note || "",
    };
    let accounts = state.accounts.map(account =>
      account.id === editingCheck?.bankAccountId &&
      editingCheck?.status === "وصول شده"
        ? { ...account, balance: account.balance - (editingCheck?.amount || 0) }
        : account
    );
    if (next.status === "وصول شده" && next.bankAccountId)
      accounts = accounts.map(account =>
        account.id === next.bankAccountId
          ? { ...account, balance: account.balance + amount }
          : account
      );
    let checks = editingCheck
      ? state.checks.map(item => (item.id === id ? next : item))
      : [next, ...state.checks];
    if (form.status === "جایگزین شده" && replacementLines.trim()) {
      const replacements = replacementLines
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const [number, rawAmount] = line.split(":");
          return {
            id: createId("replacement"),
            number: number.trim(),
            partyId: next.partyId,
            bank: next.bank,
            bankAccountId: next.bankAccountId,
            status: "نزد ما" as CheckStatus,
            receivedDate: next.receivedDate,
            dueDate: next.dueDate,
            amount: parseLocalizedNumber(rawAmount || "0") || 0,
            replacementOf: next.id,
            replacementIds: [],
            note: "",
          };
        });
      checks = [
        { ...next, replacementIds: replacements.map(item => item.id) },
        ...checks.filter(item => item.id !== next.id),
        ...replacements,
      ];
    }
    const transactions = state.transactions.filter(
      item => !item.note?.includes(`__check:${id}`)
    );
    if (next.status === "وصول شده" && next.bankAccountId)
      transactions.unshift({
        id: createId("check-receipt"),
        type: "دریافت",
        date: next.receivedDate,
        partyId: next.partyId,
        amount,
        status: "ثبت شده",
        note: `وصول چک ${next.number} __check:${id}`,
      });
    const nextState = rebuildCheckAllocations({
      ...state,
      checks,
      accounts,
      transactions,
      audit: [
        ...state.audit,
        {
          id: createId("check-edit"),
          at: new Date().toISOString(),
          action: editingCheck ? "CHECK_EDITED" : "CHECK_CREATED",
          note: `چک ${next.number} ${editingCheck ? "ویرایش شد" : "ثبت شد"}`,
        },
      ],
    });
    onSave(
      nextState,
      editingCheck ? "تمام اطلاعات چک ویرایش شد" : "چک دریافتی ثبت شد"
    );
    setOpen(false);
    setEditingCheck(null);
    setForm(blank);
    setReplacementLines("");
  }
  function targetLabel(status: CheckStatus) {
    if (["نزد ما", "وصول شده", "برگشتی"].includes(status))
      return status === "برگشتی" ? "حساب امانت" : "حساب مرجع";
    if (["عودت داده شده", "خرج شده"].includes(status))
      return status === "خرج شده"
        ? "شخص/تأمین‌کننده بابت هزینه"
        : "تحویل به شخص";
    return "مرجع";
  }
  return (
    <div className="page-stack page-enter checks-page">
      <PageIntro
        kicker="مدیریت تعهدات"
        title="چک‌ها"
        description="وضعیت، مرجع بانکی، شخص عودت‌گیرنده و چک‌های جایگزین را از همین دفتر مدیریت کنید."
        actionLabel="ثبت چک"
        onAction={() => {
          setEditingCheck(null);
          setForm({
            ...blank,
            number: nextCheckNumber,
            paymentRuleId:
              state.paymentRules.find(item => item.active)?.id || "",
          });
          setOpen(true);
        }}
      />
      <div className="check-cards">
        {["نزد ما", "وصول شده", "برگشتی"].map(label => (
          <div className="check-card" key={label}>
            <span className="mini-icon amber">
              <FileClock size={17} />
            </span>
            <span>{label}</span>
            <strong>
              {formatMoney(
                state.checks
                  .filter(check => check.status === label)
                  .reduce((sum, check) => sum + check.amount, 0),
                state.settings.currency
              )}
            </strong>
            <small>
              {formatNumber(
                state.checks.filter(check => check.status === label).length
              )}{" "}
              فقره
            </small>
          </div>
        ))}
        <div className="check-card">
          <span className="mini-icon green">
            <WalletCards size={17} />
          </span>
          <span>رویدادهای دفتر چک</span>
          <strong>{formatNumber(state.cashEvents.filter(event => event.sourceType === "check").length)}</strong>
          <small>وصول، برگشت و معکوس‌سازی</small>
        </div>
      </div>
      <div className="print-customer-summary print-roll-banner">
        <div className="print-roll-title">
          <span>کارگاه صنعتی — گزارش طوماری چک‌ها و وضعیت تسویه فاکتورها (افقی)</span>
          <strong>{checkPartyFilter === "همه" ? "کلیه چک‌ها و طرف‌حساب‌ها" : `طرف حساب: ${personName(state, checkPartyFilter)}`}</strong>
        </div>
        <div className="print-roll-meta">
          <span>تاریخ گزارش: {todayJalali()}</span>
          <span>تعداد چک‌ها: {formatNumber(visibleChecks.length)} فقره</span>
          <span>مجموع مبلغ چک‌ها: {formatMoney(visibleChecks.reduce((sum, c) => sum + c.amount, 0), state.settings.currency)}</span>
        </div>
      </div>
      <div className="toolbar check-filters">
        <label>
          فیلتر وضعیت
          <select
            value={statusFilter}
            onChange={e =>
              setStatusFilter(e.target.value as CheckStatus | "همه")
            }
          >
            <option value="همه">همه وضعیت‌ها</option>
            {statuses.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          مشتری برای گزارش چاپی
          <select
            value={checkPartyFilter}
            onChange={e => setCheckPartyFilter(e.target.value)}
          >
            <option value="همه">همه مشتری‌ها</option>
            {state.people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          فیلتر حساب مرجع
          <select
            value={bankFilter}
            onChange={e => setBankFilter(e.target.value)}
          >
            <option value="همه">همه حساب‌ها</option>
            {state.accounts
              .filter(account =>
                ["بانک", "صندوق", "شریک"].includes(account.type)
              )
              .map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          دریافت از
          <JalaliDatePicker
            value={receivedFrom}
            onChange={setReceivedFrom}
            placeholder="از تاریخ"
          />
        </label>
        <label>
          دریافت تا
          <JalaliDatePicker
            value={receivedTo}
            onChange={setReceivedTo}
            placeholder="تا تاریخ"
          />
        </label>
        <label>
          سررسید از
          <JalaliDatePicker
            value={dueFrom}
            onChange={setDueFrom}
            placeholder="از تاریخ"
          />
        </label>
        <label>
          سررسید تا
          <JalaliDatePicker
            value={dueTo}
            onChange={setDueTo}
            placeholder="تا تاریخ"
          />
        </label>
        <span className="soft-tag">
          نمایش {formatNumber(visibleChecks.length)} از{" "}
          {formatNumber(state.checks.length)} چک
        </span>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => setGroupAllocOpen(true)}
        >
          تخصیص گروهی چک به فاکتور
        </button>
        <button
          className="button button-ghost button-small"
          onClick={exportChecks}
        >
          خروجی CSV
        </button>
        <button
          className="button button-ghost button-small"
          onClick={() => {
            setPrintingChecks(true);
            setExpandedCheckIds(new Set(visibleChecks.map(check => check.id)));
            window.setTimeout(
              () => printWithTarget("checks", true, () => setPrintingChecks(false)),
              0
            );
          }}
        >
          چاپ طومار چک‌ها برای مشتری (افقی)
        </button>
        <button
          className="button button-primary button-small"
          onClick={recalculateAllocations}
        >
          محاسبه مجدد تخصیص‌ها
        </button>
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">دفتر چک</span>
            <h3>پیگیری و تغییر وضعیت چک‌ها</h3>
          </div>
          <div className="panel-heading-actions">
            <SortControl
              direction={checkSortDirection}
              onChange={setCheckSortDirection}
              ascLabel="قدیمی‌تر"
              descLabel="جدیدتر"
            />
            <span className="soft-tag">مرجع وابسته به وضعیت</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شماره چک</th>
                <th>طرف حساب</th>
                <th>تاریخ دریافت</th>
                <th>سررسید</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th className="print-private">مرجع وضعیت</th>
                <th className="print-private">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {(printingChecks ? visibleChecks : paginatedChecks).length ? (
                (printingChecks ? visibleChecks : paginatedChecks).map(check => {
                  const checkAllocations = allocationDetails.filter(
                    item => item.checkId === check.id
                  );
                  const expanded = expandedCheckIds.has(check.id);
                  return (
                    <Fragment key={check.id}>
                      <tr
                        key={check.id}
                        className={`check-row check-row-${check.status === "وصول شده" ? "cleared" : check.status === "خرج شده" ? "spent" : ["برگشتی", "عودت داده شده", "باطل"].includes(check.status) ? "bad" : check.status === "جایگزین شده" ? "replaced" : "open"}`}
                      >
                        <td>
                          <button
                            type="button"
                            className={`allocation-toggle ${expanded ? "is-expanded" : ""}`}
                            onClick={() =>
                              setExpandedCheckIds(current => {
                                const next = new Set(current);
                                if (next.has(check.id)) next.delete(check.id);
                                else next.add(check.id);
                                return next;
                              })
                            }
                            aria-expanded={expanded}
                            title="نمایش فاکتورهای تخصیص‌یافته"
                          >
                            <ChevronDown size={14} />
                            <strong>
                              {check.number} ·{" "}
                              {formatMoney(
                                check.amount,
                                state.settings.currency
                              )}
                            </strong>
                          </button>
                          {check.replacementOf && (
                            <small className="muted-cell">
                              جایگزین چک اصلی
                            </small>
                          )}
                          {check.targetInvoiceId && (
                            <small className="badge amber" style={{ display: "inline-block", marginTop: 2 }}>
                              هدف: فاکتور {state.invoices.find(inv => inv.id === check.targetInvoiceId)?.number || "اختصاصی"}
                            </small>
                          )}
                        </td>
                        <td>{personName(state, check.partyId)}</td>
                        <td>{formatDate(check.receivedDate)}</td>
                        <td>{formatDate(check.dueDate)}</td>
                        <td>
                          {formatMoney(check.amount, state.settings.currency)}
                        </td>
                        <td>
                          <select
                            value={check.status}
                            onChange={e => {
                              const status = e.target.value as CheckStatus;
                              if (status === "جایگزین شده") {
                                beginEdit(check);
                                setForm({
                                  number: check.number,
                                  partyId: check.partyId || "",
                                  bank: check.bank || "",
                                  bankAccountId: check.bankAccountId || "",
                                  returnPartyId: check.returnPartyId || "",
                                  status,
                                  replacementOf: check.replacementOf || "",
                                  receivedDate: check.receivedDate,
                                  dueDate: check.dueDate,
                                  amount: String(check.amount),
                                  feeAmount: String(check.feeAmount || ""),
                                  paymentRuleId: check.paymentRuleId || "",
                                  targetInvoiceId: check.targetInvoiceId || "",
                                  note: check.note || "",
                                });
                              } else
                                saveCheckStatus(
                                  check,
                                  status,
                                  check.bankAccountId ||
                                    check.returnPartyId ||
                                    ""
                                );
                            }}
                          >
                            <option value="نزد ما">نزد ما</option>
                            <option value="وصول شده">وصول شده</option>
                            <option value="برگشتی">برگشتی</option>
                            <option value="عودت داده شده">عودت</option>
                            <option value="جایگزین شده">جایگزین</option>
                            <option value="باطل">باطل</option>
                            <option value="خرج شده">خرج شده</option>
                          </select>
                        </td>
                        <td className="print-private">
                          {["نزد ما", "وصول شده", "برگشتی"].includes(
                            check.status
                          ) ? (
                            <select
                              value={check.bankAccountId || ""}
                              onChange={e =>
                                saveCheckStatus(
                                  check,
                                  check.status,
                                  e.target.value
                                )
                              }
                            >
                              <option value="">
                                {check.bankAccountId
                                  ? "تغییر حساب مرجع"
                                  : "انتخاب حساب مرجع *"}
                              </option>
                              {state.accounts
                                .filter(account =>
                                  ["بانک", "صندوق", "شریک"].includes(
                                    account.type
                                  )
                                )
                                .map(account => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                            </select>
                          ) : ["عودت داده شده", "خرج شده"].includes(
                              check.status
                            ) ? (
                            <select
                              value={check.returnPartyId || ""}
                              onChange={e =>
                                saveCheckStatus(
                                  check,
                                  check.status,
                                  e.target.value
                                )
                              }
                            >
                              <option value="">انتخاب شخص</option>
                              {state.people.map(person => (
                                <option key={person.id} value={person.id}>
                                  {person.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="muted-cell">
                              {check.status === "جایگزین شده" ? (
                                <>
                                  <span>
                                    {check.replacementIds?.length || 0} جایگزین
                                  </span>
                                  <button
                                    type="button"
                                    className="button button-ghost button-small"
                                    onClick={() => {
                                      setReplacementParent(check);
                                      setEditingCheck(null);
                                      setForm({
                                        ...blank,
                                        partyId: check.partyId || "",
                                        receivedDate: todayJalali(),
                                        dueDate: check.dueDate,
                                        paymentRuleId:
                                          check.paymentRuleId || "",
                                      });
                                      setOpen(true);
                                    }}
                                  >
                                    افزودن چک
                                  </button>
                                </>
                              ) : (
                                "—"
                              )}
                            </span>
                          )}
                        </td>
                        <td className="print-private">
                          <button
                            className="icon-button row-action"
                            title="تاریخچه چک"
                            onClick={() => setHistoryCheckId(check.id)}
                          >
                            <FileClock size={14} />
                          </button>
                          <button
                            className="icon-button row-action"
                            title="ویرایش کامل چک"
                            onClick={() => beginEdit(check)}
                          >
                            <Pencil size={14} />
                          </button>
                          {!check.replacementIds?.length && (
                            <button
                              className="icon-button row-action"
                              title="حذف چک"
                              onClick={() => {
                                if (!window.confirm("چک و ارجاعات آن حذف شود؟"))
                                  return;
                                onSave(
                                  rebuildCheckAllocations({
                                    ...state,
                                    checks: state.checks
                                      .filter(item => item.id !== check.id)
                                      .map(item => ({
                                        ...item,
                                        replacementIds:
                                          item.replacementIds?.filter(
                                            id => id !== check.id
                                          ),
                                      })),
                                    transactions: state.transactions.filter(
                                      item =>
                                        !item.note?.includes(
                                          `__check:${check.id}`
                                        )
                                    ),
                                  }),
                                  "چک حذف شد"
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="allocation-detail-row">
                          <td colSpan={8}>
                            <div className="check-accordion-box">
                              {(() => {
                                const person = state.people.find(p => p.id === check.partyId);
                                const checkGroup = state.checkGroupAllocations?.find(g => g.checkIds.includes(check.id));
                                return (
                                  <div className="invoice-customer-info-strip">
                                    <div>
                                      <strong>طرف حساب / صادرکننده:</strong> {person?.name || "نامشخص"} {person?.code ? `(کد: ${person.code})` : ""}
                                    </div>
                                    {person?.phone && (
                                      <div><strong>شماره تماس:</strong> {person.phone}</div>
                                    )}
                                    {check.bank && (
                                      <div><strong>بانک:</strong> {check.bank}</div>
                                    )}
                                    {checkGroup && (
                                      <div><span className="soft-tag">تخصیص گروهی: {checkGroup.name}</span></div>
                                    )}
                                    <div>
                                      <strong>مبلغ چک:</strong> {formatMoney(check.amount, state.settings.currency)}
                                    </div>
                                    <div>
                                      <strong>سررسید:</strong> {formatDate(check.dueDate)}
                                    </div>
                                    <div>
                                      <strong>وضعیت:</strong> {check.status}
                                    </div>
                                  </div>
                                );
                              })()}

                              {checkAllocations.length ? (
                                <div className="roll-subtable-wrap">
                                  <table className="roll-subtable">
                                    <thead>
                                      <tr>
                                        <th style={{ width: "16%" }}>شماره و تاریخ فاکتور</th>
                                        <th style={{ width: "14%" }}>مبلغ فاکتور</th>
                                        <th style={{ width: "10%" }}>روزهای دیرکرد</th>
                                        <th style={{ width: "15%" }}>نرخ و هزینه دیرکرد</th>
                                        <th style={{ width: "17%" }}>مبلغ تسویه از این چک</th>
                                        <th style={{ width: "14%" }}>مانده فاکتور پس از تخصیص</th>
                                        <th style={{ width: "14%" }}>مانده چک جهت انتقال</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {checkAllocations.map(item => {
                                        const invoice = state.invoices.find(
                                          row => row.id === item.invoiceId
                                        );
                                        const allocationBalance =
                                          allocationBalances.get(
                                            `${item.checkId}:${item.invoiceId}`
                                          );
                                        const rule =
                                          state.paymentRules.find(
                                            r => r.id === invoice?.paymentRuleId
                                          ) || state.paymentRules.find(r => r.active);
                                        const probe = invoice
                                          ? calculateLateProfit(
                                              check,
                                              rule,
                                              invoice.date,
                                              invoice.amount,
                                              state.settings.dayBasis
                                            )
                                          : null;
                                        return (
                                          <tr key={`${item.checkId}-${item.invoiceId}`}>
                                            <td>
                                              <strong>فاکتور {invoice?.number || "—"}</strong>
                                              <small style={{ display: "block", color: "#555" }}>
                                                تاریخ صدور: {formatDate(invoice?.date || "")}
                                              </small>
                                            </td>
                                            <td>{invoice ? formatMoney(invoice.amount, state.settings.currency) : "—"}</td>
                                            <td>{formatNumber(item.days || 0)} روز</td>
                                            <td>
                                              {item.profit > 0 ? (
                                                <span>
                                                  {formatMoney(item.profit, state.settings.currency)}
                                                  <small style={{ display: "block", color: "#555" }}>
                                                    ({formatNumber((probe?.rate || 0) * 100)}٪)
                                                  </small>
                                                </span>
                                              ) : (
                                                <span className="muted-cell">بدون دیرکرد (۰٪)</span>
                                              )}
                                            </td>
                                            <td>
                                              <strong>{formatMoney(item.amount, state.settings.currency)}</strong>
                                              <small style={{ display: "block", color: "#555" }}>
                                                اصل فاکتور: {formatMoney(item.principalAmount, state.settings.currency)}
                                              </small>
                                            </td>
                                            <td>
                                              <strong>
                                                {formatMoney(
                                                  allocationBalance?.remainingInvoice ?? 0,
                                                  state.settings.currency
                                                )}
                                              </strong>
                                            </td>
                                            <td>
                                              <strong>
                                                {formatMoney(
                                                  allocationBalance?.remainingCheck ?? 0,
                                                  state.settings.currency
                                                )}
                                              </strong>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <span className="muted-cell" style={{ display: "block", marginTop: 4 }}>
                                  هیچ فاکتوری به این چک تخصیص نیافته است.
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title="چکی ثبت نشده"
                      description="چک دریافتی را ثبت کنید تا در بستن ماه قابل محاسبه باشد."
                      onAction={() => setOpen(true)}
                      actionLabel="ثبت چک"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safeCheckPage}
          pageCount={checkPageCount}
          onChange={setCheckPage}
        />
      </div>
      {open && (
        <Dialog
          title={
            replacementParent
              ? "ثبت چک جایگزین جدید"
              : editingCheck
                ? "ویرایش کامل چک"
                : "ثبت چک دریافتی"
          }
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="form-grid">
            <label>
              شماره چک
              <input
                autoFocus
                value={form.number}
                inputMode="text"
                placeholder={`پیشنهاد: ${nextCheckNumber}`}
                onChange={e => setForm({ ...form, number: e.target.value })}
              />
            </label>
            <label>
              طرف حساب
              <select
                value={form.partyId}
                onChange={e => {
                  const selected = state.people.find(
                    item => item.id === e.target.value
                  );
                  setForm({
                    ...form,
                    number: editingCheck
                      ? form.number
                      : suggestNextPartyNumber(
                          state.checks,
                          e.target.value,
                          selected?.code,
                          state.checks.map(item => item.number)
                        ),
                    partyId: e.target.value,
                  });
                }}
              >
                <option value="">بدون طرف حساب</option>
                {state.people.map(person => (
                  <option value={person.id} key={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              تاریخ دریافت چک
              <JalaliDatePicker
                value={form.receivedDate}
                onChange={receivedDate => setForm({ ...form, receivedDate })}
              />
            </label>
            <label>
              تاریخ سررسید
              <JalaliDatePicker
                value={form.dueDate}
                onChange={dueDate => setForm({ ...form, dueDate })}
              />
            </label>
            <label>
              مبلغ چک
              <input
                inputMode="numeric"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value, feeAmount: String(calculateBankTransferFee(state.settings.bankFeeRules, form.bankAccountId, parseLocalizedNumber(e.target.value)).fee || "") })}
              />
            </label>
            <label>
              کارمزد وصول بانکی
              <input inputMode="numeric" value={form.feeAmount} onChange={e => setForm({ ...form, feeAmount: e.target.value })} placeholder="در صورت کسر بانک" />
            </label>
            <label>
              وضعیت چک
              <select
                value={form.status}
                onChange={e =>
                  setForm({ ...form, status: e.target.value as CheckStatus })
                }
              >
                {statuses.map(status => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {targetLabel(form.status)}
              {["نزد ما", "وصول شده", "برگشتی"].includes(form.status) ? (
                <select
                  value={form.bankAccountId}
                  onChange={e =>
                    setForm({
                      ...form,
                      bankAccountId: e.target.value,
                      feeAmount: String(calculateBankTransferFee(state.settings.bankFeeRules, e.target.value, parseLocalizedNumber(form.amount)).fee || ""),
                      bank:
                        state.accounts.find(
                          account => account.id === e.target.value
                        )?.name || "",
                    })
                  }
                >
                  <option value="">انتخاب حساب مرجع *</option>
                  {state.accounts.filter(account =>
                    ["بانک", "صندوق", "شریک"].includes(account.type)
                  ).length ? (
                    state.accounts
                      .filter(account =>
                        ["بانک", "صندوق", "شریک"].includes(account.type)
                      )
                      .map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>
                      ابتدا در صفحه بانک‌ها و صندوق‌ها حساب بسازید
                    </option>
                  )}
                </select>
              ) : (
                <select
                  value={form.returnPartyId}
                  onChange={e =>
                    setForm({ ...form, returnPartyId: e.target.value })
                  }
                >
                  <option value="">انتخاب شخص</option>
                  {state.people.map(person => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              شرایط پرداخت
              <select
                value={form.paymentRuleId}
                onChange={e =>
                  setForm({ ...form, paymentRuleId: e.target.value })
                }
              >
                <option value="">بدون تغییر</option>
                {state.paymentRules.map(rule => (
                  <option value={rule.id} key={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>
            {form.partyId && (
              <label className="full-field">
                تخصیص اختصاصی به فاکتور (درخواست مشتری - اختیاری)
                <select
                  value={form.targetInvoiceId}
                  onChange={e =>
                    setForm({ ...form, targetInvoiceId: e.target.value })
                  }
                >
                  <option value="">تسویه ترتیبی خودکار (FIFO پیش‌فرض)</option>
                  {state.invoices
                    .filter(
                      inv =>
                        inv.partyId === form.partyId &&
                        inv.type === "فروش" &&
                        inv.status !== "باطل"
                    )
                    .sort(
                      (a, b) =>
                        jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date)) ||
                        a.number.localeCompare(b.number)
                    )
                    .map(inv => {
                      const remaining = Math.max(0, inv.amount - (inv.paidAmount || 0));
                      return (
                        <option key={inv.id} value={inv.id}>
                          فاکتور {inv.number} (مورخ {inv.date}) — مانده: {formatMoney(remaining, state.settings.currency)} {inv.status === "تسویه شده" ? "[تسویه‌شده]" : ""}
                        </option>
                      );
                    })}
                </select>
                <small className="muted-cell" style={{ display: "block", marginTop: 4 }}>
                  در صورت تمایل مشتری برای تسویه یک فاکتور خاص، آن را انتخاب کنید. فاکتورهای قبلی با چک‌های بعدی تسویه خواهند شد.
                </small>
              </label>
            )}
            {form.status === "خرج شده" && (
              <label className="full-field">
                توضیحات خرج شدن
                <input
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="مثلاً بابت خرید مواد اولیه از تأمین‌کننده"
                />
              </label>
            )}
            {form.status === "جایگزین شده" && (
              <label className="full-field">
                چک‌های جایگزین (هر خط: شماره:مبلغ)
                <textarea
                  value={replacementLines}
                  onChange={e => setReplacementLines(e.target.value)}
                  placeholder="مثلاً ۹۸۷۶:۵۰۰۰۰۰۰"
                />
              </label>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setOpen(false)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={17} />
                {editingCheck ? "ذخیره ویرایش چک" : "ثبت چک"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {historyCheckId && (
        <Dialog
          title={`تاریخچه چک ${state.checks.find(item => item.id === historyCheckId)?.number || ""}`}
          onClose={() => setHistoryCheckId(null)}
        >
          <div className="audit-history">
            {state.audit
              .filter(event => {
                const check = state.checks.find(
                  item => item.id === historyCheckId
                );
                return check
                  ? event.note.includes(`چک ${check.number}`)
                  : false;
              })
              .slice()
              .reverse()
              .map(event => (
                <div className="audit-history-row" key={event.id}>
                  <span>{new Date(event.at).toLocaleString("fa-IR")}</span>
                  <strong>{event.action}</strong>
                  <p>{event.note}</p>
                </div>
              ))}
            {!state.audit.some(event => {
              const check = state.checks.find(
                item => item.id === historyCheckId
              );
              return check ? event.note.includes(`چک ${check.number}`) : false;
            }) && <p>تاریخی برای این چک ثبت نشده است.</p>}
          </div>
        </Dialog>
      )}
      {groupAllocOpen && (
        <GroupAllocationDialog
          open={groupAllocOpen}
          onClose={() => setGroupAllocOpen(false)}
          state={state}
          onSave={onSave}
          defaultPartyId={checkPartyFilter !== "همه" ? checkPartyFilter : ""}
        />
      )}
    </div>
  );
}
function MonthClose({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (state: AppState, message: string) => void;
}) {
  const [partyId, setPartyId] = useState("");
  const [closed, setClosed] = useState(false);
  const partyInvoices = state.invoices
    .filter(
      invoice =>
        invoice.type === "فروش" &&
        invoice.status !== "باطل" &&
        (!partyId || invoice.partyId === partyId)
    )
    .sort(
      (a, b) =>
        jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date)) ||
        a.id.localeCompare(b.id)
    );
  const partyChecks = state.checks
    .filter(
      check =>
        check.status !== "باطل" &&
        check.status !== "جایگزین شده" &&
        (!partyId || check.partyId === partyId)
    )
    .sort(
      (a, b) =>
        jalaliDateKey(a.dueDate).localeCompare(jalaliDateKey(b.dueDate)) ||
        a.id.localeCompare(b.id)
    );
  const fifoSettlements = settleChecksFIFO(
    partyChecks,
    partyInvoices,
    state.paymentRules,
    state.settings.dayBasis
  );
  const allValidSalesTotal = state.invoices
    .filter(invoice => invoice.type === "فروش" && invoice.status !== "باطل")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const selectedValidSalesTotal = partyInvoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0
  );
  const excludedSalesTotal = Math.max(
    0,
    allValidSalesTotal - selectedValidSalesTotal
  );
  const settlement = new Map<
    string,
    {
      base: number;
      value: number;
      remainingBase: number;
      collected: number;
      profit: number;
    }
  >();
  const details: Array<{
    month: string;
    number: string;
    date: string;
    base: number;
    value: number;
    remainingBase: number;
    collected: number;
    profit: number;
  }> = [];
  partyInvoices.forEach(invoice => {
    const invoiceSettlements = fifoSettlements.filter(
      item => item.invoiceId === invoice.id
    );
    const collected = invoiceSettlements.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const profit = invoiceSettlements.reduce(
      (sum, item) => sum + item.profit,
      0
    );
    const principalCollected = invoiceSettlements.reduce(
      (sum, item) => sum + item.principalAmount,
      0
    );
    const baseRemaining = Math.max(0, invoice.amount - principalCollected);
    const todayCheck = {
      id: "today",
      number: "",
      partyId: invoice.partyId,
      dueDate: todayJalali(),
      receivedDate: invoice.date,
      amount: 0,
      status: "نزد ما" as const,
      bank: "",
    };
    const today = calculateLateProfit(
      todayCheck,
      state.paymentRules.find(item => item.id === invoice.paymentRuleId) ||
        state.paymentRules.find(item => item.active),
      invoice.date,
      baseRemaining,
      state.settings.dayBasis
    );
    const key = invoice.date.slice(0, 7);
    const previous = settlement.get(key) || {
      base: 0,
      value: 0,
      remainingBase: 0,
      collected: 0,
      profit: 0,
    };
    settlement.set(key, {
      base: previous.base + invoice.amount,
      value: previous.value + today.remainingBase + today.profit,
      remainingBase: previous.remainingBase + today.remainingBase,
      collected: previous.collected + collected,
      profit: previous.profit + profit + today.profit,
    });
    details.push({
      month: key,
      number: invoice.number,
      date: invoice.date,
      base: invoice.amount,
      value: today.remainingBase + today.profit,
      remainingBase: today.remainingBase,
      collected,
      profit: profit + today.profit,
    });
  });
  const months = Array.from({ length: 8 }, (_, index) => {
    const key =
      Object.keys(Object.fromEntries(settlement)).sort().reverse()[index] || "";
    return key
      ? {
          month: key,
          ...(settlement.get(key) as NonNullable<
            ReturnType<typeof settlement.get>
          >),
        }
      : null;
  }).filter(Boolean) as Array<{
    month: string;
    base: number;
    value: number;
    remainingBase: number;
    collected: number;
    profit: number;
  }>;
  const totalBase = months.reduce((sum, row) => sum + row.base, 0);
  const totalValue = months.reduce((sum, row) => sum + row.value, 0);
  const totalRemainingBase = months.reduce(
    (sum, row) => sum + row.remainingBase,
    0
  );
  const totalCollected = months.reduce((sum, row) => sum + row.collected, 0);
  function downloadDetails() {
    const header =
      "ماه,شماره فاکتور,تاریخ,مجموع فروش پایه,ارزش امروز,باقیمانده اصل امروز,مبلغ چک تخصیص‌یافته,هزینه دیرکرد";
    const csv = [
      header,
      ...details.map(row =>
        [
          row.month,
          row.number,
          row.date,
          row.base,
          row.value,
          row.remainingBase,
          row.collected,
          row.profit,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `month-close-${partyId || "all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page-stack page-enter month-close-page">
      <PageIntro
        kicker="کنترل پایان دوره"
        title="بستن ماه"
        description="مشتری را انتخاب کنید؛ هشت ماه اخیر بدون وابستگی به یک فاکتور یا چک، با تخصیص FIFO و هزینهٔ روزشمار محاسبه می‌شود."
        actionLabel={closed ? "ثبت شده" : "ثبت بستن ماه"}
        onAction={() => {
          if (closed || !partyId) return;
          onSave(
            {
              ...state,
              audit: [
                ...state.audit,
                {
                  id: createId("month-close"),
                  at: new Date().toISOString(),
                  action: "MONTH_CLOSE",
                  note: `بستن ماه مشتری ${personName(state, partyId)}؛ اصل ${totalBase}، ارزش امروز ${totalValue}`,
                },
              ],
            },
            `بستن ماه ${personName(state, partyId)} ثبت شد`
          );
          setClosed(true);
        }}
      />
      <div className="month-close-actions">
        <button className="button button-ghost" onClick={() => printWithTarget("month-close")}>
          چاپ گزارش / ذخیره PDF
        </button>
        <button className="button button-ghost" onClick={downloadDetails}>
          خروجی جزئیات CSV
        </button>
      </div>
      <div className="close-controls panel">
        <div>
          <span className="section-kicker">طرف حساب</span>
          <strong>مشتری مورد بررسی</strong>
        </div>
        <select
          value={partyId}
          onChange={e => {
            setPartyId(e.target.value);
            setClosed(false);
          }}
        >
          <option value="">انتخاب مشتری</option>
          {state.people
            .filter(
              person =>
                person.roles?.includes("مشتری") || person.type === "مشتری"
            )
            .map(person => (
              <option key={person.id} value={person.id}>
                {person.code} · {person.name}
              </option>
            ))}
        </select>
        <span className="close-hint">
          نرخ دیرکرد از شرایط پرداخت فاکتور خوانده می‌شود؛ چک‌های بزرگ‌تر به
          فاکتورهای قدیمی‌تر شکسته می‌شوند.
        </span>
      </div>
      <div className="scope-audit panel">
        <strong>کنترل دامنهٔ محاسبه</strong>
        <span>
          کل فروش معتبر:{" "}
          {formatMoney(allValidSalesTotal, state.settings.currency)}
        </span>
        <span>
          فروش مشتری انتخاب‌شده:{" "}
          {formatMoney(selectedValidSalesTotal, state.settings.currency)}
        </span>
        <span className={excludedSalesTotal ? "amount-negative" : "muted-cell"}>
          خارج از این گزارش:{" "}
          {formatMoney(excludedSalesTotal, state.settings.currency)}
        </span>
      </div>
      <section className="metric-grid">
        <MetricCard
          label="مجموع فروش پایه"
          value={formatMoney(totalBase, state.settings.currency)}
          helper="اصل فاکتورهای مشتری"
          icon={<FileText size={20} />}
          tone="indigo"
        />
        <MetricCard
          label="ارزش باقیمانده امروز"
          value={formatMoney(totalValue, state.settings.currency)}
          helper="اصل با هزینهٔ روزشمار"
          icon={<Percent size={20} />}
          tone="violet"
        />
        <MetricCard
          label="باقیمانده اصل امروز"
          value={formatMoney(totalRemainingBase, state.settings.currency)}
          helper="پس از کسر چک‌ها"
          icon={<WalletCards size={20} />}
          tone="amber"
        />
        <MetricCard
          label="درصد وصول"
          value={`${formatNumber(totalBase ? ((totalBase - totalRemainingBase) / totalBase) * 100 : 0)}٪`}
          helper={`${formatMoney(totalCollected, state.settings.currency)} چک تخصیص‌یافته`}
          icon={<Check size={20} />}
          tone="mint"
        />
      </section>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">گزارش هشت ماه</span>
            <h3>
              {partyId
                ? personName(state, partyId)
                : "ابتدا مشتری را انتخاب کنید"}
            </h3>
          </div>
          <span
            className={`status-pill ${closed ? "status-success" : "status-warning"}`}
          >
            {closed ? "ثبت شده" : "پیش‌نویس"}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ماه</th>
                <th>مجموع فروش (پایه)</th>
                <th>ارزش امروز</th>
                <th>باقیمانده اصل امروز</th>
                <th>هزینهٔ دیرکرد</th>
                <th>درصد وصول</th>
              </tr>
            </thead>
            <tbody>
              {months.length ? (
                months.map(row => (
                  <tr key={row.month}>
                    <td>
                      <strong>{row.month}</strong>
                    </td>
                    <td>{formatMoney(row.base, state.settings.currency)}</td>
                    <td>{formatMoney(row.value, state.settings.currency)}</td>
                    <td>
                      {formatMoney(row.remainingBase, state.settings.currency)}
                    </td>
                    <td>{formatMoney(row.profit, state.settings.currency)}</td>
                    <td>
                      <span className="status-pill status-success">
                        {formatNumber(
                          row.base
                            ? ((row.base - row.remainingBase) / row.base) * 100
                            : 0
                        )}
                        ٪
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="داده‌ای برای این مشتری وجود ندارد"
                      description="فاکتور و چک مشتری را ثبت کنید تا گزارش هشت‌ماهه ساخته شود."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel table-panel month-invoice-details">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">جزئیات محاسبات</span>
            <h3>محاسبه هر فاکتور</h3>
          </div>
          <span className="soft-tag">FIFO و هزینهٔ روزشمار</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ماه</th>
                <th>شماره فاکتور</th>
                <th>تاریخ</th>
                <th>پایه</th>
                <th>ارزش امروز</th>
                <th>اصل باقیمانده</th>
                <th>چک تخصیص‌یافته</th>
                <th>هزینهٔ دیرکرد</th>
              </tr>
            </thead>
            <tbody>
              {details.length ? (
                details
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(row => (
                    <tr key={`${row.number}-${row.date}`}>
                      <td>{row.month}</td>
                      <td>
                        <strong>{row.number}</strong>
                      </td>
                      <td>{formatDate(row.date)}</td>
                      <td>{formatMoney(row.base, state.settings.currency)}</td>
                      <td>{formatMoney(row.value, state.settings.currency)}</td>
                      <td>
                        {formatMoney(
                          row.remainingBase,
                          state.settings.currency
                        )}
                      </td>
                      <td>
                        {formatMoney(row.collected, state.settings.currency)}
                      </td>
                      <td>
                        {formatMoney(row.profit, state.settings.currency)}
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    پس از انتخاب مشتری، جزئیات فاکتورها نمایش داده می‌شود.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function Reports({
  state,
  metrics,
}: {
  state: AppState;
  metrics: ReturnType<typeof calculateMetrics>;
}) {
  const cashRows = useMemo(
    () =>
      state.transactions
        .filter(item => item.status !== "باطل")
        .map(item => {
          const incoming = ["دریافت", "درآمد", "فروش کالا"].includes(item.type);
          const account = state.accounts.find(
            value => value.id === (item.accountId || item.toAccountId)
          );
          return {
            ...item,
            incoming,
            accountName: account?.name || "بدون حساب",
            partyName: personName(state, item.partyId),
          };
        })
        .sort((a, b) =>
          jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date))
        ),
    [state]
  );
  const directStockOperations = state.transactions.filter(
    item =>
      item.status !== "باطل" &&
      (item.type === "خرید کالا" || item.type === "فروش کالا")
  );
  const possibleDuplicates = directStockOperations.filter(operation =>
    state.invoices.some(invoice => {
      if (
        invoice.status === "باطل" ||
        invoice.type !== (operation.type === "خرید کالا" ? "خرید" : "فروش")
      )
        return false;
      const sameParty =
        !operation.partyId || invoice.partyId === operation.partyId;
      const sameDate = invoice.date === operation.date;
      const sameProduct =
        operation.productId &&
        invoice.items.some(item => item.productId === operation.productId);
      return (
        sameParty &&
        sameDate &&
        sameProduct &&
        Math.abs(invoice.amount - operation.amount) < 0.01
      );
    })
  );
  const [ledgerMode, setLedgerMode] = useState<"account" | "party">("account");
  const [ledgerAccountId, setLedgerAccountId] = useState("");
  const [ledgerPartyId, setLedgerPartyId] = useState("");
  const ledgerRows = useMemo(() => {
    if (ledgerMode === "account" && !ledgerAccountId) return [];
    if (ledgerMode === "party" && !ledgerPartyId) return [];
    const rows: Array<{
      id: string;
      date: string;
      title: string;
      increase: number;
      decrease: number;
      note: string;
    }> = [];
    state.transactions.forEach(item => {
      if (item.status === "باطل") return;
      if (ledgerMode === "party" && item.partyId !== ledgerPartyId) return;
      if (
        ledgerMode === "account" &&
        item.accountId !== ledgerAccountId &&
        item.fromAccountId !== ledgerAccountId &&
        item.toAccountId !== ledgerAccountId
      )
        return;
      const increase =
        ledgerMode === "account"
          ? item.toAccountId === ledgerAccountId ||
            ["دریافت", "درآمد", "فروش کالا"].includes(item.type)
          : item.partnerEffect === "افزایش طلب شریک" ||
            item.partnerEffect === "کاهش طلب کارگاه از شریک" ||
            item.type === "خرید" ||
            item.type === "هزینه/خرید توسط شریک";
      rows.push({
        id: item.id,
        date: item.date,
        title: transactionLabel(item.type) || item.type,
        increase: increase ? item.amount : 0,
        decrease: increase ? 0 : item.amount,
        note: [
          item.settlementDirection,
          item.referenceLabel
            ? `مرجع ${item.referenceType}: ${item.referenceLabel}`
            : "",
          item.note || "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });
    if (ledgerMode === "account") {
      state.checks.forEach(check => {
        if (
          check.status === "وصول شده" &&
          check.bankAccountId === ledgerAccountId
        )
          rows.push({
            id: `check-${check.id}`,
            date: check.dueDate,
            title: `وصول چک ${check.number}`,
            increase: check.amount,
            decrease: 0,
            note: personName(state, check.partyId),
          });
      });
    } else {
      state.invoices.forEach(invoice => {
        if (invoice.status === "باطل" || invoice.partyId !== ledgerPartyId)
          return;
        rows.push({
          id: `invoice-${invoice.id}`,
          date: invoice.date,
          title: `فاکتور ${invoice.type} ${invoice.number}`,
          increase: invoice.type === "فروش" ? invoice.amount : 0,
          decrease: invoice.type === "خرید" ? invoice.amount : 0,
          note: invoice.note || "",
        });
      });
      state.checks.forEach(check => {
        if (check.partyId !== ledgerPartyId || check.status === "باطل") return;
        rows.push({
          id: `check-party-${check.id}`,
          date: check.receivedDate,
          title: `چک دریافتی ${check.number}`,
          increase: 0,
          decrease: check.amount,
          note: check.status,
        });
      });
    }
    return rows.sort((a, b) =>
      jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date))
    );
  }, [ledgerAccountId, ledgerMode, ledgerPartyId, state]);
  const ledgerBalance = ledgerRows.reduce(
    (sum, row) => sum + row.increase - row.decrease,
    0
  );
  const profitReport = useMemo(() => {
    const validInvoices = state.invoices.filter(
      invoice => invoice.status !== "باطل"
    );
    const sales = validInvoices
      .filter(invoice => invoice.type === "فروش")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const purchases = validInvoices
      .filter(invoice => invoice.type === "خرید")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const estimatedCost = validInvoices
      .filter(invoice => invoice.type === "فروش")
      .reduce(
        (sum, invoice) =>
          sum +
          invoice.items.reduce((lineSum, item) => {
            const product = state.products.find(
              value => value.id === item.productId
            );
            return (
              lineSum +
              (item.quantityBase || item.quantity) *
                (product?.price || item.unitPrice)
            );
          }, 0),
        0
      );
    const receivables = state.people
      .map(person => {
        const invoices = validInvoices.filter(
          invoice => invoice.partyId === person.id
        );
        const salesBase = invoices
          .filter(invoice => invoice.type === "فروش")
          .reduce((sum, invoice) => sum + invoice.amount, 0);
        const purchasesBase = invoices
          .filter(invoice => invoice.type === "خرید")
          .reduce((sum, invoice) => sum + invoice.amount, 0);
        const collected = invoices.reduce(
          (sum, invoice) => sum + (invoice.paidAmount || 0),
          0
        );
        return {
          person,
          salesBase,
          purchasesBase,
          collected,
          balance: salesBase - purchasesBase - collected,
        };
      })
      .filter(row => row.salesBase || row.purchasesBase || row.collected)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    return {
      sales,
      purchases,
      estimatedCost,
      grossProfit: sales - estimatedCost,
      inventoryValue: state.products.reduce(
        (sum, product) => sum + product.stock * product.price,
        0
      ),
      receivables,
    };
  }, [state]);
  const collectionProfitRows = useMemo(
    () => buildCollectionProfitReport(state),
    [state]
  );
  const collectionProfitSummary = useMemo(() => {
    const aggregate = (key: "month" | "year") => {
      const map = new Map<string, {
        key: string;
        collectedAmount: number;
        lateCost: number;
        apparentProfit: number;
        effectiveProfit: number;
        apparentCost: number;
        currentCost: number;
        count: number;
      }>();
      collectionProfitRows.forEach(row => {
        const group = row[key];
        const previous = map.get(group) || {
          key: group, collectedAmount: 0, lateCost: 0, apparentProfit: 0,
          effectiveProfit: 0, apparentCost: 0, currentCost: 0, count: 0,
        };
        previous.collectedAmount += row.collectedAmount;
        previous.lateCost += row.lateCost;
        previous.apparentProfit += row.apparentProfit;
        previous.effectiveProfit += row.effectiveProfit;
        previous.apparentCost += row.apparentCost;
        previous.currentCost += row.currentCost;
        previous.count += 1;
        map.set(group, previous);
      });
      return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    };
    return { months: aggregate("month"), years: aggregate("year") };
  }, [collectionProfitRows]);
  const agingReport = useMemo(() => {
    const buckets = [
      { key: "0-30", label: "۰ تا ۳۰ روز" },
      { key: "31-60", label: "۳۱ تا ۶۰ روز" },
      { key: "61-90", label: "۶۱ تا ۹۰ روز" },
      { key: "90+", label: "بیش از ۹۰ روز" },
    ];
    const summary = buckets.map(bucket => ({
      ...bucket,
      receivable: 0,
      payable: 0,
      count: 0,
    }));
    state.invoices
      .filter(invoice => invoice.status !== "باطل")
      .forEach(invoice => {
        const outstanding = Math.max(
          0,
          invoice.amount - (invoice.paidAmount || 0)
        );
        if (!outstanding) return;
        const age = jalaliDayDifference(invoice.date, todayJalali());
        const index = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
        summary[index].count += 1;
        if (invoice.type === "فروش") summary[index].receivable += outstanding;
        else summary[index].payable += outstanding;
      });
    return summary;
  }, [state]);
  const [statementPartyId, setStatementPartyId] = useState("");
  const statementRows = useMemo(() => {
    if (!statementPartyId) return [];
    const raw: Array<{
      id: string;
      date: string;
      reference: string;
      debit: number;
      credit: number;
      note: string;
    }> = [];
    state.invoices
      .filter(
        invoice =>
          invoice.partyId === statementPartyId && invoice.status !== "باطل"
      )
      .forEach(invoice =>
        raw.push({
          id: `statement-invoice-${invoice.id}`,
          date: invoice.date,
          reference: `فاکتور ${invoice.type} ${invoice.number}`,
          debit: invoice.type === "فروش" ? invoice.amount : 0,
          credit: invoice.type === "خرید" ? invoice.amount : 0,
          note: invoice.note || "",
        })
      );
    state.checks
      .filter(
        check => check.partyId === statementPartyId && check.status !== "باطل"
      )
      .forEach(check =>
        raw.push({
          id: `statement-check-${check.id}`,
          date: check.receivedDate || check.dueDate,
          reference: `چک دریافتی ${check.number}`,
          debit: ["برگشتی", "عودت داده شده"].includes(check.status)
            ? check.amount
            : 0,
          credit: ["برگشتی", "عودت داده شده"].includes(check.status)
            ? 0
            : check.amount,
          note: check.status,
        })
      );
    return raw
      .sort((a, b) =>
        jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date))
      )
      .map((row, index, all) => ({
        ...row,
        balance: all
          .slice(0, index + 1)
          .reduce((sum, item) => sum + item.debit - item.credit, 0),
      }));
  }, [statementPartyId, state]);
  function downloadStatement() {
    if (!statementPartyId || !statementRows.length) return;
    const person = state.people.find(item => item.id === statementPartyId);
    const csv = [
      "تاریخ,مرجع,بدهکار,بستانکار,مانده,شرح",
      ...statementRows.map(row =>
        [
          row.date,
          row.reference,
          row.debit,
          row.credit,
          row.balance,
          row.note,
        ].join(",")
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `statement-${person?.code || statementPartyId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const supplierReport = useMemo(() => {
    return state.people
      .filter(person => person.roles?.includes("تأمین‌کننده") || person.type === "تأمین‌کننده")
      .map(supplier => {
        const invoices = state.invoices.filter(
          invoice => invoice.type === "خرید" && invoice.status !== "باطل" && invoice.partyId === supplier.id
        );
        const payments = state.purchasePayments.filter(payment => payment.supplierId === supplier.id);
        const invoiceTotal = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
        const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
        return {
          supplier,
          invoiceTotal,
          paymentTotal,
          payable: Math.max(0, invoiceTotal - paymentTotal),
          credit: Math.max(0, paymentTotal - invoiceTotal),
          invoiceCount: invoices.length,
          paymentCount: payments.length,
        };
      })
      .filter(row => row.invoiceTotal || row.paymentTotal)
      .sort((a, b) => b.payable + b.credit - (a.payable + a.credit));
  }, [state]);
  const partnerObligationReport = useMemo(() => {
    return state.people
      .filter(person => person.roles?.includes("شریک") || person.type === "شریک")
      .map(partner => {
        const checks = state.issuedChecks.filter(check => check.issuerPartyId === partner.id);
        const events = state.partnerObligationEvents.filter(event => event.partnerId === partner.id);
        const issuedTotal = checks.reduce((sum, check) => sum + check.amount, 0);
        const dueTotal = events.filter(event => event.kind === "due").reduce((sum, event) => sum + event.amount, 0);
        const paidTotal = events.filter(event => event.kind === "paid").reduce((sum, event) => sum + event.amount, 0);
        const returnedTotal = events.filter(event => event.kind === "returned").reduce((sum, event) => sum + event.amount, 0);
        const outstanding = Math.max(0, dueTotal - paidTotal);
        return { partner, checks, issuedTotal, dueTotal, paidTotal, returnedTotal, outstanding };
      })
      .filter(row => row.issuedTotal || row.dueTotal)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [state]);
  const purchaseCashReport = useMemo(() => {
    return state.cashEvents
      .filter(event => event.sourceType === "purchase_payment" || event.sourceType === "purchase_payment_reversal")
      .sort((a, b) => jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date)));
  }, [state]);
  const cashReconciliation = useMemo(
    () => cashAccountReconciliation(state),
    [state]
  );
  const integrityFindings = useMemo(() => auditDataIntegrity(state), [state]);
  return (
    <div className="page-stack page-enter reports-page">
      <PageIntro
        kicker="دید مدیریتی"
        title="گزارش‌ها"
        description="عددهای کلیدی کارگاه را برای تصمیم‌گیری سریع کنار هم ببینید."
        actionLabel="خروجی JSON"
        onAction={() => {
          const blob = new Blob([
            exportUnifiedPayload(state, loadVendorDirectory()),
          ], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "accounting-report.json";
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
      <div className="report-grid">
        <div className="panel report-highlight">
          <span className="section-kicker">خالص گردش نقدی</span>
          <strong>
            {formatMoney(metrics.balance, state.settings.currency)}
          </strong>
          <p>بر مبنای دریافت‌ها و پرداخت‌های ثبت‌شده تا امروز.</p>
          <div className="report-line">
            <span
              style={{
                width: `${Math.min(100, metrics.receipts ? Math.max(10, (metrics.balance / metrics.receipts) * 100) : 10)}%`,
              }}
            />
          </div>
        </div>
        <div className="panel report-breakdown">
          <span className="section-kicker">خلاصهٔ دوره</span>
          <div className="break-row">
            <span>فروش</span>
            <strong>
              {formatMoney(metrics.sales, state.settings.currency)}
            </strong>
          </div>
          <div className="break-row">
            <span>خرید</span>
            <strong>
              {formatMoney(metrics.purchases, state.settings.currency)}
            </strong>
          </div>
          <div className="break-row">
            <span>دریافت</span>
            <strong className="amount-positive">
              {formatMoney(metrics.receipts, state.settings.currency)}
            </strong>
          </div>
          <div className="break-row">
            <span>پرداخت</span>
            <strong className="amount-negative">
              {formatMoney(metrics.payments, state.settings.currency)}
            </strong>
          </div>
        </div>
      </div>
      <section className="panel table-panel integrity-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">کنترل سلامت داده</span><h3>ممیزی یکپارچگی حسابداری</h3></div>
          <span className={`status-pill ${integrityFindings.some(item => item.severity === "خطا") ? "status-danger" : integrityFindings.some(item => item.severity === "هشدار") ? "status-warning" : "status-success"}`}>
            {integrityFindings.some(item => item.severity === "خطا") ? "نیازمند بررسی" : integrityFindings.some(item => item.severity === "هشدار") ? "هشدار" : "سالم"}
          </span>
        </div>
        <p className="muted-cell">این کنترل فقط خواندنی است و شماره‌های تکراری، ارجاع‌های شکسته، تخصیص بیش از سقف و اختلاف projection با دفتر رویداد را پیدا می‌کند.</p>
        <div className="table-wrap"><table><thead><tr><th>شدت</th><th>حوزه</th><th>شرح</th></tr></thead><tbody>
          {integrityFindings.map(finding => <tr key={finding.id}><td><span className={`status-pill ${finding.severity === "خطا" ? "status-danger" : finding.severity === "هشدار" ? "status-warning" : "status-success"}`}>{finding.severity}</span></td><td>{finding.area}</td><td>{finding.message}</td></tr>)}
        </tbody></table></div>
      </section>
      <div className="panel table-panel">
        <div className="panel-heading"><div><span className="section-kicker">گردش پرداخت خرید</span><h3>دفتر نقدی و بانک</h3></div><span className="soft-tag">رویداد مستقل و قابل reversal</span></div>
        <div className="table-wrap"><table><thead><tr><th>تاریخ</th><th>حساب</th><th>نوع رویداد</th><th>مبلغ</th><th>شرح</th></tr></thead><tbody>
          {purchaseCashReport.length ? purchaseCashReport.map(event => <tr key={event.id}><td>{formatDate(event.date)}</td><td>{state.accounts.find(account => account.id === event.accountId)?.name || "حساب حذف‌شده"}</td><td><span className={`status-pill ${event.kind === "reversal" ? "status-warning" : "status-success"}`}>{event.kind === "reversal" ? "معکوس‌سازی پرداخت" : "پرداخت خرید"}</span></td><td>{formatMoney(event.amount, state.settings.currency)}</td><td>{event.note}</td></tr>) : <tr><td colSpan={5}>برای پرداخت‌های خرید نقدی یا بانکی رویدادی ثبت نشده است.</td></tr>}
        </tbody></table></div>
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">کنترل دفتر رویداد</span><h3>مغایرت بانک و صندوق</h3></div>
          <span className="soft-tag">ماندهٔ ثبت‌شده در برابر بازسازی‌شده</span>
        </div>
        <div className="table-wrap"><table><thead><tr><th>حساب</th><th>نوع</th><th>ماندهٔ ثبت‌شده</th><th>ماندهٔ ledger</th><th>اختلاف</th><th>دریافت</th><th>پرداخت</th><th>رویداد</th></tr></thead><tbody>
          {cashReconciliation.length ? cashReconciliation.map(row => <tr key={row.accountId}>
            <td><strong>{row.accountName}</strong></td>
            <td>{row.accountType}</td>
            <td>{formatMoney(row.recorded, state.settings.currency)}</td>
            <td>{formatMoney(row.projected, state.settings.currency)}</td>
            <td className={Math.abs(row.difference) > 0.000001 ? "amount-negative" : "amount-positive"}>{formatMoney(row.difference, state.settings.currency)}</td>
            <td>{formatMoney(row.receipts, state.settings.currency)}</td>
            <td>{formatMoney(row.payments, state.settings.currency)}</td>
            <td>{formatNumber(row.eventCount)}</td>
          </tr>) : <tr><td colSpan={8}>حسابی برای تطبیق ثبت نشده است.</td></tr>}
        </tbody></table></div>
      </div>
      <div className="panel table-panel aging-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">گزارش سررسید</span>
            <h3>سن مطالبات و بدهی فاکتورها</h3>
          </div>
          <span className="soft-tag">تا {todayJalali()}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>بازه</th>
                <th>تعداد سند</th>
                <th>مطالبات فروش</th>
                <th>بدهی خرید</th>
                <th>خالص باز</th>
              </tr>
            </thead>
            <tbody>
              {agingReport.map(row => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{formatNumber(row.count)}</td>
                  <td className="amount-negative">
                    <strong>{formatMoney(row.receivable, state.settings.currency)}</strong>
                    <small className="table-subline">طلب از مشتریان</small>
                  </td>
                  <td className="amount-positive">
                    <strong>{formatMoney(row.payable, state.settings.currency)}</strong>
                    <small className="table-subline">بدهی به تأمین‌کنندگان</small>
                  </td>
                  <td>
                    {formatMoney(
                      row.receivable - row.payable,
                      state.settings.currency
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="report-grid">
        <div className="panel table-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">حساب تأمین‌کنندگان</span><h3>فاکتور، پرداخت و مانده</h3></div>
            <span className="soft-tag">تسویهٔ آزاد با FIFO</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>تأمین‌کننده</th><th>فاکتور خرید</th><th>پرداخت‌ها</th><th>مانده بدهی</th><th>پیش‌پرداخت</th></tr></thead>
            <tbody>{supplierReport.length ? supplierReport.map(row => <tr key={row.supplier.id}>
              <td><strong>{row.supplier.name}</strong><small className="muted-cell">{row.invoiceCount} فاکتور · {row.paymentCount} پرداخت</small></td>
              <td><strong>{formatMoney(row.invoiceTotal, state.settings.currency)}</strong><small className="table-subline">خرید / بدهی ایجادشده</small></td>
              <td><strong>{formatMoney(row.paymentTotal, state.settings.currency)}</strong><small className="table-subline">پرداخت به تأمین‌کننده</small></td>
              <td className="amount-negative"><strong>{formatMoney(row.payable, state.settings.currency)}</strong><small className="table-subline">بدهی باقی‌مانده</small></td>
              <td className="amount-positive"><strong>{formatMoney(row.credit, state.settings.currency)}</strong><small className="table-subline">پیش‌پرداخت / طلب کارگاه</small></td>
            </tr>) : <tr><td colSpan={5}>برای تأمین‌کنندگان فاکتور یا پرداختی ثبت نشده است.</td></tr>}</tbody>
          </table></div>
        </div>
        <div className="panel table-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">تعهدات شرکا</span><h3>چک‌های صادرشده و وضعیت تعهد</h3></div>
            <span className="soft-tag">رویدادمحور</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>شریک</th><th>کل چک‌ها</th><th>سررسید ثبت‌شده</th><th>پرداخت</th><th>تعهد باز</th></tr></thead>
            <tbody>{partnerObligationReport.length ? partnerObligationReport.map(row => <tr key={row.partner.id}>
              <td><strong>{row.partner.name}</strong><small className="muted-cell">{row.checks.length} چک</small></td>
              <td><strong>{formatMoney(row.issuedTotal, state.settings.currency)}</strong><small className="table-subline">چک صادرشده</small></td>
              <td><strong>{formatMoney(row.dueTotal, state.settings.currency)}</strong><small className="table-subline">تعهد / بدهی</small></td>
              <td><strong>{formatMoney(row.paidTotal, state.settings.currency)}</strong><small className="table-subline">پرداخت‌شده</small></td>
              <td className={row.outstanding ? "amount-negative" : "amount-positive"}><strong>{formatMoney(row.outstanding, state.settings.currency)}</strong><small className="table-subline">تعهد باقی‌مانده</small></td>
            </tr>) : <tr><td colSpan={5}>برای شرکا چک صادرشده‌ای ثبت نشده است.</td></tr>}</tbody>
          </table></div>
        </div>
      </div>
      <section className="metric-grid profit-metric-grid">
        <MetricCard
          label="فروش معتبر"
          value={formatMoney(profitReport.sales, state.settings.currency)}
          helper="فاکتورهای فروش بدون ابطال"
          icon={<ArrowDownLeft size={20} />}
          tone="mint"
        />
        <MetricCard
          label="ارزش فروش تقریبی"
          value={formatMoney(
            profitReport.estimatedCost,
            state.settings.currency
          )}
          helper="بر اساس قیمت پایهٔ فروش فعلی کالا"
          icon={<Boxes size={20} />}
          tone="amber"
        />
        <MetricCard
          label="انحراف فروش از قیمت پایه"
          value={formatMoney(profitReport.grossProfit, state.settings.currency)}
          helper="فروش معتبر منهای ارزش فروش با قیمت پایهٔ فعلی"
          icon={<ChartNoAxesCombined size={20} />}
          tone={profitReport.grossProfit >= 0 ? "indigo" : "rose"}
        />
        <MetricCard
          label="ارزش فروش بالقوهٔ موجودی"
          value={formatMoney(
            profitReport.inventoryValue,
            state.settings.currency
          )}
          helper="موجودی فعلی × قیمت پایهٔ فروش؛ بهای دفتری نیست"
          icon={<WalletCards size={20} />}
          tone="violet"
        />
      </section>
      <section className="panel table-panel effective-profit-report">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">گزارش مستقل وصول</span>
            <h3>سود ظاهری و سود مؤثر</h3>
            <p className="muted-cell">
              فقط چک‌های «وصول شده»؛ مبنا تاریخ واقعی وصول است، نه تاریخ سررسید.
              هزینهٔ دیرکرد جدا از سود کالا نمایش داده می‌شود.
            </p>
          </div>
          <span className="soft-tag">هر چک · هر فاکتور · ماه · سال</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاریخ وصول</th>
                <th>چک</th>
                <th>فاکتور</th>
                <th>مبلغ وصول</th>
                <th>هزینهٔ دیرکرد</th>
                <th>سود ظاهری</th>
                <th>درصد ظاهری</th>
                <th>سود مؤثر</th>
                <th>درصد مؤثر</th>
              </tr>
            </thead>
            <tbody>
              {collectionProfitRows.length ? collectionProfitRows.map(row => (
                <tr key={row.id}>
                  <td>{formatDate(row.collectionDate)}</td>
                  <td><strong>{row.checkNumber}</strong></td>
                  <td>{row.invoiceNumber}</td>
                  <td>{formatMoney(row.collectedAmount, state.settings.currency)}</td>
                  <td>{formatMoney(row.lateCost, state.settings.currency)}</td>
                  <td>{formatMoney(row.apparentProfit, state.settings.currency)}</td>
                  <td>{formatNumber(row.apparentRate * 100)}٪</td>
                  <td className={row.effectiveProfit >= 0 ? "amount-positive" : "amount-negative"}>
                    {formatMoney(row.effectiveProfit, state.settings.currency)}
                  </td>
                  <td>{formatNumber(row.effectiveRate * 100)}٪</td>
                </tr>
              )) : (
                <tr><td colSpan={9}>پس از ثبت تاریخ واقعی وصول چک، سود ظاهری و مؤثر اینجا نمایش داده می‌شود.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="report-grid effective-profit-periods">
        <div className="panel table-panel">
          <div className="panel-heading"><div><span className="section-kicker">تجمیع زمانی</span><h3>سود ماهانه</h3></div><span className="soft-tag">بر اساس تاریخ وصول</span></div>
          <div className="table-wrap"><table><thead><tr><th>ماه</th><th>تعداد تخصیص</th><th>وصول</th><th>هزینه دیرکرد</th><th>سود ظاهری</th><th>سود مؤثر</th></tr></thead><tbody>
            {collectionProfitSummary.months.length ? collectionProfitSummary.months.map(row => <tr key={row.key}><td><strong>{row.key}</strong></td><td>{formatNumber(row.count)}</td><td>{formatMoney(row.collectedAmount, state.settings.currency)}</td><td>{formatMoney(row.lateCost, state.settings.currency)}</td><td>{formatMoney(row.apparentProfit, state.settings.currency)}</td><td className={row.effectiveProfit >= 0 ? "amount-positive" : "amount-negative"}>{formatMoney(row.effectiveProfit, state.settings.currency)}</td></tr>) : <tr><td colSpan={6}>داده‌ای برای تجمیع ماهانه وجود ندارد.</td></tr>}
          </tbody></table></div>
        </div>
        <div className="panel table-panel">
          <div className="panel-heading"><div><span className="section-kicker">تجمیع زمانی</span><h3>سود سالانه</h3></div><span className="soft-tag">بر اساس تاریخ وصول</span></div>
          <div className="table-wrap"><table><thead><tr><th>سال</th><th>تعداد تخصیص</th><th>وصول</th><th>هزینه دیرکرد</th><th>سود ظاهری</th><th>سود مؤثر</th></tr></thead><tbody>
            {collectionProfitSummary.years.length ? collectionProfitSummary.years.map(row => <tr key={row.key}><td><strong>{row.key}</strong></td><td>{formatNumber(row.count)}</td><td>{formatMoney(row.collectedAmount, state.settings.currency)}</td><td>{formatMoney(row.lateCost, state.settings.currency)}</td><td>{formatMoney(row.apparentProfit, state.settings.currency)}</td><td className={row.effectiveProfit >= 0 ? "amount-positive" : "amount-negative"}>{formatMoney(row.effectiveProfit, state.settings.currency)}</td></tr>) : <tr><td colSpan={6}>داده‌ای برای تجمیع سالانه وجود ندارد.</td></tr>}
          </tbody></table></div>
        </div>
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">مطالبات و ماندهٔ طرف حساب</span>
            <h3>بدهکاران و بستانکاران</h3>
          </div>
          <span className="soft-tag">فاکتور معتبر و مبلغ تخصیص‌یافته</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>طرف حساب</th>
                <th>فروش</th>
                <th>خرید</th>
                <th>وصول/تسویه</th>
                <th>مانده</th>
              </tr>
            </thead>
            <tbody>
              {profitReport.receivables.length ? (
                profitReport.receivables.map(row => (
                  <tr key={row.person.id}>
                    <td>
                      <strong>{row.person.name}</strong>
                      <small className="muted-cell">{row.person.code}</small>
                    </td>
                    <td>
                      {formatMoney(row.salesBase, state.settings.currency)}
                    </td>
                    <td>
                      {formatMoney(row.purchasesBase, state.settings.currency)}
                    </td>
                    <td>
                      {formatMoney(row.collected, state.settings.currency)}
                    </td>
                    <td
                      className={
                        row.balance >= 0 ? "amount-negative" : "amount-positive"
                      }
                    >
                      {formatMoney(
                        Math.abs(row.balance),
                        state.settings.currency
                      )}{" "}
                      {row.balance >= 0 ? "بدهکار" : "بستانکار"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    برای طرف حساب‌ها فاکتور یا وصولی ثبت نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel table-panel customer-statement-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">صورت‌حساب تفصیلی</span>
            <h3>گردش کامل مشتری</h3>
          </div>
          <div className="panel-heading-actions">
            <button
              className="button button-ghost"
              onClick={() => printWithTarget("statement")}
            >
              چاپ
            </button>
            <button className="button button-ghost" onClick={downloadStatement}>
              خروجی CSV
            </button>
          </div>
        </div>
        <div className="statement-controls">
          <label>
            مشتری
            <select
              value={statementPartyId}
              onChange={event => setStatementPartyId(event.target.value)}
            >
              <option value="">انتخاب مشتری</option>
              {state.people
                .filter(
                  person =>
                    person.roles?.includes("مشتری") || person.type === "مشتری"
                )
                .map(person => (
                  <option key={person.id} value={person.id}>
                    {person.code} · {person.name}
                  </option>
                ))}
            </select>
          </label>
          <span className="soft-tag">
            بدهکار: فروش · بستانکار: خرید و چک دریافتی
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>مرجع</th>
                <th>بدهکار</th>
                <th>بستانکار</th>
                <th>مانده تجمعی</th>
                <th>شرح</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.length ? (
                statementRows.map(row => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <strong>{row.reference}</strong>
                    </td>
                    <td>{formatMoney(row.debit, state.settings.currency)}</td>
                    <td>{formatMoney(row.credit, state.settings.currency)}</td>
                    <td
                      className={
                        row.balance >= 0 ? "amount-negative" : "amount-positive"
                      }
                    >
                      <strong>{formatMoney(Math.abs(row.balance), state.settings.currency)}</strong>
                      <small className="table-subline">{row.balance >= 0 ? "طلب از مشتری" : "بستانکاری مشتری / بدهی کمتر"}</small>
                    </td>
                    <td>{row.note || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    مشتری را انتخاب کنید تا صورت‌حساب فاکتورها و چک‌های او نمایش
                    داده شود.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel ledger-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">دفتر معین و تفصیلی</span>
            <h3>گردش حساب و طرف حساب</h3>
          </div>
          <button
            className="button button-ghost"
            onClick={() => printWithTarget("ledger")}
          >
            چاپ دفتر
          </button>
        </div>
        <div className="ledger-controls">
          <div className="segmented-control">
            <button
              className={ledgerMode === "account" ? "active" : ""}
              onClick={() => setLedgerMode("account")}
            >
              حساب‌ها
            </button>
            <button
              className={ledgerMode === "party" ? "active" : ""}
              onClick={() => setLedgerMode("party")}
            >
              طرف حساب‌ها
            </button>
          </div>
          {ledgerMode === "account" ? (
            <select
              value={ledgerAccountId}
              onChange={event => setLedgerAccountId(event.target.value)}
            >
              <option value="">انتخاب بانک، صندوق یا شریک</option>
              {state.accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.type}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={ledgerPartyId}
              onChange={event => setLedgerPartyId(event.target.value)}
            >
              <option value="">انتخاب طرف حساب</option>
              {state.people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.code} · {person.name}
                </option>
              ))}
            </select>
          )}
            <strong
              className={
                ledgerBalance >= 0 ? "amount-positive" : "amount-negative"
              }
            >
              {ledgerMode === "party" ? "مانده طرف حساب:" : "مانده حساب:"}{" "}
              {formatMoney(Math.abs(ledgerBalance), state.settings.currency)}
              <small className="table-subline">
                {ledgerMode === "party"
                  ? ledgerBalance >= 0 ? "طلب / افزایش حق دریافت" : "بدهی / بستانکاری طرف حساب"
                  : ledgerBalance >= 0 ? "افزایش خالص حساب" : "کاهش خالص حساب"}
              </small>
          </strong>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>شرح</th>
                <th>{ledgerMode === "party" ? "افزایش طلب / مانده" : "ورود به حساب"}</th>
                <th>{ledgerMode === "party" ? "کاهش طلب / تسویه" : "خروج از حساب"}</th>
                <th>مانده</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.length ? (
                (() => {
                  let running = 0;
                  return ledgerRows.map(row => {
                    running += row.increase - row.decrease;
                    return (
                      <tr key={row.id}>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <strong>{row.title}</strong>
                          <small className="muted-cell">{row.note}</small>
                        </td>
                        <td className="amount-positive">
                          {row.increase ? <><strong>{formatMoney(row.increase, state.settings.currency)}</strong><small className="table-subline">{ledgerMode === "party" ? "افزایش طلب" : "ورود وجه"}</small></> : "—"}
                        </td>
                        <td className="amount-negative">
                          {row.decrease ? <><strong>{formatMoney(row.decrease, state.settings.currency)}</strong><small className="table-subline">{ledgerMode === "party" ? "تسویه / کاهش طلب" : "خروج وجه"}</small></> : "—"}
                        </td>
                        <td>
                          <strong>{formatMoney(Math.abs(running), state.settings.currency)}</strong>
                          <small className="table-subline">{running < 0 ? "کاهش خالص" : "افزایش خالص"}</small>
                        </td>
                      </tr>
                    );
                  });
                })()
              ) : (
                <tr>
                  <td colSpan={5}>
                    برای مشاهدهٔ دفتر، حساب یا طرف حساب را انتخاب کنید.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">دفتر جریان نقدی</span>
            <h3>ورودی و خروجی به تفکیک حساب</h3>
          </div>
          <span className="status-pill status-success">
            {formatNumber(cashRows.length)} ردیف
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>نوع</th>
                <th>طرف حساب</th>
                <th>حساب</th>
                <th>ورودی</th>
                <th>خروجی</th>
              </tr>
            </thead>
            <tbody>
              {cashRows.length ? (
                cashRows.slice(0, 30).map(row => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>{transactionLabel(row.type)}</td>
                    <td>{row.partyName}</td>
                    <td>{row.accountName}</td>
                    <td className="amount-positive">
                      {row.incoming
                        ? formatMoney(row.amount, state.settings.currency)
                        : "—"}
                    </td>
                    <td className="amount-negative">
                      {row.incoming
                        ? "—"
                        : formatMoney(row.amount, state.settings.currency)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>هنوز گردش نقدی ثبت نشده است.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {cashRows.length > 30 && (
          <small className="muted-cell">
            ۳۰ ردیف اخیر نمایش داده شد؛ دفتر عملیات منبع کامل داده است.
          </small>
        )}
      </div>
      <div className="panel insight-panel">
        <div className="mini-icon amber">
          <ShieldCheck size={18} />
        </div>
        <div>
          <strong>کنترل تداخل فاکتور و عملیات مستقیم</strong>
          <p>
            {possibleDuplicates.length
              ? `${formatNumber(possibleDuplicates.length)} عملیات خرید/فروش مستقیم با یک فاکتور مشابه شناسایی شد؛ برای جلوگیری از دوباره‌شماری، فقط یکی از آن‌ها را مرجع اصلی قرار دهید.`
              : "مورد مشابهی بین عملیات مستقیم خرید/فروش و فاکتورهای معتبر پیدا نشد."}
          </p>
        </div>
      </div>
      <div className="panel insight-panel">
        <div className="mini-icon violet">
          <ChartNoAxesCombined size={18} />
        </div>
        <div>
          <strong>گزارش‌های تفصیلی در حال آماده‌سازی هستند</strong>
          <p>
            ساختار گزارش‌ها از یک هستهٔ دادهٔ واحد تغذیه می‌شود تا ماندهٔ
            تاریخی، هزینهٔ روزشمار و موجودی با فرمول‌های پراکنده تکرار نشوند.
          </p>
        </div>
      </div>
    </div>
  );
}

function Production({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (next: AppState, message: string) => void;
}) {
  const rawWarehouses = state.warehouses.filter(warehouse =>
    warehouse.name.includes("مواد")
  );
  const outputWarehouses = state.warehouses.filter(warehouse =>
    warehouse.name.includes("محصول")
  );
  const rawProducts = state.products.filter(product => {
    const warehouse = state.warehouses.find(
      item => item.id === product.warehouseId
    );
    return (
      product.category === "مواد اولیه" ||
      product.category === "بسته تولید" ||
      warehouse?.name.includes("مواد")
    );
  });
  const outputProducts = state.products.filter(product => {
    const warehouse = state.warehouses.find(
      item => item.id === product.warehouseId
    );
    return (
      warehouse?.name.includes("محصول") || product.category === "محصول تولیدی"
    );
  });
  const blankMaterial: ProductionMaterial = {
    id: createId("material"),
    productId: "",
    quantity: 0,
    unit: "",
  };
  const blankCost: ProductionCost = {
    id: createId("cost"),
    title: "",
    amount: 0,
  };
  const [form, setForm] = useState({
    name: "",
    formulaType: "قطعه" as "قطعه" | "بسته تولید",
    outputProductId: "",
    outputQuantity: "1",
    outputUnit: "",
    materials: [blankMaterial],
    costs: [blankCost],
    note: "",
    packageOutput: false,
  });
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  const [materialQuantityDrafts, setMaterialQuantityDrafts] = useState<Record<string, string>>({});
  const [productionDialog, setProductionDialog] = useState<{
    formula: ProductionFormula;
    quantity: string;
    unit: string;
    batchNumber: string;
    pieceWeight: string;
    pieceWeightUnit: string;
    wastePercent: string;
    adjustments: Record<string, string>;
    excludedMaterialIds: string[];
    note: string;
    editingRecordId?: string;
  } | null>(null);
  const selectedOutput = state.products.find(
    product => product.id === form.outputProductId
  );
  const quantityValue = (value: string) => {
    return parseLocalizedNumber(value);
  };
  const unitPrice = (productId: string, unit: string) => {
    const product = state.products.find(item => item.id === productId);
    if (!product) return 0;
    const history = state.priceHistory
      .filter(
        item =>
          item.productId === productId && item.effectiveDate <= todayJalali()
      )
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return Number(history[0]?.price ?? product.price) || 0;
  };
  const materialCost = form.materials.reduce((sum, material) => {
    const product = state.products.find(item => item.id === material.productId);
    const conversion = product
      ? unitConversionToBase(product, material.unit)
      : 1;
    return (
      sum +
      (Number(material.quantity) || 0) *
        conversion *
        unitPrice(material.productId, material.unit)
    );
  }, 0);
  const overheadCost = form.costs.reduce(
    (sum, cost) => sum + (Number(cost.amount) || 0),
    0
  );
  const totalCost = materialCost + overheadCost;
  const formulaCostPerUnit =
    totalCost / Math.max(1, quantityValue(form.outputQuantity) || 1);
  const currentFormulaCost = (formula: ProductionFormula) => {
    try {
      return calculateCurrentProductionUnitCost(state, formula.id);
    } catch {
      return 0;
    }
  };

  function saveProduction(event: React.FormEvent) {
    event.preventDefault();
    const quantity = quantityValue(form.outputQuantity);
    const materials = form.materials
      .map(item => ({
        ...item,
        quantity: Object.prototype.hasOwnProperty.call(materialQuantityDrafts, item.id)
          ? quantityValue(materialQuantityDrafts[item.id])
          : Number(item.quantity) || 0,
      }))
      .filter(item => item.productId && item.quantity > 0);
    if (
      !form.name.trim() ||
      (form.formulaType === "قطعه" && !form.outputProductId) ||
      quantity <= 0 ||
      !materials.length
    )
      return;

    const outputProduct =
      selectedOutput ||
      (form.formulaType === "بسته تولید"
        ? {
            id: createId("package"),
            code: `PKG-${Date.now()}`,
            name: form.name.trim(),
            unit: form.outputUnit || "کیلوگرم",
            unit2: form.outputUnit || "کیلوگرم",
            conversionRate: 1,
            warehouseId: rawWarehouses[0]?.id,
            stock: 0,
            minStock: 0,
            price: 0,
            category: "بسته تولید" as const,
          }
        : undefined);
    if (!outputProduct) return;

    const formula: ProductionFormula = {
      id: selectedFormulaId || createId("formula"),
      name: form.name.trim(),
      formulaType: form.formulaType,
      outputProductId: outputProduct.id,
      outputName: outputProduct.name,
      outputQuantity: quantity,
      outputUnit: form.outputUnit || selectedOutput?.unit || "عدد",
      materials,
      costs: form.costs.filter(
        item => item.title.trim() && Number(item.amount) > 0
      ),
      note: form.note,
    };

    const products = selectedOutput
      ? state.products
      : [...state.products, outputProduct];
    onSave(
      {
        ...state,
        products,
        productionFormulas: selectedFormulaId
          ? state.productionFormulas.map(item =>
              item.id === selectedFormulaId ? formula : item
            )
          : [...state.productionFormulas, formula],
      },
      selectedFormulaId ? "فرمول ویرایش شد؛ تولید هنوز ثبت نشده است" : "فرمول ذخیره شد؛ برای تولید از دکمه تولید استفاده کنید"
    );
    setForm({
      name: "",
      formulaType: "قطعه",
      outputProductId: "",
      outputQuantity: "1",
      outputUnit: "",
      materials: [{ ...blankMaterial, id: createId("material") }],
      costs: [{ ...blankCost, id: createId("cost") }],
      note: "",
      packageOutput: false,
    });
    setMaterialQuantityDrafts({});
    setSelectedFormulaId("");
  }

  function loadFormula(formula: ProductionFormula) {
    setSelectedFormulaId(formula.id);
    setForm({
      name: formula.name,
      formulaType: formula.formulaType || "قطعه",
      outputProductId: formula.outputProductId || "",
      outputQuantity: String(formula.outputQuantity),
      outputUnit: formula.outputUnit,
      materials: formula.materials,
      costs: formula.costs.length
        ? formula.costs
        : [{ ...blankCost, id: createId("cost") }],
      note: formula.note,
      packageOutput: false,
    });
    setMaterialQuantityDrafts(
      Object.fromEntries(formula.materials.map(material => [material.id, String(material.quantity)]))
    );
  }

  function deleteFormula(formula: ProductionFormula) {
    if (!window.confirm(`فرمول ${formula.name} حذف شود؟`)) return;
    onSave(
      {
        ...state,
        products: state.products,
        productionFormulas: state.productionFormulas.filter(
          item => item.id !== formula.id
        ),
        productionRecords: state.productionRecords,
      },
      `موتور فرمول ${formula.name} حذف شد؛ سوابق بچ مستقل باقی ماندند`
    );
    if (selectedFormulaId === formula.id) setSelectedFormulaId("");
  }

  function loadProductionRecord(record: ProductionRecord, formula: ProductionFormula) {
    const adjustments = Object.fromEntries(
      (record.materialUsage || []).map(usage => [usage.materialId, String(usage.adjustmentQuantity || "")])
    );
    setProductionDialog({
      formula,
      quantity: String(record.actualOutputQuantity ?? record.outputQuantity),
      unit: record.actualOutputUnit || formula.outputUnit,
      batchNumber: record.batchNumber || "",
      pieceWeight: String(record.pieceWeight || ""),
      pieceWeightUnit: record.pieceWeightUnit || "گرم",
      wastePercent: String(record.wastePercent || "0"),
      adjustments,
      excludedMaterialIds: record.excludedMaterialIds || [],
      note: record.note,
      editingRecordId: record.id,
    });
  }

  function deleteProductionRecord(record: ProductionRecord) {
    if (!window.confirm(`بچ ${record.batchNumber || "بدون شماره"} حذف و اثر آن از موجودی معکوس شود؟`)) return;
    try {
      onSave(removeProductionRun(state, record.id), `بچ ${record.batchNumber || "بدون شماره"} حذف شد و موجودی اصلاح شد`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "حذف بچ انجام نشد");
    }
  }

  function refreshProductionPrice(record: ProductionRecord, formula: ProductionFormula) {
    const outputProduct = state.products.find(item => item.id === (record.outputProductId || formula.outputProductId));
    const enteredUnit = record.actualOutputUnit || formula.outputUnit;
    const raw = window.prompt(`مقدار ${enteredUnit} برای ایجاد سطر قیمت جدید را وارد کنید:`);
    if (raw === null) return;
    const enteredQuantity = quantityValue(raw);
    const quantityBase = outputProduct
      ? quantityInBase(outputProduct, enteredQuantity, enteredUnit)
      : enteredQuantity;
    try {
      onSave(
        refreshProductionRecordPrice(state, record.id, quantityBase),
        `سطر قیمت جدید برای ${formatNumber(enteredQuantity)} ${enteredUnit} ثبت شد`
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "به‌روزرسانی قیمت انجام نشد");
    }
  }

  function produceFormula(event: React.FormEvent) {
    event.preventDefault();
    if (!productionDialog) return;
    try {
      const quantity = quantityValue(productionDialog.quantity);
      const options = {
        batchNumber: productionDialog.batchNumber,
        pieceWeight: quantityValue(productionDialog.pieceWeight),
        pieceWeightUnit: productionDialog.pieceWeightUnit,
        wastePercent: quantityValue(productionDialog.wastePercent),
        materialAdjustments: Object.fromEntries(
          Object.entries(productionDialog.adjustments).map(([id, value]) => [id, quantityValue(value)])
        ),
        excludedMaterialIds: productionDialog.excludedMaterialIds,
        note: productionDialog.note,
      };
      const baseState = productionDialog.editingRecordId
        ? removeProductionRun(state, productionDialog.editingRecordId)
        : state;
      const hasFormula = baseState.productionFormulas.some(
        formula => formula.id === productionDialog.formula.id
      );
      const executionState = hasFormula
        ? baseState
        : {
            ...baseState,
            productionFormulas: [
              ...baseState.productionFormulas,
              productionDialog.formula,
            ],
          };
      const next = executeProduction(
        executionState,
        productionDialog.formula.id,
        quantity,
        productionDialog.unit,
        todayJalali(),
        options
      ).state;
      if (!hasFormula) {
        next.productionFormulas = next.productionFormulas.filter(
          formula => formula.id !== productionDialog.formula.id
        );
      }
      onSave(next, productionDialog.editingRecordId ? "بچ و موجودی با اطلاعات جدید اصلاح شد" : `تولید ${productionDialog.formula.name} ثبت شد`);
      setProductionDialog(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "تولید انجام نشد");
    }
  }

  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="فرمول و بهای ساخت"
        title="تولید"
        description="مواد اولیه را از انبار مصرف کنید، بسته‌های نیمه‌آماده بسازید و هزینهٔ تمام‌شده را محاسبه کنید."
      />
      <div className="production-layout">
        <form className="panel production-form" onSubmit={saveProduction}>
          <div className="section-heading">
            <div>
              <span className="section-kicker">ثبت تولید</span>
              <h3>فرمول جدید و تولید محصول</h3>
            </div>
            <span className="status-pill">
              بهای ساخت: {formatMoney(totalCost, state.settings.currency)}
            </span>
          </div>
          <div className="form-grid">
            <label className="full-field">
              نام فرمول
              <input
                value={form.name}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="مثلاً فرمول تولید لقمه Z"
              />
            </label>
            <label>
              نوع فرمول
              <select
                value={form.formulaType}
                onChange={event =>
                  setForm({
                    ...form,
                    formulaType: event.target.value as "قطعه" | "بسته تولید",
                    outputProductId:
                      event.target.value === "بسته تولید"
                        ? ""
                        : form.outputProductId,
                  })
                }
              >
                <option value="قطعه">فرمول قطعه</option>
                <option value="بسته تولید">فرمول بسته مستقل</option>
              </select>
            </label>
            <label>
              {form.formulaType === "بسته تولید"
                ? "بسته در انبار مواد اولیه ذخیره می‌شود"
                : "محصول نهایی از انبار محصولات"}
              <select
                value={form.outputProductId}
                disabled={form.formulaType === "بسته تولید"}
                onChange={event => {
                  const product = state.products.find(
                    item => item.id === event.target.value
                  );
                  setForm({
                    ...form,
                    outputProductId: event.target.value,
                    outputUnit: product?.unit || "",
                  });
                }}
              >
                <option value="">
                  {form.formulaType === "بسته تولید"
                    ? "خودکار از نام فرمول"
                    : "انتخاب محصول"}
                </option>
                {outputProducts.map(product => (
                  <option value={product.id} key={product.id}>
                    {product.name} · {product.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              مقدار تولید
              <input
                inputMode="decimal"
                value={form.outputQuantity}
                onChange={event =>
                  setForm({ ...form, outputQuantity: event.target.value })
                }
              />
            </label>
            <label>
              واحد تولید
              <select
                value={form.outputUnit}
                onChange={event =>
                  setForm({ ...form, outputUnit: event.target.value })
                }
              >
                <option value="">واحد پایه</option>
                {Array.from(
                  new Set(
                    (selectedOutput
                      ? [selectedOutput.unit, selectedOutput.unit2]
                      : []
                    ).concat(state.settings.units)
                  )
                )
                  .filter(Boolean)
                  .map(unit => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="production-section">
            <div className="tier-editor-head">
              <strong>مواد اولیه و بسته‌های نیمه‌آماده</strong>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setForm({
                    ...form,
                    materials: [
                      ...form.materials,
                      { ...blankMaterial, id: createId("material") },
                    ],
                  })
                }
              >
                <Plus size={14} /> افزودن ماده
              </button>
            </div>
            {form.materials.map((material, index) => {
              const product = state.products.find(
                item => item.id === material.productId
              );
              return (
                <div className="production-row" key={material.id}>
                  <select
                    value={material.productId}
                    onChange={event => {
                      const item = state.products.find(
                        product => product.id === event.target.value
                      );
                      const materials = [...form.materials];
                      materials[index] = {
                        ...material,
                        productId: event.target.value,
                        unit: item?.unit || "",
                      };
                      setForm({ ...form, materials });
                    }}
                  >
                    <option value="">انتخاب از انبار مواد اولیه</option>
                    {rawProducts.map(item => (
                      <option value={item.id} key={item.id}>
                        {item.name} · موجودی {formatNumber(item.stock)}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    value={materialQuantityDrafts[material.id] ?? (material.quantity || "")}
                    onChange={event => {
                      const materials = [...form.materials];
                      const rawValue = event.target.value;
                      materials[index] = {
                        ...material,
                        quantity: quantityValue(rawValue),
                      };
                      setMaterialQuantityDrafts(current => ({
                        ...current,
                        [material.id]: rawValue,
                      }));
                      setForm({ ...form, materials });
                    }}
                    placeholder="مقدار مصرف"
                  />
                  <select
                    value={material.unit}
                    onChange={event => {
                      const materials = [...form.materials];
                      materials[index] = {
                        ...material,
                        unit: event.target.value,
                      };
                      setForm({ ...form, materials });
                    }}
                  >
                    {Array.from(
                      new Set([
                        product?.unit,
                        product?.unit2,
                        ...state.settings.units,
                      ])
                    )
                      .filter(Boolean)
                      .map(unit => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                  </select>
                  <strong>
                    {formatMoney(
                      (Number(material.quantity) || 0) *
                        (product
                          ? unitConversionToBase(product, material.unit)
                          : 1) *
                        unitPrice(material.productId, material.unit),
                      state.settings.currency
                    )}
                  </strong>
                  {form.materials.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() =>
                        setForm({
                          ...form,
                          materials: form.materials.filter(
                            item => item.id !== material.id
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="production-section">
            <div className="tier-editor-head">
              <strong>هزینه‌های سربار</strong>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setForm({
                    ...form,
                    costs: [
                      ...form.costs,
                      { ...blankCost, id: createId("cost") },
                    ],
                  })
                }
              >
                <Plus size={14} /> افزودن هزینه
              </button>
            </div>
            {form.costs.map((cost, index) => (
              <div className="production-row" key={cost.id}>
                <input
                  value={cost.title}
                  onChange={event => {
                    const costs = [...form.costs];
                    costs[index] = { ...cost, title: event.target.value };
                    setForm({ ...form, costs });
                  }}
                  placeholder="برق، اجاره، کارگر و..."
                />
                <input
                  inputMode="numeric"
                  value={cost.amount || ""}
                  onChange={event => {
                    const costs = [...form.costs];
                    costs[index] = {
                      ...cost,
                      amount: quantityValue(event.target.value),
                    };
                    setForm({ ...form, costs });
                  }}
                  placeholder="مبلغ"
                />
                {form.costs.length > 1 && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      setForm({
                        ...form,
                        costs: form.costs.filter(item => item.id !== cost.id),
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <label className="full-field">
            توضیحات
            <textarea
              value={form.note}
              onChange={event => setForm({ ...form, note: event.target.value })}
              placeholder="توضیحات فرایند یا بچ تولید"
            />
          </label>
          <div className="production-total">
            <span>
              مواد: {formatMoney(materialCost, state.settings.currency)}
            </span>
            <span>
              سربار: {formatMoney(overheadCost, state.settings.currency)}
            </span>
            <strong>
              هزینه کل: {formatMoney(totalCost, state.settings.currency)} · هر
              واحد: {formatMoney(formulaCostPerUnit, state.settings.currency)}
            </strong>
          </div>
          <button className="button button-primary" type="submit">
            <Check size={16} /> ذخیرهٔ فرمول
          </button>
        </form>
        <div className="panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">سوابق</span>
              <h3>فرمول‌های ثبت‌شده</h3>
            </div>
          </div>
          {state.productionFormulas.length ? (
            state.productionFormulas.map(formula => {
              const product = state.products.find(
                item => item.id === formula.outputProductId
              );
              const records = state.productionRecords.filter(
                item => item.formulaId === formula.id
              );
              return (
                <div
                  className={`production-card ${selectedFormulaId === formula.id ? "selected" : ""}`}
                  key={formula.id}
                >
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => loadFormula(formula)}
                  >
                    <strong>{formula.name}</strong>
                  </button>
                  <span>
                    {product?.name || formula.outputName || "بسته مستقل"} ·{" "}
                    {formatNumber(formula.materials.length)} ماده اولیه
                  </span>
                  <small>
                    {formula.formulaType === "بسته تولید"
                      ? `بسته مستقل · انبار مواد اولیه · قیمت مستقل: ${formatMoney(product?.price || 0, state.settings.currency)}`
                      : "فرمول قطعه"}
                  </small>
                  <div className="production-formula-details">
                    <strong>فرمول ساخت</strong>
                    <span>خروجی مبنا: {formatNumber(formula.outputQuantity)} {formula.outputUnit}</span>
                    <div className="production-material-list">
                      {formula.materials.map(material => {
                        const materialProduct = state.products.find(item => item.id === material.productId);
                        return (
                          <span key={material.id}>
                            {materialProduct?.name || "ماده حذف‌شده"}: {formatNumber(material.quantity)} {material.unit}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() =>
                      setProductionDialog({
                        formula,
                        quantity: String(formula.outputQuantity),
                        unit: formula.outputUnit,
                        batchNumber: `B-${Date.now()}`,
                        pieceWeight: "",
                        pieceWeightUnit: "گرم",
                        wastePercent: "0",
                        adjustments: {},
                        excludedMaterialIds: formula.materials
                          .filter(material => state.products.find(product => product.id === material.productId)?.category === "بسته تولید")
                          .map(material => material.id),
                        note: "",
                      })
                    }
                  >
                    <Plus size={14} /> تولید
                  </button>
                  <button
                    type="button"
                    className="icon-button row-action"
                    title="ویرایش موتور تولید"
                    aria-label={`ویرایش موتور تولید ${formula.name}`}
                    onClick={() => loadFormula(formula)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button row-action"
                    title="حذف فرمول"
                    onClick={() => deleteFormula(formula)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="فرمولی ثبت نشده"
              description="اولین فرمول تولید را با افزودن مواد اولیه و هزینه‌های سربار بسازید."
            />
          )}
        </div>
        <div className="panel production-batch-register">
          <div className="section-heading">
            <div>
              <span className="section-kicker">دفتر مستقل تولید</span>
              <h3>سطرهای ثبت‌شدهٔ بچ</h3>
            </div>
            <span className="status-pill">{formatNumber(state.productionRecords.length)} سطر</span>
          </div>
          {state.productionRecords.length ? (
            state.productionRecords.map(record => {
              const formula = record.formulaSnapshot || state.productionFormulas.find(item => item.id === record.formulaId);
              const displayFormula = formula || {
                id: record.formulaId,
                name: record.formulaRevision ? `فرمول ${record.formulaRevision}` : "فرمول حذف‌شده",
                outputQuantity: record.outputQuantity,
                outputUnit: record.actualOutputUnit || "عدد",
                materials: [],
                costs: [],
                note: "",
              };
              const outputProduct = state.products.find(
                item => item.id === (record.outputProductId || displayFormula.outputProductId)
              );
              const outputBaseQuantity = record.outputQuantityBase ?? (
                outputProduct
                  ? quantityInBase(
                      outputProduct,
                      record.actualOutputQuantity ?? record.outputQuantity,
                      record.actualOutputUnit || displayFormula.outputUnit
                    )
                  : record.outputQuantity
              );
              const baseUnitCost = outputBaseQuantity > 0
                ? record.totalCost / outputBaseQuantity
                : record.unitCost;
              const outputBaseUnit = outputProduct?.unit || displayFormula.outputUnit || "واحد پایه";
              const revisedBase = (record.priceRevisions || []).reduce((sum, item) => sum + item.quantityBase, 0);
              const originalBase = Math.max(0, outputBaseQuantity - revisedBase);
              return (
                <details className="production-register-item" key={record.id}>
                  <summary>
                    <span><b>{record.batchNumber || "بدون شماره"}</b> · {record.date}</span>
                    <span>{record.outputProductName || displayFormula.outputName || displayFormula.name}</span>
                    <span>{formatNumber(record.actualOutputQuantity ?? record.outputQuantity)} {record.actualOutputUnit || displayFormula.outputUnit}</span>
                    <strong>{formatMoney(record.totalCost, state.settings.currency)}</strong>
                    <strong>هر {outputBaseUnit}: {formatMoney(baseUnitCost, state.settings.currency)}</strong>
                  </summary>
                  <div className="production-register-details">
                    <span>فرمول snapshot: {displayFormula.name}</span>
                    <span>قیمت تمام‌شدهٔ هر {outputBaseUnit}: {formatMoney(baseUnitCost, state.settings.currency)}</span>
                    <div className="production-price-rows">
                      <strong>سطرهای قیمت این بچ</strong>
                      <span>سطر اولیه · {formatNumber(originalBase)} {outputBaseUnit} · {formatMoney(record.unitCost, state.settings.currency)} برای هر واحد پایه</span>
                      {(record.priceRevisions || []).map(revision => (
                        <span key={revision.id}>به‌روزرسانی {revision.effectiveDate} · {formatNumber(revision.quantityBase)} {outputBaseUnit} · {formatMoney(revision.unitCost, state.settings.currency)} برای هر واحد پایه</span>
                      ))}
                    </div>
                    {record.pieceWeight ? <span>وزن واقعی: {formatNumber(record.pieceWeight)} {record.pieceWeightUnit || "گرم"}</span> : null}
                    {record.wastePercent ? <span>پرت: {formatNumber(record.wastePercent)}٪</span> : null}
                    <span>مواد واقعی: {(record.materialUsage || []).map(usage => `${formatNumber(usage.actualQuantity)} ${usage.unit}`).join("، ") || "ثبت نشده"}</span>
                    <span>توضیح: {record.note || "بدون توضیح"}</span>
                    <div className="form-actions">
                      <button type="button" className="text-button" onClick={() => loadProductionRecord(record, displayFormula)}>ویرایش این بچ</button>
                      <button type="button" className="text-button" onClick={() => refreshProductionPrice(record, displayFormula)}>به‌روزرسانی قیمت بخشی</button>
                      <button type="button" className="button button-danger button-small" onClick={() => deleteProductionRecord(record)}>حذف و اصلاح موجودی</button>
                    </div>
                  </div>
                </details>
              );
            })
          ) : (
            <EmptyState title="بچی ثبت نشده" description="پس از فشردن کلید تولید، هر اجرا در این دفتر مستقل ثبت می‌شود." />
          )}
        </div>
      </div>
      {productionDialog && (
        <Dialog
          title={`تولید: ${productionDialog.formula.name}`}
          onClose={() => setProductionDialog(null)}
        >
          <form className="form-grid" onSubmit={produceFormula}>
            <label>
              مقدار تولید
              <input
                inputMode="decimal"
                value={productionDialog.quantity}
                onChange={event =>
                  setProductionDialog({
                    ...productionDialog,
                    quantity: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              واحد خروجی
              <select
                value={productionDialog.unit}
                onChange={event =>
                  setProductionDialog({
                    ...productionDialog,
                    unit: event.target.value,
                  })
                }
              >
                {[
                  productionDialog.formula.outputUnit,
                  "عدد",
                  "کارتن",
                  "کیلوگرم",
                  "گرم",
                ]
                  .filter(
                    (unit, index, units) =>
                      unit && units.indexOf(unit) === index
                  )
                  .map(unit => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              شماره بچ / پج نامبر
              <input
                value={productionDialog.batchNumber}
                onChange={event => setProductionDialog({ ...productionDialog, batchNumber: event.target.value })}
                required
              />
            </label>
            <label>
              وزن واقعی هر قطعه
              <input
                inputMode="decimal"
                value={productionDialog.pieceWeight}
                onChange={event => setProductionDialog({ ...productionDialog, pieceWeight: event.target.value })}
                placeholder="اختیاری"
              />
            </label>
            <label>
              واحد وزن
              <select value={productionDialog.pieceWeightUnit} onChange={event => setProductionDialog({ ...productionDialog, pieceWeightUnit: event.target.value })}>
                <option value="گرم">گرم</option>
                <option value="کیلوگرم">کیلوگرم</option>
              </select>
            </label>
            <label>
              پرت تولید (%)
              <input
                inputMode="decimal"
                value={productionDialog.wastePercent}
                onChange={event => setProductionDialog({ ...productionDialog, wastePercent: event.target.value })}
                placeholder="۰"
              />
            </label>
            {productionDialog.formula.materials.some(material =>
              state.products.find(product => product.id === material.productId)?.category === "بسته تولید"
            ) ? (
              <div className="production-section full-field">
                <strong>بسته‌های همراه این بچ</strong>
                <p className="muted-cell">همهٔ بسته‌ها همیشه در هر قطعه مصرف می‌شوند؛ تیک فقط تعیین می‌کند کدام بسته داخل وزن اعلام‌شدهٔ قطعه حساب شود.</p>
                {productionDialog.formula.materials.map(material => {
                  const product = state.products.find(item => item.id === material.productId);
                  if (product?.category !== "بسته تولید") return null;
                  const excluded = productionDialog.excludedMaterialIds.includes(material.id);
                  return (
                    <label className="production-row package-choice" key={material.id}>
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={event => setProductionDialog({
                          ...productionDialog,
                          excludedMaterialIds: event.target.checked
                            ? productionDialog.excludedMaterialIds.filter(id => id !== material.id)
                            : [...productionDialog.excludedMaterialIds, material.id],
                        })}
                      />
                      <span>{product.name} · {formatNumber(material.quantity)} {material.unit}</span>
                      <small>{excluded ? "بسته جدا از وزن اعلام‌شده" : "بسته داخل وزن اعلام‌شده"}</small>
                    </label>
                  );
                })}
              </div>
            ) : null}
            <div className="production-section full-field">
              <strong>اصلاحات مصرف همین بچ</strong>
              {productionDialog.formula.materials.map(material => {
                const product = state.products.find(item => item.id === material.productId);
                return (
                  <label className="production-row" key={material.id}>
                    <span>{product?.name || "ماده"} · اصلاح مثبت/منفی ({material.unit})</span>
                    <input
                      inputMode="decimal"
                      value={productionDialog.adjustments[material.id] || ""}
                      onChange={event => setProductionDialog({
                        ...productionDialog,
                        adjustments: { ...productionDialog.adjustments, [material.id]: event.target.value },
                      })}
                      placeholder="۰"
                    />
                  </label>
                );
              })}
            </div>
            <label className="full-field">
              توضیح بچ
              <textarea value={productionDialog.note} onChange={event => setProductionDialog({ ...productionDialog, note: event.target.value })} placeholder="علت اصلاح یا توضیح تولید" />
            </label>
            <p className="muted-cell">
              مواد اولیه طبق فرمول مصرف می‌شوند. اگر مادهٔ اولیه خود محصول یک
              فرمول باشد، مقدار لازم از آن فرمول ابتدا تولید خواهد شد.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setProductionDialog(null)}
              >
                انصراف
              </button>
              <button className="button button-primary" type="submit">
                <Check size={16} /> ثبت تولید
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function SettingsPage({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (next: AppState, message: string) => void;
}) {
  const [businessName, setBusinessName] = useState(state.settings.businessName);
  const [currencyCode, setCurrencyCode] = useState(
    state.settings.currencyCode || normalizeCurrencyCode(state.settings.currency)
  );
  const [dayBasis, setDayBasis] = useState(String(state.settings.dayBasis));
  const [units, setUnits] = useState(state.settings.units);
  const [unitDraft, setUnitDraft] = useState("");
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [feeRules, setFeeRules] = useState<BankFeeRule[]>(state.settings.bankFeeRules || []);
  const [editingFeeRule, setEditingFeeRule] = useState<string | null>(null);
  const [feeRuleDraft, setFeeRuleDraft] = useState({ name: "", accountId: "", percent: "", fixedAmount: "", minAmount: "", maxAmount: "" });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);
  const currentSecurity = state.settings.security;
  async function saveSecurity() {
    setSecurityNotice("");
    if (!password && !pin) {
      setSecurityNotice("برای تغییر، رمز عبور یا PIN جدید را وارد کنید.");
      return;
    }
    if (password) {
      const error = validatePassword(password);
      if (error) {
        setSecurityNotice(error);
        return;
      }
      if (password !== passwordConfirm) {
        setSecurityNotice("تکرار رمز عبور با رمز اصلی یکسان نیست.");
        return;
      }
    }
    if (pin) {
      const error = validatePin(pin);
      if (error) {
        setSecurityNotice(error);
        return;
      }
      if (pin !== pinConfirm) {
        setSecurityNotice("تکرار PIN با PIN اصلی یکسان نیست.");
        return;
      }
    }
    setSavingSecurity(true);
    try {
      const security = {
        ...(currentSecurity || {}),
        ...(password ? { password: await createCredential(password) } : {}),
        ...(pin ? { pin: await createCredential(pin) } : {}),
      };
      onSave(
        { ...state, settings: { ...state.settings, security } },
        "تنظیمات قفل محلی ذخیره شد"
      );
      setPassword("");
      setPasswordConfirm("");
      setPin("");
      setPinConfirm("");
      setSecurityNotice("قفل محلی فعال شد؛ دفعهٔ بعد رمز یا PIN لازم است.");
    } catch (error) {
      setSecurityNotice(error instanceof Error ? error.message : "ذخیرهٔ قفل ناموفق بود");
    } finally {
      setSavingSecurity(false);
    }
  }
  function removeSecurity(kind: "password" | "pin") {
    const next = { ...(currentSecurity || {}) };
    delete next[kind];
    const security = next.password || next.pin ? next : undefined;
    onSave(
      { ...state, settings: { ...state.settings, security } },
      kind === "password" ? "رمز عبور حذف شد" : "PIN حذف شد"
    );
    setSecurityNotice("روش انتخاب‌شده حذف شد.");
  }
  function saveUnit() {
    const value = unitDraft.trim();
    if (!value) return;
    if (editingUnit) {
      setUnits(current =>
        current.map(unit => (unit === editingUnit ? value : unit))
      );
    } else if (!units.includes(value)) {
      setUnits(current => [...current, value]);
    }
    setUnitDraft("");
    setEditingUnit(null);
  }
  function saveFeeRule() {
    const name = feeRuleDraft.name.trim();
    if (!name) return;
    const rule: BankFeeRule = {
      id: editingFeeRule || createId("bank-fee-rule"),
      name,
      accountId: feeRuleDraft.accountId || undefined,
      active: true,
      percent: Math.max(0, Number(feeRuleDraft.percent) || 0),
      fixedAmount: Math.max(0, Number(feeRuleDraft.fixedAmount) || 0),
      minAmount: feeRuleDraft.minAmount ? Math.max(0, Number(feeRuleDraft.minAmount) || 0) : undefined,
      maxAmount: feeRuleDraft.maxAmount ? Math.max(0, Number(feeRuleDraft.maxAmount) || 0) : undefined,
    };
    setFeeRules(current => editingFeeRule ? current.map(item => item.id === editingFeeRule ? { ...rule, active: item.active } : item) : [...current, rule]);
    setFeeRuleDraft({ name: "", accountId: "", percent: "", fixedAmount: "", minAmount: "", maxAmount: "" });
    setEditingFeeRule(null);
  }
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="تنظیمات برنامه"
        title="مشخصات و تنظیمات کارگاه"
        description="تنظیمات عمومی برنامه مستقل از عملیات بکاپ و بازیابی مدیریت می‌شود."
      />
      <div className="panel settings-panel">
        <div className="backup-hero">
          <div className="backup-hero-icon">
            <Settings2 size={25} />
          </div>
          <div>
            <span className="section-kicker">تنظیمات عمومی</span>
            <h3>اطلاعات پایه کارگاه</h3>
            <p>
              این بخش فقط مشخصات و تنظیمات محاسباتی را تغییر می‌دهد؛ برای ذخیره
              و بازیابی داده به صفحهٔ «پشتیبان و بازیابی» بروید.
            </p>
          </div>
        </div>
        <div className="settings-form">
          <label>
            نام کارگاه
            <input
              value={businessName}
              onChange={event => setBusinessName(event.target.value)}
            />
          </label>
          <label>
            واحد پول
            <select
              value={currencyCode}
              onChange={event =>
                setCurrencyCode(normalizeCurrencyCode(event.target.value))
              }
            >
              <option value="IRT">تومان (IRT)</option>
              <option value="IRR">ریال (IRR)</option>
            </select>
          </label>
          <label>
            مبنای روزشمار هزینه دیرکرد
            <select
              value={dayBasis}
              onChange={event => setDayBasis(event.target.value)}
            >
              <option value="شمسی">تقویم شمسی واقعی (۳۱، ۳۰، ۲۹/۳۰)</option>
              <option value="30">ماه ثابت ۳۰ روزه</option>
              <option value="365">سال ثابت ۳۶۵ روزه</option>
            </select>
          </label>
        </div>
        <div className="settings-units">
          <button
            className="settings-folder"
            onClick={() => setUnitsOpen(open => !open)}
          >
            <div className="settings-folder-icon">
              <Boxes size={20} />
            </div>
            <div>
              <span className="section-kicker">واحدهای کالا</span>
              <h3>مدیریت واحدها</h3>
              <small>
                {formatNumber(units.length)} واحد ثبت شده · برای ورود انتخاب
                کنید
              </small>
            </div>
            <ChevronDown
              className={unitsOpen ? "folder-chevron open" : "folder-chevron"}
              size={18}
            />
          </button>
          {unitsOpen && (
            <div className="settings-units-content">
              <div className="unit-manager-form">
                <input
                  placeholder="نام واحد جدید"
                  value={unitDraft}
                  onChange={event => setUnitDraft(event.target.value)}
                />
                <button
                  className="button button-primary button-small"
                  onClick={saveUnit}
                >
                  {editingUnit ? "ذخیره اصلاح" : "افزودن واحد"}
                </button>
                {editingUnit && (
                  <button
                    className="button button-ghost button-small"
                    onClick={() => {
                      setEditingUnit(null);
                      setUnitDraft("");
                    }}
                  >
                    انصراف
                  </button>
                )}
              </div>
              <div className="unit-list">
                {units.map(unit => (
                  <div className="unit-row" key={unit}>
                    <span>{unit}</span>
                    <div>
                      <button
                        className="icon-button row-action"
                        title="ویرایش واحد"
                        onClick={() => {
                          setEditingUnit(unit);
                          setUnitDraft(unit);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button row-action"
                        title="حذف واحد"
                        onClick={() => {
                          if (
                            units.length > 1 &&
                            window.confirm(`واحد ${unit} حذف شود؟`)
                          )
                            setUnits(current =>
                              current.filter(item => item !== unit)
                            );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="security-settings">
          <div className="security-settings-heading">
            <div className="settings-folder-icon"><Percent size={20} /></div>
            <div>
              <span className="section-kicker">مغایرت‌گیری بانک</span>
              <h3>تعرفهٔ خودکار کارمزد انتقال</h3>
              <p>اصل مبلغ کامل به مقصد می‌رسد و کارمزد محاسبه‌شده فقط از حساب مبدأ کسر می‌شود.</p>
            </div>
          </div>
          <div className="settings-form">
            <label>نام تعرفه<input value={feeRuleDraft.name} onChange={event => setFeeRuleDraft({ ...feeRuleDraft, name: event.target.value })} placeholder="مثلاً انتقال بین‌بانکی" /></label>
            <label>حساب مبدأ<select value={feeRuleDraft.accountId} onChange={event => setFeeRuleDraft({ ...feeRuleDraft, accountId: event.target.value })}><option value="">همه حساب‌ها</option>{state.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>درصد کارمزد<input inputMode="decimal" value={feeRuleDraft.percent} onChange={event => setFeeRuleDraft({ ...feeRuleDraft, percent: event.target.value })} placeholder="مثلاً ۰٫۰۵" /></label>
            <label>مبلغ ثابت<input inputMode="numeric" value={feeRuleDraft.fixedAmount} onChange={event => setFeeRuleDraft({ ...feeRuleDraft, fixedAmount: event.target.value })} placeholder="تومان" /></label>
            <label>حداقل کارمزد<input inputMode="numeric" value={feeRuleDraft.minAmount} onChange={event => setFeeRuleDraft({ ...feeRuleDraft, minAmount: event.target.value })} placeholder="اختیاری" /></label>
            <label>حداکثر کارمزد<input inputMode="numeric" value={feeRuleDraft.maxAmount} onChange={event => setFeeRuleDraft({ ...feeRuleDraft, maxAmount: event.target.value })} placeholder="اختیاری" /></label>
          </div>
          <p className="muted-cell">فرمول: مبلغ ثابت + (مبلغ انتقال × درصد ÷ ۱۰۰)، سپس حداقل و حداکثر اعمال می‌شود.</p>
          <div className="security-actions"><button className="button button-primary" type="button" onClick={saveFeeRule}>{editingFeeRule ? "ذخیره اصلاح تعرفه" : "افزودن تعرفه"}</button>{editingFeeRule && <button className="button button-ghost" type="button" onClick={() => { setEditingFeeRule(null); setFeeRuleDraft({ name: "", accountId: "", percent: "", fixedAmount: "", minAmount: "", maxAmount: "" }); }}>انصراف</button>}</div>
          <div className="unit-list">{feeRules.length ? feeRules.map(rule => <div className="unit-row" key={rule.id}><span><strong>{rule.name}</strong><small className="table-subline">{rule.accountId ? state.accounts.find(account => account.id === rule.accountId)?.name || "حساب حذف‌شده" : "همه حساب‌ها"} · {rule.percent}% + {formatMoney(rule.fixedAmount, state.settings.currency)}{rule.active ? " · فعال" : " · غیرفعال"}</small></span><div><button className="icon-button row-action" type="button" title="ویرایش تعرفه" onClick={() => { setEditingFeeRule(rule.id); setFeeRuleDraft({ name: rule.name, accountId: rule.accountId || "", percent: String(rule.percent), fixedAmount: String(rule.fixedAmount), minAmount: rule.minAmount === undefined ? "" : String(rule.minAmount), maxAmount: rule.maxAmount === undefined ? "" : String(rule.maxAmount) }); }}><Pencil size={14} /></button><button className="icon-button row-action" type="button" title="فعال/غیرفعال کردن" onClick={() => setFeeRules(current => current.map(item => item.id === rule.id ? { ...item, active: !item.active } : item))}><Check size={14} /></button><button className="icon-button row-action" type="button" title="حذف تعرفه" onClick={() => { if (window.confirm(`تعرفه ${rule.name} حذف شود؟`)) setFeeRules(current => current.filter(item => item.id !== rule.id)); }}><Trash2 size={14} /></button></div></div>) : <p className="muted-cell">هنوز تعرفه‌ای ثبت نشده است؛ در این حالت کارمزد صفر یا دستی خواهد بود.</p>}</div>
        </div>
        <div className="security-settings">
          <div className="security-settings-heading">
            <div className="settings-folder-icon"><LockKeyhole size={20} /></div>
            <div>
              <span className="section-kicker">حفاظت از دستگاه</span>
              <h3>رمز عبور و PIN</h3>
              <p>قفل محلی هنگام بازشدن برنامه فعال می‌شود. متن رمزها ذخیره نمی‌شود؛ فقط hash امن آن‌ها نگهداری می‌شود.</p>
            </div>
          </div>
          <div className="security-status-row">
            <span>وضعیت فعلی</span>
            <strong>{hasLocalCredential(currentSecurity) ? "قفل محلی فعال است" : "بدون قفل محلی"}</strong>
          </div>
          <div className="settings-form security-form">
            <label>
              رمز عبور جدید
              <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="حداقل ۸ نویسه" />
            </label>
            <label>
              تکرار رمز عبور
              <input type="password" autoComplete="new-password" value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} placeholder="تکرار رمز عبور" />
            </label>
            <label>
              PIN جدید
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={event => setPin(event.target.value)} placeholder="۴ تا ۸ رقم" />
            </label>
            <label>
              تکرار PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pinConfirm} onChange={event => setPinConfirm(event.target.value)} placeholder="تکرار PIN" />
            </label>
          </div>
          {securityNotice && <p className="form-error security-notice">{securityNotice}</p>}
          <div className="security-actions">
            <button className="button button-primary" type="button" onClick={() => void saveSecurity()} disabled={savingSecurity}>
              <LockKeyhole size={16} /> {savingSecurity ? "در حال ذخیره…" : "ذخیره رمز و PIN"}
            </button>
            {currentSecurity?.password && <button className="button button-ghost" type="button" onClick={() => removeSecurity("password")}>حذف رمز عبور</button>}
            {currentSecurity?.pin && <button className="button button-ghost" type="button" onClick={() => removeSecurity("pin")}>حذف PIN</button>}
          </div>
          <p className="muted-cell">این قابلیت قفل محلی همین مرورگر است؛ فایل backup رمزگذاری نمی‌شود و برای پرتال مشتری یا احراز هویت آنلاین استفاده نمی‌شود.</p>
        </div>
        <div className="form-actions">
          <button
            className="button button-primary"
            onClick={() =>
              onSave(
                {
                  ...state,
                  settings: {
                    ...state.settings,
                    businessName: businessName.trim() || "کارگاه من",
                    currency: currencyLabel(currencyCode),
                    currencyCode,
                    dayBasis:
                      dayBasis === "شمسی"
                        ? "شمسی"
                        : Math.max(1, Number(dayBasis) || 30),
                    units,
                    bankFeeRules: feeRules,
                  },
                },
                "تنظیمات برنامه ذخیره شد"
              )
            }
          >
            ذخیره تنظیمات
          </button>
        </div>
      </div>
    </div>
  );
}

function BackupPage({
  state,
  onExport,
  onImport,
  onManualImport,
  onClearAll,
  onDriveRestore,
  onDriveUpload,
  driveBackups,
  driveLoading,
  onDriveRefresh,
  driveClientId,
  onDriveConnect,
  dropboxBackups,
  dropboxLoading,
  onDropboxRefresh,
  onDropboxUpload,
  onDropboxRestore,
  dropboxAppKey,
  onDropboxConnect,
  onDropboxDisconnect,
  snapshotRevision,
  onRestoreSnapshot,
  onDeleteSnapshot,
}: {
  state: AppState;
  onExport: () => void;
  onImport: () => void;
  onManualImport: (payload: string) => void;
  onClearAll: () => void;
  onDriveRestore: (fileId?: string) => void;
  onDriveUpload: () => void;
  driveBackups: DriveBackupFile[];
  driveLoading: boolean;
  onDriveRefresh: () => void;
  driveClientId: string;
  onDriveConnect: (clientId: string) => void;
  dropboxBackups: DropboxBackupFile[];
  dropboxLoading: boolean;
  onDropboxRefresh: () => void;
  onDropboxUpload: () => void;
  onDropboxRestore: (fileId: string) => void;
  dropboxAppKey: string;
  onDropboxConnect: (appKey: string) => void;
  onDropboxDisconnect: () => void | Promise<void>;
  snapshotRevision: number;
  onRestoreSnapshot: (snapshot: RestoreSnapshot) => void;
  onDeleteSnapshot: (snapshot: RestoreSnapshot) => void;
}) {
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [manualPayload, setManualPayload] = useState("");
  const [driveQuery, setDriveQuery] = useState("");
  const [driveSort, setDriveSort] = useState<"newest" | "oldest" | "largest">(
    "newest"
  );
  const [clientIdDraft, setClientIdDraft] = useState(driveClientId);
  const [dropboxAppKeyDraft, setDropboxAppKeyDraft] = useState(dropboxAppKey);
  const [snapshots, setSnapshots] = useState<RestoreSnapshot[]>(() =>
    listRestoreSnapshots()
  );
  useEffect(() => {
    setSnapshots(listRestoreSnapshots());
  }, [snapshotRevision]);
  const recordCount =
    state.people.length +
    state.products.length +
    state.transactions.length +
    state.checks.length +
    state.invoices.length;
  const visibleDriveBackups = useMemo(
    () =>
      driveBackups
        .filter(file =>
          file.name.toLowerCase().includes(driveQuery.trim().toLowerCase())
        )
        .sort((a, b) => {
          if (driveSort === "largest")
            return Number(b.size || 0) - Number(a.size || 0);
          const aTime = a.modifiedTime || "";
          const bTime = b.modifiedTime || "";
          return driveSort === "newest"
            ? bTime.localeCompare(aTime)
            : aTime.localeCompare(bTime);
        }),
    [driveBackups, driveQuery, driveSort]
  );
  return (
    <div className="page-stack page-enter">
      <PageIntro
        kicker="امنیت و تداوم داده"
        title="پشتیبان و تنظیمات"
        description="اطلاعات را روی دستگاه نگه دارید و هر زمان خواستید یک نسخهٔ قابل انتقال بسازید."
      />
      <div className="backup-grid">
        <div className="panel backup-main">
          <div className="backup-hero">
            <div className="backup-hero-icon">
              <ShieldCheck size={25} />
            </div>
            <div>
              <span className="section-kicker">وضعیت ذخیره‌سازی</span>
              <h3>اطلاعات شما محلی و آمادهٔ پشتیبان‌گیری است</h3>
              <p>
                آخرین تغییر در همین مرورگر ذخیره می‌شود. برای اطمینان، مرتب یک
                فایل JSON خروجی بگیرید. این فایل شامل همهٔ اطلاعات ورودی و
                تنظیمات قابل انتقال به نسخه‌های بعدی برنامه است.
              </p>
            </div>
          </div>
          <div className="backup-scope-note">
            <strong>محتوای کامل پشتیبان</strong>
            <span>
              طرف حساب‌ها، کالاها، انبارها، تاریخچه قیمت، شرایط پرداخت،
              فاکتورها، عملیات مالی، چک‌ها، حساب‌های بانکی، تنظیمات و حسابرسی
            </span>
            <small>
              نسخهٔ قالب پشتیبان: ۲ · بازیابی با نرمال‌سازی و مهاجرت نسخه‌ای
            </small>
          </div>
          <div className="backup-actions">
            <button className="backup-action" onClick={onExport}>
              <span className="backup-action-icon mint">
                <CloudUpload size={20} />
              </span>
              <span>
                <strong>ساخت پشتیبان جدید</strong>
                <small>دانلود فایل کامل اطلاعات</small>
              </span>
              <ArrowLeftRight size={16} />
            </button>
            <button className="backup-action" onClick={onImport}>
              <span className="backup-action-icon violet">
                <CloudDownload size={20} />
              </span>
              <span>
                <strong>بازیابی از فایل</strong>
                <small>اعتبارسنجی قبل از جایگزینی</small>
              </span>
              <ArrowLeftRight size={16} />
            </button>
          </div>
          <div className="manual-restore-box">
            <strong>بازیابی دستی در گوشی یا مرورگر دیگر</strong>
            <p>
              اگر Drive در این مرورگر مجوز موقت ندارد، فایل JSON را از Drive
              دانلود کنید و متن آن را اینجا بچسبانید.
            </p>
            <textarea
              value={manualPayload}
              onChange={event => setManualPayload(event.target.value)}
              placeholder="محتوای فایل backup-accounting-....json را اینجا Paste کنید"
              rows={4}
            />
            <button
              className="button button-primary"
              disabled={!manualPayload.trim()}
              onClick={() => onManualImport(manualPayload)}
            >
              اعتبارسنجی و بازیابی متن
            </button>
          </div>
          <div className="local-snapshots-box">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Rollback points</span>
                <h3>snapshotهای محلی پیش از بازیابی</h3>
              </div>
              <span className="soft-tag">{formatNumber(snapshots.length)} نسخه</span>
            </div>
            <p className="muted-cell">
              قبل از هر بازیابی موفق، وضعیت قبلی اینجا نگهداری می‌شود. snapshotها
              فقط روی همین دستگاه هستند و به Google Drive ارسال نمی‌شوند.
            </p>
            {snapshots.length ? (
              <div className="local-snapshot-list">
                {snapshots.map(snapshot => (
                  <div className="local-snapshot-row" key={snapshot.id}>
                    <div>
                      <strong>{formatDate(snapshot.createdAt.slice(0, 10))}</strong>
                      <small>
                        {new Date(snapshot.createdAt).toLocaleTimeString("fa-IR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} · {formatNumber(snapshot.size)} بایت
                      </small>
                    </div>
                    <div className="row-actions">
                      <button
                        className="button button-primary button-small"
                        onClick={() => onRestoreSnapshot(snapshot)}
                      >
                        بازیابی
                      </button>
                      <button
                        className="icon-button danger"
                        title="حذف snapshot"
                        onClick={() => onDeleteSnapshot(snapshot)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <small className="drive-empty">هنوز snapshot پیش از بازیابی ساخته نشده است.</small>
            )}
          </div>
          <div className="danger-zone">
            <div>
              <strong>حذف همه اطلاعات کسب‌وکار</strong>
              <small>
                ابتدا یک فایل JSON دانلود می‌شود؛ سپس طرف حساب‌ها، کالاها،
                فاکتورها، عملیات و چک‌ها پاک می‌شوند.
              </small>
            </div>
            <button
              className="button button-danger"
              onClick={() => {
                setClearOpen(true);
                setConfirmation("");
              }}
            >
              <Trash2 size={15} /> حذف همه اطلاعات
            </button>
          </div>
          {clearOpen && (
            <div className="clear-confirm-panel">
              <strong>این عملیات قابل بازگشت مستقیم نیست</strong>
              <p>
                برای ادامه عبارت <b>حذف کامل</b> را وارد کنید. قبل از پاک‌سازی،
                بکاپ JSON به‌صورت خودکار دانلود خواهد شد.
              </p>
              <input
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                placeholder="حذف کامل"
                aria-label="تأیید حذف کامل"
              />
              <div className="form-actions">
                <button
                  className="button button-ghost"
                  onClick={() => setClearOpen(false)}
                >
                  انصراف
                </button>
                <button
                  className="button button-danger"
                  disabled={confirmation !== "حذف کامل"}
                  onClick={() => {
                    onClearAll();
                    setClearOpen(false);
                  }}
                >
                  پاک‌سازی {formatNumber(recordCount)} رکورد
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="panel cloud-panel">
          <div className="cloud-illustration">
            <Cloud size={28} />
          </div>
          <span className="section-kicker">اتصال ابری اختیاری</span>
          <h3>پشتیبان روی Google Drive</h3>
          <p>
            این قابلیت فقط زمانی کار می‌کند که همین مرورگر مجوز OAuth موقت Drive
            داشته باشد. پشتیبان محلی همچنان بدون وابستگی به اینترنت کار می‌کند.
          </p>
          <div className="drive-auth-box">
            <strong>اتصال امن این مرورگر</strong>
            <small>
              Client ID از نوع Web را از Google Cloud وارد کنید؛ این مقدار رمز
              نیست و توکن دسترسی در فایل پشتیبان ذخیره نمی‌شود.
            </small>
            <input
              value={clientIdDraft}
              onChange={event => setClientIdDraft(event.target.value)}
              placeholder="Google OAuth Web Client ID"
              dir="ltr"
            />
            <button
              className="button button-primary"
              onClick={() => onDriveConnect(clientIdDraft)}
              disabled={!clientIdDraft.trim()}
            >
              اتصال به Google Drive
            </button>
            <small>
              دسترسی در هر نشست کوتاه‌مدت است؛ در صورت انقضا دوباره اتصال را
              بزنید.
            </small>
          </div>
          <div className="drive-path-card">
            <strong>حسابداری کارگاه — پشتیبان‌های PWA</strong>
            <small>زیرپوشه: نسخه‌های پشتیبان JSON</small>
          </div>
          <div className="form-actions">
            <button className="button button-primary" onClick={onDriveUpload}>
              <CloudUpload size={15} /> ذخیره در Drive
            </button>
            <button
              className="button button-ghost"
              onClick={onDriveRefresh}
              disabled={driveLoading}
            >
              <RefreshCw size={15} className={driveLoading ? "spin" : ""} />{" "}
              {driveLoading ? "در حال خواندن" : "تازه‌سازی فهرست"}
            </button>
            <a
              className="button button-primary"
              href={PROJECT_BACKUPS_FOLDER_URL}
              target="_blank"
              rel="noreferrer"
            >
              مشاهده نسخه‌های پشتیبان
            </a>
            <a
              className="button button-ghost"
              href={PROJECT_DRIVE_FOLDER_URL}
              target="_blank"
              rel="noreferrer"
            >
              پوشه اصلی پروژه
            </a>
          </div>
          <div className="drive-backup-list">
            <div className="drive-list-toolbar">
              <input
                value={driveQuery}
                onChange={event => setDriveQuery(event.target.value)}
                placeholder="جست‌وجوی نام فایل"
                aria-label="جست‌وجوی نسخه پشتیبان"
              />
              <select
                value={driveSort}
                onChange={event =>
                  setDriveSort(event.target.value as typeof driveSort)
                }
                aria-label="مرتب‌سازی نسخه‌ها"
              >
                <option value="newest">جدیدترین</option>
                <option value="oldest">قدیمی‌ترین</option>
                <option value="largest">بیشترین حجم</option>
              </select>
            </div>
            {visibleDriveBackups.map(file => (
              <div className="drive-backup-row" key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <small>
                    {file.modifiedTime
                      ? formatDate(file.modifiedTime.slice(0, 10))
                      : "نسخهٔ پشتیبان"}{" "}
                    · {formatNumber(Number(file.size) || 0)} بایت
                  </small>
                </div>
                <button
                  className="button button-primary"
                  onClick={() => onDriveRestore(file.id)}
                >
                  بازیابی
                </button>
              </div>
            ))}
            {!visibleDriveBackups.length && (
              <small className="drive-empty">
                نسخه‌ای با این نام پیدا نشد.
              </small>
            )}
          </div>
          <div className="drive-path-card dropbox-backup-card">
            <strong>پشتیبان روی Dropbox</strong>
            <small>
              همان فایل یکپارچهٔ JSON با نام مستقل Dropbox در مسیر شمسی
              ‎/backups/سال/ماه‎ ذخیره می‌شود؛ فایل‌های Drive و Dropbox با هم قابل بازیابی هستند.
            </small>
            <label>
              App key عمومی Dropbox
              <input
                value={dropboxAppKeyDraft}
                onChange={event => setDropboxAppKeyDraft(event.target.value)}
                placeholder="Dropbox App key"
                dir="ltr"
              />
            </label>
            <div className="form-actions">
              <button
                className="button button-primary"
                onClick={() => onDropboxConnect(dropboxAppKeyDraft)}
                disabled={!dropboxAppKeyDraft.trim()}
              >
                اتصال به Dropbox
              </button>
              {isDropboxConnected() && (
                <button className="button button-ghost" onClick={() => void onDropboxDisconnect()}>
                  قطع اتصال
                </button>
              )}
            </div>
            <small>
              در Dropbox App Console باید دسترسی‌های files.metadata.read، files.content.read و files.content.write فعال باشند.
              کلید خصوصی در برنامه یا فایل پشتیبان ذخیره نمی‌شود.
            </small>
          </div>
          <div className="form-actions">
            <button className="button button-primary" onClick={onDropboxUpload} disabled={dropboxLoading || !isDropboxConnected()}>
              <CloudUpload size={15} /> ذخیره در Dropbox
            </button>
            <button className="button button-ghost" onClick={onDropboxRefresh} disabled={dropboxLoading || !isDropboxConnected()}>
              <RefreshCw size={15} className={dropboxLoading ? "spin" : ""} /> {dropboxLoading ? "در حال خواندن" : "تازه‌سازی فهرست"}
            </button>
          </div>
          <div className="drive-backup-list">
            {dropboxBackups.map(file => (
              <div className="drive-backup-row" key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <small>
                    {file.modifiedTime ? formatDate(file.modifiedTime.slice(0, 10)) : "نسخهٔ پشتیبان"} · {formatNumber(Number(file.size) || 0)} بایت
                  </small>
                </div>
                <button className="button button-primary" onClick={() => onDropboxRestore(file.id)}>
                  بازیابی
                </button>
              </div>
            ))}
            {!dropboxBackups.length && <small className="drive-empty">هنوز نسخه‌ای از Dropbox خوانده نشده است.</small>}
          </div>
          <span className="coming-tag">
            نام نسخه‌های جدید: تاریخ شمسی امروز ({todayJalali()}) + شمارهٔ ردیف
            سه‌رقمی؛ نسخه‌های قبلی حذف نمی‌شوند.
          </span>
        </div>
      </div>
      <div className="data-health">
        <div>
          <span className="health-dot" />
          <strong>داده سالم است</strong>
          <small>
            {formatNumber(
              state.people.length +
                state.products.length +
                state.transactions.length +
                state.checks.length
            )}{" "}
            رکورد قابل بازیابی
          </small>
        </div>
        <div>
          <FileJson size={18} />
          <span>نسخهٔ schema: ۱</span>
        </div>
        <div>
          <RefreshCw size={18} />
          <span>revision: {formatNumber(state.revision)}</span>
        </div>
      </div>
    </div>
  );
}

function PageIntro({
  kicker,
  title,
  description,
  actionLabel,
  onAction,
}: {
  kicker: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="page-intro">
      <div>
        <span className="eyebrow accent-eyebrow">{kicker}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button className="button button-primary" onClick={onAction}>
          <Plus size={18} />
          {actionLabel}
        </button>
      )}
    </section>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={e => e.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <span className="section-kicker">فرم ثبت</span>
            <h3>{title}</h3>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function QuickAdd({
  onClose,
  people,
  currency,
  onSave,
}: {
  onClose: () => void;
  people: AppState["people"];
  currency: string;
  onSave: (input: {
    type: TransactionType;
    amount: number;
    partyId?: string;
    note: string;
    date: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    type: "دریافت" as TransactionType,
    amount: "",
    partyId: "",
    note: "",
    date: todayJalali(),
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseLocalizedNumber(form.amount);
    if (!amount) return;
    onSave({
      type: form.type,
      amount,
      partyId: form.partyId || undefined,
      note: form.note,
      date: form.date,
    });
  }
  return (
    <Dialog title="ثبت عملیات جدید" onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <div className="operation-type-grid">
          {(
            [
              "دریافت",
              "پرداخت",
              "فروش",
              "خرید",
              "هزینه",
              "درآمد",
            ] as TransactionType[]
          ).map(type => (
            <button
              type="button"
              key={type}
              className={`type-choice ${form.type === type ? "selected" : ""}`}
              onClick={() => setForm({ ...form, type })}
            >
              {type}
            </button>
          ))}
        </div>
        <label>
          مبلغ ({currency})
          <input
            autoFocus
            inputMode="numeric"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            placeholder="مثلاً ۵۰۰۰۰۰۰۰"
          />
        </label>
        <label>
          تاریخ جلالی
          <JalaliDatePicker
            value={form.date}
            onChange={date => setForm({ ...form, date })}
          />
        </label>
        <label>
          طرف حساب
          <select
            value={form.partyId}
            onChange={e => setForm({ ...form, partyId: e.target.value })}
          >
            <option value="">بدون طرف حساب</option>
            {people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          توضیحات
          <input
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
            placeholder="اختیاری"
          />
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >
            انصراف
          </button>
          <button className="button button-primary" type="submit">
            <Check size={17} />
            ذخیره عملیات
          </button>
        </div>
      </form>
    </Dialog>
  );
}
