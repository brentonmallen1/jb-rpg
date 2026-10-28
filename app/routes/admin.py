"""Storyteller sign-in: one login (see auth.ensure_admin_credentials), kept as a signed cookie."""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import auth, config

router = APIRouter(prefix="/api/admin")
log = logging.getLogger("jb_rpg.security")


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=200)
    password: str = Field(..., max_length=200)


def _is_https(request: Request) -> bool:
    # Behind a reverse proxy the app sees http; the proxy says what the browser used
    forwarded = request.headers.get("X-Forwarded-Proto", "")
    return request.url.scheme == "https" or forwarded == "https" or config.BASE_URL.startswith("https://")


@router.get("/session")
async def session(request: Request):
    """Whether this browser is signed in (`required: false` means sign-in is switched off)."""
    return {"signed_in": auth.is_admin(request), "required": auth.admin_required()}


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    if not auth.admin_required():
        return {"signed_in": True}
    if not auth.admin_credentials_ok(body.username, body.password):
        log.warning("Failed storyteller sign-in for %r", body.username)
        await asyncio.sleep(1)  # makes guessing slow
        raise HTTPException(status_code=401, detail="That isn't the storyteller login.")
    response.set_cookie(
        auth.ADMIN_COOKIE,
        auth.admin_cookie_value(),
        max_age=auth.ADMIN_COOKIE_DAYS * 86400,
        httponly=True,
        secure=_is_https(request),
        samesite="lax",  # never sent on cross-site POSTs, so other sites can't act as you
        path="/",
    )
    return {"signed_in": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(auth.ADMIN_COOKIE, path="/")
    return {"signed_in": False}
