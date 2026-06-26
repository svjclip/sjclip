"""Phase 6 backend tests: community stats, public profile, clip reporting."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clips-auth-phase3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand(prefix="TEST"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_a(session):
    """Register a fresh user and return (session, user_dict)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    uname = _rand("ph6a")
    r = s.post(f"{API}/auth/register", json={
        "username": uname, "password": "sifre123",
        "email": f"{uname}@ex.com", "phone": "+905551234567",
    })
    assert r.status_code == 200, r.text
    return s, r.json()["user"]


@pytest.fixture(scope="module")
def user_b(session):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    uname = _rand("ph6b")
    r = s.post(f"{API}/auth/register", json={
        "username": uname, "password": "sifre123",
        "email": f"{uname}@ex.com", "phone": "+905551234567",
    })
    assert r.status_code == 200, r.text
    return s, r.json()["user"]


# -------- Community Stats --------
class TestCommunityStats:
    def test_anonymous_access(self, session):
        r = session.get(f"{API}/stats/community")
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) >= {"total_members", "telegram_linked", "next_position"}
        assert isinstance(data["total_members"], int)
        assert isinstance(data["telegram_linked"], int)
        assert isinstance(data["next_position"], int)
        assert data["next_position"] == data["total_members"] + 1

    def test_count_increments_after_register(self, session):
        before = session.get(f"{API}/stats/community").json()["total_members"]
        s = requests.Session(); s.headers.update({"Content-Type":"application/json"})
        u = _rand("statinc")
        r = s.post(f"{API}/auth/register", json={"username":u,"password":"sifre123","email":f"{u}@ex.com","phone":"+905551234567"})
        assert r.status_code == 200
        after = session.get(f"{API}/stats/community").json()["total_members"]
        assert after == before + 1


# -------- Public Profile --------
class TestUserProfile:
    def test_profile_valid_user(self, session, user_a):
        _, u = user_a
        r = session.get(f"{API}/users/{u['username']}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data and "stats" in data and "clips" in data
        prof = data["user"]
        assert prof["username"] == u["username"]
        assert "avatar_url" in prof
        assert prof.get("has_telegram") is False  # newly registered, no telegram
        # PII must NOT leak
        for forbidden in ("password_hash", "email", "phone", "telegram_id"):
            assert forbidden not in prof, f"{forbidden} leaked in profile response"
        # stats shape
        assert data["stats"]["clips_count"] == 0
        assert data["stats"]["total_votes_received"] == 0
        assert isinstance(data["clips"], list)

    def test_profile_nonexistent_user(self, session):
        r = session.get(f"{API}/users/nonexistent_xyz_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 404
        body = r.json()
        assert "bulunamadı" in (body.get("detail") or "").lower()

    def test_testuser_phase3_profile(self, session):
        r = session.get(f"{API}/users/testuser_phase3")
        # may exist (pre-seeded) or not — accept either
        if r.status_code == 200:
            data = r.json()
            assert data["user"]["username"] == "testuser_phase3"
            assert "email" not in data["user"]
            assert "phone" not in data["user"]
            assert "telegram_id" not in data["user"]


# -------- Report Clip --------
class TestReportClip:
    def test_unauth_returns_401(self, session):
        # No auth, post report
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/clips/some-id/report", json={"reason": "test reason"})
        assert r.status_code == 401

    def test_nonexistent_clip_404(self, user_a):
        s, _ = user_a
        r = s.post(f"{API}/clips/nonexistent-clip-xyz/report", json={"reason": "valid reason here"})
        assert r.status_code == 404, r.text

    def test_reason_too_short_400(self, user_a):
        s, _ = user_a
        r = s.post(f"{API}/clips/any-id/report", json={"reason": "ab"})
        assert r.status_code == 400

    def test_reason_too_long_400(self, user_a):
        s, _ = user_a
        r = s.post(f"{API}/clips/any-id/report", json={"reason": "x" * 501})
        assert r.status_code == 400

    def test_reason_empty_400(self, user_a):
        s, _ = user_a
        r = s.post(f"{API}/clips/any-id/report", json={"reason": "   "})
        assert r.status_code == 400


# -------- Report Full Flow with Seeded Clip --------
@pytest.fixture(scope="module")
def seeded_clip():
    """Insert a clip directly into DB so we can test report flow without telegram gate."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone

    async def insert():
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        c = AsyncIOMotorClient(mongo_url)
        db = c[db_name]
        clip_id = str(uuid.uuid4())
        clip_doc = {
            "id": clip_id,
            "kick_url": f"https://kick.com/svj/clips/clip_TEST_{uuid.uuid4().hex[:6]}",
            "kick_clip_id": f"clip_TEST_{uuid.uuid4().hex[:6]}",
            "title": "TEST seeded clip",
            "submitter_id": "TEST_submitter_id",
            "submitter_username": "TEST_submitter",
            "votes_count": 0,
            "week_key": "2026-W02",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.clips.insert_one(clip_doc)
        c.close()
        return clip_id

    clip_id = asyncio.get_event_loop().run_until_complete(insert())
    yield clip_id

    # cleanup
    async def cleanup():
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        c = AsyncIOMotorClient(mongo_url)
        db = c[db_name]
        await db.clips.delete_one({"id": clip_id})
        await db.reports.delete_many({"clip_id": clip_id})
        c.close()
    asyncio.get_event_loop().run_until_complete(cleanup())


class TestReportFullFlow:
    def test_successful_report(self, user_a, seeded_clip):
        s, _ = user_a
        r = s.post(f"{API}/clips/{seeded_clip}/report", json={"reason": "Uygunsuz içerik var"})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_duplicate_report_409(self, user_a, seeded_clip):
        s, _ = user_a
        # already reported in test above
        r = s.post(f"{API}/clips/{seeded_clip}/report", json={"reason": "Tekrar deniyorum"})
        assert r.status_code == 409, r.text

    def test_different_user_can_report_same_clip(self, user_b, seeded_clip):
        s, _ = user_b
        r = s.post(f"{API}/clips/{seeded_clip}/report", json={"reason": "Başka biri raporluyor"})
        assert r.status_code == 200, r.text


# -------- Regression Smoke --------
class TestRegressionSmoke:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200

    def test_clips_list(self, session):
        r = session.get(f"{API}/clips")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_auth_me_anonymous(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json() is None

    def test_login_existing_user(self, session):
        r = session.post(f"{API}/auth/login", json={"username":"testuser_phase3","password":"sifre123"})
        # accept 200 or 401 if user doesn't exist
        assert r.status_code in (200, 401)
