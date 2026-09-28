export const CURRENT_SCHEMA_VERSION = 5;
export const BACKUP_FORMAT_VERSION = 5;
export const DEFAULT_CURRENCY_CODE = "IRT" as const;
export type CurrencyCode = "IRT" | "IRR";

export function normalizeCurrencyCode(value: unknown): CurrencyCode {
  if (value === "IRR" || value === "ریال") return "IRR";
  return DEFAULT_CURRENCY_CODE;
}

export function currencyLabel(code: CurrencyCode | string | undefined) {
  return normalizeCurrencyCode(code) === "IRR" ? "ریال" : "تومان";
}

export type PageId =
  | "dashboard"
  | "vendorDirectory"
  | "invoices"
  | "transactions"
  | "payroll"
  | "banks"
  | "people"
  | "inventory"
  | "production"
  | "prices"
  | "paymentRules"
  | "checks"
  | "monthClose"
  | "reports"
  | "backup"
  | "settings";

export type PersonType = "مشتری" | "تأمین‌کننده" | "شریک" | "کارگر" | "کارمند" | "سایر";
export const PERSON_TYPES: PersonType[] = [
  "مشتری",
  "تأمین‌کننده",
  "شریک",
  "کارگر",
  "کارمند",
  "سایر",
];
export const UNIT_OPTIONS = [
  "عدد",
  "کیلوگرم",
  "گرم",
  "تن",
  "متر",
  "سانتی‌متر",
  "مترمربع",
  "مترمکعب",
  "لیتر",
  "گالن",
  "کیسه",
  "بسته",
  "کارتن",
  "پالت",
  "حلقه",
  "شاخه",
  "دست",
  "سرویس",
  "دستگاه",
  "ساعت",
  "روز",
  "ماه",
  "سایر",
] as const;
export type PriceScope = "عمومی" | "اختصاصی";

export interface Warehouse {
  id: string;
  name: string;
  note: string;
}

export interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  quantityBase?: number;
  conversionRate?: number;
  /** Snapshot of the base unit and price meaning used when this row was saved. */
  baseUnit?: string;
  priceBasis?: "baseUnit";
  /** بهای تمام‌شدهٔ هر واحد پایه در زمان ثبت فروش؛ برای سود ظاهری. */
  unitCostAtSale?: number;
}
export interface CheckAllocation {
  checkId: string;
  amount: number;
  principalAmount?: number;
  profit?: number;
  days?: number;
  allocatedAt: string;
}
export interface Invoice {
  id: string;
  number: string;
  type: "فروش" | "خرید";
  date: string;
  partyId?: string;
  paymentRuleId?: string;
  priceHistoryId?: string;
  items: InvoiceItem[];
  allocations: CheckAllocation[];
  discountAmount?: number;
  amount: number;
  paidAmount: number;
  status: "باز" | "تسویه جزئی" | "تسویه شده" | "باطل";
  note: string;
}

export type PurchasePaymentMethod = "نقدی" | "چک مشتری" | "چک شریک" | "حساب داخلی";

export interface PurchasePayment {
  id: string;
  supplierId: string;
  amount: number;
  feeAmount?: number;
  date: string;
  method: PurchasePaymentMethod;
  accountId?: string;
  customerCheckId?: string;
  issuedCheckId?: string;
  note: string;
}

export interface PurchasePayableAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  allocatedAt: string;
}

export type IssuedCheckStatus = "صادر شده" | "سررسید شده" | "پرداخت شده" | "برگشتی" | "باطل";

export interface IssuedCheck {
  id: string;
  number: string;
  issuerPartyId: string;
  beneficiaryPartyId?: string;
  purchaseInvoiceId?: string;
  dateIssued: string;
  dueDate: string;
  amount: number;
  status: IssuedCheckStatus;
  purpose: "خرید" | "بدهی" | "تعمیرات" | "نگهداری" | "سایر";
  bankName?: string;
  note: string;
}

export type PartnerObligationEventKind = "due" | "paid" | "returned" | "reversal";

export interface PartnerObligationEvent {
  id: string;
  issuedCheckId: string;
  partnerId: string;
  date: string;
  kind: PartnerObligationEventKind;
  amount: number;
  reversalOf?: string;
  note: string;
}

export type TransactionType =
  | "فروش"
  | "خرید"
  | "دریافت"
  | "پرداخت"
  | "هزینه"
  | "درآمد"
  | "اصلاحیه"
  | "انتقال بین حساب‌ها"
  | "خرید کالا"
  | "فروش کالا"
  | "هزینه/خرید توسط شریک"
  | "دریافت توسط شریک"
  | "مساعده/پرداخت به شریک"
  | "دریافت تسویه از شریک"
  | "پرداخت حقوق";
export type PartnerSettlementDirection =
  | "پرداخت بدهی کارگاه به شریک"
  | "دریافت طلب کارگاه از شریک";
export type CheckStatus =
  | "نزد ما"
  | "وصول شده"
  | "تودیع شده"
  | "برگشتی"
  | "عودت داده شده"
  | "جایگزین شده"
  | "باطل"
  | "خرج شده";

export interface Person {
  id: string;
  code: string;
  name: string;
  type: PersonType;
  defaultPaymentRuleId?: string;
  roles: PersonType[];
  phone: string;
  balance: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit2?: string;
  conversionRate?: number;
  warehouseId?: string;
  stock: number;
  minStock: number;
  price: number;
  category?: "مواد اولیه" | "محصول تولیدی" | "بسته تولید";
}

export interface ProductionMaterial {
  id: string;
  productId: string;
  quantity: number;
  unit: string;
}

export interface ProductionCost {
  id: string;
  title: string;
  amount: number;
}

export interface ProductionFormula {
  id: string;
  name: string;
  formulaType?: "قطعه" | "بسته تولید";
  outputProductId?: string;
  outputName?: string;
  outputQuantity: number;
  outputUnit: string;
  /** وزن مرجع هر واحد خروجی در فرمول، برای تولید وزن‌محور. */
  standardPieceWeight?: number;
  standardPieceWeightUnit?: string;
  materials: ProductionMaterial[];
  costs: ProductionCost[];
  note: string;
}

export interface ProductionMaterialUsage {
  materialId: string;
  productId: string;
  plannedQuantity: number;
  adjustmentQuantity: number;
  wasteQuantity: number;
  actualQuantity: number;
  unit: string;
  note?: string;
}

export interface ProductionPriceRevision {
  id: string;
  quantityBase: number;
  unitCost: number;
  totalCost: number;
  effectiveDate: string;
  note?: string;
}

export interface ProductionRecord {
  id: string;
  formulaId: string;
  date: string;
  outputQuantity: number;
  outputQuantityBase?: number;
  materialCost: number;
  overheadCost: number;
  totalCost: number;
  unitCost: number;
  batchNumber?: string;
  actualOutputQuantity?: number;
  actualOutputUnit?: string;
  pieceWeight?: number;
  pieceWeightUnit?: string;
  wastePercent?: number;
  materialUsage?: ProductionMaterialUsage[];
  includedMaterialIds?: string[];
  excludedMaterialIds?: string[];
  formulaRevision?: string;
  /** شناسه مشترک بچ اصلی و تمام بسته‌های خودکار همان اجرا. */
  executionId?: string;
  /** snapshot مستقل برای اینکه حذف/ویرایش موتور، سابقهٔ بچ را تغییر ندهد. */
  formulaSnapshot?: ProductionFormula;
  /** Price-only rows for a sold/remaining portion of the same physical batch. */
  priceRevisions?: ProductionPriceRevision[];
  outputProductId?: string;
  outputProductName?: string;
  note: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string;
  partyId?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  productId?: string;
  warehouseId?: string;
  quantity?: number;
  unit?: string;
  checkId?: string;
  partnerEffect?:
    | "افزایش طلب شریک"
    | "کاهش طلب شریک"
    | "افزایش طلب کارگاه از شریک"
    | "کاهش طلب کارگاه از شریک";
  settlementDirection?: PartnerSettlementDirection;
  referenceType?: "فاکتور خرید" | "چک" | "هزینه" | "سایر";
  referenceId?: string;
  referenceLabel?: string;
  amount: number;
  /** کارمزد بانکی جدا از مبلغ اصلی؛ برای انتقال از حساب مبدأ کسر می‌شود. */
  feeAmount?: number;
  feeSource?: "تعرفه" | "دستی" | "صورت‌حساب بانک";
  status: "ثبت شده" | "باطل";
  note: string;
}

export interface Check {
  id: string;
  number: string;
  partyId?: string;
  dueDate: string;
  receivedDate: string;
  /** تاریخ واقعی وصول؛ با سررسید یا تاریخ دریافت یکی فرض نمی‌شود. */
  collectedDate?: string;
  invoiceDate?: string;
  paymentRuleId?: string;
  amount: number;
  feeAmount?: number;
  status: CheckStatus;
  bank: string;
  bankAccountId?: string;
  returnPartyId?: string;
  replacementOf?: string;
  replacementIds?: string[];
  spentForPaymentId?: string;
  spentToPartyId?: string;
  note?: string;
}

export type PayrollStatus = "پرداخت‌شده" | "پرداختنی" | "باطل";

export interface PayrollRecord {
  id: string;
  date: string;
  period: string;
  employeeName: string;
  personId?: string;
  amount: number;
  feeAmount?: number;
  status: PayrollStatus;
  accountId?: string;
  transactionId?: string;
  paidAt?: string;
  note: string;
}

export interface Account {
  id: string;
  name: string;
  type: "بانک" | "صندوق" | "شریک";
  balance: number;
}

export interface BankFeeRule {
  id: string;
  name: string;
  accountId?: string;
  active: boolean;
  /** درصد به‌صورت ۰ تا ۱۰۰، مثلاً ۰٫۰۵ برای پنج صدم درصد. */
  percent: number;
  fixedAmount: number;
  minAmount?: number;
  maxAmount?: number;
}

export function calculateBankTransferFee(
  rules: BankFeeRule[] | undefined,
  accountId: string | undefined,
  amount: number
): { fee: number; rule?: BankFeeRule } {
  const value = Math.max(0, Number(amount) || 0);
  const activeRules = (rules || []).filter(item => item.active);
  const rule = activeRules.find(item => item.accountId && item.accountId === accountId)
    || activeRules.find(item => !item.accountId);
  if (!rule || !value) return { fee: 0, rule };
  const calculated = rule.fixedAmount + value * (rule.percent / 100);
  const bounded = Math.max(
    rule.minAmount ?? 0,
    rule.maxAmount === undefined ? calculated : Math.min(rule.maxAmount, calculated)
  );
  return { fee: Math.round(Math.max(0, bounded)), rule };
}

export interface PriceHistory {
  id: string;
  productId?: string;
  productName: string;
  scope: PriceScope;
  partyIds?: string[];
  effectiveDate: string;
  unit: string;
  price: number;
  /** Existing prices are interpreted as price per product base unit. */
  priceBasis?: "baseUnit";
  baseUnit?: string;
  note: string;
}

export interface PaymentRule {
  id: string;
  name: string;
  active: boolean;
  dayBasis: number;
  graceDays: number;
  tiers: Array<{ id: string; maxDays: number; rate: number; note: string }>;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  note: string;
}

export type InventoryEventKind =
  | "opening_balance"
  | "purchase"
  | "sale"
  | "production_input"
  | "production_output"
  | "adjustment"
  | "transfer"
  | "reversal";

export interface InventoryEvent {
  id: string;
  at: string;
  date: string;
  kind: InventoryEventKind;
  productId: string;
  warehouseId?: string;
  quantityEntered: number;
  unitEntered: string;
  quantityBase: number;
  baseUnit: string;
  sourceType: string;
  sourceId?: string;
  reversalOf?: string;
  note: string;
}

export type CashEventKind =
  | "opening_balance"
  | "adjustment"
  | "receipt"
  | "payment"
  | "expense"
  | "transfer"
  | "check_receipt"
  | "check_return"
  | "reversal";

export interface CashEvent {
  id: string;
  at: string;
  date: string;
  kind: CashEventKind;
  accountId: string;
  counterAccountId?: string;
  amount: number;
  currency: string;
  sourceType: string;
  sourceId?: string;
  reversalOf?: string;
  note: string;
}

export interface AppState {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  settings: {
    businessName: string;
    currency: string;
    currencyCode?: CurrencyCode;
    dayBasis: number | "شمسی";
    units: string[];
    bankFeeRules?: BankFeeRule[];
    security?: {
      password?: { salt: string; hash: string; iterations: number };
      pin?: { salt: string; hash: string; iterations: number };
    };
  };
  people: Person[];
  products: Product[];
  warehouses: Warehouse[];
  invoices: Invoice[];
  priceHistory: PriceHistory[];
  paymentRules: PaymentRule[];
  transactions: Transaction[];
  checks: Check[];
  accounts: Account[];
  audit: AuditEvent[];
  inventoryEvents: InventoryEvent[];
  cashEvents: CashEvent[];
  purchasePayments: PurchasePayment[];
  purchasePayableAllocations: PurchasePayableAllocation[];
  issuedChecks: IssuedCheck[];
  partnerObligationEvents: PartnerObligationEvent[];
  productionFormulas: ProductionFormula[];
  productionRecords: ProductionRecord[];
  payrollRecords: PayrollRecord[];
}

export interface ProductionExecutionResult {
  state: AppState;
  recordIds: string[];
}

export interface ProductionRunOptions {
  batchNumber?: string;
  pieceWeight?: number;
  pieceWeightUnit?: string;
  wastePercent?: number;
  materialAdjustments?: Record<string, number>;
  includedMaterialIds?: string[];
  excludedMaterialIds?: string[];
  note?: string;
}

