"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch } from "@/app/page";

type MatchEvent =
  | {
      type: "goal_for";
      scorer: number;
      assist: number | null;
    }
  | {
      type: "goal_against";
    };

type MatchLiveScreenProps = {
  clubId: string;
  primaryColor?: string;
  onBack: () => void;
  onFinishMatch: (finishedMatch: FinishedMatch) => void;
  matchId: string;
  matchTitle: string;
  team: "A" | "B";
  date: string;
  selectedPlayers: number[];
  goalkeeper: number | null;
};

export default function MatchLiveScreen({
  clubId,
  primaryColor = "#888888",
  onBack,
  onFinishMatch,
  matchId,
  matchTitle,
  team,
  date,
  selectedPlayers,
  goalkeeper,
}: MatchLiveScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [scorer, setScorer] = useState<number | "">("");
  const [assist, setAssist] = useState<number | "none" | "">("none");

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

  const selectedPlayerObjects = useMemo(() => {
    return players.filter((player) => selectedPlayers.includes(player.number));
  }, [players, selectedPlayers]);

  const getPlayerName = (number: number) => {
    return players.find((player) => player.number === number)?.name ?? `#${number}`;
  };

  const addGoalFor = () => {
    if (scorer === "") return;

    const assistValue = assist === "" || assist === "none" ? null : Number(assist);

    setEvents((prev) => [
      ...prev,
      {
        type: "goal_for",
        scorer: Number(scorer),
        assist: assistValue,
      },
    ]);

    setHomeScore((prev) => prev + 1);
    setScorer("");
    setAssist("none");
  };

  const addGoalAgainst = () => {
    setEvents((prev) => [...prev, { type: "goal_against" }]);
    setAwayScore((prev) => prev + 1);
  };

  const finishMatch = () => {
    const statsMap = new Map<number, { goals: number; assists: number }>();

    selectedPlayers.forEach((playerNumber) => {
      statsMap.set(playerNumber, { goals: 0, assists: 0 });
    });

    events.forEach((event) => {
      if (event.type === "goal_for") {
        const scorerStats = statsMap.get(event.scorer);
        if (scorerStats) {
          scorerStats.goals += 1;
        }

        if (event.assist !== null) {
          const assistStats = statsMap.get(event.assist);
          if (assistStats) {
            assistStats.assists += 1;
          }
        }
      }
    });

    const playerStats = Array.from(statsMap.entries()).map(([playerNumber, stats]) => ({
      playerNumber,
      goals: stats.goals,
      assists: stats.assists,
    }));

    onFinishMatch({
      id: matchId,
      matchTitle,
      team,
      date,
      score: `${homeScore}:${awayScore}`,
      goalkeeperNumber: goalkeeper,
      goalsAgainst: awayScore,
      playerStats,
      events,
    });
  };

  return (
    <div>
      <h2 style={styles.screenTitle}>LIVE zápas</h2>

      <div style={styles.card}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>{matchTitle}</div>
          <div style={{ fontSize: "13px", color: "#b8b8b8", marginTop: "4px" }}>
            {date} — {team}-tým
          </div>

          {goalkeeper !== null && (
            <div style={{ fontSize: "12px", color: "#ffdc73", marginTop: "6px" }}>
              Brankář: {getPlayerName(goalkeeper)}
            </div>
          )}
        </div>

        <div
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
            borderRadius: "18px",
            padding: "22px 16px",
            marginBottom: "16px",
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              fontSize: "52px",
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "2px",
            }}
          >
            {homeScore}:{awayScore}
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Přidat náš gól
          </div>

          {playersLoading ? (
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                color: "#b8b8b8",
              }}
            >
              Načítám hráče...
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              <select
                value={scorer}
                onChange={(e) =>
                  setScorer(e.target.value === "" ? "" : Number(e.target.value))
                }
                style={{
                  ...styles.input,
                  appearance: "none",
                }}
              >
                <option value="" style={{ color: "black" }}>
                  Vyber střelce
                </option>
                {selectedPlayerObjects.map((player) => (
                  <option
                    key={`scorer-${player.id}`}
                    value={player.number}
                    style={{ color: "black" }}
                  >
                    {player.number} — {player.name}
                  </option>
                ))}
              </select>

              <select
                value={assist}
                onChange={(e) =>
                  setAssist(
                    e.target.value === "none" || e.target.value === ""
                      ? (e.target.value as "none" | "")
                      : Number(e.target.value)
                  )
                }
                style={{
                  ...styles.input,
                  appearance: "none",
                }}
              >
                <option value="none" style={{ color: "black" }}>
                  Bez asistence
                </option>
                {selectedPlayerObjects.map((player) => (
                  <option
                    key={`assist-${player.id}`}
                    value={player.number}
                    style={{ color: "black" }}
                  >
                    {player.number} — {player.name}
                  </option>
                ))}
              </select>

              <button
                style={{
                  ...styles.primaryButton,
                  background: primaryColor,
                }}
                onClick={addGoalFor}
              >
                Uložit gól + asistenci
              </button>
            </div>
          )}
        </div>

        <div style={{ marginBottom: "14px" }}>
          <button
            style={{
              ...styles.primaryButton,
              background: "#c62828",
            }}
            onClick={addGoalAgainst}
          >
            Inkasovaný gól
          </button>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Průběh zápasu
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
              maxHeight: "220px",
              overflowY: "auto",
              paddingRight: "4px",
            }}
          >
            {events.length === 0 && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#b8b8b8",
                }}
              >
                Zatím bez událostí.
              </div>
            )}

            {events.map((event, index) => (
              <div
                key={index}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background:
                    event.type === "goal_for"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(198,40,40,0.14)",
                  border:
                    event.type === "goal_for"
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(198,40,40,0.35)",
                }}
              >
                {event.type === "goal_for" ? (
                  <div>
                    <div style={{ fontWeight: "bold" }}>
                      Gól: {getPlayerName(event.scorer)}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#d4d4d4",
                        marginTop: "4px",
                      }}
                    >
                      {event.assist !== null
                        ? `Asistence: ${getPlayerName(event.assist)}`
                        : "Bez asistence"}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontWeight: "bold" }}>Inkasovaný gól</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          style={{
            ...styles.primaryButton,
            background: primaryColor,
          }}
          onClick={finishMatch}
        >
          Konec zápasu a uložit
        </button>

        <button
          style={{
            ...styles.primaryButton,
            background: "rgba(255,255,255,0.12)",
            marginTop: "10px",
          }}
          onClick={onBack}
        >
          Zpět na sestavu
        </button>
      </div>
    </div>
  );
}