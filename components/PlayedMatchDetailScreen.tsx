"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  buildMatchRatingSummary,
  getMatchPlayerRatings,
  getRatingBadgeStyles,
  upsertMatchPlayerRating,
  type PlayerRatingRow,
} from "@/lib/ratings";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch } from "@/app/page";

type PlayedMatchDetailScreenProps = {
  clubId: string;
  match: FinishedMatch;
  onBack: () => void;
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

export default function PlayedMatchDetailScreen({
  clubId,
  match,
  onBack,
}: PlayedMatchDetailScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<PlayerRatingRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedRatings, setSelectedRatings] = useState<Record<number, number>>({});
  const [message, setMessage] = useState("");
  const [savingPlayerNumber, setSavingPlayerNumber] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

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
        getMatchPlayerRatings(match.id),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      setPlayers(loadedPlayers);
      setRatings(loadedRatings);
      setCurrentUserId(user?.id ?? null);

      if (user?.id) {
        const mine = loadedRatings.filter((rating) => rating.rated_by_user_id === user.id);
        const nextValues: Record<number, number> = {};

        mine.forEach((rating) => {
          nextValues[rating.player_number] = rating.rating;
        });

        setSelectedRatings(nextValues);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId, match.id]);

  useEffect(() => {
    setNowMs(Date.now());

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const getPlayerName = (number: number) => {
    return players.find((player) => player.number === number)?.name ?? `#${number}`;
  };

  const getPlayerByNumber = (number: number) => {
    return players.find((player) => player.number === number) ?? null;
  };

  const matchPlayerNumbers = useMemo(() => {
    const base = match.playerStats.map((player) => player.playerNumber);

    if (match.goalkeeperNumber !== null && !base.includes(match.goalkeeperNumber)) {
      base.push(match.goalkeeperNumber);
    }

    return base.sort((a, b) => a - b);
  }, [match.goalkeeperNumber, match.playerStats]);

  const ratingSummary = useMemo(() => {
    return buildMatchRatingSummary(matchPlayerNumbers, ratings);
  }, [matchPlayerNumbers, ratings]);

  const summaryMap = useMemo(() => {
    return new Map(ratingSummary.map((item) => [item.playerNumber, item]));
  }, [ratingSummary]);

  const playersWithStats = useMemo(() => {
    return match.playerStats.filter((player) => player.goals > 0 || player.assists > 0);
  }, [match.playerStats]);

  const votingStatus = useMemo(() => {
    return getRemainingVotingTime(match.finished_at, nowMs);
  }, [match.finished_at, nowMs]);

  const votingDeadline = useMemo(() => {
    return getVotingDeadline(match.finished_at);
  }, [match.finished_at]);

  const isVotingOpen = votingStatus?.isOpen ?? false;

  const handleSaveRating = async (playerNumber: number, ratingValue: number) => {
    if (!currentUserId) {
      setMessage("Chybí přihlášený uživatel.");
      return;
    }

    if (!isVotingOpen) {
      setMessage("Hodnocení už je uzavřené.");
      return;
    }

    const player = getPlayerByNumber(playerNumber);
    const isSelf = player?.profile_id === currentUserId;

    if (isSelf) {
      setMessage("Nemůžeš hodnotit sám sebe.");
      return;
    }

    if (ratingValue < 1 || ratingValue > 10) {
      setMessage("Známka musí být mezi 1.0 a 10.0.");
      return;
    }

    setSavingPlayerNumber(playerNumber);
    setMessage("");
    setSelectedRatings((prev) => ({
      ...prev,
      [playerNumber]: ratingValue,
    }));

    const result = await upsertMatchPlayerRating({
      finishedMatchId: match.id,
      playerNumber,
      ratedByUserId: currentUserId,
      rating: ratingValue,
    });

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit hodnocení.");
      setSavingPlayerNumber(null);
      return;
    }

    const loadedRatings = await getMatchPlayerRatings(match.id);
    setRatings(loadedRatings);
    setMessage("Hodnocení bylo uloženo.");
    setSavingPlayerNumber(null);
  };

  return (
    <div>
      <div
        style={{
          ...styles.card,
          marginBottom: "14px",
          padding: "12px 14px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <button
            onClick={onBack}
            style={{
              border: "none",
              borderRadius: "10px",
              padding: "10px 12px",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            ← Zpět
          </button>

          <div
            style={{
              fontWeight: "bold",
              fontSize: "16px",
              letterSpacing: "0.3px",
            }}
          >
            DETAIL ZÁPASU
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>
            {match.matchTitle}
          </div>
          <div style={{ fontSize: "13px", color: "#b8b8b8", marginTop: "4px" }}>
            {match.date} — {match.team}-tým
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
          <div
            style={{
              fontSize: "46px",
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "2px",
            }}
          >
            {match.score}
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Průběh zápasu
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            {match.events.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#b8b8b8",
                }}
              >
                Bez zapsaných událostí.
              </div>
            ) : (
              match.events.map((event, index) => (
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
                    <div style={{ fontWeight: "bold" }}>
                      {getPlayerName(event.scorer)}
                      {event.assist !== null
                        ? ` (asistence ${getPlayerName(event.assist)})`
                        : ""}
                    </div>
                  ) : (
                    <div style={{ fontWeight: "bold" }}>Inkasovaný gól</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Statistiky hráčů v zápase
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            {playersWithStats.map((stat) => (
              <div
                key={stat.playerNumber}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div>{getPlayerName(stat.playerNumber)}</div>
                <div>
                  {stat.goals}G / {stat.assists}A
                </div>
              </div>
            ))}

            {playersWithStats.length === 0 && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#b8b8b8",
                }}
              >
                Nikdo nezapsal gól ani asistenci.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Hodnocení hráčů
          </div>

          <div
            style={{
              marginBottom: "12px",
              padding: "12px",
              borderRadius: "12px",
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
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
              {isVotingOpen ? "Hodnocení je otevřené" : "Hodnocení je uzavřené"}
            </div>

            {votingStatus?.text && <div>{votingStatus.text}</div>}

            {match.finished_at && (
              <div style={{ marginTop: "4px", opacity: 0.9 }}>
                Ukončení zápasu: {formatDateTime(match.finished_at)}
              </div>
            )}

            {votingDeadline && (
              <div style={{ marginTop: "4px", opacity: 0.9 }}>
                Konec hlasování: {formatDateTime(votingDeadline.toISOString())}
              </div>
            )}

            {!match.finished_at && (
              <div>
                U tohoto zápasu zatím není uložený čas ukončení, proto je hlasování uzavřené.
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            {matchPlayerNumbers.map((playerNumber) => {
              const summary = summaryMap.get(playerNumber);
              const badgeStyles = getRatingBadgeStyles(summary?.color ?? "neutral");
              const selectedValue = selectedRatings[playerNumber];
              const player = getPlayerByNumber(playerNumber);
              const isSelf = player?.profile_id === currentUserId;

              return (
                <div
                  key={playerNumber}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "10px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "bold" }}>
                        {getPlayerName(playerNumber)}
                      </div>
                      <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                        Hlasů: {summary?.votes ?? 0}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div
                        style={{
                          minWidth: "56px",
                          padding: "8px 10px",
                          borderRadius: "10px",
                          fontWeight: "bold",
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
                            borderRadius: "10px",
                            fontWeight: "bold",
                            textAlign: "center",
                            ...getRatingBadgeStyles("blue"),
                          }}
                        >
                          HZ
                        </div>
                      )}
                    </div>
                  </div>

                  {!isVotingOpen ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "rgba(255,255,255,0.06)",
                        color: "#9f9f9f",
                        fontSize: "12px",
                        fontWeight: "bold",
                        textAlign: "center",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      Hlasování pro tento zápas už skončilo
                    </div>
                  ) : isSelf ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "rgba(255,255,255,0.06)",
                        color: "#9f9f9f",
                        fontSize: "12px",
                        fontWeight: "bold",
                        textAlign: "center",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      Nelze hodnotit sám sebe
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                      }}
                    >
                      {ratingOptions.map((ratingValue) => {
                        const isSelected = selectedValue === ratingValue;
                        const isSaving = savingPlayerNumber === playerNumber;

                        return (
                          <button
                            key={`${playerNumber}-${ratingValue}`}
                            type="button"
                            onClick={() => void handleSaveRating(playerNumber, ratingValue)}
                            disabled={isSaving || !isVotingOpen}
                            style={{
                              minWidth: "48px",
                              height: "36px",
                              padding: "0 8px",
                              borderRadius: "10px",
                              border: isSelected
                                ? "1px solid rgba(255,255,255,0.32)"
                                : "1px solid rgba(255,255,255,0.08)",
                              background: isSelected
                                ? "rgba(255,255,255,0.18)"
                                : "rgba(255,255,255,0.08)",
                              color: "white",
                              fontWeight: "bold",
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
                </div>
              );
            })}
          </div>

          {message && (
            <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}