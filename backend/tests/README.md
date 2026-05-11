# `backend/tests/` — smoke tests

Lightweight tests that prove the wiring isn't broken. Not a full unit-test
suite — that's the wrong fit for an agent that's mostly I/O.

## Files

| File | Responsibility |
| --- | --- |
| `test_smoke.py` | Imports every public module, instantiates the FastAPI app, and pings the local fixtures. Catches the obvious "the build is broken" case. |

## Run

```powershell
..\..\.venv\Scripts\python.exe -m pytest backend/tests -q
```

## What's *not* tested here

- Anything that requires a live Ollama or Chrome. Those are integration tests
  and live in your manual run.
- The vision model (it's expensive to load).
- Network adapters (LinkedIn / Glassdoor) — they break when the sites change,
  not when the code changes.
