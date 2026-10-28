"""Single-page app routes. In development the Vite dev server serves these instead."""

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from .. import auth, config, storage

router = APIRouter()

MESSAGE_PAGE = """<!DOCTYPE html>
<html>
<head>
    <title>{title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{ font-family: system-ui, sans-serif; text-align: center; padding: 50px 16px; background: #1a1a2e; color: #eee; }}
        h1 {{ color: {color}; }}
        p {{ color: #aaa; }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    {body}
</body>
</html>"""


def message_page(title: str, body: str, color: str, status_code: int) -> HTMLResponse:
    return HTMLResponse(MESSAGE_PAGE.format(title=title, body=body, color=color), status_code=status_code)


def spa():
    index = config.STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return message_page(
        "Frontend not built",
        "<p>Run <code>just frontend-build</code>, or use the Vite dev server (<code>just frontend-dev</code>).</p>",
        "#f9ca24",
        503,
    )


@router.get("/")
async def index():
    return spa()


@router.get("/login")
async def login():
    return spa()


@router.get("/editor/{story_id:path}")
async def editor(story_id: str):
    return spa()


@router.get("/run")
async def run():
    return spa()


@router.get("/player/{session_id}")
async def player(session_id: str):
    if not auth.is_player(storage.load_state(), session_id):
        return message_page(
            "Session Not Found",
            "<p>This session link is invalid or has expired.</p><p>Ask the storyteller for a new link.</p>",
            "#ff6b6b",
            404,
        )
    return spa()


@router.get("/player")
async def player_without_session():
    return message_page(
        "Session Link Required",
        "<p>Please use the link provided by your storyteller to join the game.</p>",
        "#f9ca24",
        400,
    )
