"""Local symmetric encryption for sensitive answers. Key kept in data/.key (chmod 600 by user)."""
from __future__ import annotations
import os
from pathlib import Path
from cryptography.fernet import Fernet
from ..core.config import DATA

KEY_FILE = DATA / ".key"


def _key() -> bytes:
    if KEY_FILE.exists():
        return KEY_FILE.read_bytes()
    k = Fernet.generate_key()
    KEY_FILE.write_bytes(k)
    try:
        os.chmod(KEY_FILE, 0o600)
    except Exception:
        pass
    return k


_fernet = Fernet(_key())


def encrypt(b: bytes) -> bytes:
    return _fernet.encrypt(b)


def decrypt(b: bytes) -> bytes:
    return _fernet.decrypt(b)
