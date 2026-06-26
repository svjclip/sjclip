import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Trophy, Clock, AlertOctagon } from "lucide-react";
import { api } from "../lib/api";

/**
 * Displays one of three states based on /api/contests/active:
 *   - "active"     : countdown style status badge ("Etkinlik aktif — N gün kaldı")
 *   - "ended"      : warning banner ("Etkinlik kapalı, yeni etkinlik açılınca oy verebilirsiniz")
 *   - "no_contest" : muted hint
 * If a winner is announced (status='active' with winner OR status='ended' with winner)
 * a celebratory hero card is rendered above the status row.
 */
export default function ContestStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/contests/active")
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!data) return null;

  const { status, contest, winner_clip } = data;

  return (
    <div className="space-y-4 mb-8" data-testid="contest-status">
      {winner_clip && <WinnerHero clip={winner_clip} contestName={contest?.name} />}
      <StatusRow status={status} contest={contest} />
    </div>
  );
}

function WinnerHero({ clip, contestName }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative border border-[#FFD166]/40 bg-gradient-to-br from-[#FFD166]/15 via-[#FFD166]/5 to-transparent p-5 overflow-hidden"
      data-testid="winner-hero"
    >
      <div className="absolute -top-6 -right-6 opacity-20">
        <Crown className="w-32 h-32 text-[#FFD166]" />
      </div>
      <div className="relative flex items-start gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-full bg-[#FFD166]/20 border border-[#FFD166]/50 flex items-center justify-center flex-shrink-0">
          <Crown className="w-6 h-6 text-[#FFD166]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#FFD166] mb-1">
            {contestName ? `${contestName} • Kazanan` : "Bu Haftanın Kazananı"}
          </div>
          <Link
            to={`/clip/${clip.id}`}
            className="block font-display font-black text-2xl sm:text-3xl tracking-tighter hover:text-[#FFD166] transition-colors truncate"
            data-testid="winner-clip-title"
          >
            {clip.title}
          </Link>
          <div className="text-sm text-zinc-400 mt-1">
            <Link
              to={`/profil/${clip.submitter_username}`}
              className="hover:text-white font-medium"
            >
              @{clip.submitter_username}
            </Link>
            <span className="mx-2 text-zinc-600">•</span>
            <span className="text-zinc-500">{clip.votes_count} oy</span>
          </div>
        </div>
        <Link
          to={`/clip/${clip.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFD166] text-black text-sm font-bold uppercase tracking-wider hover:bg-[#e6bb5c] transition-colors flex-shrink-0"
          data-testid="winner-clip-cta"
        >
          <Trophy className="w-4 h-4" />
          İzle
        </Link>
      </div>
    </motion.div>
  );
}

function StatusRow({ status, contest }) {
  if (status === "active" && contest) {
    const endsAt = new Date(contest.ends_at);
    const days = Math.max(0, Math.ceil((endsAt - Date.now()) / (1000 * 60 * 60 * 24)));
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 border border-[#53FC18]/30 bg-[#53FC18]/[0.04] text-sm"
        data-testid="contest-status-active"
      >
        <Clock className="w-4 h-4 text-[#53FC18] flex-shrink-0" />
        <div className="flex-1">
          <span className="text-[#53FC18] font-bold">Aktif Etkinlik:</span>{" "}
          <span className="text-zinc-200">{contest.name}</span>
          <span className="text-zinc-500 ml-2 text-xs font-mono">
            ({days} gün kaldı)
          </span>
        </div>
      </div>
    );
  }
  if (status === "ended") {
    return (
      <div
        className="flex items-start gap-3 px-4 py-3 border border-[#FFD166]/30 bg-[#FFD166]/[0.05] text-sm"
        data-testid="contest-status-ended"
      >
        <AlertOctagon className="w-5 h-5 text-[#FFD166] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-[#FFD166] font-bold">Etkinlik süresi doldu</div>
          <div className="text-zinc-400 text-xs mt-1">
            Yeni etkinlik açılınca oy verebilirsiniz. Şu an oylama kapalı.
          </div>
        </div>
      </div>
    );
  }
  if (status === "no_contest") {
    return (
      <div className="text-xs text-zinc-600 font-mono" data-testid="contest-status-none">
        Henüz aktif bir etkinlik yok — admin yeni bir oylama dönemi başlatmalı.
      </div>
    );
  }
  return null;
}
