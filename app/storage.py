"""Flat-file persistence: one JSON file per story, plus state.json for the session.

Every write goes through write_json, which writes a temp file and renames it into
place, so a crash mid-write can never leave a truncated story or state file.
"""

import json
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path

from pydantic import ValidationError

from . import config
from .models import GameState, Story

log = logging.getLogger("jb_rpg")

STORIES_DIR = config.DATA_DIR / "stories"
STATE_FILE = config.DATA_DIR / "state.json"

VALID_STORY_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class InvalidStoryId(ValueError):
    pass


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


# ---------------------------------------------------------------------------
# Stories
# ---------------------------------------------------------------------------


def story_path(story_id: str) -> Path:
    """Path for a story file. Rejects ids that aren't safe as file names."""
    if not story_id or not VALID_STORY_ID.match(story_id):
        log.warning("Invalid story ID rejected: %r", story_id)
        raise InvalidStoryId(story_id)
    return STORIES_DIR / f"{story_id}.json"


def story_exists(story_id: str) -> bool:
    return story_path(story_id).exists()


def load_story(story_id: str) -> Story | None:
    path = story_path(story_id)
    if not path.exists():
        return None
    return Story.model_validate_json(path.read_text())


def save_story(story: Story) -> None:
    write_json(story_path(story.id), story.model_dump(mode="json"))


def delete_story(story_id: str) -> None:
    story_path(story_id).unlink()
    shutil.rmtree(assets_dir(story_id), ignore_errors=True)


def assets_dir(story_id: str) -> Path:
    """Uploaded files that belong to a story (e.g. ambient audio)."""
    story_path(story_id)  # validates the id
    return STORIES_DIR.parent / "assets" / story_id


def copy_story_assets(from_id: str, to_id: str) -> None:
    source = assets_dir(from_id)
    if source.exists():
        shutil.copytree(source, assets_dir(to_id), dirs_exist_ok=True)


def list_story_summaries() -> list[dict]:
    summaries = []
    for path in sorted(STORIES_DIR.glob("*.json")):
        try:
            story = json.loads(path.read_text())
            summaries.append({
                "id": story["id"],
                "title": story["title"],
                "theme": story["theme"],
                "scene_count": len(story.get("scenes", [])),
            })
        except (json.JSONDecodeError, KeyError) as e:
            log.error("Skipping unreadable story file %s: %s", path.name, e)
    return summaries


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------


def load_state() -> GameState | None:
    if not STATE_FILE.exists():
        return None
    raw = STATE_FILE.read_text()
    if not raw.strip():
        return None
    try:
        data = json.loads(raw)
        if not data:
            return None
        state = GameState.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as e:
        log.error("state.json is unreadable; treating as no active session: %s", e)
        return None
    # Sessions started before story snapshots existed: attach the story once
    if state.story is None:
        state.story = load_story(state.story_id)
        if state.story is None:
            log.error("Active session's story %r no longer exists", state.story_id)
            return None
    return state


def save_state(state: GameState | None) -> None:
    write_json(STATE_FILE, state.model_dump(mode="json") if state else {})
