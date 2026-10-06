import jsPDF from "jspdf";
import html2canvasPro from "html2canvas-pro";
import html2canvasStd from "html2canvas";
import { todayJalali } from "./accounting";

export interface PDFExportOptions {
  filename?: string;
  title?: string;
  landscape?: boolean;
  singleRoll?: boolean;
}

/**
 * Formats current Persian timestamp
 */
export function currentJalaliDateTime() {
  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${todayJalali()} ساعت ${timeStr}`;
}

/**
 * Deep sanitization for customer-facing documents:
 * 1. Purges all "سود ظاهری" (apparent profit) and "سود واقعی / مؤثر" (effective profit) columns and metrics.
 * 2. Purges internal bank accounts ("در کدام حساب سپردم") and internal holders ("نزد چه کسی است").
 * 3. Sanitizes check status (e.g., replaces internal "نزد ما" with customer-facing "دریافت شده (در جریان وصول)").
 * 4. Strips all interactive buttons, action columns, and private developer classes.
 */
export function purgeProfitAndPrivateColumns(clonedDoc: Document, clonedElement: HTMLElement) {
  // 1. Remove entire sections that are purely internal profit or private reports
  clonedElement
    .querySelectorAll(
      ".print-private, .effective-profit-report, .effective-profit-periods, .row-action, .icon-button, button.icon-button, .table-actions, .filter-grid, .pagination, .invoice-filters, .check-filters"
    )
    .forEach(el => el.remove());

  // 2. Scan every table to identify and remove profit columns and internal check deposit/holder columns by index
  const tables = Array.from(clonedElement.querySelectorAll("table"));
  tables.forEach(table => {
    const thead = table.querySelector("thead");
    if (!thead) return;

    const ths = Array.from(thead.querySelectorAll("th"));
    const colIndicesToRemove: number[] = [];

    ths.forEach((th, idx) => {
      const text = (th.textContent || "").trim();
      const isProfitCol =
        text.includes("سود") ||
        text.includes("ظاهری") ||
        text.includes("مؤثر") ||
        text.includes("واقعی") ||
        text.includes("profit");

      const isInternalAccountCol =
        text.includes("مرجع وضعیت") ||
        text.includes("حساب مرجع") ||
        text.includes("حساب مرتبط") ||
        text.includes("بانک حساب") ||
        text.includes("صندوق") ||
        text.includes("سپردم") ||
        text.includes("عملیات");

      const isExplicitPrivate =
        th.classList.contains("print-private") ||
        th.classList.contains("row-action");

      if (isProfitCol || isInternalAccountCol || isExplicitPrivate) {
        colIndicesToRemove.push(idx);
      }
    });

    if (colIndicesToRemove.length > 0) {
      // Remove from rightmost to leftmost so indices don't shift
      colIndicesToRemove.sort((a, b) => b - a).forEach(colIdx => {
        if (ths[colIdx]) ths[colIdx].remove();

        table.querySelectorAll("tbody tr").forEach(tr => {
          // If this is an accordion detail row that spans multiple columns, adjust or leave alone
          if (tr.classList.contains("allocation-detail-row")) return;
          const tds = Array.from(tr.querySelectorAll("td"));
          if (tds[colIdx]) tds[colIdx].remove();
        });
      });
    }
  });

  // 3. Replace <select> dropdowns with clean, customer-sanitized text badges
  clonedElement.querySelectorAll("select").forEach(sel => {
    const selectedOption = sel.options[sel.selectedIndex];
    let selectedText = selectedOption ? selectedOption.text : sel.value;

    // Customer-friendly status replacement
    if (selectedText === "نزد ما") {
      selectedText = "در جریان وصول";
    } else if (selectedText === "خرج شده") {
      selectedText = "واگذار شده";
    } else if (selectedText.includes("حساب مرجع") || selectedText.includes("انتخاب شخص")) {
      // Internal deposit target or internal holder -> strip completely
      sel.remove();
      return;
    }

    const span = clonedDoc.createElement("span");
    span.textContent = selectedText || "—";
    span.style.cssText = `
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      background: #f1f5f9;
      color: #000000;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
    `;
    sel.parentNode?.replaceChild(span, sel);
  });

  // 4. Sanitize badges and text inside accordion strips
  clonedElement.querySelectorAll(".invoice-customer-info-strip div, .check-accordion-box div").forEach(div => {
    const text = div.textContent || "";
    if (
      text.includes("سود ظاهری") ||
      text.includes("سود واقعی") ||
      text.includes("سود مؤثر") ||
      text.includes("حساب بانکی یا صندوق متصل") ||
      text.includes("حساب مرجع") ||
      text.includes("در کدام حساب") ||
      text.includes("نزد چه کسی")
    ) {
      div.remove();
      return;
    }

    // Sanitize "نزد ما" in status text
    if (text.includes("وضعیت:") && text.includes("نزد ما")) {
      div.innerHTML = div.innerHTML.replace("نزد ما", "در جریان وصول");
    }
  });
}

/**
 * Restructures tables containing accordion detail rows into clean, non-overlapping blocks.
 *
 * CRITICAL CUSTOMER-FACING SANITIZATION:
 * 1. Completely removes "سود ظاهری و واقعی" (apparent/effective profit) columns.
 * 2. Completely removes internal bank account references ("در کدام حساب سپردم") and internal holders ("نزد چه کسی است").
 * 3. Extracts accordion rows from multi-column table colSpan into full-width atomic blocks so nothing overlaps.
 */
export function transformAccordionTables(clonedDoc: Document, clonedElement: HTMLElement) {
  // First, unwrap all non-action buttons (like invoice number, check number, person names)
  clonedElement.querySelectorAll("button").forEach(btn => {
    if (
      btn.classList.contains("row-action") ||
      btn.classList.contains("icon-button") ||
      btn.getAttribute("title")?.includes("ویرایش") ||
      btn.getAttribute("title")?.includes("حذف") ||
      btn.getAttribute("title")?.includes("تاریخچه")
    ) {
      btn.remove();
      return;
    }
    const span = clonedDoc.createElement("span");
    span.innerHTML = btn.innerHTML;
    span.querySelectorAll("svg").forEach(svg => svg.remove());
    span.style.cssText = "display: inline-block; font-weight: 800; color: #000000;";
    btn.parentNode?.replaceChild(span, btn);
  });

  // Second, completely purge any internal profit or private elements
  purgeProfitAndPrivateColumns(clonedDoc, clonedElement);

  const tables = Array.from(clonedElement.querySelectorAll("table"));

  tables.forEach(table => {
    const detailRows = Array.from(table.querySelectorAll(".allocation-detail-row"));
    if (detailRows.length === 0) return;

    // Get sanitized thead headers
    const thead = table.querySelector("thead");
    const headerCols: Array<{ text: string; width: string }> = [];
    if (thead) {
      const ths = Array.from(thead.querySelectorAll("th"));
      ths.forEach(th => {
        const text = th.textContent?.trim() || "";
        if (
          th.classList.contains("print-private") ||
          th.classList.contains("row-action") ||
          text.includes("سود") ||
          text.includes("ظاهری") ||
          text.includes("مؤثر") ||
          text.includes("مرجع") ||
          text.includes("عملیات")
        ) {
          return;
        }
        const w = (th as HTMLElement).style.width || "";
        headerCols.push({ text, width: w });
      });
    }

    // Container for transformed entries
    const entriesContainer = clonedDoc.createElement("div");
    entriesContainer.className = "roll-transformed-table-container";
    entriesContainer.style.cssText = `
      width: 100%;
      direction: rtl;
      font-family: inherit;
      margin: 10px 0;
    `;

    // Master Header Table at top of list
    if (headerCols.length > 0) {
      const masterHeader = clonedDoc.createElement("table");
      masterHeader.style.cssText = `
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        margin-bottom: 8px;
        background: #0f766e;
        color: #ffffff;
        border-radius: 6px;
        overflow: hidden;
      `;
      const masterTr = clonedDoc.createElement("tr");
      headerCols.forEach(col => {
        const th = clonedDoc.createElement("th");
        th.textContent = col.text;
        th.style.cssText = `
          padding: 8px 6px;
          font-size: 11px;
          font-weight: 800;
          color: #ffffff;
          border: 1px solid #134e4a;
          text-align: right;
          ${col.width ? `width: ${col.width};` : ""}
        `;
        masterTr.appendChild(th);
      });
      const masterThead = clonedDoc.createElement("thead");
      masterThead.appendChild(masterTr);
      masterHeader.appendChild(masterThead);
      entriesContainer.appendChild(masterHeader);
    }

    // Process tbody rows
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const rows = Array.from(tbody.children) as HTMLElement[];
    let i = 0;
    let entryIndex = 0;

    while (i < rows.length) {
      const row = rows[i];
      i++;

      // If it's a detail row alone, skip
      if (row.classList.contains("allocation-detail-row")) {
        continue;
      }

      // Main data row (invoice or check)
      const nextRow = i < rows.length ? rows[i] : null;
      let detailRow: HTMLElement | null = null;
      if (nextRow && nextRow.classList.contains("allocation-detail-row")) {
        detailRow = nextRow;
        i++; // consume detail row
      }

      entryIndex++;
      const isEven = entryIndex % 2 === 0;

      // Card block for this entry
      const card = clonedDoc.createElement("div");
      card.className = "roll-entry-card";
      card.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        border: 1.5px solid #94a3b8;
        border-radius: 8px;
        margin-bottom: 12px;
        background: #ffffff;
        overflow: hidden;
        page-break-inside: avoid;
        break-inside: avoid;
      `;

      // 1. Main Row Table
      const rowTable = clonedDoc.createElement("table");
      rowTable.style.cssText = `
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        background: ${isEven ? "#f8fafc" : "#ffffff"};
      `;
      const clonedTr = row.cloneNode(true) as HTMLElement;

      // Remove print-private action cells, profit cells, and internal holder cells
      clonedTr
        .querySelectorAll(
          ".print-private, .row-action, .icon-button, button.icon-button, [class*='profit']"
        )
        .forEach(el => el.remove());

      // Sanitize text within cells (e.g. replace internal "نزد ما" with "در جریان وصول")
      clonedTr.querySelectorAll("td").forEach(td => {
        if (td.textContent?.trim() === "نزد ما") {
          td.textContent = "در جریان وصول";
        }
      });

      // Style all cells in this main row
      const tds = Array.from(clonedTr.querySelectorAll("td"));
      tds.forEach((td, idx) => {
        const cell = td as HTMLElement;
        const colDef = headerCols[idx];
        cell.style.cssText = `
          padding: 8px 6px;
          font-size: 11px;
          font-weight: 700;
          border: 1px solid #cbd5e1;
          color: #000000;
          vertical-align: middle;
          text-align: right;
          ${colDef && colDef.width ? `width: ${colDef.width};` : ""}
        `;
      });

      // Ensure first column (invoice number or check number) is always preserved and populated
      if (tds[0]) {
        const firstCell = tds[0] as HTMLElement;
        const invoiceNum = row.getAttribute("data-invoice-num");
        const checkNum = row.getAttribute("data-check-num");

        const currentText = firstCell.textContent?.trim() || "";
        if (invoiceNum && (!currentText || currentText === "فاکتور")) {
          firstCell.innerHTML = `<span style="font-weight: 800; color: #000000; font-size: 11.5px;">فاکتور ${invoiceNum}</span>`;
        } else if (checkNum && (!currentText || currentText === "چک")) {
          firstCell.innerHTML = `<span style="font-weight: 800; color: #000000; font-size: 11.5px;">چک ${checkNum}</span>`;
        }
      }

      const rowTbody = clonedDoc.createElement("tbody");
      rowTbody.appendChild(clonedTr);
      rowTable.appendChild(rowTbody);
      card.appendChild(rowTable);

      // 2. Accordion Detail Content (if present)
      if (detailRow) {
        const detailBox = detailRow.querySelector(
          ".invoice-accordion-box, .check-accordion-box"
        ) as HTMLElement | null;

        if (detailBox) {
          const detailContainer = clonedDoc.createElement("div");
          detailContainer.className = "roll-entry-accordion-wrap";
          detailContainer.style.cssText = `
            display: block;
            width: 100%;
            box-sizing: border-box;
            background: #f8fafc;
            border-top: 1.5px solid #94a3b8;
            padding: 10px 14px;
            direction: rtl;
          `;

          // Clone the detail content
          const clonedDetail = detailBox.cloneNode(true) as HTMLElement;
          clonedDetail.style.cssText = `
            display: block;
            width: 100%;
            box-sizing: border-box;
            background: transparent;
            padding: 0;
            margin: 0;
            overflow: visible;
          `;

          // PURGE ALL INTERNAL PROFIT COLUMNS AND PRIVATE DATA FROM ACCORDION
          clonedDetail
            .querySelectorAll(
              ".print-private, [class*='profit'], .icon-button, button"
            )
            .forEach(el => el.remove());

          // Enhance customer info strip
          clonedDetail.querySelectorAll(".invoice-customer-info-strip").forEach(strip => {
            const s = strip as HTMLElement;
            s.style.cssText = `
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              gap: 12px 18px;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 10px 14px;
              margin-bottom: 8px;
              font-size: 11.5px;
              line-height: 1.6;
              color: #000000;
              box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            `;
            s.querySelectorAll("strong, b").forEach(str => {
              (str as HTMLElement).style.color = "#000000";
              (str as HTMLElement).style.fontWeight = "800";
            });
          });

          // Enhance items mini table
          clonedDetail.querySelectorAll(".invoice-items-mini-table").forEach(mini => {
            const m = mini as HTMLElement;
            m.style.cssText = `
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              gap: 6px 12px;
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 8px 12px;
              margin-bottom: 8px;
              font-size: 11px;
            `;
          });

          // Style mini item badges
          clonedDetail.querySelectorAll(".mini-item-badge").forEach(badge => {
            const b = badge as HTMLElement;
            b.style.cssText = `
              display: inline-block;
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 3px 8px;
              font-size: 10.5px;
              font-weight: 700;
              color: #000000;
            `;
          });

          // Enhance check allocations subtable
          clonedDetail.querySelectorAll(".roll-subtable-wrap").forEach(wrap => {
            const w = wrap as HTMLElement;
            w.style.cssText = `
              display: block;
              width: 100%;
              overflow: visible;
              margin-top: 6px;
            `;
          });

          clonedDetail.querySelectorAll(".roll-subtable").forEach(sub => {
            const s = sub as HTMLElement;
            s.style.cssText = `
              display: table;
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              background: #ffffff;
              border: 1px solid #94a3b8;
              border-radius: 6px;
              font-size: 11px;
            `;
            // Remove profit column header if still present
            s.querySelectorAll("th").forEach(th => {
              const text = th.textContent || "";
              if (
                text.includes("سود") ||
                text.includes("ظاهری") ||
                text.includes("مؤثر") ||
                text.includes("مرجع") ||
                th.classList.contains("print-private")
              ) {
                th.remove();
                return;
              }
              (th as HTMLElement).style.cssText = `
                background: #e2e8f0;
                color: #000000;
                font-weight: 800;
                padding: 6px 8px;
                border: 1px solid #94a3b8;
                font-size: 11px;
                text-align: right;
              `;
            });
            s.querySelectorAll("td").forEach(td => {
              const text = td.textContent || "";
              if (
                td.classList.contains("print-private") ||
                text.includes("ظاهری:") ||
                text.includes("مؤثر:") ||
                text.includes("سود:")
              ) {
                td.remove();
                return;
              }
              (td as HTMLElement).style.cssText = `
                padding: 6px 8px;
                border: 1px solid #cbd5e1;
                font-size: 11px;
                font-weight: 700;
                text-align: right;
                color: #000000;
              `;
            });
          });

          detailContainer.appendChild(clonedDetail);
          card.appendChild(detailContainer);
        }
      }

      entriesContainer.appendChild(card);
    }

    // Replace old table with transformed entriesContainer
    table.parentNode?.replaceChild(entriesContainer, table);
  });
}

