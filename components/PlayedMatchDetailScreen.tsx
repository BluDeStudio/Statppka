"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getPlayersByClubId, type Player } from "@/lib/players";
import { removePlayerFromFinishedMatch } from "@/lib/matches";
import {
  buildMatchRatingSummary,
  getMatchPlayerRatings,
  getRatingBadgeStyles,
  upsertMatchPlayerRating,
  type PlayerRatingRow,
} from "@/lib/ratings";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch, FinishedMatchEvent } from "@/app/page";

type PlayedMatchDetailScreenProps = {
  clubId: string;
  match: FinishedMatch;
  onBack: () => void;
  isAdmin?: boolean;
};

type PlayerStatWithId = FinishedMatch["playerStats"][number] & {
  playerId?: string | null;
  player_id?: string | null;
};

type RatingRowWithId = PlayerRatingRow & {
  player_id?: string | null;
  playerId?: string | null;
};

type EventType = "goal_for" | "goal_against" | "yellow_card" | "red_card";

type EditableEvent = {
  localId: string;
  id?: string | null;
  type: EventType;
  scorer?: number | null;
  assist?: number | null;
  playerNumber?: number | null;
  scorerPlayerId?: string | null;
  assistPlayerId?: string | null;
  playerId?: string | null;
  period: number;
  minute: number;
};

type EventRowFromDb = {
  id?: string | null;
  type: EventType;
  scorer?: number | null;
  assist?: number | null;
  card_player_number?: number | null;
  scorer_player_id?: string | null;
  assist_player_id?: string | null;
  card_player_id?: string | null;
  player_id?: string | null;
  period?: number | null;
  minute?: number | null;
  match_minute?: number | null;
  created_at?: string | null;
};

type FinishedMatchPlayerStatIdRow = {
  finished_match_id: string;
  player_number: number;
  player_id: string | null;
};

type GoalkeeperSegment = {
  localId: string;
  id?: string | null;
  playerId: string | null;
  playerNumber: number;
  startMinute: number;
  endMinute: number;
  goalsAgainst: number;
};

type GoalkeeperSegmentDbRow = {
  id?: string | null;
  finished_match_id: string;
  player_id: string | null;
  player_number: number | null;
  start_minute: number;
  end_minute: number;
  goals_against: number | null;
};

const ratingOptions = Array.from({ length: 19 }, (_, index) => 1 + index * 0.5);
const VOTING_WINDOW_HOURS = 3;
const DEFAULT_MATCH_END_MINUTE = 60;

function createLocalId(prefix = "row") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatRatingValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getVotingDeadline(finishedAt?: string | null) {
  if (!finishedAt) return null;

  const finishedDate = new Date(finishedAt);
  if (Number.isNaN(finishedDate.getTime())) return null;

  return new Date(finishedDate.getTime() + VOTING_WINDOW_HOURS * 60 * 60 * 1000);
}

function formatDateTime(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRemainingVotingTime(finishedAt?: string | null, nowMs?: number) {
  const deadline = getVotingDeadline(finishedAt);
  if (!deadline) return null;

  const diffMs = deadline.getTime() - (nowMs ?? Date.now());

  if (diffMs <= 0) {
    return {
      isOpen: false,
      text: "Hodnocení je uzavřené.",
    };
  }

  const totalMinutes = Math.ceil(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return {
      isOpen: true,
      text: `Hodnocení je otevřené ještě ${hours} h ${minutes} min.`,
    };
  }

  return {
    isOpen: true,
    text: `Hodnocení je otevřené ještě ${minutes} min.`,
  };
}

function parseNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  return Math.floor(parsed);
}

function normalizeMinute(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
}

function getStatPlayerId(stat?: PlayerStatWithId | null) {
  return stat?.playerId ?? stat?.player_id ?? null;
}

function getRatingPlayerId(rating?: RatingRowWithId | null) {
  return rating?.player_id ?? rating?.playerId ?? null;
}

function getStatKey(stat: PlayerStatWithId) {
  const playerId = getStatPlayerId(stat);
  return playerId ? `id:${playerId}` : `number:${stat.playerNumber}`;
}

function dedupePlayerStats(
  playerStats: FinishedMatch["playerStats"]
): FinishedMatch["playerStats"] {
  const map = new Map<string, PlayerStatWithId>();

  (playerStats as PlayerStatWithId[]).forEach((rawStat) => {
    const stat = rawStat as PlayerStatWithId;
    const key = getStatKey(stat);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...stat });
      return;
    }

    map.set(key, {
      ...existing,
      playerId: getStatPlayerId(existing) ?? getStatPlayerId(stat),
      player_id: existing.player_id ?? stat.player_id ?? null,
      playerNumber: existing.playerNumber ?? stat.playerNumber,
      goals: (existing.goals ?? 0) + (stat.goals ?? 0),
      assists: (existing.assists ?? 0) + (stat.assists ?? 0),
      yellowCards: (existing.yellowCards ?? 0) + (stat.yellowCards ?? 0),
      redCards: (existing.redCards ?? 0) + (stat.redCards ?? 0),
      playedSeconds: Math.max(existing.playedSeconds ?? 0, stat.playedSeconds ?? 0),
      shotsOnTarget: Math.max(existing.shotsOnTarget ?? 0, stat.shotsOnTarget ?? 0),
      shotsOffTarget: Math.max(existing.shotsOffTarget ?? 0, stat.shotsOffTarget ?? 0),
    });
  });

  return Array.from(map.values());
}

function mergePlayerIdsIntoStats(
  playerStats: FinishedMatch["playerStats"],
  playerIdRows: FinishedMatchPlayerStatIdRow[]
): FinishedMatch["playerStats"] {
  return dedupePlayerStats(
    playerStats.map((rawStat) => {
      const stat = rawStat as PlayerStatWithId;
      const existingPlayerId = getStatPlayerId(stat);

      if (existingPlayerId) {
        return {
          ...stat,
          playerId: existingPlayerId,
        };
      }

      const row = playerIdRows.find(
        (item) => Number(item.player_number) === Number(stat.playerNumber)
      );

      return {
        ...stat,
        playerId: row?.player_id ?? null,
      };
    })
  );
}

function eventFromFinishedMatchEvent(
  event: FinishedMatchEvent,
  index: number,
  stats: PlayerStatWithId[]
): EditableEvent {
  const eventWithExtra = event as FinishedMatchEvent & {
    scorerPlayerId?: string | null;
    assistPlayerId?: string | null;
    playerId?: string | null;
    period?: number | null;
    minute?: number | null;
  };

  if (event.type === "goal_for") {
    const scorerStat = stats.find((item) => item.playerNumber === event.scorer);
    const assistStat =
      event.assist !== null
        ? stats.find((item) => item.playerNumber === event.assist)
        : null;

    return {
      localId: createLocalId(`event-${index}`),
      type: "goal_for",
      scorer: event.scorer,
      assist: event.assist,
      scorerPlayerId: eventWithExtra.scorerPlayerId ?? getStatPlayerId(scorerStat),
      assistPlayerId: eventWithExtra.assistPlayerId ?? getStatPlayerId(assistStat),
      period: eventWithExtra.period ?? 1,
      minute: normalizeMinute(eventWithExtra.minute ?? null),
    };
  }

  if (event.type === "yellow_card") {
    const stat = stats.find((item) => item.playerNumber === event.playerNumber);

    return {
      localId: createLocalId(`event-${index}`),
      type: "yellow_card",
      playerNumber: event.playerNumber,
      playerId: eventWithExtra.playerId ?? getStatPlayerId(stat),
      period: eventWithExtra.period ?? 1,
      minute: normalizeMinute(eventWithExtra.minute ?? null),
    };
  }

  if (event.type === "red_card") {
    const stat = stats.find((item) => item.playerNumber === event.playerNumber);

    return {
      localId: createLocalId(`event-${index}`),
      type: "red_card",
      playerNumber: event.playerNumber,
      playerId: eventWithExtra.playerId ?? getStatPlayerId(stat),
      period: eventWithExtra.period ?? 1,
      minute: normalizeMinute(eventWithExtra.minute ?? null),
    };
  }

  return {
    localId: createLocalId(`event-${index}`),
    type: "goal_against",
    period: eventWithExtra.period ?? 1,
    minute: normalizeMinute(eventWithExtra.minute ?? null),
  };
}