export function calculateCurrentProductionUnitCost(
  state: AppState,
  formulaId: string,
  date = todayJalali(),
  visiting = new Set<string>()
): number {
  if (visiting.has(formulaId)) throw new Error("چرخه در فرمول‌های تولید پیدا شد");
  const formula = state.productionFormulas.find(item => item.id === formulaId);
  if (!formula || !formula.outputProductId) return 0;
  const output = state.products.find(item => item.id === formula.outputProductId);
  if (!output) return 0;
  const nextVisiting = new Set(visiting).add(formulaId);
  const pricePerBaseUnit = (product: Product): number => {
    const nested = state.productionFormulas.find(item => item.outputProductId === product.id);
    if (nested) return calculateCurrentProductionUnitCost(state, nested.id, date, nextVisiting);
    const latest = state.priceHistory
      .filter(item => item.productId === product.id && item.effectiveDate <= date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
    return (Number(latest?.price ?? product.price) || 0) /
      Math.max(0.000001, unitConversionToBase(product, latest?.unit || product.unit));
  };
  const materialTotal = formula.materials.reduce((sum, material) => {
    const product = state.products.find(item => item.id === material.productId);
    return sum + (product ? quantityInBase(product, material.quantity, material.unit) * pricePerBaseUnit(product) : 0);
  }, 0);
  const overhead = formula.costs.reduce((sum, cost) => sum + Math.max(0, Number(cost.amount) || 0), 0);
  const outputBase = quantityInBase(output, formula.outputQuantity, formula.outputUnit);
  return outputBase > 0 ? (materialTotal + overhead) / outputBase : 0;
}

export function refreshProductionRecordPrice(
  state: AppState,
  productionRecordId: string,
  quantityBase: number,
  date = todayJalali(),
  note = "به‌روزرسانی بخشی از بهای بچ"
): AppState {
  if (!Number.isFinite(quantityBase) || quantityBase <= 0) throw new Error("مقدار به‌روزرسانی باید بزرگ‌تر از صفر باشد");
  const record = state.productionRecords.find(item => item.id === productionRecordId);
  if (!record) throw new Error("رکورد تولید پیدا نشد");
  const totalBase = record.outputQuantityBase ?? record.outputQuantity;
  const revisedBase = (record.priceRevisions || []).reduce((sum, item) => sum + item.quantityBase, 0);
  if (quantityBase > totalBase - revisedBase + 0.000001) throw new Error("مقدار از بخش قیمت‌گذاری‌نشدهٔ بچ بیشتر است");
  const unitCost = calculateCurrentProductionUnitCost(state, record.formulaSnapshot?.id || record.formulaId, date);
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("بهای جدید فرمول قابل محاسبه نیست");
  const revision: ProductionPriceRevision = {
    id: createId("production-price"), quantityBase, unitCost,
    totalCost: quantityBase * unitCost, effectiveDate: date, note,
  };
  return {
    ...state,
    productionRecords: state.productionRecords.map(item =>
      item.id === productionRecordId ? { ...item, priceRevisions: [...(item.priceRevisions || []), revision] } : item
    ),
  };
}

/**
 * Produces a requested quantity from a formula. Package formulas used as
 * materials are produced recursively when their available stock is not
 * enough. All quantities are converted to the product base unit before stock
 * changes are applied.
 */
export function executeProduction(
  state: AppState,
  formulaId: string,
  outputQuantity: number,
  outputUnit?: string,
  date = todayJalali(),
  options: ProductionRunOptions = {}
): ProductionExecutionResult {
  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0)
    throw new Error("مقدار تولید باید بزرگ‌تر از صفر باشد");
  const products = state.products.map(product => ({ ...product }));
  const formulas = new Map(state.productionFormulas.map(item => [item.id, item]));
  const outputFormulaIds = new Map(
    state.productionFormulas
      .filter(item => item.outputProductId)
      .map(item => [item.outputProductId!, item.id])
  );
  const records: ProductionRecord[] = [];
  const executionId = createId("production-run");
  const visiting = new Set<string>();

  const productById = (id: string) => products.find(product => product.id === id);
  const computedUnitCosts = new Map<string, number>();
  const historicalUnitCost = (productId: string) => {
    const formulaIds = new Set(
      state.productionFormulas
        .filter(formula => formula.outputProductId === productId)
        .map(formula => formula.id)
    );
    const latest = state.productionRecords
      .filter(record => formulaIds.has(record.formulaId) && record.unitCost > 0)
      .at(-1);
    return latest?.unitCost || 0;
  };
  const standalonePrice = (product: Product) => {
    const latest = state.priceHistory
      .filter(item => item.productId === product.id && item.effectiveDate <= date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
    const price = Number(latest?.price ?? product.price) || 0;
    const priceUnit = latest?.unit || product.unit;
    return price / Math.max(0.000001, unitConversionToBase(product, priceUnit));
  };
  const unitPrice = (product: Product) =>
    Math.max(
      0,
      computedUnitCosts.get(product.id) ||
        historicalUnitCost(product.id) ||
        standalonePrice(product)
    );
  const weightToGrams = (value: number, unit: string) => {
    if (unit === "کیلوگرم") return value * 1000;
    if (unit === "تن") return value * 1_000_000;
    if (unit === "میلی‌گرم" || unit === "میلی گرم") return value / 1000;
    return value;
  };

  const run = (
    currentFormulaId: string,
    requestedQuantity: number,
    requestedUnit?: string,
    runOptions: ProductionRunOptions = options
  ): number => {
    if (visiting.has(currentFormulaId))
      throw new Error("وابستگی حلقوی در فرمول‌های تولید وجود دارد");
    const formula = formulas.get(currentFormulaId);
    if (!formula || !formula.outputProductId)
      throw new Error("فرمول یا محصول خروجی معتبر نیست");
    const outputProduct = productById(formula.outputProductId);
    if (!outputProduct) throw new Error("محصول خروجی فرمول پیدا نشد");
    const batchBase = quantityInBase(
      outputProduct,
      formula.outputQuantity,
      formula.outputUnit || outputProduct.unit
    );
    const requestedBase = quantityInBase(
      outputProduct,
      requestedQuantity,
      requestedUnit || formula.outputUnit || outputProduct.unit
    );
    if (batchBase <= 0 || requestedBase <= 0)
      throw new Error("مقدار خروجی فرمول معتبر نیست");
    const actualPieceWeight = Number(runOptions.pieceWeight) || 0;
    const quantityScale = requestedBase / batchBase;
    const massUnits = ["گرم", "میلی‌گرم", "میلی گرم", "کیلوگرم", "تن"];
    const weightMaterials = formula.materials.filter(material => {
      if (!massUnits.includes(material.unit)) return false;
      const materialProduct = productById(material.productId);
      const isPackage = materialProduct?.category === "بسته تولید";
      return !isPackage || !runOptions.excludedMaterialIds?.includes(material.id);
    });
    const plannedWeightPerPiece = weightMaterials.reduce(
      (sum, material) => sum + weightToGrams(material.quantity, material.unit),
      0
    );
    const weightScale = actualPieceWeight > 0 && plannedWeightPerPiece > 0
      ? weightToGrams(actualPieceWeight, runOptions.pieceWeightUnit || "گرم") / plannedWeightPerPiece
      : 1;
    visiting.add(currentFormulaId);
    let materialCost = 0;
    const materialUsage: ProductionMaterialUsage[] = [];
    for (const material of formula.materials) {
      const materialProduct = productById(material.productId);
      if (!materialProduct) throw new Error("مادهٔ اولیهٔ فرمول پیدا نشد");
      const isWeightMaterial = massUnits.includes(material.unit);
      const isPackage = materialProduct.category === "بسته تولید";
      const packageIncludedInWeight = !isPackage ||
        currentFormulaId !== formulaId ||
        !runOptions.excludedMaterialIds?.includes(material.id);
      const materialScale = quantityScale *
        (isWeightMaterial && packageIncludedInWeight ? weightScale : 1);
      const plannedBase = quantityInBase(
        materialProduct,
        material.quantity * materialScale,
        material.unit
      );
      const adjustment = currentFormulaId === formulaId
        ? Number(runOptions.materialAdjustments?.[material.id]) || 0
        : 0;
      const adjustmentBase = quantityInBase(materialProduct, adjustment, material.unit);
      const wasteBase = isPackage
        ? 0
        : plannedBase * Math.max(0, Number(runOptions.wastePercent) || 0) / 100;
      const requiredBase = Math.max(0, plannedBase + adjustmentBase + wasteBase);
      const nestedFormulaId = outputFormulaIds.get(materialProduct.id);
      if (nestedFormulaId && materialProduct.stock < requiredBase) {
        run(
          nestedFormulaId,
          requiredBase - materialProduct.stock,
          materialProduct.unit,
          {}
        );
      }
      materialProduct.stock -= requiredBase;
      materialCost += requiredBase * unitPrice(materialProduct);
      const conversion = Math.max(0.000001, unitConversionToBase(materialProduct, material.unit));
      materialUsage.push({
        materialId: material.id,
        productId: material.productId,
        plannedQuantity: material.quantity * materialScale,
        adjustmentQuantity: adjustment,
        wasteQuantity: wasteBase / conversion,
        actualQuantity: requiredBase / conversion,
        unit: material.unit,
      });
    }
    const overheadCost = formula.costs.reduce(
      (sum, cost) => sum + Math.max(0, Number(cost.amount) || 0) * quantityScale,
      0
    );
    const totalCost = materialCost + overheadCost;
    outputProduct.stock += requestedBase;
    computedUnitCosts.set(outputProduct.id, totalCost / requestedBase);
    outputProduct.category =
      formula.formulaType === "بسته تولید" ? "بسته تولید" : "محصول تولیدی";
    records.push({
      id: createId("production"),
      formulaId: currentFormulaId,
      date,
      outputQuantity: requestedQuantity,
      outputQuantityBase: requestedBase,
      materialCost,
      overheadCost,
      totalCost,
      unitCost: totalCost / requestedBase,
      batchNumber: currentFormulaId === formulaId ? runOptions.batchNumber : undefined,
      actualOutputQuantity: currentFormulaId === formulaId ? requestedQuantity : undefined,
      actualOutputUnit: currentFormulaId === formulaId ? requestedUnit || formula.outputUnit : undefined,
      pieceWeight: currentFormulaId === formulaId ? runOptions.pieceWeight : undefined,
      pieceWeightUnit: currentFormulaId === formulaId ? runOptions.pieceWeightUnit : undefined,
      wastePercent: currentFormulaId === formulaId ? Math.max(0, Number(runOptions.wastePercent) || 0) : undefined,
      materialUsage,
      includedMaterialIds: currentFormulaId === formulaId ? runOptions.includedMaterialIds : undefined,
      excludedMaterialIds: currentFormulaId === formulaId ? runOptions.excludedMaterialIds : undefined,
      formulaRevision: formula.id,
      executionId,
      formulaSnapshot: structuredClone(formula),
      outputProductId: formula.outputProductId,
      outputProductName: outputProduct.name,
      note: currentFormulaId === formulaId && runOptions.note ? runOptions.note : formula.note,
    });
    visiting.delete(currentFormulaId);
    return totalCost;
  };

  run(formulaId, outputQuantity, outputUnit);
  const inventoryEvents: InventoryEvent[] = records.flatMap(record => {
    const output = products.find(product => product.id === record.outputProductId);
    const outputEvent: InventoryEvent | null = output
      ? {
          id: createId("inventory-event"),
          at: new Date().toISOString(),
          date: record.date,
          kind: "production_output",
          productId: output.id,
          warehouseId: output.warehouseId,
          quantityEntered: record.outputQuantity,
          unitEntered: record.actualOutputUnit || output.unit,
          quantityBase: record.outputQuantityBase ?? record.outputQuantity,
          baseUnit: output.unit,
          sourceType: "production",
          sourceId: record.id,
          note: `خروجی بچ ${record.batchNumber || record.id}`,
        }
      : null;
    const inputEvents = (record.materialUsage || []).map(usage => {
      const material = products.find(product => product.id === usage.productId);
      const quantityBase = quantityInBase(
        material || ({ unit: usage.unit, unit2: usage.unit, conversionRate: 1 } as Product),
        usage.actualQuantity,
        usage.unit
      );
      return {
        id: createId("inventory-event"),
        at: new Date().toISOString(),
        date: record.date,
        kind: "production_input" as const,
        productId: usage.productId,
        warehouseId: material?.warehouseId,
        quantityEntered: -usage.actualQuantity,
        unitEntered: usage.unit,
        quantityBase: -quantityBase,
        baseUnit: material?.unit || usage.unit,
        sourceType: "production",
        sourceId: record.id,
        note: `مصرف بچ ${record.batchNumber || record.id}`,
      };
    });
    return outputEvent ? [outputEvent, ...inputEvents] : inputEvents;
  });
  return {
    state: {
      ...state,
      products,
      productionRecords: [...state.productionRecords, ...records],
      inventoryEvents: [...(state.inventoryEvents || []), ...inventoryEvents],
    },
    recordIds: records.map(record => record.id),
  };
}

/**
 * Reverses one production run, including automatically generated nested packages.
 * It never overwrites historical records; it returns a state with inventory effects
 * reversed and the run records removed by the caller.
 */
export function reverseProductionRun(state: AppState, productionRecordId: string): AppState {
  const target = state.productionRecords.find(record => record.id === productionRecordId);
  if (!target) throw new Error("رکورد تولید پیدا نشد");
  const runRecords = state.productionRecords.filter(record =>
    target.executionId ? record.executionId === target.executionId : record.id === target.id
  );
  const products = state.products.map(product => ({ ...product }));
  const productById = (id: string) => products.find(product => product.id === id);
  for (const record of runRecords) {
    const output = productById(
      record.outputProductId || record.formulaSnapshot?.outputProductId ||
      state.productionFormulas.find(formula => formula.id === record.formulaId)?.outputProductId || ""
    );
    const outputQuantity = record.outputQuantityBase ?? record.outputQuantity;
    if (output && output.stock + 0.000001 < outputQuantity)
      throw new Error(`موجودی «${output.name}» برای برگشت این بچ کافی نیست؛ ابتدا مصرف یا فروش وابسته را بررسی کنید.`);
    if (output) output.stock -= outputQuantity;
    for (const usage of record.materialUsage || []) {
      const material = productById(usage.productId);
      if (!material) continue;
      material.stock += quantityInBase(material, usage.actualQuantity, usage.unit);
    }
  }
  const runIds = new Set(runRecords.map(record => record.id));
  const inventoryEvents = [...(state.inventoryEvents || [])];
  for (const event of state.inventoryEvents || []) {
    if (event.sourceType !== "production" || !event.sourceId || !runIds.has(event.sourceId)) continue;
    if (inventoryEvents.some(reversal => reversal.reversalOf === event.id)) continue;
    inventoryEvents.push({
      ...event,
      id: createId("inventory-reversal"),
      at: new Date().toISOString(),
      kind: "reversal",
      quantityEntered: -event.quantityEntered,
      quantityBase: -event.quantityBase,
      sourceType: "production-reversal",
      reversalOf: event.id,
      note: `معکوس‌سازی اثر تولید ${productionRecordId}`,
    });
  }
  return { ...state, products, inventoryEvents };
}

export function removeProductionRun(state: AppState, productionRecordId: string): AppState {
  const target = state.productionRecords.find(record => record.id === productionRecordId);
  if (!target) throw new Error("رکورد تولید پیدا نشد");
  const ids = new Set(
    state.productionRecords
      .filter(record => target.executionId ? record.executionId === target.executionId : record.id === target.id)
      .map(record => record.id)
  );
  const reversed = reverseProductionRun(state, productionRecordId);
  return {
    ...reversed,
    productionRecords: reversed.productionRecords.filter(record => !ids.has(record.id)),
  };
}

export const STORAGE_KEY = "accounting-workshop-pwa-aistudio:v1";
export const CORRUPT_STORAGE_KEY = `${STORAGE_KEY}:corrupt-snapshot`;

const seedState: AppState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  revision: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    businessName: "کارگاه من",
    currency: "تومان",
    currencyCode: DEFAULT_CURRENCY_CODE,
    dayBasis: "شمسی",
    units: ["عدد", "کیلوگرم", "گرم", "متر", "لیتر", "کیسه", "بسته", "کارتن"],
    bankFeeRules: [],
  },
  people: [],
  products: [],
  warehouses: [
    { id: "warehouse-production", name: "انبار محصولات تولید", note: "" },
    { id: "warehouse-material", name: "انبار مواد اولیه", note: "" },
    { id: "warehouse-trade", name: "انبار بازرگانی", note: "" },
  ],
  invoices: [],
  priceHistory: [],
  paymentRules: [
    {
      id: "cash-default",
      name: "نقدی و تسویه فوری",
      active: true,
      dayBasis: 30,
      graceDays: 0,
      tiers: [{ id: "tier-1", maxDays: 30, rate: 0, note: "بدون هزینه دیرکرد" }],
    },
  ],
  transactions: [],
  checks: [],
  accounts: [
    { id: "cash", name: "صندوق اصلی", type: "صندوق", balance: 0 },
    { id: "bank", name: "حساب بانکی", type: "بانک", balance: 0 },
  ],
  audit: [],
  inventoryEvents: [],
  cashEvents: [],
  purchasePayments: [],
  purchasePayableAllocations: [],
  issuedChecks: [],
  partnerObligationEvents: [],
  productionFormulas: [],
  productionRecords: [],
  payrollRecords: [],
};

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function suggestNextNumber(values: string[], fallback = 1) {
  const digits = (value: string) =>
    value
      .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .match(/\d+/g);
  const highest = values.reduce((max, value) => {
    const parts = digits(value || "");
    const last = parts?.[parts.length - 1];
    return Math.max(max, last ? Number(last) : 0);
  }, 0);
  return String(Math.max(fallback, highest + 1));
}

