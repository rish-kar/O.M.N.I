import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ChevronLeft, ChevronRight, X, Globe, Shield, MessageSquare,
  Mic, Briefcase,
} from "lucide-react";

type Step = {
  icon: any;
  title: string;
  body: string;
  bullets?: string[];
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome — I'm OMNI.",
    body:
      "Offline Machine Navigation Intelligence. I run entirely on your machine — no cloud, no telemetry. " +
      "I help you find jobs, score listings, tailor resumes, fill applications, and chat about anything else you need.",
    bullets: [
      "Everything you see, I see.",
      "Anything beyond a read-only step asks for your approval first.",
      "Voice in, voice out — if you want it.",
    ],
  },
  {
    icon: Globe,
    title: "Step 1 — Connect Chrome.",
    body:
      "Open the sidebar. Click Connect Chrome. I'll attach to a Chrome you already have open " +
      "(if you ran launch-chrome.ps1) or launch one with the OMNI profile, signing you back in to " +
      "LinkedIn / ChatGPT / Glassdoor with the cookies you've already saved.",
    bullets: [
      "I open new TABS in your existing window — never a fresh window.",
      "Bookmarks, passwords, extensions all come along.",
    ],
  },
  {
    icon: Shield,
    title: "Step 2 — Permissions.",
    body:
      "Toggle Internet on so I can browse. Optional toggles let me watch your screen or learn from corrections. " +
      "Set the paths to your master resume (.docx), tracker (.xlsx), and cover-letter folder by clicking each row.",
    bullets: [
      "Tier-3 actions (final submit, sensitive answers) always ask first.",
      "Resume / tracker writes are always backed up before I touch them.",
    ],
  },
  {
    icon: Briefcase,
    title: "Step 3 — Run a search.",
    body:
      "In the dashboard, type a job query (e.g. \"Senior Java Backend / London\") and press Run. " +
      "I'll search LinkedIn / Glassdoor, extract the JDs, score them, write tailored cover letters, " +
      "and append rows to your tracker.",
    bullets: [
      "Open ~8 ChatGPT tabs first if you want me to score via web ChatGPT (no API).",
      "Permission toasts appear bottom-right for anything sensitive.",
    ],
  },
  {
    icon: MessageSquare,
    title: "Step 4 — Chat or talk to me.",
    body:
      "Right-hand panel. Ask anything — help with a JD, debug a problem, or just chat. " +
      "Click the mic to speak; I'll transcribe locally with faster-whisper and reply in voice via Piper.",
    bullets: [
      "Open Settings (top-right gear) to pick voice, tone, humor, and verbosity.",
      "Replies are saved to local memory so I remember what we talked about.",
    ],
  },
  {
    icon: Mic,
    title: "Tips that pay off.",
    body: "A few things that make OMNI noticeably better:",
    bullets: [
      "Hover any (i) icon for a quick explanation.",
      "Click the help button anytime to replay this tour.",
      "Esc cancels a recording; Enter sends a chat message; Shift+Enter inserts a newline.",
      "All your data lives in /data; back up data/.key for portability.",
    ],
  },
];

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="relative panel-hi ring-fire max-w-lg w-full p-6"
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-omni-mute hover:text-omni-text p-1 -m-1"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-4">
            <div
              className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-white shadow-fire"
              style={{ backgroundImage: "linear-gradient(135deg, #15346e 0%, #ff7a2a 100%)" }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-omni-mute">
                {i + 1} of {STEPS.length}
              </div>
              <h2 className="text-lg font-semibold gradient-text mt-1">{step.title}</h2>
              <p className="text-sm text-omni-textDim mt-2 leading-relaxed">{step.body}</p>
              {step.bullets && (
                <ul className="mt-3 space-y-1.5">
                  {step.bullets.map((b, idx) => (
                    <li key={idx} className="text-xs text-omni-textDim flex items-start gap-2">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundImage: "linear-gradient(135deg, #5ba3f5, #ff7a2a)" }}
                      />
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-6">
            <div className="flex gap-1.5">
              {STEPS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setI(idx)}
                  className={`h-1.5 rounded-full transition-all
                              ${idx === i
                                ? "w-8"
                                : "w-1.5 bg-white/15 hover:bg-white/30"}`}
                  style={idx === i
                    ? { backgroundImage: "linear-gradient(90deg, #5ba3f5, #ff7a2a)" }
                    : undefined}
                  aria-label={`Go to step ${idx + 1}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-sm"
                onClick={() => setI((v) => Math.max(0, v - 1))}
                disabled={i === 0}
              >
                <ChevronLeft className="h-3 w-3" />Back
              </button>
              {last ? (
                <button className="btn-primary btn-sm" onClick={onClose}>
                  Let's go
                </button>
              ) : (
                <button
                  className="btn-primary btn-sm"
                  onClick={() => setI((v) => Math.min(STEPS.length - 1, v + 1))}
                >
                  Next<ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
