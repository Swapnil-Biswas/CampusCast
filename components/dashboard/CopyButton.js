"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Copies a piece of text (a link, a phone number) to the clipboard and says so.
export default function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked: nothing to do */ }
  };
  return <button type="button" className="btn-s" onClick={copy} aria-live="polite">{done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : label}</button>;
}
