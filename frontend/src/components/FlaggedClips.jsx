import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, AlertOctagon, Trash2, ShieldCheck, ExternalLink } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";

/**
 * Admin "Bayraklı Klipler" panel.
 * Lists clips auto-flagged by the anti-abuse system (rapid vote bursts).
 * Admin can either clear the flag or delete the clip.
 */
export default function FlaggedClips() {
  const qc = useQueryClient();
  const [actingId, setActingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-flagged-clips"],
    queryFn: async () => (await api.get("/admin/flagged-clips")).data,
    refetchInterval: 15000,
  });

  const clips = data?.clips || [];

  async function handleClear(clipId) {
    setActingId(clipId);
    try {
      await api.post(`/admin/flagged-clips/${clipId}/clear`);
      toast.success("Bayrak kaldırıldı.");
      qc.invalidateQueries({ queryKey: ["admin-flagged-clips"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setActingId(null);
    }
  }

  async function handleDelete(clipId) {
    if (!window.confirm("Bu klibi kalıcı olarak silmek istediğine emin misin?")) return;
    setActingId(clipId);
    try {
      await api.delete(`/clips/${clipId}`);
      toast.success("Klip silindi.");
      qc.invalidateQueries({ queryKey: ["admin-flagged-clips"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setActingId(null);
    }
  }

  return (
    <section className="mb-10" data-testid="admin-flagged-section">
      <div className="flex items-end justify-between mb-4">
        <h2 className="font-display font-black text-2xl tracking-tighter inline-flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-red-500" /> Bayraklı Klipler
          {clips.length > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-red-600 text-white" data-testid="flagged-count">
              {clips.length}
            </span>
          )}
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
          Otomatik · 60sn&apos;de 10+ oy
        </span>
      </div>

      {isLoading ? (
        <div className="text-zinc-500 py-8 text-center text-sm">Yükleniyor...</div>
      ) : clips.length === 0 ? (
        <div className="border border-dashed border-white/10 p-8 text-center" data-testid="admin-no-flagged">
          <ShieldCheck className="w-7 h-7 text-[#53FC18] mx-auto mb-2" />
          <p className="text-zinc-400 text-sm font-bold">Bayraklı klip yok.</p>
          <p className="text-zinc-600 text-xs mt-1">Anti-abuse sistemi sessiz, her şey yolunda.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="admin-flagged-list">
          {clips.map((c) => (
            <div
              key={c.id}
              className="border border-red-500/30 bg-red-500/5 p-4"
              data-testid={`admin-flagged-${c.id}`}
            >
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 bg-red-600 text-white inline-flex items-center gap-1">
                      <Flag className="w-3 h-3" /> Şüpheli
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {c.flagged_at ? new Date(c.flagged_at).toLocaleString("tr-TR") : ""}
                    </span>
                  </div>
                  <div className="font-bold text-sm truncate">
                    <span className="text-[#53FC18]">{c.title}</span>
                    <span className="text-zinc-500 font-normal"> · @{c.submitter_username}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Toplam oy: <span className="text-zinc-300 font-mono">{c.votes_count}</span>
                    {" · "}Son 60sn: <span className="text-red-400 font-mono font-bold">{c.votes_last_minute}</span>
                  </div>
                  {c.flag_reason && (
                    <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                      Sebep: <span className="text-zinc-400">{c.flag_reason}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 md:w-48">
                  <a
                    href={c.kick_url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-bold border border-white/10 hover:border-white/30 text-zinc-300"
                    data-testid={`admin-flagged-view-${c.id}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Klibi gör
                  </a>
                  <Button
                    onClick={() => handleClear(c.id)}
                    disabled={actingId === c.id}
                    className="h-9 bg-white/5 text-zinc-300 hover:bg-white/10 border border-white/10 rounded-none text-xs font-bold uppercase tracking-wider"
                    data-testid={`admin-flagged-clear-${c.id}`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Bayrağı kaldır
                  </Button>
                  <Button
                    onClick={() => handleDelete(c.id)}
                    disabled={actingId === c.id}
                    className="h-9 bg-red-600 text-white hover:bg-red-700 rounded-none text-xs font-bold uppercase tracking-wider"
                    data-testid={`admin-flagged-delete-${c.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Klibi sil
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
