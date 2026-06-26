import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [missingChannels, setMissingChannels] = useState([]);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyMe = useCallback((data) => {
    if (!data) {
      setUser(null);
      setMissingChannels([]);
      setNeedsPasswordSetup(false);
      return;
    }
    setUser(data);
    setMissingChannels(data.missing_channels || []);
    setNeedsPasswordSetup(!!data.needs_password_setup);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      applyMe(res.data || null);
    } catch {
      applyMe(null);
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Username + password login
  const passwordLogin = useCallback(async (username, password) => {
    const res = await api.post("/auth/login", { username, password });
    const data = res.data;
    // best-effort populate legacy header storage
    if (data.user?.id) localStorage.setItem("cv_user_id", data.user.id);
    setUser(data.user);
    setMissingChannels(data.missing_channels || []);
    setNeedsPasswordSetup(false);
    return data;
  }, []);

  // New account
  const register = useCallback(async (payload) => {
    const res = await api.post("/auth/register", payload);
    const data = res.data;
    if (data.user?.id) localStorage.setItem("cv_user_id", data.user.id);
    setUser(data.user);
    setMissingChannels(data.missing_channels || []);
    setNeedsPasswordSetup(false);
    return data;
  }, []);

  // Telegram verify-code login (existing flow)
  const verifyTelegramCode = useCallback(async (code) => {
    const res = await api.post("/auth/verify-code", { code });
    const data = res.data;
    if (data.user?.id) localStorage.setItem("cv_user_id", data.user.id);
    setUser(data.user);
    setMissingChannels(data.missing_channels || []);
    setNeedsPasswordSetup(!!data.needs_password_setup);
    return data;
  }, []);

  // Legacy: Telegram-only first-time → set username+password
  const setPasswordForLegacy = useCallback(async (payload) => {
    const res = await api.post("/auth/set-password", payload);
    const data = res.data;
    setUser(data.user);
    setNeedsPasswordSetup(false);
    return data;
  }, []);

  // Forgot password (returns instructions)
  const forgotPassword = useCallback(async (username) => {
    const res = await api.post("/auth/forgot-password", { username });
    return res.data;
  }, []);

  // Reset password using code from Telegram bot
  const resetPassword = useCallback(async (code, newPassword) => {
    const res = await api.post("/auth/reset-password", {
      code,
      new_password: newPassword,
    });
    const data = res.data;
    if (data.user?.id) localStorage.setItem("cv_user_id", data.user.id);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    localStorage.removeItem("cv_user_id");
    setUser(null);
    setMissingChannels([]);
    setNeedsPasswordSetup(false);
  }, []);

  const recheckChannels = useCallback(async () => {
    try {
      const res = await api.get("/auth/check-channels");
      setMissingChannels(res.data.missing_channels || []);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        missingChannels,
        needsPasswordSetup,
        refreshUser,
        passwordLogin,
        register,
        verifyTelegramCode,
        setPasswordForLegacy,
        forgotPassword,
        resetPassword,
        logout,
        recheckChannels,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
