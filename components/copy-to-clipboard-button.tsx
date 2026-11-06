"use client";

import { useState } from "react";

type CopyToClipboardButtonProps = {
  text: string;
};

export function CopyToClipboardButton({ text }: CopyToClipboardButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(text);
      setStatus("copied");

      window.setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch {
      setStatus("error");
    }
  };

  const label =
    status === "copied"
      ? "Copied"
      : status === "error"
        ? "Copy failed"
        : "Copy to Clipboard";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="app-button rounded-md px-3 py-1.5 text-xs font-medium transition"
    >
      {label}
    </button>
  );
}
