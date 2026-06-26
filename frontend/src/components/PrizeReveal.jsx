import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Trophy } from "lucide-react";
import CountdownTimer from "./CountdownTimer";

/**
 * Apple-style pinned reveal section.
 * Big statement text that scales / fades as user scrolls through it.
 */
export default function PrizeReveal() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 1, 1.05]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.8, 1], [0, 1, 1, 0.3]);
  const bgOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.4, 0]);

  return (
    <section ref={ref} className="relative py-40 overflow-hidden" data-testid="prize-reveal-section">
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 pointer-events-none"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(83,252,24,0.15),_transparent_55%)]" />
      </motion.div>

      <motion.div style={{ scale, opacity }} className="relative max-w-6xl mx-auto px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#53FC18]/30 bg-[#53FC18]/5 mb-8">
          <Trophy className="w-4 h-4 text-[#53FC18]" />
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#53FC18]">Bu Haftanın Ödülü</span>
        </div>
        <h2 className="font-display font-black text-5xl sm:text-7xl lg:text-8xl xl:text-[10rem] tracking-tighter leading-[0.85]">
          Kazanmaya<br />
          <span className="text-[#53FC18] neon-text">değer</span><br />
          bir şey kazan.
        </h2>
        <p className="mt-10 text-zinc-400 max-w-xl mx-auto text-lg leading-relaxed">
          Her Pazar 00:00 UTC'de liderlik tablosu donar ve en üstteki klibin sahibi ödülü alır.
        </p>
        <div className="mt-12 flex justify-center">
          <div className="glass rounded-2xl px-8 py-6">
            <CountdownTimer />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
