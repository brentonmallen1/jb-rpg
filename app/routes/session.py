"""Session endpoints. State transitions follow one shape:
verify caller -> engine transition (validates status) -> save -> broadcast -> return state.
"""

import secrets
import time
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import auth, config, emblems, engine, sse, storage
from ..models import GameState, Story, TurnMode, public_state

router = APIRouter(prefix="/api")


async def commit(state: GameState) -> dict:
    storage.save_state(state)
    await sse.broadcast()
    return public_state(state)


def can_observe(request: Request) -> bool:
    """Admins (when admin auth is configured) may watch a session without joining it."""
    return config.AUTH_DISABLED or (auth.admin_required() and auth.is_admin(request))


# ---------------------------------------------------------------------------
# Reading state
# ---------------------------------------------------------------------------


@router.get("/events")
async def events(
    request: Request,
    token: Optional[str] = None,
    s: Optional[str] = None,
    p: Optional[str] = None,
    d: Optional[str] = Query(None, max_length=64),
):
    """SSE stream. Storytellers pass ?token=, players pass ?s=<session_id> (and ?p=<player token> once named).
    ?d= is the device's own id, so a phone that reconnects replaces its old stream instead of counting twice."""
    state = storage.load_state()
    if auth.is_storyteller(state, token):
        role = "storyteller"
    elif auth.is_player(state, s):
        role = "player"
    elif state is None or can_observe(request):
        role = "observer"
    else:
        raise HTTPException(status_code=403, detail="Invalid session")

    player = auth.player_for_token(state, p) if role == "player" else None
    return StreamingResponse(
        sse.stream(role, player.id if player else None, d),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/state")
async def get_state(
    request: Request,
    s: Optional[str] = None,
    x_session_token: Optional[str] = Header(None),
):
    state = storage.load_state()
    allowed = (
        state is None
        or auth.is_storyteller(state, x_session_token)
        or auth.is_player(state, s)
        or can_observe(request)
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Authentication required")
    storyteller = auth.is_storyteller(state, x_session_token)
    payload = await sse.build_payload(for_storyteller=storyteller)
    response = {
        "state": payload["state"],
        "resolved": payload["resolved"],
        "storyteller_connected": payload["storyteller_connected"],
    }
    if storyteller:
        response["vote_tally"] = payload.get("vote_tally")
        response["path_progress"] = payload.get("path_progress")
    return response


@router.get("/session/check")
async def check_session(s: Optional[str] = None):
    """Public: is a session active, and does `s` match it? Never reveals the id."""
    state = storage.load_state()
    return {"active": state is not None, "valid": auth.is_player(state, s)}


@router.get("/state/validate-token")
async def validate_token(x_session_token: Optional[str] = Header(None)):
    state = storage.load_state()
    if state is None:
        return {"valid": False, "reason": "no_session", "is_storyteller": False}
    if auth.is_storyteller(state, x_session_token):
        return {"valid": True, "is_storyteller": True}
    return {"valid": False, "reason": "invalid_token", "is_storyteller": False}


@router.get("/state/story")
async def session_story(state: GameState = Depends(auth.verify_storyteller)) -> Story:
    """The story as it was when this session started (edits made since don't affect the game)."""
    return state.story


# ---------------------------------------------------------------------------
# Starting, resuming, ending
# ---------------------------------------------------------------------------


class StartRequest(BaseModel):
    story_id: str
    force: bool = False  # end any running session first
    turn_mode: TurnMode = "storyteller"  # who makes each choice
    no_flashing: bool = False  # calm effects on every screen


@router.post("/state/start")
async def start_session(request: StartRequest, _: bool = Depends(auth.verify_admin)):
    story = storage.load_story(request.story_id)
    if story is None:
        raise HTTPException(status_code=404, detail="Story not found")

    current = storage.load_state()
    if current is not None:
        if not request.force:
            title = current.story.title if current.story else current.story_id
            raise HTTPException(status_code=409, detail=f"A session of “{title}” is already running.")
        await sse.end_session()

    state = engine.new_session(story, request.turn_mode, request.no_flashing)
    token = auth.issue_token(state)
    return {"state": await commit(state), "token": token}


@router.post("/state/resume")
async def resume_session(_: bool = Depends(auth.verify_admin)):
    """Take over the running session as storyteller (e.g. after closing the tab).
    Issues a new token; the previous storyteller's token stops working."""
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    token = auth.issue_token(state)
    return {"state": await commit(state), "token": token}


@router.post("/state/restart")
async def restart_session(_: GameState = Depends(auth.verify_storyteller)):
    """End the session for everyone."""
    await sse.end_session()
    storage.save_state(None)
    return {"status": "restarted"}


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------


class MadlibRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=500)


class ChoiceRequest(BaseModel):
    choice_index: int


class OpeningChoiceRequest(BaseModel):
    choice_index: Optional[int] = None  # None = "proceed" button


class SelectSceneRequest(BaseModel):
    scene_id: str
    revisit: bool = False  # replaying an already-played scene


class FinishRequest(BaseModel):
    outcome: Literal["victory", "defeat"]


@router.post("/state/madlib")
async def submit_madlib(request: MadlibRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.submit_madlib(state, request.answer)
    return await commit(state)


@router.post("/state/madlib-back")
async def madlib_back(state: GameState = Depends(auth.verify_storyteller)):
    engine.madlib_back(state)
    return await commit(state)


@router.post("/state/proceed-from-character")
async def proceed_from_character(state: GameState = Depends(auth.verify_storyteller)):
    engine.proceed_from_character(state)
    return await commit(state)


@router.post("/state/opening-choice")
async def opening_choice(request: OpeningChoiceRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.opening_choice(state, request.choice_index)
    return await commit(state)


@router.post("/state/reveal-choices")
async def reveal_choices(show_to_players: bool = True, state: GameState = Depends(auth.verify_storyteller)):
    engine.reveal_choices(state, show_to_players)
    return await commit(state)


@router.post("/state/choice")
async def make_choice(request: ChoiceRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.make_choice(state, request.choice_index)
    return await commit(state)


@router.post("/state/back")
async def go_back(state: GameState = Depends(auth.verify_storyteller)):
    engine.go_back(state)
    return await commit(state)


@router.post("/state/select-scene")
async def select_scene(request: SelectSceneRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.select_scene(state, request.scene_id, request.revisit)
    return await commit(state)


@router.post("/state/finish")
async def finish(request: FinishRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.finish(state, request.outcome)
    return await commit(state)


class OfferRollRequest(BaseModel):
    offered: bool


@router.post("/state/offer-roll")
async def offer_roll(request: OfferRollRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.offer_roll(state, request.offered)
    return await commit(state)


class RollRequest(BaseModel):
    attempt: int  # how many rolls the roller had seen
    s: Optional[str] = None  # a player's session id (the storyteller sends its token instead)


@router.post("/state/roll")
async def roll(request: RollRequest, x_session_token: Optional[str] = Header(None)):
    """The digital d20, once the storyteller offers it: any player at the table (or the storyteller) taps, the server rolls."""
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    if not (auth.is_player(state, request.s) or auth.is_storyteller(state, x_session_token)):
        raise HTTPException(status_code=403, detail="Invalid session")
    engine.roll(state, request.attempt)
    return await commit(state)


class RecordRollRequest(BaseModel):
    attempt: int
    value: int


@router.post("/state/record-roll")
async def record_roll(request: RecordRollRequest, state: GameState = Depends(auth.verify_storyteller)):
    """Real dice: the storyteller enters each roll as it lands."""
    engine.record_roll(state, request.attempt, request.value)
    return await commit(state)


@router.post("/state/undo-roll")
async def undo_roll(state: GameState = Depends(auth.verify_storyteller)):
    engine.undo_roll(state)
    return await commit(state)


@router.post("/state/reveal-outcome")
async def reveal_outcome(state: GameState = Depends(auth.verify_storyteller)):
    engine.reveal_outcome(state)
    return await commit(state)


# ---------------------------------------------------------------------------
# Players and turns
# ---------------------------------------------------------------------------


class JoinRequest(BaseModel):
    s: str
    name: str = Field(..., min_length=1, max_length=60)


class DeciderRequest(BaseModel):
    player_id: Optional[str] = None


class ProposeRequest(BaseModel):
    choice_index: Optional[int] = None  # None withdraws the pick


class VoteRequest(BaseModel):
    choice_index: int


def require_player(state: GameState | None, token: Optional[str]):
    player = auth.player_for_token(state, token)
    if player is None:
        raise HTTPException(status_code=403, detail="Join the game first")
    return player


@router.post("/session/join")
async def join_session(request: JoinRequest):
    """A phone joins the table by name. Returns the token that proves it's this player."""
    state = storage.load_state()
    if not auth.is_player(state, request.s):
        raise HTTPException(status_code=403, detail="Invalid session")
    token = secrets.token_urlsafe(24)
    player = engine.join(state, request.name, auth.hash_token(token))
    await commit(state)
    return {"player": {"id": player.id, "name": player.name}, "token": token}


@router.get("/session/me")
async def who_am_i(x_player_token: Optional[str] = Header(None)):
    """Which player this phone is (after a refresh or reconnect)."""
    player = require_player(storage.load_state(), x_player_token)
    return {"id": player.id, "name": player.name}


@router.post("/state/propose")
async def propose(request: ProposeRequest, x_player_token: Optional[str] = Header(None)):
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    engine.propose(state, require_player(state, x_player_token), request.choice_index)
    await commit(state)
    return {"status": "ok"}


@router.post("/state/deal-doors")
async def deal_doors(state: GameState = Depends(auth.verify_storyteller)):
    """Non-linear stories: show the doors on the phones."""
    engine.deal_doors(state)
    return await commit(state)


class ProposeDoorRequest(BaseModel):
    scene_id: Optional[str] = Field(None, max_length=200)  # None withdraws the pick


@router.post("/state/propose-door")
async def propose_door(request: ProposeDoorRequest, x_player_token: Optional[str] = Header(None)):
    """Non-linear stories: the player whose turn it is points at a door; the storyteller opens it."""
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    engine.propose_door(state, require_player(state, x_player_token), request.scene_id)
    await commit(state)
    return {"status": "ok"}


@router.post("/state/vote")
async def vote(request: VoteRequest, x_player_token: Optional[str] = Header(None)):
    """A player's one vote. The storyteller sees the tally; it never makes the choice by itself."""
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    engine.cast_vote(state, require_player(state, x_player_token), request.choice_index, time.time())
    await commit(state)
    return {"status": "ok"}


@router.post("/state/decider")
async def set_decider(request: DeciderRequest, state: GameState = Depends(auth.verify_storyteller)):
    engine.set_decider(state, request.player_id)
    return await commit(state)


class FlashingRequest(BaseModel):
    no_flashing: bool


@router.post("/state/no-flashing")
async def set_no_flashing(request: FlashingRequest, state: GameState = Depends(auth.verify_storyteller)):
    """Calm effects for the whole table (any status): no flashes, flicker or shake on any screen."""
    state.no_flashing = request.no_flashing
    return await commit(state)


class CrestOptionsRequest(BaseModel):
    round: int = 0


@router.post("/state/crest-options")
async def crest_options(request: CrestOptionsRequest, state: GameState = Depends(auth.verify_storyteller)):
    """Three crests for the table: emblems from the emblem service, or the built-in crests when it's down."""
    engine.require_status(state, engine.SessionStatus.CHARACTER_REVEAL)
    try:
        options = await emblems.options(state, request.round)
    except emblems.EmblemsUnavailable:
        options = []
    engine.set_crest_options(state, request.round, options)
    return await commit(state)


class CrestRequest(BaseModel):
    variant: int = 0
    emblem: Optional[str] = Field(None, max_length=200)  # One of state.emblem_options, by input
    s: Optional[str] = None  # a player's session id (the storyteller sends its token instead)


@router.post("/state/crest")
async def choose_crest(request: CrestRequest, x_session_token: Optional[str] = Header(None)):
    """The table chooses the hero's crest: the storyteller, or any player on their phone."""
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    if not (auth.is_player(state, request.s) or auth.is_storyteller(state, x_session_token)):
        raise HTTPException(status_code=403, detail="Invalid session")
    if request.emblem is None:
        engine.choose_crest(state, request.variant)
    else:
        engine.choose_emblem(state, request.emblem)
    return await commit(state)


@router.delete("/state/players/{player_id}")
async def remove_player(player_id: str, state: GameState = Depends(auth.verify_storyteller)):
    engine.remove_player(state, player_id)
    return await commit(state)
