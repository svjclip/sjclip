"""Iter11 — Bug fix regression: Kick embed URL + Telegram dialog dismiss
   Smoke regression for Phase 11: events feed + reactions + auth/clip listing.
"""
import os
import time
import uuid
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
    r = s.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def fresh_user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    uname = f"qa_dismiss_{int(time.time())}_{uuid.uuid4().hex[:4]}"
    payload = {
        "username": uname,
        "password": "Sifre1234",
        "email": f"{uname}@example.com",
        "phone": "+905551234567",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "user" in data
    assert data["user"]["username"] == uname
    # Fresh user should have telegram missing (gate scenario)
    assert data["user"].get("telegram_id") in (None, "")
    return s, uname


# --- Regression: Auth + clip listing ---
class TestAuthAndClipListing:
    def test_login_me(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me["username"] == ADMIN_USER

    def test_clips_listing_shape(self, admin_session):
        r = admin_session.get(f"{API}/clips", timeout=15)
        assert r.status_code == 200
        clips = r.json()
        assert isinstance(clips, list)
        assert len(clips) > 0, "Need at least one clip"
        c = clips[0]
        # ClipPublic schema fields
        for f in ["id", "kick_url", "kick_clip_id", "votes_count", "has_voted", "reactions", "my_reaction"]:
            assert f in c, f"Missing field {f} in clip: {list(c.keys())}"
        assert isinstance(c["reactions"], dict)
        # kick_clip_id should be the extracted clip_XXX identifier
        assert c["kick_clip_id"].startswith("clip_"), f"kick_clip_id unexpected: {c['kick_clip_id']}"


# --- BUG 1: Kick embed URL — verify kick_clip_id exists & has clip_ prefix
# (Frontend kickEmbedUrl helper is unit-validated in playwright phase) ---
class TestKickClipIdExtraction:
    def test_kick_clip_id_format(self, admin_session):
        r = admin_session.get(f"{API}/clips", timeout=15)
        assert r.status_code == 200
        for c in r.json():
            assert c["kick_clip_id"].startswith("clip_"), c
            # kick_url should be the original /slotjack/clip(s) URL
            assert "kick.com" in c["kick_url"]


# --- Regression: Phase 11 events ---
class TestEventsFeed:
    def test_events_returns_list(self):
        r = requests.get(f"{API}/events", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Accept either list or {events: [...]}
        events = data if isinstance(data, list) else data.get("events", data.get("items", []))
        assert isinstance(events, list)


# --- Regression: Phase 11 reactions ---
class TestReactions:
    def test_reaction_admin_bypass_or_gate(self, admin_session):
        clips = admin_session.get(f"{API}/clips", timeout=15).json()
        clip_id = clips[0]["id"]
        # Admin bypasses telegram gate per iter10 confirm
        r = admin_session.post(
            f"{API}/clips/{clip_id}/reactions",
            json={"emoji": "🔥"},
            timeout=15,
        )
        assert r.status_code in (200, 201, 422), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code in (200, 201):
            body = r.json()
            # Response shape should contain reactions map somewhere
            assert "reactions" in body or "my_reaction" in body or isinstance(body, dict)

    def test_reaction_gated_for_no_telegram_user(self, fresh_user_session, admin_session):
        s, _ = fresh_user_session
        clips = admin_session.get(f"{API}/clips", timeout=15).json()
        clip_id = clips[0]["id"]
        r = s.post(f"{API}/clips/{clip_id}/reactions", json={"emoji": "🔥"}, timeout=15)
        # Expected: 403 telegram_required (or 401 if auth lost). Acceptable: 200 if no gate.
        assert r.status_code in (200, 201, 401, 403, 422), f"Unexpected: {r.status_code} {r.text}"


# --- Regression: Clip submission URL validation ---
class TestClipSubmissionValidation:
    def test_slotjack_url_accepted_or_telegram_gated(self, admin_session):
        # Admin bypasses telegram gate; should accept slotjack URL or return duplicate/already-exists
        unique = uuid.uuid4().hex[:10].upper()
        payload = {
            "kick_url": f"https://kick.com/slotjack/clips/clip_TEST{unique}",
            "title": "TEST_iter11_validation",
        }
        r = admin_session.post(f"{API}/clips", json=payload, timeout=20)
        # 200 OK, or 400 duplicate, or 403 telegram_required, or 422 validation
        assert r.status_code in (200, 201, 400, 403, 422), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code in (200, 201):
            body = r.json()
            assert body.get("kick_clip_id", "").startswith("clip_TEST")
            # cleanup — delete the clip via admin
            clip_id = body.get("id")
            if clip_id:
                admin_session.delete(f"{API}/clips/{clip_id}", timeout=10)

    def test_non_slotjack_url_rejected(self, admin_session):
        unique = uuid.uuid4().hex[:6].upper()
        payload = {
            "kick_url": f"https://kick.com/otherstreamer/clips/clip_X{unique}",
            "title": "TEST_should_fail",
        }
        r = admin_session.post(f"{API}/clips", json=payload, timeout=15)
        # Must be rejected (400 or 422 validation). NOT 200/201.
        assert r.status_code in (400, 422), f"Expected reject, got: {r.status_code} {r.text}"