/**
 * Builds the complete, beautiful standalone HTML string for vector text printing or offline saving.
 * 100% Vector Fonts, Selectable Text, No Blur, No Pixels.
 */
export function buildVectorHtmlDocument(
  element: HTMLElement,
  options: PDFExportOptions = {}
): { html: string; containerHeightPx: number } {
  const { title = "گزارش مالی کارگاه", singleRoll = true } = options;

  // Clone element and apply transformations in memory
  const container = element.cloneNode(true) as HTMLElement;
  transformAccordionTables(document, container);
  purgeProfitAndPrivateColumns(document, container);

  // Preserve text inside all non-action buttons (like invoice number, check number, person names)
  container.querySelectorAll("button").forEach(btn => {
    if (
      btn.classList.contains("row-action") ||
      btn.classList.contains("icon-button") ||
      btn.getAttribute("title")?.includes("ویرایش") ||
      btn.getAttribute("title")?.includes("حذف") ||
      btn.getAttribute("title")?.includes("تاریخچه")
    ) {
      btn.remove();
      return;
    }
    const span = document.createElement("span");
    span.innerHTML = btn.innerHTML;
    span.style.fontWeight = "800";
    span.style.color = "#000000";
    span.querySelectorAll("svg").forEach(svg => svg.remove());
    btn.parentNode?.replaceChild(span, btn);
  });

  // Purge any remaining interactive buttons
  container.querySelectorAll("button, .row-action, .icon-button").forEach(b => b.remove());

  // Approximate height: calculate estimated height based on entry cards and tables
  const cardsCount = container.querySelectorAll(".roll-entry-card").length;
  const rowsCount = container.querySelectorAll("tr").length;
  const estimatedHeightPx = Math.max(800, cardsCount * 180 + rowsCount * 45 + 350);

  // Millimeters calculation for CSS @page
  // 1px approx 0.264583 mm (96 DPI)
  const estimatedHeightMm = Math.max(297, Math.ceil((estimatedHeightPx * 25.4) / 96) + 40);

  const pageRule = singleRoll
    ? `@page { size: 297mm ${estimatedHeightMm}mm; margin: 6mm 8mm; }`
    : `@page { size: landscape; margin: 8mm 10mm; }`;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${pageRule}
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      direction: rtl;
      font-family: 'Vazirmatn', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Tahoma, sans-serif;
      font-size: 11px;
      line-height: 1.5;
    }
    body {
      padding: 12px 16px;
      width: 100%;
      max-width: 100%;
    }
    .roll-entry-card {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      margin-bottom: 12px;
      border: 1.5px solid #94a3b8;
      border-radius: 8px;
      overflow: hidden;
      background: #ffffff;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 8px;
      font-size: 11px;
      text-align: right;
      color: #000000;
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }
    th {
      background: #0f766e !important;
      color: #ffffff !important;
      font-weight: 800;
    }
    strong, b {
      font-weight: 800;
      color: #000000;
    }
    .badge {
      display: inline-block !important;
      padding: 2px 7px !important;
      border-radius: 4px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      white-space: nowrap !important;
    }
    .badge.amber {
      background: #fef3c7 !important;
      color: #92400e !important;
      border: 1px solid #fde68a !important;
    }
    .badge.teal {
      background: #ccfbf1 !important;
      color: #115e59 !important;
      border: 1px solid #99f6e4 !important;
    }
    .muted-cell {
      color: #64748b !important;
      font-size: 0.75rem !important;
    }
    .invoice-cell-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .mini-item-badge {
      display: inline-block !important;
      background: #f1f5f9 !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 4px !important;
      padding: 3px 8px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      color: #000000 !important;
      margin: 2px 4px 2px 0 !important;
    }
    button {
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      color: #000000 !important;
      font-weight: 800 !important;
      font-size: inherit !important;
      font-family: inherit !important;
      text-align: right !important;
    }
    .print-private, .row-action, .icon-button, button.icon-button, .no-print {
      display: none !important;
    }
    .print-roll-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 16px;
      padding: 10px 14px;
      margin-bottom: 12px;
      border: 2px solid #0f766e;
      border-radius: 6px;
      background: #f0fdf4 !important;
      color: #000000;
    }
    .invoice-customer-info-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 18px;
      padding: 10px 14px;
      margin-bottom: 8px;
      background: #ffffff !important;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 11.5px;
      line-height: 1.6;
    }
    .roll-subtable th {
      background: #e2e8f0 !important;
      color: #000000 !important;
    }
    .doc-official-header {
      border-bottom: 2.5px solid #0f766e;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .doc-official-footer {
      border-top: 1px dashed #94a3b8;
      padding-top: 10px;
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #475569;
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="doc-official-header">
    <div>
      <div style="font-size: 11px; font-weight: bold; color: #0f766e;">سیستم جامع حسابداری و مدیریت مالی کارگاه</div>
      <div style="font-size: 18px; font-weight: 800; color: #000000; margin-top: 3px;">${title}</div>
    </div>
    <div style="text-align: left; font-size: 11px; color: #333333; line-height: 1.6;">
      <div><strong>تاریخ صدور:</strong> ${currentJalaliDateTime()}</div>
      <div><strong>فرمت:</strong> سند متنی برداری (رسمی و پیوسته)</div>
    </div>
  </div>

  <div id="print-content">
    ${container.outerHTML}
  </div>

  <div class="doc-official-footer">
    <div>تهیه شده در سیستم مدیریت مالی و حسابداری کارگاه · سند رسمی مالی و تجاری</div>
    <div>شامل تمام مشخصات طرف حساب، اطلاعات اقلام کالا، چک‌ها و وضعیت تسویه</div>
  </div>
</body>
</html>`;

  return { html, containerHeightPx: estimatedHeightPx };
}

/**
 * Triggers native 100% vector-text printing and PDF creation via the browser's native PDF engine.
 *
 * USER BENEFIT:
 * - 100% VECTOR TEXT (متن خالص، بدون افت کیفیت و تصویر — نه تصویر مات و کم‌کیفیت).
 * - Real selectable, searchable Persian numerals and text at infinite resolution.
 * - Customer-clean: No profit columns ("سود ظاهری و واقعی"), no internal bank deposit accounts ("در کدام حساب سپردم"), no internal holders ("نزد چه کسی است").
 * - Single Continuous Roll: Configured with continuous dimensions so the document does NOT awkwardly break into pages.
 */
export async function printVectorContinuousRoll(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const { title = "گزارش مالی کارگاه", singleRoll = true } = options;

  const { html } = buildVectorHtmlDocument(element, { ...options, singleRoll });

  // Create isolated invisible iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "100%";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Allow fonts and layout to settle, then trigger browser print
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }, 450);
}

/**
 * Downloads a standalone, self-contained Vector HTML Document.
 * Completely offline, selectable vector text, sharpest possible display on Android and PC,
 * ideal for sharing directly with customers on WhatsApp, Telegram, or Eitaa.
 */
export function downloadVectorHtmlDocument(
  element: HTMLElement,
  options: PDFExportOptions = {}
): void {
  const { filename = "document", title = "گزارش مالی کارگاه" } = options;
  const { html } = buildVectorHtmlDocument(element, { ...options, singleRoll: true });

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.endsWith(".html") ? filename : `${filename}.html`}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Prepares and renders cloned element to an ultra high-resolution canvas (Scale 3.5 / 350+ DPI).
 * Guaranteed lossless PNG rendering without fuzzy JPEG artifacts.
 */
async function renderElementToCanvas(
  element: HTMLElement,
  title: string,
  docTypeLabel: string
): Promise<HTMLCanvasElement> {
  const scrollH = element.scrollHeight || element.offsetHeight || 800;
  const scrollW = element.scrollWidth || element.offsetWidth || 1100;

  // Ultra-High Quality Scale: Scale 3.5 provides publication-grade 350 DPI text sharpness
  let targetScale = 3.5;
  if (scrollH * targetScale > 16000 || scrollW * targetScale > 16000) {
    targetScale = Math.max(2.2, 16000 / Math.max(scrollH, scrollW));
  }

  const onCloneHandler = (clonedDoc: Document, clonedElement: HTMLElement) => {
    // 1. Preserve text inside buttons/toggles
    clonedElement
      .querySelectorAll(
        "button.text-button, button.allocation-toggle, .text-button, .allocation-toggle"
      )
      .forEach(btn => {
        const span = clonedDoc.createElement("span");
        span.innerHTML = btn.innerHTML;
        span.style.cssText = `
          display: inline-block;
          font-weight: 800;
          color: #000000;
          font-size: inherit;
          text-decoration: none;
        `;
        span.querySelectorAll("svg").forEach(svg => svg.remove());
        btn.parentNode?.replaceChild(span, btn);
      });

    // 2. Perform deep customer sanitization (purge profit columns & internal bank accounts)
    purgeProfitAndPrivateColumns(clonedDoc, clonedElement);

    // 3. Transform all tables with accordion rows into bulletproof non-overlapping blocks
    transformAccordionTables(clonedDoc, clonedElement);

    // 4. Style top summary banner if present
    clonedElement.querySelectorAll(".print-roll-banner").forEach(node => {
      const banner = node as HTMLElement;
      banner.style.cssText = `
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 8px 16px !important;
        padding: 12px 16px !important;
        margin-bottom: 14px !important;
        border: 2px solid #0f766e !important;
        border-radius: 8px !important;
        background: #f0fdf4 !important;
        color: #000000 !important;
      `;
      banner.querySelectorAll("strong, b").forEach(s => {
        (s as HTMLElement).style.fontWeight = "800";
        (s as HTMLElement).style.color = "#000000";
      });
    });

    // 5. Expand all scroll and overflow wrappers
    clonedElement
      .querySelectorAll(".table-wrap, .dialog-body, .scroll-area, [class*='scroll']")
      .forEach(node => {
        const el = node as HTMLElement;
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
        el.style.maxWidth = "none";
        el.style.width = "100%";
      });

    // 6. Base document styling with pure pitch black fonts and crisp contrast
    clonedElement.style.maxHeight = "none";
    clonedElement.style.height = "auto";
    clonedElement.style.overflow = "visible";
    clonedElement.style.width = "100%";
    clonedElement.style.minWidth = "1200px";
    clonedElement.style.backgroundColor = "#ffffff";
    clonedElement.style.padding = "24px";
    clonedElement.style.direction = "rtl";
    clonedElement.style.fontFamily = "Vazirmatn, system-ui, -apple-system, sans-serif";
    clonedElement.style.color = "#000000";

    // Enforce bold font on all monetary figures and dates
    clonedElement.querySelectorAll("td, th, span, div, strong").forEach(node => {
      const el = node as HTMLElement;
      el.style.color = "#000000";
    });

    // 7. Prepend official Persian header banner
    const banner = clonedDoc.createElement("div");
    banner.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2.5px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 18px;
      direction: rtl;
      font-family: inherit;
    `;
    banner.innerHTML = `
      <div style="text-align: right;">
        <div style="font-size: 11px; font-weight: bold; color: #0f766e; letter-spacing: 0.5px;">سیستم جامع حسابداری و مدیریت مالی کارگاه</div>
        <div style="font-size: 18px; font-weight: 800; color: #000000; margin-top: 4px;">${title}</div>
      </div>
      <div style="text-align: left; font-size: 11px; color: #333333; line-height: 1.6;">
        <div><strong>تاریخ صدور:</strong> ${currentJalaliDateTime()}</div>
        <div><strong>نوع سند:</strong> ${docTypeLabel}</div>
      </div>
    `;
    clonedElement.insertBefore(banner, clonedElement.firstChild);

    // 8. Append official footer
    const footer = clonedDoc.createElement("div");
    footer.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px dashed #94a3b8;
      padding-top: 12px;
      margin-top: 24px;
      direction: rtl;
      font-size: 10px;
      color: #475569;
    `;
    footer.innerHTML = `
      <div>تهیه شده در سیستم مدیریت مالی و حسابداری کارگاه · سند رسمی مالی و تجاری</div>
      <div>شامل تمام مشخصات طرف حساب، اطلاعات اقلام کالا، چک‌ها و وضعیت تسویه</div>
    `;
    clonedElement.appendChild(footer);
  };

  const options = {
    scale: targetScale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: Math.max(element.scrollWidth || 1200, 1200),
    onclone: onCloneHandler,
  };

  try {
    return await html2canvasPro(element, options);
  } catch (errPro) {
    console.warn("html2canvas-pro fallback:", errPro);
    try {
      return await html2canvasStd(element, { ...options, scale: 2.2 });
    } catch (errStd) {
      console.warn("html2canvasStd fallback:", errStd);
      return await html2canvasPro(element, { ...options, scale: 2.0 });
    }
  }
}

/**
 * Exports an HTML element as a single continuous scrollable landscape PDF roll with ultra-high DPI.
 * Always uses lossless PNG representation to avoid compression artifacts.
 */
export async function exportToContinuousRollPDF(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const { filename = "document", title = "گزارش مالی کارگاه" } = options;

  const canvas = await renderElementToCanvas(
    element,
    title,
    "سند طومار پیوسته (کیفیت بسیار بالا ۳۵۰ DPI)"
  );

  const imgData = canvas.toDataURL("image/png");

  // Width in mm: 297mm (standard landscape reading width)
  const pageWidthMm = 297;
  const pageHeightMm = (canvas.height / canvas.width) * pageWidthMm;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pageWidthMm, pageHeightMm],
    hotfixes: ["px_scaling"],
  });

  if (title) {
    pdf.setProperties({
      title,
      subject: "گزارش حسابداری و مالی کارگاه صنعتی",
      author: "سیستم حسابداری کارگاه",
      creator: "حسابداری کارگاه",
    });
  }

  pdf.addImage(imgData, "PNG", 0, 0, pageWidthMm, pageHeightMm, undefined, "FAST");
  pdf.save(`${filename.endsWith(".pdf") ? filename : `${filename}.pdf`}`);
}

/**
 * Standard Multi-page Landscape A4 PDF export
 */
export async function exportToMultiPageLandscapePDF(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const { filename = "document", title = "گزارش مالی کارگاه" } = options;

  const canvas = await renderElementToCanvas(
    element,
    title,
    "چندصفحه‌ای افقی استاندارد (A4)"
  );

  const imgData = canvas.toDataURL("image/png");

  // A4 Landscape: 297mm x 210mm
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  if (title) {
    pdf.setProperties({ title });
  }

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= usableHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage("a4", "landscape");
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= usableHeight;
  }

  pdf.save(`${filename.endsWith(".pdf") ? filename : `${filename}.pdf`}`);
}
