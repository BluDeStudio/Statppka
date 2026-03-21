"use client";

import { styles } from "@/styles/appStyles";
import type { FinishedMatch } from "@/app/page";

type PlayedMatchesScreenProps = {
  finishedMatches: FinishedMatch[];
  onSelectMatch: (matchId: string) => void;
  primaryColor?: string;
};

function formatDisplayDate(date: string) {
  if (date.includes(".")) return date;

  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;

  return `${day}.${month}.${year}`;
}

export default function PlayedMatchesScreen({
  finishedMatches,
  onSelectMatch,
  primaryColor = "#888888",
}: PlayedMatchesScreenProps) {
  return (
    <div style={styles.card}>
      <h2 style={styles.screenTitle}>Odehrané zápasy</h2>

      {finishedMatches.length === 0 ? (
        <div style={{ color: "#b9c4bb" }}>
          Zatím žádný odehraný zápas.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "10px",
            maxHeight: "420px",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {finishedMatches.map((match) => (
            <button
              key={match.id}
              onClick={() => onSelectMatch(match.id)}
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "white",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "16px",
                      lineHeight: 1.35,
                    }}
                  >
                    {match.matchTitle}
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      color: "#b9c4bb",
                      marginTop: "10px",
                    }}
                  >
                    {formatDisplayDate(match.date)}
                  </div>

                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: "bold",
                      marginTop: "12px",
                      color: primaryColor,
                    }}
                  >
                    {match.score}
                  </div>
                </div>

                <div
                  style={{
                    minWidth: "54px",
                    height: "42px",
                    padding: "0 10px",
                    borderRadius: "10px",
                    background: primaryColor,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    textAlign: "center",
                    lineHeight: 1.1,
                    flexShrink: 0,
                  }}
                >
                  {match.team}-tým
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}