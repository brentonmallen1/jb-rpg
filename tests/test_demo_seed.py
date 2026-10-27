"""A fresh data directory gets the demo stories once; deleting one later sticks."""

from app import config, storage


def test_demos_seed_a_fresh_data_dir_only_once(tmp_path, monkeypatch):
    demos = tmp_path / "bundled"
    demos.mkdir()
    (demos / "demo-one.json").write_text("{}")
    stories = tmp_path / "data" / "stories"
    monkeypatch.setattr(config, "DEMO_DIR", demos)
    monkeypatch.setattr(storage, "STORIES_DIR", stories)

    storage.seed_demo_stories()
    assert (stories / "demo-one.json").exists()

    (stories / "demo-one.json").unlink()
    storage.seed_demo_stories()
    assert not (stories / "demo-one.json").exists()
