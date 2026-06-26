from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import re
import hmac
import hashlib
import logging
import secrets
import string
import httpx
import asyncio
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Streamer branding placeholder. Change this to actual streamer name later.
STREAMER_NAME = os.environ.get('STREAMER_NAME', 'CLIPSTORM')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_BOT_USERNAME = os.environ.get('TELEGRAM_BOT_USERNAME', '')
REQUIRED_CHANNELS = [c.strip() for c in os.environ.get('REQUIRED_CHANNELS', '').split(',') if c.strip()]
PUBLIC_BACKEND_URL = os.environ.get('PUBLIC_BACKEND_URL', '')
WEBHOOK_SECRET = os.environ.get('TELEGRAM_WEBHOOK_SECRET', 'changeme')
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TTL_DAYS = 30
USERNAME_REGEX = re.compile(r"^[A-Za-z0-9_]{3,30}$")
PHONE_REGEX = re.compile(r"^\+?[0-9\s\-()]{7,20}$")
# Only clips from this Kick streamer are accepted — bypasses moderation
ALLOWED_KICK_STREAMER = os.environ.get('ALLOWED_KICK_STREAMER', 'slotjack').lower()
# Public community counter: shown = real * multiplier (no static offset).
# So every real signup adds COMMUNITY_DISPLAY_MULTIPLIER to the visible counter
# in a stable, deterministic way (1 real → 4 shown, 2 real → 8 shown, ...).
COMMUNITY_DISPLAY_MULTIPLIER = int(os.environ.get('COMMUNITY_DISPLAY_MULTIPLIER', '4'))
# Admin users (comma-separated usernames). Empty by default = no admins.
ADMIN_USERNAMES = {u.strip().lower() for u in os.environ.get('ADMIN_USERNAMES', '').split(',') if u.strip()}
# Flame badge threshold: clips with this many votes in the last hour get a "hot" flag.
FLAME_VOTES_THRESHOLD = int(os.environ.get('FLAME_VOTES_THRESHOLD', '3'))
# Rate limits for voting (anti-abuse).
VOTE_PER_USER_PER_MIN = int(os.environ.get('VOTE_PER_USER_PER_MIN', '5'))
VOTE_PER_USER_PER_HOUR = int(os.environ.get('VOTE_PER_USER_PER_HOUR', '30'))
VOTE_PER_IP_PER_MIN = int(os.environ.get('VOTE_PER_IP_PER_MIN', '10'))
# Auto-flag: if a clip receives this many votes within AUTOFLAG_WINDOW_SECONDS,
# mark it for admin review (suspected bot/coordinated voting).
AUTOFLAG_VOTES_THRESHOLD = int(os.environ.get('AUTOFLAG_VOTES_THRESHOLD', '10'))
AUTOFLAG_WINDOW_SECONDS = int(os.environ.get('AUTOFLAG_WINDOW_SECONDS', '60'))

app = FastAPI(title=f"{STREAMER_NAME} Clip Voting API")
api_router = APIRouter(prefix="/api")


# ----------------- Models -----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def current_week_key() -> str:
    """ISO year-week key, e.g. 2026-W07"""
    now = datetime.now(timezone.utc)
    year, week, _ = now.isocalendar()
    return f"{year}-W{week:02d}"


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    avatar_url: Optional[str] = None
    telegram_id: Optional[str] = None
    telegram_username: Optional[str] = None
    telegram_photo_file_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    has_password: bool = False
    onboarded_at: Optional[str] = None  # set the first time telegram + channels are completed
    created_at: str = Field(default_factory=now_iso)


class UserPublic(BaseModel):
    """User shape returned to clients (no password_hash)."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    telegram_id: Optional[str] = None
    telegram_username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    has_password: bool = False
    has_completed_onboarding: bool = False
    created_at: str


class LoginRequest(BaseModel):
    username: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: EmailStr
    phone: str


class PasswordLoginRequest(BaseModel):
    username: str
    password: str


class SetPasswordRequest(BaseModel):
    """Used by Telegram-only legacy users to set username+password on first login."""
    username: str
    password: str
    email: EmailStr
    phone: str


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    code: str
    new_password: str


class Clip(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kick_url: str
    kick_clip_id: str
    kick_shard: Optional[str] = None  # 2-char hex CDN shard, discovered async
    title: str
    submitter_id: str
    submitter_username: str
    votes_count: int = 0
    week_key: str = Field(default_factory=current_week_key)
    created_at: str = Field(default_factory=now_iso)


class ClipCreate(BaseModel):
    kick_url: str
    title: str


class ClipPublic(BaseModel):
    id: str
    kick_url: str
    kick_clip_id: str
    kick_shard: Optional[str] = None
    title: str
    submitter_id: str
    submitter_username: str
    votes_count: int
    week_key: str
    created_at: str
    has_voted: bool = False
    votes_last_hour: int = 0
    is_hot: bool = False
    reactions: Dict[str, int] = Field(default_factory=dict)
    my_reaction: Optional[str] = None


REACTION_EMOJIS = ["🔥", "👏", "😂", "😱", "❤️"]


class ReactionRequest(BaseModel):
    emoji: str


# ----------------- Contest models -----------------
class Contest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    starts_at: str  # ISO 8601 UTC
    ends_at: str    # ISO 8601 UTC
    winner_clip_id: Optional[str] = None
    winner_announced_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    created_by: Optional[str] = None


class ContestCreate(BaseModel):
    name: str
    starts_at: str
    ends_at: str


class ContestUpdate(BaseModel):
    name: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class WinnerRequest(BaseModel):
    clip_id: str


class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: str
    title: str
    message: str
    link: Optional[str] = None
    read: bool = False
    created_at: str = Field(default_factory=now_iso)


# ----------------- Helpers -----------------
# Only accept clips from the allowed Kick streamer (ALLOWED_KICK_STREAMER env var).
# We do not parse arbitrary streamers — any other URL pattern returns (None, None).
def _kick_streamer_patterns(streamer: str):
    s = re.escape(streamer)
    return [
        re.compile(rf"kick\.com/@?{s}/clips/(clip_[A-Za-z0-9]+)", re.IGNORECASE),
        re.compile(rf"kick\.com/@?{s}/clip/(clip_[A-Za-z0-9]+)", re.IGNORECASE),
    ]


KICK_CLIP_PATTERNS = _kick_streamer_patterns(ALLOWED_KICK_STREAMER)


def parse_kick_clip_id(url: str) -> Optional[str]:
    """Return clip_id only if URL belongs to the allowed Kick streamer; else None."""
    if not url:
        return None
    for pattern in KICK_CLIP_PATTERNS:
        m = pattern.search(url)
        if m:
            return m.group(1)
    return None


# --- Kick CDN shard discovery -------------------------------------------------
# Kick stores clip HLS playlists at https://clips.kick.com/clips/<shard>/<clip_id>/playlist.m3u8
# where <shard> is a 2-char lowercase hex bucket assigned at clip-creation time.
# Kick's public API is region-blocked from our pod, but clips.kick.com (CloudFront)
# is freely reachable. We probe all 256 possible shards in parallel and use the
# first that returns HTTP 200. Result is cached in MongoDB on the clip document.
KICK_SHARD_ALPHABET = "0123456789abcdef"
KICK_SHARD_CANDIDATES = [a + b for a in KICK_SHARD_ALPHABET for b in KICK_SHARD_ALPHABET]


async def discover_kick_shard(clip_id: str) -> Optional[str]:
    """Probe Kick's CDN for the shard of a clip. Returns 2-char hex or None."""
    if not clip_id:
        return None
    async with httpx.AsyncClient(timeout=4.0, follow_redirects=False) as client:
        async def probe(shard: str) -> Optional[str]:
            url = f"https://clips.kick.com/clips/{shard}/{clip_id}/playlist.m3u8"
            try:
                r = await client.head(url)
                if r.status_code == 200:
                    return shard
            except Exception:
                return None
            return None

        tasks = [asyncio.create_task(probe(s)) for s in KICK_SHARD_CANDIDATES]
        try:
            for coro in asyncio.as_completed(tasks):
                shard = await coro
                if shard:
                    for t in tasks:
                        if not t.done():
                            t.cancel()
                    return shard
        finally:
            # Best-effort cleanup of any remaining tasks
            for t in tasks:
                if not t.done():
                    t.cancel()
    return None


# ----------------- Auth Helpers -----------------
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def validate_password_strength(password: str) -> Optional[str]:
    """Return error message if weak, else None."""
    if not password or len(password) < 6:
        return "Şifre en az 6 karakter olmalı"
    if len(password) > 100:
        return "Şifre çok uzun"
    return None


def validate_username(username: str) -> Optional[str]:
    if not USERNAME_REGEX.match(username):
        return "Kullanıcı adı 3-30 karakter olmalı, sadece harf, rakam ve _ içermeli"
    return None


def validate_phone(phone: str) -> Optional[str]:
    if not PHONE_REGEX.match(phone):
        return "Telefon numarası geçersiz"
    return None


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_ACCESS_TTL_DAYS),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=JWT_ACCESS_TTL_DAYS * 24 * 3600,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie("access_token", path="/", samesite="none", secure=True)


