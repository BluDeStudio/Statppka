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

type FinishedMatchEventWithIds = FinishedMatchEvent & {
  scorerPlayerId?: string | null;
  assistPlayerId?: string | null;
  playerId?: string | null;
  cardPlayerId?: string | null;
  scorer_player_id?: string | null;
  assist_player_id?: string | null;
  card_player_id?: string | null;
};

type RatingRowWithId = PlayerRatingRow & {
  player_id?: string | null;
  playerId?: string | null;
};

const ratingOptions = Array.from({ length: 19 }, (_, index) => 1 + index * 0.5);
const VOTING_WINDOW_HOURS = 3;

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

function getStatPlayerId(stat?: PlayerStatWithId | null) {
  return stat?.playerId ?? stat?.player_id ?? null;
}

function getRatingPlayerId(rating?: RatingRowWithId | null) {
  return rating?.player_id ?? rating?.playerId ?? null;
}

function getGoalScorerPlayerId(event: FinishedMatchEventWithIds) {
  return event.scorerPlayerId ?? event.scorer_player_id ?? null;
}

function getGoalAssistPlayerId(event: FinishedMatchEventWithIds) {
  return event.assistPlayerId ?? event.assist_player_id ?? null;
}

function getCardPlayerId(event: FinishedMatchEventWithIds) {
  return event.playerId ?? event.cardPlayerId ?? event.card_player_id ?? null;
}

function getStatKey(stat: PlayerStatWithId) {
  const playerId = getStatPlayerId(stat);
  return playerId ? `id:${playerId}` : `number:${stat.playerNumber}`;
}

