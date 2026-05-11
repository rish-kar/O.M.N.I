import { useState } from "react";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { Search, Briefcase, Activity, Play, Loader2, MapPin } from "lucide-react";
import { Tooltip, InfoHint } from "./Tooltip";

const STATE_LABEL: Record<string, string> = {
  IDLE: "Run",
  DONE: "Run again",
  PREPARE: "Preparing",
  SEARCH_JOBS: "Searching",
  EXTRACT_JD: "Reading JDs",
  SEND_TO_CHATGPT_TAB: "Scoring",
  UPDATE_TRACKER: "Tracking",
  TAILOR_RESUME: "Tailoring",
  APPLY_ON_SITE: "Applying",
  FINAL_REVIEW: "Reviewing",
  SUBMIT_OR_SAVE: "Submitting",
  MEMORY_UPDATE: "Saving",
  ERROR_RECOVERY: "Recovering",
  PAUSED: "Paused",
};

const ACTIVITY_LABEL: Record<string, string> = {
  "browser.navigate":       "Opened a page",
  "browser.attach":         "Attached to Chrome",
  "browser.close":          "Detached from Chrome",
  "input.click":            "Clicked",
  "input.type":             "Typed",
  "form.submit":            "Submitted a form",
  "form.unknown_answer":    "Asked you for an answer",
  "file.read":              "Read a file",
  "file.write":             "Wrote a file",
  "chatgpt.send":           "Sent a prompt to ChatGPT",
  "session.start":          "Started a session",
  "session.stop":           "Stopped a session",
};

export default function Dashboard() {
  const jobs      = useStore((s) => s.leads);     // backend still publishes "leads" — surface as "Jobs"
  const audit     = useStore((s) => s.audit);
  const state     = useStore((s) => s.state);
  const pushToast = useStore((s) => s.pushToast);
  const pushError = useStore((s) => s.pushError);

  const [query,    setQuery]    = useState("Senior Java Backend Engineer");
  const [location, setLocation] = useState("London");
  const [running,  setRunning]  = useState(false);

  const idle = state === "IDLE" || state === "DONE";

  const start = async () => {
    if (!query.trim() || !location.trim()) {
      pushToast("warning", "Please fill query and location");
      return;
    }
    setRunning(true);
    try {
      await api.startSession({
        query: query.trim(),
        location: location.trim(),
        sources: ["linkedin", "glassdoor"],
        batch_size: 8,
        avoid_easy_apply: true,
      });
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : String(e);
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "session");
    } finally {
      setRunning(false);
    }
  };

  const runLabel = running ? "Starting" : (STATE_LABEL[state] || "Run");

  return (
    <div className="grid grid-rows-[auto_1fr_auto] gap-4 h-full min-h-0">
      {/* ===== Task input ===== */}
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-3.5 w-3.5 text-omni-ice" />
          <span className="heading">Task</span>
          <InfoHint>
            Tell OMNI what to find. It searches LinkedIn + Glassdoor, extracts each job
            description, and stores the matches below. Cover letters are picked up from
            the inbox folder you configured (where ChatGPT saves them) and moved to your
            destination folder when applying. OMNI asks before submitting anything.
          </InfoHint>
        </div>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-omni-mute pointer-events-none" />
            <input
              className="input pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Job title or keywords"
              disabled={!idle}
              onKeyDown={(e) => e.key === "Enter" && idle && start()}
            />
          </div>
          <div className="col-span-3 relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-omni-mute pointer-events-none" />
            <input
              className="input pl-9"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              disabled={!idle}
              onKeyDown={(e) => e.key === "Enter" && idle && start()}
            />
          </div>
          <Tooltip content="Start the search. The state pill in the header tracks progress.">
            <button
              className="btn-primary col-span-3 w-full"
              onClick={start}
              disabled={running || !idle}
            >
              {idle && !running
                ? <Play className="h-3.5 w-3.5" />
                : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{runLabel}</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ===== Jobs found ===== */}
      <div className="panel p-4 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="h-3.5 w-3.5 text-omni-flame" />
          <span className="heading">Jobs found</span>
          <span className="chip">{jobs.length}</span>
          <InfoHint>
            Live list of jobs OMNI found from the search. Click any card to open it in your
            connected Chrome.
          </InfoHint>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 -mr-1">
          {jobs.length === 0 ? (
            <EmptyHint />
          ) : jobs.map((j, i) => (
            <a
              key={i}
              href={j.url}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03]
                         hover:border-omni-ember/35 hover:bg-omni-ember/[0.06] transition-all"
            >
              <div className="text-sm font-medium leading-tight">{j.title}</div>
              <div className="text-[11px] text-omni-mute mt-1 flex items-center gap-1.5">
                <span>{j.company}</span>
                {j.location && <><span>·</span><span>{j.location}</span></>}
                <span className="ml-auto text-omni-flame text-[10px] uppercase tracking-wider">
                  {j.source}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ===== Activity ===== */}
      <div className="panel p-4 max-h-48 flex flex-col">
        <div className="flex items-center gap-2 mb-2.5">
          <Activity className="h-3.5 w-3.5 text-omni-ice" />
          <span className="heading">Activity</span>
          <InfoHint>
            What OMNI is doing right now. Each line is a step it took (or asked your
            permission for). The full history is in <code>data/omni.sqlite</code>.
          </InfoHint>
        </div>
        <div className="flex-1 overflow-y-auto text-[11px] space-y-0.5 pr-1 -mr-1">
          {audit.length === 0 && (
            <div className="text-omni-mute italic">Nothing yet — start a task above.</div>
          )}
          {audit.slice(0, 30).map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <span className="text-omni-mute font-mono text-[10px] w-14 shrink-0">
                {r.ts.slice(11, 19)}
              </span>
              <span className="flex-1 text-omni-textDim truncate">
                {ACTIVITY_LABEL[r.action] || r.action}
              </span>
              <DecisionDot decision={r.decision} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="text-xs text-omni-mute italic px-1 py-2 leading-relaxed">
      No jobs yet. Setup order:
      <ol className="list-decimal list-inside mt-1.5 space-y-0.5 not-italic">
        <li>Connect Chrome (sidebar)</li>
        <li>Toggle <span className="text-omni-ice">Internet</span> on</li>
        <li>Set your master resume + tracker paths</li>
        <li>Type a role + location and press Run</li>
      </ol>
    </div>
  );
}

function DecisionDot({ decision }: { decision: string }) {
  const map: Record<string, { color: string; label: string }> = {
    approved: { color: "bg-omni-ok",     label: "approved" },
    denied:   { color: "bg-omni-danger", label: "denied"   },
    timeout:  { color: "bg-omni-danger", label: "timeout"  },
    auto:     { color: "bg-omni-mute",   label: "auto"     },
  };
  const v = map[decision] || { color: "bg-white/20", label: decision || "pending" };
  return (
    <span
      title={v.label}
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${v.color}`}
      aria-label={v.label}
    />
  );
}
