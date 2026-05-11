"""LanceDB vector index — one table per kind."""
from __future__ import annotations
from pathlib import Path
from typing import Optional

import lancedb
import pyarrow as pa

from ..core.config import DATA
from ..core.llm import llm
from ..core.logging import get

log = get("omni.vector")
LANCE_DIR = DATA / "lance"
LANCE_DIR.mkdir(parents=True, exist_ok=True)

_db: Optional[lancedb.DBConnection] = None


def db() -> lancedb.DBConnection:
    global _db
    if _db is None:
        _db = lancedb.connect(str(LANCE_DIR))
    return _db


_DIM = 768  # nomic-embed-text


def _schema() -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("kind", pa.string()),
        pa.field("text", pa.string()),
        pa.field("meta", pa.string()),     # json blob
        pa.field("vector", pa.list_(pa.float32(), _DIM)),
    ])


async def upsert(table: str, id_: str, kind: str, text: str, meta: dict | None = None) -> None:
    import json as _json
    vecs = await llm.embed(text)
    if not vecs:
        return
    rec = {"id": id_, "kind": kind, "text": text,
           "meta": _json.dumps(meta or {}), "vector": vecs[0]}
    t = db().open_table(table) if table in db().table_names() else db().create_table(
        table, schema=_schema()
    )
    t.delete(f"id = '{id_}'")
    t.add([rec])


async def search(table: str, query: str, k: int = 5,
                 kind: Optional[str] = None) -> list[dict]:
    import json as _json
    if table not in db().table_names():
        return []
    vecs = await llm.embed(query)
    if not vecs:
        return []
    t = db().open_table(table)
    q = t.search(vecs[0]).limit(k)
    if kind:
        q = q.where(f"kind = '{kind}'")
    rows = q.to_list()
    for r in rows:
        try:
            r["meta"] = _json.loads(r.get("meta") or "{}")
        except Exception:
            r["meta"] = {}
    return rows
