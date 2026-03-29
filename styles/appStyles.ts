import React from "react";

export const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #050505 0%, #0d0d0d 50%, #050505 100%)",
    color: "white",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    display: "flex",
    justifyContent: "center",
    padding: "20px 12px",
  },

  phone: {
    width: "100%",
    maxWidth: "430px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "26px",
    padding: "20px",
    backdropFilter: "blur(16px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
  },

  title: {
    fontSize: "28px",
    fontWeight: 800,
    letterSpacing: "0.6px",
  },

  screenTitle: {
    fontSize: "20px",
    marginBottom: "6px",
    fontWeight: 700,
  },

  card: {
    background: "rgba(255,255,255,0.045)",
    borderRadius: "20px",
    padding: "18px",
    border: "1px solid rgba(255,255,255,0.07)",
    backdropFilter: "blur(14px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
  },

  primaryButton: {
    marginTop: "16px",
    width: "100%",
    padding: "14px",
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "white",
    fontWeight: 700,
    fontSize: "15px",
    letterSpacing: "0.3px",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(34,197,94,0.28)",
    transition: "all 0.2s ease",
  },

  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    fontSize: "15px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },

  playerRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "10px",
  },
};

