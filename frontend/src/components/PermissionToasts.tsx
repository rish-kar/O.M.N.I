import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { ShieldAlert, ShieldCheck, X, Info, AlertTriangle, AlertOctagon } from "lucide-react";

const TIER_BORDER: Record<string, string> = {
  read: "border-l-omni-mute",
  act:  "border-l-omni-warn",
  hard: "border-l-omni-danger",
};

const TIER_TEXT: Record<string, string> = {
  read: "text-omni-mute",
  act:  "text-omni-warn",
  hard: "text-omni-danger",
};

export default function PermissionToasts() {
  const prompts     = useStore((s) => s.prompts);
  const toasts      = useStore((s) => s.toasts);
  const clearPrompt = useStore((s) => s.clearPrompt);
  const clearToast  = useStore((s) => s.clearToast);

  return (
    <div className="fixed bottom-4 right-4 w-[22rem] space-y-2 z-50 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastBar key={t.id} t={t} onClose={() => clearToast(t.id)} />
        ))}
        {prompts.map((p) => (
          <PromptCard key={p.id} p={p} onDismiss={() => clearPrompt(p.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastBar({ t, onClose }: { t: { id: number; level: string; msg: string }; onClose: () => void }) {
  const Icon = t.level === "error" ? AlertOctagon : t.level === "warning" ? AlertTriangle : Info;
  const color =
    t.level === "error"   ? "border-omni-danger/40 text-omni-danger"
    : t.level === "warning" ? "border-omni-warn/40 text-omni-warn"
    : "border-omni-ice/35 text-omni-ice";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className={`panel py-2 px-3 pointer-events-auto flex items-center gap-2 text-xs ${color}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <div className="flex-1 truncate" title={t.msg}>{t.msg}</div>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 p-0.5" aria-label="Dismiss">
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

function PromptCard({ p, onDismiss }: { p: any; onDismiss: () => void }) {
  const [val, setVal]   = useState<string>(p.suggested || "");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const tierBorder = TIER_BORDER[p.tier] || "border-l-white/10";
  const tierText   = TIER_TEXT[p.tier]   || "";
  const needsValue = p.kind === "form.unknown_answer";

  const respond = async (approved: boolean) => {
    setBusy(true);
    try {
      await api.permRespond(p.id, approved, needsValue ? { value: val, save } : undefined);
      onDismiss();
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      className={`panel py-3 px-3.5 border-l-2 ${tierBorder} pointer-events-auto`}
    >
      <div className="flex items-start gap-2">
        {p.tier === "hard"
          ? <ShieldAlert className={`h-4 w-4 mt-0.5 ${tierText}`} />
          : <ShieldCheck className={`h-4 w-4 mt-0.5 ${tierText}`} />}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-omni-mute">
            {p.tier} · {p.kind}
          </div>
          <div className="text-sm mt-1 break-words leading-snug">
            {needsValue ? p.detail.question : prettyDetail(p.kind, p.detail)}
          </div>
          {needsValue && (
            <>
              <input
                className="input mt-2"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="Your answer"
                autoFocus
              />
              <label className="text-[11px] text-omni-mute flex items-center gap-1.5 mt-2">
                <input
                  type="checkbox"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  className="accent-omni-ice"
                />
                Remember for future applications
              </label>
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-omni-mute hover:text-omni-text p-0.5"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-2 justify-end mt-3">
        <button className="btn btn-sm" onClick={() => respond(false)} disabled={busy}>
          Skip
        </button>
        <button className="btn-primary btn-sm" onClick={() => respond(true)} disabled={busy}>
          {busy ? "..." : "Approve"}
        </button>
      </div>
    </motion.div>
  );
}

function prettyDetail(kind: string, d: any): string {
  if (!d) return "";
  if (kind.startsWith("browser.")) return d.url || "";
  if (kind === "file.write") return d.dst || d.path || d.src || "";
  if (kind === "file.read")  return d.path || "";
  if (kind === "form.submit") return `Submit application to ${d.company || "site"}?`;
  if (kind === "input.click") return `Click at (${d.x},${d.y}) ${d.why || ""}`.trim();
  if (kind === "input.type")  return `Type ${d.len} chars: "${(d.preview || "").slice(0, 40)}…"`;
  if (kind === "chatgpt.send") return `Send prompt to ${d.url || "ChatGPT tab"}`;
  return JSON.stringify(d).slice(0, 200);
}
