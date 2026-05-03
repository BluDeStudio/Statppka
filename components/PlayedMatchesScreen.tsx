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
  primaryColor = "#22c55e",
}: PlayedMatchesScreenProps) {
  const [filter, setFilter] = useState<"ALL" | "A" | "B">("ALL");
  const [message, setMessage] = useState("");
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  const filteredMatches = useMemo(() => {
    if (filter === "ALL") return finishedMatches;
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

  const glassCardStyle: React.CSSProperties = {
    borderRadius: "22px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.30)",
    backdropFilter: "blur(14px)",
  };

  const getFilterButtonStyle = (value: "ALL" | "A" | "B"): React.CSSProperties => ({
    flex: 1,
    border: "none",
    borderRadius: "16px",
    padding: "12px 10px",
    background:
      filter === value
        ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
        : "rgba(255,255,255,0.08)",
    color: filter === value ? "#071107" : "#ffffff",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: filter === value ? `0 10px 24px ${primaryColor}33` : "none",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={{ ...glassCardStyle, padding: "14px" }}>
        <div
          style={{
            fontSize: "18px",
            fontWeight: 950,
            marginBottom: "12px",
          }}
        >
          Odehrané zápasy
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
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
      </div>

      {message && (
        <div
          style={{
            ...glassCardStyle,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      {filteredMatches.length === 0 ? (
        <div
          style={{
            ...glassCardStyle,
            padding: "16px",
            color: "#b8b8b8",
          }}
        >
          Zatím žádný odehraný zápas pro tento filtr.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {filteredMatches.map((match) => (
            <div
              key={match.id}
              style={{
                ...glassCardStyle,
                position: "relative",
                overflow: "hidden",
                padding: "14px",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "5px",
                  background: primaryColor,
                  boxShadow: `0 0 18px ${primaryColor}66`,
                }}
              />

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  paddingLeft: "4px",
                }}
              >
                <button
                  onClick={() => onSelectMatch(match.id)}
                  style={{
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
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 950,
                          fontSize: "16px",
                          lineHeight: 1.35,
                          wordBreak: "break-word",
                        }}
                      >
                        {match.matchTitle}
                      </div>

                      <div
                        style={{
                          fontSize: "13px",
                          color: "#b8b8b8",
                          marginTop: "10px",
                          fontWeight: 700,
                        }}
                      >
                        📅 {formatDisplayDate(match.date)}
                        {match.time ? ` • ${match.time}` : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "14px",
                        background: `${primaryColor}22`,
                        border: `1px solid ${primaryColor}44`,
                        color: primaryColor,
                        fontWeight: 950,
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {match.team}-tým
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      fontSize: "26px",
                      fontWeight: 950,
                      color: primaryColor,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {match.score}
                  </div>
                </button>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px",
                    alignItems: "center",
                    paddingTop: "10px",
                    borderTop: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectMatch(match.id)}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: "14px",
                      padding: "11px 12px",
                      background: "rgba(255,255,255,0.07)",
                      color: "#ffffff",
                      fontWeight: 950,
                      cursor: "pointer",
                    }}
                  >
                    Detail zápasu
                  </button>

                  <button
                    onClick={() => void handleDelete(match.id, match.matchTitle)}
                    disabled={deletingMatchId === match.id}
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "14px",
                      border: "none",
                      background: "rgba(198,40,40,0.95)",
                      color: "white",
                      cursor: deletingMatchId === match.id ? "default" : "pointer",
                      fontWeight: 950,
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
    </div>
  );
}