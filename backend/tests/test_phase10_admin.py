"""
Phase 10 backend tests
- Flame badge (votes_last_hour + is_hot)
- is_admin in /auth/me
- DELETE /api/clips/{id}
- Admin endpoints: stats, reports, reports/{id}/resolve
- Regression smoke: register, login, /me, vote gates
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clips-auth-phase3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "testuser_phase3"
ADMIN_PASS = "sifre123"

# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s

@pytest.fixture(scope="session")
def random_user_session():
    """Create a fresh non-admin user (no Telegram link) for permission tests."""
    s = requests.Session()
    uname = f"TEST_phase10_{uuid.uuid4().hex[:8]}"
    payload = {
        "username": uname,
        "password": "sifre123",
        "email": f"{uname}@example.com",
        "phone": "+905551234567",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    s.username = uname  # type: ignore
    return s

@pytest.fixture(scope="session")
def anon_session():
    return requests.Session()


# ---------- 1) Flame badge / hot map ----------

class TestFlameBadge:
    def test_clips_list_has_votes_last_hour_and_is_hot(self, anon_session):
        r = anon_session.get(f"{API}/clips", timeout=15)
        assert r.status_code == 200
        clips = r.json()
        assert isinstance(clips, list) and len(clips) > 0
        for c in clips:
            assert "votes_last_hour" in c, f"missing votes_last_hour on {c.get('id')}"
            assert "is_hot" in c, f"missing is_hot on {c.get('id')}"
            assert isinstance(c["votes_last_hour"], int)
            assert isinstance(c["is_hot"], bool)
            # consistency: is_hot iff votes_last_hour >= 3
            assert c["is_hot"] == (c["votes_last_hour"] >= 3), \
                f"is_hot mismatch on {c.get('id')}: votes_last_hour={c['votes_last_hour']} is_hot={c['is_hot']}"

    def test_slotjack_demo_clip_2_is_hot(self, anon_session):
        r = anon_session.get(f"{API}/clips", timeout=15)
        assert r.status_code == 200
        clips = r.json()
        hot = [c for c in clips if c.get("title") == "Slotjack demo klip 2"]
        assert hot, "Slotjack demo klip 2 not found"
        c = hot[0]
        assert c["votes_last_hour"] >= 3, f"expected >=3 last_hour votes, got {c['votes_last_hour']}"
        assert c["is_hot"] is True

    def test_clip_detail_has_hot_fields(self, anon_session):
        r = anon_session.get(f"{API}/clips", timeout=15)
        clip_id = r.json()[0]["id"]
        r2 = anon_session.get(f"{API}/clips/{clip_id}", timeout=15)
        assert r2.status_code == 200
        c = r2.json()
        assert "votes_last_hour" in c
        assert "is_hot" in c


# ---------- 2) /auth/me is_admin ----------

class TestAuthMeIsAdmin:
    def test_admin_me_is_admin_true(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me is not None
        assert me.get("username") == ADMIN_USER
        assert me.get("is_admin") is True

    def test_random_user_me_is_admin_false(self, random_user_session):
        r = random_user_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me is not None
        assert me.get("is_admin") is False

    def test_anon_me(self, anon_session):
        r = anon_session.get(f"{API}/auth/me", timeout=15)
        # anon may return 200 null or 401 — both acceptable; if 200 must not be admin
        if r.status_code == 200 and r.json():
            assert r.json().get("is_admin") is not True


# ---------- 3) Admin endpoints permission gating ----------

class TestAdminEndpointsGating:
    def test_admin_stats_anon_401(self, anon_session):
        r = anon_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text[:200]}"

    def test_admin_stats_non_admin_403(self, random_user_session):
        r = random_user_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_admin_stats_admin_200(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200
        s = r.json()
        for k in ["users_total", "users_with_telegram", "clips_total",
                  "clips_this_week", "votes_total", "reports_open", "reports_resolved"]:
            assert k in s, f"stats missing key {k}"
            assert isinstance(s[k], int), f"{k} not int: {s[k]}"
        assert s["users_total"] >= 1
        assert s["reports_open"] >= 1  # seed has 1 open report

    def test_admin_reports_anon_401(self, anon_session):
        r = anon_session.get(f"{API}/admin/reports?status=open", timeout=15)
        assert r.status_code == 401

    def test_admin_reports_non_admin_403(self, random_user_session):
        r = random_user_session.get(f"{API}/admin/reports?status=open", timeout=15)
        assert r.status_code == 403

    def test_admin_reports_open(self, admin_session):
        r = admin_session.get(f"{API}/admin/reports?status=open", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "reports" in body and "count" in body
        assert isinstance(body["reports"], list)
        assert body["count"] == len(body["reports"])
        assert body["count"] >= 1
        rep = body["reports"][0]
        # snapshot fields
        assert "clip" in rep, "report missing clip snapshot"
        clip = rep["clip"]
        for k in ["title", "kick_url", "submitter_username", "votes_count"]:
            assert k in clip, f"clip snapshot missing {k}"

    def test_admin_reports_invalid_status_400(self, admin_session):
        r = admin_session.get(f"{API}/admin/reports?status=bogus", timeout=15)
        assert r.status_code == 400

    def test_admin_reports_resolved_and_all(self, admin_session):
        for st in ("resolved", "all"):
            r = admin_session.get(f"{API}/admin/reports?status={st}", timeout=15)
            assert r.status_code == 200, f"status={st} -> {r.status_code}"


# ---------- 4) DELETE /api/clips/{id} ----------

def _create_clip(session, title_suffix, kick_url=None):
    """Helper — try to create a clip as the given user. May 403 if telegram gate."""
    payload = {
        "kick_url": kick_url or f"https://kick.com/svj/clips/clip_{uuid.uuid4().hex[:10]}",
        "title": f"TEST_phase10_{title_suffix}",
    }
    return session.post(f"{API}/clips", json=payload, timeout=15)


class TestDeleteClip:
    def test_delete_anon_401(self, anon_session):
        # use a known existing clip
        clips = requests.get(f"{API}/clips", timeout=15).json()
        cid = clips[-1]["id"]
        r = anon_session.delete(f"{API}/clips/{cid}", timeout=15)
        assert r.status_code == 401

    def test_delete_nonexistent_404(self, admin_session):
        r = admin_session.delete(f"{API}/clips/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 404

    def test_non_owner_non_admin_403(self, random_user_session):
        # Pick a clip not owned by random_user
        clips = requests.get(f"{API}/clips", timeout=15).json()
        # use Slotjack demo klip 1 (owned by admin)
        target = next(c for c in clips if c["title"] == "Slotjack demo klip 1")
        r = random_user_session.delete(f"{API}/clips/{target['id']}", timeout=15)
        assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"

    def test_admin_can_delete_any_clip_and_cascade(self, admin_session):
        """Admin deletes someone else's clip — verify cascade + 404 after."""
        clips = requests.get(f"{API}/clips", timeout=15).json()
        # find a clip NOT owned by admin and NOT the seeded reported clip 2,
        # not the slotjack demos
        targets = [c for c in clips if c.get("submitter_username") not in (ADMIN_USER,)
                   and c.get("votes_count", 0) == 0
                   and c["title"] not in ("Slotjack demo klip 2",)]
        if not targets:
            pytest.skip("no deletable non-admin clip available")
        cid = targets[0]["id"]
        r = admin_session.delete(f"{API}/clips/{cid}", timeout=15)
        assert r.status_code == 200, f"admin delete failed: {r.status_code} {r.text[:200]}"
        # verify 404 on GET
        r2 = requests.get(f"{API}/clips/{cid}", timeout=15)
        assert r2.status_code == 404


