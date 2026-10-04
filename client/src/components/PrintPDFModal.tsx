import React, { useState } from "react";
import {
  Printer,
  FileDown,
  Scroll,
  Layers,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import {
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
  const [successMessage, setSuccessMessage] = useState("");

  async function handleContinuousRollDownload() {
    try {
      setIsExporting(true);
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
      setSuccessMessage("فایل PDF طومار لنداسکیپ دانلود شد");
      setTimeout(() => {
        setSuccessMessage("");
        setIsOpen(false);
      }, 1800);
    } catch (err) {
      console.error(err);
      alert("خطا در ایجاد PDF طومار: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  }

  async function handleA4LandscapeDownload() {
    try {
      setIsExporting(true);
      if (onBeforeExport) {
        await onBeforeExport();
        await new Promise(r => setTimeout(r, 350));
      }
      const el = getTargetElement();
      if (!el) {
        alert("عنصر چاپی یافت نشد");
        return;
      }
      await exportToMultiPageLandscapePDF(el, {
        filename: `${filename}-چندصفحه-A4`,
        title,
        landscape: true,
      });
      setSuccessMessage("فایل PDF چندصفحه‌ای دانلود شد");
      setTimeout(() => {
        setSuccessMessage("");
        setIsOpen(false);
      }, 1800);
    } catch (err) {
      console.error(err);
      alert("خطا در ایجاد PDF: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (onAfterExport) onAfterExport();
      setIsExporting(false);
    }
  }

  function handlePrintClick() {
    setIsOpen(false);
    if (onDirectPrint) {
      onDirectPrint();
    } else {
      window.print();
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
              minWidth: 290,
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
                گزینه‌های چاپ و فایل PDF
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
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={18} color="#16a34a" />
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
                <span>در حال ایجاد و پردازش فایل PDF...</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleContinuousRollDownload}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: "none",
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
                    }}
                  >
                    <Scroll size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>
                      دانلود PDF طومار لنداسکیپ (پیوسته)
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                      فایل یکپارچه بدون برش برگه با اسکرول و زوم روان در موبایل و اندروید
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleA4LandscapeDownload}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: "none",
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
                    }}
                  >
                    <Layers size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>
                      دانلود PDF لنداسکیپ چندصفحه‌ای (A4)
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                      فرمت استاندارد چندبرگه‌ای A4 افقی برای پرینترهای اداری
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handlePrintClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "right",
                    width: "100%",
                    transition: "background 0.15s ease",
                    borderTop: "1px dashed #e2e8f0",
                    marginTop: 2,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    style={{
                      background: "#f3f4f6",
                      color: "#4b5563",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                    }}
                  >
                    <Printer size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>
                      ارسال به چاپگر سیستم (Print)
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                      باز کردن پنجره چاپ استاندارد اندروید یا سیستم‌عامل
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
