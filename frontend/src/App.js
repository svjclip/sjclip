import React, { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";
import { api } from "./lib/api";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import LeaderboardPage from "./pages/LeaderboardPage";
import ClipDetailPage from "./pages/ClipDetailPage";
import SetPasswordDialog from "./components/SetPasswordDialog";
import TelegramLinkDialog from "./components/TelegramLinkDialog";

function GlobalSetPasswordGate() {
  const { user, needsPasswordSetup } = useAuth();
  // Only show if a Telegram-only legacy user is logged in but has no password yet
  const show = !!user && needsPasswordSetup && !user.has_password;
  return <SetPasswordDialog open={show} />;
}

function GlobalTelegramGate() {
  const { user, missingChannels, needsPasswordSetup, loading } = useAuth();
  // Don't fight with set-password modal (it must run first)
  if (loading || !user || needsPasswordSetup) return null;
  const needsTelegram = !user.telegram_id;
  const needsChannels = (missingChannels || []).length > 0;
  const show = needsTelegram || needsChannels;
  return <TelegramLinkDialog open={show} onOpenChange={() => {}} allowSkip={false} />;
}

function AppShell() {
  const [streamerName, setStreamerName] = useState("SVJ");

  useEffect(() => {
    api
      .get("/config")
      .then((res) => setStreamerName(res.data.streamer_name))
      .catch(() => {});
  }, []);

  return (
    <div className="App relative min-h-screen bg-[#050505] text-white">
      <BrowserRouter>
        <Navbar streamerName={streamerName} />
        <main className="relative z-10">
          <Routes>
            <Route path="/" element={<HomePage streamerName={streamerName} />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/clip/:id" element={<ClipDetailPage />} />
          </Routes>
        </main>
        <Footer streamerName={streamerName} />
      </BrowserRouter>
      <GlobalSetPasswordGate />
      <GlobalTelegramGate />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0A0A0A",
            border: "1px solid rgba(83, 252, 24, 0.3)",
            color: "white",
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
