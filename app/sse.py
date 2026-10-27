"""Server-Sent Events: every connected client gets the full payload on every change."""

import asyncio
import json
from typing import Literal

from . import config, engine, storage
from .models import public_state

Role = Literal["storyteller", "player", "observer"]

# Each connection is a queue of messages; None tells its stream to close
connections: dict[asyncio.Queue, Role] = {}
lock = asyncio.Lock()


async def build_payload() -> dict:
    state = storage.load_state()
    async with lock:
        roles = list(connections.values())
    return {
        "type": "state",
        "state": public_state(state),
        "resolved": engine.build_resolved(state),
        "player_count": roles.count("player"),
        "storyteller_connected": "storyteller" in roles,
    }


async def broadcast() -> None:
    message = f"data: {json.dumps(await build_payload())}\n\n"
    async with lock:
        queues = list(connections)
    for queue in queues:
        await queue.put(message)


async def end_session() -> None:
    """Tell everyone the session ended, then close every stream so clients re-authenticate."""
    message = f"data: {json.dumps({'type': 'session_ended'})}\n\n"
    async with lock:
        queues = list(connections)
    for queue in queues:
        await queue.put(message)
        await queue.put(None)


async def stream(role: Role):
    queue: asyncio.Queue = asyncio.Queue()
    async with lock:
        connections[queue] = role
    counted = role != "observer"
    try:
        yield f"data: {json.dumps(await build_payload())}\n\n"
        if counted:  # player count / storyteller presence changed for everyone else
            await broadcast()
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=config.SSE_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                # Comment line: keeps proxies from closing an idle stream between scenes
                yield ": ping\n\n"
                continue
            if message is None:
                break
            yield message
    except asyncio.CancelledError:
        pass
    finally:
        async with lock:
            connections.pop(queue, None)
        if counted:
            await broadcast()
