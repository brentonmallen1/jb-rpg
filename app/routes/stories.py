"""Story CRUD (admin only)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
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
    return storage.list_story_summaries()


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
