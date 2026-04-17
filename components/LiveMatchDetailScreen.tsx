"use client";

import type { Player } from "@/lib/players";
import type { LiveMatchPlayerDetailRow } from "@/lib/liveMatchDetails";
import { styles } from "@/styles/appStyles";

type Props = {
  primaryColor?: string;
  players: Player[];
  detailRows: LiveMatchPlayerDetailRow[];
  totalElapsedSeconds: number;
  isAdmin: boolean;
  canTogglePlaying: boolean;
  canAddShots: boolean;
  savingPlayerId: string | null;
  onBack: () => void;
  onTogglePlaying: (
    playerId: string,
    nextIsPlaying: boolean
  ) => void | Promise<void>;
  onAddShot: (
    playerId: string,
    shotType: "on_target" | "off_target"
  ) => void | Promise<void>;
};

function formatSecondsToCompact(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function normalizePosition(value?: string | null) {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isGoalkeeperPosition(value?: string | null) {
  const normalized = normalizePosition(value);
  return normalized === "GK" || normalized === "G" || normalized === "BRANKAR";
}

export default function LiveMatchDetailScreen({
  primaryColor = "#22c55e",
  players,
  detailRows,
  totalElapsedSeconds,
  isAdmin,
  canTogglePlaying,
  canAddShots,
  savingPlayerId,
  onBack,
  onTogglePlaying,
  onAddShot,
}: Props) {
  const detailMap = new Map<string, LiveMatchPlayerDetailRow>();
  detailRows.forEach((row) => detailMap.set(row.player_id, row));

  const sortedPlayers = [...players].sort((a, b) => a.number - b.number);

  const currentlyPlayingPlayers = sortedPlayers.filter((player) => {
    const detail = detailMap.get(player.id);
    return detail?.is_playing === true;
  });

  const currentlyPlayingGoalkeepers = currentlyPlayingPlayers.filter((player) =>
    isGoalkeeperPosition(player.position)
  );

  const currentlyPlayingFieldPlayers = currentlyPlayingPlayers.filter(
    (player) => !isGoalkeeperPosition(player.position)
  );

  const handleTogglePlayer = async (player: Player, isPlaying: boolean) => {
    if (!isAdmin || !canTogglePlaying) {
      return;
    }

    if (!isPlaying) {
      const isGoalkeeper = isGoalkeeperPosition(player.position);

      if (isGoalkeeper) {
        const anotherGoalkeeperPlaying = currentlyPlayingGoalkeepers.some(
          (goalkeeper) => goalkeeper.id !== player.id
        );

        if (anotherGoalkeeperPlaying) {
          window.alert("Na hřišti může být jen 1 brankář.");
          return;
        }
      } else {
        const anotherFieldPlayersPlayingCount = currentlyPlayingFieldPlayers.filter(
          (fieldPlayer) => fieldPlayer.id !== player.id
        ).length;

        if (anotherFieldPlayersPlayingCount >= 4) {
          window.alert("Na hřišti mohou být maximálně 4 hráči v poli.");
          return;
        }
      }
    }

    await onTogglePlaying(player.id, !isPlaying);
  };

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{
              border: "none",
              borderRadius: "10px",
              padding: "8px 12px",
              background: "rgba(255,255,255,0.12)",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ← LIVE
          </button>

          <div
            style={{
              color: "#d9d9d9",
              fontSize: "12px",
              fontWeight: "bold",
              textAlign: "right",
              lineHeight: 1.4,
            }}
          >
            <div>Čas: {formatSecondsToCompact(totalElapsedSeconds)}</div>
            <div>
              GK {currentlyPlayingGoalkeepers.length}/1 • Pole{" "}
              {currentlyPlayingFieldPlayers.length}/4
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "6px" }}>
        {sortedPlayers.map((player) => {
          const detail = detailMap.get(player.id);
          const isPlaying = detail?.is_playing ?? false;

          const playedSecondsBase = detail?.played_seconds ?? 0;
          const lastStartedMatchSecond =
            detail?.last_started_match_second ?? null;

          const liveExtraSeconds =
            isPlaying && lastStartedMatchSecond !== null
              ? Math.max(0, totalElapsedSeconds - lastStartedMatchSecond)
              : 0;

          const totalPlayedSeconds = playedSecondsBase + liveExtraSeconds;
          const shotsOnTarget = detail?.shots_on_target ?? 0;
          const shotsOffTarget = detail?.shots_off_target ?? 0;
          const isSaving = savingPlayerId === player.id;
          const isGoalkeeper = isGoalkeeperPosition(player.position);

          return (
            <div
              key={player.id}
              style={{
                ...styles.card,
                padding: "8px 10px",
                background: isPlaying
                  ? "rgba(46, 204, 113, 0.08)"
                  : "rgba(255,255,255,0.03)",
                border: isPlaying
                  ? "1px solid rgba(46, 204, 113, 0.22)"
                  : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px minmax(0,1fr) auto",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: primaryColor,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  {player.number}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "14px",
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {player.name}
                  </div>

                  <div
                    style={{
                      fontSize: "11px",
                      color: isPlaying ? "#9af0b6" : "#b8b8b8",
                      marginTop: "3px",
                      lineHeight: 1.35,
                    }}
                  >
                    {isGoalkeeper ? "GK" : player.position} •{" "}
                    {isPlaying ? "HRAJE" : "STŘÍDAČKA"} •{" "}
                    {formatSecondsToCompact(totalPlayedSeconds)} • 🎯 {shotsOnTarget} • 🚫{" "}
                    {shotsOffTarget}
                  </div>
                </div>

                {isAdmin && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void handleTogglePlayer(player, isPlaying)}
                      disabled={!canTogglePlaying || isSaving}
                      title={isPlaying ? "Poslat na střídačku" : "Poslat do hry"}
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "8px",
                        border: "none",
                        background: isPlaying
                          ? "rgba(198,40,40,0.95)"
                          : primaryColor,
                        color: "white",
                        fontSize: "14px",
                        fontWeight: "bold",
                        cursor:
                          !canTogglePlaying || isSaving ? "default" : "pointer",
                        opacity: !canTogglePlaying || isSaving ? 0.7 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      {isSaving ? "…" : isPlaying ? "⏸" : "▶"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void onAddShot(player.id, "on_target")}
                      disabled={!canAddShots || isSaving}
                      title="Střela na bránu"
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "8px",
                        border: "none",
                        background: "#16a34a",
                        color: "white",
                        fontSize: "14px",
                        fontWeight: "bold",
                        cursor: !canAddShots || isSaving ? "default" : "pointer",
                        opacity: !canAddShots || isSaving ? 0.7 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      🎯
                    </button>

                    <button
                      type="button"
                      onClick={() => void onAddShot(player.id, "off_target")}
                      disabled={!canAddShots || isSaving}
                      title="Střela mimo"
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "8px",
                        border: "none",
                        background: "#f59e0b",
                        color: "white",
                        fontSize: "14px",
                        fontWeight: "bold",
                        cursor: !canAddShots || isSaving ? "default" : "pointer",
                        opacity: !canAddShots || isSaving ? 0.7 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      🚫
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}