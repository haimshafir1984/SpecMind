import os
import asyncio
from datetime import datetime, timezone
from functools import lru_cache

try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False


def enabled() -> bool:
    return _SUPABASE_AVAILABLE and bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"))


@lru_cache(maxsize=1)
def _client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


async def _run(fn):
    return await asyncio.to_thread(fn)


def _auto_name(blueprint: dict) -> str:
    entities = blueprint.get("entities") or []
    if entities:
        first = entities[0].get("name", "")
        return first if len(entities) == 1 else f"{first} + {len(entities) - 1} עוד"
    sections = (blueprint.get("spec_document") or {}).get("sections") or []
    for s in sections:
        if s.get("id") == "section_overview" and s.get("content"):
            return s["content"][:40].split("\n")[0]
    return "פרויקט"


# ------------------------------------------------------------------ sessions

async def upsert_session(session_id: str, blueprint: dict, flow_data: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    def _sync():
        _client().table("sessions").upsert({
            "id": session_id,
            "blueprint": blueprint,
            "flow_data": flow_data,
            "updated_at": now,
        }).execute()
    await _run(_sync)


async def fetch_session(session_id: str) -> dict | None:
    def _sync():
        result = _client().table("sessions").select("blueprint,flow_data").eq("id", session_id).maybe_single().execute()
        return result.data
    return await _run(_sync)


async def list_recent_sessions(limit: int = 3) -> list:
    def _sync():
        result = (
            _client().table("sessions")
            .select("id,updated_at,blueprint,flow_data")
            .order("updated_at", desc=True)
            .limit(20)
            .execute()
        )
        rows = result.data or []
        items = []
        for row in rows:
            bp = row.get("blueprint") or {}
            entities = bp.get("entities") or []
            if not entities:
                continue
            items.append({
                "session_id": row["id"],
                "name": _auto_name(bp),
                "entity_count": len(entities),
                "workflow_count": len(bp.get("workflows") or []),
                "updated_at": row.get("updated_at", ""),
            })
            if len(items) >= limit:
                break
        return items
    return await _run(_sync)


# ------------------------------------------------------------------ named blueprints

async def save_named_blueprint(session_id: str, name: str, blueprint: dict, flow_data: dict) -> dict:
    def _sync():
        result = _client().table("blueprints").insert({
            "session_id": session_id,
            "name": name,
            "blueprint_json": blueprint,
            "flow_data": flow_data,
        }).execute()
        return result.data[0] if result.data else {}
    return await _run(_sync)


async def list_named_blueprints() -> list:
    def _sync():
        result = (
            _client().table("blueprints")
            .select("id,name,created_at,blueprint_json->entities,blueprint_json->workflows")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return result.data or []
    return await _run(_sync)


async def fetch_named_blueprint(blueprint_id: str) -> dict | None:
    def _sync():
        result = _client().table("blueprints").select("*").eq("id", blueprint_id).maybe_single().execute()
        return result.data
    return await _run(_sync)
