import React, { useState } from "react";
import { motion } from "framer-motion";
import { Heart, ChevronUp, Plus } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const EMOJIS = ["🔥", "👏", "😂", "😱", "❤️"];

/**
 * Compact emoji reaction bar shown under each clip card.
 * - Click an emoji to set/replace your reaction
 * - Click your active emoji to remove it
 * - Counts persist per emoji
 */
export default function ReactionBar({ clipId, initialReactions = {}, initialMyReaction = null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [counts, setCounts] = useState({ ...initialReactions });
  const [mine, setMine] = useState(initialMyReaction);
  const [busy, setBusy] = useState(null);

  const handle = async (emoji) => {
    if (!user) {
      toast.error("Reaksiyon vermek için giriş yap");
      return;
    }
    setBusy(emoji);
    const prev = mine;
    // Optimistic update
    const next = { ...counts };
    if (prev === emoji) {
      // remove
      next[prev] = Math.max(0, (next[prev] || 0) - 1);
      setCounts(next);
      setMine(null);
      try {
        await api.delete(`/clips/${clipId}/reactions`);
      } catch (err) {
        toast.error(formatApiError(err?.response?.data?.detail, "Kaldırılamadı"));
        setCounts({ ...counts });
        setMine(prev);
      }
    } else {
      if (prev) next[prev] = Math.max(0, (next[prev] || 0) - 1);
      next[emoji] = (next[emoji] || 0) + 1;
      setCounts(next);
      setMine(emoji);
      try {
        await api.post(`/clips/${clipId}/reactions`, { emoji });
        qc.invalidateQueries({ queryKey: ["events"] });
      } catch (err) {
        toast.error(formatApiError(err?.response?.data?.detail, "Eklenemedi"));
        setCounts({ ...counts });
        setMine(prev);
      }
    }
    setBusy(null);
  };

  return (
    <div className="px-4 py-2.5 border-t border-white/5 bg-black/30 flex items-center gap-1.5 flex-wrap" data-testid={`reactions-${clipId}`}>
      {EMOJIS.map((em) => {
        const c = counts[em] || 0;
        const active = mine === em;
        return (
          <motion.button
            key={em}
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handle(em); }}
            whileTap={{ scale: 0.88 }}
            disabled={busy === em}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-mono border transition-colors ${
              active
                ? "bg-[#53FC18]/15 border-[#53FC18]/50 text-[#53FC18]"
                : c > 0
                ? "bg-white/5 border-white/10 text-zinc-300 hover:border-white/30"
                : "bg-transparent border-white/5 text-zinc-600 hover:text-white hover:border-white/20"
            }`}
            data-testid={`reaction-${em}-${clipId}`}
            aria-pressed={active}
          >
            <span className="text-sm leading-none">{em}</span>
            {c > 0 && <span className="font-bold tabular-nums">{c}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
