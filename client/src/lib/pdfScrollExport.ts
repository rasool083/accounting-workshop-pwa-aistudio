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
 * Safely renders an HTML element into a canvas with automatic scale optimization
 * and fallback between html2canvas-pro and standard html2canvas.
 */
async function renderElementToCanvas(
  element: HTMLElement,
  title: string,
  docTypeLabel: string
): Promise<HTMLCanvasElement> {
  const scrollH = element.scrollHeight || element.offsetHeight || 800;
  const scrollW = element.scrollWidth || element.offsetWidth || 1100;

  // Compute safe scale so that total canvas dimensions do not exceed mobile GPU limits (usually 4096 or 8192px)
  let targetScale = 2;
  if (scrollH * targetScale > 7500 || scrollW * targetScale > 7500) {
    targetScale = Math.min(1.5, 7500 / Math.max(scrollH, scrollW));
  }
  if (targetScale < 1) targetScale = 1;

  const onCloneHandler = (clonedDoc: Document, clonedElement: HTMLElement) => {
    // 1. Hide interactive action buttons, forms, and print-excluded elements
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

    // 2. Expand scroll and overflow wrappers
    clonedElement
      .querySelectorAll(".table-wrap, .dialog-body, .scroll-area, [class*='scroll']")
      .forEach(node => {
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

    // 4. Prepend official Persian banner
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
        <div><strong>نوع سند:</strong> ${docTypeLabel}</div>
      </div>
    `;
    clonedElement.insertBefore(banner, clonedElement.firstChild);

    // 5. Append official footer
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
    console.warn("html2canvas-pro failed, falling back to standard html2canvas with scale 1:", errPro);
    try {
      return await html2canvasStd(element, { ...options, scale: 1 });
    } catch (errStd) {
      console.warn("html2canvasStd with scale 1 failed, retrying pro with scale 1:", errStd);
      return await html2canvasPro(element, { ...options, scale: 1 });
    }
  }
}

/**
 * Exports an HTML element as a single continuous scrollable landscape PDF roll.
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
    imgData = canvas.toDataURL("image/jpeg", 0.92);
    imgFormat = "JPEG";
  }

  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

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

  pdf.addImage(imgData, imgFormat, 0, 0, imgWidth, imgHeight);
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
    imgData = canvas.toDataURL("image/jpeg", 0.92);
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
