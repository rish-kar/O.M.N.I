const BASE = (import.meta.env.VITE_OMNI_API as string) || "http://127.0.0.1:8765";
const WS = BASE.replace(/^http/, "ws") + "/ws";

/** Custom error type so the UI can render a clean message and keep the
 *  technical detail for the error console / log. */
export class ApiError extends Error {
  detail: string;
  status: number;
  constructor(message: string, detail: string = "", status: number = 0) {
    super(message);
    this.name = "ApiError";
    this.detail = detail;
    this.status = status;
  }
}

async function jfetch(path: string, init?: RequestInit) {
  let r: Response;
  try {
    r = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
  } catch {
    throw new ApiError(
      "OMNI's local engine isn't responding. Restart the app.",
      `Backend unreachable on ${BASE}.`,
      0,
    );
  }
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch {}
    throw new ApiError(prettyHttpError(r.status, body, path), `${r.status} ${body}`, r.status);
  }
  return r.json();
}

/** Map known backend errors to user-friendly text. */
function prettyHttpError(status: number, body: string, path: string): string {
  // Pull JSON {detail: "..."} if present.
  let detail = body;
  try {
    const j = JSON.parse(body);
    if (j?.detail) detail = String(j.detail);
  } catch {}
  // 503: differentiate voice deps from Ollama unreachable, etc.
  if (status === 503) {
    if (path.includes("/voice/")) return "A required voice package isn't installed. Run install.ps1 to add it.";
    if (path.includes("/chat"))   return detail || "OMNI's local model (Ollama) isn't reachable. Start Ollama and try again.";
    return detail || "A required service isn't available.";
  }
  if (status === 404 && path.includes("/voice/")) return "No voice file installed. Pick a voice in Settings.";
  if (/onnxruntime/i.test(detail)) return "Speech recognition needs the onnxruntime package. Run install.ps1.";
  if (/out of memory|cuda/i.test(detail)) return "Out of GPU memory. Pick a smaller speech model in Settings.";
  if (status >= 500) {
    // Prefer the backend's detail message when it's user-friendly
    if (detail && detail.length < 200 && !/Traceback/i.test(detail)) return detail;
    return "OMNI hit an internal error. See the error console for details.";
  }
  if (status === 409) return "A session is already running. Stop it before starting a new one.";
  if (status === 400) return "Invalid request. " + detail;
  return detail || `Request failed (${status}).`;
}

export const api = {
  health: () => jfetch("/health"),
  status: () => jfetch("/status"),
  models: () => jfetch("/models"),
  patchConfig: (p: any) => jfetch("/config", { method: "PATCH", body: JSON.stringify(p) }),

  startSession: (p: any) =>
    jfetch("/session/start", { method: "POST", body: JSON.stringify(p) }),
  stopSession:  () => jfetch("/session/stop",  { method: "POST" }),
  pauseSession: () => jfetch("/session/pause", { method: "POST" }),
  resumeSession:() => jfetch("/session/resume",{ method: "POST" }),

  attachBrowser: () => jfetch("/browser/attach", { method: "POST" }),
  closeBrowser:  () => jfetch("/browser/close",  { method: "POST" }),
  browserTabs:   () => jfetch("/browser/tabs"),

  chat: (message: string, session_id?: number | null, fast?: boolean, with_screen?: boolean) =>
    jfetch("/chat", { method: "POST", body: JSON.stringify({ message, session_id: session_id ?? null, fast: !!fast, with_screen: !!with_screen }) }),

  chatHistory: (session_id?: number | null, limit = 200) =>
    jfetch(`/chat/history?${session_id != null ? `session_id=${session_id}&` : ""}limit=${limit}`),

  chatSessions: () => jfetch("/chat/sessions"),

  newChatSession: (title?: string) =>
    jfetch("/chat/sessions", { method: "POST", body: JSON.stringify({ title: title ?? null }) }),

  renameChatSession: (id: number, title: string) =>
    jfetch(`/chat/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),

  deleteChatSession: (id: number) =>
    jfetch(`/chat/sessions/${id}`, { method: "DELETE" }),

  permRespond: (id: string, approved: boolean, value?: any, reason = "") =>
    jfetch("/perm/respond", {
      method: "POST",
      body: JSON.stringify({ id, approved, value, reason }),
    }),

  jobs:  (q = "") => jfetch(`/memory/jobs?q=${encodeURIComponent(q)}`),
  audit: (limit = 100) => jfetch(`/memory/audit?limit=${limit}`),

  // Voice
  voices: () => jfetch("/voice/voices"),

  downloadVoice: (voice_id: string) =>
    jfetch("/voice/download", { method: "POST", body: JSON.stringify({ voice_id }) }),

  deleteVoice: (voice_id: string) =>
    jfetch(`/voice/voices/${encodeURIComponent(voice_id)}`, { method: "DELETE" }),

  transcribe: async (wav: Blob, signal?: AbortSignal): Promise<{ text: string }> => {
    const fd = new FormData();
    fd.append("audio", wav, "speech.wav");

    // Hard 60s timeout so a hung backend (e.g. CUDA wedge) doesn't leave the
    // UI stuck on "Transcribing" forever. Combines with any caller-provided signal.
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), 60_000);
    const combined = new AbortController();
    const onCallerAbort = () => combined.abort();
    signal?.addEventListener("abort", onCallerAbort);
    const onTimeoutAbort = () => combined.abort();
    timeoutCtl.signal.addEventListener("abort", onTimeoutAbort);

    let r: Response;
    try {
      r = await fetch(BASE + "/voice/transcribe", { method: "POST", body: fd, signal: combined.signal });
    } catch (e: any) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
      if (e?.name === "AbortError") {
        if (timeoutCtl.signal.aborted) {
          throw new ApiError(
            "Transcription timed out. The speech engine may be stuck — restart OMNI.",
            "60s timeout exceeded",
            0,
          );
        }
        throw new ApiError("Cancelled", "user aborted", 0);
      }
      throw new ApiError(
        "OMNI's local engine isn't responding. Restart the app.",
        `Backend unreachable on ${BASE}.`,
        0,
      );
    }
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new ApiError(prettyHttpError(r.status, body, "/voice/transcribe"), `${r.status} ${body}`, r.status);
    }
    return r.json();
  },

  speakBlob: async (text: string, voice_id?: string, rate?: number): Promise<Blob> => {
    let r: Response;
    try {
      r = await fetch(BASE + "/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id, rate }),
      });
    } catch {
      throw new ApiError(
        "OMNI's local engine isn't responding. Restart the app.",
        `Backend unreachable on ${BASE}.`,
        0,
      );
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new ApiError(prettyHttpError(r.status, body, "/voice/speak"), `${r.status} ${body}`, r.status);
    }
    return r.blob();
  },
};

export type EventMsg = { kind: string; data: any };

export function connectEvents(onMsg: (e: EventMsg) => void): () => void {
  let ws: WebSocket | null = null;
  let alive = true;
  let backoff = 500;

  const open = () => {
    if (!alive) return;
    ws = new WebSocket(WS);
    ws.onmessage = (ev) => {
      try { onMsg(JSON.parse(ev.data)); } catch {}
    };
    ws.onopen  = () => (backoff = 500);
    ws.onclose = () => {
      if (!alive) return;
      backoff = Math.min(backoff * 2, 5000);
      setTimeout(open, backoff);
    };
    ws.onerror = () => ws?.close();
  };

  open();
  return () => { alive = false; ws?.close(); };
}
