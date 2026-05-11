import { useState, useRef, useEffect } from "react";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { Mic, Square as StopIcon, Send, Volume2, VolumeX, Loader2, X, Radio } from "lucide-react";
import { Tooltip, InfoHint } from "./Tooltip";
import ChatHistoryButton from "./ChatHistoryButton";

const SILENCE_THRESHOLD = 0.02;  // RMS below this is silence
const SPEECH_THRESHOLD  = 0.05;  // RMS above this counts as speech
const SILENCE_MS        = 700;   // ms of silence before auto-stop — snappy turn-taking
const SPEAK_TIMEOUT_MS  = 30_000; // hard cap so a stuck TTS never freezes the loop

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export default function ChatPanel() {
  const messages            = useStore((s) => s.messages);
  const pushMessage         = useStore((s) => s.pushMessage);
  const personality         = useStore((s) => (s as any).personality);
  const voiceCfg            = useStore((s) => (s as any).voice);
  const pushToast           = useStore((s) => s.pushToast);
  const pushError           = useStore((s) => s.pushError);
  const currentSessionId    = useStore((s) => s.currentSessionId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const setSessions         = useStore((s) => s.setSessions);

  const [input, setInput]                 = useState("");
  const [busy, setBusy]                   = useState(false);
  const [recording, setRecording]         = useState(false);
  const [transcribing, setTranscribing]   = useState(false);
  const [autoSpeak, setAutoSpeak]         = useState<boolean>(true);
  const [level, setLevel]                 = useState(0);
  const [voiceState, setVoiceState]       = useState<VoiceState>("idle");

  const scroller        = useRef<HTMLDivElement>(null);
  const recorder        = useRef<MediaRecorder | null>(null);
  const chunks          = useRef<Blob[]>([]);
  const stream          = useRef<MediaStream | null>(null);
  const audioCtx        = useRef<AudioContext | null>(null);
  const analyser        = useRef<AnalyserNode | null>(null);
  const rafId           = useRef<number | null>(null);
  const lastSpoken      = useRef<string>("");
  const transcribeAbort = useRef<AbortController | null>(null);
  const currentAudio    = useRef<HTMLAudioElement | null>(null);
  const speakAbort      = useRef<(() => void) | null>(null);

  // Refs to escape stale closures
  const voiceStateRef   = useRef<VoiceState>("idle");
  const cancelledRef    = useRef(false);
  const hasSpeechRef    = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const sessionIdRef    = useRef<number | null>(null);

  // Atomic state+ref updater — avoids the lag of useEffect mirroring
  const setVS = (s: VoiceState) => {
    voiceStateRef.current = s;
    setVoiceState(s);
  };

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  // Mirror the server-side default ONLY when not actively in a live voice session,
  // so toggling Live mode reliably forces auto-speak on regardless of saved prefs.
  useEffect(() => {
    if (voiceStateRef.current === "idle") {
      setAutoSpeak(!!voiceCfg?.auto_speak_replies);
    }
  }, [voiceCfg?.auto_speak_replies]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-speak: play reply and, in voice mode, continue the conversation loop
  useEffect(() => {
    if (!autoSpeak) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const key = `${last.ts}-${last.content.slice(0, 24)}`;
    if (lastSpoken.current === key) return;
    lastSpoken.current = key;

    const inVoiceMode = voiceStateRef.current !== "idle";
    if (inVoiceMode) setVS("speaking");

    speakText(last.content).then(() => {
      // Resume listening if voice mode is still on (covers normal end + interruption)
      if (voiceStateRef.current !== "idle") {
        setVS("listening");
        startRecording();
      }
    });
  }, [messages, autoSpeak]);

  const handleApiError = (e: any, fallback: string, source: string) => {
    if (e instanceof ApiError) {
      pushToast("error", e.message);
      pushError(e.message, e.detail, source);
    } else {
      const msg = e?.message || fallback;
      pushToast("error", msg);
      pushError(msg, String(e), source);
    }
  };

  // Plays TTS; resolves when audio finishes, is interrupted, errors, or hits a
  // hard timeout. In voice mode the loop relies on this ALWAYS resolving so we
  // can resume listening — never let it hang.
  const speakText = async (text: string): Promise<void> => {
    // Cancel anything currently playing first
    speakAbort.current?.();

    let watchdog: ReturnType<typeof setTimeout> | null = null;
    try {
      const blob = await api.speakBlob(text);
      if (!blob || blob.size < 100) {
        // Backend returned an empty/near-empty WAV — treat as a no-op so the
        // live-mode loop still continues.
        pushError("Empty TTS response from backend.", `blob size=${blob?.size ?? 0}`, "voice");
        return;
      }
      const url  = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const a = new Audio(url);
        currentAudio.current = a;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (watchdog) { clearTimeout(watchdog); watchdog = null; }
          if (currentAudio.current === a) currentAudio.current = null;
          if (speakAbort.current === finish) speakAbort.current = null;
          URL.revokeObjectURL(url);
          resolve();
        };
        speakAbort.current = () => {
          try { a.pause(); a.src = ""; } catch {}
          finish();
        };
        a.onended = finish;
        a.onerror = finish;
        // Watchdog: belt-and-suspenders against zero-duration audio or stuck
        // playback. Resolves the promise so the voice loop keeps moving.
        watchdog = setTimeout(finish, SPEAK_TIMEOUT_MS);
        a.play().catch(finish);
      });
    } catch (e: any) {
      // Don't toast in voice mode; just log and let the loop continue.
      pushError(
        e instanceof ApiError ? e.message : "Couldn't play audio",
        e instanceof ApiError ? e.detail  : String(e),
        "voice",
      );
      if (voiceStateRef.current === "idle") {
        // Outside voice mode, surface the toast so the user knows.
        if (e instanceof ApiError) pushToast("error", e.message);
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    pushMessage({ role: "user", content: text, ts: Date.now() });
    if (!overrideText) setInput("");
    setBusy(true);
    if (voiceStateRef.current !== "idle") setVS("thinking");

    try {
      const inVoice = voiceStateRef.current !== "idle";
      const r = await api.chat(text, sessionIdRef.current, inVoice);
      if (r?.session_id && r.session_id !== sessionIdRef.current) {
        sessionIdRef.current = r.session_id;
        setCurrentSessionId(r.session_id);
        try { localStorage.setItem("omni.currentSessionId", String(r.session_id)); } catch {}
      }
      pushMessage({ role: "assistant", content: r.reply, ts: Date.now() });
      // Refresh session list (new session may have been created, or updated_at changed)
      api.chatSessions().then((d) => setSessions(d?.sessions || [])).catch(() => {});
    } catch (e: any) {
      handleApiError(e, "Chat failed.", "chat");
      pushMessage({
        role: "system",
        content: e instanceof ApiError ? e.message : "I couldn't reach the model. Check the error console (bottom-left).",
        ts: Date.now(),
      });
      // Voice mode should keep listening even on chat error
      if (voiceStateRef.current !== "idle") {
        setVS("listening");
        setTimeout(() => startRecording(), 200);
      }
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (recording || transcribing) return;
    if (voiceStateRef.current !== "idle") setVS("listening");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      chunks.current = [];
      cancelledRef.current    = false;
      hasSpeechRef.current    = false;
      silenceStartRef.current = null;

      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/wav"];
      const mime = candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => {
        if (!cancelledRef.current && e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = onRecorderStop;
      rec.start();
      recorder.current = rec;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtx.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const an  = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      analyser.current = an;
      const arr = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        if (!analyser.current) return;
        analyser.current.getByteTimeDomainData(arr);
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = (arr[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.min(1, Math.sqrt(sum / arr.length) * 4);
        setLevel(rms);

        // Silence-based auto-stop in voice mode
        if (voiceStateRef.current !== "idle") {
          if (rms > SPEECH_THRESHOLD) {
            hasSpeechRef.current    = true;
            silenceStartRef.current = null;
          } else if (rms < SILENCE_THRESHOLD && hasSpeechRef.current) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = performance.now();
            } else if (performance.now() - silenceStartRef.current > SILENCE_MS) {
              stopRecording();
              return;
            }
          }
        }

        rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);

      setRecording(true);
    } catch (e: any) {
      pushToast("error", "Microphone access denied.");
      pushError("Microphone access denied.", String(e), "voice");
      if (voiceStateRef.current !== "idle") setVS("idle");
    }
  };

  const stopRecording = () => {
    try { recorder.current?.stop(); } catch {}
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    setLevel(0);
    setRecording(false);
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    chunks.current = [];
    try { recorder.current?.stop(); } catch {}
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    setLevel(0);
    setRecording(false);
  };

  const cancelTranscription = () => {
    transcribeAbort.current?.abort();
    transcribeAbort.current = null;
    chunks.current = [];
    setTranscribing(false);
  };

  const onRecorderStop = async () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try { await audioCtx.current?.close(); } catch {}
    audioCtx.current = null;
    analyser.current = null;

    if (cancelledRef.current) {
      cancelledRef.current = false;
      chunks.current = [];
      return;
    }
    if (chunks.current.length === 0) {
      // No data captured — in voice mode, just resume listening
      if (voiceStateRef.current !== "idle") setTimeout(() => startRecording(), 100);
      return;
    }
    setTranscribing(true);
    const ac = new AbortController();
    transcribeAbort.current = ac;
    try {
      const blob = new Blob(chunks.current, { type: chunks.current[0].type || "audio/webm" });
      chunks.current = [];
      const wav  = await blobToWavMono16k(blob);
      const r    = await api.transcribe(wav, ac.signal);
      const text = (r?.text || "").trim();
      if (text) {
        await send(text);
      } else {
        // In voice mode, silently resume listening on empty transcription
        if (voiceStateRef.current !== "idle") {
          setVS("listening");
          setTimeout(() => startRecording(), 100);
        } else {
          pushToast("warning", "No speech detected.");
        }
      }
    } catch (e: any) {
      if (e instanceof ApiError && e.message === "Cancelled") {
        pushToast("info", "Transcription cancelled.");
      } else {
        handleApiError(e, "Transcription failed.", "voice");
        if (voiceStateRef.current !== "idle") {
          setVS("listening");
          setTimeout(() => startRecording(), 200);
        }
      }
    } finally {
      setTranscribing(false);
      transcribeAbort.current = null;
    }
  };

  // Esc: stop voice mode entirely, or cancel current action
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (voiceStateRef.current !== "idle") {
        endVoiceMode();
        return;
      }
      if (recording) cancelRecording();
      else if (transcribing) cancelTranscription();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, transcribing]);

  const endVoiceMode = () => {
    setVS("idle");
    speakAbort.current?.();
    if (recording) cancelRecording();
    if (transcribing) cancelTranscription();
  };

  const toggleVoiceMode = () => {
    if (voiceStateRef.current === "idle") {
      setVS("listening");
      if (!autoSpeak) setAutoSpeak(true);
      startRecording();
    } else {
      endVoiceMode();
    }
  };

  // Mic button click handler — context-aware
  const onMicClick = () => {
    if (voiceStateRef.current === "speaking") {
      // Interrupt the AI: stop TTS. The auto-speak .then() will restart listening.
      setVS("listening");
      speakAbort.current?.();
      return;
    }
    if (recording) {
      stopRecording(); // commit current audio to transcription
    } else {
      startRecording();
    }
  };

  const omniName = personality?.name || "OMNI";
  const inVoiceMode = voiceState !== "idle";

  return (
    <div className={`panel p-4 grid grid-rows-[auto_1fr_auto] gap-3 h-full min-h-0 transition-all
                     ${inVoiceMode ? "ring-1 ring-omni-flame/30" : ""}`}>
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="heading">Conversation</span>
          <VoiceStatePill state={voiceState} />
          <InfoHint side="bottom">
            Type or click the mic. Toggle <strong>Live</strong> for hands-free voice chat —
            it listens, replies, then listens again. Tap the mic while {omniName} is speaking to interrupt.
            <strong> Chats</strong> lets you switch between past conversations.
          </InfoHint>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <ChatHistoryButton />

          {/* Voice mode toggle */}
          <Tooltip
            side="bottom"
            content={inVoiceMode
              ? "Live voice chat is ON. Click to end. Esc also exits."
              : "Start a live voice conversation — like ChatGPT voice mode."}
          >
            <button
              className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[11px]
                          border transition-all whitespace-nowrap
                          ${inVoiceMode
                            ? "border-omni-flame/50 bg-omni-flame/15 text-omni-flame"
                            : "border-white/10 bg-white/[0.04] text-omni-mute hover:text-omni-text"}`}
              onClick={toggleVoiceMode}
            >
              <Radio className={`h-3 w-3 ${inVoiceMode ? "animate-pulse" : ""}`} />
              {inVoiceMode ? "Live" : "Voice"}
            </button>
          </Tooltip>

          {/* Auto-speak toggle */}
          <Tooltip
            side="bottom"
            content={autoSpeak
              ? "Auto-speak ON. Every reply is read aloud."
              : "Auto-speak OFF. Replies are text only — hover any reply and click the speaker to play it."}
          >
            <button
              className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[11px]
                          border transition-all whitespace-nowrap
                          ${autoSpeak
                            ? "border-omni-ember/35 bg-omni-ember/10 text-omni-flame"
                            : "border-white/10 bg-white/[0.04] text-omni-mute hover:text-omni-text"}`}
              onClick={() => setAutoSpeak((v) => !v)}
            >
              {autoSpeak ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              {autoSpeak ? "Auto-speak" : "Muted"}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ===== Messages ===== */}
      <div ref={scroller} className="overflow-y-auto space-y-2.5 pr-1 -mr-1">
        {messages.length === 0 && <EmptyHint name={omniName} />}
        {messages.map((m, i) => <Message key={i} m={m} onSpeak={speakText} />)}
        {(busy || transcribing) && voiceState === "idle" && (
          <div className="text-[11px] text-omni-mute italic flex items-center gap-2 px-1 py-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{transcribing ? "Transcribing — Esc or click cancel" : `${omniName} is thinking…`}</span>
            {transcribing && (
              <button
                className="ml-2 h-6 px-2 inline-flex items-center gap-1 rounded
                           border border-omni-danger/40 bg-omni-danger/10 text-omni-danger
                           hover:bg-omni-danger/20 text-[10px] transition-all"
                onClick={cancelTranscription}
              >
                <X className="h-3 w-3" />Cancel
              </button>
            )}
          </div>
        )}
        {inVoiceMode && (
          <VoiceModeStatus state={voiceState} hasSpeech={hasSpeechRef.current} name={omniName} />
        )}
      </div>

      {/* ===== Composer ===== */}
      <div className="flex gap-2 items-center">
        <Tooltip
          content={
            voiceState === "speaking" ? "Tap to interrupt and speak."
            : recording                ? "Stop & send. Esc cancels without sending."
            : `Talk to ${omniName}.`
          }
        >
          <button
            className={`relative h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-all
                        ${recording
                          ? "border-transparent text-white shadow-ember"
                          : voiceState === "speaking"
                            ? "border-omni-ember/50 bg-omni-ember/15 text-omni-flame animate-pulse"
                            : inVoiceMode
                              ? "border-omni-flame/40 bg-omni-flame/10 text-omni-flame hover:bg-omni-flame/20"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.10] hover:border-white/20"}`}
            onClick={onMicClick}
            disabled={transcribing || (busy && voiceState !== "speaking")}
            aria-label={recording ? "Stop recording" : "Start recording"}
            style={recording ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
          >
            {recording ? <StopIcon className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
            {recording && (
              <span
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ boxShadow: `0 0 ${10 + level * 30}px rgba(220,38,38,${0.30 + level * 0.55})` }}
              />
            )}
          </button>
        </Tooltip>

        <input
          className="input flex-1"
          placeholder={
            inVoiceMode ? `Live voice chat with ${omniName}…` : `Message ${omniName}…`
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          disabled={busy || recording || transcribing}
        />

        <Tooltip content="Send (Enter)">
          <button
            className="btn-primary btn-icon"
            onClick={() => send()}
            disabled={busy || recording || transcribing || !input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function VoiceStatePill({ state }: { state: VoiceState }) {
  if (state === "idle") return null;
  const label = state === "listening" ? "LISTENING"
              : state === "thinking"  ? "THINKING"
              :                          "SPEAKING";
  const cls   = state === "listening" ? "text-omni-flame border-omni-flame/40 bg-omni-flame/10"
              : state === "thinking"  ? "text-omni-ice border-omni-ice/40 bg-omni-ice/10"
              :                          "text-omni-ember border-omni-ember/40 bg-omni-ember/10";
  return (
    <span className={`text-[9px] font-semibold tracking-widest px-2 py-0.5 rounded-full border ${cls} animate-pulse`}>
      {label}
    </span>
  );
}

function VoiceModeStatus({ state, hasSpeech, name }: { state: VoiceState; hasSpeech: boolean; name: string }) {
  if (state === "idle") return null;
  let icon = null, text = "";
  if (state === "listening") {
    icon = <Radio className="h-3 w-3 animate-pulse" />;
    text = hasSpeech ? "Listening — pause to send" : `Listening — say something to ${name}…`;
  } else if (state === "thinking") {
    icon = <Loader2 className="h-3 w-3 animate-spin" />;
    text = `${name} is thinking…`;
  } else {
    icon = <Volume2 className="h-3 w-3 animate-pulse" />;
    text = `${name} is speaking — tap mic to interrupt`;
  }
  const color = state === "thinking" ? "text-omni-ice" : "text-omni-flame";
  return (
    <div className={`text-[11px] italic flex items-center gap-2 px-1 py-1 ${color}`}>
      {icon}<span>{text}</span>
    </div>
  );
}

function EmptyHint({ name }: { name: string }) {
  return (
    <div className="text-xs text-omni-textDim italic px-1 py-1 leading-relaxed">
      Hi, I'm <span className="not-italic gradient-text font-semibold">{name}</span>.
      Try: <em>"Search Senior Java Backend Engineer in London, avoid Easy Apply."</em>
      <br />
      Click the mic to talk, <span className="text-omni-flame not-italic">Voice</span> for hands-free
      conversation, or <span className="text-omni-flame not-italic">Chats</span> to switch between past conversations.
    </div>
  );
}

function Message({ m, onSpeak }: { m: any; onSpeak: (t: string) => Promise<void> }) {
  if (m.role === "user") {
    return (
      <div className="text-sm rounded-xl px-3.5 py-2.5 ml-8
                      bg-omni-ice/10 border border-omni-ice/25
                      shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
      </div>
    );
  }
  if (m.role === "assistant") {
    return (
      <div className="group relative text-sm rounded-xl px-3.5 py-2.5 mr-8
                      bg-white/[0.04] border border-white/[0.08]
                      shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
        <button
          onClick={() => onSpeak(m.content)}
          title="Play this message"
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-90 hover:opacity-100
                     text-omni-mute hover:text-omni-flame transition-opacity p-1"
        >
          <Volume2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="text-xs rounded-xl px-3.5 py-2 bg-omni-warn/10 border border-omni-warn/30 text-omni-warn">
      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
    </div>
  );
}

/** Recorded Blob (WebM/Opus etc) → 16-bit PCM mono WAV @ 16 kHz. */
async function blobToWavMono16k(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  await decodeCtx.close();

  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  if (decoded.numberOfChannels > 1) {
    const merger = offline.createChannelMerger(1);
    const splitter = offline.createChannelSplitter(decoded.numberOfChannels);
    src.connect(splitter);
    for (let i = 0; i < decoded.numberOfChannels; i++) splitter.connect(merger, i, 0);
    merger.connect(offline.destination);
  } else {
    src.connect(offline.destination);
  }
  src.start();
  const rendered = await offline.startRendering();

  const samples = rendered.getChannelData(0);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Blob([encodeWav(pcm, targetRate)], { type: "audio/wav" });
}

function encodeWav(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) view.setInt16(offset, pcm[i], true);
  return bytes;
}
