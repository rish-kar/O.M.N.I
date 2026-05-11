# `backend/perception/` — what OMNI sees

OMNI's eyes. Captures the screen, finds active windows, runs the vision-language
model and OCR.

## Files

| File | Responsibility |
| --- | --- |
| `screen.py` | `mss`-based screen capture + Qwen2.5-VL via Ollama. Exposes `describe(img)` (free-text caption) and `propose_action(img, goal)` (returns a structured action proposal). Auto-cleans `data/snapshots/` after each VLM call. |
| `windows.py` | Active window detection on Windows (pygetwindow / pywinauto). Used to figure out *which* Chrome window is foregrounded when there are multiple. |
| `ocr.py` | Tesseract fallback for cases where the VLM is overkill (e.g. reading a single label from a button). |

## When does OMNI take a screenshot?

Only when the **screen-watch** permission toggle is ON, *or* when an action
explicitly needs visual confirmation (a form field with no good DOM label).
Captures go to `data/snapshots/` and are deleted by `cleanup()` as soon as the
VLM has consumed them.

## Privacy

- Screenshots are not stored long-term.
- The VLM runs entirely locally via Ollama — pixels never leave the box.
- `cleanup()` is idempotent and called from a `finally` block in every caller.

## Adding a new perception path

Use the existing helpers:

```python
from backend.perception.screen import capture, describe, cleanup
img = capture(region=None)  # full screen, or pass an mss bbox
caption = await describe(img, prompt="What's on screen?")
cleanup()  # delete the cached file
```
