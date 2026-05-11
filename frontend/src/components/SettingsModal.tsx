import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Sparkles, Mic2, Volume2, ChevronDown, ChevronRight } from "lucide-react";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { InfoHint } from "./Tooltip";

const TONES = [
  { id: "friendly", label: "Friendly",  desc: "Warm, approachable" },
  { id: "playful",  label: "Playful",   desc: "Witty, jokes, energetic" },
  { id: "concise",  label: "Concise",   desc: "Curt, action-only" },
  { id: "formal",   label: "Formal",    desc: "Precise, professional" },
  { id: "mentor",   label: "Mentor",    desc: "Explanatory, teaches" },
];

// Map non-technical labels to faster-whisper model ids.
const STT_QUALITY = [
  { id: "tiny.en",   label: "Fastest",  desc: "Snappy, less accurate" },
  { id: "base.en",   label: "Balanced", desc: "Good speed, good accuracy (recommended)" },
  { id: "medium.en", label: "Best",     desc: "Most accurate, a bit slower" },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const personality = useStore((s) => (s as any).personality) || {};
  const voice       = useStore((s) => (s as any).voice) || {};
  const setStatus   = useStore((s) => s.setStatus);
  const pushToast   = useStore((s) => s.pushToast);
  const pushError   = useStore((s) => s.pushError);

  const [name, setName]                 = useState(personality.name || "OMNI");
  const [tone, setTone]                 = useState(personality.tone || "friendly");
  const [humor, setHumor]               = useState(personality.humor ?? 4);
  const [verbosity, setVerbosity]       = useState(personality.verbosity ?? 4);
  const [addressAs, setAddressAs]       = useState(personality.address_user_as || "");
  const [extras, setExtras]             = useState(personality.custom_instructions || "");

  const [voiceId, setVoiceId]           = useState(voice.voice_id || "en_US-lessac-medium");
  const [autoSpeak, setAutoSpeak]       = useState(voice.auto_speak_replies ?? true);
  const [pushToTalk, setPushToTalk]     = useState(voice.push_to_talk ?? false);
  const [sttModel, setSttModel]         = useState(voice.stt_model || "base.en");
  const [voices, setVoices] = useState<Array<{ id: string; ready: boolean }>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [busy, setBusy] = useState(false);
  const [tab, setTab]   = useState<"personality" | "voice">("personality");

  useEffect(() => {
    api.voices().then((r: any) => setVoices(r.voices || [])).catch(() => {});
  }, []);

  const installedVoices = voices.filter((v) => v.ready);

  const save = async () => {
    setBusy(true);
    try {
      await api.patchConfig({
        personality: { name, tone, humor, verbosity, address_user_as: addressAs, custom_instructions: extras },
        voice: { voice_id: voiceId, auto_speak_replies: autoSpeak, push_to_talk: pushToTalk, stt_model: sttModel },
      });
      const status = await api.status();
      setStatus(status);
      pushToast("info", "Settings saved");
      onClose();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message || "Save failed");
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "settings");
    } finally {
      setBusy(false);
    }
  };

  const tryVoice = async () => {
    try {
      const sample = `Hi, I'm ${name || "OMNI"}. How does this voice sound?`;
      const blob = await api.speakBlob(sample, voiceId);
      const url  = URL.createObjectURL(blob);
      const a    = new Audio(url);
      a.onended  = () => URL.revokeObjectURL(url);
      a.play();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message || "Preview failed");
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "voice");
    }
  };

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative panel-hi ring-fire w-full max-w-xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold gradient-text">Settings</h2>
            <p className="text-[11px] text-omni-mute mt-0.5">
              Personality and voice. Saved to <code className="font-mono">data/config.json</code>.
            </p>
          </div>
          <button onClick={onClose} className="text-omni-mute hover:text-omni-text p-1 -m-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 mb-5 border-b border-white/[0.08] pb-3">
          <TabBtn active={tab === "personality"} onClick={() => setTab("personality")} icon={Sparkles}>
            Personality
          </TabBtn>
          <TabBtn active={tab === "voice"} onClick={() => setTab("voice")} icon={Mic2}>
            Voice
          </TabBtn>
        </div>

        {tab === "personality" && (
          <div className="space-y-4">
            <Field
              label="Name"
              hint='What OMNI calls itself in conversation. Keep it "OMNI" unless you want to rename your assistant.'
            >
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <Field
              label="Tone"
              hint="Sets how OMNI talks. The system prompt is rebuilt every chat, so changes apply on the next message."
            >
              <div className="grid grid-cols-5 gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    title={t.desc}
                    className={`h-8 inline-flex items-center justify-center text-[11px] rounded-lg border transition-all whitespace-nowrap
                                ${tone === t.id
                                  ? "border-transparent text-white shadow-ember"
                                  : "border-white/10 bg-white/[0.04] text-omni-textDim hover:bg-white/[0.10] hover:text-omni-text"}`}
                    style={tone === t.id ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={`Humor — ${humor}/10`}
              hint="0 = strictly serious. 10 = comedy mode. 4 is a balanced default."
            >
              <input
                type="range" min={0} max={10} value={humor}
                onChange={(e) => setHumor(Number(e.target.value))}
                className="w-full accent-omni-ember"
              />
            </Field>

            <Field
              label={`Verbosity — ${verbosity}/10`}
              hint="0 = one-line answers. 10 = full essays. 4 = short paragraphs."
            >
              <input
                type="range" min={0} max={10} value={verbosity}
                onChange={(e) => setVerbosity(Number(e.target.value))}
                className="w-full accent-omni-ice"
              />
            </Field>

            <Field
              label="Address you as"
              hint="Optional. If filled, OMNI uses your name in chat when natural."
            >
              <input
                className="input"
                placeholder="(optional)"
                value={addressAs}
                onChange={(e) => setAddressAs(e.target.value)}
              />
            </Field>

            <Field
              label="Custom instructions"
              hint="Free-form. Appended to OMNI's system prompt."
            >
              <textarea
                className="input min-h-[80px] py-2"
                placeholder="e.g. always include a salary range when scoring jobs"
                value={extras}
                onChange={(e) => setExtras(e.target.value)}
              />
            </Field>
          </div>
        )}

        {tab === "voice" && (
          <div className="space-y-4">
            <Field
              label="Voice"
              hint="The voice OMNI uses to speak. Drop more Piper voices into data/voices/ to expand this list."
            >
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                >
                  {installedVoices.length === 0 && (
                    <option value="">— No voices installed yet —</option>
                  )}
                  {installedVoices.map((v) => (
                    <option key={v.id} value={v.id}>{prettyVoiceName(v.id)}</option>
                  ))}
                </select>
                <button
                  className="btn"
                  onClick={tryVoice}
                  disabled={installedVoices.length === 0}
                  title="Preview the selected voice"
                >
                  <Volume2 className="h-3.5 w-3.5" />Preview
                </button>
              </div>
              {installedVoices.length === 0 && (
                <p className="text-[11px] text-omni-warn/90 mt-2 leading-relaxed">
                  No voices found. Run <code className="font-mono">install.ps1</code> to download
                  the default voice automatically, or drop a Piper{" "}
                  <code>.onnx</code> + <code>.onnx.json</code> pair into{" "}
                  <code>data/voices/</code>.
                </p>
              )}
            </Field>

            <Field
              label="Auto-speak replies"
              hint="When ON, every reply OMNI sends is read out loud immediately. Turn OFF to keep replies silent — you can still hover any message and click the speaker."
            >
              <PillToggle value={autoSpeak} onChange={setAutoSpeak} on="On — read replies aloud" off="Off — text only" />
            </Field>

            <Field
              label="Mic mode"
              hint="How the mic button behaves. Push-to-talk: hold while speaking. Toggle: click once to start, again to stop."
            >
              <PillToggle value={pushToTalk} onChange={setPushToTalk} on="Push-to-talk (hold)" off="Click to toggle" />
            </Field>

            {/* Advanced collapsible */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-omni-mute hover:text-omni-text"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced
            </button>

            {showAdvanced && (
              <Field
                label="Speech recognition quality"
                hint="Trade-off between speed and accuracy. Balanced works for most people."
              >
                <div className="grid grid-cols-3 gap-1.5">
                  {STT_QUALITY.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setSttModel(q.id)}
                      title={q.desc}
                      className={`h-9 px-2 inline-flex flex-col items-center justify-center rounded-lg border text-[11px]
                                  whitespace-nowrap transition-all
                                  ${sttModel === q.id
                                    ? "border-transparent text-white shadow-ember"
                                    : "border-white/10 bg-white/[0.04] text-omni-textDim hover:bg-white/[0.10] hover:text-omni-text"}`}
                      style={sttModel === q.id ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
                    >
                      <span className="font-medium">{q.label}</span>
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <p className="text-[11px] text-omni-mute leading-relaxed">
              Voice runs entirely offline. STT via{" "}
              <span className="text-omni-ice">faster-whisper</span>; TTS via{" "}
              <span className="text-omni-flame">Piper</span>. No data leaves your machine.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6 border-t border-white/[0.08] pt-4">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function prettyVoiceName(id: string) {
  // Turn "en_US-lessac-medium" into "English (US) · lessac · medium"
  const parts = id.split("-");
  if (parts.length >= 3) {
    const lang = parts[0];
    const speaker = parts[1];
    const quality = parts.slice(2).join("-");
    const langPretty = lang.replace("_", " (").replace(/$/, lang.includes("_") ? ")" : "");
    return `${langPretty} · ${speaker} · ${quality}`;
  }
  return id;
}

function TabBtn({ active, onClick, icon: Icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
                  ${active
                    ? "text-white shadow-ember"
                    : "text-omni-textDim hover:text-omni-text bg-white/[0.04] hover:bg-white/[0.10] border border-white/10"}`}
      style={active ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
    >
      <Icon className="h-3.5 w-3.5" />{children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-omni-textDim mb-1.5 flex items-center gap-1">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </div>
      {children}
    </div>
  );
}

function PillToggle({ value, onChange, on, off }: {
  value: boolean; onChange: (v: boolean) => void; on: string; off: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`h-9 w-full px-3 inline-flex items-center justify-between rounded-lg border text-xs transition-all whitespace-nowrap
                  ${value
                    ? "border-omni-ember/40 bg-omni-ember/10 text-omni-flame"
                    : "border-white/10 bg-white/[0.04] text-omni-text hover:bg-white/[0.10]"}`}
    >
      <span>{value ? on : off}</span>
      <span className={`h-4 w-8 rounded-full relative transition-colors
                        ${value ? "bg-omni-ember" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all
                          ${value ? "left-4" : "left-0.5"}`} />
      </span>
    </button>
  );
}
