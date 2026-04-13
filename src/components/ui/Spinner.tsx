interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  center?: boolean;
  padding?: string;
}

export function Spinner({ size = "md", center = true, padding = "py-10" }: SpinnerProps) {
  const px = size === "sm" ? 16 : size === "md" ? 32 : 48;

  const spinner = (
    <div
      className="rounded-full animate-spin"
      style={{
        width: px,
        height: px,
        border: "2px solid #3fff8b",
        borderTopColor: "transparent",
      }}
    />
  );

  if (!center) return spinner;

  return (
    <div className={`flex items-center justify-center ${padding}`}>
      {spinner}
    </div>
  );
}
