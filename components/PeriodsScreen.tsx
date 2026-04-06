"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closePeriod,
  createPeriod,
  getActivePeriod,
  getPeriodsByClubId,
  setActivePeriod,
  type Period,
} from "@/lib/periods";
import { styles } from "@/styles/appStyles";

type PeriodType = "year" | "season";

type Props = {
  clubId: string;
  primaryColor?: string;
};

function formatPeriodType(type: PeriodType) {
  return type === "year" ? "Rok" : "Sezóna";
}

function buildDefaultSeasonName(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "";
  const startYear = new Date(startDate).getFullYear();
  const endYear = new Date(endDate).getFullYear();

  if (Number.isNaN(startYear) || Number.isNaN(endYear)) return "";
  return `${startYear}/${endYear}`;
}

function buildDefaultYearName(startDate: string) {
  if (!startDate) return "";
  const startYear = new Date(startDate).getFullYear();
  if (Number.isNaN(startYear)) return "";
  return String(startYear);
}

export default function PeriodsScreen({
  clubId,
  primaryColor = "#888888",
}: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [activePeriod, setActivePeriodState] = useState<Period | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [periodName, setPeriodName] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("year");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");

  const loadData = async () => {
    setLoading(true);

    const [loadedPeriods, loadedActivePeriod] = await Promise.all([
      getPeriodsByClubId(clubId),
      getActivePeriod(clubId),
    ]);

    setPeriods(loadedPeriods);
    setActivePeriodState(loadedActivePeriod);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [clubId]);

  const resetForm = () => {
    setPeriodName("");
    setPeriodType("year");
    setPeriodStartDate("");
    setPeriodEndDate("");
  };

  const sortedPeriods = useMemo(() => {
    return [...periods].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return b.start_date.localeCompare(a.start_date);
    });
  }, [periods]);

  const handleCreatePeriod = async () => {
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

    const resolvedName =
      periodName.trim() ||
      (periodType === "year"
        ? buildDefaultYearName(periodStartDate)
        : buildDefaultSeasonName(periodStartDate, periodEndDate));

    if (!resolvedName) {
      setMessage("Zadej název období.");
      return;
    }

    setSaving(true);
    setMessage("");

    const created = await createPeriod({
      clubId,
      name: resolvedName,
      type: periodType,
      startDate: periodStartDate,
      endDate: periodEndDate,
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit období.");
      setSaving(false);
      return;
    }

    await loadData();
    resetForm();
    setMessage(`Období "${resolvedName}" bylo vytvořeno a nastaveno jako aktivní.`);
    setSaving(false);
  };

  const handleActivatePeriod = async (period: Period) => {
    setSaving(true);
    setMessage("");

    const success = await setActivePeriod(period.id, clubId);

    if (!success) {
      setMessage("Nepodařilo se nastavit aktivní období.");
      setSaving(false);
      return;
    }

    await loadData();
    setMessage(`Aktivní období bylo nastaveno na "${period.name}".`);
    setSaving(false);
  };

  const handleClosePeriod = async (period: Period) => {
    const confirmed = window.confirm(
      `Opravdu chceš uzavřít období "${period.name}"?`
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const success = await closePeriod(period.id);

    if (!success) {
      setMessage("Nepodařilo se uzavřít období.");
      setSaving(false);
      return;
    }

    await loadData();
    setMessage(`Období "${period.name}" bylo uzavřeno.`);
    setSaving(false);
  };

  const buttonStyle = (active: boolean): React.CSSProperties => ({
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
      <div style={styles.card}>
        <h2 style={styles.screenTitle}>Období</h2>

        <div
          style={{
            color: "#cfcfcf",
            fontSize: "13px",
            lineHeight: 1.5,
            marginBottom: "12px",
          }}
        >
          Tady nastavuješ hlavní období klubu. Aktivní období pak slouží jako
          výchozí pro statistiky, disciplínu a pokuty.
        </div>

        {activePeriod ? (
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
        ) : (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#b8b8b8",
              fontSize: "13px",
            }}
          >
            Zatím není nastavené žádné aktivní období.
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.screenTitle}>Vytvořit nové období</h2>

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
              style={buttonStyle(periodType === "year")}
              onClick={() => setPeriodType("year")}
            >
              ROK
            </button>

            <button
              type="button"
              style={buttonStyle(periodType === "season")}
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
            onClick={() => void handleCreatePeriod()}
            disabled={saving}
            style={{
              ...styles.primaryButton,
              marginTop: 0,
              background: primaryColor,
              border: "none",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Ukládám..." : "Vytvořit období"}
          </button>
        </div>
      </div>

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
        <h2 style={styles.screenTitle}>Seznam období</h2>

        {loading ? (
          <div style={{ color: "#b8b8b8" }}>Načítám období...</div>
        ) : sortedPeriods.length === 0 ? (
          <div style={{ color: "#b8b8b8" }}>Zatím nejsou vytvořená žádná období.</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {sortedPeriods.map((period) => {
              const isActive = period.is_active;
              const isClosed = period.is_closed;

              return (
                <div
                  key={period.id}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: isActive
                      ? "1px solid rgba(61, 214, 140, 0.30)"
                      : "1px solid rgba(255,255,255,0.05)",
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
                      <div style={{ fontWeight: "bold" }}>{period.name}</div>
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "13px",
                          color: "#b8b8b8",
                        }}
                      >
                        {formatPeriodType(period.type)} • {period.start_date} až{" "}
                        {period.end_date}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: isActive
                          ? "rgba(46, 204, 113, 0.16)"
                          : isClosed
                          ? "rgba(255,120,120,0.12)"
                          : "rgba(255,255,255,0.10)",
                        color: isActive
                          ? "#9af0b6"
                          : isClosed
                          ? "#ffb0a8"
                          : "#b8b8b8",
                        fontWeight: "bold",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isActive ? "AKTIVNÍ" : isClosed ? "UZAVŘENÉ" : "NEAKTIVNÍ"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => void handleActivatePeriod(period)}
                        disabled={saving}
                        style={{
                          flex: 1,
                          border: "none",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          background: primaryColor,
                          color: "white",
                          fontWeight: "bold",
                          cursor: "pointer",
                          opacity: saving ? 0.7 : 1,
                        }}
                      >
                        Nastavit jako aktivní
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleClosePeriod(period)}
                      disabled={saving || isClosed}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        background: "rgba(198,40,40,0.95)",
                        color: "white",
                        fontWeight: "bold",
                        cursor: isClosed ? "default" : "pointer",
                        opacity: saving || isClosed ? 0.7 : 1,
                      }}
                    >
                      {isClosed ? "Uzavřeno" : "Uzavřít období"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}