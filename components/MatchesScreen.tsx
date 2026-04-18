"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MatchDetail from "@/components/MatchDetail";
import MatchLiveScreen from "@/components/MatchLiveScreen";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch, PlannedMatch } from "@/app/page";

type MatchesScreenProps = {
  clubId: string;
  clubName: string;
  hasBTeam: boolean;
  userId: string;
  primaryColor?: string;
  plannedMatches: PlannedMatch[];
  finishedMatchIds: string[];
  onLiveModeChange: (isLive: boolean) => void;
  onMatchFinished: (
    finishedMatch: FinishedMatch
  ) => Promise<{ success: boolean; errorMessage?: string }>;
  onAddMatch: (
    newMatch: PlannedMatch
  ) => Promise<{ success: boolean; errorMessage?: string }>;
  onDeleteMatch: (
    matchId: string
  ) => Promise<{ success: boolean; errorMessage?: string }>;
  isAdmin: boolean;
};

type AttendanceStatus = "yes" | "no";

type Player = {
  id: string;
  club_id: string;
  name: string;
  number: number;
  position: string;
  profile_id?: string | null;
};

type MatchAttendanceRow = {
  id: string;
  match_id: string;
  user_id: string;
  status: AttendanceStatus;
  created_at?: string;
};

type PeriodRow = {
  id: string;
  club_id: string;
  name: string;
  type: "year" | "season";
  start_date: string;
  end_date: string;
  is_active: boolean;
};

