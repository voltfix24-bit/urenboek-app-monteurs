import { useState, useRef, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deltaY, setDeltaY] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setDeltaY(Math.min(delta, 80));
    } else {
      setPulling(false);
      setDeltaY(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!pulling) return;
    if (deltaY >= 60) {
      setRefreshing(true);
      setDeltaY(50);
      await onRefresh();
      setRefreshing(false);
    }
    setPulling(false);
    setDeltaY(0);
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      {(deltaY > 0 || refreshing) && (
        <div
          className="absolute left-0 right-0 flex flex-col items-center justify-center z-10 transition-transform"
          style={{ top: 0, height: deltaY, overflow: "hidden" }}
        >
          <Loader2
            className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: "#4A7C2F" }}
          />
          <span className="text-[10px] font-medium mt-1" style={{ color: "#4A7C2F" }}>
            {refreshing ? "Verversen..." : deltaY >= 60 ? "Loslaten..." : ""}
          </span>
        </div>
      )}
      <div style={{ transform: `translateY(${deltaY}px)`, transition: pulling ? "none" : "transform 0.2s ease" }}>
        {children}
      </div>
    </div>
  );
}
