
"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { getMatchLineupPlayerIds } from "@/lib/matchLineups";
import {
  addGoalAgainstEvent,
  addGoalForEvent,
  addRedCardEvent,
  addYellowCardEvent,
  deleteLiveMatchEvent,
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
  isAdmin: boolean;
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
  primaryColor = "#22c55e",
  isAdmin,
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
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const [scorerId, setScorerId] = useState("");
  const [assistId, setAssistId] = useState<"none" | string>("none");
  const [yellowCardPlayerId, setYellowCardPlayerId] = useState("");
  const [redCardPlayerId, setRedCardPlayerId] = useState("");

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setPlayersLoading(true);
      setMessage("");

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
            .filter((player) => selectedPlayers.includes(player.number))
            .map((player) => player.id);

    return players.filter((player) => idsToUse.includes(player.id));
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
  const scoreFor = events.filter((event) => event.type === "goal_for").length;
  const scoreAgainst = events.filter((event) => event.type === "goal_against").length;

  const canControlMatch = isAdmin;
  const canEditEvents = isAdmin && matchState?.status === "live";
  const canStartMatch = isAdmin && matchState?.status !== "live" && matchState?.status !== "halftime";
  const canEndFirstHalf = isAdmin && matchState?.status === "live" && currentPeriod === 1;
  const canStartSecondHalf = isAdmin && matchState?.status === "halftime";
  const canFinishMatchNow = isAdmin;

  const getPlayerNameById = (playerId: string | null) => {
    if (!playerId) return "—";
    return players.find((player) => player.id === playerId)?.name ?? "Neznámý hráč";
  };

  const getPlayerNumberById = (playerId: string | null) => {
    if (!playerId) return null;
    return players.find((player) => player.id === playerId)?.number ?? null;
  };

  const displayedGoalkeeperName = useMemo(() => {
    if (matchState?.goalkeeper_player_id) {
      return getPlayerNameById(matchState.goalkeeper_player_id);
    }

    if (goalkeeper !== null) {
      return players.find((player) => player.number === goalkeeper)?.name ?? `#${goalkeeper}`;
    }

    return null;
  }, [matchState?.goalkeeper_player_id, goalkeeper, players]);

  const handleStartMatch = async () => {
    if (!isAdmin) {
      setMessage("Zápas může ovládat jen admin.");
      return;
    }

    setStartingMatch(true);
    setMessage("");

    const result = await startPreparedMatch(matchId);

    if (!result.success || !result.match) {
      setMessage(result.errorMessage ?? "Nepodařilo se zahájit zápas.");
      setStartingMatch(false);
      return;
    }

    setMatchState(result.match);
    onMatchStateChanged?.(result.match);
    setMessage("Zápas běží.");
    setStartingMatch(false);
  };

  const handleEndFirstHalf = async () => {
    if (!isAdmin) {
      setMessage("Zápas může ovládat jen admin.");
      return;
    }

    if (!matchState || matchState.status !== "live" || currentPeriod !== 1) {
      return;
    }

    setChangingHalf(true);
    setMessage("");

    const result = await endFirstHalf({
      matchId,
      elapsedSeconds: totalElapsedSeconds,
    });

    if (!result.success || !result.match) {
      setMessage(result.errorMessage ?? "Nepodařilo se ukončit 1. poločas.");
      setChangingHalf(false);
      return;
    }

    setMatchState(result.match);
    onMatchStateChanged?.(result.match);
    setMessage("1. poločas byl ukončen.");
    setChangingHalf(false);
  };

  const handleStartSecondHalf = async () => {
    if (!isAdmin) {
      setMessage("Zápas může ovládat jen admin.");
      return;
    }

    setChangingHalf(true);
    setMessage("");

    const result = await startSecondHalf(matchId);

    if (!result.success || !result.match) {
      setMessage(result.errorMessage ?? "Nepodařilo se zahájit 2. poločas.");
      setChangingHalf(false);
      return;
    }

    setMatchState(result.match);
    onMatchStateChanged?.(result.match);
    setMessage("2. poločas běží.");
    setChangingHalf(false);
  };

  const handleAddGoalFor = async () => {
    if (!isAdmin) {
      setMessage("Události může přidávat jen admin.");
      return;
    }

    if (!matchState || matchState.status !== "live") {
      setMessage("Nejdřív zahaj zápas.");
      return;
    }

    if (!scorerId) {
      setMessage("Vyber střelce.");
      return;
    }

    setSavingEvent(true);
    setMessage("");

    const result = await addGoalForEvent({
      matchId,
      scorerPlayerId: scorerId,
      assistPlayerId: assistId === "none" ? null : assistId,
      period: currentPeriod || 1,
      matchSecond: totalElapsedSeconds,
      matchMinute: Math.floor(totalElapsedSeconds / 60),
    });

    if (!result.success || !result.event) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit gól.");
      setSavingEvent(false);
      return;
    }

    const createdEvent = result.event;
    setEvents((prev) => [...prev, createdEvent]);
    setScorerId("");
    setAssistId("none");
    setMessage("Gól byl uložen.");
    setSavingEvent(false);
  };

  const handleAddGoalAgainst = async () => {
    if (!isAdmin) {
      setMessage("Události může přidávat jen admin.");
      return;
    }

    if (!matchState || matchState.status !== "live") {
      setMessage("Nejdřív zahaj zápas.");
      return;
    }

    setSavingEvent(true);
    setMessage("");

    const result = await addGoalAgainstEvent({
      matchId,
      period: currentPeriod || 1,
      matchSecond: totalElapsedSeconds,
      matchMinute: Math.floor(totalElapsedSeconds / 60),
    });

    if (!result.success || !result.event) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit inkasovaný gól.");
      setSavingEvent(false);
      return;
    }

    const createdEvent = result.event;
    setEvents((prev) => [...prev, createdEvent]);
    setMessage("Inkasovaný gól byl uložen.");
    setSavingEvent(false);
  };

  const handleAddYellowCard = async () => {
    if (!isAdmin) {
      setMessage("Události může přidávat jen admin.");
      return;
    }

    if (!matchState || matchState.status !== "live") {
      setMessage("Nejdřív zahaj zápas.");
      return;
    }

    if (!yellowCardPlayerId) {
      setMessage("Vyber hráče pro žlutou kartu.");
      return;
    }

    setSavingEvent(true);
    setMessage("");

    const result = await addYellowCardEvent({
      matchId,
      playerId: yellowCardPlayerId,
      period: currentPeriod || 1,
      matchSecond: totalElapsedSeconds,
      matchMinute: Math.floor(totalElapsedSeconds / 60),
    });

    if (!result.success || !result.event) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit žlutou kartu.");
      setSavingEvent(false);
      return;
    }

    const createdEvent = result.event;
    setEvents((prev) => [...prev, createdEvent]);
    setYellowCardPlayerId("");
    setMessage("Žlutá karta byla uložena.");
    setSavingEvent(false);
  };

  const handleAddRedCard = async () => {
    if (!isAdmin) {
      setMessage("Události může přidávat jen admin.");
      return;
    }

    if (!matchState || matchState.status !== "live") {
      setMessage("Nejdřív zahaj zápas.");
      return;
    }

    if (!redCardPlayerId) {
      setMessage("Vyber hráče pro červenou kartu.");
      return;
    }

    setSavingEvent(true);
    setMessage("");

    const result = await addRedCardEvent({
      matchId,
      playerId: redCardPlayerId,
      period: currentPeriod || 1,
      matchSecond: totalElapsedSeconds,
      matchMinute: Math.floor(totalElapsedSeconds / 60),
    });

    if (!result.success || !result.event) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit červenou kartu.");
      setSavingEvent(false);
      return;
    }

    const createdEvent = result.event;
    setEvents((prev) => [...prev, createdEvent]);
    setRedCardPlayerId("");
    setMessage("Červená karta byla uložena.");
    setSavingEvent(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!isAdmin) {
      setMessage("Události může mazat jen admin.");
      return;
    }

    const confirmed = window.confirm("Opravdu chceš smazat tuto událost?");
    if (!confirmed) return;

    setDeletingEventId(eventId);
    setMessage("");

    const result = await deleteLiveMatchEvent(eventId);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se smazat událost.");
      setDeletingEventId(null);
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== eventId));
    setMessage("Událost byla smazána.");
    setDeletingEventId(null);
  };

  const handleFinishMatch = async () => {
    if (!isAdmin) {
      setMessage("Zápas může ukončit jen admin.");
      return;
    }

    if (selectedPlayerObjects.length === 0) {
      setMessage("Zápas nemá načtenou sestavu.");
      return;
    }

    setFinishingMatch(true);
    setMessage("");

    const statsMap = new Map<
      number,
      { goals: number; assists: number; yellowCards: number; redCards: number }
    >();

    selectedPlayerObjects.forEach((player) => {
      statsMap.set(player.number, {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
      });
    });

    const mappedEvents: FinishedMatch["events"] = events.map((event) => {
      if (event.type === "goal_for") {
        const scorerNumber = getPlayerNumberById(event.scorer_player_id);
        const assistNumber = getPlayerNumberById(event.assist_player_id);

        if (scorerNumber !== null) {
          const scorerStats = statsMap.get(scorerNumber);
          if (scorerStats) scorerStats.goals += 1;
        }

        if (assistNumber !== null) {
          const assistStats = statsMap.get(assistNumber);
          if (assistStats) assistStats.assists += 1;
        }

        return {
          type: "goal_for",
          scorer: scorerNumber ?? 0,
          assist: assistNumber,
        };
      }

      if (event.type === "yellow_card") {
        const playerNumber = getPlayerNumberById(event.card_player_id);

        if (playerNumber !== null) {
          const playerStats = statsMap.get(playerNumber);
          if (playerStats) playerStats.yellowCards += 1;
        }

        return {
          type: "yellow_card",
          playerNumber: playerNumber ?? 0,
        };
      }

      if (event.type === "red_card") {
        const playerNumber = getPlayerNumberById(event.card_player_id);

        if (playerNumber !== null) {
          const playerStats = statsMap.get(playerNumber);
          if (playerStats) playerStats.redCards += 1;
        }

        return {
          type: "red_card",
          playerNumber: playerNumber ?? 0,
        };
      }

      return {
        type: "goal_against",
      };
    });

    const playerStats = Array.from(statsMap.entries()).map(([playerNumber, stats]) => ({
      playerNumber,
      goals: stats.goals,
      assists: stats.assists,
      yellowCards: stats.yellowCards,
      redCards: stats.redCards,
    }));

    const goalkeeperNumberToSave =
      matchState?.goalkeeper_player_id
        ? getPlayerNumberById(matchState.goalkeeper_player_id)
        : goalkeeper;

    const result = await onFinishMatch({
      id: matchId,
      matchTitle,
      team,
      date,
      score: `${scoreFor}:${scoreAgainst}`,
      goalkeeperNumber: goalkeeperNumberToSave ?? null,
      goalsAgainst: scoreAgainst,
      playerStats,
      events: mappedEvents,
    });

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se ukončit zápas.");
      setFinishingMatch(false);
      return;
    }

    setFinishingMatch(false);
  };

  if (loading) {
    return (
      <div>
        <h2 style={styles.screenTitle}>LIVE zápas</h2>
        <div style={styles.card}>
          <div style={{ color: "#b8b8b8" }}>Načítám live zápas...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={styles.screenTitle}>LIVE zápas</h2>

      <div style={styles.card}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>{matchTitle}</div>
          <div style={{ fontSize: "13px", color: "#b8b8b8", marginTop: "4px" }}>
            {date} — {team}-tým
          </div>

          {displayedGoalkeeperName && (
            <div style={{ fontSize: "12px", color: "#ffdc73", marginTop: "6px" }}>
              Brankář: {displayedGoalkeeperName}
            </div>
          )}

          <div
            style={{
              marginTop: "10px",
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "bold",
              background:
                matchState?.status === "live"
                  ? "rgba(61, 214, 140, 0.16)"
                  : matchState?.status === "halftime"
                    ? "rgba(255,204,0,0.16)"
                    : "rgba(255,255,255,0.08)",
              color:
                matchState?.status === "live"
                  ? "#7dffbc"
                  : matchState?.status === "halftime"
                    ? "#ffdc73"
                    : "#d5d5d5",
              border:
                matchState?.status === "live"
                  ? "1px solid rgba(61, 214, 140, 0.28)"
                  : matchState?.status === "halftime"
                    ? "1px solid rgba(255,204,0,0.28)"
                    : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {matchState?.status === "live"
              ? "LIVE"
              : matchState?.status === "halftime"
                ? "PŘESTÁVKA"
                : "PŘIPRAVENÝ"}
          </div>
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
          <div style={{ fontSize: "14px", color: "#b8b8b8", marginBottom: "10px" }}>
            Čas zápasu
          </div>

          <div
            style={{
              fontSize: "34px",
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "2px",
              marginBottom: "12px",
            }}
          >
            {formatMatchClock(totalElapsedSeconds)}
          </div>

          <div style={{ fontSize: "14px", color: "#b8b8b8", marginBottom: "14px" }}>
            {matchState?.status === "halftime"
              ? "Přestávka"
              : currentPeriod === 1
                ? "1. poločas"
                : currentPeriod === 2
                  ? "2. poločas"
                  : "Před zápasem"}
          </div>

          <div
            style={{
              fontSize: "52px",
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "2px",
            }}
          >
            {scoreFor}:{scoreAgainst}
          </div>
        </div>

        {!canControlMatch && (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#d9d9d9",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            Jako člen týmu můžeš live zápas sledovat, ale ovládání zápasu má jen admin.
          </div>
        )}

        {canStartMatch && (
          <button
            style={{
              ...styles.primaryButton,
              background: primaryColor,
              opacity: startingMatch ? 0.7 : 1,
            }}
            onClick={() => void handleStartMatch()}
            disabled={startingMatch}
          >
            {startingMatch ? "Zahajuji zápas..." : "ZAHÁJIT ZÁPAS"}
          </button>
        )}

        {canEndFirstHalf && (
          <button
            style={{
              ...styles.primaryButton,
              background: "#f59e0b",
              opacity: changingHalf ? 0.7 : 1,
              marginTop: "10px",
            }}
            onClick={() => void handleEndFirstHalf()}
            disabled={changingHalf}
          >
            {changingHalf ? "Ukládám poločas..." : "KONEC 1. POLOČASU"}
          </button>
        )}

        {canStartSecondHalf && (
          <button
            style={{
              ...styles.primaryButton,
              background: "#16a34a",
              opacity: changingHalf ? 0.7 : 1,
              marginTop: "10px",
            }}
            onClick={() => void handleStartSecondHalf()}
            disabled={changingHalf}
          >
            {changingHalf ? "Spouštím 2. poločas..." : "ZAHÁJIT 2. POLOČAS"}
          </button>
        )}

        {isAdmin && (
          <>
            <div style={{ marginTop: "14px", marginBottom: "14px" }}>
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
                    value={scorerId}
                    onChange={(e) => setScorerId(e.target.value)}
                    style={{
                      ...styles.input,
                      appearance: "none",
                    }}
                    disabled={!canEditEvents || savingEvent || deletingEventId !== null}
                  >
                    <option value="" style={{ color: "black" }}>
                      Vyber střelce
                    </option>
                    {selectedPlayerObjects.map((player) => (
                      <option
                        key={`scorer-${player.id}`}
                        value={player.id}
                        style={{ color: "black" }}
                      >
                        {player.number} — {player.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={assistId}
                    onChange={(e) =>
                      setAssistId(e.target.value === "none" ? "none" : e.target.value)
                    }
                    style={{
                      ...styles.input,
                      appearance: "none",
                    }}
                    disabled={!canEditEvents || savingEvent || deletingEventId !== null}
                  >
                    <option value="none" style={{ color: "black" }}>
                      Bez asistence
                    </option>
                    {selectedPlayerObjects.map((player) => (
                      <option
                        key={`assist-${player.id}`}
                        value={player.id}
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
                      opacity:
                        savingEvent || !canEditEvents || deletingEventId !== null
                          ? 0.7
                          : 1,
                    }}
                    onClick={() => void handleAddGoalFor()}
                    disabled={savingEvent || !canEditEvents || deletingEventId !== null}
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
                  opacity:
                    savingEvent || !canEditEvents || deletingEventId !== null
                      ? 0.7
                      : 1,
                }}
                onClick={() => void handleAddGoalAgainst()}
                disabled={savingEvent || !canEditEvents || deletingEventId !== null}
              >
                Inkasovaný gól
              </button>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                Přidat žlutou kartu
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <select
                  value={yellowCardPlayerId}
                  onChange={(e) => setYellowCardPlayerId(e.target.value)}
                  style={{
                    ...styles.input,
                    appearance: "none",
                  }}
                  disabled={!canEditEvents || savingEvent || deletingEventId !== null}
                >
                  <option value="" style={{ color: "black" }}>
                    Vyber hráče
                  </option>
                  {selectedPlayerObjects.map((player) => (
                    <option
                      key={`yellow-${player.id}`}
                      value={player.id}
                      style={{ color: "black" }}
                    >
                      {player.number} — {player.name}
                    </option>
                  ))}
                </select>

                <button
                  style={{
                    ...styles.primaryButton,
                    background: "#f59e0b",
                    opacity:
                      savingEvent || !canEditEvents || deletingEventId !== null
                        ? 0.7
                        : 1,
                  }}
                  onClick={() => void handleAddYellowCard()}
                  disabled={savingEvent || !canEditEvents || deletingEventId !== null}
                >
                  Uložit žlutou kartu
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                Přidat červenou kartu
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <select
                  value={redCardPlayerId}
                  onChange={(e) => setRedCardPlayerId(e.target.value)}
                  style={{
                    ...styles.input,
                    appearance: "none",
                  }}
                  disabled={!canEditEvents || savingEvent || deletingEventId !== null}
                >
                  <option value="" style={{ color: "black" }}>
                    Vyber hráče
                  </option>
                  {selectedPlayerObjects.map((player) => (
                    <option
                      key={`red-${player.id}`}
                      value={player.id}
                      style={{ color: "black" }}
                    >
                      {player.number} — {player.name}
                    </option>
                  ))}
                </select>

                <button
                  style={{
                    ...styles.primaryButton,
                    background: "#b91c1c",
                    opacity:
                      savingEvent || !canEditEvents || deletingEventId !== null
                        ? 0.7
                        : 1,
                  }}
                  onClick={() => void handleAddRedCard()}
                  disabled={savingEvent || !canEditEvents || deletingEventId !== null}
                >
                  Uložit červenou kartu
                </button>
              </div>
            </div>
          </>
        )}

        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Průběh zápasu
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
              maxHeight: "260px",
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

            {events.map((event) => (
              <div
                key={event.id}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background:
                    event.type === "goal_for"
                      ? "rgba(255,255,255,0.06)"
                      : event.type === "goal_against"
                        ? "rgba(198,40,40,0.14)"
                        : event.type === "yellow_card"
                          ? "rgba(245, 158, 11, 0.16)"
                          : "rgba(185, 28, 28, 0.18)",
                  border:
                    event.type === "goal_for"
                      ? "1px solid rgba(255,255,255,0.08)"
                      : event.type === "goal_against"
                        ? "1px solid rgba(198,40,40,0.35)"
                        : event.type === "yellow_card"
                          ? "1px solid rgba(245, 158, 11, 0.30)"
                          : "1px solid rgba(185, 28, 28, 0.35)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: "#b8b8b8", marginBottom: "4px" }}>
                      {event.match_minute}'. minuta
                    </div>

                    {event.type === "goal_for" ? (
                      <div>
                        <div style={{ fontWeight: "bold" }}>
                          Gól: {getPlayerNameById(event.scorer_player_id)}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#d4d4d4",
                            marginTop: "4px",
                          }}
                        >
                          {event.assist_player_id
                            ? `Asistence: ${getPlayerNameById(event.assist_player_id)}`
                            : "Bez asistence"}
                        </div>
                      </div>
                    ) : event.type === "goal_against" ? (
                      <div style={{ fontWeight: "bold" }}>Inkasovaný gól</div>
                    ) : event.type === "yellow_card" ? (
                      <div style={{ fontWeight: "bold" }}>
                        Žlutá karta: {getPlayerNameById(event.card_player_id)}
                      </div>
                    ) : (
                      <div style={{ fontWeight: "bold" }}>
                        Červená karta: {getPlayerNameById(event.card_player_id)}
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteEvent(event.id)}
                      disabled={deletingEventId === event.id || savingEvent || finishingMatch}
                      style={{
                        minWidth: "74px",
                        height: "34px",
                        borderRadius: "8px",
                        border: "none",
                        background: "rgba(255,255,255,0.12)",
                        color: "white",
                        cursor:
                          deletingEventId === event.id || savingEvent || finishingMatch
                            ? "default"
                            : "pointer",
                        fontWeight: "bold",
                        padding: "0 10px",
                        opacity:
                          deletingEventId === event.id || savingEvent || finishingMatch ? 0.7 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {deletingEventId === event.id ? "..." : "Smazat"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {canFinishMatchNow && (
          <button
            style={{
              ...styles.primaryButton,
              background: primaryColor,
              opacity: finishingMatch || deletingEventId !== null ? 0.7 : 1,
            }}
            onClick={() => void handleFinishMatch()}
            disabled={finishingMatch || deletingEventId !== null}
          >
            {finishingMatch ? "Ukončuji zápas..." : "KONEC ZÁPASU"}
          </button>
        )}

        <button
          style={{
            ...styles.primaryButton,
            background: "rgba(255,255,255,0.12)",
            marginTop: "10px",
          }}
          onClick={onBack}
          disabled={deletingEventId !== null}
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
