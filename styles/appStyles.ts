import React from "react";

export const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)",
    color: "white",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    justifyContent: "center",
    padding: "20px 12px",
  },

  phone: {
    width: "100%",
    maxWidth: "430px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "24px",
    padding: "20px",
    backdropFilter: "blur(12px)",
  },

  title: {
    fontSize: "26px",
    fontWeight: 800,
    letterSpacing: "0.5px",
  },

  screenTitle: {
    fontSize: "20px",
    marginBottom: "12px",
    fontWeight: 700,
  },

  card: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: "18px",
    padding: "16px",
    border: "1px solid rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
  },

  primaryButton: {
    marginTop: "16px",
    width: "100%",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "0.2s",
  },

  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    outline: "none",
  },

  playerRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "10px",
  },
};