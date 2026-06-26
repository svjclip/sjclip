import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ExternalLink, Play, Flag } from "lucide-react";
import { Link } from "react-router-dom";
import { api, kickEmbedUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import ChannelGateDialog from "./ChannelGateDialog";
import ReportClipDialog from "./ReportClipDialog";

export default function ClipCard({ clip, rank }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState(clip.has_voted);
  const [votes, setVotes] = useState(clip.votes_count);
  const [gateOpen, setGateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [missing, setMissing] = useState([]);

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
      }
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.missing_channels) {
        setMissing(detail.missing_channels);
        setGateOpen(true);
      } else {
        toast.error(typeof detail === "string" ? detail : "Oy verilemedi");
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
      className="group relative rounded-2xl bg-[#0A0A0A] border border-white/5 overflow-hidden hover:border-[#53FC18]/30 hover:shadow-[0_0_30px_rgba(83,252,24,0.12)] transition-all duration-300"
      data-testid={`clip-card-${clip.id}`}
    >
      {rank !== undefined && rank < 3 && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-[#53FC18]/40 font-mono text-xs font-bold text-[#53FC18] flex items-center gap-1">
          #{rank + 1}
        </div>
      )}

      <div className="relative aspect-video bg-black overflow-hidden">
        {playing ? (
          <iframe
            src={kickEmbedUrl(clip.kick_clip_id)}
            className="w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
            title={clip.title}
            data-testid={`clip-iframe-${clip.id}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-900 group/play"
            data-testid={`clip-play-${clip.id}`}
          >
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_rgba(83,252,24,0.3),_transparent_60%)]" />
            <div className="relative w-16 h-16 rounded-full bg-[#53FC18] flex items-center justify-center transform transition-transform group-hover/play:scale-110 group-hover/play:shadow-[0_0_40px_rgba(83,252,24,0.6)]">
              <Play className="w-7 h-7 text-black ml-1" fill="black" />
            </div>
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Kick Klip</div>
          </button>
        )}
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

          <div className="flex items-center gap-2">
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
            <motion.button
              onClick={toggleVote}
              disabled={busy}
              whileTap={{ scale: 0.9 }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-sm font-bold transition-all ${
                voted
                  ? "bg-[#53FC18] text-black border-[#53FC18] shadow-[0_0_15px_rgba(83,252,24,0.4)]"
                  : "bg-white/5 text-white border-white/10 hover:border-[#53FC18]/50 hover:bg-[#53FC18]/10"
              }`}
              data-testid={`upvote-btn-${clip.id}`}
            >
              <ChevronUp className="w-4 h-4" />
              <span data-testid={`vote-count-${clip.id}`}>{votes}</span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
    <ChannelGateDialog open={gateOpen} onOpenChange={setGateOpen} missingChannels={missing} onRecheck={recheckGate} busy={busy} />
    <ReportClipDialog open={reportOpen} onOpenChange={setReportOpen} clipId={clip.id} clipTitle={clip.title} />
    </>
  );
}
