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

export default function PlayedMatchDetailScreen({
  clubId,
  match,
  onBack,
}: PlayedMatchDetailScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<PlayerRatingRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedRatings, setSelectedRatings] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [savingPlayerNumber, setSavingPlayerNumber] = useState<number | null>(null);

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
        const nextValues: Record<number, string> = {};

        mine.forEach((rating) => {
          nextValues[rating.player_number] = String(rating.rating);
        });

        setSelectedRatings(nextValues);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId, match.id]);

  const getPlayerName = (number: number) => {
    return players.find((player) => player.number === number)?.name ?? `#${number}`;
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

  const handleSaveRating = async (playerNumber: number) => {
    if (!currentUserId) {
      setMessage("Chybí přihlášený uživatel.");
      return;
    }

    const rawValue = selectedRatings[playerNumber];

    if (!rawValue) {
      setMessage("Zadej známku hráče.");
      return;
    }

    const parsedValue = Number(rawValue);

    if (Number.isNaN(parsedValue) || parsedValue < 1 || parsedValue > 10) {
      setMessage("Známka musí být mezi 1.0 a 10.0.");
      return;
    }

    setSavingPlayerNumber(playerNumber);
    setMessage("");

    const result = await upsertMatchPlayerRating({
      finishedMatchId: match.id,
      playerNumber,
      ratedByUserId: currentUserId,
      rating: Math.round(parsedValue * 10) / 10,
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

          <div style={{ display: "grid", gap: "10px" }}>
            {matchPlayerNumbers.map((playerNumber) => {
              const summary = summaryMap.get(playerNumber);
              const badgeStyles = getRatingBadgeStyles(summary?.color ?? "neutral");

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

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="number"
                      min="1"
                      max="10"
                      step="0.1"
                      value={selectedRatings[playerNumber] ?? ""}
                      onChange={(e) =>
                        setSelectedRatings((prev) => ({
                          ...prev,
                          [playerNumber]: e.target.value,
                        }))
                      }
                      placeholder="1.0 - 10.0"
                      style={{
                        ...styles.input,
                        margin: 0,
                      }}
                    />

                    <button
                      style={{
                        ...styles.primaryButton,
                        marginTop: 0,
                        width: "auto",
                        padding: "12px 14px",
                        opacity: savingPlayerNumber === playerNumber ? 0.7 : 1,
                      }}
                      onClick={() => void handleSaveRating(playerNumber)}
                      disabled={savingPlayerNumber === playerNumber}
                    >
                      {savingPlayerNumber === playerNumber ? "..." : "Uložit"}
                    </button>
                  </div>
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