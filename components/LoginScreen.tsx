"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/styles/appStyles";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      setMessage("Zadej email.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
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