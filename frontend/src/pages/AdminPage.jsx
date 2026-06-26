import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShieldCheck, AlertTriangle, Trash2, Eye, CheckCircle2, Users, Send, Film, ThumbsUp, Flame } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import PrizeSettings from "../components/PrizeSettings";

function StatTile({ icon: Icon, label, value, accent, testid }) {
  return (
    <div
      className={`border p-4 ${accent ? "border-[#53FC18]/30 bg-[#53FC18]/5" : "border-white/5 bg-[#0A0A0A]"}`}
      data-testid={testid}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent ? "text-[#53FC18]" : "text-zinc-500"}`} />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{label}</span>
      </div>
      <div className={`font-display font-black text-3xl tracking-tighter ${accent ? "text-[#53FC18]" : "text-white"}`}>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const [actingId, setActingId] = useState(null);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
    enabled: !!user && !!user.is_admin,
    retry: 0,
  });

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: async () => (await api.get(`/admin/reports?status=${filter}`)).data,
    enabled: !!user && !!user.is_admin,
    retry: 0,
  });

  if (loading) {
    return <div className="pt-32 pb-20 max-w-6xl mx-auto px-6 lg:px-8 text-zinc-500" data-testid="admin-loading">Yükleniyor...</div>;
  }
  if (!user || !user.is_admin) {
    return (
      <div className="pt-32 pb-20 max-w-3xl mx-auto px-6 lg:px-8 text-center" data-testid="admin-forbidden">
        <ShieldCheck className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
        <h1 className="font-display font-black text-3xl mb-2">Yetkin yok</h1>
        <p className="text-zinc-500">Bu sayfa sadece yöneticiler içindir.</p>
      </div>
    );
  }

  const handleResolve = async (reportId, action) => {
    setActingId(reportId);
    try {
      await api.post(`/admin/reports/${reportId}/resolve`, { action });
      toast.success(action === "delete_clip" ? "Klip silindi, rapor kapatıldı" : "Rapor kapatıldı");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["clips"] });
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "İşlem başarısız"));
    } finally {
      setActingId(null);
    }
  };

  const reports = reportsData?.reports || [];

  return (
    <div className="pt-28 pb-20 max-w-6xl mx-auto px-6 lg:px-8" data-testid="admin-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#53FC18] mb-2">Admin</div>
        <h1 className="font-display font-black text-4xl lg:text-5xl tracking-tighter inline-flex items-center gap-3">
          <ShieldCheck className="w-9 h-9 text-[#53FC18]" /> Kontrol Paneli
        </h1>
        <p className="text-zinc-500 mt-2">Gerçek (şişirilmemiş) istatistikler ve açık raporlar.</p>
      </motion.div>

      {/* STATS */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10" data-testid="admin-stats-grid">
          <StatTile icon={Users} label="Üye" value={stats.users_total} testid="admin-stat-users" />
          <StatTile icon={Send} label="Telegram'a Bağlı" value={stats.users_with_telegram} testid="admin-stat-tg" />
          <StatTile icon={Film} label="Klip" value={stats.clips_total} testid="admin-stat-clips" />
          <StatTile icon={Flame} label="Bu Hafta" value={stats.clips_this_week} accent testid="admin-stat-week" />
          <StatTile icon={ThumbsUp} label="Toplam Oy" value={stats.votes_total} testid="admin-stat-votes" />
          <StatTile icon={AlertTriangle} label="Açık Rapor" value={stats.reports_open} accent testid="admin-stat-open-reports" />
          <StatTile icon={CheckCircle2} label="Kapanan Rapor" value={stats.reports_resolved} testid="admin-stat-resolved" />
        </div>
      )}

      {/* PRIZE SETTINGS */}
      <PrizeSettings />

      {/* REPORTS */}
      <div className="flex items-end justify-between mb-4">
        <h2 className="font-display font-black text-2xl tracking-tighter inline-flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#FFD166]" /> Raporlar
        </h2>
        <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10" data-testid="admin-filter-tabs">
          {["open", "resolved", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                filter === s ? "bg-[#53FC18] text-black" : "text-zinc-400 hover:text-white"
              }`}
              data-testid={`admin-filter-${s}`}
            >
              {s === "open" ? "Açık" : s === "resolved" ? "Kapatılan" : "Hepsi"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-zinc-500 py-12 text-center">Yükleniyor...</div>
      ) : reports.length === 0 ? (
        <div className="border border-dashed border-white/10 p-12 text-center" data-testid="admin-no-reports">
          <CheckCircle2 className="w-8 h-8 text-[#53FC18] mx-auto mb-3" />
          <p className="text-zinc-400 font-bold">Bekleyen rapor yok.</p>
          <p className="text-zinc-600 text-sm mt-1">Topluluk şu an temiz.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="admin-reports-list">
          {reports.map((r) => (
            <div
              key={r.id}
              className={`border p-4 rounded-none ${r.status === "open" ? "border-[#FFD166]/30 bg-[#FFD166]/5" : "border-white/10 bg-[#0A0A0A]"}`}
              data-testid={`admin-report-${r.id}`}
            >
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 ${
                      r.status === "open" ? "bg-[#FFD166] text-black" : "bg-white/10 text-zinc-400"
                    }`}>{r.status === "open" ? "Açık" : "Kapatılan"}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{new Date(r.created_at).toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="font-bold text-sm">
                    Klip: <span className="text-[#53FC18]">{r.clip?.title || "(silinmiş)"}</span>
                    {r.clip?.submitter_username && <span className="text-zinc-500 font-normal"> · @{r.clip.submitter_username}</span>}
                    {r.clip && <span className="text-zinc-600 font-mono text-xs ml-2">· {r.clip.votes_count} oy</span>}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">Bildiren: @{r.reporter_username}</div>
                  <div className="mt-2 p-2 bg-black/40 border border-white/5 text-sm text-zinc-300 italic">&quot;{r.reason}&quot;</div>
                  {r.status === "resolved" && r.resolution && (
                    <div className="text-[11px] text-zinc-500 mt-2">
                      Karar: <span className="text-zinc-400 font-mono">{r.resolution}</span>
                    </div>
                  )}
                </div>
                {r.status === "open" && (
                  <div className="flex flex-col gap-2 md:w-48">
                    {r.clip && (
                      <a
                        href={r.clip.kick_url}
                        target="_blank"
                        rel="noreferrer"
                        className="h-9 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-bold border border-white/10 hover:border-white/30 text-zinc-300"
                        data-testid={`admin-view-clip-${r.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" /> Klibi gör
                      </a>
                    )}
                    <Button
                      onClick={() => handleResolve(r.id, "ignore")}
                      disabled={actingId === r.id}
                      className="h-9 bg-white/5 text-zinc-300 hover:bg-white/10 border border-white/10 rounded-none text-xs font-bold uppercase tracking-wider"
                      data-testid={`admin-ignore-${r.id}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Yok say
                    </Button>
                    <Button
                      onClick={() => handleResolve(r.id, "delete_clip")}
                      disabled={actingId === r.id || !r.clip}
                      className="h-9 bg-red-600 text-white hover:bg-red-700 rounded-none text-xs font-bold uppercase tracking-wider"
                      data-testid={`admin-delete-clip-${r.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Klibi sil
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
