import { useState } from "react";
import { useStore } from "../store";
import { api, ApiError } from "../api";
import {
  Eye, EyeOff, Wifi, WifiOff, GraduationCap, Pause, Square, Play,
  FolderOpen, FileText, Globe, Power, FileSpreadsheet, Inbox, FolderSymlink,
} from "lucide-react";
import { Tooltip, InfoHint } from "./Tooltip";

export default function Sidebar() {
  const perms        = useStore((s) => s.perms);
  const paths        = useStore((s) => s.paths);
  const browserMode  = useStore((s) => s.browserMode);
  const state        = useStore((s) => s.state);
  const pushToast    = useStore((s) => s.pushToast);
  const pushError    = useStore((s) => s.pushError);
  const [busy, setBusy] = useState<string | null>(null);

  const handleErr = (e: any, fallback: string, source: string) => {
    const msg = e instanceof ApiError ? e.message : (e?.message || fallback);
    pushToast("error", msg);
    pushError(msg, e instanceof ApiError ? e.detail : String(e), source);
  };

  const togglePerm = async (k: string, v: boolean) => {
    try {
      await api.patchConfig({ perms: { [k]: v } });
      const status = await api.status();
      useStore.getState().setStatus(status);
    } catch (e: any) { handleErr(e, "Toggle failed", "permissions"); }
  };

  const setPath = async (key: string, label: string) => {
    const cur = paths[key] || "";
    const v = window.prompt(`${label}\n\nPaste the absolute Windows path:`, cur);
    if (v === null) return;
    try {
      await api.patchConfig({ paths: { [key]: v.trim() || null } });
      const status = await api.status();
      useStore.getState().setStatus(status);
      pushToast("info", `${label} updated`);
    } catch (e: any) { handleErr(e, `Save ${label} failed`, "paths"); }
  };

  const attachBrowser = async () => {
    setBusy("browser");
    try {
      const r = await api.attachBrowser();
      pushToast("info", `Chrome attached (${r.mode})`);
      const status = await api.status();
      useStore.getState().setStatus(status);
    } catch (e: any) { handleErr(e, "Attach failed", "browser"); }
    finally { setBusy(null); }
  };

  const closeBrowser = async () => {
    setBusy("browser");
    try {
      await api.closeBrowser();
      const status = await api.status();
      useStore.getState().setStatus(status);
      pushToast("info", "Chrome detached");
    } catch (e: any) { handleErr(e, "Detach failed", "browser"); }
    finally { setBusy(null); }
  };

  const sessionActive = state !== "IDLE" && state !== "DONE";
  const isPaused      = state === "PAUSED";

  return (
    <aside
      className="w-64 shrink-0 border-r border-white/[0.06] bg-black/30 backdrop-blur-2xl
                 px-3 py-4 flex flex-col gap-5 overflow-y-auto"
    >
      <Section
        title="Session"
        hint="Pause / Stop the running task. Resume picks up where Pause stopped."
      >
        <div className="grid grid-cols-2 gap-1.5">
          <Tooltip content="Pause the agent. Pending permission prompts still work." side="right">
            <button
              className="btn btn-sm w-full"
              onClick={() => api.pauseSession()}
              disabled={!sessionActive || isPaused}
            >
              <Pause className="h-3 w-3" />Pause
            </button>
          </Tooltip>
          <Tooltip content="Cancel any pending automation immediately." side="right">
            <button
              className="btn-danger btn-sm w-full"
              onClick={() => api.stopSession()}
              disabled={!sessionActive}
            >
              <Square className="h-3 w-3" />Stop
            </button>
          </Tooltip>
        </div>
        {isPaused && (
          <Tooltip content="Resume from where Pause stopped." side="right">
            <button
              className="btn-primary btn-sm w-full mt-1.5"
              onClick={() => api.resumeSession()}
            >
              <Play className="h-3 w-3" />Resume
            </button>
          </Tooltip>
        )}
      </Section>

      <Section
        title="Browser"
        hint={
          <>
            How OMNI drives Chrome. <strong>cdp</strong>: attached to your existing Chrome.{" "}
            <strong>profile</strong>: OMNI launched Chrome with a persistent profile.{" "}
            <strong>managed</strong>: ephemeral Chromium (no logins). New navigations always
            open as new tabs.
          </>
        }
        right={<ModePill mode={browserMode} />}
      >
        {browserMode === "detached" ? (
          <Tooltip content="Attach to your running Chrome (recommended) or launch one with the OMNI profile." side="right">
            <button
              className="btn-primary btn-sm w-full"
              onClick={attachBrowser}
              disabled={busy === "browser"}
            >
              <Globe className="h-3.5 w-3.5" />
              {busy === "browser" ? "Connecting..." : "Connect Chrome"}
            </button>
          </Tooltip>
        ) : (
          <Tooltip content="Detach from Chrome. The window itself stays open." side="right">
            <button
              className="btn btn-sm w-full"
              onClick={closeBrowser}
              disabled={busy === "browser"}
            >
              <Power className="h-3.5 w-3.5" />Disconnect
            </button>
          </Tooltip>
        )}
        {browserMode === "managed" && (
          <p className="mt-2 text-[10px] leading-snug text-omni-warn/90">
            Ephemeral session — logins won't persist. Run{" "}
            <code className="font-mono">launch-chrome.ps1</code> for stable logins.
          </p>
        )}
      </Section>

      <Section
        title="Permissions"
        hint="What OMNI is allowed to do. Internet must be ON for any web step. Anything sensitive (final submit, sensitive answers) prompts you live regardless of these toggles."
      >
        <div className="space-y-1">
          <Toggle
            label="Internet"
            tip="Allow OMNI to navigate the web. Required for any job-search session."
            Icon={perms.internet ? Wifi : WifiOff}
            value={!!perms.internet}
            onChange={(v) => togglePerm("internet", v)}
          />
          <Toggle
            label="Screen watch"
            tip="Allow screenshots for the local vision model. Used for tricky form fields whose DOM has no good labels."
            Icon={perms.screen_watch ? Eye : EyeOff}
            value={!!perms.screen_watch}
            onChange={(v) => togglePerm("screen_watch", v)}
          />
          <Toggle
            label="Learning mode"
            tip="When ON, OMNI remembers successful click-paths and replays them on similar sites later."
            Icon={GraduationCap}
            value={!!perms.learning_mode}
            onChange={(v) => togglePerm("learning_mode", v)}
          />
        </div>
      </Section>

      <Section
        title="Paths"
        hint="Click any row to set an absolute Windows path. OMNI auto-backs up before any write."
      >
        <div className="space-y-2">
          <PathRow
            icon={FileText} label="Master resume"
            tip="Your master .docx. OMNI tailors a per-job copy and never edits this file."
            value={paths.resume_master}
            onClick={() => setPath("resume_master", "Master resume (.docx)")}
          />
          <PathRow
            icon={FileSpreadsheet} label="Tracker"
            tip="An .xlsx OMNI appends rows to (one per application). A timestamped backup is created before each write."
            value={paths.tracker_xlsx}
            onClick={() => setPath("tracker_xlsx", "Application tracker (.xlsx)")}
          />
          <PathRow
            icon={Inbox} label="Cover-letter inbox"
            tip="Where ChatGPT-generated cover letters land (usually your Downloads folder). OMNI watches this for new files."
            value={paths.cover_letter_template}
            onClick={() => setPath("cover_letter_template", "Cover-letter inbox folder (e.g. Downloads)")}
          />
          <PathRow
            icon={FolderSymlink} label="Cover-letter destination"
            tip="OMNI moves each finished cover letter from the inbox to this folder when applying."
            value={paths.cover_letter_target}
            onClick={() => setPath("cover_letter_target", "Cover-letter destination folder")}
          />
          <PathRow
            icon={FolderOpen} label="Documents to index"
            tip="Optional folder OMNI can read for context (read-only). e.g. portfolio, references."
            value={paths.documents_root}
            onClick={() => setPath("documents_root", "Documents folder to index")}
          />
        </div>
      </Section>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

function ModePill({ mode }: { mode: string }) {
  const cls =
    mode === "detached" ? "text-omni-mute bg-white/5 border-white/10" :
    mode === "managed"  ? "text-omni-warn bg-omni-warn/10 border-omni-warn/30" :
                          "text-omni-ice  bg-omni-ice/10  border-omni-ice/30";
  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {mode}
    </span>
  );
}

function Section({ title, hint, right, children }: {
  title: string; hint?: any; right?: any; children: any;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="heading flex items-center gap-1.5">
          {title}
          {hint && <InfoHint side="right">{hint}</InfoHint>}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, tip, Icon, value, onChange }: {
  label: string; tip: string; Icon: any; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <Tooltip content={tip} side="right">
      <button
        className={`w-full h-8 px-2.5 inline-flex items-center justify-between rounded-md text-xs
                    border transition-all whitespace-nowrap
                    ${value
                      ? "border-omni-ice/40 bg-omni-ice/10 text-omni-ice"
                      : "border-white/10 bg-white/[0.04] text-omni-textDim hover:bg-white/[0.08] hover:text-omni-text"}`}
        onClick={() => onChange(!value)}
      >
        <span className="inline-flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />{label}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full transition-colors
                          ${value ? "bg-omni-ice shadow-ice" : "bg-omni-mute"}`} />
      </button>
    </Tooltip>
  );
}

function PathRow({ icon: Icon, label, tip, value, onClick }: {
  icon: any; label: string; tip: string; value?: string | null; onClick: () => void;
}) {
  return (
    <Tooltip content={tip} side="right">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left group block rounded-md px-1.5 py-1 -mx-1.5
                   hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-omni-mute">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div
          className="font-mono truncate text-[10px] mt-0.5
                     text-omni-textDim/80 group-hover:text-omni-flame transition-colors"
          title={value || "click to set"}
        >
          {value || <span className="italic text-omni-mute">click to set</span>}
        </div>
      </button>
    </Tooltip>
  );
}
