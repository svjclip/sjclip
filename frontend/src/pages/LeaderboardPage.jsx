import React from "react";
import { motion } from "framer-motion";
import { Trophy, ChevronUp, Crown, Medal } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import CountdownTimer from "../components/CountdownTimer";

export default function LeaderboardPage() {
  const { data: clips = [], isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => (await api.get("/leaderboard/weekly")).data,
  });

  const winner = clips[0];
  const rest = clips.slice(1);

  const rankIcon = (i) => {
    if (i === 0) return <Crown className="w-5 h-5 text-[#FFD166]" />;
    if (i === 1) return <Medal className="w-5 h-5 text-zinc-400" />;
    if (i === 2) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="font-mono text-zinc-600 text-sm">#{i + 1}</span>;
  };

  return (
    <div className="relative pt-32 pb-20 max-w-5xl mx-auto px-6 lg:px-8" data-testid="leaderboard-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#53FC18] mb-3">Haftalık Sıralama</div>
        <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl tracking-tighter">
          <span className="text-[#53FC18] neon-text">Liderlik</span> tablosu.
        </h1>
        <p className="mt-4 text-zinc-400 max-w-xl">Hafta kapandığında en çok oyu alan klip ödülü kazanır. Canlı güncellenir.</p>
      </motion.div>

      <div className="glass rounded-2xl p-6 lg:p-8 mb-10" data-testid="leaderboard-countdown-card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-[#53FC18]" />
            <div>
              <div className="font-display font-bold text-lg">Ödül düşüyor</div>
              <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Pazar 00:00 UTC</div>
            </div>
          </div>
          <CountdownTimer />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center" data-testid="leaderboard-empty">
          <Trophy className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
          <h3 className="font-display font-bold text-2xl mb-2">Bu hafta henüz klip yok.</h3>
          <p className="text-zinc-500">Taht boş. Bir klip gönder ve yerini al.</p>
        </div>
      ) : (
        <>
          {winner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="relative rounded-2xl overflow-hidden mb-8 border border-[#53FC18]/30 bg-gradient-to-br from-[#53FC18]/10 via-transparent to-transparent neon-box"
              data-testid="leaderboard-winner-card"
            >
              <div className="p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#53FC18] flex items-center justify-center">
                    <Crown className="w-7 h-7 text-black" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#53FC18] mb-1">Mevcut Lider</div>
                    <Link to={`/clip/${winner.id}`} className="font-display font-black text-2xl tracking-tight hover:text-[#53FC18]" data-testid="winner-title">
                      {winner.title}
                    </Link>
                    <div className="text-sm text-zinc-400 mt-1">gönderen: {winner.submitter_username}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-5 py-3 rounded-xl bg-black/40 border border-[#53FC18]/30">
                  <ChevronUp className="w-5 h-5 text-[#53FC18]" />
                  <span className="font-mono font-bold text-2xl text-[#53FC18]" data-testid="winner-votes">{winner.votes_count}</span>
                  <span className="text-xs uppercase tracking-wider text-zinc-500">oy</span>
                </div>
              </div>
            </motion.div>
          )}

          <div className="space-y-2" data-testid="leaderboard-list">
            {rest.map((clip, idx) => (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-[#53FC18]/30 hover:bg-white/10 transition-all"
                data-testid={`leaderboard-row-${clip.id}`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-8 flex items-center justify-center">{rankIcon(idx + 1)}</div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/clip/${clip.id}`} className="font-display font-bold text-base tracking-tight truncate hover:text-[#53FC18] block">
                      {clip.title}
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5">gönderen: {clip.submitter_username}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 font-mono font-bold text-sm">
                  <ChevronUp className="w-4 h-4 text-[#53FC18]" />
                  {clip.votes_count}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
