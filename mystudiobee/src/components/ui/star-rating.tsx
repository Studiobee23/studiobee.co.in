"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

function Stars({
  value,
  max = 5,
  size,
}: {
  value: number;
  max?: number;
  size: number;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <Star
          key={n}
          className={cn(
            n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/30"
          )}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

/** Read-only star display, e.g. for table cells. */
export function StarRatingDisplay({
  value,
  max = 5,
  size = 14,
  showValue = false,
}: {
  value: number | null | undefined;
  max?: number;
  size?: number;
  showValue?: boolean;
}) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="inline-flex items-center gap-1.5">
      <Stars value={value} max={max} size={size} />
      {showValue && <span className="text-xs text-muted-foreground">{value.toFixed(1)}</span>}
    </div>
  );
}

/** Interactive star input, e.g. for rating dialogs. */
export function StarRatingInput({
  value,
  onChange,
  max = 5,
  size = 22,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  size?: number;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(n <= value ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/30")}
            style={{ width: size, height: size }}
          />
        </button>
      ))}
    </div>
  );
}
