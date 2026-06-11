import { forwardRef, useEffect, useRef, useState, useCallback } from "react";

/**
 * Centrale numerieke input.
 *
 * - Houdt tijdens typen een lokale **string** bij, zodat het veld leeg kan zijn
 *   zonder direct naar `0` terug te springen.
 * - Emit `onChange(null)` als het veld leeg is, anders een geldig getal.
 * - Pas op `blur` worden waarden geclampt naar `min`/`max` en geformatteerd.
 * - Accepteert zowel komma als punt als decimaalscheidingsteken.
 * - `integer` forceert hele getallen (gebruik voor o.a. kilometers, aantallen).
 * - `selectOnFocus` selecteert de hele inhoud bij focus (handig voor `0`-defaults).
 * - `wheelDisabled` (standaard `true`) voorkomt dat scroll-wieltje de waarde wijzigt.
 */

export type NumericInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  integer?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
  /** Aantal decimalen voor formatteren bij blur. Default: vrij. */
  decimals?: number;
  /** Waarde die bij blur wordt gecommit als veld leeg is. Default: null. */
  emptyAs?: number | null;
  selectOnFocus?: boolean;
  wheelDisabled?: boolean;
};

function toDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (Number.isNaN(value)) return "";
  return String(value);
}

function parseRaw(raw: string, integer: boolean, allowNegative: boolean): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Tussenstaten waarbij we niets emitten (gebruiker is nog aan het typen)
  if (trimmed === "-" || trimmed === "." || trimmed === "," || trimmed === "-.") return "invalid";
  const normalized = trimmed.replace(",", ".");
  if (!allowNegative && normalized.startsWith("-")) return "invalid";
  // Regex die getallen valideert (incl. eindigend op `.` zoals "12.")
  const re = allowNegative ? /^-?\d+(\.\d*)?$/ : /^\d+(\.\d*)?$/;
  if (!re.test(normalized)) return "invalid";
  const num = integer ? parseInt(normalized, 10) : parseFloat(normalized);
  if (!Number.isFinite(num)) return "invalid";
  return num;
}

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  {
    value,
    onChange,
    integer = false,
    allowNegative = false,
    min,
    max,
    decimals,
    emptyAs = null,
    selectOnFocus = false,
    wheelDisabled = true,
    onBlur,
    onFocus,
    onWheel,
    onKeyDown,
    inputMode,
    ...rest
  },
  ref,
) {
  const [text, setText] = useState<string>(() => toDisplay(value));
  const focusedRef = useRef(false);

  // Sync van buitenaf alleen als input niet gefocust is, om te voorkomen dat we
  // tijdens typen de string wissen.
  useEffect(() => {
    if (focusedRef.current) return;
    setText(toDisplay(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setText(raw);
      const parsed = parseRaw(raw, integer, allowNegative);
      if (parsed === "invalid") return; // wacht op meer input
      onChange(parsed);
    },
    [integer, allowNegative, onChange],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      focusedRef.current = false;
      const parsed = parseRaw(text, integer, allowNegative);
      let committed: number | null;
      if (parsed === null) {
        committed = emptyAs;
      } else if (parsed === "invalid") {
        // val terug op laatst bekende externe waarde
        committed = value ?? emptyAs;
      } else {
        committed = parsed;
        if (typeof min === "number" && committed < min) committed = min;
        if (typeof max === "number" && committed > max) committed = max;
        if (integer && committed !== null) committed = Math.trunc(committed);
        if (!integer && typeof decimals === "number" && committed !== null) {
          const factor = Math.pow(10, decimals);
          committed = Math.round(committed * factor) / factor;
        }
      }
      onChange(committed);
      setText(toDisplay(committed));
      onBlur?.(e);
    },
    [text, integer, allowNegative, min, max, decimals, emptyAs, value, onChange, onBlur],
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      focusedRef.current = true;
      if (selectOnFocus) {
        // Async zodat React eerst de selectie kan zetten
        requestAnimationFrame(() => {
          try {
            e.target.select();
          } catch {}
        });
      }
      onFocus?.(e);
    },
    [selectOnFocus, onFocus],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLInputElement>) => {
      if (wheelDisabled) {
        (e.target as HTMLInputElement).blur();
      }
      onWheel?.(e);
    },
    [wheelDisabled, onWheel],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // pijltjes uit, voorkomt onbedoelde grote sprongen
        e.preventDefault();
      }
      if (e.key === "Escape") {
        // herstel vorige (externe) waarde en blur
        setText(toDisplay(value));
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      }
      onKeyDown?.(e);
    },
    [onKeyDown, value],
  );

  return (
    <input
      ref={ref}
      type="text"
      inputMode={inputMode ?? (integer ? "numeric" : "decimal")}
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      {...rest}
    />
  );
});