export function suggestNextPartyNumber(
  records: Array<{ partyId?: string; number: string }>,
  partyId?: string,
  partyCode?: string,
  fallbackValues: string[] = []
) {
  const own = partyId ? records.filter(item => item.partyId === partyId) : [];
  const source = own.length
    ? own
    : records.filter(item => fallbackValues.includes(item.number));
  const matches = source
    .map(item => item.number.match(/^(.*?)(\d+)\s*$/))
    .filter(Boolean) as RegExpMatchArray[];
  if (!matches.length) return suggestNextNumber(fallbackValues);
  const reference = matches.sort((a, b) => Number(b[2]) - Number(a[2]))[0];
  const prefix = reference?.[1] ?? (partyCode?.match(/^[^\d]*/)?.[0] || "");
  const width = reference?.[2]?.length || 0;
  const next = suggestNextNumber(source.map(item => item.number));
  return `${prefix}${width ? next.padStart(width, "0") : next}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function migrateBackupData(input: unknown, version: number) {
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `این پشتیبان برای نسخهٔ جدیدتری از برنامه است (نسخه ${version}). ابتدا برنامه را به‌روزرسانی کنید.`
    );
  }
  return normalizeState(input);
}

export function normalizeState(input: unknown): AppState {
  const source = isRecord(input) ? input : {};
  const sourceProducts = Array.isArray(source.products) ? source.products : [];
  const discoveredUnits = sourceProducts.flatMap(product =>
    isRecord(product)
      ? [product.unit, product.unit2].filter(
          (unit): unit is string =>
            typeof unit === "string" && Boolean(unit.trim())
        )
      : []
  );
  const configuredUnits =
    isRecord(source.settings) && Array.isArray(source.settings.units)
      ? source.settings.units.filter(
          (unit): unit is string =>
            typeof unit === "string" && Boolean(unit.trim())
        )
      : seedState.settings.units;
  const allUnits = Array.from(
    new Set([...configuredUnits, ...discoveredUnits])
  );
  const availableAccounts = Array.isArray(source.accounts)
    ? source.accounts
    : seedState.accounts;
  const normalizedProducts = Array.isArray(source.products)
    ? source.products.map(product => ({
        ...product,
        unit2: product.unit2 || product.unit,
        conversionRate: Number(product.conversionRate) || 1,
      }))
    : [];
  const normalizedAccounts = availableAccounts.map(account => ({
    ...account,
    balance: Number(account.balance) || 0,
  }));
  const inventoryEvents = Array.isArray(source.inventoryEvents)
    ? source.inventoryEvents
    : normalizedProducts.map(product => ({
        id: `opening-product-${product.id}`,
        at: new Date(0).toISOString(),
        date: "0000/00/00",
        kind: "opening_balance" as const,
        productId: product.id,
        warehouseId: product.warehouseId,
        quantityEntered: product.stock,
        unitEntered: product.unit,
        quantityBase: product.stock,
        baseUnit: product.unit,
        sourceType: "migration",
        sourceId: product.id,
        note: "موجودی جاری پیش از فعال‌سازی دفتر رویداد",
      }));
  const cashEvents = Array.isArray(source.cashEvents)
    ? source.cashEvents.map(event =>
        isRecord(event) &&
        event.sourceType === "purchase_payment" &&
        event.kind === "payment" &&
        typeof event.amount === "number" &&
        event.amount > 0
          ? {
              ...event,
              amount: -event.amount,
              note: `${typeof event.note === "string" ? event.note : "پرداخت خرید"}؛ اصلاح جهت رویداد در migration نسخه ۵`,
            }
          : event
      )
    : normalizedAccounts.map(account => ({
        id: `opening-account-${account.id}`,
        at: new Date(0).toISOString(),
        date: "0000/00/00",
        kind: "opening_balance" as const,
        accountId: account.id,
        amount: account.balance,
        currency: isRecord(source.settings) && typeof source.settings.currency === "string"
          ? source.settings.currency
          : seedState.settings.currency,
        sourceType: "migration",
        sourceId: account.id,
        note: "ماندهٔ جاری پیش از فعال‌سازی دفتر رویداد",
      }));
  return {
    ...seedState,
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: typeof source.revision === "number" ? source.revision : 1,
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
    settings: {
      ...seedState.settings,
      ...(isRecord(source.settings) ? source.settings : {}),
      currencyCode: normalizeCurrencyCode(
        isRecord(source.settings) && source.settings.currencyCode !== undefined
          ? source.settings.currencyCode
          : isRecord(source.settings)
            ? source.settings.currency
            : DEFAULT_CURRENCY_CODE
      ),
      currency: currencyLabel(
        isRecord(source.settings) && source.settings.currencyCode !== undefined
          ? normalizeCurrencyCode(source.settings.currencyCode)
          : isRecord(source.settings)
            ? normalizeCurrencyCode(source.settings.currency)
            : DEFAULT_CURRENCY_CODE
      ),
      dayBasis:
        isRecord(source.settings) &&
        (source.settings.dayBasis === "شمسی" ||
          typeof source.settings.dayBasis === "number")
          ? source.settings.dayBasis
          : seedState.settings.dayBasis,
      units: allUnits,
      bankFeeRules: isRecord(source.settings) && Array.isArray(source.settings.bankFeeRules)
        ? source.settings.bankFeeRules.map(rule => ({
            ...rule,
            active: rule.active !== false,
            percent: Number(rule.percent) || 0,
            fixedAmount: Number(rule.fixedAmount) || 0,
            minAmount: rule.minAmount === undefined ? undefined : Number(rule.minAmount) || 0,
            maxAmount: rule.maxAmount === undefined ? undefined : Number(rule.maxAmount) || 0,
          }))
        : seedState.settings.bankFeeRules,
    },
    people: Array.isArray(source.people)
      ? source.people.map(person => ({
          ...person,
          defaultPaymentRuleId:
            typeof person.defaultPaymentRuleId === "string"
              ? person.defaultPaymentRuleId
              : undefined,
          roles:
            Array.isArray(person.roles) && person.roles.length
              ? person.roles
              : [person.type || "مشتری"],
        }))
      : [],
    products: normalizedProducts,
    warehouses: Array.isArray(source.warehouses)
      ? source.warehouses
      : seedState.warehouses,
    invoices: Array.isArray(source.invoices)
      ? source.invoices.map(invoice => {
          const paidAmount = Number(invoice.paidAmount) || 0;
          const invoiceAmount = Number(invoice.amount) || 0;
          return {
            ...invoice,
            items: Array.isArray(invoice.items) ? invoice.items : [],
            allocations: Array.isArray(invoice.allocations)
              ? invoice.allocations
              : [],
            paidAmount,
            // Legacy floating-point residue must not leave a fully paid invoice partial.
            status:
              invoice.status === "تسویه جزئی" &&
              paidAmount > 0 &&
              invoiceAmount - paidAmount <= 0.01
                ? ("تسویه شده" as const)
                : invoice.status,
          };
        })
      : [],
    priceHistory: Array.isArray(source.priceHistory) ? source.priceHistory : [],
    paymentRules: Array.isArray(source.paymentRules)
      ? source.paymentRules
      : seedState.paymentRules,
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    checks: Array.isArray(source.checks)
      ? source.checks.map(check => ({
          ...check,
          bankAccountId:
            typeof check.bankAccountId === "string"
              ? check.bankAccountId
              : availableAccounts.find(
                  account =>
                    account.type === "بانک" && account.name === check.bank
                )?.id,
          returnPartyId:
            typeof check.returnPartyId === "string"
              ? check.returnPartyId
              : undefined,
          replacementIds: Array.isArray(check.replacementIds)
            ? check.replacementIds
            : [],
          receivedDate:
            typeof check.receivedDate === "string"
              ? check.receivedDate
              : check.dueDate || "",
          collectedDate:
            typeof check.collectedDate === "string"
              ? check.collectedDate
              : check.status === "وصول شده"
                ? (Array.isArray(source.transactions)
                    ? source.transactions.find(
                        transaction =>
                          transaction.type === "دریافت" &&
                          typeof transaction.note === "string" &&
                          transaction.note.includes(`__check:${check.id}`)
                      )?.date
                    : undefined) ||
                  check.receivedDate ||
                  check.dueDate ||
                  undefined
                : undefined,
          invoiceDate:
            typeof check.invoiceDate === "string"
              ? check.invoiceDate
              : undefined,
          paymentRuleId:
            typeof check.paymentRuleId === "string"
              ? check.paymentRuleId
              : undefined,
        }))
      : [],
    accounts: normalizedAccounts,
    audit: Array.isArray(source.audit) ? source.audit.slice(-500) : [],
    inventoryEvents,
    cashEvents,
    purchasePayments: Array.isArray(source.purchasePayments)
      ? source.purchasePayments.map(payment => ({
          ...payment,
          amount: Number(payment.amount) || 0,
          note: typeof payment.note === "string" ? payment.note : "",
        }))
      : [],
    purchasePayableAllocations: Array.isArray(source.purchasePayableAllocations)
      ? source.purchasePayableAllocations.map(allocation => ({
          ...allocation,
          amount: Number(allocation.amount) || 0,
        }))
      : [],
    issuedChecks: Array.isArray(source.issuedChecks)
      ? source.issuedChecks.map(check => ({
          ...check,
          amount: Number(check.amount) || 0,
          note: typeof check.note === "string" ? check.note : "",
        }))
      : [],
    partnerObligationEvents: Array.isArray(source.partnerObligationEvents)
      ? source.partnerObligationEvents.map(event => ({
          ...event,
          amount: Number(event.amount) || 0,
        }))
      : [],
    productionFormulas: Array.isArray(source.productionFormulas)
      ? source.productionFormulas.map(formula => ({
          ...formula,
          formulaType:
            formula.formulaType === "بسته تولید" ? "بسته تولید" : "قطعه",
        }))
      : [],
    productionRecords: Array.isArray(source.productionRecords)
      ? source.productionRecords
      : [],
    payrollRecords: Array.isArray(source.payrollRecords)
      ? source.payrollRecords.map(record => ({
          ...record,
          amount: Number(record.amount) || 0,
          period: typeof record.period === "string" ? record.period : record.date,
          employeeName: typeof record.employeeName === "string" ? record.employeeName : "",
          status: ["پرداخت‌شده", "پرداختنی", "باطل"].includes(record.status)
            ? record.status
            : "پرداختنی",
          note: typeof record.note === "string" ? record.note : "",
        }))
      : [],
  } as AppState;
}

export function loadState(): AppState {
  if (typeof localStorage === "undefined") return normalizeState(seedState);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : normalizeState(seedState);
  } catch (error) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localStorage.setItem(CORRUPT_STORAGE_KEY, JSON.stringify({
          capturedAt: new Date().toISOString(),
          raw,
        }));
      }
    } catch {
      // A storage quota/security failure must not hide the original recovery path.
    }
    console.error("Accounting state was quarantined after storage corruption.", error);
    return normalizeState(seedState);
  }
}

export function saveState(state: AppState) {
  const next = normalizeState({
    ...state,
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function createEmptyState(previous: AppState): AppState {
  return normalizeState({
    revision: previous.revision + 1,
    people: [],
    products: [],
    priceHistory: [],
    invoices: [],
    transactions: [],
    checks: [],
    purchasePayments: [],
    purchasePayableAllocations: [],
    issuedChecks: [],
    partnerObligationEvents: [],
    productionFormulas: [],
    productionRecords: [],
    audit: [
      {
        id: createId("audit"),
        at: new Date().toISOString(),
        action: "CLEAR_DATA",
        note: "حذف همه اطلاعات کسب‌وکار پس از تأیید کاربر",
      },
    ],
  });
}

export function formatMoney(value: number, currency = "تومان") {
  return `${new Intl.NumberFormat("fa-IR").format(Math.round(value || 0))} ${currency}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value || 0);
}

