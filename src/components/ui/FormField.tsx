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
      <label className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-0.5" style={{ color: error ? "#dc2626" : "#6b7280" }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[10px]" style={{ color: "#6b7280" }}>{hint}</p>
      )}
      {error && (
        <p className="text-[10px] font-medium" style={{ color: "#dc2626" }}>⚠ {error}</p>
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
        background: "var(--app-navy)",
        border: error ? "1.5px solid #dc2626" : "1px solid #e5e7eb",
        color: "#1f2937",
        ...style,
      }}
    />
  );
}
