"""SQLite-backed structured memory."""
from __future__ import annotations
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from ..core.config import DATA
from ..core.logging import get
from .crypto import encrypt, decrypt

log = get("omni.memory")
DB_PATH = DATA / "omni.sqlite"
SCHEMA = Path(__file__).parent / "schema.sql"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as c:
        c.executescript(SCHEMA.read_text(encoding="utf-8"))
        # Migration: add session_id column to legacy conversations tables
        cols = [r["name"] for r in c.execute("PRAGMA table_info(conversations)").fetchall()]
        if "session_id" not in cols:
            c.execute("ALTER TABLE conversations ADD COLUMN session_id INTEGER")
            log.info("migrated: added conversations.session_id")
        c.commit()
        log.info("memory db ready: %s", DB_PATH)


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    c = _connect()
    try:
        yield c
        c.commit()
    finally:
        c.close()


# ── audit ─────────────────────────────────────────────────────────
def audit(actor: str, action: str, tier: str = "", detail: dict | None = None,
          decision: str = "") -> None:
    with conn() as c:
        c.execute(
            "INSERT INTO audit(actor, action, tier, detail_json, decision) VALUES (?,?,?,?,?)",
            (actor, action, tier, json.dumps(detail or {}), decision),
        )


# ── profile ───────────────────────────────────────────────────────
def get_profile() -> dict:
    with conn() as c:
        row = c.execute("SELECT data_json FROM profile WHERE id=1").fetchone()
        return json.loads(row["data_json"]) if row else {}


def set_profile(data: dict) -> None:
    with conn() as c:
        c.execute(
            "INSERT INTO profile(id, data_json) VALUES (1, ?) "
            "ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=datetime('now')",
            (json.dumps(data),),
        )


# ── jobs / applications ───────────────────────────────────────────
def upsert_job(job: dict) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO jobs(url, title, company, location, source, posted, jd_text, snapshot_path) "
            "VALUES (:url,:title,:company,:location,:source,:posted,:jd_text,:snapshot_path) "
            "ON CONFLICT(url) DO UPDATE SET title=excluded.title, company=excluded.company, "
            "location=excluded.location, jd_text=excluded.jd_text, snapshot_path=excluded.snapshot_path "
            "RETURNING id",
            {**{k: None for k in ("title", "company", "location", "source",
                                   "posted", "jd_text", "snapshot_path")}, **job},
        )
        return cur.fetchone()["id"]


def add_application(job_id: int, **fields: Any) -> int:
    fields.setdefault("answers_json", json.dumps({}))
    cols = ",".join(["job_id", *fields.keys()])
    placeholders = ",".join(["?"] * (1 + len(fields)))
    with conn() as c:
        cur = c.execute(
            f"INSERT INTO applications({cols}) VALUES ({placeholders}) RETURNING id",
            (job_id, *fields.values()),
        )
        return cur.fetchone()["id"]


def update_application(app_id: int, **fields: Any) -> None:
    if not fields:
        return
    sets = ",".join(f"{k}=?" for k in fields)
    with conn() as c:
        c.execute(f"UPDATE applications SET {sets} WHERE id=?", (*fields.values(), app_id))


def search_jobs(q: str, limit: int = 20) -> list[dict]:
    with conn() as c:
        rows = c.execute(
            "SELECT j.* FROM jobs_fts f JOIN jobs j ON j.id=f.rowid "
            "WHERE jobs_fts MATCH ? ORDER BY rank LIMIT ?",
            (q, limit),
        ).fetchall()
        return [dict(r) for r in rows]


# ── answers (encrypted) ───────────────────────────────────────────
def save_answer(question: str, answer: str, site: Optional[str] = None,
                sensitive: bool = False) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO answers(question, answer_enc, sensitive, site) VALUES (?,?,?,?) RETURNING id",
            (question, encrypt(answer.encode()), int(sensitive), site),
        )
        return cur.fetchone()["id"]


def find_answer(question: str, site: Optional[str] = None) -> Optional[str]:
    with conn() as c:
        row = c.execute(
            "SELECT answer_enc FROM answers WHERE question=? AND (site IS NULL OR site=?) "
            "ORDER BY approved_at DESC LIMIT 1",
            (question, site),
        ).fetchone()
        return decrypt(row["answer_enc"]).decode() if row else None


