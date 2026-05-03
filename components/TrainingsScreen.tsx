"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  createTraining,
  deleteTraining,
  getTrainingAttendance,
  getTrainingAttendanceByTrainingIds,
  getTrainingPresence,
  getTrainingPresenceByTrainingIds,
  getTrainingsByClubId,
  saveTrainingPresence,
  setTrainingAttendance,
  updateTraining,
  type TrainingAttendanceRow,
  type TrainingPresenceRow,
} from "@/lib/trainings";
import { getPeriodsByClubId, type Period } from "@/lib/periods";
import { createFine, findExistingPollFine } from "@/lib/fines";
import {
  ensureDefaultFineTemplates,
  type FineTemplateRow,
} from "@/lib/fineTemplates";
import { styles } from "@/styles/appStyles";

type TrainingTab = "planned" | "older";
type AttendanceStatus = "yes" | "maybe" | "no";

type Training = {
  id: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  time?: string | null;
  location?: string | null;
  note?: string | null;
  poll_enabled?: boolean;
};

type TrainingsScreenProps = {
  clubId: string;
  primaryColor?: string;
  isAdmin: boolean;
  openTrainingId?: string | null;
  onOpenTrainingHandled?: () => void;
};

function rowToPlayerId(row: TrainingAttendanceRow): string {
  return row.player_id;
}

function formatDisplayDate(date: string) {
  if (date.includes(".")) return date;

  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;

  return `${day}.${month}.${year}`;
}

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

function normalizeTimeValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function getTrainingTimeLabel(training: Training) {
  const start = normalizeTimeValue(training.start_time);
  const end = normalizeTimeValue(training.end_time);

  if (start && end) return `${start} - ${end}`;
  if (training.time) return training.time;
  if (start) return start;

  return "";
}

function isTrainingPlanned(training: Training) {
  const now = new Date();

  const datePart = normalizeDateToIso(training.date);
  const endTime =
    normalizeTimeValue(training.end_time) ||
    normalizeTimeValue(training.start_time) ||
    "23:59";

  const trainingDate = new Date(`${datePart}T${endTime}:00`);

  return trainingDate.getTime() >= now.getTime();
}

function isDateInsidePeriod(dateValue: string, period: Period | null) {
  if (!period) return false;

  const normalizedDate = normalizeDateToIso(dateValue);
  const normalizedStart = normalizeDateToIso(period.start_date);
  const normalizedEnd = normalizeDateToIso(period.end_date);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) {
    return false;
  }

  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
}

