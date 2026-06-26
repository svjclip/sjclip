import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Plus, Zap, LogOut, Send, Link2, ShieldCheck, Activity } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import LoginDialog from "./LoginDialog";
import SubmitClipDialog from "./SubmitClipDialog";
import AvatarPicker from "./AvatarPicker";

export default function Navbar({ streamerName }) {
  const { user, logout, missingChannels } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Fully onboarded = logged in + Telegram linked + all required channels joined
  const fullyOnboarded = !!user && !!user.telegram_id && (missingChannels || []).length === 0;

  const linkClass = ({ isActive }) =>
    `font-display text-sm tracking-wider uppercase transition-colors ${
      isActive ? "text-[#53FC18]" : "text-zinc-400 hover:text-white"
    }`;

  return (
    <>
      <motion.nav
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed top-0 inset-x-0 z-50 glass border-b border-white/5"
        data-testid="main-navbar"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group" data-testid="nav-logo">
            <div className="relative">
              <Zap className="w-6 h-6 text-[#53FC18] drop-shadow-[0_0_8px_rgba(83,252,24,0.8)]" strokeWidth={2.5} />
            </div>
            <span className="font-display font-black text-lg tracking-tighter">
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
            {user?.is_admin && (
              <NavLink to="/admin" className={linkClass} data-testid="nav-admin">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Admin</span>
              </NavLink>
            )}
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