/**
 * Parses numbers entered with Persian/Arabic digits and separators.
 * All financial forms must use this function instead of local regex variants.
 */
export function parseLocalizedNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value
    .trim()
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٫]/g, ".")
    .replace(/[٬،,\s]/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/[^0-9.-]/g, "")
    .replace(/(?!^)-/g, "");
  const [whole, ...fraction] = normalized.split(".");
  const parsed = Number(fraction.length ? `${whole}.${fraction.join("")}` : whole);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculates the invoice amount after discount. A fully discounted invoice is
 * valid and intentionally returns zero; callers should validate the subtotal,
 * not the final amount, when deciding whether the invoice has content.
 */
export function calculateInvoiceAmount(subtotal: number, discount: number) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const safeDiscount = Math.min(
    safeSubtotal,
    Math.max(0, Number(discount) || 0)
  );
  return Math.max(0, safeSubtotal - safeDiscount);
}

const STANDARD_UNIT_FACTORS: Record<string, number> = {
  میلی‌گرم: 0.000001,
  "میلی گرم": 0.000001,
  گرم: 0.001,
  کیلوگرم: 1,
  تن: 1000,
  میلی‌لیتر: 0.001,
  "میلی لیتر": 0.001,
  لیتر: 1,
  سانتی‌متر: 0.01,
  "سانتی متر": 0.01,
  متر: 1,
};

/** مقدار یک واحد انتخاب‌شده را به واحد اول کالا تبدیل می‌کند. */
export function unitConversionToBase(product: Product, unit: string) {
  if (!unit || unit === product.unit) return 1;
  if (unit === product.unit2) {
    const baseFactor = STANDARD_UNIT_FACTORS[product.unit];
    const selectedFactor = STANDARD_UNIT_FACTORS[unit];
    if (baseFactor && selectedFactor) return selectedFactor / baseFactor;
    return Number(product.conversionRate) > 0
      ? Number(product.conversionRate)
      : 1;
  }
  const baseFactor = STANDARD_UNIT_FACTORS[product.unit];
  const selectedFactor = STANDARD_UNIT_FACTORS[unit];
  return baseFactor && selectedFactor ? selectedFactor / baseFactor : 1;
}

export function quantityInBase(
  product: Product,
  quantity: number,
  unit: string
) {
  return (Number(quantity) || 0) * unitConversionToBase(product, unit);
}

export interface BaseUnitLineCalculation {
  quantity: number;
  enteredUnit: string;
  baseUnit: string;
  conversionRate: number;
  quantityBase: number;
  unitPrice: number;
  priceBasis: "baseUnit";
  total: number;
}

/**
 * Applies the stage contract: prices are per product base unit, while the
 * entered quantity may use the product's second unit.
 */
export function calculateBaseUnitLine(
  product: Product,
  quantity: number,
  enteredUnit: string,
  baseUnitPrice: number
): BaseUnitLineCalculation {
  const safeQuantity = Number.isFinite(Number(quantity)) ? Number(quantity) : 0;
  const selectedUnit = enteredUnit || product.unit;
  const knownStandardUnit = Object.prototype.hasOwnProperty.call(
    STANDARD_UNIT_FACTORS,
    selectedUnit
  );
  const knownProductUnit = selectedUnit === product.unit || selectedUnit === product.unit2;
  if (!knownProductUnit && !knownStandardUnit) {
    throw new Error(`واحد «${selectedUnit}» برای کالا تعریف نشده است`);
  }
  if (
    selectedUnit === product.unit2 &&
    selectedUnit !== product.unit &&
    !knownStandardUnit &&
    !(Number(product.conversionRate) > 0)
  ) {
    throw new Error("ضریب تبدیل واحد معتبر نیست");
  }
  const conversionRate = unitConversionToBase(product, selectedUnit);
  if (!(conversionRate > 0) || !Number.isFinite(conversionRate)) {
    throw new Error("ضریب تبدیل واحد معتبر نیست");
  }
  const unitPrice = Number.isFinite(Number(baseUnitPrice)) ? Number(baseUnitPrice) : 0;
  const quantityBase = safeQuantity * conversionRate;
  return {
    quantity: safeQuantity,
    enteredUnit: selectedUnit,
    baseUnit: product.unit,
    conversionRate,
    quantityBase,
    unitPrice,
    priceBasis: "baseUnit",
    total: quantityBase * unitPrice,
  };
}

/**
 * موجودی را بدون ثبت مبلغ مالی اصلاح می‌کند؛ مقدار ورودی می‌تواند واحد دوم باشد.
 * مقدار مثبت افزایش و مقدار منفی کاهش موجودی است.
 */
export function adjustInventoryBalance(
  state: AppState,
  productId: string,
  quantity: number,
  unit: string,
  note = ""
): AppState {
  const product = state.products.find(item => item.id === productId);
  if (!product) throw new Error("کالای انتخاب‌شده پیدا نشد");
  const deltaBase = quantityInBase(product, quantity, unit);
  if (!Number.isFinite(deltaBase) || deltaBase === 0)
    throw new Error("مقدار اصلاح موجودی معتبر نیست");
  return {
    ...state,
    products: state.products.map(item =>
      item.id === productId ? { ...item, stock: item.stock + deltaBase } : item
    ),
    inventoryEvents: [
      ...(state.inventoryEvents || []),
      {
        id: createId("inventory-event"),
        at: new Date().toISOString(),
        date: todayJalali(),
        kind: "adjustment",
        productId,
        warehouseId: product.warehouseId,
        quantityEntered: quantity,
        unitEntered: unit,
        quantityBase: deltaBase,
        baseUnit: product.unit,
        sourceType: "manual_adjustment",
        sourceId: productId,
        note: note || "اصلاح دستی موجودی",
      },
    ],
    audit: [
      ...state.audit,
      {
        id: createId("stock-adjust"),
        at: new Date().toISOString(),
        action: "STOCK_ADJUSTMENT",
        note: `${product.name}: ${quantity > 0 ? "افزایش" : "کاهش"} ${Math.abs(quantity)} ${unit}؛ ${note || "بدون توضیح"}`,
      },
    ].slice(-500),
  };
}

export function appendInventoryEvent(
  state: AppState,
  event: Omit<InventoryEvent, "id" | "at">
): AppState {
  return {
    ...state,
    inventoryEvents: [
      ...state.inventoryEvents,
      {
        ...event,
        id: createId("inventory-event"),
        at: new Date().toISOString(),
      },
    ],
  };
}

export function rebuildInventoryProjection(state: AppState): AppState {
  const totals = new Map<string, number>();
  for (const event of state.inventoryEvents) {
    totals.set(event.productId, (totals.get(event.productId) || 0) + event.quantityBase);
  }
  return {
    ...state,
    products: state.products.map(product => ({
      ...product,
      stock: totals.get(product.id) ?? 0,
    })),
  };
}

export function appendCashEvent(
  state: AppState,
  event: Omit<CashEvent, "id" | "at">
): AppState {
  return {
    ...state,
    cashEvents: [
      ...state.cashEvents,
      { ...event, id: createId("cash-event"), at: new Date().toISOString() },
    ],
  };
}

export function rebuildCashProjection(state: AppState): AppState {
  const totals = new Map<string, number>();
  for (const event of state.cashEvents) {
    totals.set(event.accountId, (totals.get(event.accountId) || 0) + event.amount);
  }
  return {
    ...state,
    accounts: state.accounts.map(account => ({
      ...account,
      balance: totals.get(account.id) ?? 0,
    })),
  };
}

export interface LedgerDiscrepancy {
  id: string;
  label: string;
  recorded: number;
  projected: number;
  difference: number;
}

export interface CashAccountReconciliation {
  accountId: string;
  accountName: string;
  accountType: Account["type"];
  recorded: number;
  projected: number;
  difference: number;
  eventCount: number;
  receipts: number;
  payments: number;
}

export function inventoryLedgerDiscrepancies(state: AppState): LedgerDiscrepancy[] {
  const rebuilt = rebuildInventoryProjection(state);
  return state.products.flatMap(product => {
    const projected = rebuilt.products.find(item => item.id === product.id)?.stock ?? 0;
    const difference = product.stock - projected;
    return Math.abs(difference) > 0.000001
      ? [{ id: product.id, label: product.name, recorded: product.stock, projected, difference }]
      : [];
  });
}

export function cashLedgerDiscrepancies(state: AppState): LedgerDiscrepancy[] {
  const rebuilt = rebuildCashProjection(state);
  return state.accounts.flatMap(account => {
    const projected = rebuilt.accounts.find(item => item.id === account.id)?.balance ?? 0;
    const difference = account.balance - projected;
    return Math.abs(difference) > 0.000001
      ? [{ id: account.id, label: account.name, recorded: account.balance, projected, difference }]
      : [];
  });
}

/**
 * Returns the auditable balance of every cash, bank, and partner account.
 * `recorded` is the UI projection; `projected` is rebuilt only from the
 * append-only cash events. Event totals explain the source of each balance.
 */
export function cashAccountReconciliation(
  state: AppState
): CashAccountReconciliation[] {
  const rebuilt = rebuildCashProjection(state);
  return state.accounts.map(account => {
    const events = state.cashEvents.filter(event => event.accountId === account.id);
    const projected = rebuilt.accounts.find(item => item.id === account.id)?.balance ?? 0;
    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      recorded: account.balance,
      projected,
      difference: account.balance - projected,
      eventCount: events.length,
      receipts: events.filter(event => event.amount > 0).reduce((sum, event) => sum + event.amount, 0),
      payments: events.filter(event => event.amount < 0).reduce((sum, event) => sum + Math.abs(event.amount), 0),
    };
  });
}

export type IntegritySeverity = "خطا" | "هشدار" | "اطلاعات";

export interface IntegrityFinding {
  id: string;
  severity: IntegritySeverity;
  area: string;
  message: string;
  entityId?: string;
}