def user_to_public(doc: dict) -> dict:
    """Strip password_hash and serialise as plain dict (public-safe)."""
    pub = {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}
    pub.setdefault("has_password", bool(doc.get("password_hash")))
    pub["has_completed_onboarding"] = bool(doc.get("onboarded_at"))
    return pub


def _generate_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def get_current_user(
    request: Request,
    x_user_id: Optional[str] = Header(None),
) -> Optional[User]:
    """Resolve current user from (1) JWT cookie, (2) Authorization Bearer, (3) X-User-Id legacy header."""
    user_id: Optional[str] = None
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user_id = payload.get("sub")
        except jwt.ExpiredSignatureError:
            user_id = None
        except jwt.InvalidTokenError:
            user_id = None
    if not user_id and x_user_id:
        user_id = x_user_id
    if not user_id:
        return None
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        return None
    return User(**doc)


async def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Giriş yapmalısın")
    # Reject banned accounts on every authenticated request
    fresh = await db.users.find_one({"id": user.id}, {"_id": 0, "banned": 1, "banned_reason": 1})
    if fresh and fresh.get("banned"):
        raise HTTPException(
            status_code=403,
            detail={"error": "banned", "reason": fresh.get("banned_reason") or "Hesabın askıya alındı"},
        )
    return user


async def attach_vote_status(
    clip_dict: dict,
    user_id: Optional[str],
    hot_map: Optional[Dict[str, int]] = None,
    reactions_map: Optional[Dict[str, Dict[str, int]]] = None,
    my_reactions_map: Optional[Dict[str, str]] = None,
) -> ClipPublic:
    has_voted = False
    if user_id:
        v = await db.votes.find_one({"clip_id": clip_dict["id"], "user_id": user_id})
        has_voted = v is not None
    last_hour = (hot_map or {}).get(clip_dict["id"], 0)
    reactions = (reactions_map or {}).get(clip_dict["id"], {})
    my_reaction = (my_reactions_map or {}).get(clip_dict["id"])
    return ClipPublic(
        **clip_dict,
        has_voted=has_voted,
        votes_last_hour=last_hour,
        is_hot=last_hour >= FLAME_VOTES_THRESHOLD,
        reactions=reactions,
        my_reaction=my_reaction,
    )


async def compute_hot_map(clip_ids: List[str]) -> Dict[str, int]:
    """Single aggregation: count votes per clip in the last hour."""
    if not clip_ids:
        return {}
    hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    pipeline = [
        {"$match": {"clip_id": {"$in": clip_ids}, "created_at": {"$gte": hour_ago}}},
        {"$group": {"_id": "$clip_id", "c": {"$sum": 1}}},
    ]
    out: Dict[str, int] = {}
    async for row in db.votes.aggregate(pipeline):
        out[row["_id"]] = row["c"]
    return out


async def compute_reactions_maps(clip_ids: List[str], user_id: Optional[str]) -> tuple[Dict[str, Dict[str, int]], Dict[str, str]]:
    """Per-clip reaction counts grouped by emoji + the current user's own reaction."""
    counts: Dict[str, Dict[str, int]] = {}
    mine: Dict[str, str] = {}
    if not clip_ids:
        return counts, mine
    pipeline = [
        {"$match": {"clip_id": {"$in": clip_ids}}},
        {"$group": {"_id": {"clip_id": "$clip_id", "emoji": "$emoji"}, "c": {"$sum": 1}}},
    ]
    async for row in db.reactions.aggregate(pipeline):
        cid = row["_id"]["clip_id"]
        em = row["_id"]["emoji"]
        counts.setdefault(cid, {})[em] = row["c"]
    if user_id:
        async for r in db.reactions.find(
            {"clip_id": {"$in": clip_ids}, "user_id": user_id}, {"_id": 0, "clip_id": 1, "emoji": 1}
        ):
            mine[r["clip_id"]] = r["emoji"]
    return counts, mine


async def record_event(
    type_: str,
    actor: User,
    clip: Optional[dict] = None,
    extras: Optional[dict] = None,
) -> None:
    """Append a denormalized event to the activity feed. Failures are non-fatal."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "type": type_,
            "actor_user_id": actor.id,
            "actor_username": actor.username,
            "actor_avatar_url": actor.avatar_url,
            "created_at": now_iso(),
        }
        if clip:
            doc["clip_id"] = clip.get("id")
            doc["clip_title"] = clip.get("title")
            doc["clip_kick_clip_id"] = clip.get("kick_clip_id")
            doc["clip_submitter_username"] = clip.get("submitter_username")
        if extras:
            doc.update(extras)
        await db.events.insert_one(doc)
    except Exception as e:
        logger.warning(f"record_event failed: {e}")


def is_admin(user: Optional[User]) -> bool:
    return bool(user and user.username and user.username.lower() in ADMIN_USERNAMES)


def client_ip(request: Request) -> Optional[str]:
    """Best-effort client IP behind k8s ingress / reverse proxies.
    Prefer the first hop in X-Forwarded-For, fall back to the direct client.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip() or None
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or None
    return request.client.host if request.client else None


