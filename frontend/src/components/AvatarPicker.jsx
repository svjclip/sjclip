import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Check, Send } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

export default function AvatarPicker({ open, onOpenChange }) {
  const { user, refreshUser } = useAuth();
  const [defaults, setDefaults] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api.get("/avatars/defaults").then((r) => setDefaults(r.data.avatars)).catch(() => {});
  }, [open]);

  const pick = async (avatarId) => {
    setBusy(true);
    try {
      await api.post("/user/avatar", { avatar_id: avatarId });
      await refreshUser();
      toast.success("Avatar güncellendi");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Güncellenemedi");
    } finally {
      setBusy(false);
    }
  };

  const isTg = user?.avatar_url?.includes("/api/avatar/");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A] border border-white/10 text-white sm:max-w-lg" data-testid="avatar-picker-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">Avatarını seç</DialogTitle>
          <DialogDescription className="text-zinc-400">Telegram fotoğrafını kullan ya da bir karakter seç.</DialogDescription>
        </DialogHeader>

        <Button
          onClick={() => pick("telegram")}
          disabled={busy}
          className={`w-full h-12 rounded-xl font-bold ${isTg ? "bg-[#53FC18] text-black" : "bg-[#229ED9] text-white hover:bg-[#1d8bc0]"}`}
          data-testid="use-telegram-avatar-btn"
        >
          <Send className="w-4 h-4 mr-2" />
          {isTg ? "Telegram fotoğrafı aktif" : "Telegram fotoğrafımı kullan"}
        </Button>

        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mt-2">veya hazır avatar seç</div>

        <div className="grid grid-cols-4 gap-3" data-testid="default-avatars-grid">
          {defaults.map((a) => {
            const active = user?.avatar_url === a.url;
            return (
              <button
                key={a.id}
                onClick={() => pick(a.id)}
                disabled={busy}
                className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all hover:scale-105 ${
                  active ? "border-[#53FC18] shadow-[0_0_20px_rgba(83,252,24,0.4)]" : "border-white/10 hover:border-white/30"
                }`}
                data-testid={`avatar-option-${a.id}`}
              >
                <img src={a.url} alt="avatar" className="w-full h-full object-cover bg-zinc-900" />
                {active && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#53FC18] flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
