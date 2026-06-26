import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";

export default function ChannelGateDialog({ open, onOpenChange, missingChannels = [], onRecheck, busy }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A] border border-[#FFD166]/30 text-white sm:max-w-md" data-testid="channel-gate-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight inline-flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#FFD166]" /> Bir adım eksik
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Oy vermek için aşağıdaki Telegram kanal(lar)ına katılman gerekiyor. Katıldıktan sonra "Tekrar Kontrol Et" butonuna bas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2" data-testid="missing-channels-list">
          {missingChannels.map((ch) => {
            const handle = ch.replace(/^@/, "");
            return (
              <a
                key={ch}
                href={`https://t.me/${handle}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#53FC18]/40 hover:bg-[#53FC18]/5 transition-all group"
                data-testid={`channel-link-${handle}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#53FC18]/15 flex items-center justify-center text-[#53FC18] font-bold">
                    {handle[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold">{ch}</div>
                    <div className="text-xs text-zinc-500">Kanala git ve katıl</div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-[#53FC18]" />
              </a>
            );
          })}
        </div>

        <Button
          onClick={onRecheck}
          disabled={busy}
          className="w-full h-12 mt-2 bg-[#53FC18] text-black font-bold hover:bg-[#3ECA0D] hover:shadow-[0_0_25px_rgba(83,252,24,0.45)] rounded-xl"
          data-testid="recheck-channels-btn"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Kontrol ediliyor..." : "Tekrar Kontrol Et"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
