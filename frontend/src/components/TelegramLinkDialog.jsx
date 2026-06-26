import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Send, ShieldCheck, ExternalLink, ArrowRight, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";

/**
 * Onboarding-time Telegram link dialog.
 * Opens automatically after register (or for legacy users with no telegram_id).
 * Two stages:
 *   1) Bind Telegram (deeplink + 6-char code from bot)
 *   2) Verify all required channel memberships
 * Cannot be dismissed by clicking outside — user must finish or skip via the "later" button.
 */
export default function TelegramLinkDialog({ open, onOpenChange, allowSkip = true }) {
  const { user, verifyTelegramCode, recheckChannels, missingChannels } = useAuth();
  const [botUsername, setBotUsername] = useState("");
  const [stats, setStats] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Stage derived from auth state
  const stage = !user?.telegram_id ? "link" : missingChannels?.length ? "channels" : "done";

  useEffect(() => {
    api.get("/config").then((r) => setBotUsername(r.data.telegram_bot_username || "")).catch(() => {});
  }, []);

  // Fetch community counter when the link stage is active
  useEffect(() => {
    if (open && stage === "link") {
      api.get("/stats/community").then((r) => setStats(r.data)).catch(() => {});
    }
  }, [open, stage]);

  // Auto-close once everything is done
  useEffect(() => {
    if (open && stage === "done") {
      toast.success("Hesabın tam olarak aktif. Artık klip gönderip oy verebilirsin!");
      const t = setTimeout(() => onOpenChange(false), 1200);
      return () => clearTimeout(t);
    }
  }, [stage, open, onOpenChange]);

  const submitCode = async (e) => {
    e?.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      toast.error("Kod 6 karakter olmalı");
      return;
    }
    setBusy(true);
    try {
      const data = await verifyTelegramCode(clean);
      toast.success("Telegram bağlandı");
      setCode("");
      // If channels also OK, dialog will auto-close via effect above
      if (data.missing_channels?.length) {
        toast.message("Şimdi gerekli kanal(lar)a katıl");
      }
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Doğrulama başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    setBusy(true);
    try {
      const data = await recheckChannels();
      if (data && data.missing_channels?.length === 0) {
        toast.success("Tüm kanallara üyesin!");
      } else {
        toast.error("Hâlâ eksik kanal(lar) var");
      }
    } catch {
      toast.error("Kontrol başarısız");
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-bold";

  return (
    <Dialog open={open} onOpenChange={allowSkip ? onOpenChange : () => {}}>
      <DialogContent
        className="bg-[#0A0A0A] border border-[#53FC18]/30 text-white sm:max-w-md rounded-none shadow-[0_0_40px_rgba(83,252,24,0.1)]"
        onPointerDownOutside={(e) => !allowSkip && e.preventDefault()}
        onEscapeKeyDown={(e) => !allowSkip && e.preventDefault()}
        hideClose={!allowSkip}
        data-testid="tg-link-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight uppercase">
            {stage === "link" && (<><span className="text-[#53FC18]">Telegram</span>'ı Bağla</>)}
            {stage === "channels" && (<><span className="text-[#53FC18]">Kanallara</span> Katıl</>)}
            {stage === "done" && (<><span className="text-[#53FC18]">Tamamlandı!</span></>)}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {stage === "link" && "Hesabın artık var. Klip gönderip oy verebilmek için Telegram hesabını bağla. Bu bağlantı kalıcıdır."}
            {stage === "channels" && "Son adım: oy verebilmek için aşağıdaki Telegram kanal(lar)ına katılman gerek."}
            {stage === "done" && "Hesabın tam olarak hazır."}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center gap-2" data-testid="tg-link-progress">
          <div className={`h-1 flex-1 ${stage !== "link" ? "bg-[#53FC18]" : "bg-[#53FC18]/30"}`} />
          <div className={`h-1 flex-1 ${stage === "done" ? "bg-[#53FC18]" : stage === "channels" ? "bg-[#53FC18]/60" : "bg-white/10"}`} />
        </div>

        {stage === "link" && (
          <>
            {stats && stats.next_position && (
              <div
                className="border border-[#53FC18]/30 bg-gradient-to-r from-[#53FC18]/10 to-transparent p-3 rounded-none"
                data-testid="tg-link-community-counter"
              >
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#53FC18] mb-1">Arenada</div>
                <div className="font-display font-black text-lg leading-tight">
                  Telegram'ı bağlayan{" "}
                  <span className="text-[#53FC18] text-2xl">#{stats.telegram_linked + 1}</span>'inci<br />
                  kişi sen ol.
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  Şu an {stats.total_members} kayıtlı, {stats.telegram_linked} aktif üye.
                </div>
              </div>
            )}
            <div className="border border-[#53FC18]/20 bg-[#53FC18]/5 p-3 flex gap-2 text-xs text-zinc-300 rounded-none">
              <ShieldCheck className="w-4 h-4 text-[#53FC18] flex-shrink-0 mt-0.5" />
              <span>Profil/telefon paylaşımı yok. Bota /start yazıp aldığın kodu buraya yapıştır.</span>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 bg-[#53FC18] text-black font-bold flex items-center justify-center text-sm flex-shrink-0">1</div>
              <div className="flex-1">
                <div className={labelCls + " mb-2"}>Bota git ve <span className="text-[#53FC18]">/start</span> yaz</div>
                <a
                  href={botUsername ? `https://t.me/${botUsername}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 w-full justify-center px-4 py-3 bg-[#229ED9] hover:bg-[#1d8bc0] text-white font-bold transition-all"
                  data-testid="tg-link-bot-deeplink"
                >
                  <Send className="w-4 h-4" />
                  @{botUsername || "..."} botunu aç
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 bg-[#53FC18] text-black font-bold flex items-center justify-center text-sm flex-shrink-0">2</div>
              <div className="flex-1">
                <div className={labelCls + " mb-2"}>6 haneli kodu yapıştır</div>
                <form onSubmit={submitCode} className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    className="bg-black border-white/10 focus:border-[#53FC18] text-white h-12 font-mono text-center text-lg tracking-[0.4em] uppercase rounded-none"
                    data-testid="tg-link-code-input"
                  />
                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-12 px-5 bg-[#53FC18] text-black font-bold hover:bg-[#42cc13] rounded-none"
                    data-testid="tg-link-verify-btn"
                  >
                    {busy ? "..." : (<>Doğrula <ArrowRight className="w-4 h-4 ml-1" /></>)}
                  </Button>
                </form>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 text-center font-mono">Kod 15 dakika geçerli</p>
          </>
        )}

        {stage === "channels" && (
          <>
            <div className="border border-[#FFD166]/20 bg-[#FFD166]/5 p-3 flex gap-2 text-xs text-zinc-300 rounded-none">
              <AlertTriangle className="w-4 h-4 text-[#FFD166] flex-shrink-0 mt-0.5" />
              <span>Aşağıdaki kanal(lar)a katıl, ardından "Tekrar Kontrol Et" butonuna bas.</span>
            </div>
            <div className="space-y-2" data-testid="tg-link-channels-list">
              {(missingChannels || []).map((ch) => {
                const handle = ch.replace(/^@/, "");
                return (
                  <a
                    key={ch}
                    href={`https://t.me/${handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-3 bg-white/5 border border-white/10 hover:border-[#53FC18]/40 hover:bg-[#53FC18]/5 transition-all group"
                    data-testid={`tg-link-channel-${handle}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#53FC18]/15 flex items-center justify-center text-[#53FC18] font-bold uppercase">
                        {handle[0]}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{ch}</div>
                        <div className="text-[11px] text-zinc-500">Kanala git ve katıl</div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-[#53FC18]" />
                  </a>
                );
              })}
            </div>
            <Button
              onClick={recheck}
              disabled={busy}
              className="w-full h-12 bg-[#53FC18] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42cc13]"
              data-testid="tg-link-recheck-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`} />
              {busy ? "Kontrol ediliyor..." : "Tekrar Kontrol Et"}
            </Button>
          </>
        )}

        {stage === "done" && (
          <div className="flex flex-col items-center justify-center py-6 gap-3" data-testid="tg-link-done">
            <CheckCircle2 className="w-14 h-14 text-[#53FC18]" />
            <p className="text-sm text-zinc-300 text-center">
              Tüm gereksinimler tamamlandı. Artık klip gönderebilir ve oy verebilirsin.
            </p>
          </div>
        )}

        {allowSkip && stage !== "done" && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mx-auto"
            data-testid="tg-link-later-btn"
          >
            Daha sonra
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