async def require_admin(user: User = Depends(require_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Yetkin yok")
    return user


# ----------------- Routes -----------------
@api_router.get("/")
async def root():
    return {"message": "Clip Voting API", "streamer": STREAMER_NAME}


@api_router.get("/config")
async def get_config():
    settings = await db.settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    return {
        "streamer_name": STREAMER_NAME,
        "current_week_key": current_week_key(),
        "telegram_bot_username": TELEGRAM_BOT_USERNAME,
        "required_channels": REQUIRED_CHANNELS,
        "prize_amount": settings.get("prize_amount", ""),
        "prize_description": settings.get("prize_description", ""),
    }


class SettingsUpdate(BaseModel):
    prize_amount: Optional[str] = None
    prize_description: Optional[str] = None


@api_router.get("/admin/settings")
async def admin_get_settings(user: User = Depends(require_admin)):
    doc = await db.settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    return {
        "prize_amount": doc.get("prize_amount", ""),
        "prize_description": doc.get("prize_description", ""),
    }


@api_router.put("/admin/settings")
async def admin_update_settings(payload: SettingsUpdate, user: User = Depends(require_admin)):
    update: Dict[str, Any] = {}
    if payload.prize_amount is not None:
        if len(payload.prize_amount) > 60:
            raise HTTPException(status_code=400, detail="Ödül miktarı 60 karakteri geçemez")
        update["prize_amount"] = payload.prize_amount.strip()
    if payload.prize_description is not None:
        if len(payload.prize_description) > 240:
            raise HTTPException(status_code=400, detail="Açıklama 240 karakteri geçemez")
        update["prize_description"] = payload.prize_description.strip()
    if not update:
        raise HTTPException(status_code=400, detail="Güncellenecek alan yok")
    update["updated_at"] = now_iso()
    update["updated_by"] = user.username
    await db.settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    doc = await db.settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    return {
        "prize_amount": doc.get("prize_amount", ""),
        "prize_description": doc.get("prize_description", ""),
    }


def verify_telegram_hash(data: Dict[str, Any]) -> bool:
    """Verify Telegram Login Widget data using HMAC-SHA256."""
    if not TELEGRAM_BOT_TOKEN:
        return False
    received_hash = data.get("hash")
    if not received_hash:
        return False
    check_pairs = []
    for k in sorted(data.keys()):
        if k == "hash":
            continue
        check_pairs.append(f"{k}={data[k]}")
    data_check_string = "\n".join(check_pairs)
    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, received_hash)


async def check_channel_membership(telegram_user_id: int) -> List[str]:
    """Return list of channels the user is NOT a member of. Empty list = full member.
    If the bot itself is not a member/admin of a channel, skip that channel (cannot verify).
    """
    if not TELEGRAM_BOT_TOKEN or not REQUIRED_CHANNELS:
        return []
    missing = []
    # discover bot's own id (cache via module-level optimisation not added for simplicity)
    bot_id = None
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            me = await client.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe")
            if me.json().get("ok"):
                bot_id = me.json()["result"]["id"]
        except Exception:
            pass
        for ch in REQUIRED_CHANNELS:
            # check bot's own membership first; if bot isn't there, we can't verify — skip
            try:
                if bot_id:
                    br = await client.get(
                        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getChatMember",
                        params={"chat_id": ch, "user_id": bot_id},
                    )
                    bdata = br.json()
                    bstatus = (bdata.get("result") or {}).get("status") if bdata.get("ok") else None
                    if bstatus not in ("creator", "administrator", "member"):
                        logger.warning(f"Bot is not a member/admin of {ch} (status={bstatus}); skipping check")
                        continue
                resp = await client.get(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getChatMember",
                    params={"chat_id": ch, "user_id": telegram_user_id},
                )
                data = resp.json()
                if not data.get("ok"):
                    logger.warning(f"getChatMember failed for {ch}: {data}")
                    # Can't verify — skip rather than wrongly blocking
                    continue
                status = data["result"].get("status", "left")
                if status not in ("creator", "administrator", "member"):
                    missing.append(ch)
            except Exception as e:
                logger.warning(f"getChatMember error for {ch}: {e}")
                continue
    return missing


class TelegramAuthData(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


@api_router.post("/auth/telegram")
async def telegram_auth(payload: TelegramAuthData, response: Response):
    data = payload.model_dump(exclude_none=True)
    if not verify_telegram_hash(data):
        raise HTTPException(status_code=401, detail="Telegram doğrulaması başarısız")
    telegram_id = str(payload.id)
    username = payload.username or f"tg_{telegram_id}"
    existing = await db.users.find_one({"telegram_id": telegram_id}, {"_id": 0})
    if existing:
        user_doc = existing
    else:
        # ensure unique username
        base = username
        suffix = 0
        while await db.users.find_one({"username": username}, {"_id": 0}):
            suffix += 1
            username = f"{base}_{suffix}"
        user_obj = User(
            username=username,
            telegram_id=telegram_id,
            avatar_url=payload.photo_url or f"https://api.dicebear.com/7.x/identicon/svg?seed={username}&backgroundColor=53FC18,0A0A0A",
        )
        try:
            await db.users.insert_one(user_obj.model_dump(exclude_none=True))
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="Bu Telegram hesabı zaten başka bir kullanıcıya bağlı")
        user_doc = user_obj.model_dump()
    missing = await check_channel_membership(payload.id)
    token = create_access_token(user_doc["id"])
    set_auth_cookie(response, token)
    return {
        "user": user_to_public(user_doc),
        "missing_channels": missing,
        "needs_password_setup": not bool(user_doc.get("password_hash")),
        "access_token": token,
    }


class VerifyCodeRequest(BaseModel):
    code: str


@api_router.post("/telegram/webhook/{secret}")
async def telegram_webhook(secret: str, payload: Dict[str, Any]):
    if secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    message = payload.get("message") or {}
    text = (message.get("text") or "").strip()
    from_user = message.get("from") or {}
    chat_id = (message.get("chat") or {}).get("id")
    if not chat_id or not from_user.get("id"):
        return {"ok": True}
    tg_id = from_user["id"]
    tg_username = from_user.get("username")
    tg_first = from_user.get("first_name") or "Kullanıcı"
    if text.startswith("/reset"):
        # Password reset code: only for users who already linked Telegram + set password
        existing_user = await db.users.find_one({"telegram_id": str(tg_id)}, {"_id": 0})
        if not existing_user:
            reply_text = (
                "Bu Telegram hesabı henüz siteye bağlı değil. "
                "Önce siteden Telegram ile giriş yap, ardından şifre belirle."
            )
        elif not existing_user.get("password_hash"):
            reply_text = (
                "Bu hesabın henüz şifresi yok. Siteye Telegram ile giriş yapıp şifre belirleyebilirsin."
            )
        else:
            code = _generate_code()
            await db.password_reset_codes.update_one(
                {"user_id": existing_user["id"]},
                {"$set": {
                    "user_id": existing_user["id"],
                    "code": code,
                    "telegram_id": str(tg_id),
                    "created_at": now_iso(),
                }},
                upsert=True,
            )
            reply_text = (
                f"Şifre sıfırlama kodun:\n\n"
                f"`{code}`\n\n"
                f"Siteye gidip 'Şifremi Unuttum' ekranına bu kodu ve yeni şifreni gir. "
                f"Kod 15 dakika geçerli."
            )
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": reply_text, "parse_mode": "Markdown"},
            )
        return {"ok": True}
    if text.startswith("/start"):
        # Try to fetch user's largest profile photo file_id
        photo_file_id = None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                pr = await client.get(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUserProfilePhotos",
                    params={"user_id": tg_id, "limit": 1},
                )
                pdata = pr.json()
                if pdata.get("ok") and pdata["result"].get("total_count", 0) > 0:
                    sizes = pdata["result"]["photos"][0]
                    photo_file_id = sizes[-1]["file_id"]
        except Exception as e:
            logger.warning(f"getUserProfilePhotos failed: {e}")
        # generate fresh code, replace any prior code for this user
        code = _generate_code()
        await db.verify_codes.update_one(
            {"telegram_id": str(tg_id)},
            {"$set": {
                "code": code,
                "telegram_id": str(tg_id),
                "telegram_username": tg_username,
                "first_name": tg_first,
                "photo_file_id": photo_file_id,
                "created_at": now_iso(),
            }},
            upsert=True,
        )
        reply = (
            f"Selam {tg_first}! 👋\n\n"
            f"Doğrulama kodun:\n\n"
            f"`{code}`\n\n"
            f"Bu kodu siteye girip 'Doğrula' butonuna bas. "
            f"Kod 15 dakika geçerli."
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": reply, "parse_mode": "Markdown"},
            )
    return {"ok": True}


@api_router.post("/auth/verify-code")
async def verify_code(req: VerifyCodeRequest, response: Response, current: Optional[User] = Depends(get_current_user)):
    code = req.code.strip().upper()
    if len(code) != 6:
        raise HTTPException(status_code=400, detail="Kod 6 karakter olmalı")
    entry = await db.verify_codes.find_one({"code": code}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Kod bulunamadı veya süresi doldu")
    # TTL check
    created = datetime.fromisoformat(entry["created_at"])
    age_min = (datetime.now(timezone.utc) - created).total_seconds() / 60
    if age_min > 15:
        await db.verify_codes.delete_one({"code": code})
        raise HTTPException(status_code=410, detail="Kodun süresi doldu, bota tekrar /start gönder")
    tg_id = entry["telegram_id"]
    # PERMANENT link logic: if current user is authenticated and trying to link, ensure no conflict
    existing_with_tg = await db.users.find_one({"telegram_id": tg_id}, {"_id": 0})
    if current is not None:
        # Linking flow: existing logged-in user wants to bind Telegram
        if existing_with_tg and existing_with_tg["id"] != current.id:
            raise HTTPException(
                status_code=409,
                detail="Bu Telegram hesabı zaten başka bir kullanıcıya bağlı. Telegram bağlantısı kalıcıdır.",
            )
        if current.telegram_id and current.telegram_id != tg_id:
            raise HTTPException(
                status_code=409,
                detail="Hesabın zaten farklı bir Telegram'a bağlı. Telegram bağlantısı kalıcı olduğu için değiştirilemez.",
            )
        # Bind telegram to current user (permanent)
        update_set: Dict[str, Any] = {"telegram_id": tg_id}
        if entry.get("photo_file_id"):
            update_set["telegram_photo_file_id"] = entry["photo_file_id"]
        await db.users.update_one({"id": current.id}, {"$set": update_set})
        user_doc = await db.users.find_one({"id": current.id}, {"_id": 0})
    else:
        # Login flow: no current user, look up or create user via telegram_id
        if existing_with_tg:
            user_doc = existing_with_tg
        else:
            base = entry.get("telegram_username") or f"tg_{tg_id}"
            username = base
            suffix = 0
            while await db.users.find_one({"username": username}, {"_id": 0}):
                suffix += 1
                username = f"{base}_{suffix}"
            user_obj = User(
                username=username,
                telegram_id=tg_id,
                telegram_photo_file_id=entry.get("photo_file_id"),
                avatar_url=f"https://api.dicebear.com/7.x/identicon/svg?seed={username}&backgroundColor=53FC18,0A0A0A",
            )
            try:
                await db.users.insert_one(user_obj.model_dump(exclude_none=True))
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="Bu Telegram hesabı zaten başka bir kullanıcıya bağlı")
            user_doc = user_obj.model_dump()
    # consume the code
    await db.verify_codes.delete_one({"code": code})
    missing = await check_channel_membership(int(tg_id))
    token = create_access_token(user_doc["id"])
    set_auth_cookie(response, token)
    return {
        "user": user_to_public(user_doc),
        "missing_channels": missing,
        "needs_password_setup": not bool(user_doc.get("password_hash")),
        "access_token": token,
    }


async def refresh_telegram_username(telegram_id: str) -> Optional[str]:
    """Fetch current Telegram public username via bot.getChat. Returns None if
    user has no public @ handle or if the API fails."""
    if not TELEGRAM_BOT_TOKEN or not telegram_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getChat",
                params={"chat_id": telegram_id},
            )
            data = r.json()
            if data.get("ok"):
                return data["result"].get("username") or None
    except Exception as e:
        logger.warning(f"getChat failed for {telegram_id}: {e}")
    return None


@api_router.get("/auth/check-channels")
async def check_channels(user: User = Depends(require_user)):
    if not user.telegram_id:
        return {"missing_channels": REQUIRED_CHANNELS, "telegram_linked": False}
    missing = await check_channel_membership(int(user.telegram_id))
    update: Dict[str, Any] = {}
    if not missing and not user.onboarded_at:
        # First time the user has both telegram + all channels — mark onboarded.
        update["onboarded_at"] = now_iso()
    # Opportunistically refresh telegram_username if missing or stale
    if not user.telegram_username:
        fresh = await refresh_telegram_username(user.telegram_id)
        if fresh:
            update["telegram_username"] = fresh
    if update:
        await db.users.update_one({"id": user.id}, {"$set": update})
    return {"missing_channels": missing, "telegram_linked": True}


