import jsPDF from "jspdf";
import html2canvasPro from "html2canvas-pro";
import html2canvasStd from "html2canvas";
import { todayJalali } from "./accounting";

export interface PDFExportOptions {
  filename?: string;
  title?: string;
  landscape?: boolean;
}

/**
 * Formats current Persian timestamp
 */
function currentJalaliDateTime() {
  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${todayJalali()} ساعت ${timeStr}`;
}

/**
 * Restructures tables containing accordion detail rows into clean, non-overlapping blocks.
 *
 * ROOT CAUSE FIXED:
 * html2canvas (both standard and pro) has a known limitation where <td colspan="X">
 * within multi-column tables is rendered using only the 1st column's narrow width (e.g. 60px),
 * and the subsequent table row is positioned right over it ("در زیر ردیف مخفی شده").
 *
 * This function extracts each main row and its accordion detail row, placing the detail box
 * in a full-width block container directly below the main row table.
 * As a result, no colSpan is needed, no content is squished or hidden under any row,
 * and 100% of customer information, items, and check allocations are fully visible and readable.
 */
function transformAccordionTables(clonedDoc: Document, clonedElement: HTMLElement) {
  const tables = Array.from(clonedElement.querySelectorAll("table"));

  tables.forEach(table => {
    const detailRows = Array.from(table.querySelectorAll(".allocation-detail-row"));
    if (detailRows.length === 0) return;

    // Get original thead headers
    const thead = table.querySelector("thead");
    const headerCols: Array<{ text: string; width: string }> = [];
    if (thead) {
      const ths = Array.from(thead.querySelectorAll("th"));
      ths.forEach(th => {
        // Skip private action headers
        if (th.classList.contains("print-private") || th.classList.contains("row-action")) {
          return;
        }
        const w = (th as HTMLElement).style.width || "";
        headerCols.push({ text: th.textContent?.trim() || "", width: w });
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

      // If it's a detail row alone, skip or handle
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
        border: 1.5px solid #cbd5e1;
        border-radius: 8px;
        margin-bottom: 12px;
        background: #ffffff;
        overflow: hidden;
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

      // Remove print-private action cells
      clonedTr
        .querySelectorAll(".print-private, .row-action, .icon-button, button.icon-button")
        .forEach(el => el.remove());

      // Style all cells in this main row
      const tds = Array.from(clonedTr.querySelectorAll("td"));
      tds.forEach((td, idx) => {
        const cell = td as HTMLElement;
        const colDef = headerCols[idx];
        cell.style.cssText = `
          padding: 8px 6px;
          font-size: 11px;
          border: 1px solid #e2e8f0;
          color: #0f172a;
          vertical-align: middle;
          text-align: right;
          ${colDef && colDef.width ? `width: ${colDef.width};` : ""}
        `;
      });

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
            background: #f1f5f9;
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

          // Enhance customer info strip
          clonedDetail.querySelectorAll(".invoice-customer-info-strip").forEach(strip => {
            const s = strip as HTMLElement;
            s.style.cssText = `
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              gap: 10px 18px;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 10px 14px;
              margin-bottom: 8px;
              font-size: 11.5px;
              line-height: 1.6;
              color: #0f172a;
              box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            `;
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
              color: #1e293b;
            `;
          });

          // Enhance subtable
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
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              font-size: 10.5px;
            `;
            s.querySelectorAll("th").forEach(th => {
              (th as HTMLElement).style.cssText = `
                background: #e2e8f0;
                color: #0f172a;
                font-weight: 700;
                padding: 6px 8px;
                border: 1px solid #cbd5e1;
                font-size: 10.5px;
                text-align: right;
              `;
            });
            s.querySelectorAll("td").forEach(td => {
              (td as HTMLElement).style.cssText = `
                padding: 6px 8px;
                border: 1px solid #e2e8f0;
                font-size: 10.5px;
                text-align: right;
                color: #0f172a;
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
 * Prepares and renders cloned element to a high-resolution canvas.
 */
