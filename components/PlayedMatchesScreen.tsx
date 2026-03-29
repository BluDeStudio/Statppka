"use client";

import { useMemo, useState } from "react";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch } from "@/app/page";

type PlayedMatchesScreenProps = {
  finishedMatches: FinishedMatch[];
  onSelectMatch: (matchId: string) => void;
  onDeleteMatch: (matchId: string) => Promise<{ success: boolean; errorMessage?: string }>;
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
  onDeleteMatch,
  primaryColor = "#888888",
}: PlayedMatchesScreenProps) {
  const [filter, setFilter] = useState<"ALL" | "A" | "B">("ALL");
  const [message, setMessage] = useState("");
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  const filteredMatches = useMemo(() => {
    if (filter === "ALL") {
      return finishedMatches;
    }

    return finishedMatches.filter((match) => match.team === filter);
  }, [finishedMatches, filter]);

  const handleDelete = async (matchId: string, matchTitle: string) => {
    const confirmed = window.confirm(`Opravdu chceš smazat zápas "${matchTitle}"?`);

    if (!confirmed) return;

    setDeletingMatchId(matchId);
    setMessage("");

    const result = await onDeleteMatch(matchId);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se smazat zápas.");
      setDeletingMatchId(null);
      return;
    }

    setMessage("Zápas byl smazán.");
    setDeletingMatchId(null);
  };

  const filterButtonBaseStyle: React.CSSProperties = {
    border: "none",
    borderRadius: "10px",
    padding: "10px",
    background: "rgba(255,255,255,0.1)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    flex: 1,
  };

  const getFilterButtonStyle = (value: "ALL" | "A" | "B"): React.CSSProperties => ({
    ...filterButtonBaseStyle,
    background: filter === value ? primaryColor : "rgba(255,255,255,0.1)",
  });

  return (
    <div style={styles.card}>
      <h2 style={styles.screenTitle}>Odehrané zápasy</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button onClick={() => setFilter("ALL")} style={getFilterButtonStyle("ALL")}>
          Vše
        </button>

        <button onClick={() => setFilter("A")} style={getFilterButtonStyle("A")}>
          A-tým
        </button>

        <button onClick={() => setFilter("B")} style={getFilterButtonStyle("B")}>
          B-tým
        </button>
      </div>

      {filteredMatches.length === 0 ? (
        <div style={{ color: "#b9c4bb" }}>
          Zatím žádný odehraný zápas pro tento filtr.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "10px",
          }}
        >
          {filteredMatches.map((match) => (
            <div
              key={match.id}
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "white",
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
                <button
                  onClick={() => onSelectMatch(match.id)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "white",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
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
                    {match.time ? ` • ${match.time}` : ""}
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
                </button>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    flexShrink: 0,
                  }}
                >
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
                    }}
                  >
                    {match.team}-tým
                  </div>

                  <button
                    onClick={() => void handleDelete(match.id, match.matchTitle)}
                    disabled={deletingMatchId === match.id}
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      border: "none",
                      background: "rgba(198,40,40,0.95)",
                      color: "white",
                      cursor: deletingMatchId === match.id ? "default" : "pointer",
                      fontWeight: "bold",
                      opacity: deletingMatchId === match.id ? 0.7 : 1,
                      flexShrink: 0,
                    }}
                    title="Smazat zápas"
                  >
                    {deletingMatchId === match.id ? "..." : "✕"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
      )}
    </div>
  );
}