DEFAULT_AVATARS = [
    {"id": f"default:{i}", "url": f"https://api.dicebear.com/7.x/{style}/svg?seed=svj{i}&backgroundColor=53FC18,0A0A0A,1A1A1A,121212"}
    for i, style in enumerate([
        "bottts-neutral", "bottts", "shapes", "rings", "thumbs", "fun-emoji", "icons", "identicon"
    ])
]


@api_router.get("/avatars/defaults")
async def list_default_avatars():
    return {"avatars": DEFAULT_AVATARS}


class AvatarUpdate(BaseModel):
    avatar_id: str  # "telegram" or "default:N"


@api_router.post("/user/avatar", response_model=User)
async def update_avatar(payload: AvatarUpdate, user: User = Depends(require_user)):
    if payload.avatar_id == "telegram":
        doc = await db.users.find_one({"id": user.id}, {"_id": 0})
        if not doc or not doc.get("telegram_photo_file_id"):
            raise HTTPException(status_code=400, detail="Telegram fotoğrafı bulunamadı")
        new_avatar = f"{PUBLIC_BACKEND_URL}/api/avatar/{user.id}.jpg"
    else:
        match = next((a for a in DEFAULT_AVATARS if a["id"] == payload.avatar_id), None)
        if not match:
            raise HTTPException(status_code=404, detail="Avatar bulunamadı")
        new_avatar = match["url"]
    await db.users.update_one({"id": user.id}, {"$set": {"avatar_url": new_avatar}})
    updated = await db.users.find_one({"id": user.id}, {"_id": 0})
    return User(**updated)


