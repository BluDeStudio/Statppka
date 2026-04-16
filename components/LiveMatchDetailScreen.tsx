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

function formatSecondsToMinutes(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
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

  const currentlyPlayingGoalkeepers = currentlyPlayingPlayers.filter(
    (player) => player.position?.trim().toUpperCase() === "GK"
  );

  const currentlyPlayingFieldPlayers = currentlyPlayingPlayers.filter(
    (player) => player.position?.trim().toUpperCase() !== "GK"
  );

  const handleTogglePlayer = async (player: Player, isPlaying: boolean) => {
    if (!isAdmin || !canTogglePlaying) {
      return;
    }

    if (!isPlaying) {
      const isGoalkeeper = player.position?.trim().toUpperCase() === "GK";

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
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={styles.card}>
        <button
          type="button"
          onClick={onBack}
          style={{
            ...styles.primaryButton,
            marginTop: 0,
            background: "rgba(255,255,255,0.12)",
            border: "none",
          }}
        >
          ← Zpět na LIVE
        </button>
      </div>

      <div style={styles.card}>
        <h2 style={{ ...styles.screenTitle, marginTop: 0 }}>Detail sestavy</h2>

        <div
          style={{
            color: "#cfcfcf",
            fontSize: "13px",
            lineHeight: 1.5,
            marginTop: "8px",
          }}
        >
          Tady vybíráš, kdo právě hraje, a zapisuješ střely. Data se ukládají
          průběžně, takže po návratu do LIVE zápasu nic nezmizí.
        </div>

        <div
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#d9d9d9",
            fontSize: "14px",
            fontWeight: "bold",
            display: "grid",
            gap: "6px",
          }}
        >
          <div>Aktuální čas zápasu: {formatSecondsToMinutes(totalElapsedSeconds)}</div>
          <div>
            Na hřišti: {currentlyPlayingGoalkeepers.length}/1 GK •{" "}
            {currentlyPlayingFieldPlayers.length}/4 hráči v poli
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
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
          const isGoalkeeper = player.position?.trim().toUpperCase() === "GK";

          return (
            <div
              key={player.id}
              style={{
                ...styles.card,
                padding: "12px",
                display: "grid",
                gap: "10px",
                background: isPlaying
                  ? "rgba(46, 204, 113, 0.08)"
                  : undefined,
                border: isPlaying
                  ? "1px solid rgba(46, 204, 113, 0.22)"
                  : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
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
                    {player.number}
                  </div>

                  <div>
                    <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                      {player.name}
                    </div>
                    <div
                      style={{
                        color: "#b8b8b8",
                        fontSize: "12px",
                        marginTop: "4px",
                      }}
                    >
                      {player.position}
                      {isGoalkeeper ? " • Brankář" : ""}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: isPlaying
                      ? "rgba(46, 204, 113, 0.18)"
                      : "rgba(255,255,255,0.08)",
                    color: isPlaying ? "#9af0b6" : "#b8b8b8",
                    fontSize: "12px",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isPlaying ? "HRAJE" : "NEHRAJE"}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "6px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div style={{ fontSize: "13px", color: "#d9d9d9" }}>
                  Herní čas:{" "}
                  <strong>{formatSecondsToMinutes(totalPlayedSeconds)}</strong>
                </div>
                <div style={{ fontSize: "13px", color: "#d9d9d9" }}>
                  Střely na bránu: <strong>{shotsOnTarget}</strong>
                </div>
                <div style={{ fontSize: "13px", color: "#d9d9d9" }}>
                  Střely mimo: <strong>{shotsOffTarget}</strong>
                </div>
              </div>

              {isAdmin && (
                <div style={{ display: "grid", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => void handleTogglePlayer(player, isPlaying)}
                    disabled={!canTogglePlaying || isSaving}
                    style={{
                      ...styles.primaryButton,
                      marginTop: 0,
                      background: isPlaying
                        ? "rgba(198,40,40,0.95)"
                        : primaryColor,
                      border: "none",
                      opacity: !canTogglePlaying || isSaving ? 0.7 : 1,
                    }}
                  >
                    {isSaving
                      ? "Ukládám..."
                      : isPlaying
                      ? "Označit jako NEHRAJE"
                      : "Označit jako HRAJE"}
                  </button>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => void onAddShot(player.id, "on_target")}
                      disabled={!canAddShots || isSaving}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        background: "#16a34a",
                        color: "white",
                        fontWeight: "bold",
                        cursor: !canAddShots || isSaving ? "default" : "pointer",
                        opacity: !canAddShots || isSaving ? 0.7 : 1,
                      }}
                    >
                      STŘELA NA BRÁNU
                    </button>

                    <button
                      type="button"
                      onClick={() => void onAddShot(player.id, "off_target")}
                      disabled={!canAddShots || isSaving}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        background: "#f59e0b",
                        color: "white",
                        fontWeight: "bold",
                        cursor: !canAddShots || isSaving ? "default" : "pointer",
                        opacity: !canAddShots || isSaving ? 0.7 : 1,
                      }}
                    >
                      STŘELA MIMO
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}