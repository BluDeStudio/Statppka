"use client";

import { useEffect, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { styles } from "@/styles/appStyles";

type MatchDetailProps = {
  clubId: string;
  onBack: () => void;
  onSaveLineup: (selectedPlayers: number[], goalkeeper: number | null) => void;
  matchTitle: string;
  team: "A" | "B";
  date: string;
  primaryColor?: string;
};

export default function MatchDetail({
  clubId,
  onBack,
  onSaveLineup,
  matchTitle,
  team,
  date,
  primaryColor = "#888888",
}: MatchDetailProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [goalkeeper, setGoalkeeper] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const loadPlayers = async () => {
      setPlayersLoading(true);

      const loadedPlayers = await getPlayersByClubId(clubId);

      if (!active) return;

      setPlayers(loadedPlayers);
      setPlayersLoading(false);
    };

    void loadPlayers();

    return () => {
      active = false;
    };
  }, [clubId]);

  const togglePlayer = (number: number) => {
    if (selectedPlayers.includes(number)) {
      setSelectedPlayers((prev) => prev.filter((playerNumber) => playerNumber !== number));

      if (goalkeeper === number) {
        setGoalkeeper(null);
      }

      return;
    }

    if (selectedPlayers.length >= 12) return;

    setSelectedPlayers((prev) => [...prev, number]);
  };

  const setAsGoalkeeper = (number: number) => {
    if (!selectedPlayers.includes(number)) return;
    setGoalkeeper(number);
  };

  const handleSave = () => {
    if (selectedPlayers.length === 0) return;
    onSaveLineup(selectedPlayers, goalkeeper);
  };

  return (
    <div>
      <h2 style={styles.screenTitle}>Sestava zápasu</h2>

      <div style={styles.card}>
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>{matchTitle}</div>
          <div style={{ fontSize: "13px", color: "#b8b8b8", marginTop: "4px" }}>
            {date} — {team}-tým
          </div>
        </div>

        <div style={{ marginBottom: "12px", color: "#d4d4d4" }}>
          Vybráno: <strong>{selectedPlayers.length}</strong> / 12
        </div>

        {playersLoading ? (
          <div
            style={{
              padding: "14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#b8b8b8",
              textAlign: "center",
            }}
          >
            Načítám soupisku...
          </div>
        ) : players.length === 0 ? (
          <div
            style={{
              padding: "14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#b8b8b8",
              textAlign: "center",
            }}
          >
            Tým zatím nemá žádné hráče.
          </div>
        ) : (
          <div
            style={{
              maxHeight: "420px",
              overflowY: "auto",
              display: "grid",
              gap: "10px",
              marginTop: "10px",
              paddingRight: "4px",
            }}
          >
            {players.map((player) => {
              const isSelected = selectedPlayers.includes(player.number);
              const isGoalkeeper = goalkeeper === player.number;

              return (
                <div
                  key={player.id}
                  onClick={() => togglePlayer(player.number)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    border: isGoalkeeper
                      ? "2px solid #ffcc00"
                      : isSelected
                      ? `2px solid ${primaryColor}`
                      : "1px solid rgba(255,255,255,0.1)",
                    background: isGoalkeeper
                      ? "rgba(255,204,0,0.14)"
                      : isSelected
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        minWidth: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: isGoalkeeper ? "#ffcc00" : primaryColor,
                        color: isGoalkeeper ? "#111" : "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {player.number}
                    </div>

                    <div>
                      <div style={{ fontWeight: "bold" }}>{player.name}</div>
                      <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                        {isGoalkeeper
                          ? "Brankář pro tento zápas"
                          : `${player.position} · hráč do sestavy`}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAsGoalkeeper(player.number);
                      }}
                      style={{
                        padding: "7px 10px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "12px",
                        background: isGoalkeeper ? "#ffcc00" : "rgba(255,255,255,0.12)",
                        color: isGoalkeeper ? "#111" : "white",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      {isGoalkeeper ? "BRANKÁŘ" : "Nastavit BR"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          style={{
            ...styles.primaryButton,
            background: primaryColor,
          }}
          onClick={handleSave}
          disabled={playersLoading || players.length === 0}
        >
          Uložit sestavu a jít do zápasu
        </button>

        <button
          style={{
            ...styles.primaryButton,
            background: "rgba(255,255,255,0.12)",
            marginTop: "10px",
          }}
          onClick={onBack}
        >
          Zpět na zápasy
        </button>
      </div>
    </div>
  );
}