import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Link as LinkIcon, Sparkles } from "lucide-react";
import { api, formatApiError, parseKickClipId } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function SubmitClipDialog({ open, onOpenChange }) {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const [kickUrl, setKickUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Önce giriş yap");
      return;
    }
    const clipId = parseKickClipId(kickUrl);
    if (!clipId) {
      toast.error("Geçersiz Kick linki. Format: kick.com/<yayıncı>/clips/clip_XXXX");
      return;
    }
    if (title.trim().length < 1) {
      toast.error("Bir başlık ekle");
      return;
    }
    setBusy(true);
    try {
      await api.post("/clips", { kick_url: kickUrl.trim(), title: title.trim() });
      toast.success("Klip gönderildi!");
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      setKickUrl("");
      setTitle("");
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      // Gate response from backend: {error: "telegram_required"|"missing_channels"} — refresh auth state,
      // GlobalTelegramGate in App.js will detect missing telegram_id/channels and open the link dialog.
      if (err?.response?.status === 403 && detail && typeof detail === "object") {
        toast.error(detail.error === "telegram_required"
          ? "Önce Telegram hesabını bağlamalısın."
          : "Önce gerekli kanal(lar)a katılmalısın.");
        await refreshUser();
        onOpenChange(false);
        return;
      }
      toast.error(formatApiError(detail, "Gönderim başarısız"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A] border border-white/10 text-white sm:max-w-lg rounded-none" data-testid="submit-clip-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight inline-flex items-center gap-2 uppercase">
            <Sparkles className="w-5 h-5 text-[#53FC18]" /> Klip Gönder
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Bir Kick klip linki yapıştır. Haftanın en çok oy alanı kazanır.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 block">Kick Klip Linki</label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={kickUrl}
                onChange={(e) => setKickUrl(e.target.value)}
                placeholder="https://kick.com/streamer/clips/clip_01H..."
                className="bg-black border-white/10 focus:border-[#53FC18] text-white h-12 pl-9 font-mono text-sm rounded-none"
                data-testid="clip-submit-url-input"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 block">Başlık</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Çılgın 360 no-scope anı"
              className="bg-black border-white/10 focus:border-[#53FC18] text-white h-12 rounded-none"
              data-testid="clip-submit-title-input"
              maxLength={120}
            />
            <div className="text-xs text-zinc-500 mt-1 text-right">{title.length}/120</div>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full h-12 bg-[#53FC18] text-black font-bold hover:bg-[#42cc13] hover:shadow-[0_0_25px_rgba(83,252,24,0.45)] rounded-none uppercase tracking-wider"
            data-testid="clip-submit-btn"
          >
            {busy ? "Gönderiliyor..." : "Klibi Gönder"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
