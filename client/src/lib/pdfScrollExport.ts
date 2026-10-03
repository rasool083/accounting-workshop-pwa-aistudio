import jsPDF from "jspdf";
import html2canvas from "html2canvas";
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
 * Exports an HTML element as a single continuous scrollable landscape PDF roll.
 * The page dimensions match the exact rendered canvas, preserving all wide columns
 * and all rows without arbitrary paper breaks.
 */
export async function exportToContinuousRollPDF(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const { filename = "document", title = "گزارش مالی کارگاه" } = options;

  const canvas = await html2canvas(element, {
    scale: 2, // High resolution for crisp Persian typography
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: Math.max(element.scrollWidth || 1200, 1200),
    onclone: (clonedDoc, clonedElement) => {
      // 1. Hide interactive action buttons, edit forms, inputs, modals
      const hideSelectors = [
        "button",
        ".button",
        ".icon-button",
        ".form-actions",
        ".no-print",
        ".table-actions",
        "input[type='button']",
        "input[type='submit']",
        ".filter-grid",
        ".pagination",
      ];
      clonedElement.querySelectorAll(hideSelectors.join(", ")).forEach(node => {
        (node as HTMLElement).style.setProperty("display", "none", "important");
      });

      // 2. Expand all scroll and overflow wrappers so all columns & rows are 100% visible
      clonedElement.querySelectorAll(".table-wrap, .dialog-body, .scroll-area, [class*='scroll']").forEach(node => {
        const el = node as HTMLElement;
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
        el.style.maxWidth = "none";
        el.style.width = "100%";
      });

      // 3. Ensure the cloned container itself is fully open
      clonedElement.style.maxHeight = "none";
      clonedElement.style.height = "auto";
      clonedElement.style.overflow = "visible";
      clonedElement.style.width = "100%";
      clonedElement.style.minWidth = "1100px";
      clonedElement.style.backgroundColor = "#ffffff";
      clonedElement.style.padding = "24px";
      clonedElement.style.direction = "rtl";
      clonedElement.style.fontFamily = "Vazirmatn, system-ui, -apple-system, sans-serif";

      // 4. Prepend an official Persian letterhead banner
      const banner = clonedDoc.createElement("div");
      banner.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #0f766e;
        padding-bottom: 12px;
        margin-bottom: 20px;
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
          <div><strong>نوع خروجی:</strong> سند طومار پیوسته (اسکرول افقی / لنداسکیپ)</div>
        </div>
      `;
      clonedElement.insertBefore(banner, clonedElement.firstChild);

      // 5. Append an official footer
      const footer = clonedDoc.createElement("div");
      footer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px dashed #cbd5e1;
        padding-top: 12px;
        margin-top: 24px;
        direction: rtl;
        font-size: 10px;
        color: #94a3b8;
      `;
      footer.innerHTML = `
        <div>تهیه شده در سیستم مدیریت مالی و حسابداری کارگاه · سند رسمی مالی و تجاری</div>
        <div>صفحه پیوسته دیجیتال با قابلیت زوم و اسکرول روان در تلفن همراه و تبلت</div>
      `;
      clonedElement.appendChild(footer);
    },
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // Single continuous scrollable page: landscape orientation
  const orientation = imgWidth >= imgHeight ? "l" : "p";
  const pdf = new jsPDF({
    orientation: orientation as "l" | "p",
    unit: "px",
    format: [imgWidth, imgHeight],
    hotfixes: ["px_scaling"],
  });

  if (title) {
    pdf.setProperties({
      title,
      subject: "گزارش حسابداری کارگاه",
      author: "سیستم حسابداری کارگاه",
      creator: "حسابداری کارگاه",
    });
  }

  pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
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

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: Math.max(element.scrollWidth || 1200, 1200),
    onclone: (clonedDoc, clonedElement) => {
      // Hide interactive action buttons, edit forms, inputs
      const hideSelectors = [
        "button",
        ".button",
        ".icon-button",
        ".form-actions",
        ".no-print",
        ".table-actions",
        "input[type='button']",
        "input[type='submit']",
        ".filter-grid",
        ".pagination",
      ];
      clonedElement.querySelectorAll(hideSelectors.join(", ")).forEach(node => {
        (node as HTMLElement).style.setProperty("display", "none", "important");
      });

      // Expand all scroll and overflow wrappers
      clonedElement.querySelectorAll(".table-wrap, .dialog-body, .scroll-area, [class*='scroll']").forEach(node => {
        const el = node as HTMLElement;
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
        el.style.maxWidth = "none";
        el.style.width = "100%";
      });

      clonedElement.style.maxHeight = "none";
      clonedElement.style.height = "auto";
      clonedElement.style.overflow = "visible";
      clonedElement.style.width = "100%";
      clonedElement.style.minWidth = "1100px";
      clonedElement.style.backgroundColor = "#ffffff";
      clonedElement.style.padding = "20px";
      clonedElement.style.direction = "rtl";
      clonedElement.style.fontFamily = "Vazirmatn, system-ui, -apple-system, sans-serif";

      // Official banner
      const banner = clonedDoc.createElement("div");
      banner.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #0f766e;
        padding-bottom: 10px;
        margin-bottom: 16px;
        direction: rtl;
      `;
      banner.innerHTML = `
        <div style="text-align: right;">
          <div style="font-size: 11px; font-weight: bold; color: #0f766e;">سیستم مدیریت مالی کارگاه</div>
          <div style="font-size: 16px; font-weight: 800; color: #1e293b;">${title}</div>
        </div>
        <div style="text-align: left; font-size: 10px; color: #64748b;">
          <div>تاریخ: ${currentJalaliDateTime()}</div>
          <div>قطع چاپ: چندصفحه‌ای افقی استاندارد (A4)</div>
        </div>
      `;
      clonedElement.insertBefore(banner, clonedElement.firstChild);
    },
  });

  const imgData = canvas.toDataURL("image/png");
  // A4 Landscape: 297mm x 210mm
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  if (title) {
    pdf.setProperties({ title });
  }

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= usableHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage("a4", "landscape");
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;
  }

  pdf.save(`${filename.endsWith(".pdf") ? filename : `${filename}.pdf`}`);
}
