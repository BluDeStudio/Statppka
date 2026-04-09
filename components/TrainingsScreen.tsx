"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getPlayersByClubId, type Player } from "@/lib/players";
import {
  createTraining,
  deleteTraining,
  getTrainingAttendance,
  getTrainingPresence,
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
type AttendanceStatus = "yes" | "no";

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
};

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
  primaryColor = "#888888",
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

      const nextAttendanceMap: Record<string, TrainingAttendanceRow[]> = {};
      const nextPresenceMap: Record<string, TrainingPresenceRow[]> = {};

      for (const training of loadedTrainings ?? []) {
        const [attendanceRows, presenceRows] = await Promise.all([
          getTrainingAttendance(training.id),
          getTrainingPresence(training.id),
        ]);

        nextAttendanceMap[training.id] = attendanceRows ?? [];
        nextPresenceMap[training.id] = presenceRows ?? [];
      }

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
    const noCount = rows.filter((row) => row.status === "no").length;
    const votedPlayerIds = new Set(
      rows
        .filter((row) => row.status === "yes" || row.status === "no")
        .map((row) => row.player_id)
    );
    const notVotedCount = players.filter(
      (player) => !votedPlayerIds.has(player.id)
    ).length;

    return {
      total: rows.length,
      yesCount,
      noCount,
      notVotedCount,
    };
  };

  const getNonVotedPlayers = (trainingId: string) => {
    const rows = getTrainingAttendanceRows(trainingId);
    const votedPlayerIds = new Set(
      rows
        .filter((row) => row.status === "yes" || row.status === "no")
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

    return row?.status ?? null;
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

  const handleCreateTraining = async () => {
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
        : "Označil jsi, že nepřijdeš."
    );
    setSaving(false);
  };

  const handleStartPresenceEdit = (trainingId: string) => {
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
    const template = pollFineTemplate;

    if (!template) {
      setMessage(
        'Chybí aktivní týmová pokuta "Ankety" / "Nehlasování".'
      );
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

  const tabButtonBaseStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  };

  const getTabButtonStyle = (active: boolean): React.CSSProperties => ({
    ...tabButtonBaseStyle,
    background: active ? primaryColor : "rgba(255,255,255,0.08)",
  });

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={styles.card}>
        <button
          onClick={() => {
            if (editingTrainingId) {
              resetForm();
            }
            setShowForm((prev) => !prev);
          }}
          style={{
            ...styles.primaryButton,
            marginTop: 0,
            background: primaryColor,
          }}
        >
          {showForm ? "Zavřít formulář" : "Vytvořit trénink"}
        </button>

        {(showForm || editingTrainingId) && (
          <>
            <h2 style={{ ...styles.screenTitle, marginTop: "16px" }}>
              {editingTrainingId ? "Upravit trénink" : "Nový trénink"}
            </h2>

            <div style={{ display: "grid", gap: "10px" }}>
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
                      ...styles.primaryButton,
                      marginTop: 0,
                      background: primaryColor,
                      opacity: saving ? 0.7 : 1,
                    }}
                    onClick={handleUpdateTraining}
                    disabled={saving}
                  >
                    {saving ? "Ukládám..." : "Uložit změny"}
                  </button>

                  <button
                    type="button"
                    style={{
                      ...styles.primaryButton,
                      marginTop: 0,
                      background: "rgba(255,255,255,0.12)",
                    }}
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
                    ...styles.primaryButton,
                    marginTop: 0,
                    background: primaryColor,
                    opacity: saving ? 0.7 : 1,
                  }}
                  onClick={handleCreateTraining}
                  disabled={saving}
                >
                  {saving ? "Ukládám..." : "Vytvořit trénink"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.screenTitle}>Tréninky</h2>

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
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

        {loading ? (
          <div style={{ color: "#b8b8b8" }}>Načítám tréninky...</div>
        ) : visibleTrainings.length === 0 ? (
          <div style={{ color: "#b8b8b8" }}>
            {tab === "planned"
              ? "Zatím žádné plánované tréninky."
              : "Zatím žádné starší tréninky."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
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
                  getPlayerName(a.player_id).localeCompare(
                    getPlayerName(b.player_id),
                    "cs"
                  )
                );

              const noRows = attendanceRows
                .filter((row) => row.status === "no")
                .sort((a, b) =>
                  getPlayerName(a.player_id).localeCompare(
                    getPlayerName(b.player_id),
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
              const isEditingPresence =
                editingPresenceTrainingId === training.id;

              const canShowPollFineButton =
                !isTrainingPlanned(training) && nonVotedPlayers.length > 0;

              return (
                <div
                  key={training.id}
                  style={{
                    padding: "12px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
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
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                          Trénink
                        </div>

                        <div
                          style={{
                            fontSize: "13px",
                            color: "#d9d9d9",
                            marginTop: "6px",
                          }}
                        >
                          {formatDisplayDate(training.date)}
                          {getTrainingTimeLabel(training)
                            ? ` • ${getTrainingTimeLabel(training)}`
                            : ""}
                        </div>

                        {training.location && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#b8b8b8",
                              marginTop: "6px",
                            }}
                          >
                            {training.location}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            marginTop: "10px",
                          }}
                        >
                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "rgba(255,255,255,0.08)",
                              fontSize: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            Hlasovalo: {summary.total}
                          </div>

                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "rgba(46, 204, 113, 0.16)",
                              border: "1px solid rgba(46, 204, 113, 0.24)",
                              color: "#9af0b6",
                              fontSize: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            BUDU: {summary.yesCount}
                          </div>

                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "rgba(231, 76, 60, 0.16)",
                              border: "1px solid rgba(231, 76, 60, 0.24)",
                              color: "#ffb0a8",
                              fontSize: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            NEBUDU: {summary.noCount}
                          </div>

                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "rgba(255, 193, 7, 0.16)",
                              border: "1px solid rgba(255, 193, 7, 0.24)",
                              color: "#ffd97a",
                              fontSize: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            NEHLASOVALO: {summary.notVotedCount}
                          </div>

                          {!isTrainingPlanned(training) && (
                            <div
                              style={{
                                padding: "6px 10px",
                                borderRadius: "999px",
                                background: "rgba(52, 152, 219, 0.16)",
                                border: "1px solid rgba(52, 152, 219, 0.24)",
                                color: "#9fd3ff",
                                fontSize: "12px",
                                fontWeight: "bold",
                              }}
                            >
                              ZÚČASTNILI SE: {presenceCount}
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: "12px",
                          color: "#b8b8b8",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isExpanded ? "Skrýt" : "Detail"}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                      {training.note && (
                        <div
                          style={{
                            padding: "12px",
                            borderRadius: "12px",
                            background: "rgba(255,255,255,0.04)",
                            color: "#d9d9d9",
                            fontSize: "14px",
                            lineHeight: 1.5,
                          }}
                        >
                          {training.note}
                        </div>
                      )}

                      {isTrainingPlanned(training) && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => void handleVote(training.id, "yes")}
                            disabled={saving}
                            style={{
                              flex: 1,
                              border: "none",
                              borderRadius: "12px",
                              padding: "12px",
                              background:
                                myStatus === "yes"
                                  ? "rgba(46, 204, 113, 0.95)"
                                  : "rgba(46, 204, 113, 0.18)",
                              color: "white",
                              fontWeight: "bold",
                              cursor: saving ? "default" : "pointer",
                              opacity: saving ? 0.7 : 1,
                            }}
                          >
                            BUDU
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleVote(training.id, "no")}
                            disabled={saving}
                            style={{
                              flex: 1,
                              border: "none",
                              borderRadius: "12px",
                              padding: "12px",
                              background:
                                myStatus === "no"
                                  ? "rgba(231, 76, 60, 0.95)"
                                  : "rgba(231, 76, 60, 0.18)",
                              color: "white",
                              fontWeight: "bold",
                              cursor: saving ? "default" : "pointer",
                              opacity: saving ? 0.7 : 1,
                            }}
                          >
                            NEBUDU
                          </button>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(training)}
                          disabled={saving}
                          style={{
                            flex: 1,
                            border: "none",
                            borderRadius: "12px",
                            padding: "10px 12px",
                            background: primaryColor,
                            color: "white",
                            fontWeight: "bold",
                            cursor: saving ? "default" : "pointer",
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
                            border: "none",
                            borderRadius: "12px",
                            padding: "10px 12px",
                            background: "rgba(198,40,40,0.95)",
                            color: "white",
                            fontWeight: "bold",
                            cursor: saving ? "default" : "pointer",
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          SMAZAT
                        </button>
                      </div>

                      {!isTrainingPlanned(training) && (
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
                                borderRadius: "12px",
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: "bold",
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
                                Můžeš kohokoliv odebrat nebo přidat, i hráče bez
                                hlasování.
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
                                          borderRadius: "12px",
                                          background: checked
                                            ? "rgba(46, 204, 113, 0.12)"
                                            : "rgba(255,255,255,0.03)",
                                          border: checked
                                            ? "1px solid rgba(46, 204, 113, 0.22)"
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
                                            borderRadius: "8px",
                                            background: primaryColor,
                                            color: "white",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: "bold",
                                            fontSize: "13px",
                                          }}
                                        >
                                          {player.number}
                                        </div>

                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontWeight: "bold" }}>
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
                                  onClick={() =>
                                    void handleSavePresence(training.id)
                                  }
                                  disabled={saving}
                                  style={{
                                    flex: 1,
                                    ...styles.primaryButton,
                                    marginTop: 0,
                                    background: "rgba(46, 204, 113, 0.95)",
                                    border: "none",
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
                                    ...styles.primaryButton,
                                    marginTop: 0,
                                    background: "rgba(255,255,255,0.12)",
                                  }}
                                >
                                  Zrušit edit
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: "grid", gap: "10px" }}>
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: "12px",
                            background: "rgba(46, 204, 113, 0.10)",
                            border: "1px solid rgba(46, 204, 113, 0.20)",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "bold",
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
                                  key={`${training.id}-yes-${row.player_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPlayerName(row.player_id)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: "12px",
                            background: "rgba(231, 76, 60, 0.10)",
                            border: "1px solid rgba(231, 76, 60, 0.20)",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "bold",
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
                                  key={`${training.id}-no-${row.player_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPlayerName(row.player_id)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: "12px",
                            background: "rgba(255, 193, 7, 0.10)",
                            border: "1px solid rgba(255, 193, 7, 0.20)",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "bold",
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
                              padding: "10px 12px",
                              borderRadius: "12px",
                              background: "rgba(52, 152, 219, 0.10)",
                              border: "1px solid rgba(52, 152, 219, 0.20)",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "bold",
                                color: "#9fd3ff",
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

        {message && (
          <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
        )}
      </div>
    </div>
  );
}