# ── procedures ────────────────────────────────────────────────────
def save_procedure(name: str, site: str, steps: list[dict]) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO procedures(name, site, steps_json) VALUES (?,?,?) RETURNING id",
            (name, site, json.dumps(steps)),
        )
        return cur.fetchone()["id"]


def get_procedure(name: str, site: str) -> Optional[dict]:
    with conn() as c:
        row = c.execute(
            "SELECT * FROM procedures WHERE name=? AND site=? ORDER BY updated_at DESC LIMIT 1",
            (name, site),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["steps"] = json.loads(d.pop("steps_json"))
        return d


# ── documents ─────────────────────────────────────────────────────
def upsert_document(path: str, kind: str, content: str, sha: str) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO documents(path, kind, content, sha256) VALUES (?,?,?,?) "
            "ON CONFLICT(path) DO UPDATE SET kind=excluded.kind, content=excluded.content, "
            "sha256=excluded.sha256, indexed_at=datetime('now') RETURNING id",
            (path, kind, content, sha),
        )
        return cur.fetchone()["id"]


def search_documents(q: str, limit: int = 10) -> list[dict]:
    with conn() as c:
        rows = c.execute(
            "SELECT d.* FROM docs_fts f JOIN documents d ON d.id=f.rowid "
            "WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?",
            (q, limit),
        ).fetchall()
        return [dict(r) for r in rows]


# ── chat sessions ─────────────────────────────────────────────────
def create_session(title: str = "New Chat") -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO chat_sessions(title) VALUES (?) RETURNING id", (title,)
        )
        return cur.fetchone()["id"]


def list_sessions(limit: int = 200) -> list[dict]:
    """Return sessions ordered by most recent activity, with message counts."""
    with conn() as c:
        rows = c.execute(
            """
            SELECT s.id, s.title, s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM conversations WHERE session_id = s.id) AS message_count
            FROM chat_sessions s
            ORDER BY s.updated_at DESC, s.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def update_session_title(session_id: int, title: str) -> None:
    with conn() as c:
        c.execute(
            "UPDATE chat_sessions SET title=?, updated_at=datetime('now') WHERE id=?",
            (title, session_id),
        )


def touch_session(session_id: int) -> None:
    with conn() as c:
        c.execute(
            "UPDATE chat_sessions SET updated_at=datetime('now') WHERE id=?",
            (session_id,),
        )


def delete_session(session_id: int) -> None:
    with conn() as c:
        c.execute("DELETE FROM conversations WHERE session_id=?", (session_id,))
        c.execute("DELETE FROM chat_sessions WHERE id=?", (session_id,))


def session_exists(session_id: int) -> bool:
    with conn() as c:
        row = c.execute(
            "SELECT 1 FROM chat_sessions WHERE id=? LIMIT 1", (session_id,)
        ).fetchone()
        return row is not None


# ── conversations ─────────────────────────────────────────────────
def save_message(role: str, content: str, session_id: int | None = None) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO conversations(role, content, session_id) VALUES (?,?,?) RETURNING id",
            (role, content, session_id),
        )
        if session_id is not None:
            c.execute(
                "UPDATE chat_sessions SET updated_at=datetime('now') WHERE id=?",
                (session_id,),
            )
        return cur.fetchone()["id"]


def messages_for_session(session_id: int, limit: int = 200) -> list[dict]:
    with conn() as c:
        rows = c.execute(
            "SELECT role, content, ts FROM conversations "
            "WHERE session_id=? ORDER BY id ASC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def recent_messages(n: int = 30, session_id: int | None = None) -> list[dict]:
    """Most recent N messages for a specific session (or all if session_id is None)."""
    with conn() as c:
        if session_id is None:
            rows = c.execute(
                "SELECT role, content, ts FROM conversations ORDER BY id DESC LIMIT ?",
                (n,),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT role, content, ts FROM conversations "
                "WHERE session_id=? ORDER BY id DESC LIMIT ?",
                (session_id, n),
            ).fetchall()
        return [dict(r) for r in reversed(rows)]
