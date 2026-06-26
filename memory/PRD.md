# SVJ.CLIPS — Product Requirements

## Original problem statement
Build a community-driven Kick clip showcase + voting platform for streamer SVJ.
- Username + password + email + phone registration (bcrypt + JWT).
- Email and phone are data-collection only.
- Telegram link is PERMANENT (unique index + 409 on conflict).
- Submitting clips and voting both require Telegram link + membership in configured channels.
- Kick-streamer–scoped (only clips from the configured streamer accepted).
- Compact, atmospheric UI; admin moderation; reports; profiles; weekly voting.

## Core data model
- `users`: id, username, password_hash, email, phone, telegram_id (unique sparse),
  telegram_username, telegram_photo_file_id, has_password, avatar_url,
  onboarded_at, banned/banned_reason/banned_by, created_at.
- `clips`: id, kick_url, kick_clip_id (unique), kick_shard, title, submitter_*,
  votes_count, week_key, flagged_at (sparse), flag_reason, created_at.
- `votes`: clip_id+user_id unique; ip, created_at. Indexes: user_recent, ip_recent, clip_recent.
- `contests`, `notifications`, `reports`, `reactions`, `events`, `verify_codes`,
  `password_reset_codes`, `settings`.

## What's been implemented
### Phase 1
- React/FastAPI/MongoDB scaffold, atmospheric R3F hero, clip cards with hover preview,
  weekly voting (cookie-based per-user).
### Phase 2
- JWT/bcrypt auth, register/login/me/logout, Telegram bot webhook, /start code linking,
  required-channels gate, /reset password flow.
### Phase 3
- Admin gating, prize settings, contest management (start/end/winner), broadcast
  notifications, admin user list (ban/unban/delete), mobile nav, WinnerHero redesign,
  Kick CDN HLS playback with shard discovery.
### Phase 4 — Anti-Abuse & Security (this session)
- ✅ Vote rate-limit: per-user 5/min + 30/hr, per-IP 10/min → 429
- ✅ Auto-flag: clips receiving ≥10 votes in 60s get flagged_at + flag_reason
- ✅ Admin Flagged-Clips panel: GET /admin/flagged-clips + POST .../clear
- ✅ Admin stats expose flagged_clips count
- ✅ Duplicate clip detection confirmed (kick_clip_id unique index + 409)
- ✅ "Yayıncı profili" → "Profili ziyaret et" copy fix
- ✅ Footer "Telegram doğrulaması • Faz 2" copy removed
- ✅ Hero3D: rotating wireframe globe replaced with floating SVJ portrait
  (multi-axis motion: scale 9s / y 12s / x 14s / rotate 16s)
- ✅ DB indexes: votes (user/ip/clip × created_at), clips.flagged_at
- ✅ pytest: tests/test_phase4_antiabuse.py (7 tests, all green)

## Backlog (prioritized)
### P0
- *(empty — no active blockers)*

### P1
- Refactor `backend/server.py` (~2000 LOC) into modular routers (auth, clips,
  admin, telegram, contests, notifications). User deferred to save credits.

### P2 — Growth & Engagement (Phase 5 candidates)
- Hall of Fame page (all past winners archive)
- Comments on clips (Telegram-gated)
- OG meta tags per clip for social shares
- Search + hashtag/tag system
- Badge / achievement system (first clip, streaks, winner badge)
- Weekly leaderboard of most-active voters
- Email digest (Resend) — weekly winners summary

### P3 — Polish & Monetization
- Mobile bottom-nav
- Prize-pool community donations (Stripe / Kick "kicks")
- Sponsor tag on winner card
- Light theme toggle

## Critical operational notes
- Language: Turkish only.
- Admin route: `/admin` (login at `/yonetim/giris`).
- Test creds: testuser_phase3 / sifre123 (in `/app/memory/test_credentials.md`).
- Kick playback: `clips.kick.com` + hls.js shard discovery — never revert to iframe.
- Hero3D uses `/public/svj-wireframe.png` (must be present).
