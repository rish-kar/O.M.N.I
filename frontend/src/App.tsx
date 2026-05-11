import { useEffect, useState } from "react";
import { api, connectEvents } from "./api";
import { useStore } from "./store";
import Background from "./components/Background";
import Logo from "./components/Logo";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import ChatPanel from "./components/ChatPanel";
import Dashboard from "./components/Dashboard";
import PermissionToasts from "./components/PermissionToasts";
import OnboardingTour from "./components/OnboardingTour";
import SettingsModal from "./components/SettingsModal";
import LayoutSwitcher from "./components/LayoutSwitcher";
import ErrorConsole from "./components/ErrorConsole";
import { Tooltip } from "./components/Tooltip";
import { Settings, HelpCircle, AlertOctagon } from "lucide-react";

export default function App() {
  const setHealth     = useStore((s) => s.setHealth);
  const setStatus     = useStore((s) => s.setStatus);
  const setBackendOk  = useStore((s) => s.setBackendOk);
  const setModels     = useStore((s) => s.setModels);
  const applyEvent    = useStore((s) => s.applyEvent);
  const setMessages   = useStore((s) => s.setMessages);
  const setSessions   = useStore((s) => s.setSessions);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const backendOk     = useStore((s) => s.backendOk);
  const layout        = useStore((s) => s.layout);
  const [tourOpen, setTourOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      api.health().then(setHealth).catch(() => setBackendOk(false));
      api.status().then(setStatus).catch(() => setBackendOk(false));
    };
    refresh();
    api.models().then(setModels).catch(() => {});

    // Load chat sessions + restore most recent (or last-viewed) session
    (async () => {
      try {
        const data = await api.chatSessions();
        const sessions = data?.sessions || [];
        setSessions(sessions);
        if (sessions.length > 0) {
          const stored = Number(localStorage.getItem("omni.currentSessionId") || "");
          const target = sessions.find((s: any) => s.id === stored) || sessions[0];
          setCurrentSessionId(target.id);
          const hist = await api.chatHistory(target.id, 500);
          setMessages(
            (hist?.messages || []).map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              ts: new Date(String(m.ts).replace(" ", "T") + "Z").getTime(),
            })),
          );
        }
      } catch {}
    })();

    const stop = connectEvents(applyEvent);
    const t = setInterval(refresh, 5000);
    if (!localStorage.getItem("omni.tour.seen")) setTourOpen(true);
    return () => { stop(); clearInterval(t); };
  }, [applyEvent, setHealth, setModels, setStatus, setBackendOk, setMessages, setSessions, setCurrentSessionId]);

  return (
    <>
      <Background />

      <div className="h-screen w-screen flex flex-col text-omni-text">
        {/* ===== Header ===== */}
        <header
          className="flex items-center justify-between px-5 h-14 shrink-0
                     border-b border-white/[0.06] bg-black/30 backdrop-blur-2xl"
        >
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold tracking-[0.32em] gradient-text">
                O.M.N.I
              </div>
              <div className="text-[9px] text-omni-mute uppercase tracking-[0.28em]">
                Offline Machine Navigation Intelligence
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBar />
            <div className="h-5 w-px bg-white/10" />
            <LayoutSwitcher />
            <Tooltip content="Replay the guided tour." side="bottom">
              <button
                className="btn btn-icon"
                onClick={() => setTourOpen(true)}
                aria-label="Help / Guided tour"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip content="Personality, voice, paths, and advanced settings." side="bottom">
              <button
                className="btn btn-icon"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </header>

        {!backendOk && <BackendDownBanner />}

        {/* ===== Body — layout switches here ===== */}
        <div className="flex flex-1 min-h-0">
          {layout === "studio" && (
            <>
              <Sidebar />
              <main className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0">
                <section className="col-span-7 min-h-0"><Dashboard /></section>
                <section className="col-span-5 min-h-0"><ChatPanel /></section>
              </main>
            </>
          )}
          {layout === "focus" && (
            <main className="flex-1 flex justify-center p-4 min-h-0">
              <div className="w-full max-w-3xl min-h-0 flex flex-col">
                <ChatPanel />
              </div>
            </main>
          )}
          {layout === "command" && (
            <main className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0">
              <section className="col-span-8 min-h-0 flex flex-col gap-3">
                <Dashboard />
              </section>
              <section className="col-span-4 min-h-0 flex flex-col">
                <ChatPanel />
              </section>
            </main>
          )}
        </div>

        <PermissionToasts />
        <ErrorConsole />
      </div>

      {tourOpen && (
        <OnboardingTour
          onClose={() => {
            localStorage.setItem("omni.tour.seen", "1");
            setTourOpen(false);
          }}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function BackendDownBanner() {
  return (
    <div
      className="flex items-center gap-3 px-5 py-2 border-b border-omni-danger/30
                 bg-omni-danger/10 text-omni-danger text-xs animate-fade-in"
      role="alert"
    >
      <AlertOctagon className="h-4 w-4 shrink-0" />
      <span className="font-medium">Local engine is offline.</span>
      <span className="text-omni-danger/85">
        OMNI couldn't reach its Python service on{" "}
        <code className="font-mono">127.0.0.1:8765</code>. Restart the app
        (run-dev.ps1) so the latest endpoints register.
      </span>
    </div>
  );
}
