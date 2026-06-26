import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Flag, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";

const PRESET_REASONS = [
  "Spam veya alakasız içerik",
  "Uygunsuz/saldırgan içerik",
  "Telif hakkı ihlali",
  "Tekrar gönderilmiş klip",
  "Yanıltıcı başlık",
];

export default function ReportClipDialog({ open, onOpenChange, clipId, clipTitle }) {
  const [preset, setPreset] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const reason = [preset, extra.trim()].filter(Boolean).join(" — ") || extra.trim() || preset;
    if (!reason || reason.length < 3) {
      toast.error("Lütfen bir sebep seç veya yaz");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/clips/${clipId}/report`, { reason });
      toast.success("Rapor alındı. İncelenmek üzere kaydedildi.");
      setPreset("");
      setExtra("");
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Rapor gönderilemedi"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0A0A0A] border border-[#FFD166]/30 text-white sm:max-w-md rounded-none"
        data-testid="report-clip-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight inline-flex items-center gap-2 uppercase">
            <AlertTriangle className="w-5 h-5 text-[#FFD166]" /> Klibi Raporla
          </DialogTitle>
          <DialogDescription className="text-zinc-400 line-clamp-2">
            "{clipTitle}" — bu klibi neden raporluyorsun?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-1" data-testid="report-reasons">
          {PRESET_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setPreset(r)}
              className={`w-full text-left px-3 py-2.5 border text-sm transition-all ${
                preset === r
                  ? "border-[#FFD166] bg-[#FFD166]/10 text-white"
                  : "border-white/10 hover:border-white/30 text-zinc-300"
              }`}
              data-testid={`report-reason-${r.slice(0, 12).replace(/\s/g, "-")}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-bold">Ek Detay (isteğe bağlı)</label>
          <Textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Daha fazla bağlam yaz..."
            maxLength={400}
            rows={3}
            className="bg-black border-white/10 focus:border-[#FFD166] text-white mt-1 rounded-none"
            data-testid="report-extra-input"
          />
          <div className="text-[10px] text-zinc-600 mt-1 text-right">{extra.length}/400</div>
        </div>

        <Button
          onClick={submit}
          disabled={busy}
          className="w-full h-12 bg-[#FFD166] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#e8b94e]"
          data-testid="report-submit-btn"
        >
          <Flag className="w-4 h-4 mr-2" />
          {busy ? "Gönderiliyor..." : "Raporu Gönder"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
