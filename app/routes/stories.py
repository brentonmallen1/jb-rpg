"""Story CRUD (admin only)."""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import auth, engine, sse, storage
from ..models import MadLibTemplate, Story, StorySettings, ThemeName

router = APIRouter(prefix="/api/stories", dependencies=[Depends(auth.verify_admin)])


class CreateStoryRequest(BaseModel):
    title: str


def require_story(story_id: str) -> Story:
    story = storage.load_story(story_id)
    if story is None:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


@router.get("")
async def list_stories() -> list[dict]:
    """Each story's title and theme, with what's left to fix (errors) and what's worth a look (warnings)."""
    summaries = storage.list_story_summaries()
    for summary in summaries:
        story = storage.load_story(summary["id"])
        problems = engine.story_problems(story) if story else []
        summary["errors"] = sum(p["severity"] == "error" for p in problems)
        summary["warnings"] = [p["message"] for p in problems if p["severity"] == "warning"]
    return summaries


@router.post("")
async def create_story(request: CreateStoryRequest) -> Story:
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
    story = Story(
        id=uuid.uuid4().hex[:8],
        title=title,
        theme=ThemeName.CYBERPUNK,
        settings=StorySettings(),
        madlib_template=MadLibTemplate(prompt="", fields=[]),
        scenes=[],
    )
    storage.save_story(story)
    return story


@router.post("/import")
async def import_story(story: Story) -> Story:
    """Add an exported story. Keeps its id unless that's taken or unsafe, then picks a new one."""
    try:
        taken = storage.story_exists(story.id)
    except storage.InvalidStoryId:
        taken = True
    if taken:
        story = story.model_copy(update={"id": uuid.uuid4().hex[:8]})
    storage.save_story(story)
    return story


@router.post("/{story_id}/duplicate")
async def duplicate_story(story_id: str) -> Story:
    """A copy to experiment on, with its own id (and its own copy of any uploaded audio)."""
    original = require_story(story_id)
    copy = original.model_copy(update={"id": uuid.uuid4().hex[:8], "title": f"{original.title} (copy)"})
    storage.save_story(copy)
    storage.copy_story_assets(original.id, copy.id)
    return copy


@router.get("/{story_id}")
async def get_story(story_id: str) -> Story:
    return require_story(story_id)


@router.get("/{story_id}/problems")
async def get_story_problems(story_id: str) -> dict:
    """What would stop this story from being played (empty list = ready)."""
    return {"problems": engine.story_problems(require_story(story_id))}


@router.put("/{story_id}")
async def update_story(story_id: str, story: Story) -> Story:
    if story.id != story_id:
        raise HTTPException(status_code=422, detail="Story id in body does not match URL")
    require_story(story_id)
    storage.save_story(story)
    return story


@router.delete("/{story_id}")
async def delete_story(story_id: str):
    require_story(story_id)
    state = storage.load_state()
    if state is not None and state.story_id == story_id:
        await sse.end_session()
        storage.save_state(None)
    storage.delete_story(story_id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Audio: ambience loops and moment stings, stored with the story
# ---------------------------------------------------------------------------

AUDIO_TYPES = {
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg",
    ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".webm": "audio/webm", ".flac": "audio/flac",
}
MAX_AUDIO_BYTES = 30 * 1024 * 1024
SAFE_AUDIO_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._()'-]{0,99}$")


def audio_path(story_id: str, name: str):
    require_story(story_id)
    suffix = name[name.rfind("."):].lower() if "." in name else ""
    if not SAFE_AUDIO_NAME.match(name) or suffix not in AUDIO_TYPES or "/" in name or ".." in name:
        raise HTTPException(status_code=422, detail="Use an audio file (mp3, ogg, wav, m4a, aac, webm, flac) with a plain name")
    return storage.assets_dir(story_id) / "audio" / name, AUDIO_TYPES[suffix]


@router.get("/{story_id}/audio")
async def list_audio(story_id: str) -> list[dict]:
    require_story(story_id)
    folder = storage.assets_dir(story_id) / "audio"
    if not folder.exists():
        return []
    return [{"name": f.name, "size": f.stat().st_size} for f in sorted(folder.iterdir()) if f.is_file()]


@router.put("/{story_id}/audio/{name}")
async def upload_audio(story_id: str, name: str, request: Request) -> dict:
    """Upload one audio file (the request body is the file). Same name replaces it."""
    path, _ = audio_path(story_id, name)
    if int(request.headers.get("content-length") or 0) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio files can be up to 30 MB")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=422, detail="The file is empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio files can be up to 30 MB")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.uploading")
    tmp.write_bytes(data)
    tmp.replace(path)
    return {"name": path.name, "size": len(data)}


@router.get("/{story_id}/audio/{name}")
async def get_audio(story_id: str, name: str):
    path, media_type = audio_path(story_id, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(path, media_type=media_type)


@router.delete("/{story_id}/audio/{name}")
async def delete_audio(story_id: str, name: str):
    path, _ = audio_path(story_id, name)
    path.unlink(missing_ok=True)
    return {"status": "deleted"}
