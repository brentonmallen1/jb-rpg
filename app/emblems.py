"""Heroes' crests from the emblem service (emblazon). The built-in crests are the fallback."""

import hashlib

import httpx

from . import config
from .models import Emblem, GameState

# Story theme -> emblazon theme
THEMES = {
    "fantasy": "heraldry",
    "deep_space": "patch",
    "cyberpunk": "insignia",
    "horror": "sigil",
    "insanity": "eldritch",
    "modern": "badge",
}
PER_ROUND = 3
TIMEOUT = 4.0


class EmblemsUnavailable(Exception):
    pass


def _theme(state: GameState) -> str:
    return THEMES[state.story.theme.value]


def seed(state: GameState, round: int) -> str:
    """A hash of the hero's whole background (the madlib as told), so the same hero gets the same emblems."""
    background = state.character.description if state.character else ""
    digest = hashlib.sha256(background.encode()).hexdigest()[:16]
    return digest + (f"~{round}" if round else "")


async def _fetch(theme: str, input: str, count: int) -> list[Emblem]:
    if not config.EMBLAZON_URL:
        raise EmblemsUnavailable("No emblem service configured")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{config.EMBLAZON_URL}/api/v1/emblems", params={"input": input, "theme": theme, "count": count})
            res.raise_for_status()
            return [Emblem(theme=e["theme"], input=e["input"], version=e["version"], description=e.get("description", ""), svg=e["svg"]) for e in res.json()["emblems"]]
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as e:
        raise EmblemsUnavailable(str(e)) from e


async def options(state: GameState, round: int) -> list[Emblem]:
    """Three emblems for the hero; another round gives another three."""
    return await _fetch(_theme(state), seed(state, round), PER_ROUND)
