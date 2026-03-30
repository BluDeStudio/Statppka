"use client";

import { useEffect, useState } from "react";
import { getTrainingsByClubId } from "@/lib/trainings";
import { styles } from "@/styles/appStyles";

type Training = {
  id: string;
  date: string;
  time?: string;
  location?: string;
  note?: string;
};

export default function TrainingsScreen({
  clubId,
  primaryColor,
}: {
  clubId: string;
  primaryColor?: string;
}) {
  const [trainings, setTrainings] = useState<Training[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await getTrainingsByClubId(clubId);
      setTrainings(data);
    };

    void load();
  }, [clubId]);

  return (
    <div style={styles.card}>
      <h2 style={styles.screenTitle}>Tréninky</h2>

      {trainings.length === 0 ? (
        <div style={{ color: "#b8b8b8" }}>
          Zatím žádné tréninky.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {trainings.map((t) => (
            <div
              key={t.id}
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ fontWeight: "bold" }}>
                {t.date} {t.time && `- ${t.time}`}
              </div>

              {t.location && (
                <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                  {t.location}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

