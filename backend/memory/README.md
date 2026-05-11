# `backend/memory/` — local persistence

OMNI never sends your data anywhere. Everything you've seen, asked, or saved
lives in this directory's databases.

## Files

| File | Responsibility |
| --- | --- |
| `schema.sql` | The full SQLite schema: `profile`, `jobs`, `applications`, `answers` (encrypted), `procedures`, `documents`, `audit`, `conversations`, `permissions`. Plus FTS5 virtual tables and update triggers for keyword search over jobs and documents. |
| `store.py` | Higher-level helpers built on top of the schema. `init_db`, `audit`, `upsert_job`, `add_application`, `save_answer` / `find_answer` (Fernet-encrypted), `save_procedure`, `search_jobs`, `recent_messages`, etc. |
| `vector.py` | Thin wrapper over LanceDB (used for semantic JD ↔ resume similarity, document embeddings). |
| `crypto.py` | Fernet-symmetric encryption for "sensitive" answers. Key is auto-generated to `data/.key`; back this up if you care about portability. |

## On-disk layout

```
data/
├── omni.sqlite        SQLite DB (jobs, audit, conversations, encrypted answers)
├── lance/             LanceDB tables for vector search
├── .key               Fernet key used by crypto.py    ← back this up
├── snapshots/         Screenshots taken for the VLM (auto-deleted after use)
├── backups/           Auto-backups before any destructive file edit
└── voices/            Piper .onnx + .onnx.json voices
```

## Why FTS5 + LanceDB

FTS5 is fast and exact (great for keyword job search across `title`, `company`,
`jd_text`). LanceDB stores embeddings for "semantic" queries — finding similar
roles, ranking documents against a JD, etc. Both are zero-config.

## Encrypted answers

`save_answer(question, answer, sensitive=True)` Fernet-encrypts the answer at
rest. `find_answer(question, site)` returns the most recent decrypt for a
question (optionally scoped to a site). The form-fill flow uses this to remember
how you answered "What's your work-authorisation status?" so OMNI doesn't ask
twice.

## Why one SQLite file

A single file is easy to back up, easy to inspect (`sqlitebrowser`), and FTS5
keeps it fast for everything we need. Migrations are idempotent — `init_db()`
is safe to run on every startup.