async function renderElementToCanvas(
  element: HTMLElement,
  title: string,
  docTypeLabel: string
): Promise<HTMLCanvasElement> {
  const scrollH = element.scrollHeight || element.offsetHeight || 800;
  const scrollW = element.scrollWidth || element.offsetWidth || 1100;

  // Safe scale: Scale 2 provides sharp, vector-quality text.
  // Ensure total canvas dimensions do not exceed 8192px on mobile browsers.
  let targetScale = 2;
  if (scrollH * targetScale > 7500 || scrollW * targetScale > 7500) {
    targetScale = Math.max(1.2, 7500 / Math.max(scrollH, scrollW));
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
          font-weight: 700;
          color: #0f172a;
          font-size: inherit;
          text-decoration: none;
        `;
        span.querySelectorAll("svg").forEach(svg => svg.remove());
        btn.parentNode?.replaceChild(span, btn);
      });

    // 2. Replace <select> dropdowns with clean badges
    clonedElement.querySelectorAll("select").forEach(sel => {
      const selectedOption = sel.options[sel.selectedIndex];
      const selectedText = selectedOption ? selectedOption.text : sel.value;
      const span = clonedDoc.createElement("span");
      span.textContent = selectedText || "—";
      span.style.cssText = `
        display: inline-block;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        background: #f1f5f9;
        color: #1e293b;
        border: 1px solid #cbd5e1;
        white-space: nowrap;
      `;
      sel.parentNode?.replaceChild(span, sel);
    });

    // 3. Hide interactive action buttons, private columns, and form submission bars
    const hideSelectors = [
      ".row-action",
      ".icon-button",
      ".panel-heading-actions",
      ".form-actions",
      ".no-print",
      ".print-private",
      ".table-actions",
      "button[type='submit']",
      "input[type='button']",
      "input[type='submit']",
      ".filter-grid",
      ".pagination",
      ".invoice-filters",
      ".check-filters",
    ];
    clonedElement.querySelectorAll(hideSelectors.join(", ")).forEach(node => {
      (node as HTMLElement).style.setProperty("display", "none", "important");
    });

    // 4. Style top summary banner if present
    clonedElement.querySelectorAll(".print-roll-banner").forEach(node => {
      const banner = node as HTMLElement;
      banner.style.cssText = `
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 8px 16px !important;
        padding: 10px 14px !important;
        margin-bottom: 12px !important;
        border: 2px solid #0f766e !important;
        border-radius: 8px !important;
        background: #f0fdf4 !important;
        color: #0f172a !important;
      `;
    });

    // 5. Transform all tables with accordion rows into bulletproof non-overlapping blocks
    transformAccordionTables(clonedDoc, clonedElement);

    // 6. Expand all scroll and overflow wrappers
    clonedElement
      .querySelectorAll(".table-wrap, .dialog-body, .scroll-area, [class*='scroll']")
      .forEach(node => {
        const el = node as HTMLElement;
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
        el.style.maxWidth = "none";
        el.style.width = "100%";
      });

    // 7. Base document styling
    clonedElement.style.maxHeight = "none";
    clonedElement.style.height = "auto";
    clonedElement.style.overflow = "visible";
    clonedElement.style.width = "100%";
    clonedElement.style.minWidth = "1180px";
    clonedElement.style.backgroundColor = "#ffffff";
    clonedElement.style.padding = "24px";
    clonedElement.style.direction = "rtl";
    clonedElement.style.fontFamily = "Vazirmatn, system-ui, -apple-system, sans-serif";

    // 8. Prepend official Persian header banner
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
        <div style="font-size: 18px; font-weight: 800; color: #1e293b; margin-top: 4px;">${title}</div>
      </div>
      <div style="text-align: left; font-size: 11px; color: #64748b; line-height: 1.6;">
        <div><strong>تاریخ صدور:</strong> ${currentJalaliDateTime()}</div>
        <div><strong>نوع سند:</strong> ${docTypeLabel}</div>
      </div>
    `;
    clonedElement.insertBefore(banner, clonedElement.firstChild);

    // 9. Append official footer
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
      color: #64748b;
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
    console.warn("html2canvas-pro failed, falling back to standard html2canvas with scale 1.5:", errPro);
    try {
      return await html2canvasStd(element, { ...options, scale: 1.5 });
    } catch (errStd) {
      console.warn("html2canvasStd failed, retrying pro with scale 1:", errStd);
      return await html2canvasPro(element, { ...options, scale: 1 });
    }
  }
}

/**
 * Exports an HTML element as a single continuous scrollable landscape PDF roll.
 *
 * PROPORTIONS & FIDELITY:
 * - Standard landscape width: 297mm (A4 landscape width).
 * - Single continuous height proportional to total content: no breaks, no cuts!
 * - High resolution: 2x scale ensures all Persian fonts, numbers, and dates are crystal clear.
 * - Full customer details and check subtables are 100% visible and readable.
 */
export async function exportToContinuousRollPDF(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const { filename = "document", title = "گزارش مالی کارگاه" } = options;

  const canvas = await renderElementToCanvas(
    element,
    title,
    "سند طومار پیوسته (اسکرول افقی / لنداسکیپ)"
  );

  let imgData: string;
  let imgFormat: "PNG" | "JPEG" = "PNG";
  try {
    imgData = canvas.toDataURL("image/png");
    if (!imgData || imgData.length < 50) throw new Error("Empty PNG data");
  } catch {
    imgData = canvas.toDataURL("image/jpeg", 0.94);
    imgFormat = "JPEG";
  }

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

  pdf.addImage(imgData, imgFormat, 0, 0, pageWidthMm, pageHeightMm);
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

  let imgData: string;
  let imgFormat: "PNG" | "JPEG" = "PNG";
  try {
    imgData = canvas.toDataURL("image/png");
    if (!imgData || imgData.length < 50) throw new Error("Empty PNG data");
  } catch {
    imgData = canvas.toDataURL("image/jpeg", 0.94);
    imgFormat = "JPEG";
  }

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

  pdf.addImage(imgData, imgFormat, margin, position, imgWidth, imgHeight);
  heightLeft -= usableHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage("a4", "landscape");
    pdf.addImage(imgData, imgFormat, margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;
  }

  pdf.save(`${filename.endsWith(".pdf") ? filename : `${filename}.pdf`}`);
}
