from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

app = FastAPI(title="J&B's RPG")

STATIC_DIR = Path(__file__).parent / "static"
STORIES_DIR = Path(__file__).parent / "stories"
STATE_FILE = Path(__file__).parent / "state.json"

# Ensure directories exist
STORIES_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "pages" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
