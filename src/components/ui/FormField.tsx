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
      <label className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-0.5" style={{ color: error ? "#ff716c" : "#a0abc3" }}>
        {label}
        {required && <span style={{ color: "#ff716c" }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[10px]" style={{ color: "#a0abc3" }}>{hint}</p>
      )}
      {error && (
        <p className="text-[10px] font-medium" style={{ color: "#ff716c" }}>⚠ {error}</p>
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
        background: "#030e20",
        border: error ? "1.5px solid #ff716c" : "1px solid rgba(106,118,140,0.15)",
        color: "#dae6ff",
        ...style,
      }}
    />
  );
}
