import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";

const SESSION_INTRO_KEY = "metrica-intro-seen";

export function SessionIntro() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_INTRO_KEY)) return;
    sessionStorage.setItem(SESSION_INTRO_KEY, "1");
    setVisible(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setVisible(false), reduced ? 250 : 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <div className="session-intro" role="status" aria-label="Carregando Métrica">
      <div className="session-intro-mark">
        <BarChart3 className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="text-xl font-bold tracking-tight">Métrica</div>
      <div className="session-intro-track">
        <span />
      </div>
    </div>
  );
}
