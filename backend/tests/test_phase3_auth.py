"""Phase 3 backend tests: auth (register/login/logout/set-password/forgot/reset), gates, indexes."""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://clips-auth-phase3.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

UNIQUE_TAG = uuid.uuid4().hex[:6]


def _uniq(prefix):
    return f"pyt_{prefix}_{UNIQUE_TAG}"


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    db.users.delete_many({"username": {"$regex": f".*{UNIQUE_TAG}.*"}})
    db.users.delete_many({"username": {"$regex": "^pyt_"}})
    db.verify_codes.delete_many({"code": {"$regex": "^PYT"}})
    db.password_reset_codes.delete_many({"code": {"$regex": "^PYT"}})


# ---------- Register ----------
class TestRegister:
    def test_register_success(self):
        s = _session()
        uname = _uniq("u1")
        r = s.post(f"{API}/auth/register", json={
            "username": uname, "password": "sifre123",
            "email": f"{uname}@test.com", "phone": "+905551112233"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["username"] == uname
        assert data["user"]["has_password"] is True
        assert "access_token" in data
        # Cookie set
        assert s.cookies.get("access_token") is not None
        # GET /me to verify persisted
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["username"] == uname

    def test_register_duplicate_username_409(self):
        s = _session()
        uname = _uniq("dup")
        payload = {"username": uname, "password": "sifre123",
                   "email": f"{uname}@t.com", "phone": "+905551112233"}
        r1 = s.post(f"{API}/auth/register", json=payload)
        assert r1.status_code == 200
        r2 = _session().post(f"{API}/auth/register", json=payload)
        assert r2.status_code == 409

    def test_register_short_password_400(self):
        r = _session().post(f"{API}/auth/register", json={
            "username": _uniq("sp"), "password": "123",
            "email": "x@y.com", "phone": "+905551112233"})
        assert r.status_code == 400

    def test_register_invalid_email_422(self):
        r = _session().post(f"{API}/auth/register", json={
            "username": _uniq("be"), "password": "sifre123",
            "email": "not-an-email", "phone": "+905551112233"})
        assert r.status_code == 422

    def test_register_invalid_phone_400(self):
        r = _session().post(f"{API}/auth/register", json={
            "username": _uniq("bp"), "password": "sifre123",
            "email": "y@z.com", "phone": "abc"})
        assert r.status_code == 400

    def test_register_invalid_username_400(self):
        r = _session().post(f"{API}/auth/register", json={
            "username": "bad name!", "password": "sifre123",
            "email": "u@v.com", "phone": "+905551112233"})
        assert r.status_code == 400


# ---------- Login ----------
class TestLogin:
    @pytest.fixture(scope="class")
    def registered_user(self):
        s = _session()
        uname = _uniq("lg")
        r = s.post(f"{API}/auth/register", json={
            "username": uname, "password": "sifre123",
            "email": f"{uname}@t.com", "phone": "+905551112233"})
        assert r.status_code == 200
        return uname

    def test_login_success(self, registered_user):
        s = _session()
        r = s.post(f"{API}/auth/login", json={"username": registered_user, "password": "sifre123"})
        assert r.status_code == 200
        assert s.cookies.get("access_token") is not None
        assert r.json()["user"]["username"] == registered_user

    def test_login_wrong_password_401(self, registered_user):
        r = _session().post(f"{API}/auth/login", json={"username": registered_user, "password": "wrongpass"})
        assert r.status_code == 401
        assert "şifre" in r.json()["detail"].lower() or "hatalı" in r.json()["detail"].lower()

    def test_login_nonexistent_user_401(self):
        r = _session().post(f"{API}/auth/login", json={"username": "nobody_xyz_999", "password": "sifre123"})
        assert r.status_code == 401


# ---------- /auth/me and logout ----------
class TestMeLogout:
    def test_me_no_auth_returns_null(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json() is None

    def test_me_with_cookie_and_logout(self):
        s = _session()
        uname = _uniq("me")
        s.post(f"{API}/auth/register", json={
            "username": uname, "password": "sifre123",
            "email": f"{uname}@t.com", "phone": "+905551112233"})
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        body = me.json()
        assert body is not None
        assert body["username"] == uname
        assert body["has_password"] is True
        assert "password_hash" not in body
        assert "missing_channels" in body
        # Logout
        lr = s.post(f"{API}/auth/logout")
        assert lr.status_code == 200
        # Clear cookies from session as well (server clears the cookie via Set-Cookie)
        s.cookies.clear()
        me2 = s.get(f"{API}/auth/me")
        assert me2.json() is None


# ---------- Set Password (legacy) ----------
class TestSetPassword:
    def test_set_password_flow(self):
        # Create a Telegram-only legacy user directly in DB
        uid = str(uuid.uuid4())
        legacy_username = _uniq("legacy")
        tg_id = f"99988{int(time.time()) % 10000}"
        db.users.insert_one({
            "id": uid,
            "username": legacy_username,
            "telegram_id": tg_id,
            "avatar_url": "https://x.com/a.png",
            "has_password": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        new_username = _uniq("newleg")
        # use legacy X-User-Id header to auth
        headers = {"X-User-Id": uid, "Content-Type": "application/json"}
        r = requests.post(f"{API}/auth/set-password", headers=headers, json={
            "username": new_username, "password": "sifre123",
            "email": f"{new_username}@t.com", "phone": "+905551112233"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["username"] == new_username
        assert body["user"]["has_password"] is True
        # Second call should fail
        r2 = requests.post(f"{API}/auth/set-password", headers=headers, json={
            "username": new_username, "password": "sifre1234",
            "email": f"{new_username}@t.com", "phone": "+905551112233"})
        assert r2.status_code == 400


# ---------- Forgot Password ----------
class TestForgotPassword:
    def test_forgot_nonexistent_returns_200_generic(self):
        r = _session().post(f"{API}/auth/forgot-password", json={"username": "nobody_xyz_999"})
        assert r.status_code == 200
        assert "instructions" in r.json()

    def test_forgot_no_telegram_400(self):
        uname = _uniq("ft")
        _session().post(f"{API}/auth/register", json={
            "username": uname, "password": "sifre123",
            "email": f"{uname}@t.com", "phone": "+905551112233"})
        r = _session().post(f"{API}/auth/forgot-password", json={"username": uname})
        assert r.status_code == 400

    def test_forgot_with_telegram_200(self):
        # create user with telegram_id directly
        uid = str(uuid.uuid4())
        uname = _uniq("ftg")
        tg_id = f"77788{int(time.time()) % 10000}"
        from bcrypt import hashpw, gensalt
        db.users.insert_one({
            "id": uid, "username": uname, "telegram_id": tg_id,
            "password_hash": hashpw(b"sifre123", gensalt()).decode(),
            "has_password": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = _session().post(f"{API}/auth/forgot-password", json={"username": uname})
        assert r.status_code == 200
        body = r.json()
        assert "sjclip_bot" in body.get("instructions", "") or body.get("telegram_bot")


# ---------- Reset Password ----------
class TestResetPassword:
    def test_reset_password_flow(self):
        uid = str(uuid.uuid4())
        uname = _uniq("rp")
        from bcrypt import hashpw, gensalt
        db.users.insert_one({
            "id": uid, "username": uname,
            "password_hash": hashpw(b"oldpass123", gensalt()).decode(),
            "telegram_id": f"55566{int(time.time()) % 10000}",
            "has_password": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        code = f"PYT{UNIQUE_TAG[:3].upper()}"[:6].ljust(6, "A")
        db.password_reset_codes.delete_many({"user_id": uid})
        db.password_reset_codes.insert_one({
            "user_id": uid, "code": code, "telegram_id": "x",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        s = _session()
        r = s.post(f"{API}/auth/reset-password", json={"code": code, "new_password": "yeni12345"})
        assert r.status_code == 200, r.text
        # login with new password
        lg = _session().post(f"{API}/auth/login", json={"username": uname, "password": "yeni12345"})
        assert lg.status_code == 200
        # code consumed
        assert db.password_reset_codes.find_one({"code": code}) is None

    def test_reset_invalid_code_404(self):
        r = _session().post(f"{API}/auth/reset-password", json={"code": "ZZZZZZ", "new_password": "yeni12345"})
        assert r.status_code == 404

    def test_reset_expired_code_410(self):
        from datetime import timedelta
        uid = str(uuid.uuid4())
        uname = _uniq("rpex")
        from bcrypt import hashpw, gensalt
        db.users.insert_one({
            "id": uid, "username": uname,
            "password_hash": hashpw(b"oldpass123", gensalt()).decode(),
            "has_password": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        old = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        code = f"PYTX{UNIQUE_TAG[:2].upper()}"[:6].ljust(6, "B")
        db.password_reset_codes.delete_many({"user_id": uid})
        db.password_reset_codes.insert_one({"user_id": uid, "code": code, "created_at": old})
        r = _session().post(f"{API}/auth/reset-password", json={"code": code, "new_password": "yeni12345"})
        assert r.status_code == 410


# ---------- Gates ----------
class TestGates:
    def test_clip_submit_no_auth_401(self):
        r = requests.post(f"{API}/clips", json={"kick_url": "https://kick.com/x/clips/clip_abc", "title": "t"})
        assert r.status_code == 401

    def test_clip_submit_no_telegram_403(self):
        s = _session()
        uname = _uniq("gate")
        s.post(f"{API}/auth/register", json={
            "username": uname, "password": "sifre123",
            "email": f"{uname}@t.com", "phone": "+905551112233"})
        r = s.post(f"{API}/clips", json={"kick_url": "https://kick.com/svj/clips/clip_test123", "title": "T"})
        assert r.status_code == 403
        detail = r.json()["detail"]
        assert detail.get("error") == "telegram_required"
        assert "missing_channels" in detail

    def test_vote_no_telegram_403(self):
        # need an existing clip; create directly in DB
        clip_id = str(uuid.uuid4())
        db.clips.insert_one({
            "id": clip_id, "kick_url": "https://kick.com/x/clips/clip_v1",
            "kick_clip_id": f"clip_v{UNIQUE_TAG}", "title": "vote test",
            "submitter_id": "x", "submitter_username": "x",
            "votes_count": 0, "week_key": "2026-W01",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        s = _session()
        uname = _uniq("vgate")
        s.post(f"{API}/auth/register", json={
            "username": uname, "password": "sifre123",
            "email": f"{uname}@t.com", "phone": "+905551112233"})
        r = s.post(f"{API}/clips/{clip_id}/vote")
        assert r.status_code == 403
        assert r.json()["detail"].get("error") == "telegram_required"
        db.clips.delete_one({"id": clip_id})


# ---------- Legacy X-User-Id ----------
class TestLegacyAuth:
    def test_xuserid_header_works(self):
        uid = str(uuid.uuid4())
        uname = _uniq("legh")
        db.users.insert_one({
            "id": uid, "username": uname, "has_password": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{API}/auth/me", headers={"X-User-Id": uid})
        assert r.status_code == 200
        assert r.json()["username"] == uname


# ---------- Indexes ----------
class TestIndexes:
    def test_users_indexes(self):
        info = db.users.index_information()
        # username unique
        uname_idx = next((v for k, v in info.items() if v.get("key") == [("username", 1)]), None)
        assert uname_idx and uname_idx.get("unique")
        # telegram_id unique with partialFilterExpression (replaces legacy sparse index)
        tg_idx = next((v for k, v in info.items() if v.get("key") == [("telegram_id", 1)]), None)
        assert tg_idx and tg_idx.get("unique")
        pfe = tg_idx.get("partialFilterExpression")
        assert pfe == {"telegram_id": {"$type": "string"}}, f"Expected partialFilterExpression, got {tg_idx}"

    def test_password_reset_code_unique(self):
        info = db.password_reset_codes.index_information()
        code_idx = next((v for k, v in info.items() if v.get("key") == [("code", 1)]), None)
        assert code_idx and code_idx.get("unique")

    def test_telegram_id_duplicate_insert_fails(self):
        tg_id = f"33344{int(time.time()) % 10000}"
        u1 = {"id": str(uuid.uuid4()), "username": _uniq("tgu1"), "telegram_id": tg_id,
              "created_at": datetime.now(timezone.utc).isoformat()}
        u2 = {"id": str(uuid.uuid4()), "username": _uniq("tgu2"), "telegram_id": tg_id,
              "created_at": datetime.now(timezone.utc).isoformat()}
        db.users.insert_one(u1)
        from pymongo.errors import DuplicateKeyError
        with pytest.raises(DuplicateKeyError):
            db.users.insert_one(u2)
