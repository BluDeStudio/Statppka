"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  getTrainingsByClubId,
  getTrainingPresence,
  type TrainingRow,
  type TrainingPresenceRow,
} from "@/lib/trainings";
import {
  closePeriod,
  createPeriod,
  getActivePeriod,
  type Period,
} from "@/lib/periods";
import { styles } from "@/styles/appStyles";

type Tab = "attendance" | "fines";
type AttendanceSort = "highest" | "lowest";
type PeriodType = "year" | "season";

type Props = {
  clubId: string;
  primaryColor?: string;
};

function isOlderTraining(training: TrainingRow) {
  const now = new Date();

  const endTime =
    training.end_time?.slice(0, 5) ||
    training.start_time?.slice(0, 5) ||
    "23:59";

  const trainingDate = new Date(`${training.date}T${endTime}:00`);
  return trainingDate.getTime() < now.getTime();
}

function formatPeriodType(type: PeriodType) {
  return type === "year" ? "Rok" : "Sezóna";
}

export default function DisciplineScreen({
  clubId,
  primaryColor = "#888",
}: Props) {
  const [tab, setTab] = useState<Tab>("attendance");
  const [attendanceSort, setAttendanceSort] =
    useState<AttendanceSort>("highest");

  const [players, setPlayers] = useState<Player[]>([]);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [presenceMap, setPresenceMap] = useState<
    Record<string, TrainingPresenceRow[]>
  >({});
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);

  const [loading, setLoading] = useState(true);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [periodName, setPeriodName] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("year");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setMessage("");

      const [playersData, trainingsData, periodData] = await Promise.all([
        getPlayersByClubId(clubId),
        getTrainingsByClubId(clubId),
        getActivePeriod(clubId),
      ]);

      if (!active) return;

      setPlayers(playersData);
      setTrainings(trainingsData);
      setActivePeriod(periodData);

      const map: Record<string, TrainingPresenceRow[]> = {};

      for (const training of trainingsData) {
        const rows = await getTrainingPresence(training.id);
        map[training.id] = rows;
      }

      if (!active) return;

      setPresenceMap(map);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [clubId]);

  const olderTrainings = useMemo(() => {
    return trainings.filter((training) => isOlderTraining(training));
  }, [trainings]);

  const attendanceStats = useMemo(() => {
    return players.map((player) => {
      let attended = 0;
      const total = olderTrainings.length;

      olderTrainings.forEach((training) => {
        const rows = presenceMap[training.id] || [];

        const isPresent = rows.some(
          (row) => row.player_id === player.id && row.present
        );

        if (isPresent) attended += 1;
      });

      const percentage =
        total === 0 ? 0 : Math.round((attended / total) * 100);

      return {
        player,
        attended,
        total,
        percentage,
      };
    });
  }, [players, olderTrainings, presenceMap]);

  const sortedStats = useMemo(() => {
    const sorted = [...attendanceStats].sort((a, b) => {
      if (attendanceSort === "highest") {
        if (b.percentage !== a.percentage) return b.percentage - a.percentage;
        if (b.attended !== a.attended) return b.attended - a.attended;
        return a.player.name.localeCompare(b.player.name, "cs");
      }

      if (a.percentage !== b.percentage) return a.percentage - b.percentage;
      if (a.attended !== b.attended) return a.attended - b.attended;
      return a.player.name.localeCompare(b.player.name, "cs");
    });

    return sorted;
  }, [attendanceSort, attendanceStats]);

  const resetPeriodForm = () => {
    setPeriodName("");
    setPeriodType("year");
    setPeriodStartDate("");
    setPeriodEndDate("");
  };

  const handleCreatePeriod = async () => {
    if (!periodName.trim()) {
      setMessage("Zadej název období.");
      return;
    }

    if (!periodStartDate) {
      setMessage("Vyber datum začátku období.");
      return;
    }

    if (!periodEndDate) {
      setMessage("Vyber datum konce období.");
      return;
    }

    if (periodEndDate < periodStartDate) {
      setMessage("Datum konce musí být později než datum začátku.");
      return;
    }

    setPeriodSaving(true);
    setMessage("");

    const created = await createPeriod({
      clubId,
      name: periodName.trim(),
      type: periodType,
      startDate: periodStartDate,
      endDate: periodEndDate,
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit období.");
      setPeriodSaving(false);
      return;
    }

    setActivePeriod(created);
    resetPeriodForm();
    setMessage("Období bylo vytvořeno.");
    setPeriodSaving(false);
  };

  const handleClosePeriod = async () => {
    if (!activePeriod) return;

    const confirmed = window.confirm(
      `Opravdu chceš uzavřít období "${activePeriod.name}"?`
    );

    if (!confirmed) return;

    setPeriodSaving(true);
    setMessage("");

    const success = await closePeriod(activePeriod.id);

    if (!success) {
      setMessage("Nepodařilo se uzavřít období.");
      setPeriodSaving(false);
      return;
    }

    setActivePeriod(null);
    setMessage("Období bylo uzavřeno. Teď můžeš založit nové.");
    setPeriodSaving(false);
  };

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

  const sortButton = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    background: active ? primaryColor : "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {!activePeriod ? (
        <div style={styles.card}>
          <h2 style={styles.screenTitle}>Vytvořit období</h2>

          <div
            style={{
              color: "#cfcfcf",
              fontSize: "13px",
              lineHeight: 1.5,
              marginBottom: "12px",
            }}
          >
            Nejdřív je potřeba založit aktivní období. Může to být rok nebo sezóna.
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <input
              type="text"
              placeholder="Název období (např. 2026 nebo 2025/2026)"
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              style={styles.input}
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                style={tabButton(periodType === "year")}
                onClick={() => setPeriodType("year")}
              >
                ROK
              </button>

              <button
                type="button"
                style={tabButton(periodType === "season")}
                onClick={() => setPeriodType("season")}
              >
                SEZÓNA
              </button>
            </div>

            <input
              type="date"
              value={periodStartDate}
              onChange={(e) => setPeriodStartDate(e.target.value)}
              style={styles.input}
            />

            <input
              type="date"
              value={periodEndDate}
              onChange={(e) => setPeriodEndDate(e.target.value)}
              style={styles.input}
            />

            <button
              type="button"
              onClick={handleCreatePeriod}
              disabled={periodSaving}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: primaryColor,
                border: "none",
                opacity: periodSaving ? 0.7 : 1,
              }}
            >
              {periodSaving ? "Vytvářím..." : "Vytvořit období"}
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={{ display: "grid", gap: "10px" }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "15px",
                  marginBottom: "6px",
                }}
              >
                Aktivní období: {activePeriod.name}
              </div>

              <div
                style={{
                  color: "#cfcfcf",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {formatPeriodType(activePeriod.type)} • {activePeriod.start_date} až{" "}
                {activePeriod.end_date}
              </div>
            </div>

            <button
              type="button"
              onClick={handleClosePeriod}
              disabled={periodSaving}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: "rgba(198,40,40,0.95)",
                border: "none",
                opacity: periodSaving ? 0.7 : 1,
              }}
            >
              {periodSaving ? "Uzavírám..." : "Uzavřít období"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          style={{
            ...styles.card,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            style={tabButton(tab === "attendance")}
            onClick={() => setTab("attendance")}
          >
            DOCHÁZKA
          </button>

          <button
            style={tabButton(tab === "fines")}
            onClick={() => setTab("fines")}
          >
            POKUTY
          </button>
        </div>
      </div>

      {tab === "attendance" && (
        <div style={styles.card}>
          <h2 style={styles.screenTitle}>Docházka na tréninky</h2>

          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <button
              style={sortButton(attendanceSort === "highest")}
              onClick={() => setAttendanceSort("highest")}
            >
              NEJVYŠŠÍ ÚČAST
            </button>

            <button
              style={sortButton(attendanceSort === "lowest")}
              onClick={() => setAttendanceSort("lowest")}
            >
              NEJNIŽŠÍ ÚČAST
            </button>
          </div>

          <div
            style={{
              marginBottom: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#cfcfcf",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            Do docházky se počítají všechny starší tréninky. Jakmile u staršího
            tréninku potvrdíš účast, zapíše se hráčům do docházky.
          </div>

          {loading ? (
            <div style={{ color: "#b8b8b8" }}>Načítám docházku...</div>
          ) : olderTrainings.length === 0 ? (
            <div style={{ color: "#b8b8b8" }}>
              Zatím nejsou žádné starší tréninky.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {sortedStats.map((row, index) => (
                <div
                  key={row.player.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        minWidth: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: primaryColor,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>
                      <div style={{ fontWeight: "bold" }}>{row.player.name}</div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#b8b8b8",
                          marginTop: "4px",
                        }}
                      >
                        {row.attended} / {row.total} tréninků
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      minWidth: "62px",
                      textAlign: "right",
                      fontWeight: "bold",
                      fontSize: "18px",
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

          {!activePeriod ? (
            <div style={{ color: "#b8b8b8" }}>
              Nejprve vytvoř aktivní období, aby šly přidávat pokuty.
            </div>
          ) : (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#cfcfcf",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Aktivní období je připravené. V dalším kroku sem napojíme formulář
              pro přidání pokut, součty po hráčích a stav zaplaceno / nezaplaceno.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

