import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, AlertOctagon } from "lucide-react";
import { api } from "../lib/api";
import WinnerHero from "./WinnerHero";

/**
 * Displays one of three states based on /api/contests/active:
 *   - "active"     : countdown style status badge ("Etkinlik aktif — N gün kaldı")
 *   - "ended"      : warning banner ("Etkinlik kapalı, yeni etkinlik açılınca oy verebilirsiniz")
 *   - "no_contest" : muted hint
 * If a winner is announced, an editorial WinnerHero card is rendered above.
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
