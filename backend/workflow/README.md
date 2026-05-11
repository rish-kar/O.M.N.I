# `backend/workflow/` — the job-application state machine

This is the choreography layer. Where `core/orchestrator.py` is the *driver*,
the modules here are the *steps*.

## Files

| File | Responsibility |
| --- | --- |
| `states.py` | `State` enum (`IDLE → PREPARE → SEARCH_JOBS → EXTRACT_JD → ...`) and `TRANSITIONS` table. `can_transition(src, dst)` is used by the orchestrator. |
| `job_search.py` | LinkedIn / Glassdoor / Indeed adapters. Returns `Lead` records. |
| `chatgpt_tabs.py` | The **8-tab orchestrator**. Distributes JDs across pre-opened ChatGPT tabs in your real browser, collects scores + cover letters. No OpenAI API used. |
| `apply.py` | Form-fill flow. Handles known answers from `memory.find_answer`, prompts on unknown ones via the safety gate, *always* asks before final submit. |
| `resume.py` | DOCX-template-based tailoring. Operates on a per-job copy of your master resume — the master is never modified. |

## The full flow

```
IDLE
  └─ session.start()
       └─ PREPARE        (warn on missing paths, attach Chrome)
            └─ SEARCH_JOBS    (LinkedIn / Glassdoor adapters)
                 └─ EXTRACT_JD     (page → JD text + metadata, store in jobs table)
                      └─ SEND_TO_CHATGPT_TAB  (parallel across 8 tabs)
                           └─ UPDATE_TRACKER  (append row to xlsx, with backup)
                                └─ TAILOR_RESUME   (DOCX copy per job)
                                     └─ APPLY_ON_SITE   (form fill, sometimes)
                                          └─ FINAL_REVIEW
                                               └─ SUBMIT_OR_SAVE  ← Tier-3 gate
                                                    └─ MEMORY_UPDATE
                                                         └─ DONE → IDLE
```

`PAUSED` and `ERROR_RECOVERY` can be entered from anywhere. Pause holds at the
next safe checkpoint; the user resumes from the sidebar.

## ChatGPT tabs

OMNI does not call the OpenAI API. Instead, the user pre-opens ~8 ChatGPT
tabs (signed in, each on a Project that contains the master prompt). The
`chatgpt_tabs.run_batch` function:

1. Selects the next free tab
2. Pastes the JD
3. Waits for the streamed reply to settle
4. Parses the structured "Score / Verdict / Salary / Cover letter" output

Tabs are mutexed so two jobs don't collide on the same window.

## Adding a new source

Implement `async def search_<source>(query, location, opts) -> list[Lead]` in a
new file under `workflow/`, then wire it into `job_search.search_all`. Each
adapter should be tier-2 gated for navigation and respect `avoid_easy_apply`.
