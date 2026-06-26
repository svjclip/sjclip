import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, RefreshCw, Sparkles, ChevronUp, Upload } from "lucide-react";
import { api } from "../lib/api";

const VERB = {
  clip_submitted: { label: "klip gönderdi", icon: Upload, accent: "text-[#53FC18]" },
  vote_cast: { label: "oy verdi", icon: ChevronUp, accent: "text-[#53FC18]" },
  reaction_added: { label: "tepki bıraktı", icon: Sparkles, accent: "text-[#FFD166]" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}sn`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

function EventRow({ ev }) {
  const v = VERB[ev.type] || { label: ev.type, icon: Activity, accent: "text-zinc-400" };
  const Icon = v.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-3 p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
      data-testid={`event-${ev.id}`}
    >
      <Link to={`/profil/${ev.actor_username}`} className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#53FC18]/15 flex items-center justify-center text-[#53FC18] font-bold border border-white/10 hover:ring-2 hover:ring-[#53FC18]/50 transition-all">
          {ev.actor_avatar_url ? (
            <img src={ev.actor_avatar_url} alt={ev.actor_username} className="w-full h-full object-cover" />
          ) : (
            ev.actor_username[0].toUpperCase()
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="text-sm flex flex-wrap items-baseline gap-x-1.5">
          <Link to={`/profil/${ev.actor_username}`} className="font-bold text-white hover:text-[#53FC18] transition-colors" data-testid="event-actor">
            {ev.actor_username}
          </Link>
          <span className={`text-xs uppercase tracking-wider font-mono ${v.accent} inline-flex items-center gap-1`}>
            <Icon className="w-3 h-3" /> {v.label}
          </span>
          {ev.reaction_emoji && <span className="text-base ml-0.5">{ev.reaction_emoji}</span>}
          <span className="text-[10px] text-zinc-600 font-mono ml-auto">{timeAgo(ev.created_at)} önce</span>
        </div>
        {ev.clip_id && ev.clip_title && (
          <Link
            to={`/clip/${ev.clip_id}`}
            className="mt-1.5 block group"
            data-testid="event-clip-link"
          >
            <div className="px-3 py-2 bg-white/5 border border-white/10 hover:border-[#53FC18]/40 hover:bg-[#53FC18]/5 transition-all">
              <div className="font-bold text-sm text-zinc-200 group-hover:text-[#53FC18] line-clamp-1 transition-colors">
                {ev.clip_title}
              </div>
              {ev.clip_submitter_username && (
                <div className="text-[11px] text-zinc-500 mt-0.5">@{ev.clip_submitter_username}</div>
              )}
            </div>
          </Link>
        )}
      </div>
    </motion.div>
  );
}

export default function TimelinePage() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["events"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "30" });
      if (pageParam) params.set("before", pageParam);
      return (await api.get(`/events?${params}`)).data;
    },
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    refetchOnWindowFocus: false,
  });

  const events = data?.pages.flatMap((p) => p.events) || [];

  const refresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["events"] });
    setTimeout(() => setRefreshing(false), 400);
  };

  return (
    <div className="pt-28 pb-20 max-w-3xl mx-auto px-6 lg:px-8" data-testid="timeline-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-end justify-between"
      >
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#53FC18] mb-2">Akış</div>
          <h1 className="font-display font-black text-4xl lg:text-5xl tracking-tighter inline-flex items-center gap-3">
            <Activity className="w-8 h-8 text-[#53FC18]" /> Zaman Çizelgesi
          </h1>
          <p className="text-zinc-500 mt-2 text-sm">Tüm topluluk aktivitesi — kim ne yaptı, ne zaman yaptı.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-bold border border-white/10 hover:border-[#53FC18]/40 text-zinc-400 hover:text-[#53FC18] transition-colors"
          data-testid="timeline-refresh-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Yenile
        </button>
      </motion.div>

      <div className="border border-white/5 bg-[#0A0A0A] rounded-none" data-testid="timeline-list">
        {isLoading ? (
          <div className="p-8 text-center text-zinc-500" data-testid="timeline-loading">Yükleniyor...</div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center" data-testid="timeline-empty">
            <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 font-bold">Henüz hareket yok.</p>
            <p className="text-zinc-600 text-sm mt-1">İlk klibi gönderen sen ol.</p>
          </div>
        ) : (
          <AnimatePresence>
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {hasNextPage && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="px-6 py-3 border border-white/10 hover:border-[#53FC18]/40 text-sm font-bold uppercase tracking-wider hover:text-[#53FC18] transition-colors"
            data-testid="timeline-load-more-btn"
          >
            Daha fazla göster
          </button>
        </div>
      )}
    </div>
  );
}
