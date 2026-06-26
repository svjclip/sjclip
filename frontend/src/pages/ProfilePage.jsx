import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Sparkles, Send, Calendar, Award, Crown, Flame, ChevronUp } from "lucide-react";
import { api } from "../lib/api";
import ClipCard from "../components/ClipCard";

function isoWeekKey(date = new Date()) {
  // Match the backend current_week_key (ISO week, Monday-start, UTC) — simplified.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default function ProfilePage() {
  const { username } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => (await api.get(`/users/${username}`)).data,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="pt-32 pb-20 max-w-6xl mx-auto px-6 lg:px-8" data-testid="profile-loading">
        <div className="h-56 bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="pt-32 pb-20 max-w-5xl mx-auto px-6 lg:px-8 text-center" data-testid="profile-not-found">
        <Sparkles className="w-10 h-10 text-[#53FC18] mx-auto mb-4" />
        <h1 className="font-display font-black text-3xl mb-2">Kullanıcı bulunamadı</h1>
        <p className="text-zinc-500">@{username} adında bir kullanıcı yok.</p>
      </div>
    );
  }

  const { user, stats, clips } = data;
  const currentWeek = isoWeekKey();
  const thisWeekClips = clips.filter((c) => c.week_key === currentWeek);
  const thisWeekVotes = thisWeekClips.reduce((s, c) => s + c.votes_count, 0);
  const bestClip = clips.reduce((b, c) => (b == null || c.votes_count > b.votes_count ? c : b), null);
  const avgVotes = clips.length ? Math.round((stats.total_votes_received / clips.length) * 10) / 10 : 0;
  const joined = user.created_at ? new Date(user.created_at) : null;

  return (
    <div className="pt-28 pb-20 max-w-6xl mx-auto px-6 lg:px-8" data-testid="profile-page">
      {/* HERO */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden border border-white/5 bg-gradient-to-br from-[#0A0A0A] via-[#080808] to-black p-8 lg:p-12 mb-8"
      >
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#53FC18]/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-20 w-72 h-72 rounded-full bg-[#229ED9]/8 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-8">
          <div className="relative">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-[#53FC18]/15 flex items-center justify-center text-[#53FC18] text-5xl font-display font-black shadow-[0_0_40px_rgba(83,252,24,0.25)] ring-2 ring-[#53FC18]/30">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" data-testid="profile-avatar" />
              ) : (
                user.username[0].toUpperCase()
              )}
            </div>
            {user.has_telegram && (
              <div
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#229ED9] border-2 border-black flex items-center justify-center shadow-[0_0_15px_rgba(34,158,217,0.6)]"
                data-testid="profile-tg-badge"
                title="Telegram bağlı"
              >
                <Send className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#53FC18] mb-2">Profil</div>
            <h1 className="font-display font-black text-4xl lg:text-6xl tracking-tighter break-all leading-none" data-testid="profile-username">
              {user.username}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              {joined && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {joined.toLocaleDateString("tr-TR", { year: "numeric", month: "long" })} tarihinden beri
                </span>
              )}
              {bestClip && bestClip.votes_count > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#FFD166]/10 text-[#FFD166] border border-[#FFD166]/30" data-testid="profile-badge-bestclip">
                  <Crown className="w-3 h-3" /> En iyi: {bestClip.votes_count} oy
                </span>
              )}
              {thisWeekClips.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#53FC18]/10 text-[#53FC18] border border-[#53FC18]/30" data-testid="profile-badge-thisweek">
                  <Flame className="w-3 h-3" /> Bu hafta {thisWeekClips.length} klip
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* STATS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
        <StatCard label="Klip" value={stats.clips_count} testid="profile-stat-clips" />
        <StatCard label="Toplam Oy" value={stats.total_votes_received} accent testid="profile-stat-votes" />
        <StatCard label="Bu Hafta Oy" value={thisWeekVotes} testid="profile-stat-week-votes" />
        <StatCard label="Klip Başına" value={avgVotes} testid="profile-stat-avg" />
      </div>

      {/* BEST CLIP FEATURE */}
      {bestClip && bestClip.votes_count > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
          data-testid="profile-best-clip-section"
        >
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#FFD166] mb-1.5 inline-flex items-center gap-1.5">
                <Award className="w-3 h-3" /> Vitrin
              </div>
              <h2 className="font-display font-black text-2xl tracking-tighter">En çok oy alan klip</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-1">
              <ClipCard clip={bestClip} />
            </div>
            <div className="md:col-span-1 flex flex-col justify-center p-6 border border-[#FFD166]/20 bg-[#FFD166]/5">
              <div className="font-display text-xs uppercase tracking-[0.2em] text-[#FFD166] mb-2">Yıldız klip</div>
              <div className="font-display font-black text-6xl lg:text-7xl tracking-tighter text-white leading-none inline-flex items-baseline gap-2">
                <ChevronUp className="w-10 h-10 text-[#53FC18]" />
                {bestClip.votes_count}
              </div>
              <div className="text-sm text-zinc-400 mt-3 line-clamp-2">{bestClip.title}</div>
            </div>
          </div>
        </motion.section>
      )}

      {/* ALL CLIPS */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-black text-2xl tracking-tighter inline-flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#53FC18]" /> Tüm Klipler
        </h2>
        <span className="text-xs text-zinc-500 font-mono">{clips.length} klip</span>
      </div>

      {clips.length === 0 ? (
        <div className="border border-dashed border-white/10 p-12 text-center" data-testid="profile-empty">
          <Sparkles className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">Henüz klip yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="profile-clips-grid">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, testid, accent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`border p-4 ${accent ? "border-[#53FC18]/30 bg-[#53FC18]/5" : "border-white/5 bg-[#0A0A0A]"}`}
      data-testid={testid}
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500 mb-1">{label}</div>
      <div className={`font-display font-black text-3xl lg:text-4xl tracking-tighter ${accent ? "text-[#53FC18]" : "text-white"}`}>{value}</div>
    </motion.div>
  );
}
