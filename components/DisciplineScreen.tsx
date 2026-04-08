"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  getTrainingsByClubId,
  getTrainingAttendance,
  getTrainingPresence,
  type TrainingAttendanceRow,
  type TrainingRow,
  type TrainingPresenceRow,
} from "@/lib/trainings";
import {
  closePeriod,
  createPeriod,
  getActivePeriod,
  getPeriodsByClubId,
  type Period,
} from "@/lib/periods";
import {
  buildFineSummaryByPlayer,
  createFine,
  findExistingPollFine,
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
type PeriodFilterMode = "active" | "all" | "custom";

type Props = {
  clubId: string;
  primaryColor?: string;
};

function normalizeDateToIso(value?: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoDateTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDateTimeMatch) {
    return isoDateTimeMatch[1];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+.*)?$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month}-${day}`;
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+.*)?$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toDateTimeMs(dateValue?: string | null, timeValue?: string | null) {
  const isoDate = normalizeDateToIso(dateValue);
  if (!isoDate) return Number.NaN;

  const normalizedTime =
    timeValue && /^\d{2}:\d{2}/.test(timeValue) ? timeValue.slice(0, 5) : "00:00";

  const parsed = new Date(`${isoDate}T${normalizedTime}:00`);
  return parsed.getTime();
}

function isOlderTraining(training: TrainingRow) {
  const now = Date.now();
  const endTime =
    training.end_time?.slice(0, 5) ||
    training.start_time?.slice(0, 5) ||
    training.time?.slice(0, 5) ||
    "23:59";

  const trainingTime = toDateTimeMs(training.date, endTime);
  if (Number.isNaN(trainingTime)) return false;

  return trainingTime < now;
}

function isDateInsidePeriod(dateValue: string, period: Period | null) {
  if (!period) return true;

  const normalizedDate = normalizeDateToIso(dateValue);
  const normalizedStart = normalizeDateToIso(period.start_date);
  const normalizedEnd = normalizeDateToIso(period.end_date);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) {
    return false;
  }

  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
}

function formatPeriodType(type: PeriodType) {
  return type === "year" ? "Rok" : "Sezóna";
}

function formatMoney(value: number) {
  return `${Number(value).toFixed(0)} Kč`;
}

function formatFineNote(note?: string | null) {
  if (!note) return "";

  if (note.startsWith("training:")) {
    return "Automatická pokuta za nehlasování v anketě na trénink.";
  }

  return note;
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
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, TrainingAttendanceRow[]>
  >({});

  const [periods, setPeriods] = useState<Period[]>([]);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [periodFilterMode, setPeriodFilterMode] =
    useState<PeriodFilterMode>("active");

  const [fines, setFines] = useState<FineRow[]>([]);
  const [fineTemplates, setFineTemplates] = useState<FineTemplateRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [fineSaving, setFineSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [showFineForm, setShowFineForm] = useState(false);

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

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateAmount, setNewTemplateAmount] = useState("");

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingTemplateAmount, setEditingTemplateAmount] = useState("");
  const [editingTemplateIsActive, setEditingTemplateIsActive] = useState(true);

  const loadPeriodsState = async () => {
    const [loadedPeriods, loadedActivePeriod] = await Promise.all([
      getPeriodsByClubId(clubId),
      getActivePeriod(clubId),
    ]);

    const sortedPeriods = [...loadedPeriods].sort((a, b) =>
      normalizeDateToIso(b.start_date).localeCompare(
        normalizeDateToIso(a.start_date)
      )
    );

    setPeriods(sortedPeriods);
    setActivePeriod(loadedActivePeriod);

    setSelectedPeriodId((prev) => {
      if (prev) return prev;
      return loadedActivePeriod?.id ?? "";
    });

    setPeriodFilterMode((prev) => {
      if (prev === "custom" || prev === "all") return prev;
      return loadedActivePeriod ? "active" : "all";
    });

    return {
      loadedPeriods: sortedPeriods,
      loadedActivePeriod,
    };
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setMessage("");

      const [
        playersData,
        trainingsData,
        templatesData,
        {
          data: { user },
        },
      ] = await Promise.all([
        getPlayersByClubId(clubId),
        getTrainingsByClubId(clubId),
        ensureDefaultFineTemplates(clubId),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      setPlayers(playersData);
      setTrainings(trainingsData);
      setFineTemplates(templatesData);
      setCurrentUserId(user?.id ?? null);

      const nextPresenceMap: Record<string, TrainingPresenceRow[]> = {};
      const nextAttendanceMap: Record<string, TrainingAttendanceRow[]> = {};

      for (const training of trainingsData) {
        const [presenceRows, attendanceRows] = await Promise.all([
          getTrainingPresence(training.id),
          getTrainingAttendance(training.id),
        ]);

        nextPresenceMap[training.id] = presenceRows;
        nextAttendanceMap[training.id] = attendanceRows;
      }

      if (!active) return;

      setPresenceMap(nextPresenceMap);
      setAttendanceMap(nextAttendanceMap);

      await loadPeriodsState();

      if (!active) return;
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [clubId]);

  useEffect(() => {
    const runAutomaticPollFines = async () => {
      if (!activePeriod) return;
      if (players.length === 0) return;
      if (trainings.length === 0) return;
      if (fineTemplates.length === 0) return;

      const anketyTemplate = fineTemplates.find(
        (item) => item.name.trim().toLowerCase() === "ankety" && item.is_active
      );

      if (!anketyTemplate) return;

      const olderPollTrainings = trainings.filter(
        (training) =>
          isOlderTraining(training) &&
          training.poll_enabled === true &&
          isDateInsidePeriod(training.date, activePeriod)
      );

      if (olderPollTrainings.length === 0) return;

      let createdAny = false;

      for (const training of olderPollTrainings) {
        const attendanceRows = attendanceMap[training.id] ?? [];
        const normalizedTrainingDate = normalizeDateToIso(training.date);

        if (!normalizedTrainingDate) {
          console.error(
            "Automatic poll fine skipped: invalid training date",
            training
          );
          continue;
        }

        for (const player of players) {
          const voted = attendanceRows.some(
            (row) =>
              row.player_id === player.id &&
              (row.status === "yes" || row.status === "no")
          );

          if (voted) continue;

          try {
            const existing = await findExistingPollFine({
              periodId: activePeriod.id,
              playerId: player.id,
              trainingId: training.id,
            });

            if (existing) continue;

            const created = await createFine({
              clubId,
              periodId: activePeriod.id,
              playerId: player.id,
              amount: Number(anketyTemplate.default_amount),
              reason: anketyTemplate.name,
              note: `training:${training.id}`,
              fineDate: normalizedTrainingDate,
              createdBy: currentUserId,
            });

            if (created) {
              createdAny = true;
            } else {
              console.error("Automatic poll fine creation failed", {
                clubId,
                periodId: activePeriod.id,
                playerId: player.id,
                trainingId: training.id,
                templateId: anketyTemplate.id,
              });
            }
          } catch (error) {
            console.error("Automatic poll fine creation error", {
              error,
              clubId,
              periodId: activePeriod.id,
              playerId: player.id,
              trainingId: training.id,
              templateId: anketyTemplate.id,
            });
          }
        }
      }

      if (createdAny) {
        const refreshed = await getFinesByPeriodId(activePeriod.id);
        setFines(refreshed);
      }
    };

    void runAutomaticPollFines();
  }, [
    activePeriod,
    attendanceMap,
    clubId,
    currentUserId,
    fineTemplates,
    players,
    trainings,
  ]);

  const effectivePeriod = useMemo(() => {
    if (periodFilterMode === "all") return null;
    if (periodFilterMode === "active") return activePeriod ?? null;
    return periods.find((period) => period.id === selectedPeriodId) ?? null;
  }, [periodFilterMode, activePeriod, periods, selectedPeriodId]);

  useEffect(() => {
    let active = true;

    const loadVisibleFines = async () => {
      if (periodFilterMode === "all") {
        const finesByPeriods = await Promise.all(
          periods.map((period) => getFinesByPeriodId(period.id))
        );

        if (!active) return;

        const merged = finesByPeriods.flat();
        setFines(merged);
        return;
      }

      if (!effectivePeriod) {
        if (!active) return;
        setFines([]);
        return;
      }

      const loadedFines = await getFinesByPeriodId(effectivePeriod.id);

      if (!active) return;
      setFines(loadedFines);
    };

    void loadVisibleFines();

    return () => {
      active = false;
    };
  }, [effectivePeriod, periodFilterMode, periods]);

  const filteredOlderTrainings = useMemo(() => {
    return trainings.filter(
      (training) =>
        isOlderTraining(training) && isDateInsidePeriod(training.date, effectivePeriod)
    );
  }, [trainings, effectivePeriod]);

  const attendanceStats = useMemo(() => {
    return players.map((player) => {
      let attended = 0;
      const total = filteredOlderTrainings.length;

      filteredOlderTrainings.forEach((training) => {
        const rows = presenceMap[training.id] || [];
        const isPresent = rows.some(
          (row) => row.player_id === player.id && row.present
        );

        if (isPresent) attended += 1;
      });

      const percentage = total === 0 ? 0 : Math.round((attended / total) * 100);

      return {
        player,
        attended,
        total,
        percentage,
      };
    });
  }, [players, filteredOlderTrainings, presenceMap]);

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

  const resetInlineTemplateEdit = () => {
    setEditingTemplateId(null);
    setEditingTemplateName("");
    setEditingTemplateAmount("");
    setEditingTemplateIsActive(true);
  };

  const reloadTemplates = async () => {
    const data = await getFineTemplatesByClubId(clubId);
    setFineTemplates(data);
  };

  const reloadVisibleFines = async () => {
    if (periodFilterMode === "all") {
      const finesByPeriods = await Promise.all(
        periods.map((period) => getFinesByPeriodId(period.id))
      );
      setFines(finesByPeriods.flat());
      return;
    }

    if (!effectivePeriod) {
      setFines([]);
      return;
    }

    const data = await getFinesByPeriodId(effectivePeriod.id);
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

    const normalizedStart = normalizeDateToIso(periodStartDate);
    const normalizedEnd = normalizeDateToIso(periodEndDate);

    if (!normalizedStart || !normalizedEnd) {
      setMessage("Datum období není ve správném formátu.");
      return;
    }

    if (normalizedEnd < normalizedStart) {
      setMessage("Datum konce musí být později než datum začátku.");
      return;
    }

    setPeriodSaving(true);
    setMessage("");

    const created = await createPeriod({
      clubId,
      name: periodName.trim(),
      type: periodType,
      startDate: normalizedStart,
      endDate: normalizedEnd,
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit období.");
      setPeriodSaving(false);
      return;
    }

    await loadPeriodsState();
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

    await loadPeriodsState();
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

    const normalizedFineDate = normalizeDateToIso(fineDate);

    if (!normalizedFineDate) {
      setMessage("Datum pokuty není ve správném formátu.");
      return;
    }

    if (!isDateInsidePeriod(normalizedFineDate, activePeriod)) {
      setMessage("Datum pokuty nespadá do aktivního období.");
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
      fineDate: normalizedFineDate,
      createdBy: currentUserId,
    });

    if (!created) {
      setMessage("Nepodařilo se přidat pokutu.");
      setFineSaving(false);
      return;
    }

    await reloadVisibleFines();
    resetFineForm();
    setShowFineForm(false);
    setMessage("Pokuta byla přidána.");
    setFineSaving(false);
  };

  const handleToggleFinePaid = async (fine: FineRow) => {
    const success = await setFinePaidStatus({
      fineId: fine.id,
      isPaid: !fine.is_paid,
    });

    if (!success) {
      setMessage("Nepodařilo se změnit stav pokuty.");
      return;
    }

    await reloadVisibleFines();
    setMessage(
      !fine.is_paid
        ? "Pokuta byla označena jako zaplacená."
        : "Pokuta byla vrácena mezi nezaplacené."
    );
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      setMessage("Zadej název týmové pokuty.");
      return;
    }

    if (!newTemplateAmount.trim()) {
      setMessage("Zadej výchozí částku.");
      return;
    }

    const parsedAmount = Number(newTemplateAmount.replace(",", "."));

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setMessage("Výchozí částka musí být platné číslo.");
      return;
    }

    setTemplateSaving(true);
    setMessage("");

    const created = await createFineTemplate({
      clubId,
      name: newTemplateName.trim(),
      defaultAmount: parsedAmount,
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit týmovou pokutu.");
      setTemplateSaving(false);
      return;
    }

    await reloadTemplates();
    setNewTemplateName("");
    setNewTemplateAmount("");
    setMessage("Týmová pokuta byla vytvořena.");
    setTemplateSaving(false);
  };

  const handleStartEditTemplate = (template: FineTemplateRow) => {
    if (editingTemplateId === template.id) {
      resetInlineTemplateEdit();
      return;
    }

    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
    setEditingTemplateAmount(String(template.default_amount));
    setEditingTemplateIsActive(template.is_active);
    setMessage("");
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplateId) return;

    if (!editingTemplateName.trim()) {
      setMessage("Zadej název týmové pokuty.");
      return;
    }

    if (!editingTemplateAmount.trim()) {
      setMessage("Zadej výchozí částku.");
      return;
    }

    const parsedAmount = Number(editingTemplateAmount.replace(",", "."));

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setMessage("Výchozí částka musí být platné číslo.");
      return;
    }

    setTemplateSaving(true);
    setMessage("");

    const updated = await updateFineTemplate({
      templateId: editingTemplateId,
      name: editingTemplateName.trim(),
      defaultAmount: parsedAmount,
      isActive: editingTemplateIsActive,
    });

    if (!updated) {
      setMessage("Nepodařilo se upravit týmovou pokutu.");
      setTemplateSaving(false);
      return;
    }

    await reloadTemplates();
    resetInlineTemplateEdit();
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
      resetInlineTemplateEdit();
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

      <div style={styles.card}>
        <h2 style={styles.screenTitle}>Filtr období</h2>

        <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setPeriodFilterMode("active")}
              style={tabButton(periodFilterMode === "active")}
            >
              Aktivní období
            </button>

            <button
              type="button"
              onClick={() => setPeriodFilterMode("all")}
              style={tabButton(periodFilterMode === "all")}
            >
              Vše
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setPeriodFilterMode("custom");
              if (!selectedPeriodId && periods.length > 0) {
                setSelectedPeriodId(periods[0].id);
              }
            }}
            style={tabButton(periodFilterMode === "custom")}
          >
            Vybrat konkrétní období
          </button>

          {periodFilterMode === "custom" && (
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              style={{
                ...styles.input,
                appearance: "none",
                cursor: "pointer",
                marginBottom: 0,
              }}
            >
              <option value="" style={{ background: "#111111", color: "white" }}>
                Vyber období
              </option>

              {periods.map((period) => (
                <option
                  key={period.id}
                  value={period.id}
                  style={{ background: "#111111", color: "white" }}
                >
                  {period.name}
                  {period.is_active ? " (aktivní)" : ""}
                </option>
              ))}
            </select>
          )}
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
            Do docházky se počítají všechny starší tréninky v právě zvoleném období.
            Jakmile u staršího tréninku potvrdíš účast, zapíše se hráčům do docházky.
          </div>

          {loading ? (
            <div style={{ color: "#b8b8b8" }}>Načítám docházku...</div>
          ) : filteredOlderTrainings.length === 0 ? (
            <div style={{ color: "#b8b8b8" }}>
              Zatím nejsou žádné starší tréninky v tomto filtru období.
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
                <button
                  type="button"
                  onClick={() => {
                    if (showFineForm) {
                      resetFineForm();
                    }
                    setShowFineForm((prev) => !prev);
                  }}
                  style={{
                    ...styles.primaryButton,
                    marginTop: 0,
                    background: primaryColor,
                    border: "none",
                  }}
                >
                  {showFineForm ? "Zavřít formulář" : "Přidat pokutu"}
                </button>

                {showFineForm && (
                  <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
                    <h2 style={{ ...styles.screenTitle, marginTop: 0 }}>Přidat pokutu</h2>

                    {!activePeriod ? (
                      <div style={{ color: "#b8b8b8" }}>
                        Nejprve vytvoř aktivní období.
                      </div>
                    ) : (
                      <>
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
                          {fineSaving ? "Ukládám..." : "Potvrdit pokutu"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.card}>
                <h2 style={styles.screenTitle}>Přehled hráčů a pokut</h2>

                {!activePeriod && periodFilterMode !== "all" ? (
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
                        Zatím žádné pokuty v tomto filtru období.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {fineSummary.map((item, index) => {
                          const playerFines =
                            (finesByPlayer.get(item.player_id) ?? []).slice().sort((a, b) => {
                              const dateCompare = normalizeDateToIso(
                                b.fine_date
                              ).localeCompare(normalizeDateToIso(a.fine_date));
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
                                                {formatFineNote(fine.note)}
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

                                        {!fine.is_paid && (
                                          <button
                                            type="button"
                                            onClick={() => void handleToggleFinePaid(fine)}
                                            style={{
                                              marginTop: "10px",
                                              width: "100%",
                                              border: "none",
                                              borderRadius: "10px",
                                              padding: "10px 12px",
                                              background: primaryColor,
                                              color: "white",
                                              fontWeight: "bold",
                                              cursor: "pointer",
                                            }}
                                          >
                                            Označit jako zaplacené
                                          </button>
                                        )}
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
            </>
          )}

          {fineTab === "templates" && (
            <>
              <div style={styles.card}>
                <h2 style={styles.screenTitle}>Přidat týmovou pokutu</h2>

                <div style={{ display: "grid", gap: "10px" }}>
                  <input
                    type="text"
                    placeholder="Název pokuty"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    style={styles.input}
                  />

                  <input
                    type="number"
                    placeholder="Výchozí částka"
                    value={newTemplateAmount}
                    onChange={(e) => setNewTemplateAmount(e.target.value)}
                    style={styles.input}
                  />

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
                    {fineTemplates.map((template) => {
                      const isEditing = editingTemplateId === template.id;

                      return (
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
                              {isEditing ? "Zavřít úpravu" : "Upravit"}
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

                          {isEditing && (
                            <div
                              style={{
                                display: "grid",
                                gap: "10px",
                                marginTop: "12px",
                                paddingTop: "12px",
                                borderTop: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              <input
                                type="text"
                                placeholder="Název pokuty"
                                value={editingTemplateName}
                                onChange={(e) => setEditingTemplateName(e.target.value)}
                                style={styles.input}
                              />

                              <input
                                type="number"
                                placeholder="Výchozí částka"
                                value={editingTemplateAmount}
                                onChange={(e) => setEditingTemplateAmount(e.target.value)}
                                style={styles.input}
                              />

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
                                  checked={editingTemplateIsActive}
                                  onChange={(e) =>
                                    setEditingTemplateIsActive(e.target.checked)
                                  }
                                />
                                Aktivní předvolba
                              </label>

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
                                onClick={resetInlineTemplateEdit}
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
                            </div>
                          )}
                        </div>
                      );
                    })}
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