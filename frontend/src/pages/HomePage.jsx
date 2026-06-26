import React, { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Trophy, Flame, Sparkles, ArrowRight, ArrowDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Hero3D from "../components/Hero3D";
import ClipCard from "../components/ClipCard";
import HowItWorks from "../components/HowItWorks";
import PrizeReveal from "../components/PrizeReveal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import LoginDialog from "../components/LoginDialog";
import SubmitClipDialog from "../components/SubmitClipDialog";

export default function HomePage({ streamerName }) {
  const { user, missingChannels } = useAuth();
  const fullyOnboarded = !!user && !!user.telegram_id && (missingChannels || []).length === 0;
  const [sort, setSort] = useState("top");
  const [loginOpen, setLoginOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const heroRef = useRef(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  // Apple-style: hero text scales down + fades + moves up as you scroll
  const heroScale = useTransform(heroProgress, [0, 1], [1, 0.85]);
  const heroOpacity = useTransform(heroProgress, [0, 0.6], [1, 0]);
  const heroY = useTransform(heroProgress, [0, 1], [0, -80]);
  const heroBgY = useTransform(heroProgress, [0, 1], [0, 200]);

  const { data: clips = [], isLoading } = useQuery({
    queryKey: ["clips", sort],
    queryFn: async () => (await api.get(`/clips?sort=${sort}`)).data,
  });

  const topThree = clips.slice(0, 3);

  return (
    <div className="relative">
      {/* HERO */}
      <section ref={heroRef} className="relative min-h-[100vh] flex items-center overflow-hidden" data-testid="hero-section">
        <motion.div style={{ y: heroBgY }} className="absolute inset-0">
          <Hero3D />
        </motion.div>

        {/* Atmospheric vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-[#050505] z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(83,252,24,0.08),_transparent_60%)] z-10 pointer-events-none" />

        <motion.div
          style={{ scale: heroScale, opacity: heroOpacity, y: heroY }}
          className="relative z-20 max-w-7xl mx-auto px-6 lg:px-8 w-full pt-24 pb-12"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-4xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-8" data-testid="hero-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#53FC18]">Hafta Aktif</span>
            </div>
            <h1 className="font-display font-black text-5xl sm:text-7xl lg:text-8xl xl:text-[9rem] tracking-tighter leading-[0.88]" data-testid="hero-title">
              Bu haftayı<br />
              <span className="text-[#53FC18] neon-text">kıran</span><br />
              klibi seç.
            </h1>
            <p className="mt-8 text-lg sm:text-xl text-zinc-400 max-w-xl leading-relaxed" data-testid="hero-subtitle">
              {streamerName}'in en iyi Kick kliplerini gönder. Topluluk oy versin. Haftanın en iyisi ödülü kapsın.
            </p>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              {fullyOnboarded ? (
                <Button
                  onClick={() => setSubmitOpen(true)}
                  className="h-14 px-8 bg-[#53FC18] text-black font-bold text-base rounded-2xl hover:bg-[#3ECA0D] hover:shadow-[0_0_40px_rgba(83,252,24,0.5)] hover:-translate-y-0.5 transition-all"
                  data-testid="hero-submit-btn"
                >
                  <Sparkles className="w-5 h-5 mr-2" /> Klip Gönder
                </Button>
              ) : (
                <Button
                  onClick={() => setLoginOpen(true)}
                  className="h-14 px-8 bg-[#53FC18] text-black font-bold text-base rounded-2xl hover:bg-[#3ECA0D] hover:shadow-[0_0_40px_rgba(83,252,24,0.5)] hover:-translate-y-0.5 transition-all"
                  data-testid="hero-login-btn"
                >
                  {user ? "Telegram Bağla" : "Arenaya Gir"} <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
              <a href="#feed" className="h-14 px-8 inline-flex items-center font-bold text-base rounded-2xl border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all" data-testid="hero-feed-btn">
                Klipleri Gör
              </a>
            </div>
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          style={{ opacity: heroOpacity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-zinc-500"
          data-testid="scroll-hint"
        >
          <span className="text-[10px] font-mono uppercase tracking-[0.3em]">Kaydır</span>
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
            <ArrowDown className="w-4 h-4" />
          </motion.div>
        </motion.div>
      </section>

      {/* HOW IT WORKS — scroll-driven */}
      <HowItWorks />

      {/* PRIZE REVEAL — pinned/scale on scroll */}
      <PrizeReveal />

      {/* TOP 3 */}
      {topThree.length > 0 && (
        <section className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24" data-testid="top-three-section">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex items-end justify-between mb-12"
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#53FC18] mb-3">Bu Hafta</div>
              <h2 className="font-display font-black text-4xl lg:text-6xl tracking-tighter">Zirvedekiler.</h2>
            </div>
            <a href="/leaderboard" className="hidden md:inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
              Tam sıralama <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topThree.map((clip, i) => (
              <ClipCard key={clip.id} clip={clip} rank={i} />
            ))}
          </div>
        </section>
      )}

      {/* FEED */}
      <section id="feed" className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24" data-testid="feed-section">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#53FC18] mb-3">Tüm Klipler</div>
            <h2 className="font-display font-black text-4xl lg:text-6xl tracking-tighter">Tüm akış.</h2>
          </div>
          <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10" data-testid="sort-tabs">
            <button
              onClick={() => setSort("top")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
                sort === "top" ? "bg-[#53FC18] text-black" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="sort-top-btn"
            >
              <Flame className="w-4 h-4" /> Popüler
            </button>
            <button
              onClick={() => setSort("new")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
                sort === "new" ? "bg-[#53FC18] text-black" : "text-zinc-400 hover:text-white"
              }`}
              data-testid="sort-new-btn"
            >
              <Sparkles className="w-4 h-4" /> En Yeni
            </button>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="clips-loading">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/5 border border-white/5 aspect-[4/5] animate-pulse" />
            ))}
          </div>
        ) : clips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center" data-testid="empty-state">
            <Sparkles className="w-10 h-10 text-[#53FC18] mx-auto mb-4" />
            <h3 className="font-display font-bold text-2xl mb-2">Henüz klip yok.</h3>
            <p className="text-zinc-500 mb-6">Arenaya ilk klibi sen bırak.</p>
            {fullyOnboarded ? (
              <Button onClick={() => setSubmitOpen(true)} className="bg-[#53FC18] text-black font-bold rounded-xl" data-testid="empty-submit-btn">
                İlk Klibi Gönder
              </Button>
            ) : (
              <Button onClick={() => setLoginOpen(true)} className="bg-[#53FC18] text-black font-bold rounded-xl" data-testid="empty-login-btn">
                {user ? "Telegram Bağla" : "Göndermek için Giriş Yap"}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="clips-grid">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}
      </section>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <SubmitClipDialog open={submitOpen} onOpenChange={setSubmitOpen} />
    </div>
  );
}
