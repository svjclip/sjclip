"""Phase 8 — community counter formula change + regression smoke.

New formula:
  displayed_total    = real_total * COMMUNITY_DISPLAY_MULTIPLIER (default 4)
  displayed_telegram = real_telegram * COMMUNITY_DISPLAY_MULTIPLIER
  next_position      = displayed_telegram + COMMUNITY_DISPLAY_MULTIPLIER
No additive offset (the old 1247 offset is gone).
"""
import os
import uuid
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://clips-auth-phase3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
MULT = 4  # COMMUNITY_DISPLAY_MULTIPLIER default


# -------------------- helpers --------------------
@pytest.fixture
def session():
    return requests.Session()


def _register(session, suffix=""):
    uname = f"ph8_{uuid.uuid4().hex[:8]}{suffix}"
    payload = {
        "username": uname,
        "password": "sifre123",
        "email": f"{uname}@test.com",
        "phone": "+905551234567",
    }
    r = session.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return uname, r.json()


# -------------------- community_stats formula --------------------
class TestCommunityStatsFormula:
    """GET /api/stats/community new formula: real*4, no offset."""

    def test_formula_multiple_of_multiplier(self, session):
        r = session.get(f"{API}/stats/community", timeout=10)
        assert r.status_code == 200
        data = r.json()
        # Both counters must be multiples of MULT (no offset).
        assert data["total_members"] % MULT == 0, f"total_members not multiple of {MULT}: {data}"
        assert data["telegram_linked"] % MULT == 0, f"telegram_linked not multiple of {MULT}: {data}"
        # next_position = telegram_linked + MULT
        assert data["next_position"] == data["telegram_linked"] + MULT
        # telegram_linked <= total_members
        assert data["telegram_linked"] <= data["total_members"]
        # No legacy offset (1247) — counters should be small relative to that
        # (we only assert no plus-1247 leak: total_members would be > 1247 only if real >310)
        # but more directly: next_position equals telegram_linked+MULT (already asserted).

    def test_register_increments_total_by_multiplier(self, session):
        before = session.get(f"{API}/stats/community", timeout=10).json()
        _register(session)
        time.sleep(0.3)
        after = session.get(f"{API}/stats/community", timeout=10).json()
        delta_total = after["total_members"] - before["total_members"]
        delta_tg = after["telegram_linked"] - before["telegram_linked"]
        # New user has no telegram → only total grows, by exactly MULT
        assert delta_total == MULT, f"expected +{MULT}, got {delta_total}. before={before} after={after}"
        assert delta_tg == 0, f"telegram count must not change on plain register: {before} → {after}"
        # next_position invariant: telegram_linked + MULT
        assert after["next_position"] == after["telegram_linked"] + MULT


# -------------------- regression smoke --------------------
class TestRegressionSmoke:
    """Phase-7 surfaces must still work after the counter change."""

    def test_register_login_me(self, session):
        uname, reg = _register(session)
        assert reg["user"]["username"] == uname
        # login (cookie reuses session)
        r = session.post(f"{API}/auth/login", json={"username": uname, "password": "sifre123"}, timeout=10)
        assert r.status_code == 200, r.text
        # me
        me = session.get(f"{API}/auth/me", timeout=10)
        assert me.status_code == 200
        assert me.json()["username"] == uname

    def test_clips_listing(self, session):
        r = session.get(f"{API}/clips", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # demo clips should exist
        if data:
            sample = data[0]
            for k in ["id", "title", "kick_clip_id", "votes_count", "submitter_username"]:
                assert k in sample, f"missing field {k} in clip: {list(sample.keys())}"

    def test_user_profile_public(self, session):
        r = session.get(f"{API}/users/testuser_phase3", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["username"] == "testuser_phase3"
        assert "clips" in data
        assert "stats" in data

    def test_report_clip_requires_auth_or_returns_400(self, session):
        # Find a clip id
        clips = session.get(f"{API}/clips", timeout=10).json()
        if not clips:
            pytest.skip("no clips to report against")
        cid = clips[0]["id"]
        # Anonymous report → expect 401 (auth required) per Phase 7
        r = session.post(f"{API}/clips/{cid}/report", json={"reason": "test"}, timeout=10)
        assert r.status_code in (401, 422), f"unexpected status: {r.status_code} {r.text}"


# -------------------- contest security regression --------------------
class TestContestRegression:
    """vote_clip gates must still fire (Phase 7 behaviour preserved)."""

    def test_anonymous_vote_blocked(self, session):
        clips = session.get(f"{API}/clips", timeout=10).json()
        if not clips:
            pytest.skip("no clips")
        cid = clips[0]["id"]
        r = session.post(f"{API}/clips/{cid}/vote", timeout=10)
        assert r.status_code in (401, 403), f"anon vote should be blocked, got {r.status_code}: {r.text}"

    def test_user_without_telegram_vote_blocked(self, session):
        # Login as seeded user (no telegram)
        r = session.post(f"{API}/auth/login", json={"username": "testuser_phase3", "password": "sifre123"}, timeout=10)
        assert r.status_code == 200, r.text
        clips = session.get(f"{API}/clips", timeout=10).json()
        # Find a clip NOT submitted by testuser_phase3 to ensure self-vote isn't shadowing the test
        target = next((c for c in clips if c.get("submitter_username") != "testuser_phase3"), None)
        if target is None:
            target = clips[0]
        r2 = session.post(f"{API}/clips/{target['id']}/vote", timeout=10)
        assert r2.status_code == 403, f"telegram gate must fire, got {r2.status_code}: {r2.text}"
        body = r2.json()
        # Detail should signal telegram_required or missing_channels
        detail = body.get("detail") if isinstance(body, dict) else None
        if isinstance(detail, dict):
            assert detail.get("error") in ("telegram_required", "missing_channels"), detail

    def test_unvote_nonexistent_clip_404(self, session):
        # Login seeded user
        session.post(f"{API}/auth/login", json={"username": "testuser_phase3", "password": "sifre123"}, timeout=10)
        r = session.delete(f"{API}/clips/{uuid.uuid4().hex}/vote", timeout=10)
        # Should be 404 (clip not found) or 403 if telegram-gate runs first; both acceptable as long as not 500
        assert r.status_code in (403, 404), f"unexpected: {r.status_code} {r.text}"
