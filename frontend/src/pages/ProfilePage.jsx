import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Sparkles, Send, Calendar } from "lucide-react";
import { api } from "../lib/api";
import ClipCard from "../components/ClipCard";

export default function ProfilePage() {
  const { username } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => (await api.get(`/users/${username}`)).data,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="pt-32 pb-20 max-w-5xl mx-auto px-6 lg:px-8" data-testid="profile-loading">
        <div className="h-48 bg-white/5 rounded-2xl animate-pulse" />
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

  return (
    <div className="pt-28 pb-20 max-w-6xl mx-auto px-6 lg:px-8" data-testid="profile-page">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden border border-white/5 bg-[#0A0A0A] p-8 lg:p-12 mb-12"
      >
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,_rgba(83,252,24,0.15),_transparent_60%)] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[#53FC18]/15 flex items-center justify-center text-[#53FC18] text-4xl font-display font-black shadow-[0_0_30px_rgba(83,252,24,0.2)]">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" data-testid="profile-avatar" />
            ) : (
              user.username[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#53FC18] mb-2">Profil</div>
            <h1 className="font-display font-black text-3xl lg:text-5xl tracking-tighter break-all" data-testid="profile-username">
              {user.username}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              {user.has_telegram && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#229ED9]/10 text-[#5fb6e2] border border-[#229ED9]/30">
                  <Send className="w-3 h-3" /> Telegram bağlı
                </span>
              )}
              {user.created_at && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {new Date(user.created_at).toLocaleDateString("tr-TR", { year: "numeric", month: "long" })} tarihinden beri
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-6 md:gap-10">
            <div data-testid="profile-stat-clips">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">Klip</div>
              <div className="font-display font-black text-4xl">{stats.clips_count}</div>
            </div>
            <div data-testid="profile-stat-votes">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">Toplam Oy</div>
              <div className="font-display font-black text-4xl text-[#53FC18]">{stats.total_votes_received}</div>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-black text-2xl tracking-tighter inline-flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#53FC18]" /> Gönderilen Klipler
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