/** ممیزی read-only برای کشف ارجاع‌های شکسته، تکرار شماره و عدم تطابق ledger. */
export function auditDataIntegrity(state: AppState): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const add = (id: string, severity: IntegritySeverity, area: string, message: string, entityId?: string) => findings.push({ id, severity, area, message, entityId });
  const duplicateValues = (values: Array<{ id: string; value: string }>, area: string, label: string) => {
    const seen = new Map<string, string>();
    values.forEach(item => {
      const previous = seen.get(item.value);
      if (previous) add(`duplicate-${area}-${item.value}`, "خطا", area, `${label} «${item.value}» تکراری است.`, item.id);
      else if (item.value) seen.set(item.value, item.id);
    });
  };
  duplicateValues(state.invoices.filter(item => item.status !== "باطل").map(item => ({ id: item.id, value: item.number })), "فاکتور", "شماره فاکتور");
  duplicateValues(state.checks.filter(item => item.status !== "باطل").map(item => ({ id: item.id, value: item.number })), "چک", "شماره چک");
  const people = new Set(state.people.map(item => item.id));
  const products = new Set(state.products.map(item => item.id));
  const accounts = new Set(state.accounts.map(item => item.id));
  const checks = new Map(state.checks.map(item => [item.id, item]));
  const invoices = new Map(state.invoices.map(item => [item.id, item]));
  const payments = new Map(state.purchasePayments.map(item => [item.id, item]));
  state.transactions.forEach(transaction => {
    const fee = Number(transaction.feeAmount) || 0;
    if (fee < 0) add(`transaction-fee-negative-${transaction.id}`, "خطا", "کارمزد بانکی", "مبلغ کارمزد نمی‌تواند منفی باشد.", transaction.id);
    if (fee > 0 && !transaction.fromAccountId && !transaction.accountId) add(`transaction-fee-source-${transaction.id}`, "خطا", "کارمزد بانکی", "کارمزد ثبت‌شده حساب کسرکننده ندارد.", transaction.id);
  });
  state.payrollRecords.forEach(record => {
    if ((Number(record.feeAmount) || 0) < 0) add(`payroll-fee-negative-${record.id}`, "خطا", "کارمزد بانکی", "کارمزد پرداخت حقوق نمی‌تواند منفی باشد.", record.id);
    if (record.personId && !people.has(record.personId)) {
      add(`payroll-person-${record.id}`, "خطا", "حقوق و دستمزد", `رکورد حقوق ${record.employeeName} به شخص حذف‌شده ارجاع می‌دهد.`, record.id);
    }
    if (record.accountId && !accounts.has(record.accountId)) {
      add(`payroll-account-${record.id}`, "خطا", "حقوق و دستمزد", `حساب پرداخت حقوق ${record.employeeName} پیدا نشد.`, record.id);
    }
    if (record.transactionId && !state.transactions.some(transaction => transaction.id === record.transactionId)) {
      add(`payroll-transaction-${record.id}`, "هشدار", "حقوق و دستمزد", `تراکنش پرداخت حقوق ${record.employeeName} پیدا نشد.`, record.id);
    }
  });
  state.invoices.forEach(invoice => {
    if (invoice.partyId && !people.has(invoice.partyId)) add(`invoice-party-${invoice.id}`, "خطا", "فاکتور", `طرف حساب فاکتور ${invoice.number} پیدا نشد.`, invoice.id);
    if (invoice.paymentRuleId && !state.paymentRules.some(rule => rule.id === invoice.paymentRuleId)) add(`invoice-rule-${invoice.id}`, "هشدار", "فاکتور", `شرایط پرداخت فاکتور ${invoice.number} پیدا نشد.`, invoice.id);
    invoice.items.forEach(item => {
      if (item.productId && !products.has(item.productId)) add(`invoice-product-${invoice.id}-${item.id}`, "خطا", "فاکتور", `کالای ردیف ${item.description} در فاکتور ${invoice.number} پیدا نشد.`, invoice.id);
    });
    // مبلغ allocation شامل هزینهٔ دیرکرد است؛ سقف فاکتور فقط با اصل تخصیص سنجیده می‌شود.
    const totalAllocated = invoice.allocations.reduce((sum, item) => sum + Math.max(0, item.principalAmount ?? item.amount), 0);
    if (totalAllocated > invoice.amount + 0.01) add(`invoice-allocation-${invoice.id}`, "خطا", "تخصیص چک", `مجموع تخصیص‌های فاکتور ${invoice.number} از مبلغ فاکتور بیشتر است.`, invoice.id);
    invoice.allocations.forEach(allocation => {
      if (!checks.has(allocation.checkId)) add(`allocation-check-${invoice.id}-${allocation.checkId}`, "خطا", "تخصیص چک", `چک تخصیص‌یافته به فاکتور ${invoice.number} پیدا نشد.`, invoice.id);
    });
  });
  state.purchasePayments.forEach(payment => {
    if ((Number(payment.feeAmount) || 0) < 0) add(`purchase-fee-negative-${payment.id}`, "خطا", "کارمزد بانکی", "کارمزد پرداخت خرید نمی‌تواند منفی باشد.", payment.id);
    if ((Number(payment.feeAmount) || 0) > 0 && !payment.accountId) add(`purchase-fee-account-${payment.id}`, "خطا", "کارمزد بانکی", "کارمزد پرداخت خرید حساب کسرکننده ندارد.", payment.id);
  });
  const allocatedByCheck = new Map<string, number>();
  state.invoices.forEach(invoice => invoice.allocations.forEach(allocation => allocatedByCheck.set(allocation.checkId, (allocatedByCheck.get(allocation.checkId) || 0) + Math.max(0, allocation.amount))));
  checks.forEach((check, checkId) => {
    if ((Number(check.feeAmount) || 0) < 0) add(`check-fee-negative-${checkId}`, "خطا", "کارمزد بانکی", "کارمزد وصول چک نمی‌تواند منفی باشد.", checkId);
    if (check.partyId && !people.has(check.partyId)) add(`check-party-${checkId}`, "خطا", "چک", `طرف حساب چک ${check.number} پیدا نشد.`, checkId);
    if (check.bankAccountId && !accounts.has(check.bankAccountId)) add(`check-account-${checkId}`, "خطا", "چک", `حساب بانکی چک ${check.number} پیدا نشد.`, checkId);
    if ((allocatedByCheck.get(checkId) || 0) > check.amount + 0.01) add(`check-allocation-${checkId}`, "خطا", "تخصیص چک", `مجموع تخصیص‌های چک ${check.number} از مبلغ چک بیشتر است.`, checkId);
  });
  state.purchasePayableAllocations.forEach(allocation => {
    if (!payments.has(allocation.paymentId)) add(`purchase-payment-${allocation.id}`, "خطا", "خرید", "تخصیص پرداخت خرید به پرداخت موجود ارجاع نمی‌دهد.", allocation.id);
    if (!invoices.has(allocation.invoiceId)) add(`purchase-invoice-${allocation.id}`, "خطا", "خرید", "تخصیص پرداخت خرید به فاکتور موجود ارجاع نمی‌دهد.", allocation.id);
  });
  state.inventoryEvents.forEach(event => {
    if (!products.has(event.productId)) add(`inventory-product-${event.id}`, "خطا", "دفتر موجودی", "رویداد موجودی به کالای حذف‌شده ارجاع می‌دهد.", event.id);
  });
  state.cashEvents.forEach(event => {
    if (!accounts.has(event.accountId)) add(`cash-account-${event.id}`, "خطا", "دفتر نقدی", "رویداد نقدی به حساب حذف‌شده ارجاع می‌دهد.", event.id);
  });
  inventoryLedgerDiscrepancies(state).forEach(item => add(`inventory-ledger-${item.id}`, "هشدار", "دفتر موجودی", `موجودی ${item.label} با دفتر رویداد ${item.difference} اختلاف دارد.`, item.id));
  cashLedgerDiscrepancies(state).forEach(item => add(`cash-ledger-${item.id}`, "هشدار", "دفتر نقدی", `مانده ${item.label} با دفتر رویداد ${item.difference} اختلاف دارد.`, item.id));
  if (!findings.length) add("integrity-ok", "اطلاعات", "ممیزی", "هیچ ارجاع شکسته، تخصیص بیش از سقف یا مغایرت projection پیدا نشد.");
  return findings;
}

/**
 * Bridges legacy mutation paths while the UI is being migrated to explicit
 * events. A caller that already appended source events is not duplicated.
 */
export function reconcileLedgerEvents(previous: AppState, next: AppState): AppState {
  const inventoryEvents = [...(next.inventoryEvents || [])];
  const cashEvents = [...(next.cashEvents || [])];
  const previousInventoryEventIds = new Set((previous.inventoryEvents || []).map(event => event.id));
  const previousCashEventIds = new Set((previous.cashEvents || []).map(event => event.id));
  const explicitInventoryProducts = new Set(
    inventoryEvents.filter(event => !previousInventoryEventIds.has(event.id)).map(event => event.productId)
  );
  const explicitCashAccounts = new Set(
    cashEvents.filter(event => !previousCashEventIds.has(event.id)).map(event => event.accountId)
  );
  const date = todayJalali();
  const previousTransactions = new Map(previous.transactions.map(item => [item.id, item]));
  const transactionChanged = (before: Transaction, after: Transaction) =>
    before.type !== after.type || before.amount !== after.amount || before.feeAmount !== after.feeAmount
      || before.fromAccountId !== after.fromAccountId || before.toAccountId !== after.toAccountId
      || before.accountId !== after.accountId || before.status !== after.status;
  const changedTransactions = next.transactions.filter(item => {
    const before = previousTransactions.get(item.id);
    return item.status !== "باطل" && (!before || transactionChanged(before, item));
  });
  const removedOrVoidedTransactions = previous.transactions.filter(before => {
    const after = next.transactions.find(item => item.id === before.id);
    return !after || after.status === "باطل";
  });
  const inventorySources = new Set<string>();
  const cashSources = new Set<string>();
  const specializedCashAccounts = new Set<string>();
  const addInventory = (transaction: Transaction, kind: InventoryEventKind, quantityBase: number) => {
    if (!transaction.productId || !quantityBase || inventorySources.has(transaction.id)) return;
    const product = next.products.find(item => item.id === transaction.productId);
    if (!product) return;
    inventoryEvents.push({
      id: createId("inventory-event"), at: new Date().toISOString(), date: transaction.date,
      kind, productId: product.id, warehouseId: transaction.warehouseId || product.warehouseId,
      quantityEntered: transaction.quantity || quantityBase, unitEntered: transaction.unit || product.unit,
      quantityBase, baseUnit: product.unit, sourceType: "transaction", sourceId: transaction.id,
      note: transaction.note,
    });
    inventorySources.add(transaction.id);
  };
  const addCash = (transaction: Transaction, accountId: string | undefined, amount: number, kind: CashEventKind, counterAccountId?: string) => {
    if (!accountId || !amount) return;
    const sourceKey = `${transaction.id}:${accountId}`;
    if (cashSources.has(sourceKey)) return;
    cashEvents.push({
      id: createId("cash-event"), at: new Date().toISOString(), date: transaction.date,
      kind, accountId, counterAccountId, amount, currency: next.settings.currency,
      sourceType: "transaction", sourceId: transaction.id, note: transaction.note,
    });
    cashSources.add(sourceKey);
  };
  const addBankFee = (transaction: Transaction) => {
    const fee = Math.max(0, Number(transaction.feeAmount) || 0);
    const feeAccountId = transaction.fromAccountId || transaction.accountId;
    if (!feeAccountId || !fee) return;
    const sourceKey = `${transaction.id}:fee`;
    if (cashSources.has(sourceKey)) return;
    cashEvents.push({
      id: createId("cash-fee-event"), at: new Date().toISOString(), date: transaction.date,
      kind: "expense", accountId: feeAccountId, amount: -fee,
      currency: next.settings.currency, sourceType: "bank_fee", sourceId: `${transaction.id}:fee`,
      note: `کارمزد بانکی ${transaction.type} ${transaction.id}`,
    });
    cashSources.add(sourceKey);
  };
  const transactionsToReverse = [
    ...previous.transactions.filter(before => {
      const after = next.transactions.find(item => item.id === before.id);
      return after && after.status !== "باطل" && transactionChanged(before, after);
    }),
    ...removedOrVoidedTransactions,
  ];
  for (const transaction of transactionsToReverse) {
    for (const event of cashEvents.filter(item => item.sourceId === transaction.id || item.sourceId === `${transaction.id}:fee`)) {
      if (event.kind === "reversal" || cashEvents.some(reversal => reversal.reversalOf === event.id)) continue;
      cashEvents.push({
        id: createId("cash-reversal"), at: new Date().toISOString(), date: event.date,
        kind: "reversal", accountId: event.accountId, counterAccountId: event.counterAccountId,
        amount: -event.amount, currency: next.settings.currency, sourceType: "transaction-reversal",
        sourceId: event.sourceId || transaction.id, reversalOf: event.id, note: `معکوس‌سازی رویداد نقدی برای اصلاح ${transaction.id}`,
      });
    }
  }
  for (const transaction of changedTransactions) {
    if (transaction.type === "خرید کالا") addInventory(transaction, "purchase", Math.abs(transaction.quantity || 0));
    if (transaction.type === "فروش کالا") addInventory(transaction, "sale", -Math.abs(transaction.quantity || 0));
    if (transaction.type === "انتقال بین حساب‌ها") {
      addCash(transaction, transaction.fromAccountId, -transaction.amount, "transfer", transaction.toAccountId);
      addCash(transaction, transaction.toAccountId, transaction.amount, "transfer", transaction.fromAccountId);
      addBankFee(transaction);
    } else if (["خرید کالا", "هزینه/خرید توسط شریک", "مساعده/پرداخت به شریک", "پرداخت حقوق", "پرداخت", "هزینه"].includes(transaction.type)) {
      addCash(transaction, transaction.accountId, -transaction.amount, "payment");
    } else if (["فروش کالا", "دریافت توسط شریک", "دریافت تسویه از شریک", "دریافت", "درآمد"].includes(transaction.type)) {
      addCash(transaction, transaction.accountId, transaction.amount, "receipt");
    }
    addBankFee(transaction);
  }
  const previousChecks = new Map(previous.checks.map(check => [check.id, check]));
  for (const check of next.checks) {
    const before = previousChecks.get(check.id);
    if (!before || (before.status === check.status && before.amount === check.amount && before.feeAmount === check.feeAmount && before.bankAccountId === check.bankAccountId)) continue;
    if (before.status === "وصول شده" && before.bankAccountId) {
      cashEvents.push({
        id: createId("cash-event"), at: new Date().toISOString(), date: check.receivedDate,
        kind: "reversal", accountId: before.bankAccountId, amount: -before.amount,
        currency: next.settings.currency, sourceType: "check", sourceId: check.id,
        reversalOf: check.id, note: `معکوس‌سازی وصول قبلی چک ${check.number}`,
      });
      specializedCashAccounts.add(before.bankAccountId);
      if ((Number(before.feeAmount) || 0) > 0) {
        cashEvents.push({
          id: createId("cash-event"), at: new Date().toISOString(), date: check.receivedDate,
          kind: "reversal", accountId: before.bankAccountId, amount: Number(before.feeAmount) || 0,
          currency: next.settings.currency, sourceType: "check_fee_reversal", sourceId: check.id,
          reversalOf: check.id, note: `معکوس‌سازی کارمزد وصول چک ${check.number}`,
        });
      }
    }
    if (check.status === "وصول شده" && check.bankAccountId) {
      cashEvents.push({
        id: createId("cash-event"), at: new Date().toISOString(), date: check.receivedDate,
        kind: "check_receipt", accountId: check.bankAccountId, amount: check.amount,
        currency: next.settings.currency, sourceType: "check", sourceId: check.id,
        note: `وصول چک ${check.number}`,
      });
      specializedCashAccounts.add(check.bankAccountId);
      if ((Number(check.feeAmount) || 0) > 0) {
        cashEvents.push({
          id: createId("cash-event"), at: new Date().toISOString(), date: check.receivedDate,
          kind: "expense", accountId: check.bankAccountId, amount: -(Number(check.feeAmount) || 0),
          currency: next.settings.currency, sourceType: "check_fee", sourceId: check.id,
          note: `کارمزد بانکی وصول چک ${check.number}`,
        });
      }
    } else if (check.status === "برگشتی") {
      const accountId = check.bankAccountId || before.bankAccountId;
      if (accountId) {
        cashEvents.push({
          id: createId("cash-event"), at: new Date().toISOString(), date: check.receivedDate,
          kind: "check_return", accountId, amount: 0,
          currency: next.settings.currency, sourceType: "check", sourceId: check.id,
          note: `برگشت چک ${check.number}`,
        });
        specializedCashAccounts.add(accountId);
      }
    }
  }
  for (const product of next.products) {
    const before = previous.products.find(item => item.id === product.id)?.stock || 0;
    const delta = product.stock - before;
    if (!delta || explicitInventoryProducts.has(product.id) || next.transactions.some(item => inventorySources.has(item.id) && item.productId === product.id)) continue;
    inventoryEvents.push({
      id: createId("inventory-event"),
      at: new Date().toISOString(),
      date,
      kind: "adjustment",
      productId: product.id,
      warehouseId: product.warehouseId,
      quantityEntered: delta,
      unitEntered: product.unit,
      quantityBase: delta,
      baseUnit: product.unit,
      sourceType: "projection_reconciliation",
      note: "ثبت خودکار اختلاف مسیر قدیمی با دفتر رویداد",
    });
  }
  for (const account of next.accounts) {
    const before = previous.accounts.find(item => item.id === account.id)?.balance || 0;
    const delta = account.balance - before;
    if (!delta || explicitCashAccounts.has(account.id) || specializedCashAccounts.has(account.id) || next.transactions.some(item => cashSources.has(`${item.id}:${account.id}`))) continue;
    cashEvents.push({
      id: createId("cash-event"),
      at: new Date().toISOString(),
      date,
      kind: "reversal",
      accountId: account.id,
      amount: delta,
      currency: next.settings.currency,
      sourceType: "projection_reconciliation",
      note: "ثبت خودکار اختلاف مسیر قدیمی با دفتر نقدینگی",
    });
  }
  return { ...next, inventoryEvents, cashEvents };
}

