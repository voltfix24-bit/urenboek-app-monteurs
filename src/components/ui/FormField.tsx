import type { ReactNode, InputHTMLAttributes } from "react";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

export function FormField({ label, error, required, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-0.5" style={{ color: error ? "var(--danger)" : "var(--text-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</p>
      )}
      {error && (
        <p className="text-[10px] font-medium" style={{ color: "var(--danger)" }}>⚠ {error}</p>
      )}
    </div>
  );
}

interface ValidatedInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function ValidatedInput({ error, style, ...props }: ValidatedInputProps) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2.5 rounded-xl text-sm ${props.className || ""}`}
      style={{
        background: "var(--bg-base)",
        border: error ? "1.5px solid var(--danger)" : "1px solid var(--border)",
        color: "var(--text-primary)",
        ...style,
      }}
    />
  );
}
