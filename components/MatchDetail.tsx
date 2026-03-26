"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { getMatchLineupPlayerIds, saveMatchLineup } from "@/lib/matchLineups";
import { canEditLineup } from "@/lib/liveMatch";
import { styles } from "@/styles/appStyles";
import type { PlannedMatch } from "@/app/page";

type MatchDetailProps = {
  clubId: string;
  matchId: string;
  onBack: () => void;
  onSaveLineup: (
    selectedPlayers: number[],
    goalkeeper: number | null,
    updatedMatch: PlannedMatch
  ) => void;
  matchTitle: string;
  team: "A" | "B";
  date: string;
  primaryColor?: string;
  initialStatus?: PlannedMatch["status"];
};

export default function MatchDetail({
  clubId,
  matchId,
  onBack,
  onSaveLineup,
  matchTitle,
  team,
  date,
  primaryColor = "#888888",
  initialStatus = "planned",
}: MatchDetailProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [goalkeeper, setGoalkeeper] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [savingLineup, setSavingLineup] = useState(false);

  const lineupEditable = canEditLineup(initialStatus);

  useEffect(() => {
    let active = true;

    const loadPlayersAndLineup = async () => {
      setPlayersLoading(true);
      setMessage("");

      const loadedPlayers = await getPlayersByClubId(clubId);

      if (!active) return;

      setPlayers(loadedPlayers);

      const lineupPlayerIds = await getMatchLineupPlayerIds(matchId);

      if (!active) return;

      if (lineupPlayerIds.length > 0) {
        const selectedNumbers = loadedPlayers
          .filter((player) => lineupPlayerIds.includes(player.id))
          .map((player) => player.number);

        setSelectedPlayers(selectedNumbers);
      } else {
        setSelectedPlayers([]);
      }

      setPlayersLoading(false);
    };

    void loadPlayersAndLineup();

    return () => {
      active = false;
    };
  }, [clubId, matchId]);

  const selectedPlayerIds = useMemo(() => {
    return players
      .filter((player) => selectedPlayers.includes(player.number))
      .map((player) => player.id);
  }, [players, selectedPlayers]);

  const goalkeeperPlayerId = useMemo(() => {
    if (goalkeeper === null) return null;
    return players.find((player) => player.number === goalkeeper)?.id ?? null;
  }, [goalkeeper, players]);

  const togglePlayer = (number: number) => {
    if (!lineupEditable) return;

    if (selectedPlayers.includes(number)) {
      setSelectedPlayers((prev) =>
        prev.filter((playerNumber) => playerNumber !== number)
      );

      if (goalkeeper === number) {
        setGoalkeeper(null);
      }

      return;
    }

    if (selectedPlayers.length >= 18) return;

    setSelectedPlayers((prev) => [...prev, number]);
  };

  const setAsGoalkeeper = (number: number) => {
    if (!lineupEditable) return;
    if (!selectedPlayers.includes(number)) return;
    setGoalkeeper(number);
  };

  const handleSave = async () => {
    if (!lineupEditable) {
      setMessage("Sestava už nejde upravovat.");
      return;
    }

    if (selectedPlayers.length === 0) {
      setMessage("Vyber aspoň jednoho hráče do sestavy.");
      return;
    }

    setSavingLineup(true);
    setMessage("");

    const result = await saveMatchLineup({
      matchId,
      playerIds: selectedPlayerIds,
      goalkeeperPlayerId,
    });

    if (!result.success || !result.match) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit sestavu.");
      setSavingLineup(false);
      return;
    }

    setMessage("Sestava byla uložena. Zápas je připravený k live.");
    onSaveLineup(selectedPlayers, goalkeeper, result.match);
    setSavingLineup(false);
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

        <div
          style={{
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "#d4d4d4" }}>
            Vybráno: <strong>{selectedPlayers.length}</strong> / 12
          </div>

          <div
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "bold",
              background:
                initialStatus === "prepared"
                  ? "rgba(61, 214, 140, 0.18)"
                  : "rgba(255,255,255,0.08)",
              color: initialStatus === "prepared" ? "#7dffbc" : "#dcdcdc",
              border:
                initialStatus === "prepared"
                  ? "1px solid rgba(61, 214, 140, 0.35)"
                  : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {initialStatus === "prepared" ? "PŘIPRAVENÝ" : "PLÁNOVANÝ"}
          </div>
        </div>

        {!lineupEditable && (
          <div
            style={{
              marginBottom: "12px",
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,120,120,0.08)",
              border: "1px solid rgba(255,120,120,0.22)",
              color: "#ffbdbd",
              fontSize: "14px",
            }}
          >
            Sestavu lze upravovat jen před začátkem zápasu.
          </div>
        )}

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
                    cursor: lineupEditable ? "pointer" : "default",
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
                    opacity: lineupEditable ? 1 : 0.82,
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
                        cursor: lineupEditable ? "pointer" : "default",
                        opacity: lineupEditable ? 1 : 0.7,
                      }}
                      disabled={!lineupEditable}
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
            opacity: savingLineup || !lineupEditable ? 0.7 : 1,
          }}
          onClick={() => void handleSave()}
          disabled={
            playersLoading || players.length === 0 || savingLineup || !lineupEditable
          }
        >
          {savingLineup ? "Ukládám sestavu..." : "Uložit sestavu"}
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

        {message && (
          <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
        )}
      </div>
    </div>
  );
}