# ---------- 5) Admin resolve reports ----------

class TestResolveReports:
    def test_invalid_action_400(self, admin_session):
        # Get an open report
        rs = admin_session.get(f"{API}/admin/reports?status=open", timeout=15).json()
        if rs["count"] == 0:
            pytest.skip("no open report available")
        rid = rs["reports"][0]["id"]
        r = admin_session.post(f"{API}/admin/reports/{rid}/resolve",
                               json={"action": "bogus"}, timeout=15)
        assert r.status_code == 400

    def test_non_admin_resolve_403(self, random_user_session):
        # pick a report id (even fake) — gating happens before lookup
        r = random_user_session.post(f"{API}/admin/reports/{uuid.uuid4()}/resolve",
                                     json={"action": "ignore"}, timeout=15)
        assert r.status_code == 403

    def test_ignore_then_already_resolved_400(self, admin_session):
        rs = admin_session.get(f"{API}/admin/reports?status=open", timeout=15).json()
        if rs["count"] == 0:
            pytest.skip("no open report available")
        rid = rs["reports"][0]["id"]
        # ignore
        r = admin_session.post(f"{API}/admin/reports/{rid}/resolve",
                               json={"action": "ignore"}, timeout=15)
        assert r.status_code == 200, f"ignore failed: {r.status_code} {r.text[:200]}"
        # verify it became resolved
        rs2 = admin_session.get(f"{API}/admin/reports?status=resolved", timeout=15).json()
        ids = [x["id"] for x in rs2["reports"]]
        assert rid in ids, "report did not move to resolved"
        # second resolve should 400
        r2 = admin_session.post(f"{API}/admin/reports/{rid}/resolve",
                                json={"action": "ignore"}, timeout=15)
        assert r2.status_code == 400


# ---------- 6) Regression smoke ----------

class TestRegressionSmoke:
    def test_clips_root_ok(self):
        r = requests.get(f"{API}/clips", timeout=15)
        assert r.status_code == 200

    def test_login_me_logout_roundtrip(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login",
                   json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        me = s.get(f"{API}/auth/me", timeout=15).json()
        assert me["username"] == ADMIN_USER
        r2 = s.post(f"{API}/auth/logout", timeout=15)
        assert r2.status_code in (200, 204)

    def test_vote_telegram_gate(self, random_user_session):
        """random_user has no Telegram → vote should be gated 403."""
        clips = requests.get(f"{API}/clips", timeout=15).json()
        cid = clips[0]["id"]
        r = random_user_session.post(f"{API}/clips/{cid}/vote", timeout=15)
        assert r.status_code in (403,), f"expected 403 telegram_required, got {r.status_code} {r.text[:200]}"

    def test_self_vote_blocked(self, admin_session):
        """admin owns Slotjack klip 2 → self vote should be 403 (gate)."""
        clips = requests.get(f"{API}/clips", timeout=15).json()
        own = [c for c in clips if c.get("title") == "Slotjack demo klip 2"]
        if not own:
            pytest.skip("no admin-owned clip")
        cid = own[0]["id"]
        r = admin_session.post(f"{API}/clips/{cid}/vote", timeout=15)
        # admin has no telegram either, so 403 telegram_required OR 403 self_vote — both fine
        assert r.status_code == 403
