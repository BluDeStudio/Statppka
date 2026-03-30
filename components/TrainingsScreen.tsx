"use client";

import { useEffect, useMemo, useState } from "react";
import { getTrainingsByClubId } from "@/lib/trainings";
import { styles } from "@/styles/appStyles";

type Training = {
  id: string;
  date: string;
  time?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  note?: string;
  yesCount?: number;
  noCount?: number;
  totalVotes?: number;
};

type TrainingsTab = "planned" | "older";

function formatDisplayDate(date: string) {
  if (date.includes(".")) return date;

  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;

  return `${day}.${month}.${year}`;
}

function getTrainingTimeLabel(training: Training) {
  if (training.start_time && training.end_time) {
    return `${training.start_time} - ${training.end_time}`;
  }

  if (training.time) {
    return training.time;
  }

  if (training.start_time) {
    return training.start_time;
  }

  return "";
}

export default function TrainingsScreen({
  clubId,
  primaryColor = "#888888",
}: {
  clubId: string;
  primaryColor?: string;
}) {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TrainingsTab>("planned");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setMessage("");

      const data = await getTrainingsByClubId(clubId);

      if (!active) return;

      setTrainings((data as Training[]) ?? []);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [clubId]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  const plannedTrainings = useMemo(() => {
    return [...trainings]
      .filter((training) => training.date >= todayKey)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return getTrainingTimeLabel(a).localeCompare(getTrainingTimeLabel(b));
      });
  }, [trainings, todayKey]);

  const olderTrainings = useMemo(() => {
    return [...trainings]
      .filter((training) => training.date < todayKey)
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return getTrainingTimeLabel(b).localeCompare(getTrainingTimeLabel(a));
      });
  }, [trainings, todayKey]);

  const visibleTrainings = tab === "planned" ? plannedTrainings : olderTrainings;

  const baseTabButtonStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  };

  const getTabButtonStyle = (value: TrainingsTab): React.CSSProperties => ({
    ...baseTabButtonStyle,
    background: tab === value ? primaryColor : "rgba(255,255,255,0.08)",
  });

  const handleCreateTraining = () => {
    setMessage("Další krok: napojíme formulář pro vytvoření tréninku.");
  };

  const handleEditTraining = (trainingId: string) => {
    void trainingId;
    setMessage("Další krok: napojíme úpravu tréninku.");
  };

  const handleDeleteTraining = (trainingId: string) => {
    void trainingId;
    setMessage("Další krok: napojíme mazání tréninku.");
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.screenTitle}>Tréninky</h2>

      <div
        style={{
          display: "grid",
          gap: "12px",
          marginBottom: "14px",
        }}
      >
        <button
          type="button"
          onClick={handleCreateTraining}
          style={{
            ...styles.primaryButton,
            marginTop: 0,
            background: primaryColor,
            border: "none",
          }}
        >
          VYTVOŘIT TRÉNINK
        </button>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setTab("planned")}
            style={getTabButtonStyle("planned")}
          >
            PLÁNOVANÉ
          </button>

          <button
            type="button"
            onClick={() => setTab("older")}
            style={getTabButtonStyle("older")}
          >
            STARŠÍ
          </button>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
            color: "#b8b8b8",
          }}
        >
          Načítám tréninky...
        </div>
      ) : visibleTrainings.length === 0 ? (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
            color: "#b8b8b8",
            lineHeight: 1.45,
          }}
        >
          {tab === "planned"
            ? "Zatím žádné plánované tréninky."
            : "Zatím žádné starší tréninky."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {visibleTrainings.map((training) => {
            const timeLabel = getTrainingTimeLabel(training);
            const yesCount = training.yesCount ?? 0;
            const noCount = training.noCount ?? 0;
            const totalVotes =
              training.totalVotes ?? yesCount + noCount;

            return (
              <div
                key={training.id}
                style={{
                  padding: "12px",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: "bold",
                        fontSize: "16px",
                        lineHeight: 1.35,
                      }}
                    >
                      Trénink
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        color: "#d9d9d9",
                        marginTop: "8px",
                        lineHeight: 1.5,
                      }}
                    >
                      {formatDisplayDate(training.date)}
                      {timeLabel ? ` • ${timeLabel}` : ""}
                    </div>

                    {training.location && (
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#b8b8b8",
                          marginTop: "4px",
                        }}
                      >
                        {training.location}
                      </div>
                    )}

                    {training.note && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#b8b8b8",
                          marginTop: "8px",
                          lineHeight: 1.5,
                        }}
                      >
                        {training.note}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      minWidth: "78px",
                      padding: "8px 10px",
                      borderRadius: "10px",
                      background: primaryColor,
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      lineHeight: 1.2,
                      flexShrink: 0,
                    }}
                  >
                    {tab === "planned" ? "PLÁN" : "STARŠÍ"}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "#d9d9d9" }}>Hlasovalo</span>
                    <strong>{totalVotes}</strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "#7dffbc" }}>BUDU</span>
                    <strong style={{ color: "#7dffbc" }}>{yesCount}</strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "#ff8f8f" }}>NEBUDU</span>
                    <strong style={{ color: "#ff8f8f" }}>{noCount}</strong>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleEditTraining(training.id)}
                    style={{
                      flex: 1,
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      background: primaryColor,
                      color: "white",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    UPRAVIT
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteTraining(training.id)}
                    style={{
                      flex: 1,
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      background: "rgba(198,40,40,0.95)",
                      color: "white",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    SMAZAT
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {message && (
        <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
      )}
    </div>
  );
}

