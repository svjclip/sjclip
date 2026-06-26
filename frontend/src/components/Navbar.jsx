import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Plus, Zap, LogOut, Send, Link2, Activity, Menu, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "./ui/sheet";
import LoginDialog from "./LoginDialog";
import SubmitClipDialog from "./SubmitClipDialog";
import AvatarPicker from "./AvatarPicker";

export default function Navbar({ streamerName }) {
  const { user, logout, missingChannels } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fully onboarded = logged in + Telegram linked + all required channels joined
  const fullyOnboarded = !!user && !!user.telegram_id && (missingChannels || []).length === 0;

  const linkClass = ({ isActive }) =>
    `font-display text-sm tracking-wider uppercase transition-colors ${
      isActive ? "text-[#53FC18]" : "text-zinc-400 hover:text-white"
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 font-display tracking-wider uppercase border-l-2 transition-colors ${
      isActive
        ? "border-[#53FC18] text-[#53FC18] bg-[#53FC18]/5"
        : "border-transparent text-zinc-300 hover:text-white hover:border-white/30"
    }`;

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <motion.nav
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed top-0 inset-x-0 z-50 glass border-b border-white/5"
        data-testid="main-navbar"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Mobile hamburger (left side) */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="md:hidden p-2 -ml-2 text-zinc-300 hover:text-[#53FC18] transition-colors"
                aria-label="Menüyü aç"
                data-testid="mobile-menu-toggle"
              >
                <Menu className="w-6 h-6" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="bg-black border-r border-[#53FC18]/20 text-white w-72 p-0 [&>button]:hidden"
              data-testid="mobile-nav-sheet"
            >
              <SheetTitle className="sr-only">Mobil Menü</SheetTitle>
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <Link to="/" onClick={closeMobile} className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#53FC18] drop-shadow-[0_0_8px_rgba(83,252,24,0.8)]" strokeWidth={2.5} />
                  <span className="font-display font-black text-base tracking-tighter">
                    {streamerName}<span className="text-[#53FC18]">.</span>CLIPS
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={closeMobile}
                  className="text-zinc-400 hover:text-white p-1"
                  aria-label="Kapat"
                  data-testid="mobile-menu-close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="py-2">
                <NavLink to="/" end onClick={closeMobile} className={mobileLinkClass} data-testid="mobile-nav-feed">
                  Klipler
                </NavLink>
                <NavLink to="/leaderboard" onClick={closeMobile} className={mobileLinkClass} data-testid="mobile-nav-leaderboard">
                  <Trophy className="w-4 h-4" />
                  Sıralama
                </NavLink>
                <NavLink to="/akis-zaman" onClick={closeMobile} className={mobileLinkClass} data-testid="mobile-nav-timeline">
                  <Activity className="w-4 h-4" />
                  Akış
                </NavLink>
                {user && (
                  <NavLink to={`/profil/${user.username}`} onClick={closeMobile} className={mobileLinkClass}>
                    <span className="w-4 h-4 rounded-full bg-[#53FC18]/20 inline-flex items-center justify-center text-[10px] text-[#53FC18] font-bold">
                      {user.username[0].toUpperCase()}
                    </span>
                    Profilim
                  </NavLink>
                )}
              </nav>
              {user && (
                <div className="p-4 mt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => { closeMobile(); logout(); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-white border border-white/10 hover:border-white/30 rounded-md transition-colors"
                    data-testid="mobile-logout-btn"
                  >
                    <LogOut className="w-4 h-4" />
                    Çıkış Yap
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 group" data-testid="nav-logo">
            <div className="relative hidden sm:block">
              <Zap className="w-6 h-6 text-[#53FC18] drop-shadow-[0_0_8px_rgba(83,252,24,0.8)]" strokeWidth={2.5} />
            </div>
            <span className="font-display font-black text-base sm:text-lg tracking-tighter">
              {streamerName}<span className="text-[#53FC18]">.</span>CLIPS
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <NavLink to="/" end className={linkClass} data-testid="nav-feed">Klipler</NavLink>
            <NavLink to="/leaderboard" className={linkClass} data-testid="nav-leaderboard">
              <span className="inline-flex items-center gap-1.5"><Trophy className="w-4 h-4" />Sıralama</span>
            </NavLink>
            <NavLink to="/akis-zaman" className={linkClass} data-testid="nav-timeline">
              <span className="inline-flex items-center gap-1.5"><Activity className="w-4 h-4" />Akış</span>
            </NavLink>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {fullyOnboarded ? (
                  <Button
                    onClick={() => setSubmitOpen(true)}
                    className="bg-[#53FC18] text-black font-bold hover:bg-[#3ECA0D] hover:shadow-[0_0_20px_rgba(83,252,24,0.5)] rounded-xl"
                    data-testid="submit-clip-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Klip Gönder
                  </Button>
                ) : user.is_admin ? null : (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("svj:open-telegram-gate"))}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#FFD166]/40 bg-[#FFD166]/5 text-[11px] uppercase tracking-wider text-[#FFD166] font-bold hover:bg-[#FFD166]/10 hover:border-[#FFD166] transition-colors"
                    data-testid="nav-open-telegram-gate-btn"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Telegram Bağla
                  </button>
                )}
                <Link
                  to={`/profil/${user.username}`}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#53FC18]/30 transition-colors"
                  data-testid="user-chip"
                >
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setAvatarOpen(true); }}
                    className="w-6 h-6 rounded-full overflow-hidden bg-[#53FC18]/20 flex items-center justify-center text-[#53FC18] text-xs font-bold hover:ring-2 hover:ring-[#53FC18]"
                    data-testid="open-avatar-picker-btn"
                    aria-label="Avatarı değiştir"
                  >
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      user.username[0].toUpperCase()
                    )}
                  </button>
                  <span className="text-sm font-medium">{user.username}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); logout(); }}
                    className="text-zinc-500 hover:text-white"
                    data-testid="logout-btn"
                    aria-label="Çıkış"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </Link>
              </>
            ) : (
              <Button
                onClick={() => setLoginOpen(true)}
                className="bg-[#53FC18] text-black font-bold hover:bg-[#3ECA0D] hover:shadow-[0_0_20px_rgba(83,252,24,0.5)] rounded-xl"
                data-testid="open-login-btn"
              >
                <Send className="w-4 h-4 mr-1" /> Giriş Yap
              </Button>
            )}
          </div>
        </div>
      </motion.nav>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <SubmitClipDialog open={submitOpen} onOpenChange={setSubmitOpen} />
      <AvatarPicker open={avatarOpen} onOpenChange={setAvatarOpen} />
    </>
  );
}
