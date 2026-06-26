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
# Community counter cosmetic offset (so the public never sees the real number)
COMMUNITY_DISPLAY_OFFSET = int(os.environ.get('COMMUNITY_DISPLAY_OFFSET', '1247'))

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
    telegram_photo_file_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    has_password: bool = False
    created_at: str = Field(default_factory=now_iso)


class UserPublic(BaseModel):
    """User shape returned to clients (no password_hash)."""
    id: str
    username: str
    avatar_url: Optional[str] = None
    telegram_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    has_password: bool = False
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
    title: str
    submitter_id: str
    submitter_username: str
    votes_count: int
    week_key: str
    created_at: str
    has_voted: bool = False


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
    return user


async def attach_vote_status(clip_dict: dict, user_id: Optional[str]) -> ClipPublic:
    has_voted = False
    if user_id:
        v = await db.votes.find_one({"clip_id": clip_dict["id"], "user_id": user_id})
        has_voted = v is not None
    return ClipPublic(**clip_dict, has_voted=has_voted)


# ----------------- Routes -----------------
@api_router.get("/")
async def root():
    return {"message": "Clip Voting API", "streamer": STREAMER_NAME}


@api_router.get("/config")
async def get_config():
    return {
        "streamer_name": STREAMER_NAME,
        "current_week_key": current_week_key(),
        "telegram_bot_username": TELEGRAM_BOT_USERNAME,
        "required_channels": REQUIRED_CHANNELS,
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


@api_router.get("/auth/check-channels")
async def check_channels(user: User = Depends(require_user)):
    if not user.telegram_id:
        return {"missing_channels": REQUIRED_CHANNELS, "telegram_linked": False}
    missing = await check_channel_membership(int(user.telegram_id))
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
    clip = Clip(
        kick_url=payload.kick_url.strip(),
        kick_clip_id=clip_id,
        title=title,
        submitter_id=user.id,
        submitter_username=user.username,
    )
    await db.clips.insert_one(clip.model_dump())
    return await attach_vote_status(clip.model_dump(), user.id)


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
    return [await attach_vote_status(d, uid) for d in docs]


@api_router.get("/clips/{clip_id}", response_model=ClipPublic)
async def get_clip(clip_id: str, user: Optional[User] = Depends(get_current_user)):
    doc = await db.clips.find_one({"id": clip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Clip not found")
    uid = user.id if user else None
    return await attach_vote_status(doc, uid)


@api_router.post("/clips/{clip_id}/vote", response_model=ClipPublic)
async def vote_clip(clip_id: str, user: User = Depends(require_user)):
    """Cast a vote. Hardened against:
    - duplicate votes (unique index + atomic try/except)
    - self-voting
    - votes on past-week clips (only current week is voteable)
    - votes from accounts without Telegram + required channels
    """
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
    # Atomic vote: rely on the (clip_id, user_id) unique index to enforce one-vote-per-user.
    try:
        await db.votes.insert_one({
            "clip_id": clip_id,
            "user_id": user.id,
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
    return [await attach_vote_status(d, uid) for d in docs]


# ----------------- Stats / Profile / Reports -----------------
@api_router.get("/stats/community")
async def community_stats():
    """Public counter for landing/onboarding gamification.
    Real counts are NOT exposed — the response contains cosmetic "displayed" values
    inflated by COMMUNITY_DISPLAY_OFFSET so the public never sees the exact backend count.
    """
    real_total = await db.users.count_documents({})
    real_telegram = await db.users.count_documents({"telegram_id": {"$type": "string"}})
    # Stable inflation: each real user adds ~3 visible members for the public counter
    displayed_total = real_total * 3 + COMMUNITY_DISPLAY_OFFSET
    displayed_telegram = real_telegram * 3 + COMMUNITY_DISPLAY_OFFSET
    return {
        "total_members": displayed_total,
        "telegram_linked": displayed_telegram,
        "next_position": displayed_telegram + 1,
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
    clips = [await attach_vote_status(c, uid) for c in clips_raw]
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
    await db.verify_codes.create_index("code", unique=True)
    await db.verify_codes.create_index("telegram_id")
    await db.password_reset_codes.create_index("code", unique=True)
    await db.password_reset_codes.create_index("user_id")
    await db.reports.create_index([("clip_id", 1), ("reporter_user_id", 1)], unique=True)
    await db.reports.create_index("created_at")
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
