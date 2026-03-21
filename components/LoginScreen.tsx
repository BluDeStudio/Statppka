"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/styles/appStyles";

const INVITE_STORAGE_KEY = "statppka_invite_token";

function getBaseAppUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "https://statppka.vercel.app";
}

function getStoredInviteToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(INVITE_STORAGE_KEY) ?? "";
}

function getInviteTokenFromUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get("invite") ?? "";
}

function buildRedirectUrl() {
  const baseUrl = getBaseAppUrl();
  const inviteToken = getInviteTokenFromUrl() || getStoredInviteToken();

  if (!inviteToken) {
    return baseUrl;
  }

  return `${baseUrl}/?invite=${encodeURIComponent(inviteToken)}`;
}

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const inviteToken = getInviteTokenFromUrl();

    if (!inviteToken || typeof window === "undefined") return;

    window.localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
  }, []);

  const handleLogin = async () => {
    if (!email.trim()) {
      setMessage("Zadej email.");
      return;
    }

    setLoading(true);
    setMessage("");

    const redirectUrl = buildRedirectUrl();

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      setMessage(`Chyba: ${error.message}`);
    } else {
      setMessage("Hotovo. Zkontroluj email a klikni na odkaz.");
    }

    setLoading(false);
  };

  return (
    <div style={styles.card}>
      <div
        style={{
          display: "grid",
          gap: "12px",
        }}
      >
        <div>
          <h2 style={styles.screenTitle}>Přihlášení</h2>
          <p
            style={{
              color: "#b8b8b8",
              margin: 0,
              lineHeight: 1.5,
              fontSize: "14px",
            }}
          >
            Přihlas se přes email. Pošleme ti odkaz pro vstup do aplikace.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "10px",
          }}
        >
          <input
            type="email"
            placeholder="tvuj@email.cz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />

          <button
            style={{
              ...styles.primaryButton,
              opacity: loading ? 0.7 : 1,
            }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Odesílám..." : "Poslat přihlašovací odkaz"}
          </button>
        </div>

        {message && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#cfcfcf",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}