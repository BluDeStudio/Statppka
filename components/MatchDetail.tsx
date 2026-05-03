"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { getMatchLineupState, saveMatchLineup } from "@/lib/matchLineups";
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
  primaryColor = "#22c55e",
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

      const lineupState = await getMatchLineupState(matchId);

      if (!active) return;

      const selectedNumbers = loadedPlayers
        .filter((player) => lineupState.playerIds.includes(player.id))
        .map((player) => player.number);

      setSelectedPlayers(selectedNumbers);

      const savedGoalkeeper = loadedPlayers.find(
        (player) => player.id === lineupState.goalkeeperPlayerId
      );

      setGoalkeeper(savedGoalkeeper?.number ?? null);

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

  const glassCardStyle: React.CSSProperties = {
    borderRadius: "22px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.30)",
    backdropFilter: "blur(14px)",
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    marginTop: 0,
    background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
    color: "#071107",
    border: "none",
    boxShadow: `0 12px 28px ${primaryColor}33`,
    fontWeight: 950,
  };

  const softButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    marginTop: 0,
    background: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "none",
    fontWeight: 900,
  };

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

    if (selectedPlayers.length >= 18) {
      setMessage("Do sestavy můžeš vybrat maximálně 18 hráčů.");
      return;
    }

    setSelectedPlayers((prev) => [...prev, number]);
    setMessage("");
  };

  const setAsGoalkeeper = (number: number) => {
    if (!lineupEditable) return;

    if (!selectedPlayers.includes(number)) {
      setMessage("Nejdřív musí být hráč vybraný v sestavě.");
      return;
    }

    setGoalkeeper(number);
    setMessage("");
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
    <div style={{ display: "grid", gap: "14px" }}>
      <div
        style={{
          ...glassCardStyle,
          position: "relative",
          overflow: "hidden",
          padding: "16px",
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

        <div style={{ paddingLeft: "4px" }}>
          <div
            style={{
              color: "#9b9b9b",
              fontSize: "11px",
              fontWeight: 950,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Sestava zápasu
          </div>

          <div
            style={{
              fontWeight: 950,
              fontSize: "18px",
              lineHeight: 1.25,
              color: "#ffffff",
              wordBreak: "break-word",
            }}
          >
            {matchTitle}
          </div>

          <div
            style={{
              marginTop: "8px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              color: "#b8b8b8",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            <span>📅 {date}</span>
            <span>•</span>
            <span>{team}-tým</span>
          </div>
        </div>
      </div>

      <div
        style={{
          ...glassCardStyle,
          padding: "14px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                color: "#9b9b9b",
                fontSize: "11px",
                fontWeight: 950,
                letterSpacing: "0.7px",
                textTransform: "uppercase",
              }}
            >
              Vybráno
            </div>

            <div
              style={{
                marginTop: "6px",
                color: primaryColor,
                fontSize: "24px",
                fontWeight: 950,
              }}
            >
              {selectedPlayers.length}
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                color: "#9b9b9b",
                fontSize: "11px",
                fontWeight: 950,
                letterSpacing: "0.7px",
                textTransform: "uppercase",
              }}
            >
              Brankář
            </div>

            <div
              style={{
                marginTop: "6px",
                color: goalkeeper ? "#ffd86b" : "#b8b8b8",
                fontSize: "15px",
                fontWeight: 950,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {goalkeeper
                ? players.find((player) => player.number === goalkeeper)?.name ??
                  "Vybraný"
                : "Nevybrán"}
            </div>
          </div>
        </div>

        {!lineupEditable && (
          <div
            style={{
              padding: "12px",
              borderRadius: "16px",
              background: "rgba(255,120,120,0.08)",
              border: "1px solid rgba(255,120,120,0.22)",
              color: "#ffbdbd",
              fontSize: "14px",
              lineHeight: 1.45,
            }}
          >
            Sestavu lze upravovat jen před začátkem zápasu.
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "12px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "#d9d9d9",
              fontSize: "14px",
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        )}
      </div>

      <div
        style={{
          ...glassCardStyle,
          padding: "14px",
        }}
      >
        {playersLoading ? (
          <div
            style={{
              padding: "16px",
              borderRadius: "16px",
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
              padding: "16px",
              borderRadius: "16px",
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
              maxHeight: "460px",
              overflowY: "auto",
              display: "grid",
              gap: "10px",
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
                    position: "relative",
                    overflow: "hidden",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: "10px",
                    padding: "11px 12px",
                    borderRadius: "18px",
                    cursor: lineupEditable ? "pointer" : "default",
                    border: isGoalkeeper
                      ? "1px solid rgba(255, 216, 107, 0.55)"
                      : isSelected
                      ? `1px solid ${primaryColor}66`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: isGoalkeeper
                      ? "rgba(255,216,107,0.13)"
                      : isSelected
                      ? `${primaryColor}16`
                      : "rgba(255,255,255,0.04)",
                    opacity: lineupEditable ? 1 : 0.82,
                  }}
                >
                  {(isSelected || isGoalkeeper) && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: "4px",
                        background: isGoalkeeper ? "#ffd86b" : primaryColor,
                        boxShadow: isGoalkeeper
                          ? "0 0 16px rgba(255,216,107,0.55)"
                          : `0 0 16px ${primaryColor}66`,
                      }}
                    />
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        minWidth: "42px",
                        height: "42px",
                        borderRadius: "14px",
                        background: isGoalkeeper
                          ? "linear-gradient(135deg, #ffd86b, #f1c40f)"
                          : isSelected
                          ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
                          : "rgba(255,255,255,0.08)",
                        color: isSelected || isGoalkeeper ? "#071107" : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 950,
                        fontSize: "15px",
                        flexShrink: 0,
                      }}
                    >
                      {player.number}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 950,
                          color: "#ffffff",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {player.name}
                      </div>

                      <div
                        style={{
                          fontSize: "12px",
                          color: isGoalkeeper ? "#ffd86b" : "#b8b8b8",
                          marginTop: "4px",
                          fontWeight: isGoalkeeper ? 900 : 600,
                        }}
                      >
                        {isGoalkeeper
                          ? "BRANKÁŘ"
                          : isSelected
                          ? "V sestavě"
                          : player.position}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAsGoalkeeper(player.number);
                      }}
                      style={{
                        border: "none",
                        borderRadius: "12px",
                        padding: "8px 9px",
                        fontSize: "11px",
                        background: isGoalkeeper
                          ? "linear-gradient(135deg, #ffd86b, #f1c40f)"
                          : "rgba(255,255,255,0.10)",
                        color: isGoalkeeper ? "#111111" : "#ffffff",
                        fontWeight: 950,
                        cursor: lineupEditable ? "pointer" : "default",
                        opacity: lineupEditable ? 1 : 0.7,
                        whiteSpace: "nowrap",
                      }}
                      disabled={!lineupEditable}
                    >
                      {isGoalkeeper ? "BR" : "Nastavit BR"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          ...glassCardStyle,
          padding: "14px",
          display: "grid",
          gap: "10px",
        }}
      >
        <button
          type="button"
          style={{
            ...primaryButtonStyle,
            opacity: savingLineup || !lineupEditable ? 0.7 : 1,
          }}
          onClick={() => void handleSave()}
          disabled={
            playersLoading || players.length === 0 || savingLineup || !lineupEditable
          }
        >
          {savingLineup ? "Ukládám sestavu..." : "Uložit sestavu"}
        </button>

        <button type="button" style={softButtonStyle} onClick={onBack}>
          Zpět na zápasy
        </button>
      </div>
    </div>
  );
}