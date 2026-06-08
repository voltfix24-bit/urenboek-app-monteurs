import { useState, useRef, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const ACTIVATE_AT = 100;   // pixels gesleept voordat refresh triggert
const MAX_PULL = 140;       // hoeveel px de indicator maximaal zakt
const DAMPING = 0.5;        // weerstand: 50% van de werkelijke vingerbeweging
const MIN_INTENT = 12;      // minimale beweging voordat we überhaupt iets tonen

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deltaY, setDeltaY] = useState(0);
  const startY = useRef(0);
  const armed = useRef(false);

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    if (!atTop()) { armed.current = false; return; }
    startY.current = e.touches[0].clientY;
    armed.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!armed.current || refreshing) return;
    const raw = e.touches[0].clientY - startY.current;
    // Alleen reageren op duidelijke neerwaartse intentie én pagina nog bovenaan
    if (raw < MIN_INTENT || !atTop()) {
      if (pulling) { setPulling(false); setDeltaY(0); }
      return;
    }
    setPulling(true);
    const damped = Math.min((raw - MIN_INTENT) * DAMPING, MAX_PULL);
    setDeltaY(damped);
  };

  const handleTouchEnd = async () => {
    armed.current = false;
    if (!pulling) return;
    if (deltaY >= ACTIVATE_AT) {
      setRefreshing(true);
      setDeltaY(60);
      try { await onRefresh(); } finally { setRefreshing(false); }
    }
    setPulling(false);
    setDeltaY(0);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative"
    >
      {(deltaY > 0 || refreshing) && (
        <div
          className="absolute left-0 right-0 flex flex-col items-center justify-center z-10"
          style={{ top: 0, height: deltaY, overflow: "hidden" }}
        >
          <Loader2
            className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: "var(--accent)", opacity: refreshing ? 1 : Math.min(deltaY / ACTIVATE_AT, 1) }}
          />
          <span className="text-[10px] font-medium mt-1" style={{ color: "var(--accent)" }}>
            {refreshing ? "Verversen..." : deltaY >= ACTIVATE_AT ? "Loslaten om te verversen" : ""}
          </span>
        </div>
      )}
      <div style={{ transform: `translateY(${deltaY}px)`, transition: pulling ? "none" : "transform 0.2s ease" }}>
        {children}
      </div>
    </div>
  );
}
