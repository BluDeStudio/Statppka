"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closeAndCreatePeriod,
  createPeriod,
  getActivePeriod,
  getPeriodsByClubId,
  type Period,
  type PeriodType,
} from "@/lib/periods";
import {
  buildFineSummaryByPlayer,
  getFinesByPeriodId,
  setAllPlayerFinesPaid,
  type FineSummaryRow,
} from "@/lib/fines";
import {
  getPlayersByClubId,
  getClubMemberPlayersByClubId,
  type Player,
  type ClubMemberPlayer,
} from "@/lib/players";
import { styles } from "@/styles/appStyles";

type Props = {
  clubId: string;
  primaryColor?: string;
};

type PeriodPlayer = Player | ClubMemberPlayer;

type UnpaidPlayerSummary = FineSummaryRow & {
  playerName: string;
};

function formatPeriodType(type: PeriodType) {
  return type === "year" ? "Rok" : "Sezóna";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${Number(day)}. ${Number(month)}. ${year}`;
}

function getYearFromDate(value: string) {
  const [year] = value.split("-");
  return Number(year);
}

function buildDefaultPeriodName(
  type: PeriodType,
  startDate: string,
  endDate: string
) {
  if (!startDate || !endDate) return "";

  const startYear = getYearFromDate(startDate);
  const endYear = getYearFromDate(endDate);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return "";

  return type === "year"
    ? `Rok ${startYear}`
    : `Sezóna ${startYear}/${endYear}`;
}

function addYearsToIsoDate(value: string, years: number) {
  const [yearValue, monthValue, dayValue] = value.split("-").map(Number);

  if (!yearValue || !monthValue || !dayValue) return "";

  const targetYear = yearValue + years;
  const lastDayOfTargetMonth = new Date(targetYear, monthValue, 0).getDate();
  const safeDay = Math.min(dayValue, lastDayOfTargetMonth);

  return [
    String(targetYear).padStart(4, "0"),
    String(monthValue).padStart(2, "0"),
    String(safeDay).padStart(2, "0"),
  ].join("-");
}

function getSuggestedNextPeriod(period: Period) {
  const startDate = addYearsToIsoDate(period.start_date, 1);
  const endDate = addYearsToIsoDate(period.end_date, 1);

  return {
    type: period.type,
    startDate,
    endDate,
    name: buildDefaultPeriodName(period.type, startDate, endDate),
  };
}

export default function PeriodsScreen({
  clubId,
  primaryColor = "#888888",
}: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payingPlayerId, setPayingPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [players, setPlayers] = useState<PeriodPlayer[]>([]);
  const [unpaidPlayers, setUnpaidPlayers] = useState<UnpaidPlayerSummary[]>([]);

  const [showCloseForm, setShowCloseForm] = useState(false);
  const [nextPeriodName, setNextPeriodName] = useState("");
  const [nextPeriodType, setNextPeriodType] = useState<PeriodType>("season");
  const [nextPeriodStartDate, setNextPeriodStartDate] = useState("");
  const [nextPeriodEndDate, setNextPeriodEndDate] = useState("");

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<PeriodType>("year");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const loadData = async () => {
    setLoading(true);

    const [
      loadedPeriods,
      loadedActivePeriod,
      loadedPlayers,
      loadedClubMemberPlayers,
    ] = await Promise.all([
      getPeriodsByClubId(clubId),
      getActivePeriod(clubId),
      getPlayersByClubId(clubId),
      getClubMemberPlayersByClubId(clubId),
    ]);

    const resolvedPlayers: PeriodPlayer[] =
      loadedPlayers.length > 0 ? loadedPlayers : loadedClubMemberPlayers;

    setPeriods(loadedPeriods);
    setActivePeriod(loadedActivePeriod);
    setPlayers(resolvedPlayers);

    if (loadedActivePeriod) {
      const activeFines = await getFinesByPeriodId(loadedActivePeriod.id);
      const playerNameById = new Map(
        resolvedPlayers.map((player) => [player.id, player.name])
      );

      const unpaidSummary = buildFineSummaryByPlayer(activeFines)
        .filter((item) => item.unpaid_amount > 0)
        .map((item) => ({
          ...item,
          playerName: playerNameById.get(item.player_id) ?? "Neznámý hráč",
        }))
        .sort((a, b) => {
          if (b.unpaid_amount !== a.unpaid_amount) {
            return b.unpaid_amount - a.unpaid_amount;
          }
          return a.playerName.localeCompare(b.playerName, "cs");
        });

      setUnpaidPlayers(unpaidSummary);
    } else {
      setUnpaidPlayers([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [clubId]);

  const sortedPeriods = useMemo(() => {
    return [...periods].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return b.start_date.localeCompare(a.start_date);
    });
  }, [periods]);

  const unpaidTotal = useMemo(
    () =>
      unpaidPlayers.reduce(
        (sum, item) => sum + Number(item.unpaid_amount),
        0
      ),
    [unpaidPlayers]
  );

  const openCloseForm = () => {
    if (!activePeriod) return;

    const suggested = getSuggestedNextPeriod(activePeriod);

    setNextPeriodType(suggested.type);
    setNextPeriodStartDate(suggested.startDate);
    setNextPeriodEndDate(suggested.endDate);
    setNextPeriodName(suggested.name);
    setMessage("");
    setShowCloseForm(true);
  };

  const handleNextPeriodTypeChange = (type: PeriodType) => {
    setNextPeriodType(type);
    setNextPeriodName(
      buildDefaultPeriodName(type, nextPeriodStartDate, nextPeriodEndDate)
    );
  };

  const handleNextStartDateChange = (value: string) => {
    setNextPeriodStartDate(value);
    setNextPeriodName(
      buildDefaultPeriodName(nextPeriodType, value, nextPeriodEndDate)
    );
  };

  const handleNextEndDateChange = (value: string) => {
    setNextPeriodEndDate(value);
    setNextPeriodName(
      buildDefaultPeriodName(nextPeriodType, nextPeriodStartDate, value)
    );
  };

  const handlePayAllPlayerFines = async (item: UnpaidPlayerSummary) => {
    if (!activePeriod) return;

    const confirmed = window.confirm(
      `Opravdu označit všechny nezaplacené pokuty hráče ${item.playerName} v období "${activePeriod.name}" jako zaplacené?\n\nCelkem: ${Number(item.unpaid_amount).toFixed(0)} Kč`
    );

    if (!confirmed) return;

    setPayingPlayerId(item.player_id);
    setMessage("");

    const success = await setAllPlayerFinesPaid({
      periodId: activePeriod.id,
      playerId: item.player_id,
    });

    if (!success) {
      setMessage("Nepodařilo se označit všechny pokuty hráče jako zaplacené.");
      setPayingPlayerId(null);
      return;
    }

    await loadData();
    setMessage(`Pokuty hráče ${item.playerName} byly označeny jako zaplacené.`);
    setPayingPlayerId(null);
  };

  const handleCloseAndCreate = async () => {
    if (!activePeriod) {
      setMessage("Není nastavené žádné aktivní období.");
      return;
    }

    if (!nextPeriodStartDate || !nextPeriodEndDate) {
      setMessage("Vyplň datum začátku a konce nového období.");
      return;
    }

    if (nextPeriodEndDate < nextPeriodStartDate) {
      setMessage("Konec nového období musí být později než jeho začátek.");
      return;
    }

    const resolvedName =
      nextPeriodName.trim() ||
      buildDefaultPeriodName(
        nextPeriodType,
        nextPeriodStartDate,
        nextPeriodEndDate
      );

    if (!resolvedName) {
      setMessage("Zadej název nového období.");
      return;
    }

    if (unpaidPlayers.length > 0) {
      setMessage(
        "Období zatím nelze ukončit. Nejprve označ všechny nezaplacené pokuty jako zaplacené."
      );
      return;
    }

    const confirmed = window.confirm(
      [
        `Opravdu chceš ukončit období "${activePeriod.name}"?`,
        "",
        `Nové aktivní období bude: "${resolvedName}".`,
        "",
        "Historická data se nesmažou. Nové statistiky, docházka a pokuty se budou zobrazovat v novém aktivním období.",
      ].join("\n")
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const created = await closeAndCreatePeriod({
      clubId,
      closingPeriodId: activePeriod.id,
      name: resolvedName,
      type: nextPeriodType,
      startDate: nextPeriodStartDate,
      endDate: nextPeriodEndDate,
    });

    if (!created) {
      setMessage(
        "Nepodařilo se ukončit období a vytvořit nové. Původní období zůstalo aktivní."
      );
      setSaving(false);
      return;
    }

    await loadData();
    setShowCloseForm(false);
    setMessage(
      `Období "${activePeriod.name}" bylo ukončeno. Aktivní je nyní "${created.name}".`
    );
    setSaving(false);
  };

  const resetCustomForm = () => {
    setCustomName("");
    setCustomType("year");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  const handleCreateCustomPeriod = async () => {
    if (!customStartDate || !customEndDate) {
      setMessage("Vyplň datum začátku a konce období.");
      return;
    }

    if (customEndDate < customStartDate) {
      setMessage("Konec období musí být později než jeho začátek.");
      return;
    }

    const resolvedName =
      customName.trim() ||
      buildDefaultPeriodName(customType, customStartDate, customEndDate);

    if (!resolvedName) {
      setMessage("Zadej název období.");
      return;
    }

    setSaving(true);
    setMessage("");

    const created = await createPeriod({
      clubId,
      name: resolvedName,
      type: customType,
      startDate: customStartDate,
      endDate: customEndDate,
      makeActive: activePeriod === null,
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit vlastní období.");
      setSaving(false);
      return;
    }

    await loadData();
    resetCustomForm();
    setShowCustomForm(false);

    setMessage(
      activePeriod
        ? `Období "${created.name}" bylo přidáno do historie a filtrů. Aktivní období se nezměnilo.`
        : `Období "${created.name}" bylo vytvořeno a nastaveno jako aktivní.`
    );

    setSaving(false);
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: active
      ? `1px solid ${primaryColor}`
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "11px 12px",
    background: active ? primaryColor : "rgba(255,255,255,0.07)",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
    opacity: saving ? 0.7 : 1,
  });

  const secondaryButtonStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "12px",
    padding: "11px 12px",
    background: "rgba(255,255,255,0.07)",
    color: "#ffffff",
    fontWeight: "bold",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={styles.card}>
        <h2 style={styles.screenTitle}>Aktivní období</h2>

        <div
          style={{
            color: "#cfcfcf",
            fontSize: "13px",
            lineHeight: 1.5,
            marginBottom: "14px",
          }}
        >
          Běžné statistiky, docházka a pokuty se mají zobrazovat podle aktivního
          období. Historická data zůstávají uložená v seznamu období.
        </div>

        {loading ? (
          <div style={{ color: "#b8b8b8" }}>Načítám aktivní období...</div>
        ) : activePeriod ? (
          <div
            style={{
              padding: "16px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.045)",
              border: `1px solid ${primaryColor}55`,
              boxShadow: `0 12px 28px ${primaryColor}12`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: "19px",
                    fontWeight: 900,
                  }}
                >
                  {activePeriod.name}
                </div>

                <div
                  style={{
                    color: "#b8b8b8",
                    fontSize: "13px",
                    lineHeight: 1.5,
                    marginTop: "7px",
                  }}
                >
                  {formatPeriodType(activePeriod.type)} •{" "}
                  {formatDate(activePeriod.start_date)} až{" "}
                  {formatDate(activePeriod.end_date)}
                </div>
              </div>

              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(46,204,113,0.16)",
                  color: "#9af0b6",
                  fontWeight: "bold",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
              >
                AKTIVNÍ
              </div>
            </div>

            {!showCloseForm && (
              <button
                type="button"
                onClick={openCloseForm}
                disabled={saving}
                style={{
                  ...styles.primaryButton,
                  width: "100%",
                  marginTop: "16px",
                  background: "rgba(198,40,40,0.95)",
                  border: "none",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                UKONČIT OBDOBÍ
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: "14px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "#b8b8b8",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            Zatím není nastavené žádné aktivní období. Vytvoř první období níže.
          </div>
        )}
      </div>

      {showCloseForm && activePeriod && (
        <div
          style={{
            ...styles.card,
            border: `1px solid ${primaryColor}55`,
          }}
        >
          <h2 style={styles.screenTitle}>Navazující období</h2>

          <div
            style={{
              color: "#cfcfcf",
              fontSize: "13px",
              lineHeight: 1.5,
              marginBottom: "14px",
            }}
          >
            Po potvrzení se období „{activePeriod.name}“ uzavře a nové období se
            automaticky nastaví jako aktivní.
          </div>

          {unpaidPlayers.length > 0 ? (
            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "13px",
                borderRadius: "14px",
                background: "rgba(198,40,40,0.12)",
                border: "1px solid rgba(255,120,120,0.20)",
                marginBottom: "14px",
              }}
            >
              <div style={{ fontWeight: 900, color: "#ffb0a8" }}>
                Nezaplacené pokuty: {unpaidPlayers.length} hráčů
              </div>

              <div style={{ color: "#cfcfcf", fontSize: "13px" }}>
                Celkový dluh: {unpaidTotal.toFixed(0)} Kč. Období půjde ukončit
                až po označení všech pokut jako zaplacených.
              </div>

              {unpaidPlayers.map((item) => (
                <div
                  key={item.player_id}
                  style={{
                    display: "grid",
                    gap: "8px",
                    padding: "11px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
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
                      <div style={{ fontWeight: 900 }}>{item.playerName}</div>
                      <div
                        style={{
                          color: "#b8b8b8",
                          fontSize: "12px",
                          marginTop: "4px",
                        }}
                      >
                        Nezaplacených pokut:{" "}
                        {item.fines_count}
                      </div>
                    </div>

                    <div
                      style={{
                        color: "#ffb0a8",
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {Number(item.unpaid_amount).toFixed(0)} Kč
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handlePayAllPlayerFines(item)}
                    disabled={payingPlayerId === item.player_id}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: "11px",
                      padding: "10px 12px",
                      background: primaryColor,
                      color: "#071107",
                      fontWeight: 950,
                      cursor:
                        payingPlayerId === item.player_id
                          ? "default"
                          : "pointer",
                      opacity:
                        payingPlayerId === item.player_id ? 0.7 : 1,
                    }}
                  >
                    {payingPlayerId === item.player_id
                      ? "Označuji..."
                      : "ZAPLATIT VŠE"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(46,204,113,0.12)",
                border: "1px solid rgba(46,204,113,0.20)",
                color: "#9af0b6",
                fontWeight: 900,
                marginBottom: "14px",
              }}
            >
              Všechny pokuty v tomto období jsou zaplacené.
            </div>
          )}

          <div style={{ display: "grid", gap: "10px" }}>
            <input
              type="text"
              value={nextPeriodName}
              onChange={(event) => setNextPeriodName(event.target.value)}
              placeholder="Název nového období"
              style={styles.input}
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                disabled={saving}
                style={toggleStyle(nextPeriodType === "year")}
                onClick={() => handleNextPeriodTypeChange("year")}
              >
                ROK
              </button>

              <button
                type="button"
                disabled={saving}
                style={toggleStyle(nextPeriodType === "season")}
                onClick={() => handleNextPeriodTypeChange("season")}
              >
                SEZÓNA
              </button>
            </div>

            <input
              type="date"
              value={nextPeriodStartDate}
              onChange={(event) =>
                handleNextStartDateChange(event.target.value)
              }
              style={styles.input}
            />

            <input
              type="date"
              value={nextPeriodEndDate}
              onChange={(event) => handleNextEndDateChange(event.target.value)}
              style={styles.input}
            />

            <button
              type="button"
              onClick={() => void handleCloseAndCreate()}
              disabled={saving || unpaidPlayers.length > 0}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: primaryColor,
                border: "none",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? "Ukládám..."
                : "UKONČIT A VYTVOŘIT NOVÉ OBDOBÍ"}
            </button>

            <button
              type="button"
              disabled={saving}
              style={secondaryButtonStyle}
              onClick={() => {
                setShowCloseForm(false);
                setMessage("");
              }}
            >
              Zrušit
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
            lineHeight: 1.5,
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
          <div style={{ color: "#b8b8b8" }}>
            Zatím nejsou vytvořená žádná období.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {sortedPeriods.map((period) => {
              const isActive = period.is_active;
              const isClosed = period.is_closed;

              return (
                <div
                  key={period.id}
                  style={{
                    padding: "13px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.04)",
                    border: isActive
                      ? `1px solid ${primaryColor}55`
                      : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, color: "#ffffff" }}>
                        {period.name}
                      </div>

                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "13px",
                          color: "#b8b8b8",
                          lineHeight: 1.45,
                        }}
                      >
                        {formatPeriodType(period.type)} •{" "}
                        {formatDate(period.start_date)} až{" "}
                        {formatDate(period.end_date)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: isActive
                          ? "rgba(46,204,113,0.16)"
                          : isClosed
                            ? "rgba(255,120,120,0.12)"
                            : "rgba(255,255,255,0.10)",
                        color: isActive
                          ? "#9af0b6"
                          : isClosed
                            ? "#ffb0a8"
                            : "#cfcfcf",
                        fontWeight: "bold",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isActive
                        ? "AKTIVNÍ"
                        : isClosed
                          ? "UZAVŘENÉ"
                          : "VLASTNÍ"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            setShowCustomForm((previous) => !previous);
            setMessage("");
          }}
        >
          {showCustomForm ? "Skrýt vlastní období" : "+ Přidat vlastní období"}
        </button>

        {showCustomForm && (
          <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
            <div
              style={{
                color: "#cfcfcf",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Vlastní období slouží například pro vyhodnocení kalendářního roku
              nebo turnaje. Pokud už existuje aktivní období, jeho vytvoření ho
              nezmění.
            </div>

            <input
              type="text"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="Název období"
              style={styles.input}
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                disabled={saving}
                style={toggleStyle(customType === "year")}
                onClick={() => setCustomType("year")}
              >
                ROK
              </button>

              <button
                type="button"
                disabled={saving}
                style={toggleStyle(customType === "season")}
                onClick={() => setCustomType("season")}
              >
                SEZÓNA
              </button>
            </div>

            <input
              type="date"
              value={customStartDate}
              onChange={(event) => setCustomStartDate(event.target.value)}
              style={styles.input}
            />

            <input
              type="date"
              value={customEndDate}
              onChange={(event) => setCustomEndDate(event.target.value)}
              style={styles.input}
            />

            <button
              type="button"
              onClick={() => void handleCreateCustomPeriod()}
              disabled={saving}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: primaryColor,
                border: "none",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Ukládám..." : "VYTVOŘIT VLASTNÍ OBDOBÍ"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
