"""Smoke tests - runnable without Ollama or the UI."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def test_imports():
    """All non-voice modules must import cleanly."""
    from backend.core import config, safety, llm, orchestrator, events, hardware  # noqa: F401
    from backend.core import logging as _logging  # noqa: F401
    from backend.memory import store, vector, crypto  # noqa: F401
    from backend.workflow import states, chatgpt_tabs, job_search, apply, resume  # noqa: F401
    from backend.action import input as _input, browser, files  # noqa: F401
    from backend.perception import screen, windows, ocr  # noqa: F401
    # Voice modules: top-level import must succeed even if optional deps missing.
    from backend.voice import stt, tts  # noqa: F401


def test_state_machine():
    from backend.workflow.states import State, can_transition
    assert can_transition(State.IDLE, State.PREPARE)
    assert not can_transition(State.IDLE, State.SUBMIT_OR_SAVE)


def test_memory_init(tmp_path, monkeypatch):
    from backend.core import config as cfg
    monkeypatch.setattr(cfg, "DATA", tmp_path)
    from backend.memory import store
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "t.sqlite")
    store.init_db()
    store.set_profile({"name": "Test"})
    assert store.get_profile()["name"] == "Test"


def test_chatgpt_parse():
    from backend.workflow.chatgpt_tabs import parse
    raw = "Score: 8/10\nVerdict: apply\nSalary: GBP 80k-100k\nMissing: Kafka, gRPC"
    r = parse(raw)
    assert r.score == 8.0
    assert r.verdict == "apply"
    assert any("kafka" in w.lower() for w in r.missing_keywords)


def test_safety_folder_rules(tmp_path):
    from backend.core import safety, config
    config.settings.perms.allowed_folders = [str(tmp_path)]
    config.settings.perms.denied_folders = []
    assert safety.gate.folder_allowed(str(tmp_path / "x"))
    assert not safety.gate.folder_allowed(r"C:\Windows\System32")


def test_safety_domain_trust():
    from backend.core import safety, config
    config.settings.perms.trusted_sites = ["linkedin.com", "chatgpt.com"]
    assert safety.gate.domain_trusted("https://www.linkedin.com/jobs/search")
    assert safety.gate.domain_trusted("https://chatgpt.com/c/abc")
    assert not safety.gate.domain_trusted("https://example.com/foo")
