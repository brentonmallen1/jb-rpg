"""Server-Sent Events: every connected client gets the full payload on every change."""

import asyncio
import json
from typing import Literal

from . import config, engine, storage
from .models import public_state

Role = Literal["storyteller", "player", "observer"]

# Each connection is a queue of messages; None tells its stream to close
connections: dict[asyncio.Queue, Role] = {}
player_ids: dict[asyncio.Queue, str] = {}  # named players' connections (turn-taking modes)
lock = asyncio.Lock()


async def build_payload(for_storyteller: bool = False) -> dict:
    state = storage.load_state()
    async with lock:
        roles = list(connections.values())
        online = sorted(set(player_ids.values()))
    payload = {
        "type": "state",
        "state": public_state(state),
        "resolved": engine.build_resolved(state),
        "player_count": roles.count("player"),
        "storyteller_connected": "storyteller" in roles,
        "players_online": online,
    }
    if for_storyteller and state is not None:
        # Private to the storyteller: how the table is voting
        payload["vote_tally"] = engine.vote_tally(state)
    return payload


async def broadcast() -> None:
    payload = await build_payload(for_storyteller=True)
    private = f"data: {json.dumps(payload)}\n\n"
    payload.pop("vote_tally", None)
    public = f"data: {json.dumps(payload)}\n\n"
    async with lock:
        queues = list(connections.items())
    for queue, role in queues:
        await queue.put(private if role == "storyteller" else public)


async def end_session() -> None:
    """Tell everyone the session ended, then close every stream so clients re-authenticate."""
    message = f"data: {json.dumps({'type': 'session_ended'})}\n\n"
    async with lock:
        queues = list(connections)
    for queue in queues:
        await queue.put(message)
        await queue.put(None)


async def stream(role: Role, player_id: str | None = None):
    queue: asyncio.Queue = asyncio.Queue()
    async with lock:
        connections[queue] = role
        if player_id:
            player_ids[queue] = player_id
    counted = role != "observer"
    try:
        yield f"data: {json.dumps(await build_payload(for_storyteller=role == 'storyteller'))}\n\n"
        if counted:  # player count / storyteller presence changed for everyone else
            await broadcast()
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=config.SSE_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                # Keeps proxies from closing an idle stream between scenes, and lets
                # clients notice a dead connection (EventSource hides comment lines)
                yield "event: ping\ndata: {}\n\n"
                continue
            if message is None:
                break
            yield message
    except asyncio.CancelledError:
        pass
    finally:
        async with lock:
            connections.pop(queue, None)
            player_ids.pop(queue, None)
        if counted:
            await broadcast()
