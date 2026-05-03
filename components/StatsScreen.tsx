"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  buildMatchRatingSummary,
  getRatingBadgeColor,
  getRatingBadgeStyles,
  getRatingsForMatches,
  type PlayerRatingRow,
} from "@/lib/ratings";
import type { Period } from "@/lib/periods";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch } from "@/app/page";

type StatsMode = "players" | "goalkeepers";
type PlayerSort = "goals" | "assists" | "points" | "rating" | "motm";
type GoalkeeperSort = "matches" | "goalsAgainst" | "average";
type TeamFilter = "ALL" | "A" | "B";
type PeriodFilterMode = "active" | "all" | "custom";

type StatsScreenProps = {
  clubId: string;
  finishedMatches: FinishedMatch[];
  primaryColor?: string;
};

function ValueBadge({
  value,
  background,
  color,
}: {
  value: string | number;
  background: string;
  color: string;
}) {
  return (
    <div
      style={{
        minWidth: "58px",
        height: "40px",
        borderRadius: "14px",
        background,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "16px",
        fontWeight: 950,
        padding: "0 10px",
        boxSizing: "border-box",
        boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
      }}
    >
      {value}
    </div>
  );
}

function normalizeDateToIso(value?: string | null) {
  if (!value) return "";

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split(".");
    return `${year}-${month}-${day}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}$/.test(trimmed)) {
    const [datePart] = trimmed.split(" ");
    const [day, month, year] = datePart.split(".");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isMatchInsidePeriod(matchDate: string, period: Period | null) {
  if (!period) return true;

  const normalizedMatchDate = normalizeDateToIso(matchDate);
  const normalizedStartDate = normalizeDateToIso(period.start_date);
  const normalizedEndDate = normalizeDateToIso(period.end_date);

  if (!normalizedMatchDate || !normalizedStartDate || !normalizedEndDate) {
    return false;
  }

  return (
    normalizedMatchDate >= normalizedStartDate &&
    normalizedMatchDate <= normalizedEndDate
  );
}

function formatPeriodType(type?: string | null) {
  return type === "season" ? "Sezóna" : "Rok";
}

export default function StatsScreen({
  clubId,
  finishedMatches,
  primaryColor = "#888888",
}: StatsScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<PlayerRatingRow[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);
  const [loading, setLoading] = useState(true);

  const [periodFilterMode, setPeriodFilterMode] =
    useState<PeriodFilterMode>("active");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [periodPanelOpen, setPeriodPanelOpen] = useState(false);

  const [statsMode, setStatsMode] = useState<StatsMode>("players");
  const [playerSort, setPlayerSort] = useState<PlayerSort>("points");
  const [goalkeeperSort, setGoalkeeperSort] =
    useState<GoalkeeperSort>("matches");
  const [statsTeamFilter, setStatsTeamFilter] = useState<TeamFilter>("ALL");

  const finishedMatchIds = useMemo(
    () => finishedMatches.map((match) => match.id),
    [finishedMatches]
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      const [loadedPlayers, periodsResponse] = await Promise.all([
        getPlayersByClubId(clubId),
        supabase
          .from("periods")
          .select("*")
          .eq("club_id", clubId)
          .order("start_date", { ascending: false }),
      ]);

      const loadedRatings =
        finishedMatchIds.length > 0
          ? await getRatingsForMatches(finishedMatchIds)
          : [];

      if (!active) return;

      setPlayers(loadedPlayers);
      setRatings(loadedRatings);

      const loadedPeriods = ((periodsResponse.data as Period[]) ?? [])
        .slice()
        .sort((a, b) => b.start_date.localeCompare(a.start_date));

      setPeriods(loadedPeriods);

      const foundActivePeriod =
        loadedPeriods.find((period) => period.is_active) ?? null;

      setActivePeriod(foundActivePeriod);

      if (foundActivePeriod) {
        setPeriodFilterMode("active");
        setSelectedPeriodId(foundActivePeriod.id);
      } else {
        setPeriodFilterMode("all");
        setSelectedPeriodId("");
      }

      setLoading(false);
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId, finishedMatchIds.join("|")]);

  const playerNameByNumber = useMemo(() => {
    const map = new Map<number, string>();

    players.forEach((player) => {
      map.set(player.number, player.name);
    });

    return map;
  }, [players]);

  const ratingsByMatchId = useMemo(() => {
    const map = new Map<string, PlayerRatingRow[]>();

    ratings.forEach((rating) => {
      const rows = map.get(rating.finished_match_id) ?? [];
      rows.push(rating);
      map.set(rating.finished_match_id, rows);
    });

    return map;
  }, [ratings]);

  const getPlayerName = (number: number) => {
    return playerNameByNumber.get(number) ?? `#${number}`;
  };

  const customSelectedPeriod = useMemo(() => {
    if (!selectedPeriodId) return null;
    return periods.find((period) => period.id === selectedPeriodId) ?? null;
  }, [periods, selectedPeriodId]);

  const effectivePeriod = useMemo(() => {
    if (periodFilterMode === "all") return null;
    if (periodFilterMode === "active") return activePeriod;
    return customSelectedPeriod;
  }, [periodFilterMode, activePeriod, customSelectedPeriod]);

  const filteredStatsMatches = useMemo(() => {
    let matches = finishedMatches;

    if (effectivePeriod) {
      matches = matches.filter((match) =>
        isMatchInsidePeriod(match.date, effectivePeriod)
      );
    }

    if (statsTeamFilter !== "ALL") {
      matches = matches.filter((match) => match.team === statsTeamFilter);
    }

    return matches;
  }, [finishedMatches, effectivePeriod, statsTeamFilter]);

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
      const matchRatings = ratingsByMatchId.get(match.id) ?? [];

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

      const ratingsByPlayerNumber = new Map<number, PlayerRatingRow[]>();

      matchRatings.forEach((rating) => {
        const rows = ratingsByPlayerNumber.get(rating.player_number) ?? [];
        rows.push(rating);
        ratingsByPlayerNumber.set(rating.player_number, rows);
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
          const playerRatingsForMatch =
            ratingsByPlayerNumber.get(summary.playerNumber) ?? [];

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
  }, [filteredStatsMatches, playerSort, ratingsByMatchId, playerNameByNumber]);

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
        if (a.goalsAgainst !== b.goalsAgainst) {
          return a.goalsAgainst - b.goalsAgainst;
        }
        if (a.average !== b.average) return a.average - b.average;
        return a.name.localeCompare(b.name, "cs");
      }

      if (a.average !== b.average) return a.average - b.average;
      if (a.goalsAgainst !== b.goalsAgainst) {
        return a.goalsAgainst - b.goalsAgainst;
      }
      return a.name.localeCompare(b.name, "cs");
    });
  }, [filteredStatsMatches, goalkeeperSort, playerNameByNumber]);

  const glassCardStyle: React.CSSProperties = {
    borderRadius: "22px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.30)",
    backdropFilter: "blur(14px)",
  };

  const baseToggleStyle: React.CSSProperties = {
    flex: 1,
    padding: "11px 10px",
    borderRadius: "14px",
    border: "none",
    fontWeight: 950,
    cursor: "pointer",
    color: "white",
    letterSpacing: "0.2px",
  };

  const getToggleStyle = (active: boolean): React.CSSProperties => ({
    ...baseToggleStyle,
    background: active
      ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
      : "rgba(255,255,255,0.07)",
    color: active ? "#071107" : "#ffffff",
    boxShadow: active ? `0 10px 24px ${primaryColor}33` : "none",
  });

  const getChipStyle = (active: boolean): React.CSSProperties => ({
    border: active
      ? `1px solid ${primaryColor}66`
      : "1px solid rgba(255,255,255,0.10)",
    borderRadius: "999px",
    padding: "10px 13px",
    background: active ? `${primaryColor}22` : "rgba(255,255,255,0.06)",
    color: active ? primaryColor : "#ffffff",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const listWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: "10px",
  };

  const getPlayerDisplayValue = (player: (typeof fieldPlayerStats)[number]) => {
    if (playerSort === "goals") return player.goals;
    if (playerSort === "assists") return player.assists;
    if (playerSort === "rating") {
      return player.averageRating !== null
        ? player.averageRating.toFixed(1)
        : "--";
    }
    if (playerSort === "motm") return player.motmCount;
    return player.points;
  };

  const getPlayerBadgeStyle = (player: (typeof fieldPlayerStats)[number]) => {
    if (playerSort === "rating") {
      const colorKey = getRatingBadgeColor(player.averageRating, false);
      return getRatingBadgeStyles(colorKey);
    }

    return {
      background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
      color: "#071107",
    };
  };

  const getGoalkeeperDisplayValue = (
    goalkeeper: (typeof goalkeeperStats)[number]
  ) => {
    if (goalkeeperSort === "matches") return goalkeeper.matches;
    if (goalkeeperSort === "goalsAgainst") return goalkeeper.goalsAgainst;
    return goalkeeper.average;
  };

  const getGoalkeeperBadgeStyle = (
    goalkeeper: (typeof goalkeeperStats)[number]
  ) => {
    if (goalkeeperSort === "average") {
      const colorKey = getRatingBadgeColor(goalkeeper.average, false);
      return getRatingBadgeStyles(colorKey);
    }

    return {
      background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
      color: "#071107",
    };
  };

  const periodTitle =
    periodFilterMode === "all"
      ? "Všechna období"
      : effectivePeriod?.name ?? "Bez aktivního období";

  const periodSubtitle =
    periodFilterMode === "all"
      ? `${filteredStatsMatches.length} odehraných zápasů`
      : effectivePeriod
      ? `${formatPeriodType(effectivePeriod.type)} • ${effectivePeriod.start_date} až ${effectivePeriod.end_date}`
      : "Nejdřív vytvoř aktivní období";

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {loading ? (
        <div
          style={{
            ...glassCardStyle,
            padding: "16px",
            color: "#b8b8b8",
          }}
        >
          Načítám statistiky...
        </div>
      ) : (
        <>
          <div
            style={{
              ...glassCardStyle,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setPeriodPanelOpen((prev) => !prev)}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                color: "white",
                padding: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "14px",
                    background: `${primaryColor}22`,
                    color: primaryColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "21px",
                  }}
                >
                  📊
                </div>

                <div>
                  <div
                    style={{
                      color: "#9b9b9b",
                      fontSize: "12px",
                      fontWeight: 950,
                      letterSpacing: "0.8px",
                      textTransform: "uppercase",
                    }}
                  >
                    Období statistik
                  </div>

                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 950,
                      marginTop: "3px",
                    }}
                  >
                    {periodTitle}
                  </div>

                  <div
                    style={{
                      color: "#b8b8b8",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    {periodSubtitle}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: "24px",
                  color: "#b8b8b8",
                  transform: periodPanelOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              >
                ⌄
              </div>
            </button>

            {periodPanelOpen && (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "0 16px 16px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setPeriodFilterMode("active")}
                    style={getToggleStyle(periodFilterMode === "active")}
                  >
                    Aktivní
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodFilterMode("all")}
                    style={getToggleStyle(periodFilterMode === "all")}
                  >
                    Vše
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPeriodFilterMode("custom");
                    if (!selectedPeriodId && periods.length > 0) {
                      setSelectedPeriodId(periods[0].id);
                    }
                  }}
                  style={getToggleStyle(periodFilterMode === "custom")}
                >
                  Vybrat období
                </button>

                {periodFilterMode === "custom" && (
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    style={{
                      ...styles.input,
                      appearance: "none",
                      cursor: "pointer",
                      marginBottom: "0",
                    }}
                  >
                    <option
                      value=""
                      style={{ background: "#111111", color: "white" }}
                    >
                      Vyber období
                    </option>

                    {periods.map((period) => (
                      <option
                        key={period.id}
                        value={period.id}
                        style={{ background: "#111111", color: "white" }}
                      >
                        {period.name}
                        {period.is_active ? " (aktivní)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              ...glassCardStyle,
              padding: "8px",
            }}
          >
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setStatsMode("players")}
                style={getToggleStyle(statsMode === "players")}
              >
                HRÁČI
              </button>

              <button
                onClick={() => setStatsMode("goalkeepers")}
                style={getToggleStyle(statsMode === "goalkeepers")}
              >
                BRANKÁŘI
              </button>
            </div>
          </div>

          <div
            style={{
              ...glassCardStyle,
              padding: "14px",
            }}
          >
            <div
              style={{
                color: "#9b9b9b",
                fontSize: "12px",
                fontWeight: 950,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              Filtr týmu
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                overflowX: "auto",
                paddingBottom: "2px",
              }}
            >
              <button
                onClick={() => setStatsTeamFilter("ALL")}
                style={getChipStyle(statsTeamFilter === "ALL")}
              >
                Vše
              </button>

              <button
                onClick={() => setStatsTeamFilter("A")}
                style={getChipStyle(statsTeamFilter === "A")}
              >
                A-tým
              </button>

              <button
                onClick={() => setStatsTeamFilter("B")}
                style={getChipStyle(statsTeamFilter === "B")}
              >
                B-tým
              </button>
            </div>
          </div>

          {statsMode === "players" && (
            <>
              <div
                style={{
                  ...glassCardStyle,
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    color: "#9b9b9b",
                    fontSize: "12px",
                    fontWeight: 950,
                    letterSpacing: "0.8px",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                  }}
                >
                  Řazení hráčů
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => setPlayerSort("points")}
                      style={getToggleStyle(playerSort === "points")}
                    >
                      BODY
                    </button>

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
                      ASIST.
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
                      HRÁČ ZÁPASU
                    </button>
                  </div>
                </div>
              </div>

              {fieldPlayerStats.length === 0 ? (
                <div
                  style={{
                    ...glassCardStyle,
                    padding: "16px",
                    color: "#b8b8b8",
                  }}
                >
                  Zatím žádná data.
                </div>
              ) : (
                <div style={listWrapStyle}>
                  {fieldPlayerStats.map((player, index) => {
                    const badge = getPlayerBadgeStyle(player);
                    const isTop = index === 0;

                    return (
                      <div
                        key={player.number}
                        style={{
                          ...glassCardStyle,
                          position: "relative",
                          overflow: "hidden",
                          padding: "12px",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: "5px",
                            background: isTop ? primaryColor : "rgba(255,255,255,0.12)",
                            boxShadow: isTop
                              ? `0 0 18px ${primaryColor}66`
                              : "none",
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            paddingLeft: "4px",
                          }}
                        >
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
                                minWidth: "44px",
                                height: "44px",
                                borderRadius: "13px",
                                background: isTop
                                  ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
                                  : "rgba(255,255,255,0.08)",
                                color: isTop ? "#071107" : "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 950,
                                fontSize: "16px",
                              }}
                            >
                              {index + 1}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 950,
                                  fontSize: "16px",
                                  wordBreak: "break-word",
                                }}
                              >
                                {player.name}
                              </div>

                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#b8b8b8",
                                  marginTop: "4px",
                                  lineHeight: 1.45,
                                }}
                              >
                                Z {player.matches} • G {player.goals} • A{" "}
                                {player.assists} • B {player.points}
                              </div>

                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#b8b8b8",
                                  marginTop: "2px",
                                }}
                              >
                                Ø{" "}
                                {player.averageRating !== null
                                  ? player.averageRating.toFixed(1)
                                  : "--"}{" "}
                                • HZ {player.motmCount}
                              </div>
                            </div>
                          </div>

                          <ValueBadge
                            value={getPlayerDisplayValue(player)}
                            background={badge.background}
                            color={badge.color}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {statsMode === "goalkeepers" && (
            <>
              <div
                style={{
                  ...glassCardStyle,
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    color: "#9b9b9b",
                    fontSize: "12px",
                    fontWeight: 950,
                    letterSpacing: "0.8px",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                  }}
                >
                  Řazení brankářů
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
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
              </div>

              {goalkeeperStats.length === 0 ? (
                <div
                  style={{
                    ...glassCardStyle,
                    padding: "16px",
                    color: "#b8b8b8",
                  }}
                >
                  Zatím žádná data brankářů.
                </div>
              ) : (
                <div style={listWrapStyle}>
                  {goalkeeperStats.map((goalkeeper, index) => {
                    const badge = getGoalkeeperBadgeStyle(goalkeeper);
                    const isTop = index === 0;

                    return (
                      <div
                        key={goalkeeper.number}
                        style={{
                          ...glassCardStyle,
                          position: "relative",
                          overflow: "hidden",
                          padding: "12px",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: "5px",
                            background: isTop ? primaryColor : "rgba(255,255,255,0.12)",
                            boxShadow: isTop
                              ? `0 0 18px ${primaryColor}66`
                              : "none",
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            paddingLeft: "4px",
                          }}
                        >
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
                                minWidth: "44px",
                                height: "44px",
                                borderRadius: "13px",
                                background: isTop
                                  ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
                                  : "rgba(255,255,255,0.08)",
                                color: isTop ? "#071107" : "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 950,
                                fontSize: "16px",
                              }}
                            >
                              {index + 1}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 950,
                                  fontSize: "16px",
                                  wordBreak: "break-word",
                                }}
                              >
                                {goalkeeper.name}
                              </div>

                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#b8b8b8",
                                  marginTop: "4px",
                                }}
                              >
                                Z {goalkeeper.matches} • G{" "}
                                {goalkeeper.goalsAgainst} • Ø{" "}
                                {goalkeeper.average}
                              </div>
                            </div>
                          </div>

                          <ValueBadge
                            value={getGoalkeeperDisplayValue(goalkeeper)}
                            background={badge.background}
                            color={badge.color}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}