function normalizeTemplateName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export default function TrainingsScreen({
  clubId,
  primaryColor = "#22c55e",
  isAdmin,
  openTrainingId = null,
  onOpenTrainingHandled,
}: TrainingsScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, TrainingAttendanceRow[]>
  >({});
  const [presenceMap, setPresenceMap] = useState<
    Record<string, TrainingPresenceRow[]>
  >({});
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<TrainingTab>("planned");
  const [expandedTrainingId, setExpandedTrainingId] = useState<string | null>(
    null
  );
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(
    null
  );
  const [editingPresenceTrainingId, setEditingPresenceTrainingId] = useState<
    string | null
  >(null);
  const [presenceDraft, setPresenceDraft] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fineTemplates, setFineTemplates] = useState<FineTemplateRow[]>([]);
  const [awardingPollFineTrainingId, setAwardingPollFineTrainingId] = useState<
    string | null
  >(null);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setMessage("");

      const [
        loadedTrainings,
        loadedPlayers,
        loadedPeriods,
        loadedTemplates,
        {
          data: { user },
        },
      ] = await Promise.all([
        getTrainingsByClubId(clubId),
        getPlayersByClubId(clubId),
        getPeriodsByClubId(clubId),
        ensureDefaultFineTemplates(clubId),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      const trainingIds = (loadedTrainings ?? []).map((training) => training.id);

      const [nextAttendanceMap, nextPresenceMap] = await Promise.all([
        getTrainingAttendanceByTrainingIds(trainingIds),
        getTrainingPresenceByTrainingIds(trainingIds),
      ]);

      if (!active) return;

      const currentLinkedPlayer =
        loadedPlayers.find(
          (player) => player.profile_id === (user?.id ?? null)
        ) ?? null;

      setTrainings((loadedTrainings as Training[]) ?? []);
      setPlayers(loadedPlayers);
      setAttendanceMap(nextAttendanceMap);
      setPresenceMap(nextPresenceMap);
      setPeriods(loadedPeriods);
      setCurrentUserId(user?.id ?? null);
      setLinkedPlayer(currentLinkedPlayer);
      setFineTemplates(loadedTemplates);
      setLoading(false);
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [clubId]);

  useEffect(() => {
    if (loading) return;
    if (!openTrainingId) return;

    const targetTraining = trainings.find(
      (training) => training.id === openTrainingId
    );

    if (!targetTraining) return;

    setTab(isTrainingPlanned(targetTraining) ? "planned" : "older");
    setExpandedTrainingId(openTrainingId);
    onOpenTrainingHandled?.();

    window.setTimeout(() => {
      document
        .getElementById(`training-${openTrainingId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [loading, openTrainingId, trainings, onOpenTrainingHandled]);

  const pollFineTemplate = useMemo(() => {
    const allowedNames = new Set([
      "ankety",
      "nehlasovani",
      "nehlasovani na trening",
      "nehlasovani na trenink",
      "nehlasovani trenink",
      "nehlasovani trening",
    ]);

    return (
      fineTemplates.find(
        (item) =>
          item.is_active && allowedNames.has(normalizeTemplateName(item.name))
      ) ?? null
    );
  }, [fineTemplates]);

  const resetForm = () => {
    setEditingTrainingId(null);
    setDate("");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setNote("");
    setMessage("");
  };

  const plannedTrainings = useMemo(() => {
    return trainings
      .filter((training) => isTrainingPlanned(training))
      .sort((a, b) => {
        const aKey = `${normalizeDateToIso(a.date)} ${
          normalizeTimeValue(a.start_time) || "00:00"
        }`;
        const bKey = `${normalizeDateToIso(b.date)} ${
          normalizeTimeValue(b.start_time) || "00:00"
        }`;
        return aKey.localeCompare(bKey);
      });
  }, [trainings]);

  const olderTrainings = useMemo(() => {
    return trainings
      .filter((training) => !isTrainingPlanned(training))
      .sort((a, b) => {
        const aKey = `${normalizeDateToIso(a.date)} ${
          normalizeTimeValue(a.start_time) || "00:00"
        }`;
        const bKey = `${normalizeDateToIso(b.date)} ${
          normalizeTimeValue(b.start_time) || "00:00"
        }`;
        return bKey.localeCompare(aKey);
      });
  }, [trainings]);

  const visibleTrainings = tab === "planned" ? plannedTrainings : olderTrainings;

  const getPlayerName = (playerId: string) => {
    return (
      players.find((player) => player.id === playerId)?.name ?? "Neznámý hráč"
    );
  };

  const getTrainingAttendanceRows = (trainingId: string) => {
    return attendanceMap[trainingId] ?? [];
  };

  const getTrainingPresenceRows = (trainingId: string) => {
    return presenceMap[trainingId] ?? [];
  };

  const getTrainingSummary = (trainingId: string) => {
    const rows = getTrainingAttendanceRows(trainingId);
    const yesCount = rows.filter((row) => row.status === "yes").length;
    const maybeCount = rows.filter((row) => row.status === "maybe").length;
    const noCount = rows.filter((row) => row.status === "no").length;

    const votedPlayerIds = new Set(
      rows
        .filter(
          (row) =>
            row.status === "yes" ||
            row.status === "maybe" ||
            row.status === "no"
        )
        .map((row) => row.player_id)
    );

    const notVotedCount = players.filter(
      (player) => !votedPlayerIds.has(player.id)
    ).length;

    return {
      total: votedPlayerIds.size,
      yesCount,
      maybeCount,
      noCount,
      notVotedCount,
    };
  };

  const getNonVotedPlayers = (trainingId: string) => {
    const rows = getTrainingAttendanceRows(trainingId);
    const votedPlayerIds = new Set(
      rows
        .filter(
          (row) =>
            row.status === "yes" ||
            row.status === "maybe" ||
            row.status === "no"
        )
        .map((row) => row.player_id)
    );

    return players
      .filter((player) => !votedPlayerIds.has(player.id))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  };

  const getPresenceSummary = (trainingId: string) => {
    const rows = getTrainingPresenceRows(trainingId);
    return rows.filter((row) => row.present).length;
  };

  const getMyAttendanceStatus = (
    trainingId: string
  ): AttendanceStatus | null => {
    if (!linkedPlayer) return null;

    const row = getTrainingAttendanceRows(trainingId).find(
      (item) => item.player_id === linkedPlayer.id
    );

    return (row?.status as AttendanceStatus | undefined) ?? null;
  };

  const findPeriodForTraining = (trainingDate: string) => {
    const matchingPeriods = periods.filter((period) =>
      isDateInsidePeriod(trainingDate, period)
    );

    if (matchingPeriods.length === 0) {
      return null;
    }

    return matchingPeriods.sort((a, b) =>
      normalizeDateToIso(b.start_date).localeCompare(
        normalizeDateToIso(a.start_date)
      )
    )[0];
  };

  const handleCopyTrainingLink = async (trainingId: string) => {
    if (typeof window === "undefined") return;

    const url = `${window.location.origin}${window.location.pathname}?open=training&id=${trainingId}`;

    try {
      await navigator.clipboard.writeText(url);
      setMessage("Odkaz na anketu tréninku byl zkopírován.");
    } catch {
      setMessage(url);
    }
  };

  const handleCreateTraining = async () => {
    if (!isAdmin) {
      setMessage("Pouze admin může vytvářet trénink.");
      return;
    }

    if (!currentUserId) {
      setMessage("Chybí přihlášený uživatel.");
      return;
    }

    if (!date) {
      setMessage("Vyber datum tréninku.");
      return;
    }

    if (!startTime) {
      setMessage("Vyber čas začátku.");
      return;
    }

    if (!endTime) {
      setMessage("Vyber čas konce.");
      return;
    }

    if (endTime <= startTime) {
      setMessage("Čas konce musí být později než čas začátku.");
      return;
    }

    setSaving(true);
    setMessage("");

    const created = await createTraining({
      clubId,
      userId: currentUserId,
      training: {
        date,
        start_time: startTime,
        end_time: endTime,
        location: location || null,
        note: note || null,
        poll_enabled: true,
      },
    });

    if (!created) {
      setMessage("Nepodařilo se vytvořit trénink.");
      setSaving(false);
      return;
    }

    setTrainings((prev) => [...prev, created as Training]);
    setAttendanceMap((prev) => ({
      ...prev,
      [created.id]: [],
    }));
    setPresenceMap((prev) => ({
      ...prev,
      [created.id]: [],
    }));
    resetForm();
    setShowForm(false);
    setMessage("Trénink byl vytvořen.");
    setSaving(false);
  };

  const handleStartEdit = (training: Training) => {
    if (!isAdmin) {
      setMessage("Pouze admin může upravovat trénink.");
      return;
    }

    setShowForm(true);
    setEditingTrainingId(training.id);
    setDate(normalizeDateToIso(training.date));
    setStartTime(normalizeTimeValue(training.start_time));
    setEndTime(normalizeTimeValue(training.end_time));
    setLocation(training.location ?? "");
    setNote(training.note ?? "");
    setMessage("");
  };

  const handleUpdateTraining = async () => {
    if (!isAdmin) {
      setMessage("Pouze admin může upravovat trénink.");
      return;
    }

    if (!editingTrainingId) return;

    if (!date) {
      setMessage("Vyber datum tréninku.");
      return;
    }

    if (!startTime) {
      setMessage("Vyber čas začátku.");
      return;
    }

    if (!endTime) {
      setMessage("Vyber čas konce.");
      return;
    }

    if (endTime <= startTime) {
      setMessage("Čas konce musí být později než čas začátku.");
      return;
    }

    setSaving(true);
    setMessage("");

    const updated = await updateTraining({
      trainingId: editingTrainingId,
      training: {
        date,
        start_time: startTime,
        end_time: endTime,
        location: location || null,
        note: note || null,
        poll_enabled: true,
      },
    });

    if (!updated) {
      setMessage("Nepodařilo se upravit trénink.");
      setSaving(false);
      return;
    }

    setTrainings((prev) =>
      prev.map((item) =>
        item.id === editingTrainingId ? (updated as Training) : item
      )
    );
    resetForm();
    setShowForm(false);
    setMessage("Trénink byl upraven.");
    setSaving(false);
  };

  const handleDeleteTraining = async (trainingId: string) => {
    if (!isAdmin) {
      setMessage("Pouze admin může mazat trénink.");
      return;
    }

    const confirmed = window.confirm("Opravdu chceš smazat tento trénink?");

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const success = await deleteTraining(trainingId);

    if (!success) {
      setMessage("Nepodařilo se smazat trénink.");
      setSaving(false);
      return;
    }

    setTrainings((prev) => prev.filter((item) => item.id !== trainingId));
    setAttendanceMap((prev) => {
      const next = { ...prev };
      delete next[trainingId];
      return next;
    });
    setPresenceMap((prev) => {
      const next = { ...prev };
      delete next[trainingId];
      return next;
    });

    if (expandedTrainingId === trainingId) {
      setExpandedTrainingId(null);
    }

    if (editingTrainingId === trainingId) {
      resetForm();
      setShowForm(false);
    }

    if (editingPresenceTrainingId === trainingId) {
      setEditingPresenceTrainingId(null);
      setPresenceDraft([]);
    }

    setMessage("Trénink byl smazán.");
    setSaving(false);
  };

  const handleVote = async (trainingId: string, status: AttendanceStatus) => {
    if (!linkedPlayer) {
      setMessage("Nejdřív je potřeba propojit účet s hráčem.");
      return;
    }

    setSaving(true);
    setMessage("");

    const success = await setTrainingAttendance({
      trainingId,
      playerId: linkedPlayer.id,
      status,
    });

    if (!success) {
      setMessage("Nepodařilo se uložit hlasování.");
      setSaving(false);
      return;
    }

    const rows = await getTrainingAttendance(trainingId);

    setAttendanceMap((prev) => ({
      ...prev,
      [trainingId]: rows ?? [],
    }));

    setMessage(
      status === "yes"
        ? "Potvrdil jsi účast na tréninku."
        : status === "maybe"
        ? "Označil jsi účast jako možná."
        : "Označil jsi, že nepřijdeš."
    );
    setSaving(false);
  };

  const handleStartPresenceEdit = (trainingId: string) => {
    if (!isAdmin) {
      setMessage("Pouze admin může upravovat docházku.");
      return;
    }

    const existingPresence = getTrainingPresenceRows(trainingId)
      .filter((row) => row.present)
      .map((row) => row.player_id);

    if (existingPresence.length > 0) {
      setPresenceDraft(existingPresence);
      setEditingPresenceTrainingId(trainingId);
      setMessage("");
      return;
    }

    const defaultFromAttendance = getTrainingAttendanceRows(trainingId)
      .filter((row) => row.status === "yes")
      .map((row) => row.player_id);

    setPresenceDraft(defaultFromAttendance);
    setEditingPresenceTrainingId(trainingId);
    setMessage("");
  };

  const togglePresenceDraftPlayer = (playerId: string) => {
    setPresenceDraft((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleSavePresence = async (trainingId: string) => {
    if (!isAdmin) {
      setMessage("Pouze admin může ukládat docházku.");
      return;
    }

    setSaving(true);
    setMessage("");

    const success = await saveTrainingPresence({
      trainingId,
      playerIds: presenceDraft,
    });

    if (!success) {
      setMessage("Nepodařilo se uložit reálnou docházku.");
      setSaving(false);
      return;
    }

    const rows = await getTrainingPresence(trainingId);

    setPresenceMap((prev) => ({
      ...prev,
      [trainingId]: rows ?? [],
    }));

    setEditingPresenceTrainingId(null);
    setPresenceDraft([]);
    setMessage("Reálná docházka byla uložena.");
    setSaving(false);
  };

  const handleAwardPollFine = async (training: Training) => {
    if (!isAdmin) {
      setMessage("Pouze admin může udělovat pokuty.");
      return;
    }

    const template = pollFineTemplate;

    if (!template) {
      setMessage('Chybí aktivní týmová pokuta "Ankety" / "Nehlasování".');
      return;
    }

    const trainingPeriod = findPeriodForTraining(training.date);

    if (!trainingPeriod) {
      setMessage("K tomuto tréninku se nepodařilo najít odpovídající období.");
      return;
    }

    const nonVotedPlayers = getNonVotedPlayers(training.id);

    if (nonVotedPlayers.length === 0) {
      setMessage("Nikdo nezůstal bez hlasování.");
      return;
    }

    setAwardingPollFineTrainingId(training.id);
    setMessage("");

    let createdCount = 0;

    for (const player of nonVotedPlayers) {
      try {
        const existing = await findExistingPollFine({
          periodId: trainingPeriod.id,
          playerId: player.id,
          trainingId: training.id,
        });

        if (existing) continue;

        const created = await createFine({
          clubId,
          periodId: trainingPeriod.id,
          playerId: player.id,
          amount: Number(template.default_amount),
          reason: template.name,
          note: `training:${training.id}`,
          fineDate: normalizeDateToIso(training.date),
          createdBy: currentUserId,
        });

        if (created) {
          createdCount += 1;
        } else {
          console.error("Nepodařilo se vytvořit pokutu za nehlasování.", {
            trainingId: training.id,
            playerId: player.id,
            periodId: trainingPeriod.id,
          });
        }
      } catch (error) {
        console.error("Chyba při vytváření pokuty za nehlasování:", {
          error,
          trainingId: training.id,
          playerId: player.id,
          periodId: trainingPeriod.id,
        });
      }
    }

    setAwardingPollFineTrainingId(null);

    if (createdCount === 0) {
      setMessage("Žádné nové pokuty nebyly vytvořeny. Možná už existují.");
      return;
    }

    setMessage(`Pokuta za nehlasování byla udělena ${createdCount} hráčům.`);
  };

  const glassCardStyle: React.CSSProperties = {
    borderRadius: "22px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.30)",
    backdropFilter: "blur(14px)",
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    marginTop: 0,
    background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
    color: "#071107",
    border: "none",
    boxShadow: `0 12px 28px ${primaryColor}33`,
    fontWeight: 950,
  };

  const softButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    marginTop: 0,
    background: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "none",
    fontWeight: 900,
  };

  const dangerButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    marginTop: 0,
    background: "rgba(198,40,40,0.95)",
    color: "#ffffff",
    border: "none",
    boxShadow: "none",
    fontWeight: 900,
  };

  const tabButtonBaseStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    borderRadius: "14px",
    padding: "12px 10px",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
  };

  const getTabButtonStyle = (active: boolean): React.CSSProperties => ({
    ...tabButtonBaseStyle,
    background: active
      ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
      : "rgba(255,255,255,0.07)",
    color: active ? "#071107" : "#ffffff",
    boxShadow: active ? `0 10px 24px ${primaryColor}33` : "none",
  });

  const summaryPillStyle = (
    background: string,
    color: string,
    border: string
  ): React.CSSProperties => ({
    padding: "6px 9px",
    borderRadius: "999px",
    background,
    border,
    color,
    fontSize: "11px",
    fontWeight: 950,
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      {isAdmin && (
        <div
          style={{
            ...glassCardStyle,
            padding: "14px",
          }}
        >
          <button
            onClick={() => {
              if (editingTrainingId) {
                resetForm();
              }
              setShowForm((prev) => !prev);
            }}
            style={primaryButtonStyle}
          >
            {showForm ? "Zavřít formulář" : "＋ Vytvořit trénink"}
          </button>

          {(showForm || editingTrainingId) && (
            <div
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "14px",
                paddingTop: "14px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "#b8b8b8",
                  fontWeight: 950,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                }}
              >
                {editingTrainingId ? "Upravit trénink" : "Nový trénink"}
              </div>

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={styles.input}
              />

              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />

                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />
              </div>

              <input
                type="text"
                placeholder="Místo"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={styles.input}
              />

              <textarea
                placeholder="Poznámka k tréninku"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  ...styles.input,
                  minHeight: "90px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />

              {editingTrainingId ? (
                <>
                  <button
                    type="button"
                    style={{
                      ...primaryButtonStyle,
                      opacity: saving ? 0.7 : 1,
                    }}
                    onClick={handleUpdateTraining}
                    disabled={saving}
                  >
                    {saving ? "Ukládám..." : "Uložit změny"}
                  </button>

                  <button
                    type="button"
                    style={softButtonStyle}
                    onClick={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                    disabled={saving}
                  >
                    Zrušit úpravu
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  style={{
                    ...primaryButtonStyle,
                    opacity: saving ? 0.7 : 1,
                  }}
                  onClick={handleCreateTraining}
                  disabled={saving}
                >
                  {saving ? "Ukládám..." : "Vytvořit trénink"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          ...glassCardStyle,
          padding: "8px",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            style={getTabButtonStyle(tab === "planned")}
            onClick={() => setTab("planned")}
          >
            PLÁNOVANÉ
          </button>

          <button
            type="button"
            style={getTabButtonStyle(tab === "older")}
            onClick={() => setTab("older")}
          >
            STARŠÍ
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            ...glassCardStyle,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
            lineHeight: 1.45,
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div
          style={{
            ...glassCardStyle,
            padding: "16px",
            color: "#b8b8b8",
          }}
        >
          Načítám tréninky...
        </div>
      ) : visibleTrainings.length === 0 ? (
        <div
          style={{
            ...glassCardStyle,
            padding: "16px",
            color: "#b8b8b8",
          }}
        >
          {tab === "planned"
            ? "Zatím žádné plánované tréninky."
            : "Zatím žádné starší tréninky."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {visibleTrainings.map((training) => {
            const summary = getTrainingSummary(training.id);
            const presenceCount = getPresenceSummary(training.id);
            const myStatus = getMyAttendanceStatus(training.id);
            const attendanceRows = getTrainingAttendanceRows(training.id);
            const presenceRows = getTrainingPresenceRows(training.id);
            const nonVotedPlayers = getNonVotedPlayers(training.id);

            const yesRows = attendanceRows
              .filter((row) => row.status === "yes")
              .sort((a, b) =>
                getPlayerName(rowToPlayerId(a)).localeCompare(
                  getPlayerName(rowToPlayerId(b)),
                  "cs"
                )
              );

            const maybeRows = attendanceRows
              .filter((row) => row.status === "maybe")
              .sort((a, b) =>
                getPlayerName(rowToPlayerId(a)).localeCompare(
                  getPlayerName(rowToPlayerId(b)),
                  "cs"
                )
              );

            const noRows = attendanceRows
              .filter((row) => row.status === "no")
              .sort((a, b) =>
                getPlayerName(rowToPlayerId(a)).localeCompare(
                  getPlayerName(rowToPlayerId(b)),
                  "cs"
                )
              );

            const presentRows = presenceRows
              .filter((row) => row.present)
              .sort((a, b) =>
                getPlayerName(a.player_id).localeCompare(
                  getPlayerName(b.player_id),
                  "cs"
                )
              );

            const isExpanded = expandedTrainingId === training.id;
            const isEditingPresence = editingPresenceTrainingId === training.id;

            const canShowPollFineButton =
              isAdmin &&
              !isTrainingPlanned(training) &&
              nonVotedPlayers.length > 0;

            return (
              <div
                id={`training-${training.id}`}
                key={training.id}
                style={{
                  ...glassCardStyle,
                  position: "relative",
                  overflow: "hidden",
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: "5px",
                    background: primaryColor,
                    boxShadow: `0 0 18px ${primaryColor}66`,
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    setExpandedTrainingId((prev) =>
                      prev === training.id ? null : training.id
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
                      display: "grid",
                      gap: "12px",
                      paddingLeft: "4px",
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
                            color: "#9b9b9b",
                            fontSize: "11px",
                            fontWeight: 950,
                            letterSpacing: "0.8px",
                            textTransform: "uppercase",
                          }}
                        >
                          {isTrainingPlanned(training)
                            ? "Plánovaný trénink"
                            : "Starší trénink"}
                        </div>

                        <div
                          style={{
                            fontWeight: 950,
                            fontSize: "18px",
                            marginTop: "5px",
                          }}
                        >
                          Trénink
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "7px",
                            alignItems: "center",
                            fontSize: "13px",
                            color: "#b8b8b8",
                            fontWeight: 700,
                            marginTop: "8px",
                          }}
                        >
                          <span style={{ color: primaryColor }}>📅</span>
                          <span>{formatDisplayDate(training.date)}</span>

                          {getTrainingTimeLabel(training) && (
                            <>
                              <span>•</span>
                              <span>🕒 {getTrainingTimeLabel(training)}</span>
                            </>
                          )}
                        </div>

                        {training.location && (
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#b8b8b8",
                              marginTop: "8px",
                              wordBreak: "break-word",
                            }}
                          >
                            📍 {training.location}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: "22px",
                          color: "#b8b8b8",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s ease",
                          lineHeight: 1,
                        }}
                      >
                        ⌄
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "7px",
                      }}
                    >
                      <div
                        style={summaryPillStyle(
                          "rgba(255,255,255,0.08)",
                          "#d4d4d4",
                          "1px solid rgba(255,255,255,0.10)"
                        )}
                      >
                        Hlasovalo: {summary.total}
                      </div>

                      <div
                        style={summaryPillStyle(
                          "rgba(46, 204, 113, 0.16)",
                          "#9af0b6",
                          "1px solid rgba(46, 204, 113, 0.24)"
                        )}
                      >
                        BUDU: {summary.yesCount}
                      </div>

                      <div
                        style={summaryPillStyle(
                          "rgba(52, 152, 219, 0.16)",
                          "#9fd3ff",
                          "1px solid rgba(52, 152, 219, 0.24)"
                        )}
                      >
                        MOŽNÁ: {summary.maybeCount}
                      </div>

                      <div
                        style={summaryPillStyle(
                          "rgba(231, 76, 60, 0.16)",
                          "#ffb0a8",
                          "1px solid rgba(231, 76, 60, 0.24)"
                        )}
                      >
                        NEBUDU: {summary.noCount}
                      </div>

                      <div
                        style={summaryPillStyle(
                          "rgba(255, 193, 7, 0.16)",
                          "#ffd97a",
                          "1px solid rgba(255, 193, 7, 0.24)"
                        )}
                      >
                        NEHLASOVALO: {summary.notVotedCount}
                      </div>

                      {!isTrainingPlanned(training) && (
                        <div
                          style={summaryPillStyle(
                            `${primaryColor}22`,
                            primaryColor,
                            `1px solid ${primaryColor}44`
                          )}
                        >
                          ÚČAST: {presenceCount}
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div
                    style={{
                      display: "grid",
                      gap: "12px",
                      marginTop: "14px",
                      paddingTop: "14px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {training.note && (
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "16px",
                          background: "rgba(255,255,255,0.04)",
                          color: "#d9d9d9",
                          fontSize: "14px",
                          lineHeight: 1.5,
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {training.note}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleCopyTrainingLink(training.id)}
                      style={softButtonStyle}
                    >
                      Kopírovat odkaz na anketu
                    </button>

                    {isTrainingPlanned(training) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => void handleVote(training.id, "yes")}
                          disabled={saving}
                          style={{
                            border: "none",
                            borderRadius: "14px",
                            padding: "12px 8px",
                            background:
                              myStatus === "yes"
                                ? "rgba(46, 204, 113, 0.95)"
                                : "rgba(46, 204, 113, 0.18)",
                            color: "white",
                            fontWeight: 950,
                            cursor: saving ? "default" : "pointer",
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          BUDU
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleVote(training.id, "maybe")}
                          disabled={saving}
                          style={{
                            border: "none",
                            borderRadius: "14px",
                            padding: "12px 8px",
                            background:
                              myStatus === "maybe"
                                ? "rgba(52, 152, 219, 0.95)"
                                : "rgba(52, 152, 219, 0.18)",
                            color: "white",
                            fontWeight: 950,
                            cursor: saving ? "default" : "pointer",
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          MOŽNÁ
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleVote(training.id, "no")}
                          disabled={saving}
                          style={{
                            border: "none",
                            borderRadius: "14px",
                            padding: "12px 8px",
                            background:
                              myStatus === "no"
                                ? "rgba(231, 76, 60, 0.95)"
                                : "rgba(231, 76, 60, 0.18)",
                            color: "white",
                            fontWeight: 950,
                            cursor: saving ? "default" : "pointer",
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          NEBUDU
                        </button>
                      </div>
                    )}

                    {isAdmin && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(training)}
                          disabled={saving}
                          style={{
                            flex: 1,
                            ...primaryButtonStyle,
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          UPRAVIT
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeleteTraining(training.id)}
                          disabled={saving}
                          style={{
                            flex: 1,
                            ...dangerButtonStyle,
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          SMAZAT
                        </button>
                      </div>
                    )}

                    {!isTrainingPlanned(training) && isAdmin && (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {canShowPollFineButton && (
                          <button
                            type="button"
                            onClick={() => void handleAwardPollFine(training)}
                            disabled={awardingPollFineTrainingId === training.id}
                            style={{
                              ...styles.primaryButton,
                              marginTop: 0,
                              background: "rgba(255, 193, 7, 0.95)",
                              border: "none",
                              color: "#111111",
                              fontWeight: 950,
                              opacity:
                                awardingPollFineTrainingId === training.id
                                  ? 0.7
                                  : 1,
                            }}
                          >
                            {awardingPollFineTrainingId === training.id
                              ? "Uděluji pokuty..."
                              : "POKUTA ZA NEHLASOVÁNÍ"}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartPresenceEdit(training.id)}
                          disabled={saving}
                          style={{
                            ...styles.primaryButton,
                            marginTop: 0,
                            background: "rgba(52, 152, 219, 0.95)",
                            border: "none",
                            fontWeight: 950,
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          {isEditingPresence
                            ? "Upravuji docházku"
                            : "Upravit docházku"}
                        </button>

                        {isEditingPresence && (
                          <div
                            style={{
                              display: "grid",
                              gap: "10px",
                              padding: "12px",
                              borderRadius: "16px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 950,
                                fontSize: "14px",
                              }}
                            >
                              Kdo se zúčastnil
                            </div>

                            <div
                              style={{
                                fontSize: "13px",
                                color: "#cfcfcf",
                                lineHeight: 1.5,
                              }}
                            >
                              Výchozí stav se vezme z hráčů, kteří dali BUDU.
                              Můžeš kohokoliv odebrat nebo přidat.
                            </div>

                            <div style={{ display: "grid", gap: "8px" }}>
                              {players
                                .slice()
                                .sort((a, b) => a.number - b.number)
                                .map((player) => {
                                  const checked = presenceDraft.includes(
                                    player.id
                                  );

                                  return (
                                    <label
                                      key={player.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        padding: "10px 12px",
                                        borderRadius: "14px",
                                        background: checked
                                          ? `${primaryColor}22`
                                          : "rgba(255,255,255,0.03)",
                                        border: checked
                                          ? `1px solid ${primaryColor}44`
                                          : "1px solid rgba(255,255,255,0.05)",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          togglePresenceDraftPlayer(player.id)
                                        }
                                      />

                                      <div
                                        style={{
                                          minWidth: "34px",
                                          height: "34px",
                                          borderRadius: "10px",
                                          background: checked
                                            ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
                                            : "rgba(255,255,255,0.10)",
                                          color: checked ? "#071107" : "white",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: 950,
                                          fontSize: "13px",
                                        }}
                                      >
                                        {player.number}
                                      </div>

                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 950 }}>
                                          {player.name}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            color: "#b8b8b8",
                                          }}
                                        >
                                          {player.position}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                            </div>

                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                onClick={() => void handleSavePresence(training.id)}
                                disabled={saving}
                                style={{
                                  flex: 1,
                                  ...primaryButtonStyle,
                                  opacity: saving ? 0.7 : 1,
                                }}
                              >
                                {saving ? "Ukládám..." : "Potvrdit docházku"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPresenceTrainingId(null);
                                  setPresenceDraft([]);
                                }}
                                disabled={saving}
                                style={{
                                  flex: 1,
                                  ...softButtonStyle,
                                }}
                              >
                                Zrušit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: "grid", gap: "10px" }}>
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "16px",
                          background: "rgba(46, 204, 113, 0.10)",
                          border: "1px solid rgba(46, 204, 113, 0.20)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 950,
                            color: "#9af0b6",
                            marginBottom: "8px",
                          }}
                        >
                          BUDU ({yesRows.length})
                        </div>

                        {yesRows.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                            Zatím nikdo.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "6px" }}>
                            {yesRows.map((row) => (
                              <div
                                key={`${training.id}-yes-${rowToPlayerId(row)}`}
                                style={{ fontSize: "13px", color: "white" }}
                              >
                                {getPlayerName(rowToPlayerId(row))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "16px",
                          background: "rgba(52, 152, 219, 0.10)",
                          border: "1px solid rgba(52, 152, 219, 0.20)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 950,
                            color: "#9fd3ff",
                            marginBottom: "8px",
                          }}
                        >
                          MOŽNÁ ({maybeRows.length})
                        </div>

                        {maybeRows.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                            Zatím nikdo.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "6px" }}>
                            {maybeRows.map((row) => (
                              <div
                                key={`${training.id}-maybe-${rowToPlayerId(row)}`}
                                style={{ fontSize: "13px", color: "white" }}
                              >
                                {getPlayerName(rowToPlayerId(row))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "16px",
                          background: "rgba(231, 76, 60, 0.10)",
                          border: "1px solid rgba(231, 76, 60, 0.20)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 950,
                            color: "#ffb0a8",
                            marginBottom: "8px",
                          }}
                        >
                          NEBUDU ({noRows.length})
                        </div>

                        {noRows.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                            Zatím nikdo.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "6px" }}>
                            {noRows.map((row) => (
                              <div
                                key={`${training.id}-no-${rowToPlayerId(row)}`}
                                style={{ fontSize: "13px", color: "white" }}
                              >
                                {getPlayerName(rowToPlayerId(row))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "16px",
                          background: "rgba(255, 193, 7, 0.10)",
                          border: "1px solid rgba(255, 193, 7, 0.20)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 950,
                            color: "#ffd97a",
                            marginBottom: "8px",
                          }}
                        >
                          NEHLASOVALO ({nonVotedPlayers.length})
                        </div>

                        {nonVotedPlayers.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                            Všichni hlasovali.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "6px" }}>
                            {nonVotedPlayers.map((player) => (
                              <div
                                key={`${training.id}-not-voted-${player.id}`}
                                style={{ fontSize: "13px", color: "white" }}
                              >
                                {player.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {!isTrainingPlanned(training) && (
                        <div
                          style={{
                            padding: "12px",
                            borderRadius: "16px",
                            background: `${primaryColor}14`,
                            border: `1px solid ${primaryColor}33`,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 950,
                              color: primaryColor,
                              marginBottom: "8px",
                            }}
                          >
                            ZÚČASTNILI SE ({presentRows.length})
                          </div>

                          {presentRows.length === 0 ? (
                            <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                              Zatím nepotvrzeno.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: "6px" }}>
                              {presentRows.map((row) => (
                                <div
                                  key={`${training.id}-present-${row.player_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPlayerName(row.player_id)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}