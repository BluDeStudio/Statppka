"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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
import {
  buildFineSummaryByPlayer,
  createFine,
  deleteFine,
  getFinesByPeriodId,
  getPaidFineAmount,
  getTotalFineAmount,
  getUnpaidFineAmount,
  setFinePaidStatus,
  type FineRow,
} from "@/lib/fines";
import {
  createFineTemplate,
  deleteFineTemplate,
  ensureDefaultFineTemplates,
  getFineTemplatesByClubId,
  updateFineTemplate,
  type FineTemplateRow,
} from "@/lib/fineTemplates";
import { styles } from "@/styles/appStyles";

type MainTab = "attendance" | "fines";
type FineTab = "awarded" | "templates";
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

function formatMoney(value: number) {
  return `${Number(value).toFixed(0)} Kč`;
}

export default function DisciplineScreen({
  clubId,
  primaryColor = "#888",
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("attendance");
  const [fineTab, setFineTab] = useState<FineTab>("awarded");
  const [attendanceSort, setAttendanceSort] =
    useState<AttendanceSort>("highest");

  const [players, setPlayers] = useState<Player[]>([]);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [presenceMap, setPresenceMap] = useState<
    Record<string, TrainingPresenceRow[]>
  >({});
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);
  const [fines, setFines] = useState<FineRow[]>([]);
  const [fineTemplates, setFineTemplates] = useState<FineTemplateRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [fineSaving, setFineSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  const [periodName, setPeriodName] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("year");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");

  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [fineReason, setFineReason] = useState("");
  const [fineDate, setFineDate] = useState("");
  const [fineNote, setFineNote] = useState("");

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateAmount, setTemplateAmount] = useState("");
  const [templateIsActive, setTemplateIsActive] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setMessage("");

      const [
        playersData,
        trainingsData,
        periodData,
        {
          data: { user },
        },
      ] = await Promise.all([
        getPlayersByClubId(clubId),
        getTrainingsByClubId(clubId),
        getActivePeriod(clubId),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      setPlayers(playersData);
      setTrainings(trainingsData);
      setActivePeriod(periodData);
      setCurrentUserId(user?.id ?? null);

      const templatesData = await ensureDefaultFineTemplates(clubId);

      if (!active) return;
      setFineTemplates(templatesData);

      const map: Record<string, TrainingPresenceRow[]> = {};

      for (const training of trainingsData) {
        const rows = await getTrainingPresence(training.id);
        map[training.id] = rows;
      }

      if (!active) return;

      setPresenceMap(map);

      if (periodData) {
        const loadedFines = await getFinesByPeriodId(periodData.id);
        if (!active) return;
        setFines(loadedFines);
      } else {
        setFines([]);
      }

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

  const sortedAttendanceStats = useMemo(() => {
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

  const fineSummary = useMemo(() => {
    const summary = buildFineSummaryByPlayer(fines);

    return summary
      .map((item) => ({
        ...item,
        playerName:
          players.find((player) => player.id === item.player_id)?.name ??
          "Neznámý hráč",
      }))
      .sort((a, b) => {
        if (b.unpaid_amount !== a.unpaid_amount) {
          return b.unpaid_amount - a.unpaid_amount;
        }
        if (b.total_amount !== a.total_amount) {
          return b.total_amount - a.total_amount;
        }
        return a.playerName.localeCompare(b.playerName, "cs");
      });
  }, [fines, players]);

  const finesByPlayer = useMemo(() => {
    const map = new Map<string, FineRow[]>();

    fines.forEach((fine) => {
      if (!map.has(fine.player_id)) {
        map.set(fine.player_id, []);
      }
      map.get(fine.player_id)!.push(fine);
    });

    return map;
  }, [fines]);

  const totalFineAmount = useMemo(() => getTotalFineAmount(fines), [fines]);
  const paidFineAmount = useMemo(() => getPaidFineAmount(fines), [fines]);
  const unpaidFineAmount = useMemo(() => getUnpaidFineAmount(fines), [fines]);

  const resetPeriodForm = () => {
    setPeriodName("");
    setPeriodType("year");
    setPeriodStartDate("");
    setPeriodEndDate("");
  };

  const resetFineForm = () => {
    setSelectedPlayerId("");
    setSelectedTemplateId("");
    setFineAmount("");
    setFineReason("");
    setFineDate("");
    setFineNote("");
  };

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateAmount("");
    setTemplateIsActive(true);
  };

  const reloadTemplates = async () => {
    const data = await getFineTemplatesByClubId(clubId);
    setFineTemplates(data);
  };

  const reloadFines = async (periodId: string) => {
    const data = await getFinesByPeriodId(periodId);
    setFines(data);
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
    setFines([]);
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
    setFines([]);
    setExpandedPlayerId(null);
    setMessage("Období bylo uzavřeno. Teď můžeš založit nové.");
    setPeriodSaving(false);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);

    const template = fineTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setFineReason(template.name);
    setFineAmount(String(template.default_amount));
  };

  const handleCreateFine = async () => {
    if (!activePeriod) {
      setMessage("Nejdřív vytvoř aktivní období.");
      return;
    }

    if (!selectedPlayerId) {
      setMessage("Vyber hráče.");
      return;
    }

    if (!fineReason.trim()) {
      setMessage("Zadej důvod pokuty.");
      return;
    }

    if (!fineAmount.trim()) {
      setMessage("Zadej částku pokuty.");
      return;
    }

    const parsedAmount = Number(fineAmount.replace(",", "."));

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setMessage("Částka pokuty musí být platné číslo.");
      return;
    }

    if (!fineDate) {
      setMessage("Vyber datum pokuty.");
      return;
    }

    setFineSaving(true);
    setMessage("");

    const created = await createFine({
      clubId,
      periodId: activePeriod.id,
      playerId: selectedPlayerId,
      amount: parsedAmount,
      reason: fineReason.trim(),
      note: fineNote.trim() || null,
      fineDate,
      createdBy: currentUserId,
    });

    if (!created) {
      setMessage("Nepodařilo se přidat pokutu.");
      setFineSaving(false);
      return;
    }

    await reloadFines(activePeriod.id);
    resetFineForm();
    setMessage("Pokuta byla přidána.");
    setFineSaving(false);
  };

  const handleToggleFinePaid = async (fine: FineRow) => {
    if (!activePeriod) return;

    const success = await setFinePaidStatus({
      fineId: fine.id,
      isPaid: !fine.is_paid,
    });

    if (!success) {
      setMessage("Nepodařilo se změnit stav pokuty.");
      return;
    }

    await reloadFines(activePeriod.id);
    setMessage(
      !fine.is_paid
        ? "Pokuta byla označena jako zaplacená."
        : "Pokuta byla vrácena mezi nezaplacené."
    );
  };

  const handleDeleteFine = async (fineId: string) => {
    if (!activePeriod) return;

    const confirmed = window.confirm("Opravdu chceš smazat tuto pokutu?");
    if (!confirmed) return;

    const success = await deleteFine(fineId);

    if (!success) {
      setMessage("Nepodařilo se smazat pokutu.");
      return;
    }

    await reloadFines(activePeriod.id);
    setMessage("Pokuta byla smazána.");
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      setMessage("Zadej název týmové pokuty.");
      return;
    }

    if (!templateAmount.trim()) {
      setMessage("Zadej výchozí částku.");
      return;
    }

    const parsedAmount = Number(templateAmount.replace(",", "."));

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setMessage("Výchozí částka musí být platné číslo.");
      return;
    }

    setTemplateSaving(true);
    setMessage("");

    const created = await createFineTemplate({
      clubId,
      name: templateName.trim(),
      defaultAmount: parsedAmount,
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit týmovou pokutu.");
      setTemplateSaving(false);
      return;
    }

    await reloadTemplates();
    resetTemplateForm();
    setMessage("Týmová pokuta byla vytvořena.");
    setTemplateSaving(false);
  };

  const handleStartEditTemplate = (template: FineTemplateRow) => {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateAmount(String(template.default_amount));
    setTemplateIsActive(template.is_active);
    setMessage("");
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplateId) return;

    if (!templateName.trim()) {
      setMessage("Zadej název týmové pokuty.");
      return;
    }

    if (!templateAmount.trim()) {
      setMessage("Zadej výchozí částku.");
      return;
    }

    const parsedAmount = Number(templateAmount.replace(",", "."));

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setMessage("Výchozí částka musí být platné číslo.");
      return;
    }

    setTemplateSaving(true);
    setMessage("");

    const updated = await updateFineTemplate({
      templateId: editingTemplateId,
      name: templateName.trim(),
      defaultAmount: parsedAmount,
      isActive: templateIsActive,
    });

    if (!updated) {
      setMessage("Nepodařilo se upravit týmovou pokutu.");
      setTemplateSaving(false);
      return;
    }

    await reloadTemplates();
    resetTemplateForm();
    setMessage("Týmová pokuta byla upravena.");
    setTemplateSaving(false);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const confirmed = window.confirm("Opravdu chceš smazat tuto týmovou pokutu?");
    if (!confirmed) return;

    const success = await deleteFineTemplate(templateId);

    if (!success) {
      setMessage("Nepodařilo se smazat týmovou pokutu.");
      return;
    }

    await reloadTemplates();

    if (editingTemplateId === templateId) {
      resetTemplateForm();
    }

    setMessage("Týmová pokuta byla smazána.");
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

  const subTabButton = (active: boolean): React.CSSProperties => ({
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
            style={tabButton(mainTab === "attendance")}
            onClick={() => setMainTab("attendance")}
          >
            DOCHÁZKA
          </button>

          <button
            style={tabButton(mainTab === "fines")}
            onClick={() => setMainTab("fines")}
          >
            POKUTY
          </button>
        </div>
      </div>

      {mainTab === "attendance" && (
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
              {sortedAttendanceStats.map((row, index) => (
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

      {mainTab === "fines" && (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={styles.card}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                style={subTabButton(fineTab === "awarded")}
                onClick={() => setFineTab("awarded")}
              >
                UDĚLENÉ
              </button>

              <button
                style={subTabButton(fineTab === "templates")}
                onClick={() => setFineTab("templates")}
              >
                TÝMOVÉ POKUTY
              </button>
            </div>
          </div>

          {fineTab === "awarded" && (
            <>
              <div style={styles.card}>
                <h2 style={styles.screenTitle}>Přidat pokutu</h2>

                {!activePeriod ? (
                  <div style={{ color: "#b8b8b8" }}>
                    Nejprve vytvoř aktivní období.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    <select
                      value={selectedPlayerId}
                      onChange={(e) => setSelectedPlayerId(e.target.value)}
                      style={{
                        ...styles.input,
                        appearance: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="" style={{ background: "#111111", color: "white" }}>
                        Vyber hráče
                      </option>
                      {players
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, "cs"))
                        .map((player) => (
                          <option
                            key={player.id}
                            value={player.id}
                            style={{ background: "#111111", color: "white" }}
                          >
                            {player.name}
                          </option>
                        ))}
                    </select>

                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      style={{
                        ...styles.input,
                        appearance: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="" style={{ background: "#111111", color: "white" }}>
                        Vyber týmovou pokutu
                      </option>
                      {fineTemplates
                        .filter((item) => item.is_active)
                        .map((template) => (
                          <option
                            key={template.id}
                            value={template.id}
                            style={{ background: "#111111", color: "white" }}
                          >
                            {template.name} ({template.default_amount} Kč)
                          </option>
                        ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Důvod pokuty"
                      value={fineReason}
                      onChange={(e) => setFineReason(e.target.value)}
                      style={styles.input}
                    />

                    <input
                      type="number"
                      placeholder="Částka"
                      value={fineAmount}
                      onChange={(e) => setFineAmount(e.target.value)}
                      style={styles.input}
                    />

                    <input
                      type="date"
                      value={fineDate}
                      onChange={(e) => setFineDate(e.target.value)}
                      style={styles.input}
                    />

                    <textarea
                      placeholder="Poznámka"
                      value={fineNote}
                      onChange={(e) => setFineNote(e.target.value)}
                      style={{
                        ...styles.input,
                        minHeight: "90px",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />

                    <button
                      type="button"
                      onClick={handleCreateFine}
                      disabled={fineSaving}
                      style={{
                        ...styles.primaryButton,
                        marginTop: 0,
                        background: primaryColor,
                        border: "none",
                        opacity: fineSaving ? 0.7 : 1,
                      }}
                    >
                      {fineSaving ? "Ukládám..." : "Přidat pokutu"}
                    </button>
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <h2 style={styles.screenTitle}>Přehled hráčů a pokut</h2>

                {!activePeriod ? (
                  <div style={{ color: "#b8b8b8" }}>
                    Nejprve vytvoř aktivní období.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div>
                        Celkem pokut: <strong>{fines.length}</strong>
                      </div>
                      <div>
                        Celkem: <strong>{formatMoney(totalFineAmount)}</strong>
                      </div>
                      <div>
                        Zaplaceno: <strong>{formatMoney(paidFineAmount)}</strong>
                      </div>
                      <div>
                        Nezaplaceno: <strong>{formatMoney(unpaidFineAmount)}</strong>
                      </div>
                    </div>

                    {fineSummary.length === 0 ? (
                      <div style={{ color: "#b8b8b8" }}>
                        Zatím žádné pokuty v tomto období.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {fineSummary.map((item, index) => {
                          const playerFines =
                            (finesByPlayer.get(item.player_id) ?? []).slice().sort((a, b) => {
                              const dateCompare = b.fine_date.localeCompare(a.fine_date);
                              if (dateCompare !== 0) return dateCompare;
                              return (b.created_at ?? "").localeCompare(a.created_at ?? "");
                            });

                          const isExpanded = expandedPlayerId === item.player_id;

                          return (
                            <div
                              key={item.player_id}
                              style={{
                                padding: "12px",
                                borderRadius: "12px",
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPlayerId((prev) =>
                                    prev === item.player_id ? null : item.player_id
                                  )
                                }
                                style={{
                                  width: "100%",
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
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
                                      <div style={{ fontWeight: "bold" }}>{item.playerName}</div>
                                      <div
                                        style={{
                                          fontSize: "13px",
                                          color: "#b8b8b8",
                                          marginTop: "4px",
                                        }}
                                      >
                                        Pokut: {item.fines_count}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ textAlign: "right" }}>
                                    <div
                                      style={{
                                        fontSize: "15px",
                                        fontWeight: "bold",
                                        color: "#ffffff",
                                      }}
                                    >
                                      {formatMoney(item.total_amount)}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#9af0b6",
                                        marginTop: "4px",
                                      }}
                                    >
                                      Zaplaceno: {formatMoney(item.paid_amount)}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#ffb0a8",
                                        marginTop: "2px",
                                      }}
                                    >
                                      Nezaplaceno: {formatMoney(item.unpaid_amount)}
                                    </div>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    marginTop: "8px",
                                    fontSize: "12px",
                                    color: "#b8b8b8",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {isExpanded ? "Skrýt detail" : "Zobrazit detail"}
                                </div>
                              </button>

                              {isExpanded && (
                                <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
                                  {playerFines.length === 0 ? (
                                    <div style={{ color: "#b8b8b8", fontSize: "13px" }}>
                                      Žádné pokuty.
                                    </div>
                                  ) : (
                                    playerFines.map((fine) => (
                                      <div
                                        key={fine.id}
                                        style={{
                                          padding: "10px 12px",
                                          borderRadius: "10px",
                                          background: "rgba(255,255,255,0.03)",
                                          border: "1px solid rgba(255,255,255,0.04)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: "10px",
                                            alignItems: "flex-start",
                                          }}
                                        >
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                                              {fine.reason}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: "12px",
                                                color: "#b8b8b8",
                                                marginTop: "4px",
                                              }}
                                            >
                                              {fine.fine_date}
                                            </div>
                                            {fine.note && (
                                              <div
                                                style={{
                                                  fontSize: "12px",
                                                  color: "#cfcfcf",
                                                  marginTop: "6px",
                                                  lineHeight: 1.45,
                                                }}
                                              >
                                                {fine.note}
                                              </div>
                                            )}
                                          </div>

                                          <div style={{ textAlign: "right" }}>
                                            <div
                                              style={{
                                                fontWeight: "bold",
                                                fontSize: "15px",
                                                color: fine.is_paid ? "#9af0b6" : "#ffb0a8",
                                              }}
                                            >
                                              {formatMoney(fine.amount)}
                                            </div>
                                            <div
                                              style={{
                                                fontSize: "11px",
                                                marginTop: "4px",
                                                color: fine.is_paid ? "#9af0b6" : "#ffb0a8",
                                                fontWeight: "bold",
                                              }}
                                            >
                                              {fine.is_paid ? "ZAPLACENO" : "NEZAPLACENO"}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <h2 style={styles.screenTitle}>Seznam všech udělených pokut</h2>

                {!activePeriod ? (
                  <div style={{ color: "#b8b8b8" }}>
                    Nejprve vytvoř aktivní období.
                  </div>
                ) : fines.length === 0 ? (
                  <div style={{ color: "#b8b8b8" }}>
                    Zatím žádné pokuty.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {fines
                      .slice()
                      .sort((a, b) => {
                        const dateCompare = b.fine_date.localeCompare(a.fine_date);
                        if (dateCompare !== 0) return dateCompare;
                        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
                      })
                      .map((fine) => {
                        const playerName =
                          players.find((player) => player.id === fine.player_id)?.name ??
                          "Neznámý hráč";

                        return (
                          <div
                            key={fine.id}
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
                                justifyContent: "space-between",
                                gap: "12px",
                                alignItems: "flex-start",
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: "bold" }}>{playerName}</div>
                                <div style={{ marginTop: "6px", fontSize: "14px" }}>
                                  {fine.reason}
                                </div>
                                <div
                                  style={{
                                    marginTop: "6px",
                                    fontSize: "13px",
                                    color: "#b8b8b8",
                                  }}
                                >
                                  {fine.fine_date} • {formatMoney(fine.amount)}
                                </div>
                                {fine.note && (
                                  <div
                                    style={{
                                      marginTop: "6px",
                                      fontSize: "13px",
                                      color: "#cfcfcf",
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    {fine.note}
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  background: fine.is_paid
                                    ? "rgba(46, 204, 113, 0.16)"
                                    : "rgba(231, 76, 60, 0.16)",
                                  color: fine.is_paid ? "#9af0b6" : "#ffb0a8",
                                  fontWeight: "bold",
                                  fontSize: "12px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {fine.is_paid ? "ZAPLACENO" : "NEZAPLACENO"}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                              <button
                                type="button"
                                onClick={() => void handleToggleFinePaid(fine)}
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
                                {fine.is_paid
                                  ? "Vrátit na nezaplaceno"
                                  : "Označit jako zaplacené"}
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDeleteFine(fine.id)}
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
                                Smazat
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </>
          )}

          {fineTab === "templates" && (
            <>
              <div style={styles.card}>
                <h2 style={styles.screenTitle}>
                  {editingTemplateId ? "Upravit týmovou pokutu" : "Přidat týmovou pokutu"}
                </h2>

                <div style={{ display: "grid", gap: "10px" }}>
                  <input
                    type="text"
                    placeholder="Název pokuty"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={styles.input}
                  />

                  <input
                    type="number"
                    placeholder="Výchozí částka"
                    value={templateAmount}
                    onChange={(e) => setTemplateAmount(e.target.value)}
                    style={styles.input}
                  />

                  {editingTemplateId && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        color: "#d9d9d9",
                        fontSize: "14px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={templateIsActive}
                        onChange={(e) => setTemplateIsActive(e.target.checked)}
                      />
                      Aktivní předvolba
                    </label>
                  )}

                  {editingTemplateId ? (
                    <>
                      <button
                        type="button"
                        onClick={handleUpdateTemplate}
                        disabled={templateSaving}
                        style={{
                          ...styles.primaryButton,
                          marginTop: 0,
                          background: primaryColor,
                          border: "none",
                          opacity: templateSaving ? 0.7 : 1,
                        }}
                      >
                        {templateSaving ? "Ukládám..." : "Uložit změny"}
                      </button>

                      <button
                        type="button"
                        onClick={resetTemplateForm}
                        disabled={templateSaving}
                        style={{
                          ...styles.primaryButton,
                          marginTop: 0,
                          background: "rgba(255,255,255,0.12)",
                          border: "none",
                        }}
                      >
                        Zrušit úpravu
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateTemplate}
                      disabled={templateSaving}
                      style={{
                        ...styles.primaryButton,
                        marginTop: 0,
                        background: primaryColor,
                        border: "none",
                        opacity: templateSaving ? 0.7 : 1,
                      }}
                    >
                      {templateSaving ? "Ukládám..." : "Přidat týmovou pokutu"}
                    </button>
                  )}
                </div>
              </div>

              <div style={styles.card}>
                <h2 style={styles.screenTitle}>Seznam týmových pokut</h2>

                {fineTemplates.length === 0 ? (
                  <div style={{ color: "#b8b8b8" }}>
                    Zatím žádné týmové pokuty.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {fineTemplates.map((template) => (
                      <div
                        key={template.id}
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
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "bold" }}>{template.name}</div>
                            <div
                              style={{
                                marginTop: "6px",
                                fontSize: "13px",
                                color: "#b8b8b8",
                              }}
                            >
                              Výchozí částka: {template.default_amount} Kč
                            </div>
                          </div>

                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: template.is_active
                                ? "rgba(46, 204, 113, 0.16)"
                                : "rgba(255,255,255,0.10)",
                              color: template.is_active ? "#9af0b6" : "#b8b8b8",
                              fontWeight: "bold",
                              fontSize: "12px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {template.is_active ? "AKTIVNÍ" : "NEAKTIVNÍ"}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                          <button
                            type="button"
                            onClick={() => handleStartEditTemplate(template)}
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
                            Upravit
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteTemplate(template.id)}
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
                            Smazat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

