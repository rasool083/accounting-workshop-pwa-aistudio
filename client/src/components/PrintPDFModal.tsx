import React, { useState } from "react";
import {
  Printer,
  FileDown,
  Scroll,
  Layers,
  FileText,
  CheckCircle2,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import {
  printVectorContinuousRoll,
  downloadVectorHtmlDocument,
  exportToContinuousRollPDF,
  exportToMultiPageLandscapePDF,
} from "@/lib/pdfScrollExport";

export interface PrintActionMenuProps {
  title: string;
  filename: string;
  getTargetElement: () => HTMLElement | null;
  onBeforeExport?: () => void | Promise<void>;
  onAfterExport?: () => void;
  onDirectPrint?: () => void;
  buttonLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PrintActionMenu({
  title,
  filename,
  getTargetElement,
  onBeforeExport,
  onAfterExport,
  onDirectPrint,
  buttonLabel = "چاپ و خروجی PDF",
  className = "button button-secondary",
  style,
}: PrintActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  /**
   * 1. 100% Vector-Text Continuous Roll Print & PDF.
   * Real computer vector fonts, razor-sharp Persian numerals, zero blur, selectable text.
   * Seamless single continuous roll without page breaks.
   */
  async function handleVectorContinuousRollPrint() {
    try {
      setIsExporting(true);
      setLoadingText("در حال آماده‌سازی طومار متنی وکتور...");
      if (onBeforeExport) {
        await onBeforeExport();
        await new Promise(r => setTimeout(r, 350));
      }
      const el = getTargetElement();
      if (!el) {
        alert("عنصر چاپی یافت نشد");
        return;
      }
      await printVectorContinuousRoll(el, {
        filename: `${filename}-طومار-متنی`,
        title,
        singleRoll: true,
      });
      setSuccessMessage("پنجره چاپ متنی طومار باز شد (برای ذخیره فایل، گزینه Save as PDF را بزنید)");
      setTimeout(() => {
        setSuccessMessage("");
        setIsOpen(false);
      }, 2500);
    } catch (err) {
      console.error(err);
      alert("خطا در چاپ طومار: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  }

  /**
   * 2. Standalone Vector HTML Document download.
   * Completely offline, readable on all mobile phones & PCs, zero blur, sharable via WhatsApp/Eitaa.
   */
  async function handleDownloadVectorHtml() {
    try {
      setIsExporting(true);
      setLoadingText("در حال ایجاد سند متنی طومار...");
      if (onBeforeExport) {
        await onBeforeExport();
        await new Promise(r => setTimeout(r, 350));
      }
      const el = getTargetElement();
      if (!el) {
        alert("عنصر چاپی یافت نشد");
        return;
      }
      downloadVectorHtmlDocument(el, {
        filename: `${filename}-سند-متنی-طومار`,
        title,
      });
      setSuccessMessage("سند متنی طومار با فونت شفاف و متن واقعی دانلود شد");
      setTimeout(() => {
        setSuccessMessage("");
        setIsOpen(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      alert("خطا در ایجاد سند متنی: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  }

  /**
   * 3. Vector Multi-page A4 Landscape Print (Standard Office Multi-page).
   */
  async function handleVectorA4LandscapePrint() {
    try {
      setIsExporting(true);
      setLoadingText("در حال آماده‌سازی چاپ افقی A4...");
      if (onBeforeExport) {
        await onBeforeExport();
        await new Promise(r => setTimeout(r, 350));
      }
      const el = getTargetElement();
      if (!el) {
        alert("عنصر چاپی یافت نشد");
        return;
      }
      await printVectorContinuousRoll(el, {
        filename: `${filename}-چندصفحه-A4`,
        title,
        singleRoll: false,
      });
      setSuccessMessage("پنجره چاپ چندصفحه‌ای A4 باز شد");
      setTimeout(() => {
        setSuccessMessage("");
        setIsOpen(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      alert("خطا در چاپ: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  }

  /**
   * 4. Direct 1-Click Continuous PDF Download (Ultra High DPI Lossless PNG).
   */
  async function handleContinuousRollDownload() {
    try {
      setIsExporting(true);
      setLoadingText("در حال ایجاد و پردازش فایل PDF با وضوح بالا...");
      if (onBeforeExport) {
        await onBeforeExport();
        await new Promise(r => setTimeout(r, 350));
      }
      const el = getTargetElement();
      if (!el) {
        alert("عنصر چاپی یافت نشد");
        return;
      }
      await exportToContinuousRollPDF(el, {
        filename: `${filename}-طومار-لنداسکیپ`,
        title,
        landscape: true,
      });
      setSuccessMessage("فایل PDF طومار لنداسکیپ با کیفیت ۳۵۰ DPI دانلود شد");
      setTimeout(() => {
        setSuccessMessage("");
        setIsOpen(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      alert("خطا در ایجاد PDF طومار: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={className}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          ...style,
        }}
        title="گزینه‌های چاپ و دانلود PDF لنداسکیپ"
      >
        <Printer size={16} />
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99998,
            }}
            onClick={() => !isExporting && setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "100%",
              marginTop: 6,
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              zIndex: 99999,
              minWidth: 320,
              maxWidth: 380,
              padding: "10px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              direction: "rtl",
              textAlign: "right",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px 8px 8px",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
                گزینه‌های چاپ و خروجی گزارش (بدون سود و اطلاعات داخلی)
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsOpen(false)}
                style={{ padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>

            {successMessage ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 10px",
                  background: "#f0fdf4",
                  color: "#166534",
                  borderRadius: 8,
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                <span>{successMessage}</span>
              </div>
            ) : isExporting ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "16px 10px",
                  color: "#0369a1",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                <Loader2 size={18} className="animate-spin" />
                <span>{loadingText || "در حال پردازش سند..."}</span>
              </div>
            ) : (
              <>
                {/* 1. Primary: Vector Continuous Roll Print & Save as PDF */}
                <button
                  type="button"
                  onClick={handleVectorContinuousRollPrint}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: "1.5px solid #0f766e",
                    background: "#f0fdf4",
                    cursor: "pointer",
                    textAlign: "right",
                    width: "100%",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#dcfce7")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#f0fdf4")}
                >
                  <div
                    style={{
                      background: "#0f766e",
                      color: "#ffffff",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    <Scroll size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "#064e3b" }}>
                        طومار متنی پیوسته (متن واقعی و کیفیت نامحدود)
                      </span>
                      <span
                        style={{
                          background: "#0f766e",
                          color: "#fff",
                          fontSize: "0.68rem",
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        پیشنهادی
                      </span>
                    </div>
                    <div style={{ fontSize: "0.73rem", color: "#166534", marginTop: 2 }}>
                      متن ۱۰۰٪ وکتور و اعداد کریستالی بدون تصویر؛ چاپ یا ذخیره PDF یکپارچه بدون برش صفحه
                    </div>
                  </div>
                </button>

                {/* 2. Standalone Vector HTML Document */}
                <button
                  type="button"
                  onClick={handleDownloadVectorHtml}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "right",
                    width: "100%",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      background: "#e0f2fe",
                      color: "#0284c7",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>
                      دانلود سند متنی طومار (فایل مستقل HTML)
                    </div>
                    <div style={{ fontSize: "0.73rem", color: "#64748b" }}>
                      فایل سبک و شفاف با متن واقعی؛ باز شدن در گوشی و ارسال در واتساپ و ایتا
                    </div>
                  </div>
                </button>

                {/* 3. Multi-page Landscape A4 Print */}
                <button
                  type="button"
                  onClick={handleVectorA4LandscapePrint}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "right",
                    width: "100%",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      background: "#fef3c7",
                      color: "#d97706",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    <Layers size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>
                      چاپ لنداسکیپ چندصفحه‌ای (استاندارد A4 افقی)
                    </div>
                    <div style={{ fontSize: "0.73rem", color: "#64748b" }}>
                      متن متنی وکتور تفکیک‌شده در برگه‌های استاندارد A4 برای پرینترهای معمولی
                    </div>
                  </div>
                </button>

                {/* 4. Direct 1-Click PDF Download */}
                <button
                  type="button"
                  onClick={handleContinuousRollDownload}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "right",
                    width: "100%",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    <FileDown size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>
                      دانلود مستقیم تک‌فایل PDF پیوسته (۳۵۰ DPI)
                    </div>
                    <div style={{ fontSize: "0.73rem", color: "#64748b" }}>
                      دانلود بی‌واسطه فایل PDF طومار یکپارچه بدون باز شدن پنجره چاپ
                    </div>
                  </div>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
