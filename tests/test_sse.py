import asyncio


def test_sse_connections_use_a_lock():
    from app import sse
    assert isinstance(sse.lock, asyncio.Lock)
