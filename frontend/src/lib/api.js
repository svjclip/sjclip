import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Legacy: still send X-User-Id from localStorage if present (backward compat with Faz 1 sessions)
api.interceptors.request.use((config) => {
  const userId = localStorage.getItem("cv_user_id");
  if (userId) {
    config.headers["X-User-Id"] = userId;
  }
  return config;
});

export function parseKickClipId(url) {
  const patterns = [
    /kick\.com\/[^/]+\/clips\/(clip_[A-Za-z0-9]+)/,
    /kick\.com\/clips\/(clip_[A-Za-z0-9]+)/,
    /kick\.com\/[^/]+\/clip\/(clip_[A-Za-z0-9]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function kickEmbedUrl(clipId) {
  return `https://kick.com/clips/${clipId}/embed`;
}

export function formatApiError(detail, fallback = "Bir hata oluştu") {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  if (detail && typeof detail.error === "string") return detail.error;
  return fallback;
}
