"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  getPlayersByClubId,
  getClubMemberPlayersByClubId,
  type Player,
  type ClubMemberPlayer,
} from "@/lib/players";
import {
  getTrainingsByClubId,
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
type PeriodFilterMode = "active" | "all" | "custom";

type Props = {
  clubId: string;
  primaryColor?: string;
  isAdmin: boolean;
};

type DisciplinePlayer = Player | ClubMemberPlayer;

function normalizeDateToIso(value?: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoDateTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDateTimeMatch) return isoDateTimeMatch[1];

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

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

function normalizeTimeValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function isOlderTraining(training: TrainingRow) {
  const now = new Date();
  const isoDate = normalizeDateToIso(training.date);

  if (!isoDate) return false;

  const endTime =
    normalizeTimeValue(training.end_time) ||
    normalizeTimeValue(training.start_time) ||
    "23:59";

  const trainingDate = new Date(`${isoDate}T${endTime}:00`);

  if (Number.isNaN(trainingDate.getTime())) return false;

  return trainingDate.getTime() < now.getTime();
}

function isDateInsidePeriod(dateValue: string, period: Period | null) {
  if (!period) return true;

  const normalizedDate = normalizeDateToIso(dateValue);
  const normalizedStart = normalizeDateToIso(period.start_date);
  const normalizedEnd = normalizeDateToIso(period.end_date);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) return false;

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

  if (note.startsWith("poll:")) {
    return "Pokuta za nehlasování v anketě.";
  }

  return note;
}

function groupRowsByTrainingId<T extends { training_id: string }>(rows: T[]) {
  const map: Record<string, T[]> = {};

  rows.forEach((row) => {
    if (!map[row.training_id]) {
      map[row.training_id] = [];
    }

    map[row.training_id].push(row);
  });

  return map;
}

