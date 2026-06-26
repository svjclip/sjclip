import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Play, ThumbsUp, ArrowUpRight } from "lucide-react";
import useClipThumbnail from "../lib/useClipThumbnail";

/**
 * Editorial-style "Bu Haftanın Kazananı" hero. Real clip thumbnail on the
 * left, oversized confident typography on the right, gold accent rule and a
 * subtle film-grain overlay. No floating crown gimmicks.
 */
export default function WinnerHero({ clip, contestName }) {
  const { ref: thumbRef, thumbnailUrl } = useClipThumbnail(clip);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative border border-[#C8A24B]/40 bg-black overflow-hidden group"
      data-testid="winner-hero"
    >
      {/* gold gradient frame */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[#C8A24B]/12 via-transparent to-[#C8A24B]/5" />
      {/* subtle grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence baseFrequency=%220.9%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>')",
        }}
      />

      {/* SON KAZANAN ribbon — top right */}
      <div
        className="absolute top-0 right-0 z-20 flex items-center gap-2 pl-4 pr-4 py-1.5 bg-[#C8A24B] text-black shadow-[0_4px_20px_rgba(200,162,75,0.45)]"
        data-testid="winner-latest-badge"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.22em]">
          Son Kazanan
        </span>
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[360px_1fr] gap-0">
        {/* THUMB */}
        <Link
          to={`/clip/${clip.id}`}
          ref={thumbRef}
          className="relative aspect-video md:aspect-auto md:min-h-[200px] bg-zinc-950 overflow-hidden border-b md:border-b-0 md:border-r border-[#C8A24B]/25"
          data-testid="winner-thumbnail-link"
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur border border-[#C8A24B]/60 flex items-center justify-center group-hover:bg-[#C8A24B] group-hover:border-[#C8A24B] transition-all">
              <Play
                className="w-5 h-5 text-[#C8A24B] group-hover:text-black ml-0.5 transition-colors"
                fill="currentColor"
              />
            </div>
          </div>
          {/* WINNER stamp */}
          <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#C8A24B] text-black text-[10px] font-black uppercase tracking-[0.18em]">
            <Crown className="w-3 h-3" strokeWidth={2.5} />
            Kazanan
          </div>
        </Link>

        {/* TEXT */}
        <div className="p-6 md:p-8 pt-10 md:pt-12 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-[#C8A24B]">
                {contestName || "Geçen Haftanın Kazananı"}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-[#C8A24B]/50 to-transparent" />
            </div>
            <Link to={`/clip/${clip.id}`} className="block group/title">
              <h2
                className="font-display font-black text-[clamp(1.75rem,4vw,3rem)] tracking-tighter leading-[0.95] text-white group-hover/title:text-[#C8A24B] transition-colors"
                data-testid="winner-clip-title"
              >
                {clip.title}
              </h2>
            </Link>
            <div className="flex items-center gap-3 mt-4 text-sm">
              <Link
                to={`/profil/${clip.submitter_username}`}
                className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white font-medium"
              >
                <span className="w-6 h-6 rounded-full bg-[#C8A24B]/20 border border-[#C8A24B]/40 flex items-center justify-center text-[10px] font-black text-[#C8A24B]">
                  {clip.submitter_username?.[0]?.toUpperCase()}
                </span>
                @{clip.submitter_username}
              </Link>
              <span className="text-zinc-700">|</span>
              <span className="inline-flex items-center gap-1.5 text-zinc-400 font-mono text-xs">
                <ThumbsUp className="w-3.5 h-3.5 text-[#C8A24B]" />
                {clip.votes_count} oy
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/clip/${clip.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8A24B] text-black text-sm font-bold uppercase tracking-[0.15em] hover:bg-white transition-colors group/cta"
              data-testid="winner-clip-cta"
            >
              Klibi Aç
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
            </Link>
            <Link
              to={`/profil/${clip.submitter_username}`}
              className="text-xs uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300 underline-offset-4 hover:underline transition-colors"
            >
              Profili ziyaret et →
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
