# Model selection

Detected at startup by `core.hardware.choose_profile(vram_gb)`.

| VRAM     | text_fast              | text_reason             | text_deep               | vision         |
|----------|------------------------|-------------------------|-------------------------|----------------|
| ≥ 24 GB  | qwen2.5:7b q4_K_M      | qwen2.5:14b q4_K_M      | qwen2.5:32b q4_K_M      | qwen2.5vl:7b   |
| 14–24 GB | qwen2.5:7b q4_K_M      | qwen2.5:14b q4_K_M      | qwen2.5:14b q4_K_M      | qwen2.5vl:7b   |
| 8–14 GB  | qwen2.5:3b q4_K_M      | qwen2.5:7b q4_K_M       | qwen2.5:7b q4_K_M       | qwen2.5vl:3b   |
| < 8 GB   | qwen2.5:1.5b q4_K_M    | qwen2.5:3b q4_K_M       | qwen2.5:3b q4_K_M       | qwen2.5vl:3b   |

Embeddings: `nomic-embed-text` (768-dim, ~270MB).

Voice:
- STT: `faster-whisper base.en` on CUDA fp16 (CPU int8 fallback).
- TTS: Piper `en_US-lessac-medium`. Drop the `.onnx` and `.onnx.json` into `data/voices/`.

## Override

Edit `data/config.json`:

```json
{
  "auto_vram_profile": false,
  "profile": {
    "text_reason": "qwen2.5:32b-instruct-q4_K_M",
    "vision": "qwen2.5vl:32b"
  }
}
```

Restart the backend. The UI will show the active profile in the top-right pills.
