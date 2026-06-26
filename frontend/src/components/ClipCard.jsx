import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ExternalLink, Flag, Check, Flame, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import ChannelGateDialog from "./ChannelGateDialog";
import ReportClipDialog from "./ReportClipDialog";
import ReactionBar from "./ReactionBar";
import ShareClipMenu from "./ShareClipMenu";
import KickClipPlayer from "./KickClipPlayer";

export default function ClipCard({ clip, rank, onDeleted }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState(clip.has_voted);
  const [votes, setVotes] = useState(clip.votes_count);
  const [gateOpen, setGateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [missing, setMissing] = useState([]);
  const [showVotedFlash, setShowVotedFlash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hoverTimer = useRef(null);

  const isOwner = user && user.username === clip.submitter_username;
  const isAdmin = user && user.is_admin;
  const canDelete = isOwner || isAdmin;

  // Hover behaviour kept as a stub to preserve API symmetry; auto-play preview
  // is disabled because the HLS player is heavy and we don't want every card
  // streaming on cursor pass-by. User clicks Play to start.
  const handleMouseEnter = () => {};
  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    setBusy(true);
    try {
      await api.delete(`/clips/${clip.id}`);
      toast.success("Klip silindi");
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (onDeleted) onDeleted(clip.id);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Silinemedi"));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const toggleVote = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Oy vermek için giriş yap");
      return;
    }
    setBusy(true);
    try {
      if (voted) {
        const res = await api.delete(`/clips/${clip.id}/vote`);
        setVoted(false);
        setVotes(res.data.votes_count);
      } else {
        const res = await api.post(`/clips/${clip.id}/vote`);
        setVoted(true);
        setVotes(res.data.votes_count);
        // Burst confirmation animation
        setShowVotedFlash(true);
        setTimeout(() => setShowVotedFlash(false), 1100);
      }
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.missing_channels) {
        setMissing(detail.missing_channels);
        setGateOpen(true);
      } else {
        toast.error(formatApiError(detail, "Oy verilemedi"));
      }
    } finally {
      setBusy(false);
    }
  };

  const recheckGate = async () => {
    setBusy(true);
    try {
      const res = await api.get("/auth/check-channels");
      if (res.data.missing_channels?.length === 0) {
        toast.success("Harika! Şimdi tekrar oy verebilirsin.");
        setGateOpen(false);
      } else {
        setMissing(res.data.missing_channels);
        toast.error("Hâlâ eksik kanal(lar) var");
      }
    } catch {
      toast.error("Kontrol başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative rounded-2xl bg-[#0A0A0A] border border-white/5 overflow-hidden hover:border-[#53FC18]/30 hover:shadow-[0_0_30px_rgba(83,252,24,0.12)] transition-all duration-300"
      data-testid={`clip-card-${clip.id}`}
    >
      {rank !== undefined && rank < 3 && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-[#53FC18]/40 font-mono text-xs font-bold text-[#53FC18] flex items-center gap-1">
          #{rank + 1}
        </div>
      )}

      {/* Hot/viral badge — recent vote velocity */}
      {clip.is_hot && (
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          className="absolute top-3 right-3 z-10 px-2 py-1 rounded-md bg-gradient-to-r from-[#FF4E16] to-[#FF8A1A] border border-[#FFAE5E] font-mono text-[10px] font-bold text-white flex items-center gap-1 shadow-[0_0_20px_rgba(255,78,22,0.55)]"
          data-testid={`hot-badge-${clip.id}`}
        >
          <motion.span
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1.1, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <Flame className="w-3 h-3" />
          </motion.span>
          <span>+{clip.votes_last_hour} / 1sa</span>
        </motion.div>
      )}

      {/* Delete button — only for owner or admin */}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className={`absolute z-10 px-2 py-1 rounded-md backdrop-blur-md font-mono text-[10px] font-bold flex items-center gap-1 transition-all ${
            confirmDelete
              ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]"
              : "bg-black/60 text-zinc-400 hover:text-red-400 border border-white/10 hover:border-red-500/50"
          } ${clip.is_hot ? "top-12 right-3" : "top-3 right-3"}`}
          aria-label={confirmDelete ? "Onay için tekrar tıkla" : "Klibi sil"}
          data-testid={`delete-clip-btn-${clip.id}`}
        >
          <Trash2 className="w-3 h-3" />
          <span>{confirmDelete ? "Emin misin?" : "Sil"}</span>
        </button>
      )}

      <div className="relative aspect-video bg-black overflow-hidden">
        <KickClipPlayer clip={clip} />

        {/* Vote confirmation overlay */}
        <AnimatePresence>
          {showVotedFlash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-[#53FC18]/15 backdrop-blur-[2px] pointer-events-none"
              data-testid={`vote-confirm-overlay-${clip.id}`}
            >
              <motion.div
                initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 1.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 16 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-20 h-20 rounded-full bg-[#53FC18] shadow-[0_0_60px_rgba(83,252,24,0.8)] flex items-center justify-center">
                  <Check className="w-12 h-12 text-black" strokeWidth={4} />
                </div>
                <motion.span
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="font-display font-black text-[#53FC18] text-lg uppercase tracking-wider drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]"
                >
                  Oy verildi
                </motion.span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 lg:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/clip/${clip.id}`} className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-base leading-tight tracking-tight line-clamp-2 group-hover:text-[#53FC18] transition-colors" data-testid={`clip-title-${clip.id}`}>
              {clip.title}
            </h3>
          </Link>
          <a
            href={clip.kick_url}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 hover:text-[#53FC18] flex-shrink-0"
            data-testid={`clip-external-${clip.id}`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Kick'te aç"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <ShareClipMenu clipId={clip.id} title={clip.title} />
        </div>

        <div className="flex items-center justify-between">
          <Link
            to={`/profil/${clip.submitter_username}`}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-[#53FC18] transition-colors"
            data-testid={`clip-submitter-link-${clip.id}`}
          >
            <div className="w-6 h-6 rounded-full bg-[#53FC18]/15 flex items-center justify-center text-[#53FC18] text-[10px] font-bold">
              {clip.submitter_username[0].toUpperCase()}
            </div>
            <span data-testid={`clip-submitter-${clip.id}`}>{clip.submitter_username}</span>
          </Link>

          {user && user.username !== clip.submitter_username && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportOpen(true); }}
              className="text-zinc-600 hover:text-[#FFD166] transition-colors p-1.5"
              aria-label="Klibi raporla"
              data-testid={`report-clip-btn-${clip.id}`}
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Full-width vote bar — dominant call-to-action */}
      <motion.button
        onClick={toggleVote}
        disabled={busy}
        whileTap={{ scale: 0.985 }}
        whileHover={!voted ? { backgroundColor: "rgba(83,252,24,0.12)" } : {}}
        animate={voted ? { boxShadow: ["inset 0 0 0 rgba(83,252,24,0)","inset 0 0 24px rgba(0,0,0,0.25)","inset 0 0 0 rgba(83,252,24,0)"] } : {}}
        transition={{ duration: 2.4, repeat: voted ? Infinity : 0, ease: "easeInOut" }}
        className={`relative w-full overflow-hidden border-t font-display font-black uppercase tracking-[0.18em] text-sm h-14 flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 ${
          voted
            ? "bg-gradient-to-r from-[#53FC18] via-[#5cff1f] to-[#42cc13] text-black border-[#53FC18] shadow-[0_0_30px_rgba(83,252,24,0.35)]"
            : "bg-black/40 text-white border-white/10 hover:border-[#53FC18]/50 hover:text-[#53FC18]"
        }`}
        data-testid={`upvote-btn-${clip.id}`}
        aria-pressed={voted}
      >
        <motion.span
          key={voted ? "v" : "u"}
          initial={{ rotate: voted ? -90 : 0, scale: 0.4 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 14 }}
          className="inline-flex"
        >
          {voted ? <Check className="w-5 h-5" strokeWidth={3.5} /> : <ChevronUp className="w-5 h-5" />}
        </motion.span>
        <span>{voted ? "Oyladın" : "Oy Ver"}</span>
        <span className="opacity-50">·</span>
        <motion.span
          key={`count-${votes}`}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="font-mono text-base tabular-nums"
          data-testid={`vote-count-${clip.id}`}
        >
          {votes}
        </motion.span>
      </motion.button>

      <ReactionBar clipId={clip.id} initialReactions={clip.reactions || {}} initialMyReaction={clip.my_reaction} />
    </motion.div>
    <ChannelGateDialog open={gateOpen} onOpenChange={setGateOpen} missingChannels={missing} onRecheck={recheckGate} busy={busy} />
    <ReportClipDialog open={reportOpen} onOpenChange={setReportOpen} clipId={clip.id} clipTitle={clip.title} />
    </>
  );
}
