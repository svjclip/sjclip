import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ArrowLeft, ExternalLink, Clock, Flag, Check } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import ReportClipDialog from "../components/ReportClipDialog";
import ShareClipMenu from "../components/ShareClipMenu";
import KickClipPlayer from "../components/KickClipPlayer";

export default function ClipDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [showVotedFlash, setShowVotedFlash] = useState(false);

  const { data: clip, isLoading } = useQuery({
    queryKey: ["clip", id],
    queryFn: async () => (await api.get(`/clips/${id}`)).data,
  });

  const toggleVote = async () => {
    if (!user) {
      toast.error("Oy vermek için giriş yap");
      return;
    }
    setBusy(true);
    try {
      if (clip.has_voted) {
        await api.delete(`/clips/${clip.id}/vote`);
      } else {
        await api.post(`/clips/${clip.id}/vote`);
        setShowVotedFlash(true);
        setTimeout(() => setShowVotedFlash(false), 1100);
      }
      qc.invalidateQueries({ queryKey: ["clip", id] });
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Oy verilemedi"));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !clip) {
    return (
      <div className="pt-32 pb-20 max-w-5xl mx-auto px-6 lg:px-8" data-testid="clip-detail-loading">
        <div className="aspect-video bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="pt-28 pb-20 max-w-5xl mx-auto px-6 lg:px-8" data-testid="clip-detail-page">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-6" data-testid="back-link">
        <ArrowLeft className="w-4 h-4" /> Akışa dön
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video">
          <KickClipPlayer clip={clip} autoPlay />
          <AnimatePresence>
            {showVotedFlash && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-[#53FC18]/15 backdrop-blur-[2px] pointer-events-none"
                data-testid="clip-detail-vote-confirm"
              >
                <motion.div
                  initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 1.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 16 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-24 h-24 rounded-full bg-[#53FC18] shadow-[0_0_70px_rgba(83,252,24,0.8)] flex items-center justify-center">
                    <Check className="w-14 h-14 text-black" strokeWidth={4} />
                  </div>
                  <span className="font-display font-black text-[#53FC18] text-xl uppercase tracking-wider drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]">
                    Oy verildi
                  </span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <h1 className="font-display font-black text-3xl lg:text-5xl tracking-tighter leading-tight" data-testid="clip-detail-title">
            {clip.title}
          </h1>
          <div className="flex items-center gap-4 text-sm text-zinc-400 flex-wrap">
            <Link
              to={`/profil/${clip.submitter_username}`}
              className="flex items-center gap-2 hover:text-[#53FC18] transition-colors"
              data-testid="clip-detail-submitter-link"
            >
              <div className="w-7 h-7 rounded-full bg-[#53FC18]/20 flex items-center justify-center text-[#53FC18] text-xs font-bold">
                {clip.submitter_username[0].toUpperCase()}
              </div>
              <span>{clip.submitter_username}</span>
            </Link>
            <span className="text-zinc-700">•</span>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {new Date(clip.created_at).toLocaleDateString()}
            </div>
            <a href={clip.kick_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#53FC18]" data-testid="clip-detail-kick-link">
              <ExternalLink className="w-4 h-4" /> Kick
            </a>
            <ShareClipMenu clipId={clip.id} title={clip.title} />
            {user && user.username !== clip.submitter_username && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="inline-flex items-center gap-1 text-zinc-500 hover:text-[#FFD166] transition-colors"
                data-testid="clip-detail-report-btn"
              >
                <Flag className="w-4 h-4" /> Raporla
              </button>
            )}
          </div>
        </div>

        <motion.button
          onClick={toggleVote}
          disabled={busy}
          whileTap={{ scale: 0.985 }}
          whileHover={!clip.has_voted ? { backgroundColor: "rgba(83,252,24,0.12)" } : {}}
          animate={clip.has_voted ? { boxShadow: ["inset 0 0 0 rgba(83,252,24,0)","inset 0 0 40px rgba(0,0,0,0.25)","inset 0 0 0 rgba(83,252,24,0)"] } : {}}
          transition={{ duration: 2.4, repeat: clip.has_voted ? Infinity : 0, ease: "easeInOut" }}
          className={`relative w-full overflow-hidden border font-display font-black uppercase tracking-[0.18em] text-base h-16 flex items-center justify-center gap-3 rounded-2xl transition-colors disabled:opacity-60 ${
            clip.has_voted
              ? "bg-gradient-to-r from-[#53FC18] via-[#5cff1f] to-[#42cc13] text-black border-[#53FC18] shadow-[0_0_40px_rgba(83,252,24,0.45)]"
              : "bg-white/5 text-white border-white/10 hover:border-[#53FC18]/50 hover:text-[#53FC18]"
          }`}
          data-testid="clip-detail-vote-btn"
          aria-pressed={clip.has_voted}
        >
          <motion.span
            key={clip.has_voted ? "v" : "u"}
            initial={{ rotate: clip.has_voted ? -90 : 0, scale: 0.4 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 14 }}
            className="inline-flex"
          >
            {clip.has_voted ? <Check className="w-6 h-6" strokeWidth={3.5} /> : <ChevronUp className="w-6 h-6" />}
          </motion.span>
          <span>{clip.has_voted ? "Oyladın" : "Oy Ver"}</span>
          <span className="opacity-50">·</span>
          <motion.span
            key={`detail-count-${clip.votes_count}`}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="font-mono text-lg tabular-nums"
            data-testid="clip-detail-votes"
          >
            {clip.votes_count}
          </motion.span>
        </motion.button>
      </motion.div>

      <ReportClipDialog open={reportOpen} onOpenChange={setReportOpen} clipId={clip.id} clipTitle={clip.title} />
    </div>
  );
}
