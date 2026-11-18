"use client";

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ variant = "secondary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "bg-surface border border-edge text-ink hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2",
    danger: "bg-surface border border-edge text-critical-text hover:bg-crit-wash",
  };
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        v[variant],
        className,
      )}
    />
  );
}

export function Card({ title, hint, action, children, className, pad = true }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("bg-surface border border-edge rounded-lg min-w-0", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-1">
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-[15px] leading-snug">{title}</h3>}
            {hint && <p className="text-xs text-ink-2 mt-0.5">{hint}</p>}
          </div>
          {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      )}
      <div className={pad ? "p-4 pt-3" : ""}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const t: Record<Tone, string> = {
    neutral: "bg-surface-2 text-ink-2",
    good: "bg-good-wash text-good-text",
    warn: "bg-warn-wash text-ink",
    bad: "bg-crit-wash text-critical-text",
    accent: "bg-accent-wash text-accent-ink",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", t[tone])}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, title }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad"; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-xs text-ink-2 truncate">{label}</div>
      <div className={cx("text-xl font-semibold num leading-tight mt-0.5", tone === "good" && "text-good-text", tone === "bad" && "text-critical-text")}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 num">{sub}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin align-[-2px]", className)} aria-label="Caricamento" />;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-axis rounded-lg px-6 py-10 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="text-sm text-ink-2 mt-1 max-w-xl mx-auto">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

const fieldCls = "h-9 rounded-md border border-edge bg-surface px-2.5 text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-accent focus:outline-offset-0 disabled:opacity-60";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(fieldCls, className)} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(fieldCls, "pr-7", className)}>
      {children}
    </select>
  );
}

export function Label({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1 text-xs text-ink-2 font-medium", className)}>
      {label}
      {children}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/40 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx("bg-surface border border-edge rounded-xl shadow-xl w-full", wide ? "max-w-5xl" : "max-w-xl")}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <h2 className="font-semibold text-[15px] min-w-0 truncate">{title}</h2>
          <button type="button" onClick={onClose} className="text-ink-2 hover:text-ink text-xl leading-none px-1" aria-label="Chiudi">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-md border border-edge bg-surface p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("h-7 px-2.5 rounded text-xs font-medium transition-colors", o.value === value ? "bg-accent-wash text-accent-ink" : "text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="rounded-md bg-crit-wash text-critical-text text-sm px-3 py-2" role="alert">{children}</div>;
}

export function InfoBox({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "warn" }) {
  return <div className={cx("rounded-md text-sm px-3 py-2", tone === "accent" ? "bg-accent-wash text-ink" : "bg-warn-wash text-ink")}>{children}</div>;
}

/** Icona informativa con spiegazione al passaggio del mouse. */
export function Hint({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex items-center justify-center size-3.5 rounded-full border border-axis text-[9px] text-muted cursor-help align-middle ml-1 select-none" aria-label={text}>
      i
    </span>
  );
}
