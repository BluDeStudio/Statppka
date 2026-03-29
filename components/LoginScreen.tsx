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

  return "https://myteamhub.cz";
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
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    const inviteToken = getInviteTokenFromUrl();

    if (!inviteToken || typeof window === "undefined") return;

    window.localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
  }, []);

  const handleLogin = async () => {
    if (!email.trim()) {
      setMessage("Zadej email.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("info");

    const redirectUrl = buildRedirectUrl();

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      setMessage(`Chyba: ${error.message}`);
      setMessageType("error");
    } else {
      setMessage(
        "Hotovo. Zkontroluj email a klikni na přihlašovací odkaz. Když zprávu nevidíš, podívej se i do spamu nebo hromadných."
      );
      setMessageType("success");
    }

    setLoading(false);
  };

  const messageBoxStyle: React.CSSProperties =
    messageType === "error"
      ? {
          padding: "12px 14px",
          borderRadius: "14px",
          background: "rgba(255, 82, 82, 0.10)",
          border: "1px solid rgba(255, 82, 82, 0.25)",
        }
      : messageType === "success"
      ? {
          padding: "12px 14px",
          borderRadius: "14px",
          background: "rgba(34, 197, 94, 0.10)",
          border: "1px solid rgba(34, 197, 94, 0.24)",
        }
      : {
          padding: "12px 14px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
        };

  return (
    <div
      style={{
        ...styles.card,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "22px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: "16px",
        }}
      >
        <div>
          <h2
            style={{
              ...styles.screenTitle,
              marginBottom: "8px",
            }}
          >
            Přihlášení
          </h2>

          <p
            style={{
              color: "#b8b8b8",
              margin: 0,
              lineHeight: 1.6,
              fontSize: "14px",
            }}
          >
            Přihlas se přes email. Pošleme ti odkaz pro rychlý vstup do aplikace.
          </p>
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "16px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#d9d9d9",
            fontSize: "13px",
            lineHeight: 1.55,
          }}
        >
          Přihlašovací odkaz chodí z adresy <strong>noreply@myteamhub.cz</strong>.
          Když email hned neuvidíš, zkontroluj i spam nebo hromadné.
        </div>

        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
          <input
            type="email"
            placeholder="tvuj@email.cz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                void handleLogin();
              }
            }}
            style={{
              ...styles.input,
              minHeight: "56px",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              fontSize: "16px",
            }}
          />

          <button
            style={{
              ...styles.primaryButton,
              marginTop: 0,
              minHeight: "56px",
              borderRadius: "16px",
              border: "none",
              background: loading
                ? "linear-gradient(135deg, rgba(34,197,94,0.7), rgba(22,163,74,0.7))"
                : "linear-gradient(135deg, #22c55e, #16a34a)",
              color: "white",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "0.3px",
              boxShadow: loading
                ? "0 8px 20px rgba(34,197,94,0.16)"
                : "0 10px 24px rgba(34,197,94,0.28)",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.9 : 1,
              transition: "transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease",
            }}
            onClick={() => void handleLogin()}
            disabled={loading}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 14px 28px rgba(34,197,94,0.34)";
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = loading
                ? "0 8px 20px rgba(34,197,94,0.16)"
                : "0 10px 24px rgba(34,197,94,0.28)";
            }}
          >
            {loading ? "Odesílám..." : "Poslat přihlašovací odkaz"}
          </button>
        </div>

        {message && (
          <div style={messageBoxStyle}>
            <p
              style={{
                margin: 0,
                color:
                  messageType === "error"
                    ? "#ffd5d5"
                    : messageType === "success"
                    ? "#d8ffe7"
                    : "#cfcfcf",
                fontSize: "14px",
                lineHeight: 1.6,
                fontWeight: messageType === "error" ? 600 : 500,
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