export default function DisciplineScreen({
  clubId,
  primaryColor = "#22c55e",
  isAdmin,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("attendance");
  const [fineTab, setFineTab] = useState<FineTab>("awarded");
  const [attendanceSort, setAttendanceSort] =
    useState<AttendanceSort>("highest");

  const [players, setPlayers] = useState<Player[]>([]);
  const [clubMemberPlayers, setClubMemberPlayers] = useState<
    ClubMemberPlayer[]
  >([]);
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
  const [periodPanelOpen, setPeriodPanelOpen] = useState(false);
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);

  const [fines, setFines] = useState<FineRow[]>([]);
  const [fineTemplates, setFineTemplates] = useState<FineTemplateRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [finesLoading, setFinesLoading] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [fineSaving, setFineSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [deletingFineId, setDeletingFineId] = useState<string | null>(null);
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

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingTemplateAmount, setEditingTemplateAmount] = useState("");
  const [editingTemplateIsActive, setEditingTemplateIsActive] = useState(true);

  const disciplinePlayers = useMemo<DisciplinePlayer[]>(() => {
    if (players.length > 0) return players;
    return clubMemberPlayers;
  }, [players, clubMemberPlayers]);

  const disciplinePlayersById = useMemo(() => {
    const map = new Map<string, DisciplinePlayer>();

    disciplinePlayers.forEach((player) => {
      map.set(player.id, player);
    });

    return map;
  }, [disciplinePlayers]);

  const loadPeriodsState = useCallback(async () => {
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
  }, [clubId]);

  const effectivePeriod = useMemo(() => {
    if (periodFilterMode === "all") return null;
    if (periodFilterMode === "active") return activePeriod ?? null;
    return periods.find((period) => period.id === selectedPeriodId) ?? null;
  }, [periodFilterMode, activePeriod, periods, selectedPeriodId]);

  const loadTemplatesIfNeeded = useCallback(async () => {
    if (templatesLoaded) return;

    const data = await ensureDefaultFineTemplates(clubId);
    setFineTemplates(data);
    setTemplatesLoaded(true);
  }, [clubId, templatesLoaded]);

  const reloadTemplates = useCallback(async () => {
    const data = await getFineTemplatesByClubId(clubId);
    setFineTemplates(data);
    setTemplatesLoaded(true);
  }, [clubId]);

  const reloadVisibleFines = useCallback(async () => {
    setFinesLoading(true);

    if (periodFilterMode === "all") {
      if (periods.length === 0) {
        setFines([]);
        setFinesLoading(false);
        return;
      }

      const finesByPeriods = await Promise.all(
        periods.map((period) => getFinesByPeriodId(period.id))
      );

      setFines(finesByPeriods.flat());
      setFinesLoading(false);
      return;
    }

    if (!effectivePeriod) {
      setFines([]);
      setFinesLoading(false);
      return;
    }

    const data = await getFinesByPeriodId(effectivePeriod.id);
    setFines(data);
    setFinesLoading(false);
  }, [effectivePeriod, periodFilterMode, periods]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setMessage("");

      const [
        playersData,
        clubMemberPlayersData,
        trainingsData,
        {
          data: { user },
        },
      ] = await Promise.all([
        getPlayersByClubId(clubId),
        getClubMemberPlayersByClubId(clubId),
        getTrainingsByClubId(clubId),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      setPlayers(playersData);
      setClubMemberPlayers(clubMemberPlayersData);
      setTrainings(trainingsData);
      setCurrentUserId(user?.id ?? null);

      const trainingIds = trainingsData.map((training) => training.id);

      if (trainingIds.length > 0) {
        const [presenceResponse, attendanceResponse] = await Promise.all([
          supabase
            .from("training_presence")
            .select("*")
            .in("training_id", trainingIds),
          supabase
            .from("training_attendance")
            .select("*")
            .in("training_id", trainingIds),
        ]);

        if (!active) return;

        if (presenceResponse.error) {
          console.error(
            "Nepodařilo se hromadně načíst reálnou docházku:",
            presenceResponse.error
          );
        }

        if (attendanceResponse.error) {
          console.error(
            "Nepodařilo se hromadně načíst hlasování tréninků:",
            attendanceResponse.error
          );
        }

        setPresenceMap(
          groupRowsByTrainingId(
            (presenceResponse.data as TrainingPresenceRow[]) ?? []
          )
        );
        setAttendanceMap(
          groupRowsByTrainingId(
            (attendanceResponse.data as TrainingAttendanceRow[]) ?? []
          )
        );
      } else {
        setPresenceMap({});
        setAttendanceMap({});
      }

      await loadPeriodsState();

      if (!active) return;
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [clubId, loadPeriodsState]);

  useEffect(() => {
    if (mainTab !== "fines") return;

    void reloadVisibleFines();

    if (isAdmin) {
      void loadTemplatesIfNeeded();
    }
  }, [mainTab, isAdmin, loadTemplatesIfNeeded, reloadVisibleFines]);

  useEffect(() => {
    if (mainTab !== "fines") return;
    void reloadVisibleFines();
  }, [effectivePeriod, periodFilterMode, periods, mainTab, reloadVisibleFines]);

  useEffect(() => {
    if (mainTab === "fines" && fineTab === "templates" && isAdmin) {
      void loadTemplatesIfNeeded();
    }
  }, [mainTab, fineTab, isAdmin, loadTemplatesIfNeeded]);

  const filteredOlderTrainings = useMemo(() => {
    return trainings.filter(
      (training) =>
        isOlderTraining(training) &&
        isDateInsidePeriod(training.date, effectivePeriod)
    );
  }, [trainings, effectivePeriod]);

  const attendanceStats = useMemo(() => {
    return disciplinePlayers.map((player) => {
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
  }, [disciplinePlayers, filteredOlderTrainings, presenceMap]);

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

  const attendanceAverage = useMemo(() => {
    if (attendanceStats.length === 0) return 0;
    const total = attendanceStats.reduce((sum, row) => sum + row.percentage, 0);
    return Math.round(total / attendanceStats.length);
  }, [attendanceStats]);

  const activeAttendancePlayersCount = useMemo(() => {
    return attendanceStats.filter((row) => row.attended > 0).length;
  }, [attendanceStats]);

  const fineSummary = useMemo(() => {
    const summary = buildFineSummaryByPlayer(fines);

    return summary
      .map((item) => ({
        ...item,
        playerName:
          disciplinePlayersById.get(item.player_id)?.name ?? "Neznámý hráč",
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
  }, [disciplinePlayersById, fines]);

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

  const handleCreatePeriod = async () => {
    if (!isAdmin) {
      setMessage("Pouze admin může vytvářet období.");
      return;
    }

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
    setCreatePeriodOpen(false);
    setMessage("Období bylo vytvořeno.");
    setPeriodSaving(false);
  };

  const handleClosePeriod = async () => {
    if (!isAdmin) {
      setMessage("Pouze admin může uzavírat období.");
      return;
    }

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
    if (!isAdmin) {
      setMessage("Pouze admin může přidávat pokuty.");
      return;
    }

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
    if (!isAdmin) {
      setMessage("Pouze admin může měnit stav pokuty.");
      return;
    }

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

  const handleDeleteFine = async (fine: FineRow) => {
    if (!isAdmin) {
      setMessage("Pouze admin může mazat pokuty.");
      return;
    }

    const confirmed = window.confirm(
      `Opravdu chceš smazat pokutu "${fine.reason}" za ${formatMoney(fine.amount)}?`
    );
    if (!confirmed) return;

    setDeletingFineId(fine.id);
    setMessage("");

    const success = await deleteFine(fine.id);

    if (!success) {
      setMessage("Nepodařilo se smazat pokutu.");
      setDeletingFineId(null);
      return;
    }

    await reloadVisibleFines();
    setMessage("Pokuta byla smazána.");
    setDeletingFineId(null);
  };

  const handleCreateTemplate = async () => {
    if (!isAdmin) {
      setMessage("Pouze admin může vytvářet týmové pokuty.");
      return;
    }

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
    if (!isAdmin) {
      setMessage("Pouze admin může upravovat týmové pokuty.");
      return;
    }

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
    if (!isAdmin) {
      setMessage("Pouze admin může upravovat týmové pokuty.");
      return;
    }

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
    if (!isAdmin) {
      setMessage("Pouze admin může mazat týmové pokuty.");
      return;
    }

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

  const getPercentageColor = (value: number) => {
    if (value >= 70) return primaryColor;
    if (value >= 50) return "#f1c40f";
    return "#ff4d4d";
  };

  const glassCardStyle: React.CSSProperties = {
    borderRadius: "22px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.30)",
    backdropFilter: "blur(14px)",
  };

  const tabButton = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: "none",
    borderRadius: "14px",
    padding: "12px 10px",
    background: active
      ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
      : "rgba(255,255,255,0.06)",
    color: active ? "#071107" : "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? `0 10px 24px ${primaryColor}33` : "none",
  });

  const subTabButton = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: "none",
    borderRadius: "14px",
    padding: "12px 10px",
    background: active
      ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
      : "rgba(255,255,255,0.06)",
    color: active ? "#071107" : "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? `0 10px 24px ${primaryColor}33` : "none",
  });

  const sortButton = (active: boolean): React.CSSProperties => ({
    flex: 1,
    border: active
      ? `1px solid ${primaryColor}66`
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "999px",
    padding: "10px 12px",
    background: active ? `${primaryColor}22` : "rgba(255,255,255,0.06)",
    color: active ? primaryColor : "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  });

  const modernMainTabButton = (
    tab: MainTab,
    title: string,
    subtitle: string,
    icon: string
  ): React.CSSProperties => {
    const active = mainTab === tab;

    return {
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: "22px",
      padding: "14px 12px 14px 18px",
      minHeight: "82px",
      background: active
        ? "linear-gradient(135deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))"
        : "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))",
      color: "white",
      cursor: "pointer",
      textAlign: "left",
      boxShadow: active
        ? `0 14px 30px ${primaryColor}22`
        : "0 12px 28px rgba(0,0,0,0.24)",
    };
  };

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <button
          type="button"
          onClick={() => setMainTab("attendance")}
          style={modernMainTabButton("attendance", "DOCHÁZKA", "účast hráčů", "👤")}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "7px",
              background:
                mainTab === "attendance"
                  ? primaryColor
                  : "rgba(255,255,255,0.10)",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "14px",
                background:
                  mainTab === "attendance"
                    ? `${primaryColor}22`
                    : "rgba(255,255,255,0.06)",
                color: mainTab === "attendance" ? primaryColor : "#b8b8b8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                flexShrink: 0,
              }}
            >
              👤
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 950,
                  fontSize: "14px",
                  letterSpacing: "0.4px",
                  color: mainTab === "attendance" ? "#ffffff" : "#d7d7d7",
                }}
              >
                DOCHÁZKA
              </div>
              <div
                style={{
                  marginTop: "3px",
                  fontSize: "11px",
                  color: "#9b9b9b",
                  whiteSpace: "nowrap",
                }}
              >
                účast hráčů
              </div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMainTab("fines")}
          style={modernMainTabButton("fines", "POKUTY", "platby a tresty", "💳")}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "7px",
              background:
                mainTab === "fines" ? primaryColor : "rgba(255,255,255,0.10)",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "14px",
                background:
                  mainTab === "fines"
                    ? `${primaryColor}22`
                    : "rgba(255,255,255,0.06)",
                color: mainTab === "fines" ? primaryColor : "#b8b8b8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                flexShrink: 0,
              }}
            >
              💳
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 950,
                  fontSize: "14px",
                  letterSpacing: "0.4px",
                  color: mainTab === "fines" ? "#ffffff" : "#d7d7d7",
                }}
              >
                POKUTY
              </div>
              <div
                style={{
                  marginTop: "3px",
                  fontSize: "11px",
                  color: "#9b9b9b",
                  whiteSpace: "nowrap",
                }}
              >
                platby a tresty
              </div>
            </div>
          </div>
        </button>
      </div>

      <div
        style={{
          ...glassCardStyle,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setPeriodPanelOpen((prev) => !prev)}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            color: "white",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "14px",
                background: `${primaryColor}22`,
                color: primaryColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "21px",
              }}
            >
              📅
            </div>

            <div>
              <div
                style={{
                  color: "#9b9b9b",
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                }}
              >
                Období
              </div>

              <div style={{ fontSize: "18px", fontWeight: 950, marginTop: "3px" }}>
                {periodFilterMode === "all"
                  ? "Všechna období"
                  : effectivePeriod?.name ?? "Bez aktivního období"}
              </div>

              {effectivePeriod && (
                <div style={{ color: "#b8b8b8", fontSize: "12px", marginTop: "3px" }}>
                  {formatPeriodType(effectivePeriod.type)} • {effectivePeriod.start_date} až{" "}
                  {effectivePeriod.end_date}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              fontSize: "24px",
              color: "#b8b8b8",
              transform: periodPanelOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            ⌄
          </div>
        </button>

        {periodPanelOpen && (
          <div
            style={{
              display: "grid",
              gap: "10px",
              padding: "0 16px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button
                type="button"
                onClick={() => setPeriodFilterMode("active")}
                style={tabButton(periodFilterMode === "active")}
              >
                Aktivní
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
              Vybrat období
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

            {isAdmin && (
              <button
                type="button"
                onClick={() => setCreatePeriodOpen((prev) => !prev)}
                style={{
                  ...styles.primaryButton,
                  marginTop: 0,
                  background: "rgba(255,255,255,0.10)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "none",
                }}
              >
                {createPeriodOpen ? "Zavřít vytvoření období" : "Vytvořit nové období"}
              </button>
            )}

            {isAdmin && activePeriod && (
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
                {periodSaving ? "Uzavírám..." : "Uzavřít aktivní období"}
              </button>
            )}

            {isAdmin && createPeriodOpen && (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  paddingTop: "4px",
                }}
              >
                <input
                  type="text"
                  placeholder="Název období"
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
            )}
          </div>
        )}
      </div>

      {message && (
        <div
          style={{
            ...glassCardStyle,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      {mainTab === "attendance" && (
        <>
          <div
            style={{
              ...glassCardStyle,
              padding: "16px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ color: "#9b9b9b", fontSize: "11px", fontWeight: 900 }}>
                PRŮMĚR
              </div>
              <div
                style={{
                  color: getPercentageColor(attendanceAverage),
                  fontWeight: 950,
                  fontSize: "24px",
                  marginTop: "6px",
                }}
              >
                {attendanceAverage} %
              </div>
            </div>

            <div
              style={{
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                paddingLeft: "10px",
              }}
            >
              <div style={{ color: "#9b9b9b", fontSize: "11px", fontWeight: 900 }}>
                TRÉNINKY
              </div>
              <div style={{ color: "#ffffff", fontWeight: 950, fontSize: "24px", marginTop: "6px" }}>
                {filteredOlderTrainings.length}
              </div>
            </div>

            <div
              style={{
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                paddingLeft: "10px",
              }}
            >
              <div style={{ color: "#9b9b9b", fontSize: "11px", fontWeight: 900 }}>
                HRÁČI
              </div>
              <div style={{ color: "#ffffff", fontWeight: 950, fontSize: "24px", marginTop: "6px" }}>
                {activeAttendancePlayersCount}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div
              style={{
                fontSize: "13px",
                color: "#b8b8b8",
                fontWeight: 900,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              Pořadí hráčů
            </div>

            <div style={{ display: "flex", gap: "8px", flex: 1 }}>
              <button
                style={sortButton(attendanceSort === "highest")}
                onClick={() => setAttendanceSort("highest")}
              >
                Nejvyšší
              </button>

              <button
                style={sortButton(attendanceSort === "lowest")}
                onClick={() => setAttendanceSort("lowest")}
              >
                Nejnižší
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ color: "#b8b8b8" }}>Načítám docházku...</div>
          ) : filteredOlderTrainings.length === 0 ? (
            <div
              style={{
                ...glassCardStyle,
                padding: "16px",
                color: "#b8b8b8",
              }}
            >
              Zatím nejsou žádné starší tréninky v tomto období.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {sortedAttendanceStats.map((row, index) => {
                const percentageColor = getPercentageColor(row.percentage);

                return (
                  <div
                    key={row.player.id}
                    style={{
                      ...glassCardStyle,
                      padding: "12px",
                      display: "grid",
                      gap: "10px",
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
                            minWidth: "44px",
                            height: "44px",
                            borderRadius: "13px",
                            background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
                            color: "#071107",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 950,
                            fontSize: "16px",
                          }}
                        >
                          {index + 1}
                        </div>

                        <div>
                          <div style={{ fontWeight: 950, fontSize: "16px" }}>
                            {row.player.name}
                          </div>
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
                          minWidth: "64px",
                          textAlign: "right",
                          fontWeight: 950,
                          fontSize: "20px",
                          color: percentageColor,
                        }}
                      >
                        {row.percentage} %
                      </div>
                    </div>

                    <div
                      style={{
                        height: "7px",
                        borderRadius: "999px",
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                          height: "100%",
                          borderRadius: "999px",
                          background: percentageColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mainTab === "fines" && (
        <div style={{ display: "grid", gap: "12px" }}>
          <div
            style={{
              ...glassCardStyle,
              padding: "8px",
            }}
          >
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                style={subTabButton(fineTab === "awarded")}
                onClick={() => setFineTab("awarded")}
              >
                UDĚLENÉ
              </button>

              {isAdmin && (
                <button
                  style={subTabButton(fineTab === "templates")}
                  onClick={() => setFineTab("templates")}
                >
                  TÝMOVÉ
                </button>
              )}
            </div>
          </div>

          {fineTab === "awarded" && (
            <>
              <div
                style={{
                  ...glassCardStyle,
                  padding: "16px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ color: "#9b9b9b", fontSize: "11px", fontWeight: 900 }}>
                    CELKEM
                  </div>
                  <div style={{ color: "#ffffff", fontWeight: 950, fontSize: "18px", marginTop: "6px" }}>
                    {formatMoney(totalFineAmount)}
                  </div>
                </div>

                <div
                  style={{
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    paddingLeft: "10px",
                  }}
                >
                  <div style={{ color: "#9b9b9b", fontSize: "11px", fontWeight: 900 }}>
                    ZAPLACENO
                  </div>
                  <div style={{ color: "#9af0b6", fontWeight: 950, fontSize: "18px", marginTop: "6px" }}>
                    {formatMoney(paidFineAmount)}
                  </div>
                </div>

                <div
                  style={{
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    paddingLeft: "10px",
                  }}
                >
                  <div style={{ color: "#9b9b9b", fontSize: "11px", fontWeight: 900 }}>
                    DLUH
                  </div>
                  <div style={{ color: "#ffb0a8", fontWeight: 950, fontSize: "18px", marginTop: "6px" }}>
                    {formatMoney(unpaidFineAmount)}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div style={{ ...glassCardStyle, padding: "14px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      void loadTemplatesIfNeeded();

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
                            {disciplinePlayers
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
              )}

              {finesLoading ? (
                <div style={{ color: "#b8b8b8" }}>Načítám pokuty...</div>
              ) : !activePeriod && periodFilterMode !== "all" ? (
                <div style={{ ...glassCardStyle, padding: "16px", color: "#b8b8b8" }}>
                  Nejprve vytvoř aktivní období.
                </div>
              ) : fineSummary.length === 0 ? (
                <div style={{ ...glassCardStyle, padding: "16px", color: "#b8b8b8" }}>
                  Zatím žádné pokuty v tomto období.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {fineSummary.map((item, index) => {
                    const playerFines = (finesByPlayer.get(item.player_id) ?? [])
                      .slice()
                      .sort((a, b) => {
                        const dateCompare = normalizeDateToIso(
                          b.fine_date
                        ).localeCompare(normalizeDateToIso(a.fine_date));
                        if (dateCompare !== 0) return dateCompare;
                        return (b.created_at ?? "").localeCompare(
                          a.created_at ?? ""
                        );
                      });

                    const isExpanded = expandedPlayerId === item.player_id;

                    return (
                      <div
                        key={item.player_id}
                        style={{
                          ...glassCardStyle,
                          padding: "12px",
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
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                              }}
                            >
                              <div
                                style={{
                                  minWidth: "44px",
                                  height: "44px",
                                  borderRadius: "13px",
                                  background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
                                  color: "#071107",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 950,
                                }}
                              >
                                {index + 1}
                              </div>

                              <div>
                                <div style={{ fontWeight: 950, fontSize: "16px" }}>
                                  {item.playerName}
                                </div>
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
                                  fontSize: "16px",
                                  fontWeight: 950,
                                  color: "#ffffff",
                                }}
                              >
                                {formatMoney(item.total_amount)}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: item.unpaid_amount > 0 ? "#ffb0a8" : "#9af0b6",
                                  marginTop: "4px",
                                  fontWeight: 900,
                                }}
                              >
                                Dluh: {formatMoney(item.unpaid_amount)}
                              </div>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div
                            style={{
                              display: "grid",
                              gap: "8px",
                              marginTop: "12px",
                              paddingTop: "12px",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
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
                                    borderRadius: "14px",
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.05)",
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
                                      <div style={{ fontWeight: 900, fontSize: "14px" }}>
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
                                          fontWeight: 950,
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
                                          fontWeight: 900,
                                        }}
                                      >
                                        {fine.is_paid ? "ZAPLACENO" : "NEZAPLACENO"}
                                      </div>
                                    </div>
                                  </div>

                                  {isAdmin && (
                                    <div
                                      style={{
                                        display: "grid",
                                        gap: "8px",
                                        marginTop: "10px",
                                      }}
                                    >
                                      {!fine.is_paid && (
                                        <button
                                          type="button"
                                          onClick={() => void handleToggleFinePaid(fine)}
                                          style={{
                                            width: "100%",
                                            border: "none",
                                            borderRadius: "12px",
                                            padding: "10px 12px",
                                            background: primaryColor,
                                            color: "#071107",
                                            fontWeight: 950,
                                            cursor: "pointer",
                                          }}
                                        >
                                          Označit jako zaplacené
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteFine(fine)}
                                        disabled={deletingFineId === fine.id}
                                        style={{
                                          width: "100%",
                                          border: "none",
                                          borderRadius: "12px",
                                          padding: "10px 12px",
                                          background: "rgba(198,40,40,0.95)",
                                          color: "white",
                                          fontWeight: 950,
                                          cursor:
                                            deletingFineId === fine.id
                                              ? "default"
                                              : "pointer",
                                          opacity:
                                            deletingFineId === fine.id ? 0.7 : 1,
                                        }}
                                      >
                                        {deletingFineId === fine.id
                                          ? "Mažu..."
                                          : "Smazat pokutu"}
                                      </button>
                                    </div>
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
            </>
          )}

          {isAdmin && fineTab === "templates" && (
            <>
              <div style={{ ...glassCardStyle, padding: "16px" }}>
                <h2 style={{ ...styles.screenTitle, marginTop: 0 }}>
                  Přidat týmovou pokutu
                </h2>

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

              <div style={{ display: "grid", gap: "10px" }}>
                {fineTemplates.length === 0 ? (
                  <div style={{ ...glassCardStyle, padding: "16px", color: "#b8b8b8" }}>
                    Zatím žádné týmové pokuty.
                  </div>
                ) : (
                  fineTemplates.map((template) => {
                    const isEditing = editingTemplateId === template.id;

                    return (
                      <div key={template.id} style={{ ...glassCardStyle, padding: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 950 }}>{template.name}</div>
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
                                ? `${primaryColor}22`
                                : "rgba(255,255,255,0.10)",
                              color: template.is_active ? primaryColor : "#b8b8b8",
                              fontWeight: 950,
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
                              borderRadius: "12px",
                              padding: "10px 12px",
                              background: primaryColor,
                              color: "#071107",
                              fontWeight: 950,
                              cursor: "pointer",
                            }}
                          >
                            {isEditing ? "Zavřít" : "Upravit"}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteTemplate(template.id)}
                            style={{
                              flex: 1,
                              border: "none",
                              borderRadius: "12px",
                              padding: "10px 12px",
                              background: "rgba(198,40,40,0.95)",
                              color: "white",
                              fontWeight: 950,
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
                              onChange={(e) =>
                                setEditingTemplateName(e.target.value)
                              }
                              style={styles.input}
                            />

                            <input
                              type="number"
                              placeholder="Výchozí částka"
                              value={editingTemplateAmount}
                              onChange={(e) =>
                                setEditingTemplateAmount(e.target.value)
                              }
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
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}