function eventFromDbRow(
  row: EventRowFromDb,
  index: number,
  stats: PlayerStatWithId[]
): EditableEvent {
  if (row.type === "goal_for") {
    const scorerStat = row.scorer_player_id
      ? stats.find((stat) => getStatPlayerId(stat) === row.scorer_player_id)
      : stats.find((stat) => Number(stat.playerNumber) === Number(row.scorer));

    const assistStat = row.assist_player_id
      ? stats.find((stat) => getStatPlayerId(stat) === row.assist_player_id)
      : row.assist !== null && row.assist !== undefined
      ? stats.find((stat) => Number(stat.playerNumber) === Number(row.assist))
      : null;

    return {
      localId: row.id ?? createLocalId(`db-event-${index}`),
      id: row.id ?? null,
      type: "goal_for",
      scorer: row.scorer ?? scorerStat?.playerNumber ?? null,
      assist: row.assist ?? assistStat?.playerNumber ?? null,
      scorerPlayerId: row.scorer_player_id ?? getStatPlayerId(scorerStat) ?? null,
      assistPlayerId: row.assist_player_id ?? getStatPlayerId(assistStat) ?? null,
      period: row.period ?? 1,
      minute: normalizeMinute(row.minute ?? row.match_minute ?? null),
    };
  }

  if (row.type === "yellow_card" || row.type === "red_card") {
    const cardStat = row.card_player_id
      ? stats.find((stat) => getStatPlayerId(stat) === row.card_player_id)
      : stats.find(
          (stat) => Number(stat.playerNumber) === Number(row.card_player_number)
        );

    return {
      localId: row.id ?? createLocalId(`db-event-${index}`),
      id: row.id ?? null,
      type: row.type,
      playerNumber: row.card_player_number ?? cardStat?.playerNumber ?? null,
      playerId: row.card_player_id ?? row.player_id ?? getStatPlayerId(cardStat) ?? null,
      period: row.period ?? 1,
      minute: normalizeMinute(row.minute ?? row.match_minute ?? null),
    };
  }

  return {
    localId: row.id ?? createLocalId(`db-event-${index}`),
    id: row.id ?? null,
    type: "goal_against",
    period: row.period ?? 1,
    minute: normalizeMinute(row.minute ?? row.match_minute ?? null),
  };
}

function eventToFinishedMatchEvent(event: EditableEvent): FinishedMatchEvent {
  if (event.type === "goal_for") {
    return {
      type: "goal_for",
      scorer: event.scorer ?? 0,
      assist: event.assist ?? null,
      scorerPlayerId: event.scorerPlayerId ?? null,
      assistPlayerId: event.assistPlayerId ?? null,
      period: event.period,
      minute: event.minute,
    } as FinishedMatchEvent;
  }

  if (event.type === "yellow_card") {
    return {
      type: "yellow_card",
      playerNumber: event.playerNumber ?? 0,
      playerId: event.playerId ?? null,
      period: event.period,
      minute: event.minute,
    } as FinishedMatchEvent;
  }

  if (event.type === "red_card") {
    return {
      type: "red_card",
      playerNumber: event.playerNumber ?? 0,
      playerId: event.playerId ?? null,
      period: event.period,
      minute: event.minute,
    } as FinishedMatchEvent;
  }

  return {
    type: "goal_against",
    period: event.period,
    minute: event.minute,
  } as FinishedMatchEvent;
}

function computeGoalkeeperSegmentsWithGoals(
  segments: GoalkeeperSegment[],
  _events: EditableEvent[]
) {
  return segments.map((segment) => ({
    ...segment,
    goalsAgainst: parseNumber(String(segment.goalsAgainst ?? 0)),
  }));
}

function recalculateStatsFromEvents(
  playerStats: FinishedMatch["playerStats"],
  events: EditableEvent[]
): FinishedMatch["playerStats"] {
  const nextStats = (dedupePlayerStats(playerStats) as PlayerStatWithId[]).map((rawStat) => ({
    ...rawStat,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
  }));

  const findStat = (playerId?: string | null, playerNumber?: number | null) => {
    if (playerId) {
      const byId = nextStats.find((stat) => getStatPlayerId(stat) === playerId);
      if (byId) return byId;
    }

    if (typeof playerNumber === "number") {
      return nextStats.find((stat) => stat.playerNumber === playerNumber) ?? null;
    }

    return null;
  };

  events.forEach((event) => {
    if (event.type === "goal_for") {
      const scorerStat = findStat(event.scorerPlayerId, event.scorer);
      const assistStat = findStat(event.assistPlayerId, event.assist);

      if (scorerStat) scorerStat.goals += 1;
      if (assistStat) assistStat.assists += 1;
    }

    if (event.type === "yellow_card") {
      const stat = findStat(event.playerId, event.playerNumber);
      if (stat) stat.yellowCards = (stat.yellowCards ?? 0) + 1;
    }

    if (event.type === "red_card") {
      const stat = findStat(event.playerId, event.playerNumber);
      if (stat) stat.redCards = (stat.redCards ?? 0) + 1;
    }
  });

  return nextStats;
}

