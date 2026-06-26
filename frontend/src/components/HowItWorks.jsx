import React, { useRef } from "react";
import { motion, useScroll, useTransform, useMotionTemplate } from "framer-motion";
import { Sparkles, Upload, Vote, Trophy } from "lucide-react";

/**
 * Apple-style scroll-driven section.
 * As user scrolls, the 3 cards build up + section title scales.
 * Section is tall (200vh) so we can pin/transform inside it.
 */
export default function HowItWorks() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const titleY = useTransform(scrollYProgress, [0, 0.4], [60, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.25], [0, 1]);
  const lineScale = useTransform(scrollYProgress, [0.2, 0.7], [0, 1]);

  const steps = [
    {
      icon: Upload,
      kicker: "01 — Gönder",
      title: "Kick klip linkini bırak.",
      copy: "Kick klip linkini yapıştır. Biz parse ederiz, doğrularız, gömeriz. Bu kadar.",
    },
    {
      icon: Vote,
      kicker: "02 — Oyla",
      title: "Karar topluluğun.",
      copy: "Klipleri yerinde izle. Klip başına tek oy. Trolller? Telegram doğrulaması yolda.",
    },
    {
      icon: Trophy,
      kicker: "03 — Kazan",
      title: "En çok oyu alan kazanır.",
      copy: "Her Pazar 00:00 UTC'de lider haftalık ödülü alır. Sıfırlanır. Tekrar başlar.",
    },
  ];

  return (
    <section ref={ref} className="relative py-32 max-w-7xl mx-auto px-6 lg:px-8" data-testid="how-it-works-section">
      <motion.div style={{ y: titleY, opacity: titleOpacity }} className="mb-20">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#53FC18] mb-3">Akış</div>
        <h2 className="font-display font-black text-4xl sm:text-5xl lg:text-7xl tracking-tighter leading-[0.95] max-w-4xl">
          Üç adım.<br />
          <span className="text-zinc-500">Tek kazanan.</span>
        </h2>
      </motion.div>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 rounded-3xl overflow-hidden border border-white/5">
        {/* vertical neon line that grows with scroll */}
        <motion.div
          style={{ scaleX: lineScale }}
          className="absolute top-0 left-0 right-0 h-px bg-[#53FC18] origin-left z-10"
        />

        {steps.map((step, i) => {
          const Icon = step.icon;
          const start = 0.2 + i * 0.12;
          return (
            <StepCard
              key={i}
              icon={Icon}
              kicker={step.kicker}
              title={step.title}
              copy={step.copy}
              progress={scrollYProgress}
              start={start}
            />
          );
        })}
      </div>
    </section>
  );
}

function StepCard({ icon: Icon, kicker, title, copy, progress, start }) {
  const y = useTransform(progress, [start, start + 0.2], [40, 0]);
  const opacity = useTransform(progress, [start, start + 0.2], [0, 1]);
  return (
    <motion.div
      style={{ y, opacity }}
      className="relative bg-[#0A0A0A] p-8 lg:p-10 group hover:bg-[#0F0F0F] transition-colors"
    >
      <Icon className="w-8 h-8 text-[#53FC18] mb-8" strokeWidth={1.5} />
      <div className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500 mb-3">{kicker}</div>
      <h3 className="font-display font-bold text-2xl lg:text-3xl tracking-tight mb-3 leading-tight">{title}</h3>
      <p className="text-zinc-400 leading-relaxed">{copy}</p>
    </motion.div>
  );
}