export function todayJalali() {
  const formatted = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return formatted
    .replace(/[۰-۹]/g, digit =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/-/g, "/")
    )
    .replace(/-/g, "/");
}

export function formatDate(value: string) {
  if (!value) return "—";
  return value.replace(/-/g, "/");
}

export function personName(state: AppState, id?: string) {
  return state.people.find(person => person.id === id)?.name || "بدون طرف حساب";
}

export function transactionLabel(type: TransactionType) {
  return {
    فروش: "فروش",
    خرید: "خرید",
    دریافت: "دریافت",
    پرداخت: "پرداخت",
    هزینه: "هزینه",
    درآمد: "درآمد",
    اصلاحیه: "اصلاحیه",
    "انتقال بین حساب‌ها": "انتقال بین حساب‌ها",
    "خرید کالا": "خرید کالا",
    "فروش کالا": "فروش کالا",
    "هزینه/خرید توسط شریک": "هزینه/خرید توسط شریک",
    "دریافت توسط شریک": "دریافت توسط شریک",
    "مساعده/پرداخت به شریک": "مساعده/پرداخت به شریک",
    "دریافت تسویه از شریک": "دریافت تسویه از شریک",
    "پرداخت حقوق": "پرداخت حقوق",
  }[type];
}

export function exportPayload(state: AppState) {
  const data = normalizeState(state);
  return JSON.stringify(
    {
      format: "accounting-workshop-backup",
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      application: "حسابداری کارگاه",
      currency: {
        code: data.settings.currencyCode || DEFAULT_CURRENCY_CODE,
        label: currencyLabel(data.settings.currencyCode),
      },
      collections: {
        people: data.people.length,
        products: data.products.length,
        warehouses: data.warehouses.length,
        priceHistory: data.priceHistory.length,
        paymentRules: data.paymentRules.length,
        invoices: data.invoices.length,
        transactions: data.transactions.length,
        checks: data.checks.length,
        accounts: data.accounts.length,
        audit: data.audit.length,
        inventoryEvents: data.inventoryEvents.length,
        cashEvents: data.cashEvents.length,
        productionFormulas: data.productionFormulas.length,
        productionRecords: data.productionRecords.length,
        payrollRecords: data.payrollRecords.length,
      },
      data,
    },
    null,
    2
  );
}

export function importPayload(text: string) {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("ساختار فایل پشتیبان معتبر نیست");
  if (
    parsed.format === "accounting-workshop-backup" &&
    typeof parsed.backupFormatVersion === "number" &&
    parsed.backupFormatVersion > BACKUP_FORMAT_VERSION
  ) {
    throw new Error(
      "این فایل پشتیبان برای نسخهٔ جدیدتری از برنامه ساخته شده است."
    );
  }
  const data = "data" in parsed ? parsed.data : parsed;
  const version =
    typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1;
  const normalized = migrateBackupData(data, version);
  if (
    !Array.isArray(normalized.people) ||
    !Array.isArray(normalized.transactions)
  )
    throw new Error("فایل پشتیبان ناقص است");
  return normalized;
}

export function appendAudit(
  state: AppState,
  action: string,
  note: string
): AppState {
  return {
    ...state,
    audit: [
      ...state.audit,
      { id: createId("audit"), at: new Date().toISOString(), action, note },
    ].slice(-500),
  };
}

type JalaliDateParts = { year: number; month: number; day: number };

// Intl's Persian calendar is the platform's authoritative calendar
// implementation. We use UTC-only day numbers so browser timezone and DST
// cannot change a financial day difference.
const PERSIAN_DATE_FORMATTER = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  calendar: "persian",
  numberingSystem: "latn",
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const PERSIAN_YEAR_STARTS = new Map<number, number>();

function parseJalaliDate(value: string): JalaliDateParts | null {
  const parts = value.replace(/-/g, "/").split("/").map(Number);
  if (
    parts.length !== 3 ||
    parts.some(part => !Number.isInteger(part)) ||
    !isValidJalaliDate(parts[0], parts[1], parts[2])
  )
    return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function utcDayNumber(date: Date) {
  return Math.floor(date.getTime() / 86_400_000);
}

function persianYearStartDayNumber(year: number) {
  const cached = PERSIAN_YEAR_STARTS.get(year);
  if (cached !== undefined) return cached;
  const gregorianYear = year + 621;
  for (let offset = 0; offset <= 20; offset++) {
    const candidate = new Date(Date.UTC(gregorianYear, 2, 19 + offset, 12));
    const parts = Object.fromEntries(
      PERSIAN_DATE_FORMATTER.formatToParts(candidate).map(part => [part.type, part.value])
    );
    if (parts.year === String(year) && parts.month === "1" && parts.day === "1") {
      const dayNumber = utcDayNumber(candidate);
      PERSIAN_YEAR_STARTS.set(year, dayNumber);
      return dayNumber;
    }
  }
  return null;
}

function jalaliDayNumber(year: number, month: number, day: number) {
  const yearStart = persianYearStartDayNumber(year);
  if (yearStart === null) return null;
  const monthOffset = month <= 7 ? (month - 1) * 31 : (month - 1) * 30 + 6;
  return yearStart + monthOffset + day - 1;
}

export function isValidJalaliDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const maxDay = month <= 6 ? 31 : month <= 11 ? 30 : isJalaliLeapYear(year) ? 30 : 29;
  return Number.isInteger(day) && day >= 1 && day <= maxDay;
}

export function jalaliDayDifference(from: string, to: string) {
  const start = parseJalaliDate(from);
  const end = parseJalaliDate(to);
  if (!start || !end) return 0;
  const startNumber = jalaliDayNumber(start.year, start.month, start.day);
  const endNumber = jalaliDayNumber(end.year, end.month, end.day);
  if (startNumber === null || endNumber === null) return 0;
  return Math.max(0, endNumber - startNumber);
}

export function jalaliDateKey(value: string) {
  const parsed = parseJalaliDate(value);
  if (!parsed) {
    return "9999/99/99";
  }
  return `${String(parsed.year).padStart(4, "0")}/${String(parsed.month).padStart(2, "0")}/${String(parsed.day).padStart(2, "0")}`;
}
export function jalaliMonthDayBasis(date: string) {
  const parsed = parseJalaliDate(date);
  if (!parsed) return 30;
  if (parsed.month <= 6) return 31;
  if (parsed.month <= 11) return 30;
  return isJalaliLeapYear(parsed.year) ? 30 : 29;
}
export function isJalaliLeapYear(year: number) {
  const current = persianYearStartDayNumber(year);
  const next = persianYearStartDayNumber(year + 1);
  return current !== null && next !== null && next - current === 366;
}

/** Returns the Saturday-first weekday index used by the Persian date picker. */
export function jalaliWeekday(year: number, month: number, day: number) {
  const dayNumber = jalaliDayNumber(year, month, day);
  if (dayNumber === null) return 0;
  return (new Date(dayNumber * 86_400_000).getUTCDay() + 1) % 7;
}

export interface FIFOSettlement {
  checkId: string;
  invoiceId: string;
  amount: number;
  principalAmount: number;
  profit: number;
  days: number;
}

export interface FIFOSettlementBalance {
  remainingCheck: number;
  remainingInvoice: number;
}

// Interest and unit-conversion calculations can leave a harmless fraction of
// a currency unit. Treat values below one cent/toman as zero so FIFO can
// continue to the next invoice instead of stopping on floating-point residue.
const FIFO_EPSILON = 0.01;

function principalCollectedForInvoice(
  invoiceAmount: number,
  rows: FIFOSettlement[]
) {
  const collected = rows.reduce((sum, item) => sum + item.principalAmount, 0);
  return Math.min(
    invoiceAmount,
    Math.abs(invoiceAmount - collected) <= FIFO_EPSILON
      ? invoiceAmount
      : collected
  );
}

export function settleChecksFIFO(
  checks: Check[],
  invoices: Invoice[],
  paymentRules: PaymentRule[] = [],
  dayBasis: number | "شمسی" = 30
) {
  const settlements: FIFOSettlement[] = [];
  const eligibleInvoices = [...invoices]
    .filter(invoice => invoice.type === "فروش" && invoice.status !== "باطل")
    .sort(
      (a, b) =>
        jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date)) ||
        a.id.localeCompare(b.id)
    );
  const eligibleChecks = [...checks]
    .filter(
      check =>
        !["باطل", "عودت داده شده", "جایگزین شده", "خرج شده"].includes(
          check.status
        )
    )
    .sort(
      (a, b) =>
        jalaliDateKey(a.dueDate).localeCompare(jalaliDateKey(b.dueDate)) ||
        jalaliDateKey(a.receivedDate).localeCompare(
          jalaliDateKey(b.receivedDate)
        ) ||
        a.id.localeCompare(b.id)
    );
  const remainingByInvoice = new Map(
    eligibleInvoices.map(invoice => [invoice.id, Math.max(0, invoice.amount)])
  );
  const remainingByCheck = new Map(
    eligibleChecks.map(check => [check.id, Math.max(0, check.amount)])
  );

  for (const check of eligibleChecks) {
    let checkRemaining = remainingByCheck.get(check.id) || 0;
    for (const invoice of eligibleInvoices) {
      if (
        invoice.partyId !== check.partyId ||
        checkRemaining <= FIFO_EPSILON
      )
        continue;
      const baseRemaining = remainingByInvoice.get(invoice.id) || 0;
      if (baseRemaining <= FIFO_EPSILON) {
        remainingByInvoice.set(invoice.id, 0);
        continue;
      }
      const rule =
        paymentRules.find(item => item.id === invoice.paymentRuleId) ||
        paymentRules.find(item => item.active);
      const probe = calculateLateProfit(
        { ...check, amount: checkRemaining },
        rule,
        invoice.date,
        baseRemaining,
        dayBasis
      );
      const amount = Math.min(checkRemaining, probe.settled);
      const factor = baseRemaining > 0 ? probe.settled / baseRemaining : 1;
      const calculatedPrincipal = Math.min(
        baseRemaining,
        amount / Math.max(1, factor)
      );
      const principalAmount =
        baseRemaining - calculatedPrincipal <= FIFO_EPSILON
          ? baseRemaining
          : calculatedPrincipal;
      const profit = Math.max(0, amount - principalAmount);
      if (amount <= FIFO_EPSILON || principalAmount <= FIFO_EPSILON) continue;
      settlements.push({
        checkId: check.id,
        invoiceId: invoice.id,
        amount,
        principalAmount,
        profit,
        days: probe.days,
      });
      const invoiceRemaining = Math.max(0, baseRemaining - principalAmount);
      remainingByInvoice.set(
        invoice.id,
        invoiceRemaining <= FIFO_EPSILON ? 0 : invoiceRemaining
      );
      const nextCheckRemaining = Math.max(0, checkRemaining - amount);
      checkRemaining =
        nextCheckRemaining <= FIFO_EPSILON ? 0 : nextCheckRemaining;
      remainingByCheck.set(check.id, checkRemaining);
      if ((remainingByInvoice.get(invoice.id) || 0) > FIFO_EPSILON) break;
    }
  }
  return settlements;
}

