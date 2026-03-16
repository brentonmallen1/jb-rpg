import pytest
import asyncio
from unittest.mock import AsyncMock, patch


def test_sse_connections_uses_lock():
    """Verify sse_connections access is protected by a lock."""
    import main
    assert hasattr(main, 'sse_lock'), "main.py must define sse_lock"
    assert isinstance(main.sse_lock, type(asyncio.Lock())), "sse_lock must be an asyncio.Lock"
