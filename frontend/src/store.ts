import { create } from "zustand";
import type { EventMsg } from "./api";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

export type ChatSession = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type PermPrompt = {
  id: string;
  kind: string;
  tier: "read" | "act" | "hard";
  detail: any;
  suggested?: string | null;
};

export type Lead = {
  url: string;
  title: string;
  company: string;
  location: string;
  source: string;
};

export type AuditRow = {
  id: number | string;
  ts: string;
  action: string;
  tier: string;
  detail: any;
  decision: string;
};

export type Toast = {
  id: number;
  level: "info" | "warning" | "error";
  msg: string;
};

export type ErrorLogEntry = {
  id: number;
  ts: number;
  message: string;     // friendly, user-facing
  detail?: string;     // raw / technical
  source?: string;     // e.g. "voice", "browser", "session"
};

export type Layout = "studio" | "focus" | "command";

type Store = {
  state: string;
  ollamaOk: boolean;
  backendOk: boolean;
  browserMode: string;
  models: { profile: any; installed: string[] };
  perms: any;
  paths: any;
  prefs: any;
  browser: any;
  personality: any;
  voice: any;

  layout: Layout;
  setLayout: (l: Layout) => void;

  messages: ChatMessage[];
  pushMessage: (m: ChatMessage) => void;
  setMessages: (m: ChatMessage[]) => void;

  sessions: ChatSession[];
  setSessions: (s: ChatSession[]) => void;
  currentSessionId: number | null;
  setCurrentSessionId: (id: number | null) => void;

  prompts: PermPrompt[];
  clearPrompt: (id: string) => void;

  toasts: Toast[];
  pushToast: (level: Toast["level"], msg: string) => void;
  clearToast: (id: number) => void;

  errorLog: ErrorLogEntry[];
  pushError: (message: string, detail?: string, source?: string) => void;
  clearErrors: () => void;

  leads: Lead[];
  audit: AuditRow[];

  setStatus: (s: any) => void;
  setHealth: (h: any) => void;
  setBackendOk: (v: boolean) => void;
  setModels: (m: any) => void;
  applyEvent: (e: EventMsg) => void;
};

let _toastSeq = 0;
let _errSeq   = 0;

const initialLayout = (() => {
  const v = localStorage.getItem("omni.layout");
  if (v === "studio" || v === "focus" || v === "command") return v;
  return "studio" as Layout;
})();

export const useStore = create<Store>((set) => ({
  state: "IDLE",
  ollamaOk: false,
  backendOk: false,
  browserMode: "detached",
  models: { profile: {}, installed: [] },
  perms: {},
  paths: {},
  prefs: {},
  browser: {},
  personality: { name: "OMNI", tone: "friendly", humor: 4, verbosity: 4 },
  voice: { enabled: true, voice_id: "en_US-lessac-medium", auto_speak_replies: true, push_to_talk: false, stt_model: "base.en" },

  layout: initialLayout,
  setLayout: (l) => {
    localStorage.setItem("omni.layout", l);
    set({ layout: l });
  },

  messages: [],
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setMessages: (m) => set({ messages: m }),

  sessions: [],
  setSessions: (s) => set({ sessions: s }),
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  prompts: [],
  clearPrompt: (id) =>
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) })),

  toasts: [],
  pushToast: (level, msg) =>
    set((s) => ({
      toasts: [...s.toasts, { id: ++_toastSeq, level, msg }].slice(-5),
    })),
  clearToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  errorLog: [],
  pushError: (message, detail, source) =>
    set((s) => ({
      errorLog: [{ id: ++_errSeq, ts: Date.now(), message, detail, source }, ...s.errorLog].slice(0, 50),
    })),
  clearErrors: () => set({ errorLog: [] }),

  leads: [],
  audit: [],

  setStatus: (s) =>
    set({
      backendOk: true,
      state: s.state,
      perms: s.permissions,
      paths: s.paths,
      prefs: s.prefs,
      browser: s.browser,
      browserMode: s.browser_mode || "detached",
      ...(s.personality ? { personality: s.personality } : {}),
      ...(s.voice ? { voice: s.voice } : {}),
    }),
  setHealth: (h) =>
    set({
      backendOk: true,
      ollamaOk: !!h.ollama,
      state: h.state || "IDLE",
      browserMode: h.browser_mode || "detached",
    }),
  setBackendOk: (v) => set({ backendOk: v }),
  setModels: (m) => set({ models: m }),

  applyEvent: (e) => {
    if (e.kind === "state") {
      set({ state: e.data.state });
    } else if (e.kind === "permission_request") {
      set((s) => ({ prompts: [...s.prompts, e.data] }));
    } else if (e.kind === "leads") {
      set({ leads: e.data.items || [] });
    } else if (e.kind === "audit") {
      const row: AuditRow = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toISOString(),
        action: e.data.action || "",
        tier: e.data.tier || "",
        detail: e.data.detail || {},
        decision: typeof e.data.decision === "string" ? e.data.decision : "",
      };
      set((s) => ({ audit: [row, ...s.audit].slice(0, 200) }));
    } else if (e.kind === "warning") {
      set((s) => ({
        toasts: [...s.toasts, { id: ++_toastSeq, level: "warning", msg: e.data.msg }].slice(-5),
      }));
    } else if (e.kind === "info") {
      set((s) => ({
        toasts: [...s.toasts, { id: ++_toastSeq, level: "info", msg: e.data.msg }].slice(-5),
      }));
    } else if (e.kind === "error") {
      const msg = e.data?.msg || "OMNI hit an error.";
      set((s) => ({
        toasts:   [...s.toasts,   { id: ++_toastSeq, level: "error", msg }].slice(-5),
        errorLog: [{ id: ++_errSeq, ts: Date.now(), message: msg, detail: e.data?.detail, source: "agent" }, ...s.errorLog].slice(0, 50),
      }));
    }
  },
}));
