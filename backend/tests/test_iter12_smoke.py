"""Iter12 smoke regression: clips/events/reactions + auth login."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clips-auth-phase3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "testuser_phase3"
ADMIN_PASS = "sifre123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# Phase 1: GET /api/clips schema
def test_get_clips_returns_list_with_required_fields():
    r = requests.get(f"{API}/clips")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        c = data[0]
        for k in ("id", "kick_url", "kick_clip_id", "title", "votes_count", "submitter_username", "reactions"):
            assert k in c, f"missing field {k} in clip"
        # kick_clip_id should look like clip_xxx
        assert c["kick_clip_id"].startswith("clip_"), f"unexpected kick_clip_id: {c['kick_clip_id']}"


# Phase 11: GET /api/events
def test_get_events_returns_list():
    r = requests.get(f"{API}/events")
    assert r.status_code == 200
    body = r.json()
    # API returns {events: [...], next_cursor: ...}
    assert isinstance(body, dict) and "events" in body
    assert isinstance(body["events"], list)


# Phase 1: auth me with cookie
def test_admin_login_and_me(admin_session):
    r = admin_session.get(f"{API}/auth/me")
    assert r.status_code == 200
    me = r.json()
    assert me is not None
    assert me["username"] == ADMIN_USER
    assert me.get("is_admin") is True


# Phase 11: reactions admin bypass
def test_admin_can_add_reaction(admin_session):
    clips = requests.get(f"{API}/clips").json()
    assert clips, "no clips available"
    cid = clips[0]["id"]
    r = admin_session.post(f"{API}/clips/{cid}/reactions", json={"emoji": "🔥"})
    assert r.status_code == 200, f"reactions failed: {r.status_code} {r.text}"
    data = r.json()
    # API returns {ok, emoji, changed}
    assert data.get("ok") is True
    assert data.get("emoji") == "🔥"
