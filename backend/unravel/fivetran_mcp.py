"""Deep Fivetran MCP inside the reasoning loop.

The Fivetran track's stand-out lever is using the partner MCP server for more than
a one-shot pull: weaving freshness checks and targeted re-syncs into the agent
loop. Before the Adjudicator rules on a reclassification, the loop asks the
Fivetran MCP server how fresh each evidence feed is (get_connection_details); if a
feed is stale it can trigger a targeted re-sync (sync_connection) and the
Adjudicator's verdict then accounts for data freshness explicitly.

This wraps the official server (github.com/fivetran/fivetran-mcp) over stdio,
honouring its read-the-schema-first guardrail (each tool needs a confirming
schema_file path, parsed from its own description). Reads are always allowed;
writes (sync_connection) are gated behind FIVETRAN_ALLOW_WRITES, set only when the
loop explicitly asks for a re-sync. Credentials are read from Secret Manager at
runtime.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

PROJECT = "unravel-ra"
# evidence feeds we care about, keyed by the BigQuery schema the connector writes.
EVIDENCE_SCHEMAS = ("clinvar", "gnomad", "alphamissense")
_SCHEMA_PATH = re.compile(r"(open-api-definitions/[^'\"]+\.json)")


def _secret(name: str) -> str:
    # On Cloud Run the secrets are mounted as env vars via --set-secrets
    # (FIVETRAN_API_KEY / FIVETRAN_API_SECRET); locally we fall back to gcloud.
    env_val = os.environ.get(name.upper().replace("-", "_"))
    if env_val:
        return env_val
    out = subprocess.run(
        ["gcloud", "secrets", "versions", "access", "latest",
         f"--secret={name}", f"--project={PROJECT}"],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def _uvx() -> str:
    """Locate uvx, including when it lives in the active venv's bin dir."""
    found = shutil.which("uvx")
    if found:
        return found
    candidate = Path(sys.executable).parent / "uvx"
    if candidate.exists():
        return str(candidate)
    return "uvx"  # last resort; will error clearly if truly absent


@asynccontextmanager
async def mcp_session(*, allow_writes: bool = False):
    """Spawn the Fivetran MCP server and yield an initialized ClientSession."""
    uvx = _uvx()
    path = os.environ.get("PATH", "")
    venv_bin = str(Path(sys.executable).parent)
    if venv_bin not in path:
        path = f"{venv_bin}:{path}"
    env = {
        "FIVETRAN_API_KEY": _secret("fivetran-api-key"),
        "FIVETRAN_API_SECRET": _secret("fivetran-api-secret"),
        "PATH": path,
    }
    if allow_writes:
        env["FIVETRAN_ALLOW_WRITES"] = "true"
    server = StdioServerParameters(
        command=uvx,
        args=["--from", "git+https://github.com/fivetran/fivetran-mcp", "fivetran-mcp"],
        env=env,
    )
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield _Mcp(session)


class _Mcp:
    """Thin helper that fills in each tool's required schema_file automatically."""

    def __init__(self, session: ClientSession):
        self.session = session
        self._tools: dict = {}

    async def _tool_map(self) -> dict:
        if not self._tools:
            self._tools = {t.name: t for t in (await self.session.list_tools()).tools}
        return self._tools

    async def call(self, name: str, **args):
        tools = await self._tool_map()
        prop = (tools[name].inputSchema or {}).get("properties", {}).get("schema_file", {})
        m = _SCHEMA_PATH.search(prop.get("description", ""))
        if m:
            args["schema_file"] = m.group(1)
        res = await self.session.call_tool(name, args)
        if not res.content:
            return None
        try:
            return json.loads(res.content[0].text)
        except Exception:
            return res.content[0].text


@dataclass
class FeedFreshness:
    schema: str
    connection_id: str
    service: str
    sync_state: str | None
    succeeded_at: str | None
    hours_old: float | None

    @property
    def is_stale(self) -> bool:
        return self.hours_old is None or self.hours_old > 24.0


def _hours_since(ts: str | None) -> float | None:
    if not ts:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(ts, fmt).replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
        except ValueError:
            continue
    return None


async def _list_evidence_connections(mcp: _Mcp) -> list[dict]:
    res = await mcp.call("list_connections")
    items = (res or {}).get("data", {}).get("items", [])
    out = []
    for c in items:
        schema = str(c.get("schema", "")).split(".")[0]
        if schema in EVIDENCE_SCHEMAS:
            out.append(c)
    return out


async def check_freshness_async() -> list[FeedFreshness]:
    """Freshness of each evidence feed, via the MCP server (read-only)."""
    async with mcp_session() as mcp:
        conns = await _list_evidence_connections(mcp)
        feeds = []
        for c in conns:
            det = await mcp.call("get_connection_details", connection_id=c["id"])
            data = (det or {}).get("data", det) if isinstance(det, dict) else {}
            succeeded = data.get("succeeded_at")
            feeds.append(FeedFreshness(
                schema=str(c.get("schema", "")).split(".")[0],
                connection_id=c["id"],
                service=c.get("service", ""),
                sync_state=(data.get("status") or {}).get("sync_state"),
                succeeded_at=succeeded,
                hours_old=_hours_since(succeeded),
            ))
        return feeds


async def trigger_resync_async(connection_id: str, *, force: bool = True) -> dict:
    """Trigger a targeted re-sync of one connector (writes enabled)."""
    async with mcp_session(allow_writes=True) as mcp:
        res = await mcp.call(
            "sync_connection",
            connection_id=connection_id,
            request_body=json.dumps({"force": force}),
        )
        return res if isinstance(res, dict) else {"code": "Error", "message": str(res)}


def check_freshness() -> list[FeedFreshness]:
    return asyncio.run(check_freshness_async())


def trigger_resync(connection_id: str) -> dict:
    return asyncio.run(trigger_resync_async(connection_id))


def freshness_report(feeds: list[FeedFreshness] | None = None) -> str:
    """Human-readable freshness line for the Adjudicator's grounding."""
    feeds = feeds if feeds is not None else check_freshness()
    parts = []
    for f in sorted(feeds, key=lambda x: x.schema):
        age = f"{f.hours_old:.1f}h ago" if f.hours_old is not None else "unknown"
        flag = " STALE" if f.is_stale else ""
        parts.append(f"{f.schema} synced {age}{flag}")
    return "Fivetran MCP freshness: " + "; ".join(parts) if parts else "no evidence feeds found"