/**
 * Returns the check and invoice balances immediately after each allocation.
 * The key is stable for the settlement row and keeps the UI from displaying
 * the final balance on every accordion row.
 */
export function getSettlementBalances(
  settlements: FIFOSettlement[],
  checks: Check[],
  invoices: Invoice[]
) {
  const remainingChecks = new Map(
    checks.map(check => [check.id, Math.max(0, check.amount)])
  );
  const remainingInvoices = new Map(
    invoices.map(invoice => [invoice.id, Math.max(0, invoice.amount)])
  );
  const result = new Map<string, FIFOSettlementBalance>();
  settlements.forEach(item => {
    const remainingCheck = Math.max(
      0,
      (remainingChecks.get(item.checkId) || 0) - item.amount
    );
    const remainingInvoice = Math.max(
      0,
      (remainingInvoices.get(item.invoiceId) || 0) - item.principalAmount
    );
    remainingChecks.set(item.checkId, remainingCheck);
    remainingInvoices.set(item.invoiceId, remainingInvoice);
    result.set(`${item.checkId}:${item.invoiceId}`, {
      remainingCheck,
      remainingInvoice,
    });
  });
  return result;
}

export interface EffectiveProfitBreakdown {
  collectionDate: string;
  apparentCost: number;
  currentCost: number;
  apparentProfit: number;
  effectiveProfit: number;
  apparentRate: number;
  effectiveRate: number;
  costBasisKnown: boolean;
}

/**
 * سود هر تخصیص را در دو مبنا گزارش می‌کند: سود ظاهری بر اساس بهای ثبت‌شده
 * هنگام فروش و سود مؤثر بر اساس آخرین بهای تولید موجود تا تاریخ واقعی وصول.
 * تاریخ سررسید عمداً در این محاسبه استفاده نمی‌شود.
 */
export function calculateEffectiveProfitForAllocation(
  state: AppState,
  invoice: Invoice,
  allocation: Pick<FIFOSettlement, "amount" | "principalAmount"> | CheckAllocation,
  check?: Check
): EffectiveProfitBreakdown | null {
  const collectionDate = check?.collectedDate;
  if (!collectionDate || check?.status !== "وصول شده") return null;
  const principalAmount = allocation.principalAmount ?? allocation.amount;
  const ratio = invoice.amount > 0
    ? Math.min(1, Math.max(0, principalAmount / invoice.amount))
    : 0;
  let apparentUnitCostKnown = true;
  let currentUnitCostKnown = true;
  let apparentCost = 0;
  let currentCost = 0;
  for (const item of invoice.items) {
    const quantityBase = Number(item.quantityBase ?? item.quantity) || 0;
    const saleProduction = [...state.productionRecords]
      .filter(record =>
        record.outputProductId === item.productId &&
        jalaliDateKey(record.date) <= jalaliDateKey(invoice.date) &&
        Number.isFinite(record.unitCost) && record.unitCost >= 0
      )
      .sort((a, b) =>
        jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date)) ||
        b.id.localeCompare(a.id)
      )[0];
    const saleUnitCost = Number(item.unitCostAtSale ?? saleProduction?.unitCost);
    if (!Number.isFinite(saleUnitCost) || saleUnitCost < 0) apparentUnitCostKnown = false;
    else apparentCost += quantityBase * saleUnitCost;
    const production = [...state.productionRecords]
      .filter(record =>
        record.outputProductId === item.productId &&
        jalaliDateKey(record.date) <= jalaliDateKey(collectionDate) &&
        Number.isFinite(record.unitCost) && record.unitCost >= 0
      )
      .sort((a, b) =>
        jalaliDateKey(b.date).localeCompare(jalaliDateKey(a.date)) ||
        b.id.localeCompare(a.id)
      )[0];
    const currentUnitCost = production?.unitCost ?? saleUnitCost;
    if (!Number.isFinite(currentUnitCost) || currentUnitCost < 0) currentUnitCostKnown = false;
    else currentCost += quantityBase * currentUnitCost;
  }
  const allocatedApparentCost = apparentCost * ratio;
  const allocatedCurrentCost = currentCost * ratio;
  const apparentProfit = allocation.amount - allocatedApparentCost;
  const effectiveProfit = allocation.amount - allocatedCurrentCost;
  return {
    collectionDate,
    apparentCost: allocatedApparentCost,
    currentCost: allocatedCurrentCost,
    apparentProfit,
    effectiveProfit,
    apparentRate: allocatedApparentCost > 0 ? apparentProfit / allocatedApparentCost : 0,
    effectiveRate: allocatedCurrentCost > 0 ? effectiveProfit / allocatedCurrentCost : 0,
    costBasisKnown: apparentUnitCostKnown && currentUnitCostKnown,
  };
}

export interface CollectionProfitReportRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  checkId: string;
  checkNumber: string;
  partyId?: string;
  collectionDate: string;
  month: string;
  year: string;
  collectedAmount: number;
  lateCost: number;
  apparentCost: number;
  currentCost: number;
  apparentProfit: number;
  effectiveProfit: number;
  apparentRate: number;
  effectiveRate: number;
}

/** تمام تخصیص‌های وصول‌شده را به‌صورت ردیف‌های قابل تجمیع برمی‌گرداند. */
export function buildCollectionProfitReport(state: AppState): CollectionProfitReportRow[] {
  const rows: CollectionProfitReportRow[] = [];
  const settlements = settleChecksFIFO(
    state.checks,
    state.invoices,
    state.paymentRules,
    state.settings.dayBasis
  );
  settlements.forEach(allocation => {
    const invoice = state.invoices.find(item => item.id === allocation.invoiceId);
    const check = state.checks.find(item => item.id === allocation.checkId);
    if (!invoice || !check || invoice.type !== "فروش" || invoice.status === "باطل") return;
    const breakdown = calculateEffectiveProfitForAllocation(state, invoice, allocation, check);
    if (!breakdown) return;
        const parts = breakdown.collectionDate.split("/");
        const year = parts[0] || "نامشخص";
        const month = parts.length >= 2 ? `${year}/${parts[1]}` : year;
        rows.push({
          id: `${invoice.id}:${check.id}`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          checkId: check.id,
          checkNumber: check.number,
          partyId: invoice.partyId,
          collectionDate: breakdown.collectionDate,
          month,
          year,
          collectedAmount: allocation.amount,
          lateCost: allocation.profit || 0,
          apparentCost: breakdown.apparentCost,
          currentCost: breakdown.currentCost,
          apparentProfit: breakdown.apparentProfit,
          effectiveProfit: breakdown.effectiveProfit,
          apparentRate: breakdown.apparentRate,
          effectiveRate: breakdown.effectiveRate,
        });
  });
  return rows.sort((a, b) =>
    jalaliDateKey(b.collectionDate).localeCompare(jalaliDateKey(a.collectionDate)) ||
    a.invoiceNumber.localeCompare(b.invoiceNumber)
  );
}

export function allocateCheckFIFO(
  check: Check,
  invoices: Invoice[],
  paymentRules: PaymentRule[] = []
) {
  return settleChecksFIFO([check], invoices, paymentRules).map(item => ({
    invoice: invoices.find(invoice => invoice.id === item.invoiceId)!,
    allocation: item.amount,
    principalAmount: item.principalAmount,
    profit: item.profit,
    remainingAfter: Math.max(0, check.amount - item.amount),
  }));
}

export function applyCheckFIFO(state: AppState, check: Check) {
  if (!check.partyId) return state;
  const partyChecks = state.checks.map(item =>
    item.id === check.id ? check : item
  );
  const settlements = settleChecksFIFO(
    partyChecks,
    state.invoices,
    state.paymentRules,
    state.settings.dayBasis
  );
  const byInvoice = new Map<string, FIFOSettlement[]>();
  settlements.forEach(item =>
    byInvoice.set(item.invoiceId, [
      ...(byInvoice.get(item.invoiceId) || []),
      item,
    ])
  );
  const now = new Date().toISOString();
  const invoices = state.invoices.map(invoice => {
    if (
      invoice.partyId !== check.partyId ||
      invoice.type !== "فروش" ||
      invoice.status === "باطل"
    )
      return invoice;
    const rows = byInvoice.get(invoice.id) || [];
    const paidAmount = principalCollectedForInvoice(invoice.amount, rows);
    return {
      ...invoice,
      paidAmount,
      allocations: rows.map(item => ({
        checkId: item.checkId,
        amount: item.amount,
        principalAmount: item.principalAmount,
        profit: item.profit,
        days: item.days,
        allocatedAt: now,
      })),
      status:
        paidAmount >= invoice.amount
          ? ("تسویه شده" as const)
          : paidAmount > 0
            ? ("تسویه جزئی" as const)
            : ("باز" as const),
    };
  });
  return { ...state, invoices };
}

export function rebuildCheckAllocations(state: AppState): AppState {
  const settlements = settleChecksFIFO(
    state.checks,
    state.invoices,
    state.paymentRules,
    state.settings.dayBasis
  );
  const byInvoice = new Map<string, FIFOSettlement[]>();
  settlements.forEach(item => {
    byInvoice.set(item.invoiceId, [
      ...(byInvoice.get(item.invoiceId) || []),
      item,
    ]);
  });
  const now = new Date().toISOString();
  const invoices = state.invoices.map(invoice => {
    if (invoice.type !== "فروش" || invoice.status === "باطل") return invoice;
    const rows = byInvoice.get(invoice.id) || [];
    const paidAmount = principalCollectedForInvoice(invoice.amount, rows);
    return {
      ...invoice,
      paidAmount,
      allocations: rows.map(item => ({
        checkId: item.checkId,
        amount: item.amount,
        principalAmount: item.principalAmount,
        profit: item.profit,
        days: item.days,
        allocatedAt: now,
      })),
      status:
        paidAmount >= invoice.amount
          ? ("تسویه شده" as const)
          : paidAmount > 0
            ? ("تسویه جزئی" as const)
            : ("باز" as const),
    };
  });
  return { ...state, invoices };
}

export interface PurchasePayableSettlement {
  paymentId: string;
  invoiceId: string;
  supplierId: string;
  amount: number;
  allocatedAt: string;
}

/**
 * Allocates supplier payments to the oldest open purchase invoices for the
 * same supplier. This is intentionally separate from customer-sales FIFO.
 */
export function settlePurchasePayablesFIFO(
  invoices: Invoice[],
  payments: PurchasePayment[]
) {
  const settlements: PurchasePayableSettlement[] = [];
  const openInvoices = invoices
    .filter(invoice => invoice.type === "خرید" && invoice.status !== "باطل" && invoice.partyId)
    .sort((a, b) => jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date)) || a.id.localeCompare(b.id));
  const openById = new Map(openInvoices.map(invoice => [invoice.id, Math.max(0, invoice.amount)]));
  const allocatedAt = new Date().toISOString();
  const sortedPayments = [...payments]
    .filter(payment => payment.amount > FIFO_EPSILON && payment.supplierId)
    .sort((a, b) => jalaliDateKey(a.date).localeCompare(jalaliDateKey(b.date)) || a.id.localeCompare(b.id));
  for (const payment of sortedPayments) {
    let remaining = payment.amount;
    for (const invoice of openInvoices) {
      if (invoice.partyId !== payment.supplierId || remaining <= FIFO_EPSILON) continue;
      const invoiceRemaining = openById.get(invoice.id) || 0;
      if (invoiceRemaining <= FIFO_EPSILON) {
        openById.set(invoice.id, 0);
        continue;
      }
      const amount = Math.min(remaining, invoiceRemaining);
      if (amount <= FIFO_EPSILON) continue;
      settlements.push({
        paymentId: payment.id,
        invoiceId: invoice.id,
        supplierId: payment.supplierId,
        amount,
        allocatedAt,
      });
      openById.set(invoice.id, Math.max(0, invoiceRemaining - amount));
      remaining = Math.max(0, remaining - amount);
    }
  }
  return settlements;
}

export function rebuildPurchasePayables(state: AppState): AppState {
  const settlements = settlePurchasePayablesFIFO(state.invoices, state.purchasePayments);
  const byInvoice = new Map<string, PurchasePayableSettlement[]>();
  settlements.forEach(item => byInvoice.set(item.invoiceId, [...(byInvoice.get(item.invoiceId) || []), item]));
  const invoices = state.invoices.map(invoice => {
    if (invoice.type !== "خرید" || invoice.status === "باطل") return invoice;
    const paidAmount = Math.min(
      invoice.amount,
      (byInvoice.get(invoice.id) || []).reduce((sum, item) => sum + item.amount, 0)
    );
    return {
      ...invoice,
      paidAmount,
      status: paidAmount >= invoice.amount
        ? ("تسویه شده" as const)
        : paidAmount > FIFO_EPSILON
          ? ("تسویه جزئی" as const)
          : ("باز" as const),
    };
  });
  return {
    ...state,
    invoices,
    purchasePayableAllocations: settlements.map(item => ({
      id: createId("purchase-allocation"),
      paymentId: item.paymentId,
      invoiceId: item.invoiceId,
      amount: item.amount,
      allocatedAt: item.allocatedAt,
    })),
  };
}

