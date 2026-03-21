"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  buildMatchRatingSummary,
  getRatingsForMatches,
  type PlayerRatingRow,
} from "@/lib/ratings";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch } from "@/app/page";

type StatsMode = "players" | "goalkeepers";
type PlayerSort = "goals" | "assists" | "points" | "rating" | "motm";
type GoalkeeperSort = "matches" | "goalsAgainst" | "average";
type TeamFilter = "ALL" | "A" | "B";

type StatsScreenProps = {
  clubId: string;
  finishedMatches: FinishedMatch[];
  primaryColor?: string;
};

export default function StatsScreen({
  clubId,
  finishedMatches,
  primaryColor = "#888888",
}: StatsScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<PlayerRatingRow[]>([]);
  const [statsMode, setStatsMode] = useState<StatsMode>("players");
  const [playerSort, setPlayerSort] = useState<PlayerSort>("points");
  const [goalkeeperSort, setGoalkeeperSort] = useState<GoalkeeperSort>("matches");
  const [statsTeamFilter, setStatsTeamFilter] = useState<TeamFilter>("ALL");

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const loadedPlayers = await getPlayersByClubId(clubId);
      const loadedRatings = await getRatingsForMatches(
        finishedMatches.map((match) => match.id)
      );

      if (!active) return;

      setPlayers(loadedPlayers);
      setRatings(loadedRatings);
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId, finishedMatches]);

  const getPlayerName = (number: number) => {
    return players.find((player) => player.number === number)?.name ?? `#${number}`;
  };

  const filteredStatsMatches = useMemo(() => {
    if (statsTeamFilter === "ALL") return finishedMatches;
    return finishedMatches.filter((match) => match.team === statsTeamFilter);
  }, [finishedMatches, statsTeamFilter]);

  const fieldPlayerStats = useMemo(() => {
    const playerMap = new Map<
      number,
      {
        matches: number;
        goals: number;
        assists: number;
        ratingPoints: number;
        ratingVotes: number;
        motmCount: number;
      }
    >();

    filteredStatsMatches.forEach((match) => {
      const matchRatings = ratings.filter((rating) => rating.finished_match_id === match.id);
      const matchSummary = buildMatchRatingSummary(
        match.playerStats.map((player) => player.playerNumber),
        matchRatings
      );

      match.playerStats.forEach((stat) => {
        if (!playerMap.has(stat.playerNumber)) {
          playerMap.set(stat.playerNumber, {
            matches: 0,
            goals: 0,
            assists: 0,
            ratingPoints: 0,
            ratingVotes: 0,
            motmCount: 0,
          });
        }

        const current = playerMap.get(stat.playerNumber)!;
        current.matches += 1;
        current.goals += stat.goals;
        current.assists += stat.assists;
      });

      matchSummary.forEach((summary) => {
        if (!playerMap.has(summary.playerNumber)) {
          playerMap.set(summary.playerNumber, {
            matches: 0,
            goals: 0,
            assists: 0,
            ratingPoints: 0,
            ratingVotes: 0,
            motmCount: 0,
          });
        }

        const current = playerMap.get(summary.playerNumber)!;

        if (summary.averageRating !== null) {
          const playerRatingsForMatch = matchRatings.filter(
            (rating) => rating.player_number === summary.playerNumber
          );

          current.ratingPoints += playerRatingsForMatch.reduce(
            (sum, rating) => sum + Number(rating.rating),
            0
          );
          current.ratingVotes += playerRatingsForMatch.length;
        }

        if (summary.isBest) {
          current.motmCount += 1;
        }
      });
    });

    const arr = Array.from(playerMap.entries()).map(([number, stats]) => ({
      number,
      name: getPlayerName(number),
      matches: stats.matches,
      goals: stats.goals,
      assists: stats.assists,
      points: stats.goals + stats.assists,
      averageRating:
        stats.ratingVotes > 0
          ? Number((stats.ratingPoints / stats.ratingVotes).toFixed(1))
          : null,
      ratingVotes: stats.ratingVotes,
      motmCount: stats.motmCount,
    }));

    return arr.sort((a, b) => {
      if (playerSort === "goals") {
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.points !== a.points) return b.points - a.points;
        return a.name.localeCompare(b.name, "cs");
      }

      if (playerSort === "assists") {
        if (b.assists !== a.assists) return b.assists - a.assists;
        if (b.points !== a.points) return b.points - a.points;
        return a.name.localeCompare(b.name, "cs");
      }

      if (playerSort === "rating") {
        if ((b.averageRating ?? 0) !== (a.averageRating ?? 0)) {
          return (b.averageRating ?? 0) - (a.averageRating ?? 0);
        }
        if (b.ratingVotes !== a.ratingVotes) return b.ratingVotes - a.ratingVotes;
        return a.name.localeCompare(b.name, "cs");
      }

      if (playerSort === "motm") {
        if (b.motmCount !== a.motmCount) return b.motmCount - a.motmCount;
        if ((b.averageRating ?? 0) !== (a.averageRating ?? 0)) {
          return (b.averageRating ?? 0) - (a.averageRating ?? 0);
        }
        return a.name.localeCompare(b.name, "cs");
      }

      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return a.name.localeCompare(b.name, "cs");
    });
  }, [filteredStatsMatches, getPlayerName, playerSort, ratings]);

  const goalkeeperStats = useMemo(() => {
    const gkMap = new Map<number, { matches: number; goalsAgainst: number }>();

    filteredStatsMatches.forEach((match) => {
      if (match.goalkeeperNumber === null) return;

      if (!gkMap.has(match.goalkeeperNumber)) {
        gkMap.set(match.goalkeeperNumber, { matches: 0, goalsAgainst: 0 });
      }

      const current = gkMap.get(match.goalkeeperNumber)!;
      current.matches += 1;
      current.goalsAgainst += match.goalsAgainst;
    });

    const arr = Array.from(gkMap.entries()).map(([number, stats]) => ({
      number,
      name: getPlayerName(number),
      matches: stats.matches,
      goalsAgainst: stats.goalsAgainst,
      average:
        stats.matches > 0
          ? Number((stats.goalsAgainst / stats.matches).toFixed(2))
          : 0,
    }));

    return arr.sort((a, b) => {
      if (goalkeeperSort === "matches") {
        if (b.matches !== a.matches) return b.matches - a.matches;
        if (a.average !== b.average) return a.average - b.average;
        return a.name.localeCompare(b.name, "cs");
      }

      if (goalkeeperSort === "goalsAgainst") {
        if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
        if (a.average !== b.average) return a.average - b.average;
        return a.name.localeCompare(b.name, "cs");
      }

      if (a.average !== b.average) return a.average - b.average;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      return a.name.localeCompare(b.name, "cs");
    });
  }, [filteredStatsMatches, getPlayerName, goalkeeperSort]);

  const baseToggleStyle: React.CSSProperties = {
    flex: 1,
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    color: "white",
  };

  const getToggleStyle = (active: boolean): React.CSSProperties => ({
    ...baseToggleStyle,
    background: active ? primaryColor : "rgba(255,255,255,0.08)",
  });

  const listWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: "10px",
    maxHeight: "420px",
    overflowY: "auto",
    paddingRight: "4px",
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.screenTitle}>Statistiky</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => setStatsMode("players")}
          style={getToggleStyle(statsMode === "players")}
        >
          Hráči
        </button>

        <button
          onClick={() => setStatsMode("goalkeepers")}
          style={getToggleStyle(statsMode === "goalkeepers")}
        >
          Brankáři
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => setStatsTeamFilter("ALL")}
          style={getToggleStyle(statsTeamFilter === "ALL")}
        >
          Vše
        </button>

        <button
          onClick={() => setStatsTeamFilter("A")}
          style={getToggleStyle(statsTeamFilter === "A")}
        >
          A-tým
        </button>

        <button
          onClick={() => setStatsTeamFilter("B")}
          style={getToggleStyle(statsTeamFilter === "B")}
        >
          B-tým
        </button>
      </div>

      {statsMode === "players" && (
        <>
          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setPlayerSort("goals")}
                style={getToggleStyle(playerSort === "goals")}
              >
                GÓLY
              </button>

              <button
                onClick={() => setPlayerSort("assists")}
                style={getToggleStyle(playerSort === "assists")}
              >
                ASISTENCE
              </button>

              <button
                onClick={() => setPlayerSort("points")}
                style={getToggleStyle(playerSort === "points")}
              >
                BODY
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setPlayerSort("rating")}
                style={getToggleStyle(playerSort === "rating")}
              >
                ZNÁMKA
              </button>

              <button
                onClick={() => setPlayerSort("motm")}
                style={getToggleStyle(playerSort === "motm")}
              >
                HZ
              </button>
            </div>
          </div>

          {fieldPlayerStats.length === 0 ? (
            <div style={{ color: "#b8b8b8" }}>Zatím žádná data.</div>
          ) : (
            <div style={listWrapStyle}>
              {fieldPlayerStats.map((player, index) => (
                <div
                  key={player.number}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        minWidth: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: primaryColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        color: "white",
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>
                      <div style={{ fontWeight: "bold" }}>{player.name}</div>
                      <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                        Z {player.matches} / G {player.goals} / A {player.assists} / B {player.points}
                      </div>
                      <div style={{ fontSize: "12px", color: "#b8b8b8", marginTop: "2px" }}>
                        Ø {player.averageRating !== null ? player.averageRating.toFixed(1) : "--"} / HZ {player.motmCount}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      minWidth: "52px",
                      textAlign: "right",
                      fontSize: "18px",
                      fontWeight: "bold",
                      color: primaryColor,
                    }}
                  >
                    {playerSort === "goals"
                      ? player.goals
                      : playerSort === "assists"
                      ? player.assists
                      : playerSort === "rating"
                      ? player.averageRating !== null
                        ? player.averageRating.toFixed(1)
                        : "--"
                      : playerSort === "motm"
                      ? player.motmCount
                      : player.points}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {statsMode === "goalkeepers" && (
        <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <button
              onClick={() => setGoalkeeperSort("matches")}
              style={getToggleStyle(goalkeeperSort === "matches")}
            >
              ZÁPASY
            </button>

            <button
              onClick={() => setGoalkeeperSort("goalsAgainst")}
              style={getToggleStyle(goalkeeperSort === "goalsAgainst")}
            >
              GÓLY
            </button>

            <button
              onClick={() => setGoalkeeperSort("average")}
              style={getToggleStyle(goalkeeperSort === "average")}
            >
              PRŮMĚR
            </button>
          </div>

          {goalkeeperStats.length === 0 ? (
            <div style={{ color: "#b8b8b8" }}>Zatím žádná data brankářů.</div>
          ) : (
            <div style={listWrapStyle}>
              {goalkeeperStats.map((goalkeeper, index) => (
                <div
                  key={goalkeeper.number}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        minWidth: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: primaryColor,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>
                      <div style={{ fontWeight: "bold" }}>{goalkeeper.name}</div>
                      <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                        Z {goalkeeper.matches} / G {goalkeeper.goalsAgainst} / Ø {goalkeeper.average}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      minWidth: "42px",
                      textAlign: "right",
                      fontSize: "18px",
                      fontWeight: "bold",
                      color: primaryColor,
                    }}
                  >
                    {goalkeeperSort === "matches"
                      ? goalkeeper.matches
                      : goalkeeperSort === "goalsAgainst"
                      ? goalkeeper.goalsAgainst
                      : goalkeeper.average}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}