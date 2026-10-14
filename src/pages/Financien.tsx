import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { FinancienDesktop } from "@/components/financien/FinancienDesktop";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

/**
 * Financiën is bewusst een desktop-scherm (FINANCIEN.md: alleen lg en breder).
 * Op kleiner scherm is er alleen een melding; er staan geen tarieven op.
 */
export default function Financien() {
  const { badges } = useNavBadges();
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const luister = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", luister);
    return () => mq.removeEventListener("change", luister);
  }, []);

  if (isDesktop) return <FinancienDesktop />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="fn-mobile mx-auto max-w-[430px]">
        <Monitor className="h-6 w-6" style={{ color: "var(--text-muted)" }} />
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Financiën</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Het financieel overzicht is alleen op een groter scherm te zien. Open deze pagina op een laptop of desktop.
        </p>
      </div>
      <BottomNav badges={badges} />
    </div>
  );
}