export default function PlayedMatchDetailScreen({
  clubId,
  match,
  onBack,
  isAdmin = false,
}: PlayedMatchDetailScreenProps) {
  const [localMatch, setLocalMatch] = useState<FinishedMatch>(match);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<PlayerRatingRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedRatings, setSelectedRatings] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [savingPlayerKey, setSavingPlayerKey] = useState<string | null>(null);
  const [removingPlayerKey, setRemovingPlayerKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const [editEvents, setEditEvents] = useState<EditableEvent[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);

  const [goalkeeperSegments, setGoalkeeperSegments] = useState<GoalkeeperSegment[]>([]);
  const [goalkeepersEditMode, setGoalkeepersEditMode] = useState(false);
  const [savingGoalkeepers, setSavingGoalkeepers] = useState(false);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);

  useEffect(() => {
    setLocalMatch(match);
    setEditEvents(
      (match.events ?? []).map((event, index) =>
        eventFromFinishedMatchEvent(event, index, match.playerStats as PlayerStatWithId[])
      )
    );
    setEditingEventId(null);
    setGoalkeepersEditMode(false);
  }, [match]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const [
        loadedPlayers,
        loadedRatings,
        statsResponse,
        eventsResponse,
        goalkeeperResponse,
        {
          data: { user },
        },
      ] = await Promise.all([
        getPlayersByClubId(clubId),
        getMatchPlayerRatings(localMatch.id),
        supabase
          .from("finished_match_player_stats")
          .select("finished_match_id, player_number, player_id")
          .eq("finished_match_id", localMatch.id),
        supabase
          .from("finished_match_events")
          .select("*")
          .eq("finished_match_id", localMatch.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("finished_match_goalkeeper_segments")
          .select("*")
          .eq("finished_match_id", localMatch.id)
          .order("start_minute", { ascending: true }),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      const playerIdRows =
        ((statsResponse.data as FinishedMatchPlayerStatIdRow[]) ?? []).filter(Boolean);

      if (statsResponse.error) {
        console.error("Nepodařilo se načíst player_id pro detail zápasu:", statsResponse.error);
      }

      const mergedPlayerStats = mergePlayerIdsIntoStats(
        localMatch.playerStats,
        playerIdRows
      );

      const dbEvents =
        eventsResponse.error || !eventsResponse.data
          ? []
          : ((eventsResponse.data as EventRowFromDb[]) ?? []).map((row, index) =>
              eventFromDbRow(row, index, mergedPlayerStats as PlayerStatWithId[])
            );

      if (eventsResponse.error) {
        console.error("Nepodařilo se načíst události zápasu:", eventsResponse.error);
      }

      const nextEvents =
        dbEvents.length > 0
          ? dbEvents
          : (localMatch.events ?? []).map((event, index) =>
              eventFromFinishedMatchEvent(event, index, mergedPlayerStats as PlayerStatWithId[])
            );

      const dbGoalkeeperSegments =
        goalkeeperResponse.error || !goalkeeperResponse.data
          ? []
          : ((goalkeeperResponse.data as GoalkeeperSegmentDbRow[]) ?? []).map((row) => ({
              localId: row.id ?? createLocalId("gk-db"),
              id: row.id ?? null,
              playerId: row.player_id ?? null,
              playerNumber: row.player_number ?? 0,
              startMinute: normalizeMinute(row.start_minute),
              endMinute: normalizeMinute(row.end_minute),
              goalsAgainst: row.goals_against ?? 0,
            }));

      if (goalkeeperResponse.error) {
        console.warn(
          "Nepodařilo se načíst brankářské úseky. Pokud tabulka ještě neexistuje, spusť SQL pro finished_match_goalkeeper_segments.",
          goalkeeperResponse.error
        );
      }

      let fallbackGoalkeeperSegments: GoalkeeperSegment[] = [];
      if (dbGoalkeeperSegments.length === 0 && localMatch.goalkeeperNumber !== null) {
        const goalkeeperStat = (mergedPlayerStats as PlayerStatWithId[]).find(
          (stat) => stat.playerNumber === localMatch.goalkeeperNumber
        );
        const goalkeeperPlayerId = getStatPlayerId(goalkeeperStat);

        fallbackGoalkeeperSegments = [
          {
            localId: createLocalId("gk-default"),
            playerId: goalkeeperPlayerId,
            playerNumber: localMatch.goalkeeperNumber,
            startMinute: 0,
            endMinute: DEFAULT_MATCH_END_MINUTE,
            goalsAgainst: localMatch.goalsAgainst,
          },
        ];
      }

      const loadedGoalkeeperSegments = computeGoalkeeperSegmentsWithGoals(
        dbGoalkeeperSegments.length > 0 ? dbGoalkeeperSegments : fallbackGoalkeeperSegments,
        nextEvents
      );

      setLocalMatch((prev) => ({
        ...prev,
        playerStats: mergedPlayerStats,
        events: nextEvents.map(eventToFinishedMatchEvent),
      }));
      setEditEvents(nextEvents);
      setGoalkeeperSegments(loadedGoalkeeperSegments);
      setPlayers(loadedPlayers);
      setRatings(loadedRatings);
      setCurrentUserId(user?.id ?? null);

      if (user?.id) {
        const mine = loadedRatings.filter((rating) => rating.rated_by_user_id === user.id);
        const nextValues: Record<string, number> = {};

        mine.forEach((rating) => {
          const ratingWithId = rating as RatingRowWithId;
          const key = getRatingPlayerId(ratingWithId)
            ? `id:${getRatingPlayerId(ratingWithId)}`
            : `number:${rating.player_number}`;

          nextValues[key] = rating.rating;
        });

        setSelectedRatings(nextValues);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId, localMatch.id]);

  useEffect(() => {
    setNowMs(Date.now());

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((player) => map.set(player.id, player));
    return map;
  }, [players]);

  const playerByNumber = useMemo(() => {
    const map = new Map<number, Player>();
    players.forEach((player) => map.set(player.number, player));
    return map;
  }, [players]);

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
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "#071107",
    border: "none",
    boxShadow: "0 12px 28px rgba(34,197,94,0.22)",
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

  const inputStyle: React.CSSProperties = {
    ...styles.input,
    marginBottom: 0,
  };

  const smallButtonStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "12px",
    padding: "9px 10px",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };

  const dangerButtonStyle: React.CSSProperties = {
    ...smallButtonStyle,
    background: "rgba(198,40,40,0.88)",
    border: "1px solid rgba(198,40,40,0.42)",
  };

  const getPlayerByIdOrNumber = (
    playerId?: string | null,
    playerNumber?: number | null
  ) => {
    if (playerId) {
      const foundById = playerById.get(playerId);
      if (foundById) return foundById;
    }

    if (typeof playerNumber === "number") {
      return playerByNumber.get(playerNumber) ?? null;
    }

    return null;
  };

  const getPlayerNameByIdOrNumber = (
    playerId?: string | null,
    playerNumber?: number | null
  ) => {
    const player = getPlayerByIdOrNumber(playerId, playerNumber);
    if (player) return player.name;
    if (typeof playerNumber === "number") return `#${playerNumber}`;
    return "Neznámý hráč";
  };

  const getPlayerCurrentNumberByIdOrNumber = (
    playerId?: string | null,
    playerNumber?: number | null
  ) => {
    const player = getPlayerByIdOrNumber(playerId, playerNumber);
    if (player) return player.number;
    return playerNumber ?? null;
  };

  const getStatByNumber = (playerNumber: number) => {
    return (
      (localMatch.playerStats as PlayerStatWithId[]).find(
        (stat) => stat.playerNumber === playerNumber
      ) ?? null
    );
  };

  const selectablePlayers = useMemo(() => {
    return (localMatch.playerStats as PlayerStatWithId[])
      .map((stat) => {
        const playerId = getStatPlayerId(stat);
        const player = getPlayerByIdOrNumber(playerId, stat.playerNumber);

        return {
          stat,
          playerId,
          playerNumber: stat.playerNumber,
          currentNumber: player?.number ?? stat.playerNumber,
          name: player?.name ?? `#${stat.playerNumber}`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [localMatch.playerStats, playerById, playerByNumber]);

  const matchPlayerNumbers = useMemo(() => {
    const base = localMatch.playerStats.map((player) => player.playerNumber);

    if (
      localMatch.goalkeeperNumber !== null &&
      !base.includes(localMatch.goalkeeperNumber)
    ) {
      base.push(localMatch.goalkeeperNumber);
    }

    return base.sort((a, b) => a - b);
  }, [localMatch.goalkeeperNumber, localMatch.playerStats]);

  const ratingSummary = useMemo(() => {
    return buildMatchRatingSummary(matchPlayerNumbers, ratings);
  }, [matchPlayerNumbers, ratings]);

  const summaryMap = useMemo(() => {
    return new Map(ratingSummary.map((item) => [item.playerNumber, item]));
  }, [ratingSummary]);

  const playersWithStats = useMemo(() => {
    return (localMatch.playerStats as PlayerStatWithId[])
      .filter(
        (player) =>
          player.goals > 0 ||
          player.assists > 0 ||
          (player.yellowCards ?? 0) > 0 ||
          (player.redCards ?? 0) > 0
      )
      .sort((a, b) => {
        const bPoints = b.goals + b.assists;
        const aPoints = a.goals + a.assists;

        if (bPoints !== aPoints) return bPoints - aPoints;
        if (b.goals !== a.goals) return b.goals - a.goals;
        return getPlayerNameByIdOrNumber(
          getStatPlayerId(a),
          a.playerNumber
        ).localeCompare(
          getPlayerNameByIdOrNumber(getStatPlayerId(b), b.playerNumber),
          "cs"
        );
      });
  }, [localMatch.playerStats, playerById, playerByNumber]);

  const lineupPlayers = useMemo(() => {
    return (localMatch.playerStats as PlayerStatWithId[])
      .slice()
      .sort((a, b) => {
        const aCurrentNumber = getPlayerCurrentNumberByIdOrNumber(
          getStatPlayerId(a),
          a.playerNumber
        );
        const bCurrentNumber = getPlayerCurrentNumberByIdOrNumber(
          getStatPlayerId(b),
          b.playerNumber
        );

        return (aCurrentNumber ?? a.playerNumber) - (bCurrentNumber ?? b.playerNumber);
      });
  }, [localMatch.playerStats, playerById, playerByNumber]);

  const votingStatus = useMemo(() => {
    return getRemainingVotingTime(localMatch.finished_at, nowMs);
  }, [localMatch.finished_at, nowMs]);

  const votingDeadline = useMemo(() => {
    return getVotingDeadline(localMatch.finished_at);
  }, [localMatch.finished_at]);

  const isVotingOpen = votingStatus?.isOpen ?? false;

  const sortedRatingPlayerNumbers = useMemo(() => {
    if (isVotingOpen) return matchPlayerNumbers;

    return matchPlayerNumbers.slice().sort((a, b) => {
      const aSummary = summaryMap.get(a);
      const bSummary = summaryMap.get(b);
      const aRating = aSummary?.averageRating ?? -1;
      const bRating = bSummary?.averageRating ?? -1;

      if (bRating !== aRating) return bRating - aRating;

      const aStat = getStatByNumber(a);
      const bStat = getStatByNumber(b);

      return getPlayerNameByIdOrNumber(
        getStatPlayerId(aStat),
        a
      ).localeCompare(getPlayerNameByIdOrNumber(getStatPlayerId(bStat), b), "cs");
    });
  }, [isVotingOpen, matchPlayerNumbers, summaryMap, playerById, playerByNumber]);

  const scoreFor = editEvents.filter((event) => event.type === "goal_for").length;
  const scoreAgainst = editEvents.filter((event) => event.type === "goal_against").length;
  const computedScore = `${scoreFor}:${scoreAgainst}`;

  const playerHasEvent = (stat: PlayerStatWithId) => {
    const playerId = getStatPlayerId(stat);

    return editEvents.some((event) => {
      if (event.type === "goal_for") {
        if (playerId && (event.scorerPlayerId || event.assistPlayerId)) {
          return event.scorerPlayerId === playerId || event.assistPlayerId === playerId;
        }

        return event.scorer === stat.playerNumber || event.assist === stat.playerNumber;
      }

      if (event.type === "yellow_card" || event.type === "red_card") {
        if (playerId && event.playerId) return event.playerId === playerId;
        return event.playerNumber === stat.playerNumber;
      }

      return false;
    });
  };

  const playerHasGoalkeeperSegment = (stat: PlayerStatWithId) => {
    const playerId = getStatPlayerId(stat);

    return goalkeeperSegments.some((segment) => {
      if (playerId && segment.playerId) return segment.playerId === playerId;
      return segment.playerNumber === stat.playerNumber;
    });
  };

  const canRemovePlayer = (stat: PlayerStatWithId) => {
    if (!isAdmin) return false;

    const hasAnyStat =
      stat.goals > 0 ||
      stat.assists > 0 ||
      (stat.yellowCards ?? 0) > 0 ||
      (stat.redCards ?? 0) > 0;

    if (hasAnyStat) return false;
    if (playerHasEvent(stat)) return false;
    if (playerHasGoalkeeperSegment(stat)) return false;

    return true;
  };

  const updateEventPlayer = (
    localId: string,
    role: "scorer" | "assist" | "card",
    value: string
  ) => {
    setEditEvents((prev) =>
      prev.map((event) => {
        if (event.localId !== localId) return event;

        if (role === "assist" && value === "none") {
          return {
            ...event,
            assist: null,
            assistPlayerId: null,
          };
        }

        const selectedPlayer = selectablePlayers.find((item) => {
          const itemValue = item.playerId ?? `number:${item.playerNumber}`;
          return itemValue === value;
        });

        if (!selectedPlayer) return event;

        if (role === "scorer") {
          return {
            ...event,
            scorer: selectedPlayer.playerNumber,
            scorerPlayerId: selectedPlayer.playerId ?? null,
          };
        }

        if (role === "assist") {
          return {
            ...event,
            assist: selectedPlayer.playerNumber,
            assistPlayerId: selectedPlayer.playerId ?? null,
          };
        }

        return {
          ...event,
          playerNumber: selectedPlayer.playerNumber,
          playerId: selectedPlayer.playerId ?? null,
        };
      })
    );
  };

  const updateEventField = (
    localId: string,
    key: "type" | "period" | "minute",
    value: string
  ) => {
    setEditEvents((prev) =>
      prev.map((event) => {
        if (event.localId !== localId) return event;

        if (key === "type") {
          const nextType = value as EventType;

          if (nextType === "goal_for") {
            const firstPlayer = selectablePlayers[0];

            return {
              localId: event.localId,
              id: event.id,
              type: "goal_for",
              scorer: firstPlayer?.playerNumber ?? null,
              scorerPlayerId: firstPlayer?.playerId ?? null,
              assist: null,
              assistPlayerId: null,
              period: event.period,
              minute: event.minute,
            };
          }

          if (nextType === "yellow_card" || nextType === "red_card") {
            const firstPlayer = selectablePlayers[0];

            return {
              localId: event.localId,
              id: event.id,
              type: nextType,
              playerNumber: firstPlayer?.playerNumber ?? null,
              playerId: firstPlayer?.playerId ?? null,
              period: event.period,
              minute: event.minute,
            };
          }

          return {
            localId: event.localId,
            id: event.id,
            type: "goal_against",
            period: event.period,
            minute: event.minute,
          };
        }

        return {
          ...event,
          [key]: parseNumber(value),
        };
      })
    );
  };

  const persistMatchChanges = async (
    eventsToSave: EditableEvent[],
    segmentsToSave: GoalkeeperSegment[]
  ) => {
    const recalculatedPlayerStats = recalculateStatsFromEvents(
      dedupePlayerStats(localMatch.playerStats),
      eventsToSave
    );

    const nextGoalkeeperSegments = computeGoalkeeperSegmentsWithGoals(
      segmentsToSave,
      eventsToSave
    );

    const nextEvents = eventsToSave.map(eventToFinishedMatchEvent);
    const nextGoalsFor = eventsToSave.filter((event) => event.type === "goal_for").length;
    const eventGoalsAgainst = eventsToSave.filter(
      (event) => event.type === "goal_against"
    ).length;
    const manualGoalkeeperGoalsAgainst = nextGoalkeeperSegments.reduce(
      (sum, segment) => sum + Number(segment.goalsAgainst ?? 0),
      0
    );
    const nextGoalsAgainst =
      nextGoalkeeperSegments.length > 0
        ? manualGoalkeeperGoalsAgainst
        : eventGoalsAgainst;
    const nextScore = `${nextGoalsFor}:${nextGoalsAgainst}`;

    const { error: matchError } = await supabase
      .from("finished_matches")
      .update({
        score: nextScore,
        goals_against: nextGoalsAgainst,
      })
      .eq("id", localMatch.id);

    if (matchError) {
      console.error("Nepodařilo se uložit zápas:", matchError);
      return {
        success: false,
        errorMessage: "Nepodařilo se uložit změny zápasu.",
      };
    }

    const { error: deleteStatsError } = await supabase
      .from("finished_match_player_stats")
      .delete()
      .eq("finished_match_id", localMatch.id);

    if (deleteStatsError) {
      console.error("Nepodařilo se smazat původní statistiky hráčů:", deleteStatsError);
      return {
        success: false,
        errorMessage: "Nepodařilo se přepočítat statistiky hráčů.",
      };
    }

    if (recalculatedPlayerStats.length > 0) {
      const { error: insertStatsError } = await supabase
        .from("finished_match_player_stats")
        .insert(
          (recalculatedPlayerStats as PlayerStatWithId[]).map((stat) => ({
            finished_match_id: localMatch.id,
            player_id: getStatPlayerId(stat),
            player_number: stat.playerNumber,
            goals: stat.goals,
            assists: stat.assists,
            yellow_cards: stat.yellowCards ?? 0,
            red_cards: stat.redCards ?? 0,
            played_seconds: stat.playedSeconds ?? 0,
            shots_on_target: stat.shotsOnTarget ?? 0,
            shots_off_target: stat.shotsOffTarget ?? 0,
          }))
        );

      if (insertStatsError) {
        console.error("Nepodařilo se uložit přepočítané statistiky hráčů:", insertStatsError);
        return {
          success: false,
          errorMessage: "Nepodařilo se uložit přepočítané statistiky hráčů.",
        };
      }
    }

    const { error: deleteEventsError } = await supabase
      .from("finished_match_events")
      .delete()
      .eq("finished_match_id", localMatch.id);

    if (deleteEventsError) {
      console.error("Nepodařilo se smazat původní události:", deleteEventsError);
      return {
        success: false,
        errorMessage: "Nepodařilo se přepsat události zápasu.",
      };
    }

    if (eventsToSave.length > 0) {
      const { error: insertEventsError } = await supabase
        .from("finished_match_events")
        .insert(
          eventsToSave.map((event) => ({
            finished_match_id: localMatch.id,
            type: event.type,
            period: event.period,
            minute: event.minute,
            scorer: event.type === "goal_for" ? event.scorer : null,
            assist: event.type === "goal_for" ? event.assist : null,
            scorer_player_id:
              event.type === "goal_for" ? event.scorerPlayerId ?? null : null,
            assist_player_id:
              event.type === "goal_for" ? event.assistPlayerId ?? null : null,
            card_player_number:
              event.type === "yellow_card" || event.type === "red_card"
                ? event.playerNumber
                : null,
            card_player_id:
              event.type === "yellow_card" || event.type === "red_card"
                ? event.playerId ?? null
                : null,
          }))
        );

      if (insertEventsError) {
        console.error("Nepodařilo se uložit nové události:", insertEventsError);
        return {
          success: false,
          errorMessage: "Nepodařilo se uložit události zápasu.",
        };
      }
    }

    const { error: deleteGoalkeepersError } = await supabase
      .from("finished_match_goalkeeper_segments")
      .delete()
      .eq("finished_match_id", localMatch.id);

    if (deleteGoalkeepersError) {
      console.error(
        "Nepodařilo se smazat původní brankářské úseky:",
        deleteGoalkeepersError
      );
      return {
        success: false,
        errorMessage: `Nepodařilo se uložit brankáře: ${deleteGoalkeepersError.message}`,
      };
    }

    if (nextGoalkeeperSegments.length > 0) {
      const { error: insertGoalkeepersError } = await supabase
        .from("finished_match_goalkeeper_segments")
        .insert(
          nextGoalkeeperSegments.map((segment) => ({
            finished_match_id: localMatch.id,
            player_id: segment.playerId,
            player_number: segment.playerNumber,
            start_minute: segment.startMinute,
            end_minute: segment.endMinute,
            goals_against: segment.goalsAgainst,
          }))
        );

      if (insertGoalkeepersError) {
        console.error("Nepodařilo se uložit brankářské úseky:", insertGoalkeepersError);
        return {
          success: false,
          errorMessage: `Nepodařilo se uložit brankáře: ${insertGoalkeepersError.message}`,
        };
      }
    }

    setLocalMatch((prev) => ({
      ...prev,
      score: nextScore,
      goalsAgainst: nextGoalsAgainst,
      playerStats: recalculatedPlayerStats,
      events: nextEvents,
    }));

    setEditEvents(eventsToSave);
    setGoalkeeperSegments(nextGoalkeeperSegments);

    return {
      success: true,
    };
  };

  const addNewEvent = (type: EventType) => {
    const firstPlayer = selectablePlayers[0];
    const lastMinute =
      editEvents.length > 0
        ? Math.max(...editEvents.map((event) => normalizeMinute(event.minute)))
        : 0;

    const base = {
      localId: createLocalId("event-new"),
      id: null,
      period: lastMinute > 30 ? 2 : 1,
      minute: lastMinute,
    };

    let newEvent: EditableEvent;

    if (type === "goal_for") {
      newEvent = {
        ...base,
        type,
        scorer: firstPlayer?.playerNumber ?? null,
        scorerPlayerId: firstPlayer?.playerId ?? null,
        assist: null,
        assistPlayerId: null,
      };
    } else if (type === "yellow_card" || type === "red_card") {
      newEvent = {
        ...base,
        type,
        playerNumber: firstPlayer?.playerNumber ?? null,
        playerId: firstPlayer?.playerId ?? null,
      };
    } else {
      newEvent = {
        ...base,
        type,
      };
    }

    setEventsOpen(true);
    setEditEvents((prev) => [newEvent, ...prev]);
    setEditingEventId(newEvent.localId);
  };

  const handleSaveSingleEvent = async (localId: string) => {
    const event = editEvents.find((item) => item.localId === localId);

    if (!event) return;

    if (
      event.type === "goal_for" &&
      !event.scorerPlayerId &&
      typeof event.scorer !== "number"
    ) {
      setMessage("Vyber střelce gólu.");
      return;
    }

    if (
      event.type === "goal_for" &&
      event.assist !== null &&
      !event.assistPlayerId &&
      typeof event.assist !== "number"
    ) {
      setMessage("Vyber asistenci.");
      return;
    }

    if (
      (event.type === "yellow_card" || event.type === "red_card") &&
      !event.playerId &&
      typeof event.playerNumber !== "number"
    ) {
      setMessage("Vyber hráče ke kartě.");
      return;
    }

    setSavingEventId(localId);
    setMessage("");

    const result = await persistMatchChanges(editEvents, goalkeeperSegments);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit událost.");
      setSavingEventId(null);
      return;
    }

    setEditingEventId(null);
    setMessage("Událost byla uložena.");
    setSavingEventId(null);
  };

  const handleCancelSingleEvent = (localId: string) => {
    const event = editEvents.find((item) => item.localId === localId);

    if (event?.id === null) {
      setEditEvents((prev) => prev.filter((item) => item.localId !== localId));
    } else {
      setEditEvents(
        (localMatch.events ?? []).map((item, index) =>
          eventFromFinishedMatchEvent(
            item,
            index,
            localMatch.playerStats as PlayerStatWithId[]
          )
        )
      );
    }

    setEditingEventId(null);
    setMessage("");
  };

  const deleteEvent = async (localId: string) => {
    const confirmed = window.confirm("Opravdu chceš smazat tuto událost?");
    if (!confirmed) return;

    const nextEvents = editEvents.filter((event) => event.localId !== localId);

    setSavingEventId(localId);
    setMessage("");

    const result = await persistMatchChanges(nextEvents, goalkeeperSegments);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se smazat událost.");
      setSavingEventId(null);
      return;
    }

    setEditingEventId(null);
    setMessage("Událost byla smazána.");
    setSavingEventId(null);
  };

  const updateGoalkeeperSegment = (
    localId: string,
    key: "playerId" | "startMinute" | "endMinute" | "goalsAgainst",
    value: string
  ) => {
    setGoalkeeperSegments((prev) =>
      prev.map((segment) => {
        if (segment.localId !== localId) return segment;

        if (key === "playerId") {
          const selectedPlayer = selectablePlayers.find((item) => {
            const itemValue = item.playerId ?? `number:${item.playerNumber}`;
            return itemValue === value;
          });

          if (!selectedPlayer) return segment;

          return {
            ...segment,
            playerId: selectedPlayer.playerId ?? null,
            playerNumber: selectedPlayer.playerNumber,
          };
        }

        return {
          ...segment,
          [key]: parseNumber(value),
        };
      })
    );
  };

  const addGoalkeeperSegment = () => {
    const firstPlayer = selectablePlayers[0];

    if (!firstPlayer) {
      setMessage("Nejdřív musí být v sestavě alespoň jeden hráč.");
      return;
    }

    setGoalkeeperSegments((prev): GoalkeeperSegment[] => [
      ...prev,
      {
        localId: createLocalId("gk-new"),
        playerId: firstPlayer.playerId ?? null,
        playerNumber: firstPlayer.playerNumber,
        startMinute: 0,
        endMinute: DEFAULT_MATCH_END_MINUTE,
        goalsAgainst: 0,
      },
    ]);
  };

  const deleteGoalkeeperSegment = (localId: string) => {
    const confirmed = window.confirm("Opravdu chceš smazat tento brankářský úsek?");
    if (!confirmed) return;

    setGoalkeeperSegments((prev) => prev.filter((segment) => segment.localId !== localId));
  };

  const handleSaveGoalkeepers = async () => {
    setSavingGoalkeepers(true);
    setMessage("");

    const result = await persistMatchChanges(editEvents, goalkeeperSegments);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit brankáře.");
      setSavingGoalkeepers(false);
      return;
    }

    setGoalkeepersEditMode(false);
    setMessage("Brankářské úseky byly uloženy.");
    setSavingGoalkeepers(false);
  };

  const handleCancelGoalkeepers = async () => {
    const { data, error } = await supabase
      .from("finished_match_goalkeeper_segments")
      .select("*")
      .eq("finished_match_id", localMatch.id)
      .order("start_minute", { ascending: true });

    if (error) {
      console.error("Nepodařilo se znovu načíst brankářské úseky:", error);
      setMessage("Nepodařilo se obnovit původní brankáře.");
      return;
    }

    setGoalkeeperSegments(
      ((data as GoalkeeperSegmentDbRow[]) ?? []).map((row) => ({
        localId: row.id ?? createLocalId("gk-db"),
        id: row.id ?? null,
        playerId: row.player_id ?? null,
        playerNumber: row.player_number ?? 0,
        startMinute: normalizeMinute(row.start_minute),
        endMinute: normalizeMinute(row.end_minute),
        goalsAgainst: row.goals_against ?? 0,
      }))
    );

    setGoalkeepersEditMode(false);
    setMessage("");
  };

  const handleRemovePlayer = async (stat: PlayerStatWithId) => {
    if (!isAdmin) {
      setMessage("Editace zápasu je dostupná jen pro admina.");
      return;
    }

    const playerName = getPlayerNameByIdOrNumber(getStatPlayerId(stat), stat.playerNumber);
    const statKey = getStatKey(stat);
    const confirmed = window.confirm(
      `Opravdu chceš odebrat hráče ${playerName} ze zápasu?`
    );

    if (!confirmed) return;

    setRemovingPlayerKey(statKey);
    setMessage("");

    const result = await removePlayerFromFinishedMatch({
      finishedMatchId: localMatch.id,
      playerNumber: stat.playerNumber,
      playerId: getStatPlayerId(stat),
      goalkeeperNumber: localMatch.goalkeeperNumber,
      events: localMatch.events,
      playerStats: localMatch.playerStats,
    });

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se odebrat hráče ze zápasu.");
      setRemovingPlayerKey(null);
      return;
    }

    setLocalMatch((prev) => ({
      ...prev,
      playerStats: (prev.playerStats as PlayerStatWithId[]).filter(
        (player) => getStatKey(player) !== statKey
      ),
    }));

    setRatings((prev) =>
      prev.filter((rating) => {
        const ratingPlayerId = getRatingPlayerId(rating as RatingRowWithId);
        const statPlayerId = getStatPlayerId(stat);

        if (statPlayerId && ratingPlayerId) return ratingPlayerId !== statPlayerId;
        return rating.player_number !== stat.playerNumber;
      })
    );

    setSelectedRatings((prev) => {
      const next = { ...prev };
      delete next[statKey];
      return next;
    });

    setMessage(`Hráč ${playerName} byl odebrán ze zápasu.`);
    setRemovingPlayerKey(null);
  };

  const handleSaveRating = async (stat: PlayerStatWithId, ratingValue: number) => {
    if (!currentUserId) {
      setMessage("Chybí přihlášený uživatel.");
      return;
    }

    if (!isVotingOpen) {
      setMessage("Hodnocení už je uzavřené.");
      return;
    }

    const player = getPlayerByIdOrNumber(getStatPlayerId(stat), stat.playerNumber);
    const isSelf = player?.profile_id === currentUserId;

    if (isSelf) {
      setMessage("Nemůžeš hodnotit sám sebe.");
      return;
    }

    if (ratingValue < 1 || ratingValue > 10) {
      setMessage("Známka musí být mezi 1.0 a 10.0.");
      return;
    }

    const statKey = getStatKey(stat);

    setSavingPlayerKey(statKey);
    setMessage("");
    setSelectedRatings((prev) => ({
      ...prev,
      [statKey]: ratingValue,
    }));

    const result = await upsertMatchPlayerRating({
      finishedMatchId: localMatch.id,
      playerNumber: stat.playerNumber,
      ratedByUserId: currentUserId,
      rating: ratingValue,
    });

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit hodnocení.");
      setSavingPlayerKey(null);
      return;
    }

    const loadedRatings = await getMatchPlayerRatings(localMatch.id);
    setRatings(loadedRatings);
    setMessage("Hodnocení bylo uloženo.");
    setSavingPlayerKey(null);
  };

  const renderCollapsibleHeader = (
    title: string,
    subtitle: string,
    isOpen: boolean,
    onClick: () => void
  ) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        border: "none",
        background: "transparent",
        color: "white",
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 950, fontSize: "15px" }}>{title}</div>
          <div
            style={{
              marginTop: "4px",
              color: "#b8b8b8",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 950,
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          ›
        </div>
      </div>
    </button>
  );

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={{ ...glassCardStyle, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={onBack}
            style={{
              border: "none",
              borderRadius: "12px",
              padding: "10px 12px",
              background: "rgba(255,255,255,0.10)",
              color: "white",
              cursor: "pointer",
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            ← Zpět
          </button>

          <div style={{ fontWeight: 950, fontSize: "16px", letterSpacing: "0.3px" }}>
            DETAIL ZÁPASU
          </div>
        </div>
      </div>

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
            background: "#22c55e",
            boxShadow: "0 0 18px rgba(34,197,94,0.45)",
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
            Odehraný zápas
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
            {localMatch.matchTitle}
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
            <span>📅 {localMatch.date}</span>
            <span>•</span>
            <span>{localMatch.team}-tým</span>
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "22px 16px",
              borderRadius: "20px",
              textAlign: "center",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.035) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "46px",
                lineHeight: 1,
                fontWeight: 950,
                letterSpacing: "2px",
              }}
            >
              {localMatch.score}
            </div>

            <div
              style={{
                marginTop: "8px",
                color: "#b8b8b8",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              Skóre podle událostí: {computedScore}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div
          style={{
            ...glassCardStyle,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
            lineHeight: 1.45,
          }}
        >
          {message}
        </div>
      )}

      <div style={{ ...glassCardStyle, padding: "14px" }}>
        <div style={{ fontWeight: 950, marginBottom: "10px", fontSize: "15px" }}>
          Zápasové statistiky
        </div>

        <div style={{ display: "grid", gap: "8px" }}>
          {playersWithStats.map((stat, index) => {
            const statPlayerId = getStatPlayerId(stat);
            const currentNumber = getPlayerCurrentNumberByIdOrNumber(
              statPlayerId,
              stat.playerNumber
            );

            return (
              <div
                key={getStatKey(stat)}
                style={{
                  padding: "12px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "12px",
                      background:
                        index === 0
                          ? "rgba(34,197,94,0.22)"
                          : "rgba(255,255,255,0.08)",
                      color: index === 0 ? "#22c55e" : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                    }}
                  >
                    {index + 1}
                  </div>

                  <div>
                    <div style={{ fontWeight: 950 }}>
                      {getPlayerNameByIdOrNumber(statPlayerId, stat.playerNumber)}
                    </div>
                    <div style={{ fontSize: "12px", color: "#b8b8b8", marginTop: "3px" }}>
                      #{currentNumber ?? stat.playerNumber} • Body:{" "}
                      {stat.goals + stat.assists}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  <div>
                    {stat.goals}G / {stat.assists}A
                  </div>
                  <div style={{ fontSize: "12px", color: "#b8b8b8", marginTop: "4px" }}>
                    ŽK: {stat.yellowCards ?? 0} / ČK: {stat.redCards ?? 0}
                  </div>
                </div>
              </div>
            );
          })}

          {playersWithStats.length === 0 && (
            <div
              style={{
                padding: "12px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.04)",
                color: "#b8b8b8",
              }}
            >
              Nikdo nezapsal gól, asistenci ani kartu.
            </div>
          )}
        </div>
      </div>

      <div style={{ ...glassCardStyle, padding: "14px" }}>
        {renderCollapsibleHeader(
          "Průběh zápasu",
          `${editEvents.length} událostí`,
          eventsOpen,
          () => setEventsOpen((prev) => !prev)
        )}

        {eventsOpen && (
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            {isAdmin && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => addNewEvent("goal_for")}
                >
                  + Gól
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => addNewEvent("goal_against")}
                >
                  + Inkasovaný
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => addNewEvent("yellow_card")}
                >
                  + ŽK
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => addNewEvent("red_card")}
                >
                  + ČK
                </button>
              </div>
            )}

            {editEvents.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#b8b8b8",
                }}
              >
                Bez zapsaných událostí.
              </div>
            ) : (
              editEvents.map((event) => {
                const isEditing = editingEventId === event.localId;
                const isSaving = savingEventId === event.localId;

                return (
                  <div
                    key={event.localId}
                    style={{
                      padding: "12px",
                      borderRadius: "16px",
                      background:
                        event.type === "goal_for"
                          ? "rgba(34,197,94,0.10)"
                          : event.type === "goal_against"
                          ? "rgba(198,40,40,0.14)"
                          : event.type === "yellow_card"
                          ? "rgba(245, 158, 11, 0.16)"
                          : "rgba(185, 28, 28, 0.18)",
                      border:
                        event.type === "goal_for"
                          ? "1px solid rgba(34,197,94,0.22)"
                          : event.type === "goal_against"
                          ? "1px solid rgba(198,40,40,0.35)"
                          : event.type === "yellow_card"
                          ? "1px solid rgba(245, 158, 11, 0.30)"
                          : "1px solid rgba(185, 28, 28, 0.35)",
                    }}
                  >
                    {!isEditing ? (
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div style={{ fontWeight: 900 }}>
                          {event.type === "goal_for" &&
                            `⚽ ${getPlayerNameByIdOrNumber(
                              event.scorerPlayerId,
                              event.scorer
                            )}${
                              event.assist !== null && event.assist !== undefined
                                ? ` (asistence ${getPlayerNameByIdOrNumber(
                                    event.assistPlayerId,
                                    event.assist
                                  )})`
                                : ""
                            }`}
                          {event.type === "goal_against" && "🥅 Inkasovaný gól"}
                          {event.type === "yellow_card" &&
                            `🟨 Žlutá karta: ${getPlayerNameByIdOrNumber(
                              event.playerId,
                              event.playerNumber
                            )}`}
                          {event.type === "red_card" &&
                            `🟥 Červená karta: ${getPlayerNameByIdOrNumber(
                              event.playerId,
                              event.playerNumber
                            )}`}
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#b8b8b8",
                              marginTop: "4px",
                            }}
                          >
                            {event.period}. poločas • {event.minute}. minuta
                          </div>
                        </div>

                        {isAdmin && (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              style={smallButtonStyle}
                              onClick={() => setEditingEventId(event.localId)}
                            >
                              Upravit
                            </button>

                            <button
                              type="button"
                              style={dangerButtonStyle}
                              onClick={() => void deleteEvent(event.localId)}
                              disabled={isSaving}
                            >
                              {isSaving ? "Mažu..." : "Smazat"}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "8px" }}>
                        <select
                          value={event.type}
                          onChange={(e) =>
                            updateEventField(event.localId, "type", e.target.value)
                          }
                          style={inputStyle}
                        >
                          <option value="goal_for" style={{ color: "black" }}>
                            Gól
                          </option>
                          <option value="goal_against" style={{ color: "black" }}>
                            Inkasovaný gól
                          </option>
                          <option value="yellow_card" style={{ color: "black" }}>
                            Žlutá karta
                          </option>
                          <option value="red_card" style={{ color: "black" }}>
                            Červená karta
                          </option>
                        </select>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <input
                            type="number"
                            min={1}
                            value={event.period}
                            onChange={(e) =>
                              updateEventField(event.localId, "period", e.target.value)
                            }
                            placeholder="Poločas"
                            style={inputStyle}
                          />

                          <input
                            type="number"
                            min={0}
                            value={event.minute}
                            onChange={(e) =>
                              updateEventField(event.localId, "minute", e.target.value)
                            }
                            placeholder="Minuta"
                            style={inputStyle}
                          />
                        </div>

                        {event.type === "goal_for" && (
                          <>
                            <select
                              value={event.scorerPlayerId ?? `number:${event.scorer}`}
                              onChange={(e) =>
                                updateEventPlayer(event.localId, "scorer", e.target.value)
                              }
                              style={inputStyle}
                            >
                              {selectablePlayers.map((player) => (
                                <option
                                  key={`scorer-${player.playerId ?? player.playerNumber}`}
                                  value={player.playerId ?? `number:${player.playerNumber}`}
                                  style={{ color: "black" }}
                                >
                                  #{player.currentNumber} — {player.name}
                                </option>
                              ))}
                            </select>

                            <select
                              value={
                                event.assistPlayerId ??
                                (typeof event.assist === "number"
                                  ? `number:${event.assist}`
                                  : "none")
                              }
                              onChange={(e) =>
                                updateEventPlayer(event.localId, "assist", e.target.value)
                              }
                              style={inputStyle}
                            >
                              <option value="none" style={{ color: "black" }}>
                                Bez asistence
                              </option>
                              {selectablePlayers.map((player) => (
                                <option
                                  key={`assist-${player.playerId ?? player.playerNumber}`}
                                  value={player.playerId ?? `number:${player.playerNumber}`}
                                  style={{ color: "black" }}
                                >
                                  #{player.currentNumber} — {player.name}
                                </option>
                              ))}
                            </select>
                          </>
                        )}

                        {(event.type === "yellow_card" || event.type === "red_card") && (
                          <select
                            value={event.playerId ?? `number:${event.playerNumber}`}
                            onChange={(e) =>
                              updateEventPlayer(event.localId, "card", e.target.value)
                            }
                            style={inputStyle}
                          >
                            {selectablePlayers.map((player) => (
                              <option
                                key={`card-${player.playerId ?? player.playerNumber}`}
                                value={player.playerId ?? `number:${player.playerNumber}`}
                                style={{ color: "black" }}
                              >
                                #{player.currentNumber} — {player.name}
                              </option>
                            ))}
                          </select>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <button
                            type="button"
                            style={{
                              ...primaryButtonStyle,
                              opacity: isSaving ? 0.7 : 1,
                            }}
                            onClick={() => void handleSaveSingleEvent(event.localId)}
                            disabled={isSaving}
                          >
                            {isSaving ? "Ukládám..." : "Uložit"}
                          </button>

                          <button
                            type="button"
                            style={softButtonStyle}
                            onClick={() => handleCancelSingleEvent(event.localId)}
                            disabled={isSaving}
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div style={{ ...glassCardStyle, padding: "14px" }}>
        {renderCollapsibleHeader(
          "SESTAVA",
          `${lineupPlayers.length} hráčů • ${goalkeeperSegments.length} brankářských úseků`,
          lineupOpen,
          () => setLineupOpen((prev) => !prev)
        )}

        {lineupOpen && (
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              {lineupPlayers.map((stat) => {
                const statPlayerId = getStatPlayerId(stat);
                const statKey = getStatKey(stat);
                const removable = canRemovePlayer(stat);
                const isRemoving = removingPlayerKey === statKey;
                const currentNumber = getPlayerCurrentNumberByIdOrNumber(
                  statPlayerId,
                  stat.playerNumber
                );

                return (
                  <div
                    key={statKey}
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      padding: "12px",
                      borderRadius: "18px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 950 }}>
                          {getPlayerNameByIdOrNumber(statPlayerId, stat.playerNumber)}
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            color: "#b8b8b8",
                            marginTop: "4px",
                            lineHeight: 1.5,
                            fontWeight: 600,
                          }}
                        >
                          #{currentNumber ?? stat.playerNumber} • {stat.goals}G /{" "}
                          {stat.assists}A • ŽK: {stat.yellowCards ?? 0} • ČK:{" "}
                          {stat.redCards ?? 0}
                        </div>
                      </div>

                      {isAdmin && (
                        <>
                          {removable ? (
                            <button
                              type="button"
                              onClick={() => void handleRemovePlayer(stat)}
                              disabled={isRemoving}
                              style={{
                                border: "none",
                                borderRadius: "12px",
                                padding: "10px 12px",
                                background: "rgba(198,40,40,0.95)",
                                color: "white",
                                fontWeight: 900,
                                cursor: isRemoving ? "default" : "pointer",
                                opacity: isRemoving ? 0.7 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isRemoving ? "..." : "Odebrat"}
                            </button>
                          ) : (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#8f8f8f",
                                fontWeight: 900,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Zásah
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {lineupPlayers.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.04)",
                    color: "#b8b8b8",
                  }}
                >
                  V zápase zatím nejsou zapsaní žádní hráči.
                </div>
              )}
            </div>

            <div
              style={{
                height: "1px",
                background: "rgba(255,255,255,0.08)",
                margin: "4px 0",
              }}
            />

            <div style={{ display: "grid", gap: "10px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 950 }}>Brankáři</div>
                  <div style={{ fontSize: "12px", color: "#b8b8b8", marginTop: "3px" }}>
                    Nastavení úseků podle minut
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    style={smallButtonStyle}
                    onClick={() => setGoalkeepersEditMode((prev) => !prev)}
                  >
                    {goalkeepersEditMode ? "Zavřít" : "Upravit"}
                  </button>
                )}
              </div>

              {goalkeepersEditMode && isAdmin && (
                <div style={{ display: "grid", gap: "8px" }}>
                  <button type="button" style={smallButtonStyle} onClick={addGoalkeeperSegment}>
                    + Přidat brankářský úsek
                  </button>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <button
                      type="button"
                      style={{
                        ...primaryButtonStyle,
                        opacity: savingGoalkeepers ? 0.7 : 1,
                      }}
                      onClick={() => void handleSaveGoalkeepers()}
                      disabled={savingGoalkeepers}
                    >
                      {savingGoalkeepers ? "Ukládám..." : "Uložit brankáře"}
                    </button>

                    <button
                      type="button"
                      style={softButtonStyle}
                      onClick={handleCancelGoalkeepers}
                      disabled={savingGoalkeepers}
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              )}

              {goalkeeperSegments.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.04)",
                    color: "#b8b8b8",
                  }}
                >
                  Zatím nejsou nastavené brankářské úseky.
                </div>
              )}

              {goalkeeperSegments.map((segment) => {
                const player = getPlayerByIdOrNumber(segment.playerId, segment.playerNumber);

                return (
                  <div
                    key={segment.localId}
                    style={{
                      padding: "12px",
                      borderRadius: "16px",
                      background: "rgba(255,216,107,0.10)",
                      border: "1px solid rgba(255,216,107,0.28)",
                    }}
                  >
                    {!goalkeepersEditMode ? (
                      <div>
                        <div style={{ fontWeight: 950, color: "#ffd86b" }}>
                          {player?.name ?? `#${segment.playerNumber}`}
                        </div>
                        <div style={{ fontSize: "12px", color: "#b8b8b8", marginTop: "4px" }}>
                          {segment.startMinute}.–{segment.endMinute}. minuta • inkasované góly:{" "}
                          {segment.goalsAgainst}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "8px" }}>
                        <select
                          value={segment.playerId ?? `number:${segment.playerNumber}`}
                          onChange={(e) =>
                            updateGoalkeeperSegment(segment.localId, "playerId", e.target.value)
                          }
                          style={inputStyle}
                        >
                          {selectablePlayers.map((item) => (
                            <option
                              key={`gk-${item.playerId ?? item.playerNumber}`}
                              value={item.playerId ?? `number:${item.playerNumber}`}
                              style={{ color: "black" }}
                            >
                              #{item.currentNumber} — {item.name}
                            </option>
                          ))}
                        </select>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <input
                            type="number"
                            min={0}
                            value={segment.startMinute}
                            onChange={(e) =>
                              updateGoalkeeperSegment(
                                segment.localId,
                                "startMinute",
                                e.target.value
                              )
                            }
                            placeholder="Od minuty"
                            style={inputStyle}
                          />

                          <input
                            type="number"
                            min={0}
                            value={segment.endMinute}
                            onChange={(e) =>
                              updateGoalkeeperSegment(
                                segment.localId,
                                "endMinute",
                                e.target.value
                              )
                            }
                            placeholder="Do minuty"
                            style={inputStyle}
                          />
                        </div>

                        <input
                          type="number"
                          min={0}
                          value={segment.goalsAgainst}
                          onChange={(e) =>
                            updateGoalkeeperSegment(
                              segment.localId,
                              "goalsAgainst",
                              e.target.value
                            )
                          }
                          placeholder="Obdržené góly"
                          style={inputStyle}
                        />

                        <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                          Obdržené góly u brankáře vyplň ručně. Tyto góly se započítají do skóre zápasu.
                        </div>

                        <button
                          type="button"
                          style={dangerButtonStyle}
                          onClick={() => deleteGoalkeeperSegment(segment.localId)}
                        >
                          Smazat úsek
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...glassCardStyle, padding: "14px" }}>
        {renderCollapsibleHeader(
          "Hodnocení hráčů",
          isVotingOpen ? "hlasování otevřené" : "hlasování uzavřené",
          ratingsOpen,
          () => setRatingsOpen((prev) => !prev)
        )}

        {ratingsOpen && (
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            <div
              style={{
                padding: "12px",
                borderRadius: "16px",
                background: isVotingOpen
                  ? "rgba(61, 214, 140, 0.10)"
                  : "rgba(255,120,120,0.08)",
                border: isVotingOpen
                  ? "1px solid rgba(61, 214, 140, 0.24)"
                  : "1px solid rgba(255,120,120,0.22)",
                color: isVotingOpen ? "#bff5d8" : "#ffbdbd",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: "4px" }}>
                {isVotingOpen ? "Hodnocení je otevřené" : "Hodnocení je uzavřené"}
              </div>

              {votingStatus?.text && <div>{votingStatus.text}</div>}

              {localMatch.finished_at && (
                <div style={{ marginTop: "4px", opacity: 0.9 }}>
                  Ukončení zápasu: {formatDateTime(localMatch.finished_at)}
                </div>
              )}

              {votingDeadline && (
                <div style={{ marginTop: "4px", opacity: 0.9 }}>
                  Konec hlasování: {formatDateTime(votingDeadline.toISOString())}
                </div>
              )}
            </div>

            {sortedRatingPlayerNumbers.map((playerNumber, index) => {
              const stat = getStatByNumber(playerNumber);
              const statPlayerId = getStatPlayerId(stat);
              const statKey = stat ? getStatKey(stat) : `number:${playerNumber}`;
              const summary = summaryMap.get(playerNumber);
              const badgeStyles = getRatingBadgeStyles(summary?.color ?? "neutral");
              const selectedValue = selectedRatings[statKey];
              const player = getPlayerByIdOrNumber(statPlayerId, playerNumber);
              const isSelf = player?.profile_id === currentUserId;

              return (
                <div
                  key={statKey}
                  style={{
                    padding: "12px",
                    borderRadius: "18px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: isVotingOpen ? "10px" : 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {!isVotingOpen && (
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "12px",
                            background:
                              index === 0
                                ? "rgba(52, 152, 219, 0.22)"
                                : "rgba(255,255,255,0.08)",
                            color: index === 0 ? "#9fd3ff" : "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 950,
                          }}
                        >
                          {index + 1}
                        </div>
                      )}

                      <div>
                        <div style={{ fontWeight: 950 }}>
                          {getPlayerNameByIdOrNumber(statPlayerId, playerNumber)}
                        </div>
                        {isVotingOpen && (
                          <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                            Hlasů: {summary?.votes ?? 0}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div
                        style={{
                          minWidth: "56px",
                          padding: "8px 10px",
                          borderRadius: "12px",
                          fontWeight: 950,
                          textAlign: "center",
                          ...badgeStyles,
                        }}
                      >
                        {summary && summary.averageRating !== null
                          ? summary.averageRating.toFixed(1)
                          : "--"}
                      </div>

                      {summary?.isBest && (
                        <div
                          style={{
                            minWidth: "52px",
                            padding: "8px 10px",
                            borderRadius: "12px",
                            fontWeight: 950,
                            textAlign: "center",
                            ...getRatingBadgeStyles("blue"),
                          }}
                        >
                          HZ
                        </div>
                      )}
                    </div>
                  </div>

                  {isVotingOpen && stat && (
                    <>
                      {isSelf ? (
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: "12px",
                            background: "rgba(255,255,255,0.06)",
                            color: "#9f9f9f",
                            fontSize: "12px",
                            fontWeight: 900,
                            textAlign: "center",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          Nelze hodnotit sám sebe
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {ratingOptions.map((ratingValue) => {
                            const isSelected = selectedValue === ratingValue;
                            const isSaving = savingPlayerKey === statKey;

                            return (
                              <button
                                key={`${statKey}-${ratingValue}`}
                                type="button"
                                onClick={() => void handleSaveRating(stat, ratingValue)}
                                disabled={isSaving || !isVotingOpen}
                                style={{
                                  minWidth: "48px",
                                  height: "36px",
                                  padding: "0 8px",
                                  borderRadius: "12px",
                                  border: isSelected
                                    ? "1px solid rgba(255,255,255,0.32)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                  background: isSelected
                                    ? "rgba(255,255,255,0.18)"
                                    : "rgba(255,255,255,0.08)",
                                  color: "white",
                                  fontWeight: 900,
                                  fontSize: "13px",
                                  cursor: isSaving ? "default" : "pointer",
                                  opacity: isSaving ? 0.7 : 1,
                                }}
                              >
                                {formatRatingValue(ratingValue)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
