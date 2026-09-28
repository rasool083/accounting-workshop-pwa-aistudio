import type { AppState } from "../accounting";

/** Synthetic, non-sensitive fixture for the price/unit contract stage. */
export const priceUnitFixture = {
  settings: {
    businessName: "کارگاه آزمایشی",
    currency: "تومان",
    currencyCode: "IRT",
    dayBasis: "شمسی",
    units: ["عدد", "کارتن", "کیلوگرم", "گرم"],
  },
  people: [
    { id: "fixture-customer", code: "C-001", name: "مشتری آزمایشی", type: "مشتری", roles: ["مشتری"], phone: "", balance: 0 },
    { id: "fixture-supplier", code: "S-001", name: "تأمین‌کننده آزمایشی", type: "تأمین‌کننده", roles: ["تأمین‌کننده"], phone: "", balance: 0 },
  ],
  products: [
    { id: "fixture-carton", code: "P-001", name: "قطعهٔ کارتنی", unit: "عدد", unit2: "کارتن", conversionRate: 36, warehouseId: "warehouse-trade", stock: 360, minStock: 0, price: 300000 },
    { id: "fixture-mass", code: "P-002", name: "مادهٔ وزنی", unit: "کیلوگرم", unit2: "گرم", conversionRate: 1000, warehouseId: "warehouse-material", stock: 2.5, minStock: 0, price: 180000 },
    { id: "fixture-single", code: "P-003", name: "کالای تک‌واحدی", unit: "عدد", unit2: "عدد", conversionRate: 1, warehouseId: "warehouse-trade", stock: 10, minStock: 0, price: 50000 },
  ],
  invoices: [
    {
      id: "fixture-invoice-sale",
      number: "F-001",
      type: "فروش",
      date: "1405/07/03",
      partyId: "fixture-customer",
      items: [{ id: "fixture-line-sale", productId: "fixture-carton", description: "قطعهٔ کارتنی", quantity: 10, unit: "کارتن", unitPrice: 300000, total: 108000000, quantityBase: 360, conversionRate: 36, baseUnit: "عدد", priceBasis: "baseUnit" }],
      allocations: [],
      amount: 108000000,
      paidAmount: 0,
      status: "باز",
      note: "سناریوی ۱۰ کارتن × ۳۶ × قیمت پایه",
    },
    {
      id: "fixture-invoice-purchase",
      number: "F-002",
      type: "خرید",
      date: "1405/07/02",
      partyId: "fixture-supplier",
      items: [{ id: "fixture-line-purchase", productId: "fixture-mass", description: "مادهٔ وزنی", quantity: 2500, unit: "گرم", unitPrice: 180000, total: 450000, quantityBase: 2.5, conversionRate: 0.001, baseUnit: "کیلوگرم", priceBasis: "baseUnit" }],
      allocations: [],
      amount: 450000,
      paidAmount: 450000,
      status: "تسویه شده",
      note: "سناریوی ۲۵۰۰ گرم × قیمت هر کیلوگرم",
    },
  ],
  priceHistory: [
    { id: "fixture-price-carton", productId: "fixture-carton", productName: "قطعهٔ کارتنی", scope: "عمومی", effectiveDate: "1405/07/01", unit: "عدد", price: 300000, priceBasis: "baseUnit", baseUnit: "عدد", note: "قیمت پایهٔ fixture" },
    { id: "fixture-price-mass", productId: "fixture-mass", productName: "مادهٔ وزنی", scope: "عمومی", effectiveDate: "1405/07/01", unit: "کیلوگرم", price: 180000, priceBasis: "baseUnit", baseUnit: "کیلوگرم", note: "قیمت پایهٔ fixture" },
  ],
  purchasePayments: [{ id: "fixture-payment", supplierId: "fixture-supplier", amount: 450000, date: "1405/07/03", method: "نقدی", accountId: "cash", note: "پرداخت fixture" }],
  checks: [{ id: "fixture-check", number: "CHK-001", partyId: "fixture-customer", receivedDate: "1405/07/03", dueDate: "1405/08/03", amount: 50000000, status: "نزد ما", bank: "بانک آزمایشی" }],
  transactions: [{ id: "fixture-transaction", type: "دریافت", date: "1405/07/03", accountId: "bank", amount: 50000000, status: "ثبت شده", note: "دریافت fixture" }],
  productionFormulas: [{ id: "fixture-formula", name: "فرمول آزمایشی", formulaType: "قطعه", outputProductId: "fixture-single", outputQuantity: 1, outputUnit: "عدد", materials: [{ id: "fixture-material", productId: "fixture-mass", quantity: 0.1, unit: "کیلوگرم" }], costs: [], note: "فرمول مستقل fixture" }],
  accounts: [{ id: "cash", name: "صندوق fixture", type: "صندوق", balance: 0 }, { id: "bank", name: "بانک fixture", type: "بانک", balance: 50000000 }],
} satisfies Partial<AppState>;
