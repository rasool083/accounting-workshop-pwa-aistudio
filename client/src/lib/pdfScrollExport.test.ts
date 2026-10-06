// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  exportToContinuousRollPDF,
  exportToMultiPageLandscapePDF,
  buildVectorHtmlDocument,
} from "./pdfScrollExport";
import {
  formatItemDualQuantity,
  calculatePersonUnsettledInvoiceBalance,
  Invoice,
} from "./accounting";

describe("pdfScrollExport module", () => {
  it("exports continuous and multipage PDF functions", () => {
    expect(typeof exportToContinuousRollPDF).toBe("function");
    expect(typeof exportToMultiPageLandscapePDF).toBe("function");
  });

  it("formats dual units properly e.g. 1 کارتن (36 عدد)", () => {
    const item = {
      quantity: 1,
      unit: "کارتن",
      quantityBase: 36,
      conversionRate: 36,
      baseUnit: "عدد",
    };
    const product = {
      unit: "عدد",
      unit2: "کارتن",
      conversionRate: 36,
    };
    const result = formatItemDualQuantity(item, product);
    expect(result).toBe("۱ کارتن (۳۶ عدد)");

    // Entered in base unit
    const item2 = {
      quantity: 72,
      unit: "عدد",
    };
    const result2 = formatItemDualQuantity(item2, product);
    expect(result2).toBe("۲ کارتن (۷۲ عدد)");

    // Single unit
    const singleItem = {
      quantity: 5,
      unit: "دستگاه",
    };
    expect(formatItemDualQuantity(singleItem)).toBe("۵ دستگاه");
  });

  it("calculates person unsettled invoice balance as sum of open + partial invoice net remaining", () => {
    const mockInvoices: Invoice[] = [
      {
        id: "inv-1",
        number: "101",
        type: "فروش",
        date: "1405/01/01",
        partyId: "person-1",
        items: [],
        allocations: [],
        amount: 10_000_000,
        paidAmount: 0,
        status: "باز",
        note: "",
      },
      {
        id: "inv-2",
        number: "102",
        type: "فروش",
        date: "1405/01/02",
        partyId: "person-1",
        items: [],
        allocations: [],
        amount: 5_000_000,
        paidAmount: 3_000_000,
        status: "تسویه جزئی",
        note: "",
      },
      {
        id: "inv-3",
        number: "103",
        type: "فروش",
        date: "1405/01/03",
        partyId: "person-1",
        items: [],
        allocations: [],
        amount: 8_000_000,
        paidAmount: 8_000_000,
        status: "تسویه شده",
        note: "",
      },
      {
        id: "inv-4",
        number: "104",
        type: "فروش",
        date: "1405/01/04",
        partyId: "person-2",
        items: [],
        allocations: [],
        amount: 4_000_000,
        paidAmount: 0,
        status: "باز",
        note: "",
      },
    ];

    // Person 1 has:
    // inv-1 (باز): 10,000,000
    // inv-2 (تسویه جزئی): 5,000,000 - 3,000,000 = 2,000,000
    // Total = 12,000,000
    const balance = calculatePersonUnsettledInvoiceBalance(mockInvoices, "person-1");
    expect(balance.amount).toBe(12_000_000);
    expect(balance.unsettledCount).toBe(1);
    expect(balance.partialCount).toBe(1);
    expect(balance.label).toBe("بدهکار به کارگاه");

    // Fully settled person
    const settledBalance = calculatePersonUnsettledInvoiceBalance(
      [mockInvoices[2]],
      "person-1"
    );
    expect(settledBalance.amount).toBe(0);
    expect(settledBalance.label).toBe("تسویه کامل (بدون فاکتور پرداخت‌نشده)");
  });

  it("buildVectorHtmlDocument preserves data from buttons and creates clean HTML", () => {
    const el = document.createElement("div");
    el.innerHTML = `
      <table>
        <thead>
          <tr><th>شماره فاکتور</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <button class="allocation-toggle">
                <strong>فاکتور ۱۰۱</strong>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    `;
    const doc = buildVectorHtmlDocument(el, { title: "تست" });
    expect(doc.html).toContain("فاکتور ۱۰۱");
    expect(doc.html).not.toContain("allocation-toggle");
  });

  it("preserves invoice number and check number when allocation-detail-row exists", () => {
    const el = document.createElement("div");
    el.innerHTML = `
      <div id="invoices-printable-area">
        <table>
          <thead>
            <tr>
              <th style="width: 10%">شماره فاکتور</th>
              <th style="width: 8%">تاریخ</th>
              <th style="width: 8%">نوع و جهت</th>
              <th style="width: 13%">طرف حساب</th>
              <th style="width: 13%">نام کالا</th>
              <th style="width: 8%">تعداد</th>
              <th style="width: 8%">قیمت پایه</th>
              <th style="width: 10%">مبلغ</th>
              <th style="width: 8%">تسویه</th>
              <th style="width: 8%">مانده</th>
              <th style="width: 6%">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <button type="button" class="allocation-toggle is-expanded" title="نمایش چک‌های تخصیص‌یافته و مشخصات مشتری">
                  <svg><path d=""/></svg>
                  <strong>فاکتور 101</strong>
                </button>
              </td>
              <td>1405/01/01</td>
              <td>فروش</td>
              <td><button type="button" class="text-button"><strong>علی رضایی</strong></button></td>
              <td>پیچ</td>
              <td><strong>1 کارتن (36 عدد)</strong></td>
              <td>100,000</td>
              <td>3,600,000</td>
              <td>0</td>
              <td>3,600,000</td>
              <td>
                <button class="text-button">جزئیات</button>
                <span class="status-pill status-warning">باز</span>
                <button class="icon-button row-action" title="ویرایش فاکتور"><svg></svg></button>
                <button class="icon-button row-action" title="حذف فاکتور"><svg></svg></button>
              </td>
            </tr>
            <tr class="allocation-detail-row">
              <td colSpan="11">
                <div class="invoice-accordion-box">
                  <div class="invoice-customer-info-strip">
                    <div><strong>مشتری / طرف حساب:</strong> علی رضایی (کد: C-1)</div>
                    <div>
                      <strong>وضعیت مانده کل شخص:</strong> 3,600,000 ریال (بدهکار به کارگاه)
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const doc = buildVectorHtmlDocument(el, { title: "تست فاکتور" });
    console.log("GENERATED INVOICE HTML SNIPPET:\n", doc.html.slice(doc.html.indexOf("<body"), doc.html.indexOf("<body") + 1500));
    expect(doc.html).toContain("فاکتور 101");
    expect(doc.html).toContain("علی رضایی");
    expect(doc.html).toContain("1 کارتن (36 عدد)");
  });

  it("preserves check number and target invoice in checks table standalone HTML", () => {
    const el = document.createElement("div");
    el.innerHTML = `
      <div id="checks-printable-area">
        <table>
          <thead>
            <tr>
              <th style="width: 20%">شماره چک و هدف فاکتور</th>
              <th style="width: 22%">طرف حساب</th>
              <th style="width: 14%">تاریخ دریافت</th>
              <th style="width: 14%">سررسید</th>
              <th style="width: 16%">مبلغ</th>
              <th style="width: 14%">وضعیت</th>
              <th class="print-private">مرجع وضعیت</th>
              <th class="print-private">عملیات</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <button type="button" class="allocation-toggle is-expanded" title="نمایش فاکتورهای تخصیص‌یافته">
                  <svg><path d=""/></svg>
                  <strong>چک 98765</strong>
                </button>
                <small class="badge amber" style="display: inline-block; margin-top: 2px; font-weight: 700;">
                  هدف: فاکتور 101
                </small>
              </td>
              <td><button type="button" class="text-button"><strong>حسین محمدی</strong></button></td>
              <td>1405/01/01</td>
              <td>1405/02/01</td>
              <td>5,000,000</td>
              <td>
                <select>
                  <option value="نزد ما" selected>نزد ما</option>
                </select>
              </td>
              <td class="print-private">
                <select><option value="">انتخاب حساب مرجع *</option></select>
              </td>
              <td class="print-private">
                <button class="icon-button row-action" title="ویرایش کامل چک"><svg></svg></button>
              </td>
            </tr>
            <tr class="allocation-detail-row">
              <td colSpan="8">
                <div class="check-accordion-box">
                  <div class="invoice-customer-info-strip">
                    <div><strong>طرف حساب / صادرکننده:</strong> حسین محمدی (کد: C-2)</div>
                    <div>
                      <strong>وضعیت مانده کل شخص:</strong> 5,000,000 ریال (بدهکار به کارگاه)
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const doc = buildVectorHtmlDocument(el, { title: "تست چک‌ها" });
    console.log("GENERATED CHECKS HTML SNIPPET:\n", doc.html.slice(doc.html.indexOf("<body"), doc.html.indexOf("<body") + 1500));
    expect(doc.html).toContain("چک 98765");
    expect(doc.html).toContain("هدف: فاکتور 101");
    expect(doc.html).toContain("حسین محمدی");
  });
});
