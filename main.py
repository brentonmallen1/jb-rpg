"""Entry point: `uvicorn main:app`. The application lives in the app/ package."""

from app.main import app

if __name__ == "__main__":
    import uvicorn

    # SSE streams never end on their own, so cap graceful shutdown or restarts hang
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_graceful_shutdown=2)