function rebuildCardEventsFromStats(
  originalEvents: FinishedMatchEvent[],
  playerStats: FinishedMatch["playerStats"]
) {
  const eventsWithoutCards = originalEvents.filter(
    (event) => event.type !== "yellow_card" && event.type !== "red_card"
  );

  const cardEvents: FinishedMatchEvent[] = [];

  playerStats.forEach((rawStat) => {
    const stat = rawStat as PlayerStatWithId;
    const yellowCards = stat.yellowCards ?? 0;
    const redCards = stat.redCards ?? 0;

    for (let index = 0; index < yellowCards; index++) {
      cardEvents.push({
        type: "yellow_card",
        playerNumber: stat.playerNumber,
        ...(getStatPlayerId(stat) ? { playerId: getStatPlayerId(stat) } : {}),
      } as FinishedMatchEvent);
    }

    for (let index = 0; index < redCards; index++) {
      cardEvents.push({
        type: "red_card",
        playerNumber: stat.playerNumber,
        ...(getStatPlayerId(stat) ? { playerId: getStatPlayerId(stat) } : {}),
      } as FinishedMatchEvent);
    }
  });

  return [...eventsWithoutCards, ...cardEvents];
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

  const [editMode, setEditMode] = useState(false);
  const [editScore, setEditScore] = useState(match.score);
  const [editPlayerStats, setEditPlayerStats] = useState<FinishedMatch["playerStats"]>(
    match.playerStats
  );
  const [savingEdit, setSavingEdit] = useState(false);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);

  useEffect(() => {
    setLocalMatch(match);
    setEditScore(match.score);
    setEditPlayerStats(match.playerStats);
    setEditMode(false);
  }, [match]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const [
        loadedPlayers,
        loadedRatings,
        {
          data: { user },
        },
      ] = await Promise.all([
        getPlayersByClubId(clubId),
        getMatchPlayerRatings(localMatch.id),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

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

  const getStatByPlayerIdOrNumber = (
    playerId?: string | null,
    playerNumber?: number | null
  ) => {
    if (playerId) {
      const foundById = (localMatch.playerStats as PlayerStatWithId[]).find(
        (stat) => getStatPlayerId(stat) === playerId
      );
      if (foundById) return foundById;
    }

    if (typeof playerNumber === "number") {
      return getStatByNumber(playerNumber);
    }

    return null;
  };

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

  const playerHasEvent = (stat: PlayerStatWithId) => {
    const playerId = getStatPlayerId(stat);

    return (localMatch.events as FinishedMatchEventWithIds[]).some((event) => {
      if (event.type === "goal_for") {
        const scorerPlayerId = getGoalScorerPlayerId(event);
        const assistPlayerId = getGoalAssistPlayerId(event);

        if (playerId && (scorerPlayerId || assistPlayerId)) {
          return scorerPlayerId === playerId || assistPlayerId === playerId;
        }

        return event.scorer === stat.playerNumber || event.assist === stat.playerNumber;
      }

      if (event.type === "yellow_card" || event.type === "red_card") {
        const cardPlayerId = getCardPlayerId(event);

        if (playerId && cardPlayerId) return cardPlayerId === playerId;
        return event.playerNumber === stat.playerNumber;
      }

      return false;
    });
  };

  const canRemovePlayer = (stat: PlayerStatWithId) => {
    if (!isAdmin) return false;
    if (localMatch.goalkeeperNumber === stat.playerNumber) return false;

    const hasAnyStat =
      stat.goals > 0 ||
      stat.assists > 0 ||
      (stat.yellowCards ?? 0) > 0 ||
      (stat.redCards ?? 0) > 0;

    if (hasAnyStat) return false;
    if (playerHasEvent(stat)) return false;

    return true;
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

  const updateEditStat = (
    statKey: string,
    key: "goals" | "assists" | "yellowCards" | "redCards",
    value: string
  ) => {
    const parsed = parseNumber(value);

    setEditPlayerStats((prev) =>
      (prev as PlayerStatWithId[]).map((stat) =>
        getStatKey(stat) === statKey
          ? {
              ...stat,
              [key]: parsed,
            }
          : stat
      )
    );
  };

  const handleStartEdit = () => {
    if (!isAdmin) {
      setMessage("Editace zápasu je dostupná jen pro admina.");
      return;
    }

    setEditScore(localMatch.score);
    setEditPlayerStats(localMatch.playerStats);
    setLineupOpen(true);
    setEditMode(true);
    setMessage("");
  };

  const handleCancelEdit = () => {
    setEditScore(localMatch.score);
    setEditPlayerStats(localMatch.playerStats);
    setEditMode(false);
    setMessage("");
  };

  const handleSaveEdit = async () => {
    if (!isAdmin) {
      setMessage("Editace zápasu je dostupná jen pro admina.");
      return;
    }

    if (!editScore.trim()) {
      setMessage("Vyplň skóre zápasu.");
      return;
    }

    setSavingEdit(true);
    setMessage("");

    const nextEvents = rebuildCardEventsFromStats(localMatch.events, editPlayerStats);

    const nextMatch: FinishedMatch = {
      ...localMatch,
      score: editScore.trim(),
      playerStats: editPlayerStats,
      events: nextEvents,
    };

    const { error: matchError } = await supabase
      .from("finished_matches")
      .update({
        score: nextMatch.score,
      })
      .eq("id", nextMatch.id);

    if (matchError) {
      console.error("Nepodařilo se uložit editaci odehraného zápasu:", matchError);
      setMessage("Nepodařilo se uložit změny zápasu.");
      setSavingEdit(false);
      return;
    }

    for (const stat of editPlayerStats as PlayerStatWithId[]) {
      const { error: statError } = await supabase
        .from("finished_match_player_stats")
        .update({
          goals: stat.goals,
          assists: stat.assists,
          yellow_cards: stat.yellowCards ?? 0,
          red_cards: stat.redCards ?? 0,
        })
        .eq("finished_match_id", nextMatch.id)
        .eq("player_number", stat.playerNumber);

      if (statError) {
        console.error("Nepodařilo se uložit statistiky hráče:", statError);
      }
    }

    setLocalMatch(nextMatch);
    setEditMode(false);
    setMessage("Změny zápasu byly uloženy.");
    setSavingEdit(false);
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

  const getEventPlayerName = (
    event: FinishedMatchEventWithIds,
    playerNumber?: number | null,
    playerId?: string | null
  ) => {
    const stat = getStatByPlayerIdOrNumber(playerId, playerNumber);

    return getPlayerNameByIdOrNumber(
      playerId ?? getStatPlayerId(stat),
      playerNumber ?? stat?.playerNumber ?? null
    );
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
            {editMode ? (
              <input
                type="text"
                value={editScore}
                onChange={(event) => setEditScore(event.target.value)}
                style={{
                  ...styles.input,
                  textAlign: "center",
                  fontSize: "36px",
                  fontWeight: 950,
                  letterSpacing: "2px",
                  padding: "12px",
                }}
              />
            ) : (
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
            )}
          </div>

          {isAdmin && (
            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {!editMode ? (
                <button type="button" style={primaryButtonStyle} onClick={handleStartEdit}>
                  Upravit zápas
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    style={{ ...primaryButtonStyle, opacity: savingEdit ? 0.7 : 1 }}
                    onClick={() => void handleSaveEdit()}
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Ukládám..." : "Uložit změny"}
                  </button>

                  <button
                    type="button"
                    style={softButtonStyle}
                    onClick={handleCancelEdit}
                    disabled={savingEdit}
                  >
                    Zrušit editaci
                  </button>
                </>
              )}
            </div>
          )}
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
                      background: index === 0 ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.08)",
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
                      #{currentNumber ?? stat.playerNumber} • Body: {stat.goals + stat.assists}
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
          `${localMatch.events.length} událostí`,
          eventsOpen,
          () => setEventsOpen((prev) => !prev)
        )}

        {eventsOpen && (
          <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
            {localMatch.events.length === 0 ? (
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
              (localMatch.events as FinishedMatchEventWithIds[]).map((event, index) => (
                <div
                  key={index}
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
                  {event.type === "goal_for" ? (
                    <div style={{ fontWeight: 900 }}>
                      ⚽ {getEventPlayerName(event, event.scorer, getGoalScorerPlayerId(event))}
                      {event.assist !== null
                        ? ` (asistence ${getEventPlayerName(
                            event,
                            event.assist,
                            getGoalAssistPlayerId(event)
                          )})`
                        : ""}
                    </div>
                  ) : event.type === "goal_against" ? (
                    <div style={{ fontWeight: 900 }}>🥅 Inkasovaný gól</div>
                  ) : event.type === "yellow_card" ? (
                    <div style={{ fontWeight: 900 }}>
                      🟨 Žlutá karta: {getEventPlayerName(event, event.playerNumber, getCardPlayerId(event))}
                    </div>
                  ) : (
                    <div style={{ fontWeight: 900 }}>
                      🟥 Červená karta: {getEventPlayerName(event, event.playerNumber, getCardPlayerId(event))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ ...glassCardStyle, padding: "14px" }}>
        {renderCollapsibleHeader(
          "SESTAVA",
          `${lineupPlayers.length} hráčů v zápase`,
          lineupOpen,
          () => setLineupOpen((prev) => !prev)
        )}

        {lineupOpen && (
          <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
            {lineupPlayers.map((stat) => {
              const statPlayerId = getStatPlayerId(stat);
              const statKey = getStatKey(stat);
              const removable = canRemovePlayer(stat);
              const isRemoving = removingPlayerKey === statKey;
              const isGoalkeeper = localMatch.goalkeeperNumber === stat.playerNumber;
              const currentNumber = getPlayerCurrentNumberByIdOrNumber(
                statPlayerId,
                stat.playerNumber
              );

              const editStat =
                (editPlayerStats as PlayerStatWithId[]).find(
                  (item) => getStatKey(item) === statKey
                ) ?? stat;

              return (
                <div
                  key={statKey}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    padding: "12px",
                    borderRadius: "18px",
                    background: isGoalkeeper
                      ? "rgba(255,216,107,0.10)"
                      : "rgba(255,255,255,0.04)",
                    border: isGoalkeeper
                      ? "1px solid rgba(255,216,107,0.28)"
                      : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {isGoalkeeper && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: "4px",
                        background: "#ffd86b",
                        boxShadow: "0 0 16px rgba(255,216,107,0.45)",
                      }}
                    />
                  )}

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

                      {!editMode ? (
                        <div
                          style={{
                            fontSize: "12px",
                            color: isGoalkeeper ? "#ffd86b" : "#b8b8b8",
                            marginTop: "4px",
                            lineHeight: 1.5,
                            fontWeight: isGoalkeeper ? 900 : 600,
                          }}
                        >
                          #{currentNumber ?? stat.playerNumber} • {stat.goals}G / {stat.assists}A • ŽK: {" "}
                          {stat.yellowCards ?? 0} • ČK: {stat.redCards ?? 0}
                          {isGoalkeeper ? " • BR" : ""}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "8px",
                            marginTop: "10px",
                          }}
                        >
                          <input
                            type="number"
                            min={0}
                            value={editStat.goals}
                            onChange={(event) =>
                              updateEditStat(statKey, "goals", event.target.value)
                            }
                            placeholder="Góly"
                            style={styles.input}
                          />

                          <input
                            type="number"
                            min={0}
                            value={editStat.assists}
                            onChange={(event) =>
                              updateEditStat(statKey, "assists", event.target.value)
                            }
                            placeholder="Asistence"
                            style={styles.input}
                          />

                          <input
                            type="number"
                            min={0}
                            value={editStat.yellowCards ?? 0}
                            onChange={(event) =>
                              updateEditStat(statKey, "yellowCards", event.target.value)
                            }
                            placeholder="ŽK"
                            style={styles.input}
                          />

                          <input
                            type="number"
                            min={0}
                            value={editStat.redCards ?? 0}
                            onChange={(event) =>
                              updateEditStat(statKey, "redCards", event.target.value)
                            }
                            placeholder="ČK"
                            style={styles.input}
                          />
                        </div>
                      )}
                    </div>

                    {!editMode && (
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
                              color: isGoalkeeper ? "#ffd86b" : "#8f8f8f",
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isGoalkeeper ? "BR" : "Zásah"}
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
        )}
      </div>

      <div style={{ ...glassCardStyle, padding: "14px" }}>
        <div style={{ fontWeight: 950, marginBottom: "10px", fontSize: "15px" }}>
          Hodnocení hráčů
        </div>

        <div
          style={{
            marginBottom: "12px",
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

          {!localMatch.finished_at && (
            <div>
              U tohoto zápasu zatím není uložený čas ukončení, proto je hodnocení uzavřené.
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
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
      </div>
    </div>
  );
}