export function purchaseSupplierBalance(state: AppState, supplierId: string) {
  const invoices = state.invoices
    .filter(invoice => invoice.type === "خرید" && invoice.partyId === supplierId && invoice.status !== "باطل")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const payments = state.purchasePayments
    .filter(payment => payment.supplierId === supplierId)
    .reduce((sum, payment) => sum + payment.amount, 0);
  return { payable: Math.max(0, invoices - payments), credit: Math.max(0, payments - invoices) };
}

export function refreshIssuedCheckStatuses(state: AppState, asOf = todayJalali()): AppState {
  const events = [...state.partnerObligationEvents];
  const issuedChecks = state.issuedChecks.map(check => {
    if (
      check.status === "صادر شده" &&
      jalaliDateKey(check.dueDate) <= jalaliDateKey(asOf) &&
      !events.some(event => event.issuedCheckId === check.id && event.kind === "due")
    ) {
      events.push({
        id: createId("partner-obligation"),
        issuedCheckId: check.id,
        partnerId: check.issuerPartyId,
        date: check.dueDate,
        kind: "due",
        amount: check.amount,
        note: `سررسید چک شریک ${check.number}`,
      });
    }
    return check.status === "صادر شده" && jalaliDateKey(check.dueDate) <= jalaliDateKey(asOf)
      ? { ...check, status: "سررسید شده" as const }
      : check;
  });
  return {
    ...state,
    issuedChecks,
    partnerObligationEvents: events,
  };
}

export function settleIssuedCheck(
  state: AppState,
  issuedCheckId: string,
  status: "پرداخت شده" | "برگشتی",
  date = todayJalali()
) {
  const check = state.issuedChecks.find(item => item.id === issuedCheckId);
  if (!check || ["پرداخت شده", "برگشتی", "باطل"].includes(check.status)) return state;
  const previous = state.partnerObligationEvents.find(
    event => event.issuedCheckId === issuedCheckId && event.kind === "due"
  );
  const events = [...state.partnerObligationEvents];
  if (previous) {
    events.push({
      id: createId("partner-obligation"),
      issuedCheckId,
      partnerId: check.issuerPartyId,
      date,
      kind: "reversal",
      amount: -previous.amount,
      reversalOf: previous.id,
      note: `معکوس‌سازی تعهد چک ${check.number}`,
    });
  }
  events.push({
    id: createId("partner-obligation"),
    issuedCheckId,
    partnerId: check.issuerPartyId,
    date,
    kind: status === "پرداخت شده" ? "paid" : "returned",
    amount: status === "پرداخت شده" ? check.amount : 0,
    note: status === "پرداخت شده" ? `پرداخت چک شریک ${check.number}` : `برگشت چک شریک ${check.number}`,
  });
  return {
    ...state,
    issuedChecks: state.issuedChecks.map(item => item.id === issuedCheckId ? { ...item, status } : item),
    partnerObligationEvents: events,
  };
}

export function releasePurchasePayment(state: AppState, paymentId: string) {
  const payment = state.purchasePayments.find(item => item.id === paymentId);
  if (!payment) return state;
  const checks = state.checks.map(check =>
    check.spentForPaymentId === paymentId
      ? { ...check, status: "نزد ما" as const, spentForPaymentId: undefined, spentToPartyId: undefined }
      : check
  );
  const cashReversals = state.cashEvents
    .filter(
      event =>
        ["purchase_payment", "purchase_payment_fee"].includes(event.sourceType) &&
        event.sourceId === paymentId &&
        !state.cashEvents.some(
          reversal => reversal.reversalOf === event.id
        )
    )
    .map(event => ({
      id: createId("cash-reversal"),
      at: new Date().toISOString(),
      date: todayJalali(),
      kind: "reversal" as const,
      accountId: event.accountId,
      amount: -event.amount,
      currency: event.currency,
      sourceType: event.sourceType === "purchase_payment_fee" ? "purchase_payment_fee_reversal" : "purchase_payment_reversal",
      sourceId: paymentId,
      reversalOf: event.id,
      note: `معکوس‌سازی پرداخت خرید ${paymentId}`,
    }));
  const issuedCheck = payment.issuedCheckId
    ? state.issuedChecks.find(check => check.id === payment.issuedCheckId)
    : undefined;
  const partnerEvents = issuedCheck
    ? state.partnerObligationEvents.some(
        event =>
          event.issuedCheckId === issuedCheck.id &&
          event.kind === "reversal" &&
          event.reversalOf ===
            state.partnerObligationEvents.find(
              due => due.issuedCheckId === issuedCheck.id && due.kind === "due"
            )?.id
      )
      ? state.partnerObligationEvents
      : [
          ...state.partnerObligationEvents,
          ...(state.partnerObligationEvents
            .filter(event => event.issuedCheckId === issuedCheck.id && event.kind === "due")
            .map(event => ({
              id: createId("partner-obligation"),
              issuedCheckId: issuedCheck.id,
              partnerId: issuedCheck.issuerPartyId,
              date: todayJalali(),
              kind: "reversal" as const,
              amount: -event.amount,
              reversalOf: event.id,
              note: `معکوس‌سازی تعهد چک شریک ${issuedCheck.number}`,
            }))),
        ]
    : state.partnerObligationEvents;
  return rebuildPurchasePayables({
    ...state,
    checks,
    purchasePayments: state.purchasePayments.filter(item => item.id !== paymentId),
    cashEvents: [...state.cashEvents, ...cashReversals],
    issuedChecks: payment.issuedCheckId
      ? state.issuedChecks.map(check => check.id === payment.issuedCheckId ? { ...check, status: "باطل" as const } : check)
      : state.issuedChecks,
    partnerObligationEvents: partnerEvents,
  });
}

/**
 * Releases only payments whose FIFO allocations belong exclusively to one
 * invoice. A payment shared by multiple supplier invoices is retained so an
 * edit or deletion cannot silently disturb the other invoices.
 */
export function releasePurchasePaymentsForInvoice(
  state: AppState,
  invoiceId: string
): AppState {
  const allocations = state.purchasePayableAllocations.filter(
    allocation => allocation.invoiceId === invoiceId
  );
  const paymentIds = new Set(
    allocations
      .filter(allocation =>
        state.purchasePayableAllocations.every(
          other =>
            other.paymentId !== allocation.paymentId ||
            other.invoiceId === invoiceId
        )
      )
      .map(allocation => allocation.paymentId)
  );
  return Array.from(paymentIds).reduce(
    (current, paymentId) => releasePurchasePayment(current, paymentId),
    state
  );
}

export function purchasePaymentIdsExclusiveToInvoice(
  state: AppState,
  invoiceId: string
): Set<string> {
  return new Set(
    state.purchasePayableAllocations
      .filter(allocation => allocation.invoiceId === invoiceId)
      .filter(allocation =>
        state.purchasePayableAllocations.every(
          other =>
            other.paymentId !== allocation.paymentId ||
            other.invoiceId === invoiceId
        )
      )
      .map(allocation => allocation.paymentId)
  );
}

export function appendPurchasePaymentCashEvents(state: AppState): AppState {
  const existing = new Set(
    state.cashEvents
      .filter(event => event.sourceType === "purchase_payment")
      .map(event => event.sourceId)
  );
  const events = state.purchasePayments
    .filter(payment =>
      (payment.method === "نقدی" || payment.method === "حساب داخلی") &&
      payment.accountId &&
      !existing.has(payment.id)
    )
    .map(payment => ({
      id: createId("cash-payment"),
      at: new Date().toISOString(),
      date: payment.date,
      kind: "payment" as const,
      accountId: payment.accountId!,
      amount: -Math.abs(payment.amount),
      currency: state.settings.currency,
      sourceType: "purchase_payment",
      sourceId: payment.id,
      note: `پرداخت خرید به تأمین‌کننده ${payment.supplierId}`,
    }));
  const feeEvents = state.purchasePayments
    .filter(payment =>
      (payment.method === "نقدی" || payment.method === "حساب داخلی") &&
      payment.accountId &&
      (Number(payment.feeAmount) || 0) > 0 &&
      !state.cashEvents.some(event => event.sourceType === "purchase_payment_fee" && event.sourceId === payment.id)
    )
    .map(payment => ({
      id: createId("cash-payment-fee"),
      at: new Date().toISOString(),
      date: payment.date,
      kind: "expense" as const,
      accountId: payment.accountId!,
      amount: -Math.abs(Number(payment.feeAmount) || 0),
      currency: state.settings.currency,
      sourceType: "purchase_payment_fee",
      sourceId: payment.id,
      note: `کارمزد بانکی پرداخت خرید ${payment.id}`,
    }));
  return events.length || feeEvents.length
    ? rebuildCashProjection({ ...state, cashEvents: [...state.cashEvents, ...events, ...feeEvents] })
    : state;
}

export function calculateLateProfit(
  check: Check,
  rule?: PaymentRule,
  invoiceDate?: string,
  invoiceBaseAmount = check.amount,
  dayBasisOverride: number | "شمسی" = 30
) {
  // A due date is not a collection date. Until the check is actually collected,
  // no late fee is earned; the informational overdue period starts at dueDate
  // and ends at the recorded collectedDate.
  const days = check.collectedDate
    ? jalaliDayDifference(check.dueDate, check.collectedDate)
    : 0;
  const activeRule = rule || {
    dayBasis: 30,
    graceDays: 0,
    tiers: [{ maxDays: 9999, rate: 0 }],
  };
  const overdueDays = Math.max(0, days - activeRule.graceDays);
  const tier =
    [...activeRule.tiers]
      .sort((a, b) => a.maxDays - b.maxDays)
      .find(item => overdueDays <= item.maxDays) ||
    activeRule.tiers[activeRule.tiers.length - 1];
  const rate = tier?.rate || 0;
  const basis =
    dayBasisOverride === "شمسی"
      ? jalaliMonthDayBasis(
          invoiceDate || check.invoiceDate || check.receivedDate
        )
      : Math.max(1, Number(dayBasisOverride) || activeRule.dayBasis || 30);
  const profit = invoiceBaseAmount * ((rate * overdueDays) / basis);
  const settled = invoiceBaseAmount + profit;
  const remaining = Math.max(0, settled - check.amount);
  const remainingBase = settled
    ? remaining / (1 + (rate * overdueDays) / basis)
    : 0;
  return {
    days,
    overdueDays,
    rate,
    base: invoiceBaseAmount,
    profit,
    settled,
    remaining,
    remainingBase,
  };
}

export function calculateMetrics(state: AppState) {
  const valid = state.transactions.filter(item => item.status !== "باطل");
  const sales = valid
    .filter(item => item.type === "فروش")
    .reduce((sum, item) => sum + item.amount, 0);
  const purchases = valid
    .filter(item => item.type === "خرید")
    .reduce((sum, item) => sum + item.amount, 0);
  const receipts = valid
    .filter(item => item.type === "دریافت" || item.type === "درآمد")
    .reduce((sum, item) => sum + item.amount, 0);
  const payments = valid
    .filter(item => ["پرداخت", "هزینه"].includes(item.type))
    .reduce((sum, item) => sum + item.amount, 0);
  const outstandingChecks = state.checks
    .filter(item => ["نزد ما", "تودیع شده"].includes(item.status))
    .reduce((sum, item) => sum + item.amount, 0);
  return {
    sales,
    purchases,
    receipts,
    payments,
    outstandingChecks,
    balance: receipts - payments,
  };
}

export const navItems: Array<{
  id: PageId;
  label: string;
  caption: string;
  icon: string;
}> = [
  {
    id: "dashboard",
    label: "نمای کلی",
    caption: "وضعیت امروز",
    icon: "layout-dashboard",
  },
  {
    id: "invoices",
    label: "فاکتورها",
    caption: "فروش و خرید",
    icon: "file-text",
  },
  {
    id: "vendorDirectory",
    label: "تأمین‌کنندگان و استعلام",
    caption: "فهرست و مقایسه قیمت",
    icon: "clipboard-list",
  },
  {
    id: "transactions",
    label: "عملیات مالی",
    caption: "فروش و دریافت",
    icon: "arrow-left-right",
  },
  {
    id: "payroll",
    label: "حقوق و دستمزد",
    caption: "پرداخت و حقوق پرداختنی",
    icon: "wallet-cards",
  },
  {
    id: "banks",
    label: "بانک‌ها و صندوق‌ها",
    caption: "موجودی و حساب‌ها",
    icon: "wallet-cards",
  },
  {
    id: "people",
    label: "طرف حساب‌ها",
    caption: "مشتری و تأمین‌کننده",
    icon: "users",
  },
  {
    id: "inventory",
    label: "انبار و کالا",
    caption: "موجودی و قیمت",
    icon: "boxes",
  },
  {
    id: "production",
    label: "تولید",
    caption: "فرمول و هزینه ساخت",
    icon: "boxes",
  },
  {
    id: "prices",
    label: "تاریخچه قیمت",
    caption: "قیمت‌های معتبر",
    icon: "tags",
  },
  {
    id: "paymentRules",
    label: "شرایط پرداخت",
    caption: "پله‌های هزینه دیرکرد",
    icon: "percent",
  },
  {
    id: "checks",
    label: "چک‌ها",
    caption: "سررسید و وضعیت",
    icon: "file-clock",
  },
  {
    id: "monthClose",
    label: "بستن ماه",
    caption: "تسویه و هزینه دیرکرد",
    icon: "lock-keyhole",
  },
  {
    id: "reports",
    label: "گزارش‌ها",
    caption: "خروجی و تحلیل",
    icon: "chart-no-axes-combined",
  },
  {
    id: "backup",
    label: "پشتیبان و بازیابی",
    caption: "امنیت و انتقال داده",
    icon: "cloud-cog",
  },
  {
    id: "settings",
    label: "تنظیمات برنامه",
    caption: "مشخصات کارگاه",
    icon: "settings",
  },
];

export { seedState };
