-- OMNI memory schema. Single SQLite DB; FTS5 for keyword search; LanceDB for vectors.
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    company TEXT,
    location TEXT,
    source TEXT,
    posted TEXT,
    jd_text TEXT,
    snapshot_path TEXT,
    found_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    score REAL,
    verdict TEXT,
    cover_letter_path TEXT,
    resume_path TEXT,
    status TEXT,
    answers_json TEXT,
    notes TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer_enc BLOB NOT NULL,
    sensitive INTEGER NOT NULL DEFAULT 0,
    site TEXT,
    approved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    site TEXT,
    steps_json TEXT NOT NULL,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    kind TEXT,
    content TEXT,
    sha256 TEXT,
    indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    tier TEXT,
    detail_json TEXT,
    decision TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    target TEXT NOT NULL,
    granted INTEGER NOT NULL DEFAULT 0,
    granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(scope, target)
);

-- FTS5 indexes
CREATE VIRTUAL TABLE IF NOT EXISTS jobs_fts USING fts5(
    title, company, jd_text, content='jobs', content_rowid='id'
);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
    path, content, content='documents', content_rowid='id'
);

-- Keep FTS tables in sync with the base tables, including UPDATE (used by upsert).
CREATE TRIGGER IF NOT EXISTS jobs_ai AFTER INSERT ON jobs BEGIN
    INSERT INTO jobs_fts(rowid, title, company, jd_text)
    VALUES (new.id, new.title, new.company, new.jd_text);
END;
CREATE TRIGGER IF NOT EXISTS jobs_ad AFTER DELETE ON jobs BEGIN
    INSERT INTO jobs_fts(jobs_fts, rowid, title, company, jd_text)
    VALUES ('delete', old.id, old.title, old.company, old.jd_text);
END;
CREATE TRIGGER IF NOT EXISTS jobs_au AFTER UPDATE ON jobs BEGIN
    INSERT INTO jobs_fts(jobs_fts, rowid, title, company, jd_text)
    VALUES ('delete', old.id, old.title, old.company, old.jd_text);
    INSERT INTO jobs_fts(rowid, title, company, jd_text)
    VALUES (new.id, new.title, new.company, new.jd_text);
END;

CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN
    INSERT INTO docs_fts(rowid, path, content) VALUES (new.id, new.path, new.content);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN
    INSERT INTO docs_fts(docs_fts, rowid, path, content) VALUES ('delete', old.id, old.path, old.content);
END;
CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN
    INSERT INTO docs_fts(docs_fts, rowid, path, content) VALUES ('delete', old.id, old.path, old.content);
    INSERT INTO docs_fts(rowid, path, content) VALUES (new.id, new.path, new.content);
END;
