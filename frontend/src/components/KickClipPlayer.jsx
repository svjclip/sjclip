import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Play, Loader2, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";

/**
 * In-page Kick clip player.
 *
 * Strategy: native HLS playback via hls.js streaming Kick's CloudFront CDN:
 *   https://clips.kick.com/clips/<shard>/<clip_id>/playlist.m3u8
 *
 * Why not iframe `player.kick.com/embed/clips/...`?
 *   - Kick has no officially documented clip-embed endpoint (confirmed at
 *     docs.kick.com — only the live-stream channel embed is supported).
 *   - The unofficial `player.kick.com/embed/clips/<id>?parent=<host>` URL is
 *     locked behind Cloudflare bot/IP protection (`Request blocked by security
 *     policy`) and `X-Frame-Options: SAMEORIGIN` — the `parent` handshake is
 *     irrelevant.
 *   - clips.kick.com is on CloudFront with wide-open CORS (`*`), zero bot
 *     protection, and exposes the HLS manifest directly. This is the same
 *     pipeline kicklogz.com uses.
 *
 * Shard discovery: a clip's CDN shard (e.g. `7a`, `d5`) is a 2-char hex bucket
 * not derivable from the clip_id. Backend brute-forces 256 hex shards in
 * parallel at clip-submission time and caches the result on the clip document.
 * Older clips are backfilled lazily via POST /api/clips/<id>/resolve-shard the
 * first time someone hits play.
 */
export default function KickClipPlayer({ clip, autoPlay = false }) {
  const [active, setActive] = useState(autoPlay);

  if (!active) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setActive(true);
        }}
        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-900 group/play"
        data-testid={`clip-play-${clip.id}`}
        aria-label="Klibi oynat"
      >
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_rgba(83,252,24,0.3),_transparent_60%)]" />
        <div className="relative w-16 h-16 rounded-full bg-[#53FC18] flex items-center justify-center transform transition-transform group-hover/play:scale-110 group-hover/play:shadow-[0_0_40px_rgba(83,252,24,0.6)]">
          <Play className="w-7 h-7 text-black ml-1" fill="black" />
        </div>
        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          Kick Klip
        </div>
      </button>
    );
  }

  return <HlsPlayer clip={clip} />;
}

function HlsPlayer({ clip }) {
  const videoRef = useRef(null);
  const [shard, setShard] = useState(clip?.kick_shard || null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState(null);

  const playlistUrl =
    shard && clip?.kick_clip_id
      ? `https://clips.kick.com/clips/${shard}/${clip.kick_clip_id}/playlist.m3u8`
      : null;

  // Lazy-resolve the shard if we don't have it cached.
  useEffect(() => {
    if (shard || resolving) return;
    let cancelled = false;
    setResolving(true);
    setError(null);
    api
      .post(`/clips/${clip.id}/resolve-shard`)
      .then((r) => {
        if (cancelled) return;
        if (r.data?.kick_shard) setShard(r.data.kick_shard);
        else setError("Klip kaynağı bulunamadı (Kick'te silinmiş olabilir).");
      })
      .catch(() => {
        if (!cancelled) setError("Klip yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clip.id, shard, resolving]);

  useEffect(() => {
    if (!playlistUrl) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    // Safari plays HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      const onErr = () => setError("Video oynatılamadı.");
      video.addEventListener("error", onErr);
      return () => video.removeEventListener("error", onErr);
    }

    if (!Hls.isSupported()) {
      setError("Tarayıcınız HLS oynatmayı desteklemiyor.");
      return;
    }

    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hls.loadSource(playlistUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error("[hls.js error]", data?.type, data?.details, data?.reason || data);
      if (data.fatal) {
        setError("Video kaynağı yüklenemedi.");
        hls.destroy();
      }
    });
    return () => {
      try {
        hls.destroy();
      } catch {
        /* noop */
      }
    };
  }, [playlistUrl]);

  if (resolving || !playlistUrl) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3 text-zinc-400"
        data-testid={`clip-loading-${clip.id}`}
      >
        <Loader2 className="w-7 h-7 animate-spin text-[#53FC18]" />
        <span className="text-xs font-mono uppercase tracking-[0.2em]">Yükleniyor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-2 text-zinc-300 px-6 text-center"
        data-testid={`clip-error-${clip.id}`}
      >
        <AlertTriangle className="w-7 h-7 text-[#FFD166]" />
        <span className="text-sm">{error}</span>
        <a
          href={clip.kick_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#53FC18] underline mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          Kick&apos;te aç
        </a>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="w-full h-full bg-black"
      controls
      playsInline
      autoPlay
      data-testid={`clip-video-${clip.id}`}
    />
  );
}
