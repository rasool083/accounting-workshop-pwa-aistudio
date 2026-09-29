import React, { useState } from "react";
import { Download, Check, HelpCircle, X } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setJustInstalled(true);
      setTimeout(() => setJustInstalled(false), 3000);
    }
  };

  // Chromium / Microsoft Edge / Android flow
  if (isInstallable) {
    return (
      <button
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-xs cursor-pointer"
        title="نصب برنامه روی کامپیوتر یا موبایل (PWA)"
      >
        {justInstalled ? (
          <>
            <Check size={14} />
            <span>نصب شد</span>
          </>
        ) : (
          <>
            <Download size={14} />
            <span>نصب برنامه (PWA)</span>
          </>
        )}
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="راهنمای نصب روی آیفون/آیپد"
        >
          <HelpCircle size={13} />
          <span>نصب در iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-right">
              <div className="flex items-center justify-between border-b pb-3 mb-3 border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  نصب روی آیفون / آیپد
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
                <div>۱. در سافاری روی دکمه <strong>Share</strong> (آیکون اشتراک‌گذاری) بزنید.</div>
                <div>۲. به پایین اسکرول کرده و گزینه <strong>Add to Home Screen</strong> را انتخاب کنید.</div>
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-emerald-700 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