@api_router.get("/avatar/{user_id_with_ext}")
async def proxy_telegram_avatar(user_id_with_ext: str):
    from fastapi.responses import Response
    user_id = user_id_with_ext.split(".")[0]
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "telegram_photo_file_id": 1})
    if not doc or not doc.get("telegram_photo_file_id"):
        raise HTTPException(status_code=404, detail="No avatar")
    file_id = doc["telegram_photo_file_id"]
    async with httpx.AsyncClient(timeout=15.0) as client:
        fr = await client.get(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile",
            params={"file_id": file_id},
        )
        fdata = fr.json()
        if not fdata.get("ok"):
            raise HTTPException(status_code=502, detail="Telegram getFile failed")
        file_path = fdata["result"]["file_path"]
        ir = await client.get(f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}")
    return Response(content=ir.content, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


# placeholder to keep file order — original below is the original endpoint
async def _placeholder_check_channels_marker():
    pass


@api_router.post("/auth/mock-login", response_model=User)
async def mock_login(req: LoginRequest):
    username = req.username.strip()
    if not username or len(username) < 2 or len(username) > 30:
        raise HTTPException(status_code=400, detail="Username must be 2-30 characters")
    existing = await db.users.find_one({"username": username}, {"_id": 0})
    if existing:
        return User(**existing)
    avatar = f"https://api.dicebear.com/7.x/identicon/svg?seed={username}&backgroundColor=53FC18,0A0A0A"
    user = User(username=username, avatar_url=avatar)
    await db.users.insert_one(user.model_dump(exclude_none=True))
    return user


@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    username = req.username.strip()
    err = validate_username(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    err = validate_password_strength(req.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    err = validate_phone(req.phone)
    if err:
        raise HTTPException(status_code=400, detail=err)
    existing = await db.users.find_one({"username": username}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten alınmış")
    user_obj = User(
        username=username,
        email=req.email.lower(),
        phone=req.phone.strip(),
        has_password=True,
        avatar_url=f"https://api.dicebear.com/7.x/identicon/svg?seed={username}&backgroundColor=53FC18,0A0A0A",
    )
    doc = user_obj.model_dump(exclude_none=True)
    doc["password_hash"] = hash_password(req.password)
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError as e:
        key = (getattr(e, "details", {}) or {}).get("keyPattern", {})
        if "username" in key:
            raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten alınmış")
        if "telegram_id" in key:
            raise HTTPException(status_code=409, detail="Bu Telegram hesabı zaten başka bir kullanıcıya bağlı")
        raise HTTPException(status_code=409, detail="Kayıt çakışması")
    token = create_access_token(user_obj.id)
    set_auth_cookie(response, token)
    return {"user": user_to_public(doc), "access_token": token, "missing_channels": REQUIRED_CHANNELS, "needs_password_setup": False}


@api_router.post("/auth/login")
async def password_login(req: PasswordLoginRequest, response: Response):
    username = req.username.strip()
    doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not doc or not doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    if not verify_password(req.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    missing = []
    if doc.get("telegram_id"):
        try:
            missing = await check_channel_membership(int(doc["telegram_id"]))
        except Exception:
            missing = []
    token = create_access_token(doc["id"])
    set_auth_cookie(response, token)
    return {
        "user": user_to_public(doc),
        "access_token": token,
        "missing_channels": missing,
        "needs_password_setup": False,
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@api_router.post("/auth/set-password")
async def set_password(req: SetPasswordRequest, user: User = Depends(require_user)):
    """First-time username+password setup for legacy Telegram-only users.
    User must be already authenticated (via Telegram session). The username can be
    changed only if user has no password yet (i.e. first-time setup).
    """
    doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if doc.get("password_hash"):
        raise HTTPException(status_code=400, detail="Bu hesap zaten şifreye sahip. Şifre değiştirmek için Şifremi Unuttum kullan.")
    new_username = req.username.strip()
    err = validate_username(new_username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    err = validate_password_strength(req.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    err = validate_phone(req.phone)
    if err:
        raise HTTPException(status_code=400, detail=err)
    if new_username != doc["username"]:
        clash = await db.users.find_one({"username": new_username}, {"_id": 0})
        if clash:
            raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten alınmış")
    await db.users.update_one(
        {"id": user.id},
        {"$set": {
            "username": new_username,
            "email": req.email.lower(),
            "phone": req.phone.strip(),
            "password_hash": hash_password(req.password),
            "has_password": True,
        }},
    )
    updated = await db.users.find_one({"id": user.id}, {"_id": 0})
    return {"user": user_to_public(updated), "ok": True}


@api_router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Tells user how to obtain a reset code via Telegram bot."""
    username = req.username.strip()
    doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not doc:
        # Don't reveal whether the user exists
        return {
            "ok": True,
            "telegram_bot": TELEGRAM_BOT_USERNAME,
            "instructions": f"Eğer @{TELEGRAM_BOT_USERNAME} bota /reset gönderirsen ve hesabın bağlıysa, sıfırlama kodu alacaksın.",
        }
    if not doc.get("telegram_id"):
        raise HTTPException(
            status_code=400,
            detail="Bu hesap Telegram'a bağlı değil. Şifre sıfırlama yapılamaz.",
        )
    return {
        "ok": True,
        "telegram_bot": TELEGRAM_BOT_USERNAME,
        "instructions": f"Telegram'da @{TELEGRAM_BOT_USERNAME} botuna /reset komutu gönder. Bot 6 haneli kod yollayacak, kodu ve yeni şifreni buraya gir.",
    }


@api_router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest, response: Response):
    code = req.code.strip().upper()
    if len(code) != 6:
        raise HTTPException(status_code=400, detail="Kod 6 karakter olmalı")
    err = validate_password_strength(req.new_password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    entry = await db.password_reset_codes.find_one({"code": code}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Kod bulunamadı veya süresi doldu")
    created = datetime.fromisoformat(entry["created_at"])
    age_min = (datetime.now(timezone.utc) - created).total_seconds() / 60
    if age_min > 15:
        await db.password_reset_codes.delete_one({"code": code})
        raise HTTPException(status_code=410, detail="Kodun süresi doldu, bota tekrar /reset gönder")
    user_id = entry["user_id"]
    new_hash = hash_password(req.new_password)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": new_hash, "has_password": True}})
    await db.password_reset_codes.delete_one({"code": code})
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    token = create_access_token(user_id)
    set_auth_cookie(response, token)
    return {"user": user_to_public(doc), "access_token": token, "ok": True}


@api_router.get("/auth/me")
async def me(user: Optional[User] = Depends(get_current_user)):
    if user is None:
        return None
    doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    if not doc:
        return None
    pub = user_to_public(doc)
    # also include missing_channels for live gating
    missing = []
    if doc.get("telegram_id"):
        try:
            missing = await check_channel_membership(int(doc["telegram_id"]))
        except Exception:
            missing = []
    pub["missing_channels"] = missing
    pub["needs_password_setup"] = not bool(doc.get("password_hash"))
    pub["is_admin"] = is_admin(User(**doc))
    return pub


@api_router.post("/clips", response_model=ClipPublic)
async def submit_clip(payload: ClipCreate, user: User = Depends(require_user)):
    # 1) Validate the URL belongs to the allowed Kick streamer BEFORE the gate so users get clear feedback
    clip_id = parse_kick_clip_id(payload.kick_url)
    if not clip_id:
        raise HTTPException(
            status_code=400,
            detail=f"Sadece @{ALLOWED_KICK_STREAMER} klipleri kabul edilir. Beklenen format: https://kick.com/{ALLOWED_KICK_STREAMER}/clips/clip_XXXX",
        )
    title = payload.title.strip()
    if not title or len(title) > 120:
        raise HTTPException(status_code=400, detail="Başlık 1-120 karakter olmalı")
    # 2) Gate: must be linked to Telegram AND member of all required channels
    if REQUIRED_CHANNELS:
        if not user.telegram_id:
            raise HTTPException(status_code=403, detail={"error": "telegram_required", "missing_channels": REQUIRED_CHANNELS})
        missing = await check_channel_membership(int(user.telegram_id))
        if missing:
            raise HTTPException(status_code=403, detail={"error": "missing_channels", "missing_channels": missing})
    # 3) De-dup
    existing = await db.clips.find_one({"kick_clip_id": clip_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Bu klip daha önce gönderilmiş")
    # 4) Resolve CDN shard so the frontend can stream HLS in-page.
    # Discovery is best-effort (clips.kick.com is reachable from our pod region).
    try:
        shard = await asyncio.wait_for(discover_kick_shard(clip_id), timeout=8.0)
    except asyncio.TimeoutError:
        shard = None
    except Exception:
        shard = None
    clip = Clip(
        kick_url=payload.kick_url.strip(),
        kick_clip_id=clip_id,
        kick_shard=shard,
        title=title,
        submitter_id=user.id,
        submitter_username=user.username,
    )
    await db.clips.insert_one(clip.model_dump())
    clip_doc = clip.model_dump()
    await record_event("clip_submitted", user, clip_doc)
    return await attach_vote_status(clip_doc, user.id)


@api_router.post("/clips/{clip_id}/resolve-shard", response_model=ClipPublic)
async def resolve_clip_shard(clip_id: str, user: Optional[User] = Depends(get_current_user)):
    """Lazy-discover the CDN shard for an existing clip (for clips submitted
    before shard discovery existed, or where prior discovery failed). Safe to
    call without auth: it only mutates a derived public field."""
    doc = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    if doc.get("kick_shard"):
        return await attach_vote_status(doc, user.id if user else None)
    shard = None
    try:
        shard = await asyncio.wait_for(discover_kick_shard(doc["kick_clip_id"]), timeout=8.0)
    except Exception:
        shard = None
    if shard:
        await db.clips.update_one({"id": clip_id}, {"$set": {"kick_shard": shard}})
        doc["kick_shard"] = shard
    return await attach_vote_status(doc, user.id if user else None)


@api_router.get("/clips", response_model=List[ClipPublic])
async def list_clips(
    sort: str = "top",
    week: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user),
):
    query = {}
    if week:
        query["week_key"] = week
    sort_field = [("votes_count", -1), ("created_at", -1)] if sort == "top" else [("created_at", -1)]
    cursor = db.clips.find(query, {"_id": 0}).sort(sort_field).limit(100)
    docs = await cursor.to_list(100)
    uid = user.id if user else None
    cids = [d["id"] for d in docs]
    hot_map = await compute_hot_map(cids)
    rx_map, my_rx = await compute_reactions_maps(cids, uid)
    return [await attach_vote_status(d, uid, hot_map, rx_map, my_rx) for d in docs]


@api_router.get("/clips/{clip_id}", response_model=ClipPublic)
async def get_clip(clip_id: str, user: Optional[User] = Depends(get_current_user)):
    doc = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Clip not found")
    uid = user.id if user else None
    hot_map = await compute_hot_map([doc["id"]])
    rx_map, my_rx = await compute_reactions_maps([doc["id"]], uid)
    return await attach_vote_status(doc, uid, hot_map, rx_map, my_rx)


@api_router.delete("/clips/{clip_id}")
async def delete_clip(clip_id: str, user: User = Depends(require_user)):
    """Owner or admin can delete a clip. Cascades to votes + reports."""
    doc = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    if doc.get("submitter_id") != user.id and not is_admin(user):
        raise HTTPException(status_code=403, detail="Sadece klibin sahibi veya yöneticiler silebilir")
    await db.clips.delete_one({"id": clip_id})
    await db.votes.delete_many({"clip_id": clip_id})
    # Auto-resolve any open reports for this clip
    await db.reports.update_many(
        {"clip_id": clip_id, "status": "open"},
        {"$set": {"status": "resolved", "resolution": "clip_deleted", "resolved_at": now_iso(), "resolved_by": user.id}},
    )
    return {"ok": True}


# ----------------- Contest helpers -----------------
def _parse_iso(s: str) -> datetime:
    """Parse ISO 8601 string (with or without timezone) into UTC datetime."""
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def get_active_contest() -> Optional[Dict[str, Any]]:
    """Return the contest whose [starts_at, ends_at) window contains now (UTC).
    If multiple overlap, the most recently created wins."""
    now = datetime.now(timezone.utc).isoformat()
    doc = await db.contests.find_one(
        {"starts_at": {"$lte": now}, "ends_at": {"$gt": now}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    return doc


async def get_latest_contest() -> Optional[Dict[str, Any]]:
    """Latest contest by created_at — used as "previous contest" when none active."""
    return await db.contests.find_one({}, {"_id": 0}, sort=[("created_at", -1)])


@api_router.get("/contests/active")
async def public_active_contest():
    """Public: returns the active contest + status. Status values:
    - 'active'      : currently voting open
    - 'ended'       : window closed, no new contest yet (votes blocked, banner shown)
    - 'no_contest'  : no contest ever scheduled
    If a winner clip is announced (either on the active or latest contest), it is
    included so the homepage can show the "Bu Haftanın Kazananı" hero.
    """
    active = await get_active_contest()
    latest = await get_latest_contest()
    status_ = "no_contest"
    contest = None
    if active:
        contest = active
        status_ = "active"
    elif latest:
        contest = latest
        status_ = "ended"
    winner_clip = None
    if contest and contest.get("winner_clip_id"):
        c = await db.clips.find_one({"id": contest["winner_clip_id"]}, {"_id": 0})
        if c:
            winner_clip = await attach_vote_status(c, None)
    return {
        "status": status_,
        "contest": contest,
        "winner_clip": winner_clip.model_dump() if winner_clip else None,
    }


@api_router.get("/admin/contests")
async def admin_list_contests(admin: User = Depends(require_admin)):
    items = await db.contests.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(length=200)
    return {"items": items}


@api_router.post("/admin/contests")
async def admin_create_contest(payload: ContestCreate, admin: User = Depends(require_admin)):
    try:
        starts = _parse_iso(payload.starts_at)
        ends = _parse_iso(payload.ends_at)
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    if ends <= starts:
        raise HTTPException(status_code=400, detail="Bitiş başlangıçtan sonra olmalı")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="İsim boş olamaz")
    c = Contest(
        name=payload.name.strip()[:80],
        starts_at=starts.isoformat(),
        ends_at=ends.isoformat(),
        created_by=admin.username,
    )
    await db.contests.insert_one(c.model_dump())
    return c.model_dump()


@api_router.put("/admin/contests/{contest_id}")
async def admin_update_contest(contest_id: str, payload: ContestUpdate, admin: User = Depends(require_admin)):
    doc = await db.contests.find_one({"id": contest_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    update: Dict[str, Any] = {}
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="İsim boş olamaz")
        update["name"] = payload.name.strip()[:80]
    if payload.starts_at is not None:
        try:
            update["starts_at"] = _parse_iso(payload.starts_at).isoformat()
        except Exception:
            raise HTTPException(status_code=400, detail="Geçersiz başlangıç tarihi")
    if payload.ends_at is not None:
        try:
            update["ends_at"] = _parse_iso(payload.ends_at).isoformat()
        except Exception:
            raise HTTPException(status_code=400, detail="Geçersiz bitiş tarihi")
    starts = _parse_iso(update.get("starts_at", doc["starts_at"]))
    ends = _parse_iso(update.get("ends_at", doc["ends_at"]))
    if ends <= starts:
        raise HTTPException(status_code=400, detail="Bitiş başlangıçtan sonra olmalı")
    await db.contests.update_one({"id": contest_id}, {"$set": update})
    doc = await db.contests.find_one({"id": contest_id}, {"_id": 0})
    return doc


@api_router.delete("/admin/contests/{contest_id}")
async def admin_delete_contest(contest_id: str, admin: User = Depends(require_admin)):
    res = await db.contests.delete_one({"id": contest_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    return {"ok": True}


@api_router.get("/admin/contests/{contest_id}/top-clips")
async def admin_contest_top_clips(contest_id: str, limit: int = 20, admin: User = Depends(require_admin)):
    """Top-voted clips overall. We don't filter by the contest's submission
    window because (a) admins should be able to pick any meaningful clip as
    the winner and (b) the contest window is enforced for voting, not
    submission."""
    doc = await db.contests.find_one({"id": contest_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    limit = max(1, min(50, limit))
    cursor = db.clips.find({}, {"_id": 0}).sort(
        [("votes_count", -1), ("created_at", -1)]
    ).limit(limit)
    return {"items": await cursor.to_list(length=limit)}


@api_router.post("/admin/contests/{contest_id}/winner")
async def admin_set_winner(contest_id: str, payload: WinnerRequest, admin: User = Depends(require_admin)):
    contest = await db.contests.find_one({"id": contest_id}, {"_id": 0})
    if not contest:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    clip = await db.clips.find_one({"id": payload.clip_id}, {"_id": 0})
    if not clip:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    announced_at = now_iso()
    await db.contests.update_one(
        {"id": contest_id},
        {"$set": {"winner_clip_id": payload.clip_id, "winner_announced_at": announced_at}},
    )
    # Broadcast notification to every registered user
    user_ids = [u["id"] async for u in db.users.find({}, {"_id": 0, "id": 1})]
    if user_ids:
        notifs = [
            Notification(
                user_id=uid,
                type="winner_announced",
                title="Bu haftanın kazananı açıklandı!",
                message=f"\"{clip.get('title','')}\" — @{clip.get('submitter_username','')} tarafından",
                link=f"/clip/{payload.clip_id}",
            ).model_dump()
            for uid in user_ids
        ]
        await db.notifications.insert_many(notifs)
    return {"ok": True, "winner_clip_id": payload.clip_id, "winner_announced_at": announced_at}


class BroadcastRequest(BaseModel):
    title: str
    message: str
    link: Optional[str] = None


@api_router.post("/admin/notifications/broadcast")
async def admin_broadcast_notification(payload: BroadcastRequest, admin: User = Depends(require_admin)):
    """Send a custom notification to every registered user."""
    title = payload.title.strip()
    message = payload.message.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Başlık boş olamaz")
    if not message:
        raise HTTPException(status_code=400, detail="Mesaj boş olamaz")
    if len(title) > 120:
        raise HTTPException(status_code=400, detail="Başlık 120 karakteri geçemez")
    if len(message) > 500:
        raise HTTPException(status_code=400, detail="Mesaj 500 karakteri geçemez")
    user_ids = [u["id"] async for u in db.users.find({}, {"_id": 0, "id": 1})]
    if not user_ids:
        return {"ok": True, "sent": 0}
    notifs = [
        Notification(
            user_id=uid,
            type="admin_broadcast",
            title=title,
            message=message,
            link=payload.link or None,
        ).model_dump()
        for uid in user_ids
    ]
    await db.notifications.insert_many(notifs)
    return {"ok": True, "sent": len(notifs)}


# ----------------- Notifications -----------------
@api_router.get("/notifications/me")
async def my_notifications(unread_only: bool = False, user: User = Depends(require_user)):
    q: Dict[str, Any] = {"user_id": user.id}
    if unread_only:
        q["read"] = False
    items = await db.notifications.find(q, {"_id": 0}).sort([("created_at", -1)]).limit(50).to_list(length=50)
    unread = await db.notifications.count_documents({"user_id": user.id, "read": False})
    return {"items": items, "unread": unread}


@api_router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user: User = Depends(require_user)):
    res = await db.notifications.update_one(
        {"id": notif_id, "user_id": user.id}, {"$set": {"read": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bildirim bulunamadı")
    return {"ok": True}


@api_router.post("/notifications/me/read-all")
async def mark_all_notifications_read(user: User = Depends(require_user)):
    await db.notifications.update_many(
        {"user_id": user.id, "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True}


@api_router.post("/clips/{clip_id}/vote", response_model=ClipPublic)
async def vote_clip(clip_id: str, request: Request, user: User = Depends(require_user)):
    """Cast a vote. Hardened against:
    - duplicate votes (unique index + atomic try/except)
    - self-voting
    - votes on past-week clips (only current week is voteable)
    - votes from accounts without Telegram + required channels
    - rate-limited per-user (5/min, 30/hr) and per-IP (10/min)
    - auto-flags clips that receive 10+ votes within 60s (suspected coordinated voting)
    """
    # Contest gate: there must be an ACTIVE contest right now. Outside the
    # configured window (or when no contest is scheduled) all new votes are
    # rejected with HTTP 423 so the frontend can show the "Etkinlik kapalı"
    # banner instead of the vote button.
    active_contest = await get_active_contest()
    if not active_contest:
        raise HTTPException(
            status_code=423,
            detail={
                "error": "contest_closed",
                "message": "Etkinlik süresi doldu. Yeni etkinlik açılınca oy verebilirsin.",
            },
        )
    if REQUIRED_CHANNELS:
        if not user.telegram_id:
            raise HTTPException(status_code=403, detail={"error": "telegram_required", "missing_channels": REQUIRED_CHANNELS})
        missing = await check_channel_membership(int(user.telegram_id))
        if missing:
            raise HTTPException(status_code=403, detail={"error": "missing_channels", "missing_channels": missing})
    doc = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    # Self-vote guard
    if doc.get("submitter_id") == user.id:
        raise HTTPException(status_code=403, detail="Kendi klibine oy veremezsin")
    # Week gate: only this week's clips can be voted on (contest integrity)
    if doc.get("week_key") != current_week_key():
        raise HTTPException(status_code=403, detail="Sadece bu haftaki kliplere oy verilebilir")
    # ---- Rate limit checks (per-user + per-IP) ----
    ip = client_ip(request)
    now = datetime.now(timezone.utc)
    iso_minute_ago = (now - timedelta(seconds=60)).isoformat()
    iso_hour_ago = (now - timedelta(seconds=3600)).isoformat()
    user_recent_min = await db.votes.count_documents({"user_id": user.id, "created_at": {"$gte": iso_minute_ago}})
    if user_recent_min >= VOTE_PER_USER_PER_MIN:
        raise HTTPException(status_code=429, detail=f"Çok hızlı oy veriyorsun. Dakikada {VOTE_PER_USER_PER_MIN} oydan fazlasına izin verilmiyor.")
    user_recent_hour = await db.votes.count_documents({"user_id": user.id, "created_at": {"$gte": iso_hour_ago}})
    if user_recent_hour >= VOTE_PER_USER_PER_HOUR:
        raise HTTPException(status_code=429, detail=f"Saatlik oy limitine ulaştın ({VOTE_PER_USER_PER_HOUR} oy). Biraz sonra tekrar dene.")
    if ip:
        ip_recent_min = await db.votes.count_documents({"ip": ip, "created_at": {"$gte": iso_minute_ago}})
        if ip_recent_min >= VOTE_PER_IP_PER_MIN:
            raise HTTPException(status_code=429, detail="Bu ağdan çok hızlı oy geliyor. Lütfen biraz bekle.")
    # Atomic vote: rely on the (clip_id, user_id) unique index to enforce one-vote-per-user.
    try:
        await db.votes.insert_one({
            "clip_id": clip_id,
            "user_id": user.id,
            "ip": ip,
            "created_at": now_iso(),
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Bu klibe zaten oy verdin")
    # Only increment after the insert succeeded
    res = await db.clips.find_one_and_update(
        {"id": clip_id},
        {"$inc": {"votes_count": 1}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        # Clip was deleted in between — undo the vote
        await db.votes.delete_one({"clip_id": clip_id, "user_id": user.id})
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    # ---- Auto-flag check (suspicious vote burst on this clip) ----
    if not res.get("flagged_at"):
        burst_window = (now - timedelta(seconds=AUTOFLAG_WINDOW_SECONDS)).isoformat()
        burst = await db.votes.count_documents({"clip_id": clip_id, "created_at": {"$gte": burst_window}})
        if burst >= AUTOFLAG_VOTES_THRESHOLD:
            await db.clips.update_one(
                {"id": clip_id, "flagged_at": {"$exists": False}},
                {"$set": {
                    "flagged_at": now_iso(),
                    "flag_reason": f"rapid_votes:{burst}_in_{AUTOFLAG_WINDOW_SECONDS}s",
                }},
            )
            logger.warning(f"Auto-flagged clip {clip_id}: {burst} votes in {AUTOFLAG_WINDOW_SECONDS}s")
    await record_event("vote_cast", user, res)
    return await attach_vote_status(res, user.id)


@api_router.delete("/clips/{clip_id}/vote", response_model=ClipPublic)
async def unvote_clip(clip_id: str, user: User = Depends(require_user)):
    """Retract a vote. Only allowed on current-week clips so historical results stay stable."""
    doc = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    if doc.get("week_key") != current_week_key():
        raise HTTPException(status_code=403, detail="Sadece bu haftaki kliplerden oy çekilebilir")
    # Atomic: only decrement if we actually deleted a vote
    result = await db.votes.delete_one({"clip_id": clip_id, "user_id": user.id})
    if result.deleted_count:
        res = await db.clips.find_one_and_update(
            {"id": clip_id, "votes_count": {"$gt": 0}},
            {"$inc": {"votes_count": -1}},
            return_document=True,
            projection={"_id": 0},
        )
        if res:
            doc = res
    return await attach_vote_status(doc, user.id)


@api_router.get("/leaderboard/weekly", response_model=List[ClipPublic])
async def weekly_leaderboard(user: Optional[User] = Depends(get_current_user)):
    week = current_week_key()
    cursor = db.clips.find({"week_key": week}, {"_id": 0}).sort([("votes_count", -1), ("created_at", 1)]).limit(20)
    docs = await cursor.to_list(20)
    uid = user.id if user else None
    cids = [d["id"] for d in docs]
    hot_map = await compute_hot_map(cids)
    rx_map, my_rx = await compute_reactions_maps(cids, uid)
    return [await attach_vote_status(d, uid, hot_map, rx_map, my_rx) for d in docs]


# ----------------- Stats / Profile / Reports -----------------
@api_router.get("/stats/community")
async def community_stats():
    """Public counter for landing/onboarding gamification.
    Real DB counts are NEVER exposed. Public sees only `real * MULTIPLIER`.
    Example with MULTIPLIER=4: real_telegram=1 → displayed=4 → next_position=8.
    """
    real_total = await db.users.count_documents({})
    real_telegram = await db.users.count_documents({"telegram_id": {"$type": "string"}})
    displayed_total = real_total * COMMUNITY_DISPLAY_MULTIPLIER
    displayed_telegram = real_telegram * COMMUNITY_DISPLAY_MULTIPLIER
    return {
        "total_members": displayed_total,
        "telegram_linked": displayed_telegram,
        "next_position": displayed_telegram + COMMUNITY_DISPLAY_MULTIPLIER,
    }


@api_router.get("/users/{username}")
async def user_profile(username: str, viewer: Optional[User] = Depends(get_current_user)):
    """Public profile: user info + their submitted clips + aggregate stats."""
    doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    # User's clips (most recent first)
    clip_cursor = db.clips.find({"submitter_id": doc["id"]}, {"_id": 0}).sort([("created_at", -1)]).limit(100)
    clips_raw = await clip_cursor.to_list(100)
    uid = viewer.id if viewer else None
    cids = [c["id"] for c in clips_raw]
    hot_map = await compute_hot_map(cids)
    rx_map, my_rx = await compute_reactions_maps(cids, uid)
    clips = [await attach_vote_status(c, uid, hot_map, rx_map, my_rx) for c in clips_raw]
    total_votes_received = sum(c.votes_count for c in clips)
    return {
        "user": {
            "id": doc["id"],
            "username": doc["username"],
            "avatar_url": doc.get("avatar_url"),
            "has_telegram": bool(doc.get("telegram_id")),
            "created_at": doc.get("created_at"),
        },
        "stats": {
            "clips_count": len(clips),
            "total_votes_received": total_votes_received,
        },
        "clips": [c.model_dump() for c in clips],
    }


class ReportClipRequest(BaseModel):
    reason: str


@api_router.post("/clips/{clip_id}/report")
async def report_clip(clip_id: str, payload: ReportClipRequest, user: User = Depends(require_user)):
    reason = (payload.reason or "").strip()
    if len(reason) < 3 or len(reason) > 500:
        raise HTTPException(status_code=400, detail="Sebep 3-500 karakter arası olmalı")
    clip = await db.clips.find_one({"id": clip_id}, {"_id": 0, "id": 1})
    if not clip:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    # one report per user per clip
    existing = await db.reports.find_one({"clip_id": clip_id, "reporter_user_id": user.id})
    if existing:
        raise HTTPException(status_code=409, detail="Bu klibi zaten raporladın")
    await db.reports.insert_one({
        "id": str(uuid.uuid4()),
        "clip_id": clip_id,
        "reporter_user_id": user.id,
        "reporter_username": user.username,
        "reason": reason,
        "status": "open",
        "created_at": now_iso(),
    })
    return {"ok": True}


# ----------------- Admin endpoints (env-gated) -----------------
class ResolveReportRequest(BaseModel):
    action: str  # "ignore" | "delete_clip"


@api_router.get("/admin/reports")
async def admin_list_reports(status: str = "open", admin: User = Depends(require_admin)):
    """List reports with status filter. Joins clip + reporter info."""
    if status not in ("open", "resolved", "all"):
        raise HTTPException(status_code=400, detail="status: open | resolved | all")
    q = {} if status == "all" else {"status": status}
    cursor = db.reports.find(q, {"_id": 0}).sort([("created_at", -1)]).limit(200)
    rows = await cursor.to_list(200)
    # Attach clip snapshot for each report (cheap, max 200)
    out: List[Dict[str, Any]] = []
    for r in rows:
        clip = await db.clips.find_one({"id": r["clip_id"]}, {"_id": 0, "id": 1, "title": 1, "kick_url": 1, "kick_clip_id": 1, "submitter_username": 1, "votes_count": 1})
        out.append({**r, "clip": clip})
    return {"reports": out, "count": len(out)}


@api_router.get("/admin/stats")
async def admin_stats(admin: User = Depends(require_admin)):
    """Real (non-inflated) counts — only admins."""
    return {
        "users_total": await db.users.count_documents({}),
        "users_with_telegram": await db.users.count_documents({"telegram_id": {"$type": "string"}}),
        "clips_total": await db.clips.count_documents({}),
        "clips_this_week": await db.clips.count_documents({"week_key": current_week_key()}),
        "votes_total": await db.votes.count_documents({}),
        "reports_open": await db.reports.count_documents({"status": "open"}),
        "reports_resolved": await db.reports.count_documents({"status": "resolved"}),
        "flagged_clips": await db.clips.count_documents({"flagged_at": {"$exists": True, "$ne": None}}),
    }


@api_router.get("/admin/flagged-clips")
async def admin_flagged_clips(admin: User = Depends(require_admin)):
    """Clips auto-flagged by the anti-abuse system (suspected coordinated voting).
    Admin can dismiss the flag or delete the clip."""
    cursor = db.clips.find(
        {"flagged_at": {"$exists": True, "$ne": None}},
        {"_id": 0},
    ).sort([("flagged_at", -1)]).limit(200)
    rows = await cursor.to_list(200)
    # Attach a small votes-per-minute-burst breakdown for the last 60s
    now = datetime.now(timezone.utc)
    minute_ago = (now - timedelta(seconds=60)).isoformat()
    out: List[Dict[str, Any]] = []
    for c in rows:
        recent = await db.votes.count_documents({"clip_id": c["id"], "created_at": {"$gte": minute_ago}})
        out.append({**c, "votes_last_minute": recent})
    return {"clips": out, "count": len(out)}


@api_router.post("/admin/flagged-clips/{clip_id}/clear")
async def admin_clear_flag(clip_id: str, admin: User = Depends(require_admin)):
    """Dismiss an auto-flag (admin reviewed and accepted the clip)."""
    res = await db.clips.update_one(
        {"id": clip_id},
        {"$unset": {"flagged_at": "", "flag_reason": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    return {"ok": True}


@api_router.get("/admin/users")
async def admin_list_users(
    search: str = "",
    sort: str = "newest",
    page: int = 1,
    page_size: int = 30,
    admin: User = Depends(require_admin),
):
    """Paginated user list with optional search by username/email/telegram_username."""
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    q: Dict[str, Any] = {}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [
            {"username": rx},
            {"email": rx},
            {"telegram_username": rx},
            {"phone": rx},
        ]
    sort_field = {
        "newest": [("created_at", -1)],
        "oldest": [("created_at", 1)],
        "username": [("username", 1)],
    }.get(sort, [("created_at", -1)])
    total = await db.users.count_documents(q)
    cursor = db.users.find(q, {"_id": 0, "hashed_password": 0}).sort(sort_field).skip(
        (page - 1) * page_size
    ).limit(page_size)
    users = await cursor.to_list(length=page_size)
    # decorate with clip/vote counts in bulk
    user_ids = [u["id"] for u in users]
    clips_by_user = {}
    votes_by_user = {}
    if user_ids:
        pipeline_clips = [
            {"$match": {"submitter_id": {"$in": user_ids}}},
            {"$group": {"_id": "$submitter_id", "n": {"$sum": 1}}},
        ]
        async for row in db.clips.aggregate(pipeline_clips):
            clips_by_user[row["_id"]] = row["n"]
        pipeline_votes = [
            {"$match": {"user_id": {"$in": user_ids}}},
            {"$group": {"_id": "$user_id", "n": {"$sum": 1}}},
        ]
        async for row in db.votes.aggregate(pipeline_votes):
            votes_by_user[row["_id"]] = row["n"]
    for u in users:
        u["clips_count"] = clips_by_user.get(u["id"], 0)
        u["votes_count"] = votes_by_user.get(u["id"], 0)
        u["has_telegram"] = bool(u.get("telegram_id"))
        u["is_admin"] = u.get("username", "").lower() in ADMIN_USERNAMES
    return {"total": total, "page": page, "page_size": page_size, "items": users}


@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin: User = Depends(require_admin)):
    """Full detail view for a single user."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    # Opportunistically refresh telegram_username from Telegram's getChat API.
    # The user may have set a @username after linking, so our stored value can
    # become stale.
    if u.get("telegram_id"):
        fresh = await refresh_telegram_username(u["telegram_id"])
        if fresh and fresh != u.get("telegram_username"):
            await db.users.update_one(
                {"id": user_id}, {"$set": {"telegram_username": fresh}}
            )
            u["telegram_username"] = fresh
    clips_count = await db.clips.count_documents({"submitter_id": user_id})
    votes_count = await db.votes.count_documents({"user_id": user_id})
    reports_against = await db.reports.count_documents({"clip_submitter_id": user_id})
    reports_by = await db.reports.count_documents({"reporter_id": user_id})
    # last 5 clips
    clips = await db.clips.find(
        {"submitter_id": user_id}, {"_id": 0}
    ).sort([("created_at", -1)]).limit(5).to_list(length=5)
    # last 5 events
    events = await db.events.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort([("created_at", -1)]).limit(10).to_list(length=10)
    u["is_admin"] = u.get("username", "").lower() in ADMIN_USERNAMES
    u["has_telegram"] = bool(u.get("telegram_id"))
    u["clips_count"] = clips_count
    u["votes_count"] = votes_count
    u["reports_against"] = reports_against
    u["reports_by"] = reports_by
    u["recent_clips"] = clips
    u["recent_events"] = events
    return u


class BanRequest(BaseModel):
    reason: Optional[str] = None


@api_router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, payload: BanRequest, admin: User = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if target.get("username", "").lower() in ADMIN_USERNAMES:
        raise HTTPException(status_code=400, detail="Admin yasaklanamaz")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "banned": True,
            "banned_at": now_iso(),
            "banned_reason": (payload.reason or "").strip()[:200] or None,
            "banned_by": admin.username,
        }},
    )
    return {"ok": True}


@api_router.post("/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: str, admin: User = Depends(require_admin)):
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {"banned": False}, "$unset": {"banned_at": "", "banned_reason": "", "banned_by": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {"ok": True}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: User = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if target.get("username", "").lower() in ADMIN_USERNAMES:
        raise HTTPException(status_code=400, detail="Admin silinemez")
    # Cascade: clips by user, votes, reactions, notifications, reports
    clip_ids = [c["id"] async for c in db.clips.find({"submitter_id": user_id}, {"_id": 0, "id": 1})]
    if clip_ids:
        await db.clips.delete_many({"id": {"$in": clip_ids}})
        await db.votes.delete_many({"clip_id": {"$in": clip_ids}})
        await db.reports.delete_many({"clip_id": {"$in": clip_ids}})
    await db.votes.delete_many({"user_id": user_id})
    await db.notifications.delete_many({"user_id": user_id})
    await db.reports.delete_many({"reporter_id": user_id})
    await db.events.delete_many({"user_id": user_id})
    await db.users.delete_one({"id": user_id})
    return {"ok": True, "deleted_clips": len(clip_ids)}


@api_router.post("/admin/reports/{report_id}/resolve")
async def admin_resolve_report(report_id: str, payload: ResolveReportRequest, admin: User = Depends(require_admin)):
    if payload.action not in ("ignore", "delete_clip"):
        raise HTTPException(status_code=400, detail="action: 'ignore' veya 'delete_clip' olmalı")
    report = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Rapor bulunamadı")
    if report.get("status") != "open":
        raise HTTPException(status_code=400, detail="Bu rapor zaten kapatılmış")
    update = {
        "status": "resolved",
        "resolution": payload.action,
        "resolved_at": now_iso(),
        "resolved_by": admin.id,
    }
    if payload.action == "delete_clip":
        clip_id = report["clip_id"]
        await db.clips.delete_one({"id": clip_id})
        await db.votes.delete_many({"clip_id": clip_id})
        # Also resolve any other open reports against the same clip
        await db.reports.update_many(
            {"clip_id": clip_id, "status": "open", "id": {"$ne": report_id}},
            {"$set": {"status": "resolved", "resolution": "clip_deleted_by_admin", "resolved_at": now_iso(), "resolved_by": admin.id}},
        )
    await db.reports.update_one({"id": report_id}, {"$set": update})
    return {"ok": True}


# ----------------- Reactions (emoji) -----------------
@api_router.post("/clips/{clip_id}/reactions")
async def add_reaction(clip_id: str, payload: ReactionRequest, user: User = Depends(require_user)):
    emoji = payload.emoji
    if emoji not in REACTION_EMOJIS:
        raise HTTPException(status_code=400, detail=f"Geçersiz emoji. İzinli: {' '.join(REACTION_EMOJIS)}")
    clip = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not clip:
        raise HTTPException(status_code=404, detail="Klip bulunamadı")
    # Upsert: a user has at most ONE active reaction per clip (replaces previous emoji)
    prev = await db.reactions.find_one({"clip_id": clip_id, "user_id": user.id}, {"_id": 0})
    if prev and prev.get("emoji") == emoji:
        return {"ok": True, "emoji": emoji, "changed": False}
    await db.reactions.update_one(
        {"clip_id": clip_id, "user_id": user.id},
        {"$set": {
            "clip_id": clip_id,
            "user_id": user.id,
            "username": user.username,
            "emoji": emoji,
            "created_at": now_iso(),
        }},
        upsert=True,
    )
    await record_event("reaction_added", user, clip, {"reaction_emoji": emoji})
    return {"ok": True, "emoji": emoji, "changed": True}


@api_router.delete("/clips/{clip_id}/reactions")
async def remove_reaction(clip_id: str, user: User = Depends(require_user)):
    await db.reactions.delete_one({"clip_id": clip_id, "user_id": user.id})
    return {"ok": True}


# ----------------- Activity feed (events) -----------------
@api_router.get("/events")
async def list_events(limit: int = 50, before: Optional[str] = None):
    """Reverse-chronological global activity feed. Paginate via `before` (created_at ISO string)."""
    limit = max(1, min(100, limit))
    query: Dict[str, Any] = {}
    if before:
        query["created_at"] = {"$lt": before}
    cursor = db.events.find(query, {"_id": 0}).sort([("created_at", -1)]).limit(limit)
    rows = await cursor.to_list(limit)
    return {"events": rows, "next_cursor": rows[-1]["created_at"] if len(rows) == limit else None}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.clips.create_index("kick_clip_id", unique=True)
    await db.clips.create_index("week_key")
    await db.users.create_index("username", unique=True)
    # IMPORTANT: sparse=True does NOT skip docs where field exists with value null.
    # Use partialFilterExpression so null/missing telegram_id never collide.
    # Drop legacy sparse index first if it exists (create_index is a no-op on identical name+keys).
    try:
        existing_indexes = await db.users.index_information()
        for name, info in existing_indexes.items():
            if name == "_id_":
                continue
            keys = info.get("key", [])
            if any(k[0] == "telegram_id" for k in keys) and "partialFilterExpression" not in info:
                await db.users.drop_index(name)
            if any(k[0] == "email" for k in keys) and "partialFilterExpression" not in info and name != "email_1_partial":
                await db.users.drop_index(name)
    except Exception as e:
        logger.warning(f"Index migration warning: {e}")
    await db.users.create_index(
        "telegram_id",
        unique=True,
        partialFilterExpression={"telegram_id": {"$type": "string"}},
        name="telegram_id_unique_partial",
    )
    await db.users.create_index(
        "email",
        partialFilterExpression={"email": {"$type": "string"}},
        name="email_partial",
    )
    await db.votes.create_index([("clip_id", 1), ("user_id", 1)], unique=True)
    # Rate-limit + auto-flag queries: hot reads on (user_id, created_at), (ip, created_at), (clip_id, created_at)
    await db.votes.create_index([("user_id", 1), ("created_at", -1)], name="votes_user_recent")
    await db.votes.create_index([("ip", 1), ("created_at", -1)], name="votes_ip_recent", sparse=True)
    await db.votes.create_index([("clip_id", 1), ("created_at", -1)], name="votes_clip_recent")
    # Flagged clips listing
    await db.clips.create_index("flagged_at", name="clips_flagged_at", sparse=True)
    await db.verify_codes.create_index("code", unique=True)
    await db.verify_codes.create_index("telegram_id")
    await db.password_reset_codes.create_index("code", unique=True)
    await db.password_reset_codes.create_index("user_id")
    await db.reports.create_index([("clip_id", 1), ("reporter_user_id", 1)], unique=True)
    await db.reports.create_index("created_at")
    await db.reactions.create_index([("clip_id", 1), ("user_id", 1)], unique=True)
    await db.reactions.create_index("clip_id")
    await db.events.create_index([("created_at", -1)])
    await db.events.create_index("actor_user_id")
    await db.events.create_index("clip_id")
    # Register Telegram webhook on startup
    if TELEGRAM_BOT_TOKEN and PUBLIC_BACKEND_URL:
        webhook_url = f"{PUBLIC_BACKEND_URL}/api/telegram/webhook/{WEBHOOK_SECRET}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook",
                    json={"url": webhook_url, "allowed_updates": ["message"]},
                )
                logger.info(f"Telegram setWebhook: {r.json()}")
        except Exception as e:
            logger.warning(f"setWebhook failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