type FineTemplateRow = {
  id: string;
  club_id: string;
  name: string;
  default_amount: number;
  is_active: boolean;
};

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function createMatchId(
  date: string,
  homeTeam: string,
  awayTeam: string,
  team: "A" | "B"
) {
  return `${date}-${homeTeam}-${awayTeam}-${team}`
    .replace(/\s+/g, "-")
    .replace(/\//g, "-");
}

function getMatchStatusLabel(status?: PlannedMatch["status"]) {
  switch (status) {
    case "prepared":
      return "PŘIPRAVENÝ";
    case "live":
      return "LIVE";
    case "halftime":
      return "PŘESTÁVKA";
    case "finished":
      return "ODEHRANÝ";
    case "planned":
    default:
      return "PLÁNOVANÝ";
  }
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

function isDateInsidePeriod(dateValue: string, period: PeriodRow | null) {
  if (!period) return false;

  const normalizedDate = normalizeDateToIso(dateValue);
  const normalizedStart = normalizeDateToIso(period.start_date);
  const normalizedEnd = normalizeDateToIso(period.end_date);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) {
    return false;
  }

  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
}

export default function MatchesScreen({
  clubId,
  clubName,
  hasBTeam,
  userId,
  primaryColor = "#888888",
  plannedMatches,
  finishedMatchIds,
  onLiveModeChange,
  onMatchFinished,
  onAddMatch,
  onDeleteMatch,
  isAdmin,
}: MatchesScreenProps) {
  const [filter, setFilter] = useState<"ALL" | "A" | "B">("ALL");
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<"detail" | "live" | null>(
    null
  );
  const [matchOverrides, setMatchOverrides] = useState<
    Record<string, PlannedMatch>
  >({});

  const [players, setPlayers] = useState<Player[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, MatchAttendanceRow[]>
  >({});
  const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null);
  const [expandedAttendanceMatchId, setExpandedAttendanceMatchId] = useState<
    string | null
  >(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTeam, setNewTeam] = useState<"A" | "B">("A");
  const [newOpponent, setNewOpponent] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newVenue, setNewVenue] = useState<"home" | "away">("home");
  const [message, setMessage] = useState("");
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [savingMatch, setSavingMatch] = useState(false);
  const [savingAttendanceMatchId, setSavingAttendanceMatchId] = useState<
    string | null
  >(null);
  const [savingFineMatchId, setSavingFineMatchId] = useState<string | null>(
    null
  );

  useEffect(() => {
    onLiveModeChange(selectedMode === "live");
  }, [selectedMode, onLiveModeChange]);

  useEffect(() => {
    if (!hasBTeam && filter === "B") {
      setFilter("ALL");
    }

    if (!hasBTeam && newTeam === "B") {
      setNewTeam("A");
    }
  }, [hasBTeam, filter, newTeam]);

  useEffect(() => {
    setMatchOverrides((prev) => {
      const next: Record<string, PlannedMatch> = {};

      for (const match of plannedMatches) {
        if (prev[match.id]) {
          next[match.id] = {
            ...match,
            ...prev[match.id],
          };
        }
      }

      return next;
    });
  }, [plannedMatches]);

  useEffect(() => {
    let active = true;

    const loadAttendanceData = async () => {
      const visibleMatchIds = plannedMatches.map((match) => match.id);

      const [
        { data: playersData, error: playersError },
        { data: attendanceData, error: attendanceError },
      ] = await Promise.all([
        supabase
          .from("players")
          .select("*")
          .eq("club_id", clubId)
          .order("number", { ascending: true }),
        visibleMatchIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from("match_attendance")
              .select("*")
              .in("match_id", visibleMatchIds),
      ]);

      if (!active) return;

      if (playersError) {
        console.error("Nepodařilo se načíst hráče pro zápasy:", playersError);
      }

      if (attendanceError) {
        console.error("Nepodařilo se načíst účast na zápasy:", attendanceError);
      }

      const loadedPlayers = (playersData as Player[]) ?? [];
      const loadedAttendance = (attendanceData as MatchAttendanceRow[]) ?? [];

      setPlayers(loadedPlayers);
      setLinkedPlayer(
        loadedPlayers.find((player) => player.profile_id === userId) ?? null
      );

      const nextAttendanceMap: Record<string, MatchAttendanceRow[]> = {};
      for (const matchId of visibleMatchIds) {
        nextAttendanceMap[matchId] = loadedAttendance.filter(
          (row) => row.match_id === matchId
        );
      }

      setAttendanceMap(nextAttendanceMap);
    };

    void loadAttendanceData();

    return () => {
      active = false;
    };
  }, [clubId, plannedMatches, userId]);

  const mergedMatches = useMemo(() => {
    return plannedMatches.map((match) => matchOverrides[match.id] ?? match);
  }, [plannedMatches, matchOverrides]);

  const availableMatches = useMemo(() => {
    return mergedMatches
      .filter((match) => !finishedMatchIds.includes(match.id))
      .sort((a, b) => {
        const aKey = `${a.date}-${a.time ?? ""}`;
        const bKey = `${b.date}-${b.time ?? ""}`;
        return aKey.localeCompare(bKey);
      });
  }, [mergedMatches, finishedMatchIds]);

  const filteredMatches =
    filter === "ALL"
      ? availableMatches
      : availableMatches.filter((match) => match.team === filter);

  const selectedMatch =
    selectedMatchId !== null
      ? availableMatches.find((match) => match.id === selectedMatchId) ?? null
      : null;

  const teamLabelA = clubName.trim() || "Můj tým";
  const teamLabelB = `${teamLabelA} B`;

  const primaryButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    background: primaryColor,
    border: "none",
    marginTop: 0,
  };

  const inactiveButtonStyle: React.CSSProperties = {
    border: "none",
    borderRadius: "10px",
    padding: "10px",
    background: "rgba(255,255,255,0.1)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    flex: 1,
  };

  const getFilterButtonStyle = (
    value: "ALL" | "A" | "B"
  ): React.CSSProperties => ({
    ...inactiveButtonStyle,
    background: filter === value ? primaryColor : "rgba(255,255,255,0.1)",
  });

  const getPlayerNameByUserId = (rowUserId: string) => {
    return (
      players.find((player) => player.profile_id === rowUserId)?.name ??
      "Neznámý hráč"
    );
  };

  const getMatchAttendanceRows = (matchId: string) => {
    return attendanceMap[matchId] ?? [];
  };

  const getMyAttendanceStatus = (matchId: string): AttendanceStatus | null => {
    const row = getMatchAttendanceRows(matchId).find(
      (item) => item.user_id === userId
    );

    return row?.status ?? null;
  };

  const getMatchAttendanceSummary = (matchId: string) => {
    const rows = getMatchAttendanceRows(matchId);
    const yesCount = rows.filter((row) => row.status === "yes").length;
    const noCount = rows.filter((row) => row.status === "no").length;
    const votedUserIds = new Set(rows.map((row) => row.user_id));

    const notVotedCount = players.filter(
      (player) => player.profile_id && !votedUserIds.has(player.profile_id)
    ).length;

    return {
      totalVotes: votedUserIds.size,
      yesCount,
      noCount,
      notVotedCount,
    };
  };

  const handleVote = async (matchId: string, status: AttendanceStatus) => {
    if (!linkedPlayer || !linkedPlayer.profile_id) {
      setMessage("Nejdřív je potřeba propojit účet s hráčem.");
      return;
    }

    setSavingAttendanceMatchId(matchId);
    setMessage("");

    const { error: upsertError } = await supabase.from("match_attendance").upsert(
      {
        match_id: matchId,
        user_id: linkedPlayer.profile_id,
        status,
      },
      {
        onConflict: "match_id,user_id",
      }
    );

    if (upsertError) {
      console.error("Nepodařilo se uložit hlasování k zápasu:", upsertError);
      setMessage("Nepodařilo se uložit hlasování k zápasu.");
      setSavingAttendanceMatchId(null);
      return;
    }

    const { data: rows, error: reloadError } = await supabase
      .from("match_attendance")
      .select("*")
      .eq("match_id", matchId);

    if (reloadError) {
      console.error("Nepodařilo se načíst hlasování k zápasu:", reloadError);
      setMessage("Hlasování bylo uloženo, ale nepodařilo se obnovit data.");
      setSavingAttendanceMatchId(null);
      return;
    }

    setAttendanceMap((prev) => ({
      ...prev,
      [matchId]: (rows as MatchAttendanceRow[]) ?? [],
    }));

    setMessage(
      status === "yes"
        ? "Potvrdil jsi účast na zápas."
        : "Označil jsi, že na zápas nepřijdeš."
    );
    setSavingAttendanceMatchId(null);
  };

  const handleCreateNoVoteFines = async (
    match: PlannedMatch,
    notVotedPlayers: Player[]
  ) => {
    if (!isAdmin) {
      setMessage("Pokuty může přidělovat jen admin.");
      return;
    }

    if (notVotedPlayers.length === 0) {
      setMessage("Nikdo není v seznamu NEHLASOVAL.");
      return;
    }

    const normalizedMatchDate = normalizeDateToIso(match.date);

    if (!normalizedMatchDate) {
      setMessage("Datum zápasu není ve správném formátu.");
      return;
    }

    setSavingFineMatchId(match.id);
    setMessage("");

    const [
      { data: periodsData, error: periodsError },
      { data: templatesData, error: templatesError },
    ] = await Promise.all([
      supabase.from("periods").select("*").eq("club_id", clubId),
      supabase.from("fine_templates").select("*").eq("club_id", clubId),
    ]);

    if (periodsError) {
      console.error("Nepodařilo se načíst období:", periodsError);
      setMessage("Nepodařilo se načíst období.");
      setSavingFineMatchId(null);
      return;
    }

    if (templatesError) {
      console.error("Nepodařilo se načíst předvolby pokut:", templatesError);
      setMessage("Nepodařilo se načíst předvolby pokut.");
      setSavingFineMatchId(null);
      return;
    }

    const periods = (periodsData as PeriodRow[]) ?? [];
    const fineTemplates = (templatesData as FineTemplateRow[]) ?? [];

    const matchedPeriod =
      periods.find((period) => isDateInsidePeriod(normalizedMatchDate, period)) ??
      null;

    if (!matchedPeriod) {
      setMessage("Pro datum zápasu nebylo nalezeno žádné období.");
      setSavingFineMatchId(null);
      return;
    }

    const zapasyTemplate =
      fineTemplates.find(
        (item) => item.name.trim().toLowerCase() === "zápasy" && item.is_active
      ) ?? null;

    if (!zapasyTemplate) {
      setMessage('Chybí aktivní týmová pokuta s názvem "Zápasy".');
      setSavingFineMatchId(null);
      return;
    }

    let createdCount = 0;

    for (const player of notVotedPlayers) {
      const { data: existingFine, error: existingFineError } = await supabase
        .from("fines")
        .select("id")
        .eq("period_id", matchedPeriod.id)
        .eq("player_id", player.id)
        .eq("note", `match:${match.id}`)
        .maybeSingle();

      if (existingFineError) {
        console.error("Nepodařilo se ověřit existující pokutu:", existingFineError);
        continue;
      }

      if (existingFine) {
        continue;
      }

      const { error: createFineError } = await supabase.from("fines").insert({
        club_id: clubId,
        period_id: matchedPeriod.id,
        player_id: player.id,
        amount: Number(zapasyTemplate.default_amount),
        reason: zapasyTemplate.name,
        note: `match:${match.id}`,
        fine_date: normalizedMatchDate,
        created_by: userId,
        is_paid: false,
      });

      if (createFineError) {
        console.error("Nepodařilo se vytvořit pokutu za zápas:", createFineError);
        continue;
      }

      createdCount += 1;
    }

    if (createdCount === 0) {
      setMessage("Žádné nové pokuty nevznikly. Možná už byly přidělené dřív.");
      setSavingFineMatchId(null);
      return;
    }

    setMessage(`Bylo přidáno ${createdCount} pokut za nehlasování k zápasu.`);
    setSavingFineMatchId(null);
  };

  const handleAddMatch = async () => {
    if (!isAdmin) {
      setMessage("Zápas může přidat jen admin.");
      return;
    }

    if (!newOpponent.trim() || !newDate) {
      setMessage("Vyplň soupeře a datum.");
      return;
    }

    setSavingMatch(true);
    setMessage("");

    const teamLabel = newTeam === "A" ? teamLabelA : teamLabelB;
    const homeTeam = newVenue === "home" ? teamLabel : newOpponent.trim();
    const awayTeam = newVenue === "home" ? newOpponent.trim() : teamLabel;

    const newMatch: PlannedMatch = {
      id: createMatchId(newDate, homeTeam, awayTeam, newTeam),
      date: newDate,
      time: newTime || undefined,
      location: newLocation.trim() || undefined,
      opponent: newOpponent.trim(),
      team: newTeam,
      homeTeam,
      awayTeam,
    };

    const result = await onAddMatch(newMatch);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se uložit zápas.");
      setSavingMatch(false);
      return;
    }

    setNewTeam("A");
    setNewOpponent("");
    setNewDate("");
    setNewTime("");
    setNewLocation("");
    setNewVenue("home");
    setShowAddForm(false);
    setSavingMatch(false);
    setMessage("Zápas byl uložen.");
  };

  const handleDeleteMatch = async (matchId: string, matchTitle: string) => {
    if (!isAdmin) {
      setMessage("Zápas může smazat jen admin.");
      return;
    }

    const confirmed = window.confirm(`Opravdu chceš smazat zápas "${matchTitle}"?`);

    if (!confirmed) return;

    setDeletingMatchId(matchId);
    setMessage("");

    const { error: deleteAttendanceError } = await supabase
      .from("match_attendance")
      .delete()
      .eq("match_id", matchId);

    if (deleteAttendanceError) {
      console.error("Nepodařilo se smazat docházku zápasu:", deleteAttendanceError);
      setMessage("Nepodařilo se smazat docházku zápasu.");
      setDeletingMatchId(null);
      return;
    }

    const result = await onDeleteMatch(matchId);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se smazat zápas.");
      setDeletingMatchId(null);
      return;
    }

    setAttendanceMap((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });

    if (selectedMatchId === matchId) {
      setSelectedMatchId(null);
      setSelectedMode(null);
    }

    if (expandedAttendanceMatchId === matchId) {
      setExpandedAttendanceMatchId(null);
    }

    setMessage("Zápas byl smazán.");
    setDeletingMatchId(null);
  };

  if (selectedMatch !== null && selectedMode === "live") {
    return (
      <MatchLiveScreen
        clubId={clubId}
        primaryColor={primaryColor}
        isAdmin={isAdmin}
        onBack={() => {
          setSelectedMatchId(null);
          setSelectedMode(null);
        }}
        onMatchStateChanged={(updatedMatch) => {
          setMatchOverrides((prev) => ({
            ...prev,
            [updatedMatch.id]: updatedMatch,
          }));
        }}
        onFinishMatch={onMatchFinished}
        matchId={selectedMatch.id}
        matchTitle={`${selectedMatch.homeTeam} vs. ${selectedMatch.awayTeam}`}
        team={selectedMatch.team}
        date={selectedMatch.date}
        selectedPlayers={[]}
        goalkeeper={null}
      />
    );
  }

  if (selectedMatch !== null && selectedMode === "detail") {
    if (!isAdmin) {
      return (
        <div style={styles.card}>
          <div style={{ color: "#d9d9d9" }}>
            Správa zápasu je dostupná jen pro admina.
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedMatchId(null);
              setSelectedMode(null);
            }}
            style={{
              ...styles.primaryButton,
              marginTop: "12px",
              background: primaryColor,
              border: "none",
            }}
          >
            Zpět
          </button>
        </div>
      );
    }

    return (
      <MatchDetail
        clubId={clubId}
        matchId={selectedMatch.id}
        primaryColor={primaryColor}
        onBack={() => {
          setSelectedMatchId(null);
          setSelectedMode(null);
        }}
        onSaveLineup={(_players, _gk, updatedMatch) => {
          setMatchOverrides((prev) => ({
            ...prev,
            [updatedMatch.id]: updatedMatch,
          }));
          setMessage("Sestava byla uložena. Zápas je připravený.");
          setSelectedMatchId(null);
          setSelectedMode(null);
        }}
        matchTitle={`${selectedMatch.homeTeam} vs. ${selectedMatch.awayTeam}`}
        team={selectedMatch.team}
        date={selectedMatch.date}
        initialStatus={selectedMatch.status ?? "planned"}
      />
    );
  }

  return (
    <div>
      <h2 style={styles.screenTitle}>Plánované zápasy</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button onClick={() => setFilter("ALL")} style={getFilterButtonStyle("ALL")}>
          Vše
        </button>

        <button onClick={() => setFilter("A")} style={getFilterButtonStyle("A")}>
          A-tým
        </button>

        {hasBTeam && (
          <button onClick={() => setFilter("B")} style={getFilterButtonStyle("B")}>
            B-tým
          </button>
        )}
      </div>

      <div style={styles.card}>
        {filteredMatches.length === 0 ? (
          <div style={{ color: "#b8b8b8" }}>
            Žádné plánované zápasy pro tento filtr.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {filteredMatches.map((match) => {
              const statusLabel = getMatchStatusLabel(match.status);
              const canOpenLive =
                match.status === "prepared" ||
                match.status === "live" ||
                match.status === "halftime";

              const myStatus = getMyAttendanceStatus(match.id);
              const attendanceRows = getMatchAttendanceRows(match.id);
              const summary = getMatchAttendanceSummary(match.id);
              const isExpanded = expandedAttendanceMatchId === match.id;
              const isSavingAttendance = savingAttendanceMatchId === match.id;
              const isSavingFine = savingFineMatchId === match.id;

              const yesRows = attendanceRows
                .filter((row) => row.status === "yes")
                .sort((a, b) =>
                  getPlayerNameByUserId(a.user_id).localeCompare(
                    getPlayerNameByUserId(b.user_id),
                    "cs"
                  )
                );

              const noRows = attendanceRows
                .filter((row) => row.status === "no")
                .sort((a, b) =>
                  getPlayerNameByUserId(a.user_id).localeCompare(
                    getPlayerNameByUserId(b.user_id),
                    "cs"
                  )
                );

              const votedUserIds = new Set(attendanceRows.map((row) => row.user_id));
              const notVotedPlayers = players
                .filter(
                  (player) =>
                    player.profile_id && !votedUserIds.has(player.profile_id)
                )
                .sort((a, b) => a.name.localeCompare(b.name, "cs"));

              return (
                <div
                  key={match.id}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: "14px",
                    padding: "12px",
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
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                        {formatDisplayDate(match.date)}
                        {match.time ? ` • ${match.time}` : ""}
                        {" — "}
                        {match.team}-tým
                      </div>

                      <div
                        style={{
                          fontWeight: "bold",
                          marginTop: "4px",
                          lineHeight: 1.35,
                          wordBreak: "break-word",
                        }}
                      >
                        {match.homeTeam} vs. {match.awayTeam}
                      </div>

                      {match.location && (
                        <div
                          style={{
                            marginTop: "6px",
                            fontSize: "13px",
                            color: "#b9c4bb",
                            wordBreak: "break-word",
                          }}
                        >
                          Hřiště: {match.location}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          background:
                            match.status === "prepared" || match.status === "live"
                              ? "rgba(61, 214, 140, 0.16)"
                              : "rgba(255,255,255,0.08)",
                          color:
                            match.status === "prepared" || match.status === "live"
                              ? "#7dffbc"
                              : "#d5d5d5",
                          border:
                            match.status === "prepared" || match.status === "live"
                              ? "1px solid rgba(61, 214, 140, 0.28)"
                              : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {statusLabel}
                      </div>

                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "13px",
                          color: "#d4d4d4",
                          lineHeight: 1.45,
                        }}
                      >
                        {match.status === "prepared"
                          ? "Sestava je uložená. Můžeš jít do live zápasu."
                          : match.status === "live"
                          ? "Zápas už běží. Můžeš se do něj vrátit."
                          : match.status === "halftime"
                          ? "Zápas je v přestávce. Můžeš pokračovat v live zápasu."
                          : "Klikni na anketu nebo live podle stavu zápasu."}
                      </div>

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
                          Hlasovalo: {summary.totalVotes}
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
                            background: "rgba(52, 152, 219, 0.16)",
                            border: "1px solid rgba(52, 152, 219, 0.24)",
                            color: "#9fd3ff",
                            fontSize: "12px",
                            fontWeight: "bold",
                          }}
                        >
                          NEHLASOVAL: {summary.notVotedCount}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "6px",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        style={{
                          minWidth: "92px",
                          height: "36px",
                          borderRadius: "8px",
                          border: "none",
                          background: "rgba(255,255,255,0.12)",
                          color: "white",
                          cursor: "pointer",
                          fontWeight: "bold",
                          padding: "0 10px",
                        }}
                        onClick={() =>
                          setExpandedAttendanceMatchId((prev) =>
                            prev === match.id ? null : match.id
                          )
                        }
                      >
                        {isExpanded ? "Skrýt" : "Anketa"}
                      </button>

                      {canOpenLive && (
                        <button
                          style={{
                            minWidth: "92px",
                            height: "36px",
                            borderRadius: "8px",
                            border: "none",
                            background: "#16a34a",
                            color: "white",
                            cursor: "pointer",
                            fontWeight: "bold",
                            padding: "0 10px",
                          }}
                          onClick={() => {
                            setSelectedMatchId(match.id);
                            setSelectedMode("live");
                            setMessage("");
                          }}
                        >
                          LIVE
                        </button>
                      )}

                      {isAdmin && (
                        <>
                          <button
                            style={{
                              minWidth: "92px",
                              height: "36px",
                              borderRadius: "8px",
                              border: "none",
                              background: primaryColor,
                              color: "white",
                              cursor: "pointer",
                              fontWeight: "bold",
                              padding: "0 10px",
                            }}
                            onClick={() => {
                              setSelectedMatchId(match.id);
                              setSelectedMode("detail");
                              setMessage("");
                            }}
                          >
                            Správa
                          </button>

                          <button
                            style={{
                              minWidth: "92px",
                              height: "36px",
                              borderRadius: "8px",
                              border: "none",
                              background: "#ff3b3b",
                              color: "white",
                              cursor: deletingMatchId === match.id ? "default" : "pointer",
                              fontWeight: "bold",
                              padding: "0 10px",
                              opacity: deletingMatchId === match.id ? 0.7 : 1,
                            }}
                            onClick={() =>
                              void handleDeleteMatch(
                                match.id,
                                `${match.homeTeam} vs. ${match.awayTeam}`
                              )
                            }
                            disabled={deletingMatchId === match.id}
                          >
                            {deletingMatchId === match.id ? "..." : "Smazat"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => void handleVote(match.id, "yes")}
                          disabled={isSavingAttendance}
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
                            cursor: isSavingAttendance ? "default" : "pointer",
                            opacity: isSavingAttendance ? 0.7 : 1,
                          }}
                        >
                          BUDU
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleVote(match.id, "no")}
                          disabled={isSavingAttendance}
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
                            cursor: isSavingAttendance ? "default" : "pointer",
                            opacity: isSavingAttendance ? 0.7 : 1,
                          }}
                        >
                          NEBUDU
                        </button>
                      </div>

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
                                  key={`${match.id}-yes-${row.user_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPlayerNameByUserId(row.user_id)}
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
                                  key={`${match.id}-no-${row.user_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPlayerNameByUserId(row.user_id)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

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
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span>NEHLASOVAL ({notVotedPlayers.length})</span>

                            {isAdmin && notVotedPlayers.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCreateNoVoteFines(
                                    match,
                                    notVotedPlayers
                                  )
                                }
                                disabled={isSavingFine}
                                style={{
                                  border: "none",
                                  borderRadius: "10px",
                                  padding: "8px 10px",
                                  background: "rgba(241, 196, 15, 0.95)",
                                  color: "#111111",
                                  fontWeight: "bold",
                                  cursor: isSavingFine ? "default" : "pointer",
                                  opacity: isSavingFine ? 0.7 : 1,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isSavingFine ? "Ukládám..." : "POKUTA"}
                              </button>
                            )}
                          </div>

                          {notVotedPlayers.length === 0 ? (
                            <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                              Všichni hlasovali.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: "6px" }}>
                              {notVotedPlayers.map((player) => (
                                <div
                                  key={`${match.id}-not-voted-${player.id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {player.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAdmin ? (
          <div style={{ marginTop: "14px" }}>
            <button
              style={primaryButtonStyle}
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setMessage("");
              }}
            >
              {showAddForm ? "Zavřít formulář" : "Přidat zápas"}
            </button>

            {showAddForm && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "14px",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Přidat zápas</h3>

                <div style={{ display: "grid", gap: "10px" }}>
                  <select
                    value={newTeam}
                    onChange={(e) => setNewTeam(e.target.value as "A" | "B")}
                    style={{
                      ...styles.input,
                      appearance: "none",
                    }}
                  >
                    <option value="A" style={{ color: "black" }}>
                      A-tým
                    </option>
                    {hasBTeam && (
                      <option value="B" style={{ color: "black" }}>
                        B-tým
                      </option>
                    )}
                  </select>

                  <input
                    type="text"
                    placeholder="Soupeř"
                    value={newOpponent}
                    onChange={(e) => setNewOpponent(e.target.value)}
                    style={styles.input}
                  />

                  <div style={{ fontSize: "13px", color: "#b8b8b8", marginBottom: "-2px" }}>
                    Datum zápasu
                  </div>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    style={styles.input}
                  />

                  <div style={{ fontSize: "13px", color: "#b8b8b8", marginBottom: "-2px" }}>
                    Čas zápasu
                  </div>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    style={styles.input}
                  />

                  <div style={{ fontSize: "13px", color: "#b8b8b8", marginBottom: "-2px" }}>
                    Hřiště / místo
                  </div>
                  <input
                    type="text"
                    placeholder="Např. Sport Arena Klatovy"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    style={{
                      ...styles.input,
                      color: "white",
                    }}
                  />

                  <select
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value as "home" | "away")}
                    style={{
                      ...styles.input,
                      appearance: "none",
                    }}
                  >
                    <option value="home" style={{ color: "black" }}>
                      Doma
                    </option>
                    <option value="away" style={{ color: "black" }}>
                      Venku
                    </option>
                  </select>

                  <button
                    style={{
                      ...primaryButtonStyle,
                      opacity: savingMatch ? 0.7 : 1,
                    }}
                    onClick={() => void handleAddMatch()}
                    disabled={savingMatch}
                  >
                    {savingMatch ? "Ukládám..." : "Uložit zápas"}
                  </button>

                  <button
                    style={{
                      ...styles.primaryButton,
                      marginTop: 0,
                      background: "rgba(255,255,255,0.12)",
                      border: "none",
                    }}
                    onClick={() => setShowAddForm(false)}
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              color: "#b8b8b8",
              fontSize: "14px",
            }}
          >
            Jako člen týmu můžeš sledovat zápasy, hlasovat v anketě a otevřít live zápas.
          </div>
        )}

        {message && (
          <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
        )}
      </div>
    </div>
  );
}