"use client";

import { useState } from "react";

type AlertType = "error" | "info" | "warning";

const STYLES: Record<AlertType, { container: string; icon: string }> = {
  error: { container: "border-red-500/40 bg-red-500/15 text-red-200", icon: "❌" },
  info: { container: "border-[#5865F2]/40 bg-[#5865F2]/15 text-[#C7CDFB]", icon: "ℹ️" },
  warning: { container: "border-yellow-500/40 bg-yellow-500/15 text-yellow-200", icon: "⚠️" },
};

interface AlertBannerProps {
  type: AlertType;
  message: string;
}

/** Dismissible alert banner (error / info / warning). No consumer in this milestone yet — built for the dashboard's error states. */
export function AlertBanner({ type, message }: AlertBannerProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const styles = STYLES[type];
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${styles.container}`}
    >
      <span aria-hidden="true">{styles.icon}</span>
      <p className="flex-1 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="rounded p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}