import { createId } from "./accounting";

export type EntityStatus = "فعال" | "غیرفعال";

export interface ManagedWarehouse {
  id: string;
  code: string;
  name: string;
  kind: "مواد اولیه" | "محصول تولیدی" | "بازرگانی" | "عمومی";
  status: EntityStatus;
  note: string;
}

export interface ProductionStage {
  id: string;
  code: string;
  name: string;
  order: number;
  status: EntityStatus;
  note: string;
}

export interface DiscountLine {
  id: string;
  description: string;
  amount: number;
  date: string;
}

export type CheckLocation =
  | { kind: "نزد ما" }
  | { kind: "وصول شده"; accountId: string }
  | { kind: "تودیع شده"; partyId: string }
  | { kind: "برگشتی"; location: "نزد ما" | "بانک" | "تودیع شده"; accountId?: string; partyId?: string }
  | { kind: "جایگزین شده"; replacementCheckId: string }
  | { kind: "باطل" };

export function calculateUnitQuantity(quantity: number, unit: string, baseUnit: string, conversionRate = 1) {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("مقدار نامعتبر است");
  if (!conversionRate || conversionRate <= 0) throw new Error("ضریب تبدیل باید بزرگ‌تر از صفر باشد");
  return unit === baseUnit ? quantity : quantity * conversionRate;
}

export function calculateInvoiceLineTotal(quantity: number, unit: string, baseUnit: string, baseUnitPrice: number, conversionRate = 1) {
  const baseQuantity = calculateUnitQuantity(quantity, unit, baseUnit, conversionRate);
  if (!Number.isFinite(baseUnitPrice) || baseUnitPrice < 0) throw new Error("قیمت واحد نامعتبر است");
  return { baseQuantity, total: baseQuantity * baseUnitPrice };
}

export function calculateInvoiceNetTotal(grossTotal: number, discounts: DiscountLine[] = []) {
  const validDiscount = discounts.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  return Math.max(0, grossTotal - validDiscount);
}

export function addInvoiceDiscount(discounts: DiscountLine[], description: string, amount: number, date: string) {
  if (!description.trim()) throw new Error("شرح تخفیف الزامی است");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("مبلغ تخفیف باید بزرگ‌تر از صفر باشد");
  return [...discounts, { id: createId("discount"), description: description.trim(), amount, date }];
}

export function toggleEntity<T extends { id: string; status: EntityStatus }>(items: T[], id: string, status: EntityStatus) {
  return items.map(item => item.id === id ? { ...item, status } : item);
}

export function validateWarehouseEdit(warehouse: ManagedWarehouse) {
  if (!warehouse.name.trim()) throw new Error("نام انبار الزامی است");
  if (!warehouse.code.trim()) throw new Error("کد انبار الزامی است");
  return { ...warehouse, name: warehouse.name.trim(), code: warehouse.code.trim() };
}

export function validateStageEdit(stage: ProductionStage) {
  if (!stage.name.trim()) throw new Error("نام مرحله الزامی است");
  if (!Number.isInteger(stage.order) || stage.order < 1) throw new Error("ترتیب مرحله نامعتبر است");
  return { ...stage, name: stage.name.trim() };
}

export function canDeleteWarehouse(warehouseId: string, referencedWarehouseIds: string[]) {
  return !referencedWarehouseIds.includes(warehouseId);
}

export function canDeleteStage(stageId: string, referencedStageIds: string[]) {
  return !referencedStageIds.includes(stageId);
}

export function checkLocationLabel(location: CheckLocation) {
  switch (location.kind) {
    case "وصول شده": return "وصول شده · حساب مقصد مشخص است";
    case "تودیع شده": return "تودیع شده · شخص/طرف حساب مشخص است";
    case "برگشتی": return `برگشتی · ${location.location}`;
    case "جایگزین شده": return "جایگزین شده";
    default: return location.kind;
  }
}
