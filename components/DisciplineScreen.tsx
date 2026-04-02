"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  getTrainingsByClubId,
  getTrainingPresence,
  type TrainingRow,
  type TrainingPresenceRow,
} from "@/lib/trainings";
import { styles } from "@/styles/appStyles";

type Tab = "attendance" | "fines";

type Props = {
  clubId: string;
  primaryColor?: string;
};

export default function DisciplineScreen({ clubId, primaryColor = "#888" }: Props) {
  const [tab, setTab] = useState<Tab>("attendance");
  const [players, setPlayers] = useState<Player[]>([]);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [presenceMap, setPresenceMap] = useState<
    Record<string, TrainingPresenceRow[]>
  >({});

  useEffect(() => {
    const load = async () => {
      const [playersData, trainingsData] = await Promise.all([
        getPlayersByClubId(clubId),
        getTrainingsByClubId(clubId),
      ]);

      setPlayers(playersData);
      setTrainings(trainingsData);

      const map: Record<string, TrainingPresenceRow[]> = {};

      for (const t of trainingsData) {
        const rows = await getTrainingPresence(t.id);
        map[t.id] = rows;
      }

      setPresenceMap(map);
    };

    void load();
  }, [clubId]);

  // jen STARŠÍ tréninky = počítají se do statistik
  const finishedTrainings = useMemo(() => {
    const now = new Date();

    return trainings.filter((t) => {
      const date = new Date(t.date);
      return date < now;
    });
  }, [trainings]);

  const attendanceStats = useMemo(() => {
    return players.map((player) => {
      let attended = 0;
      let total = finishedTrainings.length;

      finishedTrainings.forEach((t) => {
        const rows = presenceMap[t.id] || [];

        const isPresent = rows.some(
          (r) => r.player_id === player.id && r.present
        );

        if (isPresent) attended++;
      });

      const percentage = total === 0 ? 0 : Math.round((attended / total) * 100);

      return {
        player,
        attended,
        total,
        percentage,
      };
    });
  }, [players, finishedTrainings, presenceMap]);

  const sortedStats = useMemo(() => {
    return [...attendanceStats].sort((a, b) => b.percentage - a.percentage);
  }, [attendanceStats]);

  const tabButton = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: "none",
    borderRadius: "10px",
    padding: "10px",
    background: active ? primaryColor : "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={styles.card}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={tabButton(tab === "attendance")} onClick={() => setTab("attendance")}>
            DOCHÁZKA
          </button>

          <button style={tabButton(tab === "fines")} onClick={() => setTab("fines")}>
            POKUTY
          </button>
        </div>
      </div>

      {tab === "attendance" && (
        <div style={styles.card}>
          <h2 style={styles.screenTitle}>Docházka na tréninky</h2>

          {finishedTrainings.length === 0 ? (
            <div style={{ color: "#b8b8b8" }}>
              Zatím nejsou žádné ukončené tréninky.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {sortedStats.map((row) => (
                <div
                  key={row.player.id}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>
                    {row.player.name}
                  </div>

                  <div style={{ fontSize: "13px", color: "#b8b8b8", marginTop: "4px" }}>
                    {row.attended} / {row.total} tréninků
                  </div>

                  <div
                    style={{
                      marginTop: "6px",
                      fontWeight: "bold",
                      color:
                        row.percentage >= 70
                          ? "#2ecc71"
                          : row.percentage >= 40
                          ? "#f1c40f"
                          : "#e74c3c",
                    }}
                  >
                    {row.percentage} %
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "fines" && (
        <div style={styles.card}>
          <h2 style={styles.screenTitle}>Pokuty</h2>

          <div style={{ color: "#b8b8b8" }}>
            Zatím není implementováno.
          </div>
        </div>
      )}
    </div>
  );
}

