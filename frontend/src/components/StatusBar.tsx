import { useStore } from "../store";
import { Wifi, WifiOff, Cpu, Eye, MonitorOff, Brain } from "lucide-react";
import { Tooltip } from "./Tooltip";

export default function StatusBar() {
  const state       = useStore((s) => s.state);
  const ollamaOk    = useStore((s) => s.ollamaOk);
  const browserMode = useStore((s) => s.browserMode);
  const profile     = useStore((s) => s.models.profile);

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Tooltip
        side="bottom"
        content={ollamaOk
          ? "Ollama is up. All inference runs locally through it."
          : "Ollama is not reachable on http://127.0.0.1:11434. Start it with 'ollama serve' or open the Ollama tray app."}
      >
        <span><Pill ok={ollamaOk} info={false} label={ollamaOk ? "Ollama" : "Ollama offline"}
                    Icon={ollamaOk ? Wifi : WifiOff} /></span>
      </Tooltip>

      <Tooltip
        side="bottom"
        content={
          browserMode === "detached" ? "Chrome isn't connected. Click 'Connect Chrome' in the sidebar." :
          browserMode === "cdp"      ? "Attached via CDP to your Chrome (started by launch-chrome.ps1). Logins reused." :
          browserMode === "profile"  ? "OMNI launched Chrome with the persistent OMNI profile. Logins persist across runs." :
                                       "Ephemeral managed Chromium. Logins won't persist."
        }
      >
        <span><Pill
          ok={browserMode !== "detached" && browserMode !== "managed"}
          info={false}
          label={`Chrome ${browserMode}`}
          Icon={browserMode === "detached" ? MonitorOff : Eye}
        /></span>
      </Tooltip>

      <Tooltip side="bottom" content="Current orchestrator state. IDLE means OMNI is waiting on you.">
        <span><Pill ok info label={state} Icon={Cpu} /></span>
      </Tooltip>

      {profile?.text_reason && (
        <Tooltip side="bottom" content="Active reasoning model. Auto-picked from your detected GPU VRAM.">
          <span><Pill ok info label={modelLabel(profile.text_reason)} Icon={Brain} /></span>
        </Tooltip>
      )}
    </div>
  );
}

function modelLabel(name: string) {
  // Trim long Ollama tags so they don't blow out the header.
  if (name.length <= 16) return name;
  const colon = name.indexOf(":");
  if (colon > 0) {
    const head = name.slice(0, colon);
    const tag = name.slice(colon + 1);
    return `${head}:${tag.split("-")[0]}`;
  }
  return name.slice(0, 14) + "…";
}

function Pill({ ok, info, label, Icon }: {
  ok: boolean; info?: boolean; label: string; Icon?: any;
}) {
  const cls = info
    ? "border-omni-ice/30 text-omni-ice bg-omni-ice/[0.08]"
    : ok
    ? "border-omni-ok/30 text-omni-ok bg-omni-ok/10"
    : "border-omni-mute/30 text-omni-mute bg-white/[0.03]";
  return (
    <span className={`chip ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      <span className="font-medium tracking-tight">{label}</span>
    </span>
  );
}
