"""Central configuration. Loaded from data/config.json + env."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
LOGS = ROOT / "logs"
SNAPSHOTS = DATA / "snapshots"
BACKUPS = DATA / "backups"
DOWNLOADS = DATA / "downloads"
CONFIG_FILE = DATA / "config.json"

for p in (DATA, LOGS, SNAPSHOTS, BACKUPS, DOWNLOADS):
    p.mkdir(parents=True, exist_ok=True)


# Job sites and ChatGPT web pre-trusted to avoid prompting on every nav.
DEFAULT_TRUSTED_SITES = [
    "linkedin.com",
    "glassdoor.com", "glassdoor.co.uk",
    "indeed.com", "uk.indeed.com",
    "workday.com", "myworkdayjobs.com",
    "greenhouse.io", "boards.greenhouse.io",
    "lever.co", "jobs.lever.co",
    "smartrecruiters.com",
    "ashbyhq.com", "jobs.ashbyhq.com",
    "wellfound.com",
    "chatgpt.com", "chat.openai.com",
]


class ModelProfile(BaseModel):
    text_fast: str = "qwen2.5:7b-instruct-q4_K_M"
    text_reason: str = "qwen2.5:14b-instruct-q4_K_M"
    text_deep: str = "qwen2.5:32b-instruct-q4_K_M"
    vision: str = "qwen2.5vl:7b"
    embed: str = "nomic-embed-text"


class Paths(BaseModel):
    resume_master: Optional[str] = None
    # Where ChatGPT-generated cover letters land (typically the user's Downloads folder).
    cover_letter_template: Optional[str] = None
    # Where OMNI moves the cover letter once it's been picked for an application.
    cover_letter_target: Optional[str] = None
    tracker_xlsx: Optional[str] = None
    documents_root: Optional[str] = None
    repos_root: Optional[str] = None


class Permissions(BaseModel):
    internet: bool = False
    screen_watch: bool = False
    learning_mode: bool = False
    allowed_folders: list[str] = Field(default_factory=list)
    denied_folders: list[str] = Field(
        default_factory=lambda: [
            r"C:\Windows", r"C:\Program Files", r"C:\Program Files (x86)",
            r"C:\Users\*\AppData\Roaming\Microsoft\Crypto",
            r"C:\Users\*\.ssh", r"C:\Users\*\.aws", r"C:\Users\*\.gnupg",
        ]
    )
    trusted_sites: list[str] = Field(default_factory=lambda: list(DEFAULT_TRUSTED_SITES))


class Preferences(BaseModel):
    target_titles: list[str] = Field(default_factory=list)
    target_locations: list[str] = Field(default_factory=list)
    avoid_easy_apply: bool = True
    sponsorship_required: bool = True
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None


class Browser(BaseModel):
    cdp_endpoint: Optional[str] = None        # e.g. "http://127.0.0.1:9222"
    launch_managed: bool = True               # launch Playwright Chromium if no CDP
    reuse_existing_tab: bool = True           # open new tab in existing context, not new window
    open_new_tab_on_attach: bool = False      # bring a blank tab to the front on attach


class Personality(BaseModel):
    """Controls how OMNI talks to you. Editable from the UI."""
    name: str = "OMNI"
    tone: str = "friendly"                    # friendly | playful | formal | concise | mentor
    humor: int = 4                            # 0..10 - how often to crack a joke
    verbosity: int = 4                        # 0..10 - 0 = curt, 10 = chatty
    address_user_as: str = ""                 # e.g. "Niraj" - left blank by default
    custom_instructions: str = ""             # free-form extras the user can add

    def system_prompt(self) -> str:
        tone_map = {
            "friendly": "warm, approachable, with a light touch",
            "playful": "playful, witty, and energetic - drop the occasional joke",
            "formal": "precise, professional, no slang",
            "concise": "extremely terse, action-only, no filler",
            "mentor": "thoughtful and explanatory, like a senior engineer mentoring a junior",
        }
        tone_desc = tone_map.get(self.tone, "friendly and helpful")
        humor_desc = (
            "Never joke." if self.humor <= 1
            else "Rarely joke - only when it really fits." if self.humor <= 3
            else "Be witty when natural; tasteful jokes are welcome." if self.humor <= 6
            else "Crack jokes often, keep the energy up - but never at the user's expense."
        )
        verbosity_desc = (
            "Reply in 1-2 sentences max." if self.verbosity <= 2
            else "Be concise - short paragraphs only." if self.verbosity <= 5
            else "You can be conversational and explanatory."
        )
        address = (
            f'Address the user as "{self.address_user_as}" when natural.'
            if self.address_user_as.strip() else ""
        )
        extras = self.custom_instructions.strip()
        return (
            f"You are {self.name}, short for Offline Machine Navigation Intelligence. "
            "You are a privacy-first local desktop AI agent running entirely on the user's "
            "Windows machine - no cloud, no telemetry. Your job is to help the user search "
            "for jobs, evaluate listings, tailor resumes and cover letters, fill applications, "
            "and answer questions about anything they ask. "
            "You can see the screen, control Chrome, type into forms, manage files, and "
            "speak/listen via offline STT (faster-whisper) + TTS (Piper). "
            f"Personality: {tone_desc}. {humor_desc} {verbosity_desc} {address} "
            "When the user asks what you are, identify yourself as OMNI. "
            "Never claim to be ChatGPT, Claude, or any other model. "
            "If you must perform a destructive or sensitive action, mention that the safety "
            "gate will ask the user for approval first. "
            + (f"\nAdditional user instructions: {extras}" if extras else "")
        ).strip()


class Voice(BaseModel):
    """Voice mode settings. Both STT and TTS run fully offline."""
    enabled: bool = True
    auto_speak_replies: bool = True            # auto-TTS the assistant's replies in voice mode
    voice_id: str = "en_US-lessac-medium"      # Piper voice basename (no extension)
    rate: float = 1.15                         # speech rate (1.0 = normal, >1 = faster)
    stt_model: str = "tiny.en"                 # faster-whisper model — default to fastest
    language: str = "en"
    push_to_talk: bool = False                 # when False, the UI uses VAD/click-to-toggle
    # Extra system instructions layered on top of the personality whenever the
    # user is talking to OMNI via voice. Defaults to a brevity/no-markdown rule
    # so the TTS doesn't read out bullets, code blocks, and emojis.
    instructions: str = (
        "You're talking, not typing. Reply in 1-2 short sentences. "
        "Plain conversational text only — no markdown, no emojis, no bullet "
        "lists, no headings, no code blocks. Skip preambles and just answer."
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OMNI_", env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8765
    log_level: str = "INFO"

    ollama_host: str = "http://127.0.0.1:11434"
    auto_vram_profile: bool = True
    profile: ModelProfile = ModelProfile()
    paths: Paths = Paths()
    perms: Permissions = Permissions()
    prefs: Preferences = Preferences()
    browser: Browser = Browser()
    personality: Personality = Personality()
    voice: Voice = Voice()

    @classmethod
    def load(cls) -> "Settings":
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                return cls(**data)
            except Exception:
                pass
        s = cls()
        s.save()
        return s

    def save(self) -> None:
        CONFIG_FILE.write_text(
            json.dumps(self.model_dump(), indent=2, default=str), encoding="utf-8"
        )


settings = Settings.load()
