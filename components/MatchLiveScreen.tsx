"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { getMatchLineupPlayerIds } from "@/lib/matchLineups";
import {
  addGoalAgainstEvent,
  addGoalForEvent,
  endFirstHalf,
  getLiveMatchEvents,
  getPlannedMatchById,
  startPreparedMatch,
  startSecondHalf,
  type LiveMatchEventRecord,
} from "@/lib/liveMatchEvents";
import { formatMatchClock, getTotalElapsedSeconds } from "@/lib/liveMatch";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch, PlannedMatch } from "@/app/page";

type MatchLiveScreenProps = {
  clubId: string;
  primaryColor?: string;
  onBack: () => void;
  onFinishMatch: (
    finishedMatch: FinishedMatch
  ) => Promise<{ success: boolean; errorMessage?: string }>;
  onMatchStateChanged?: (updatedMatch: PlannedMatch) => void;
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
  onMatchStateChanged,
  matchId,
  matchTitle,
  team,
  date,
  selectedPlayers,
  goalkeeper,
}: MatchLiveScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [lineupPlayerIds, setLineupPlayerIds] = useState<string[]>([]);
  const [matchState, setMatchState] = useState<PlannedMatch | null>(null);
  const [events, setEvents] = useState<LiveMatchEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [startingMatch, setStartingMatch] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [finishingMatch, setFinishingMatch] = useState(false);
  const [changingHalf, setChangingHalf] = useState(false);

  const [tick, setTick] = useState(0);
  const [scorerId, setScorerId] = useState("");
  const [assistId, setAssistId] = useState<"none" | string>("none");

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setPlayersLoading(true);

      const [loadedPlayers, loadedLineupIds, loadedMatch, loadedEvents] =
        await Promise.all([
          getPlayersByClubId(clubId),
          getMatchLineupPlayerIds(matchId),
          getPlannedMatchById(matchId),
          getLiveMatchEvents(matchId),
        ]);

      if (!active) return;

      setPlayers(loadedPlayers);
      setLineupPlayerIds(loadedLineupIds);
      setMatchState(loadedMatch);
      setEvents(loadedEvents);

      setPlayersLoading(false);
      setLoading(false);
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId, matchId]);

  useEffect(() => {
    if (matchState?.status !== "live") return;

    const interval = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [matchState?.status]);

  const selectedPlayerObjects = useMemo(() => {
    const idsToUse =
      lineupPlayerIds.length > 0
        ? lineupPlayerIds
        : players
            .filter((p) => selectedPlayers.includes(p.number))
            .map((p) => p.id);

    return players.filter((p) => idsToUse.includes(p.id));
  }, [players, lineupPlayerIds, selectedPlayers]);

  const totalElapsedSeconds = useMemo(() => {
    if (!matchState) return 0;

    return getTotalElapsedSeconds({
      status: matchState.status ?? "planned",
      current_period: matchState.current_period ?? 0,
      first_half_started_at: matchState.first_half_started_at ?? null,
      first_half_elapsed_seconds: matchState.first_half_elapsed_seconds ?? 0,
      second_half_started_at: matchState.second_half_started_at ?? null,
      second_half_elapsed_seconds: matchState.second_half_elapsed_seconds ?? 0,
    });
  }, [matchState, tick]);

  const currentPeriod = matchState?.current_period ?? 0;
  const scoreFor = events.filter((e) => e.type === "goal_for").length;
  const scoreAgainst = events.filter((e) => e.type === "goal_against").length;

  const getPlayerName = (id: string | null) =>
    players.find((p) => p.id === id)?.name ?? "Neznámý";

  const handleStartMatch = async () => {
    const res = await startPreparedMatch(matchId);
    if (res.match) {
      setMatchState(res.match);
      onMatchStateChanged?.(res.match);
    }
  };

  const handleEndFirstHalf = async () => {
    if (!matchState) return;

    const res = await endFirstHalf({
      matchId,
      elapsedSeconds: totalElapsedSeconds,
    });

    if (res.match) {
      setMatchState(res.match);
      onMatchStateChanged?.(res.match);
    }
  };

  const handleStartSecondHalf = async () => {
    const res = await startSecondHalf(matchId);
    if (res.match) {
      setMatchState(res.match);
      onMatchStateChanged?.(res.match);
    }
  };

  const handleAddGoalFor = async () => {
    if (!scorerId) return;

    const res = await addGoalForEvent({
      matchId,
      scorerPlayerId: scorerId,
      assistPlayerId: assistId === "none" ? null : assistId,
      period: currentPeriod || 1,
      matchSecond: totalElapsedSeconds,
      matchMinute: Math.floor(totalElapsedSeconds / 60),
    });

    if (res.success && res.event) {
      setEvents((prev) => [...prev, res.event!]); // ✅ FIX
      setScorerId("");
      setAssistId("none");
    }
  };

  const handleAddGoalAgainst = async () => {
    const res = await addGoalAgainstEvent({
      matchId,
      period: currentPeriod || 1,
      matchSecond: totalElapsedSeconds,
      matchMinute: Math.floor(totalElapsedSeconds / 60),
    });

    if (res.success && res.event) {
      setEvents((prev) => [...prev, res.event!]); // ✅ FIX
    }
  };

  const handleFinishMatch = async () => {
    const result = await onFinishMatch({
      id: matchId,
      matchTitle,
      team,
      date,
      score: `${scoreFor}:${scoreAgainst}`,
      goalkeeperNumber: goalkeeper,
      goalsAgainst: scoreAgainst,
      playerStats: [],
      events: [],
    });

    if (!result.success) {
      setMessage(result.errorMessage ?? "Chyba při ukládání");
    }
  };

  if (loading) return <div>Načítám...</div>;

  return (
    <div>
      <h2 style={styles.screenTitle}>LIVE zápas</h2>

      <div style={styles.card}>
        <div style={{ textAlign: "center", fontSize: "40px" }}>
          {scoreFor}:{scoreAgainst}
        </div>

        <div style={{ textAlign: "center", marginBottom: 10 }}>
          {formatMatchClock(totalElapsedSeconds)}
        </div>

        <button onClick={handleStartMatch}>ZAHÁJIT ZÁPAS</button>

        {matchState?.status === "live" && currentPeriod === 1 && (
          <button onClick={handleEndFirstHalf}>
            KONEC 1. POLOČASU
          </button>
        )}

        {matchState?.status === "halftime" && (
          <button onClick={handleStartSecondHalf}>
            ZAHÁJIT 2. POLOČAS
          </button>
        )}

        <select value={scorerId} onChange={(e) => setScorerId(e.target.value)}>
          <option value="">Střelec</option>
          {selectedPlayerObjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button onClick={handleAddGoalFor}>Gól</button>
        <button onClick={handleAddGoalAgainst}>Inkasovaný gól</button>

        <button onClick={handleFinishMatch}>KONEC ZÁPASU</button>

        {events.map((e) => (
          <div key={e.id}>
            {e.type === "goal_for"
              ? `Gól: ${getPlayerName(e.scorer_player_id)}`
              : "Inkasovaný gól"}
          </div>
        ))}
      </div>
    </div>
  );
}