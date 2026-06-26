import React, { useState } from "react";
import { Send, Megaphone } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/**
 * Admin tool: send a custom notification to every registered user's
 * in-app bell + persisted /notifications/me feed.
 */
export default function BroadcastForm() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim() || !message.trim()) return;
    if (!window.confirm("Tüm kullanıcılara bu bildirimi göndermek istediğine emin misin?")) return;
    setBusy(true);
    try {
      const r = await api.post("/admin/notifications/broadcast", {
        title: title.trim(),
        message: message.trim(),
        link: link.trim() || null,
      });
      toast.success(`Bildirim gönderildi (${r.data.sent} kullanıcı)`);
      setTitle("");
      setMessage("");
      setLink("");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Gönderilemedi"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="border border-[#5EBEEA]/25 bg-[#5EBEEA]/[0.03] p-6 rounded-none mb-10"
      data-testid="admin-broadcast-form"
    >
      <div className="flex items-center gap-3 mb-1">
        <Megaphone className="w-5 h-5 text-[#5EBEEA]" />
        <h2 className="font-display font-black text-2xl tracking-tighter">Bildirim Gönder</h2>
      </div>
      <p className="text-zinc-500 text-sm mb-5">
        Tüm üyelerin bildirim ekranına anında ulaşır. Zilde okunmamış sayacı artar.
      </p>

      <div className="grid gap-4">
        <div>
          <FieldLabel>Başlık</FieldLabel>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn: Yeni etkinlik başladı!"
            maxLength={120}
            className="bg-black border-white/10 focus:border-[#5EBEEA] text-white h-11 rounded-none"
            data-testid="broadcast-title-input"
          />
          <Counter v={title.length} max={120} />
        </div>
        <div>
          <FieldLabel>Mesaj</FieldLabel>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Bildirim metni..."
            maxLength={500}
            rows={3}
            className="bg-black border-white/10 focus:border-[#5EBEEA] text-white rounded-none resize-none"
            data-testid="broadcast-message-input"
          />
          <Counter v={message.length} max={500} />
        </div>
        <div>
          <FieldLabel>Bağlantı (opsiyonel)</FieldLabel>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="örn: /clip/abc-123 veya /leaderboard"
            className="bg-black border-white/10 focus:border-[#5EBEEA] text-white h-11 rounded-none"
            data-testid="broadcast-link-input"
          />
        </div>

        <Button
          onClick={send}
          disabled={busy || !title.trim() || !message.trim()}
          className="self-start h-11 px-5 bg-[#5EBEEA] text-black font-bold uppercase tracking-wider rounded-none hover:bg-[#42a8d4] disabled:opacity-50"
          data-testid="broadcast-send-btn"
        >
          <Send className="w-4 h-4 mr-2" />
          {busy ? "Gönderiliyor..." : "Tüm Kullanıcılara Gönder"}
        </Button>
      </div>
    </section>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-1.5 block">
      {children}
    </label>
  );
}

function Counter({ v, max }) {
  return <div className="text-[10px] text-zinc-600 mt-1 font-mono">{v}/{max}</div>;
}
