import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronUp, ArrowLeft, ExternalLink, Clock, Flag } from "lucide-react";
import { api, kickEmbedUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import ReportClipDialog from "../components/ReportClipDialog";

export default function ClipDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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
      }
      qc.invalidateQueries({ queryKey: ["clip", id] });
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Oy verilemedi");
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
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video">
          <iframe
            src={kickEmbedUrl(clip.kick_clip_id)}
            className="w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
            title={clip.title}
            data-testid="clip-detail-iframe"
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-black text-3xl lg:text-5xl tracking-tighter leading-tight" data-testid="clip-detail-title">
              {clip.title}
            </h1>
            <div className="mt-4 flex items-center gap-4 text-sm text-zinc-400 flex-wrap">
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
            whileTap={{ scale: 0.95 }}
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 font-mono font-bold text-lg transition-all ${
              clip.has_voted
                ? "bg-[#53FC18] text-black border-[#53FC18] shadow-[0_0_30px_rgba(83,252,24,0.5)]"
                : "bg-white/5 text-white border-white/10 hover:border-[#53FC18]/50 hover:bg-[#53FC18]/10"
            }`}
            data-testid="clip-detail-vote-btn"
          >
            <ChevronUp className="w-6 h-6" />
            <span data-testid="clip-detail-votes">{clip.votes_count}</span>
            <span className="text-xs uppercase tracking-wider opacity-70">oy</span>
          </motion.button>
        </div>
      </motion.div>

      <ReportClipDialog open={reportOpen} onOpenChange={setReportOpen} clipId={clip.id} clipTitle={clip.title} />
    </div>
  );
}
