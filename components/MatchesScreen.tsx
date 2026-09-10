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
  openMatchId?: string | null;
  onOpenMatchHandled?: () => void;
};

type AttendanceStatus = "yes" | "no";
type MatchFilter = "ALL" | "A" | "B";

type Player = {
  id: string;
  club_id: string;
  name: string;
  number: number;
  position: string;
  profile_id?: string | null;
  is_active?: boolean;
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

function isDateInsidePeriod(dateValue: string, period: PeriodRow | null) {
  if (!period) return false;

  const normalizedDate = normalizeDateToIso(dateValue);
  const normalizedStart = normalizeDateToIso(period.start_date);
  const normalizedEnd = normalizeDateToIso(period.end_date);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) return false;

  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
}


function JerseyIcon({
  color,
  accent,
}: {
  color: string;
  accent?: string;
}) {
  const stripe = accent ?? color;

  return (
    <svg
      width="60"
      height="66"
      viewBox="0 0 60 66"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", filter: "drop-shadow(0 7px 10px rgba(0,0,0,.32))" }}
    >
      <path
        d="M20 5.5L25 2.5H35L40 5.5L54 12.5L49 25L42 21.5V63H18V21.5L11 25L6 12.5L20 5.5Z"
        fill={color}
        stroke="rgba(255,255,255,.72)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M25 2.5C25.7 7.1 27.7 9.5 30 9.5C32.3 9.5 34.3 7.1 35 2.5"
        stroke="rgba(15,15,15,.82)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M24 5.1V62.3" stroke={stripe} strokeWidth="3.6" opacity="0.95" />
      <path d="M36 5.1V62.3" stroke={stripe} strokeWidth="3.6" opacity="0.95" />
      <path d="M18.3 20.8H41.7" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
    </svg>
  );
}

export default function MatchesScreen({
  clubId,
  clubName,
  hasBTeam,
  userId,
  primaryColor = "#22c55e",
  plannedMatches,
  finishedMatchIds,
  onLiveModeChange,
  onMatchFinished,
  onAddMatch,
  onDeleteMatch,
  isAdmin,
  openMatchId = null,
  onOpenMatchHandled,
}: MatchesScreenProps) {
  const [filter, setFilter] = useState<MatchFilter>("ALL");
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
    if (!hasBTeam && filter === "B") setFilter("ALL");
    if (!hasBTeam && newTeam === "B") setNewTeam("A");
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
          .eq("is_active", true)
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

  useEffect(() => {
    if (!openMatchId) return;

    const targetMatch = availableMatches.find((match) => match.id === openMatchId);

    if (!targetMatch) return;

    setFilter("ALL");
    setExpandedAttendanceMatchId(openMatchId);
    onOpenMatchHandled?.();

    window.setTimeout(() => {
      document
        .getElementById(`match-${openMatchId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [openMatchId, availableMatches, onOpenMatchHandled]);

  const filteredMatches = useMemo(() => {
    if (filter === "ALL") return availableMatches;
    return availableMatches.filter((match) => match.team === filter);
  }, [availableMatches, filter]);

  const selectedMatch =
    selectedMatchId !== null
      ? availableMatches.find((match) => match.id === selectedMatchId) ?? null
      : null;

  const teamLabelA = clubName.trim() || "Můj tým";
  const teamLabelB = `${teamLabelA} B`;

  const modernCardStyle: React.CSSProperties = {
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
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "14px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.07)",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  };

  const getFilterButtonStyle = (value: MatchFilter): React.CSSProperties => ({
    border: "none",
    borderRadius: "999px",
    padding: "10px 10px",
    background:
      filter === value
        ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`
        : "rgba(255,255,255,0.08)",
    color: filter === value ? "#071107" : "#ffffff",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: filter === value ? `0 10px 24px ${primaryColor}33` : "none",
    width: "100%",
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

  const handleCopyMatchLink = async (matchId: string) => {
    if (typeof window === "undefined") return;

    const url = `${window.location.origin}${window.location.pathname}?open=match&id=${matchId}`;

    try {
      await navigator.clipboard.writeText(url);
      setMessage("Odkaz na anketu zápasu byl zkopírován.");
    } catch {
      setMessage(url);
    }
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

      if (existingFine) continue;

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
        <div style={{ ...modernCardStyle, padding: "16px" }}>
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
              ...primaryButtonStyle,
              marginTop: "12px",
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
    <div style={{ display: "grid", gap: "14px" }}>
      <div
        style={{
          ...modernCardStyle,
          padding: "12px",
        }}
      >
        <div
          style={{
            color: "#9b9b9b",
            fontSize: "11px",
            fontWeight: 950,
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            marginBottom: "10px",
          }}
        >
          Filtr týmu
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: hasBTeam ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: "8px",
          }}
        >
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
      </div>

      {message && (
        <div
          style={{
            ...modernCardStyle,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      {filteredMatches.length === 0 ? (
        <div
          style={{
            ...modernCardStyle,
            padding: "16px",
            color: "#b8b8b8",
          }}
        >
          Žádné plánované zápasy pro tento filtr.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {filteredMatches.map((match) => {
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
                id={`match-${match.id}`}
                key={match.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  setExpandedAttendanceMatchId((prev) =>
                    prev === match.id ? null : match.id
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedAttendanceMatchId((prev) =>
                      prev === match.id ? null : match.id
                    );
                  }
                }}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: "18px",
                  border: isExpanded
                    ? `1px solid ${primaryColor}55`
                    : "1px solid rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(20,20,20,0.98) 0%, rgba(12,12,12,0.99) 100%)",
                  boxShadow: isExpanded
                    ? `0 16px 38px rgba(0,0,0,.32), 0 0 0 1px ${primaryColor}10`
                    : "0 10px 26px rgba(0,0,0,.24)",
                  cursor: "pointer",
                  transition: "border-color .18s ease, transform .18s ease, box-shadow .18s ease",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "18px",
                    bottom: "18px",
                    width: "2px",
                    borderRadius: "0 999px 999px 0",
                    background: primaryColor,
                    opacity: 0.88,
                  }}
                />

                <div
                  style={{
                    padding: "16px 16px 14px 18px",
                    display: "grid",
                    gap: "14px",
                  }}
                >
                  {/* DATUM / ČAS / TÝM */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.35fr .85fr .8fr",
                      alignItems: "end",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          marginBottom: "3px",
                          color: "#717171",
                          fontSize: "9px",
                          fontWeight: 900,
                          letterSpacing: "1px",
                        }}
                      >
                        DATUM
                      </div>
                      <div
                        style={{
                          color: "#fff",
                          fontSize: "17px",
                          lineHeight: 1,
                          fontWeight: 950,
                          letterSpacing: "-0.2px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDisplayDate(match.date)}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          marginBottom: "3px",
                          color: "#717171",
                          fontSize: "9px",
                          fontWeight: 900,
                          letterSpacing: "1px",
                        }}
                      >
                        ČAS
                      </div>
                      <div
                        style={{
                          color: "#fff",
                          fontSize: "17px",
                          lineHeight: 1,
                          fontWeight: 950,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {match.time || "—"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          marginBottom: "3px",
                          color: "#717171",
                          fontSize: "9px",
                          fontWeight: 900,
                          letterSpacing: "1px",
                        }}
                      >
                        TÝM
                      </div>
                      <div
                        style={{
                          color: primaryColor,
                          fontSize: "16px",
                          lineHeight: 1,
                          fontWeight: 950,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {match.team}-TÝM
                      </div>
                    </div>
                  </div>

                  {/* MÍSTO */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginTop: "-3px",
                    }}
                  >
                    <span
                      style={{
                        color: "#ff4b7b",
                        fontSize: "13px",
                        lineHeight: 1,
                      }}
                    >
                      ●
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <span
                        style={{
                          color: "#737373",
                          fontSize: "9px",
                          fontWeight: 900,
                          letterSpacing: ".9px",
                          marginRight: "7px",
                        }}
                      >
                        MÍSTO
                      </span>
                      <span
                        style={{
                          color: "#d8d8d8",
                          fontSize: "13px",
                          fontWeight: 800,
                        }}
                      >
                        {match.location || "Místo neuvedeno"}
                      </span>
                    </div>
                  </div>

                  {/* ZÁPAS */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) 42px minmax(0,1fr)",
                      alignItems: "center",
                      gap: "8px",
                      padding: "4px 4px 1px",
                    }}
                  >
                    <div style={{ minWidth: 0, textAlign: "center" }}>
                      <div
                        style={{
                          height: "54px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "7px",
                        }}
                      >
                        <div style={{ transform: "scale(.80)", transformOrigin: "center" }}>
                          <JerseyIcon color={primaryColor} accent="#111111" />
                        </div>
                      </div>

                      <div
                        style={{
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 950,
                          lineHeight: 1.15,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {match.homeTeam}
                      </div>
                    </div>

                    <div
                      style={{
                        color: primaryColor,
                        fontSize: "18px",
                        fontWeight: 950,
                        textAlign: "center",
                        letterSpacing: ".5px",
                      }}
                    >
                      VS
                    </div>

                    <div style={{ minWidth: 0, textAlign: "center" }}>
                      <div
                        style={{
                          height: "54px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "7px",
                        }}
                      >
                        <div style={{ transform: "scale(.80)", transformOrigin: "center" }}>
                          <JerseyIcon color="#f5f5f5" accent="#cfcfcf" />
                        </div>
                      </div>

                      <div
                        style={{
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 950,
                          lineHeight: 1.15,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {match.awayTeam}
                      </div>
                    </div>
                  </div>

                  {/* STAVY */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "7px",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "4px 8px",
                        borderRadius: "8px",
                        background: "rgba(46,204,113,.07)",
                        color: "#70e994",
                        fontSize: "9px",
                        fontWeight: 950,
                        letterSpacing: ".25px",
                      }}
                    >
                      BUDU <b style={{ fontSize: "11px" }}>{summary.yesCount}</b>
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "4px 8px",
                        borderRadius: "8px",
                        background: "rgba(231,76,60,.07)",
                        color: "#ff8580",
                        fontSize: "9px",
                        fontWeight: 950,
                        letterSpacing: ".25px",
                      }}
                    >
                      NEBUDU <b style={{ fontSize: "11px" }}>{summary.noCount}</b>
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "4px 8px",
                        borderRadius: "8px",
                        background: "rgba(52,152,219,.07)",
                        color: "#7acbff",
                        fontSize: "9px",
                        fontWeight: 950,
                        letterSpacing: ".25px",
                      }}
                    >
                      NEHLASOVAL{" "}
                      <b style={{ fontSize: "11px" }}>{summary.notVotedCount}</b>
                    </span>
                  </div>

                  {/* MŮJ STAV */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginTop: "-5px",
                    }}
                  >
                    <span
                      style={{
                        color: myStatus ? "#72e994" : "#f2c94c",
                        fontSize: "10px",
                        fontWeight: 950,
                        letterSpacing: ".65px",
                      }}
                    >
                      {myStatus ? "✓ HLASOVAL JSI" : "• NEHLASOVAL JSI"}
                    </span>
                  </div>

                  {canOpenLive && (
                    <button
                      style={{
                        ...primaryButtonStyle,
                        marginTop: "-2px",
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedMatchId(match.id);
                        setSelectedMode("live");
                        setMessage("");
                      }}
                    >
                      LIVE ZÁPAS
                    </button>
                  )}

                  {/* ROZBALENÁ ANKETA */}
                  {isExpanded && (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        display: "grid",
                        gap: "12px",
                        paddingTop: "14px",
                        borderTop: "1px solid rgba(255,255,255,.07)",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void handleVote(match.id, "yes")}
                          disabled={isSavingAttendance}
                          style={{
                            border:
                              myStatus === "yes"
                                ? "1px solid rgba(46,204,113,.75)"
                                : "1px solid rgba(46,204,113,.30)",
                            borderRadius: "12px",
                            padding: "13px 10px",
                            background:
                              myStatus === "yes"
                                ? "linear-gradient(135deg, rgba(40,210,100,.95), rgba(25,165,78,.95))"
                                : "rgba(46,204,113,.08)",
                            color: "#fff",
                            fontWeight: 950,
                            fontSize: "14px",
                            cursor: isSavingAttendance ? "default" : "pointer",
                            opacity: isSavingAttendance ? 0.65 : 1,
                          }}
                        >
                          ✓ BUDU
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleVote(match.id, "no")}
                          disabled={isSavingAttendance}
                          style={{
                            border:
                              myStatus === "no"
                                ? "1px solid rgba(231,76,60,.75)"
                                : "1px solid rgba(231,76,60,.30)",
                            borderRadius: "12px",
                            padding: "13px 10px",
                            background:
                              myStatus === "no"
                                ? "linear-gradient(135deg, rgba(225,72,60,.95), rgba(170,48,42,.95))"
                                : "rgba(231,76,60,.08)",
                            color: "#fff",
                            fontWeight: 950,
                            fontSize: "14px",
                            cursor: isSavingAttendance ? "default" : "pointer",
                            opacity: isSavingAttendance ? 0.65 : 1,
                          }}
                        >
                          ✕ NEBUDU
                        </button>
                      </div>

                      <div
                        style={{
                          textAlign: "center",
                          color: "#8f8f8f",
                          fontSize: "11px",
                          fontWeight: 800,
                        }}
                      >
                        {myStatus ? (
                          <>
                            Tvoje odpověď:{" "}
                            <span
                              style={{
                                color: myStatus === "yes" ? "#72e994" : "#ff8580",
                                fontWeight: 950,
                              }}
                            >
                              {myStatus === "yes" ? "BUDU" : "NEBUDU"}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: "#f2c94c", fontWeight: 950 }}>
                            Ještě jsi nehlasoval
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleCopyMatchLink(match.id)}
                        style={{
                          ...softButtonStyle,
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: "11px",
                          background: "rgba(255,255,255,.035)",
                        }}
                      >
                        🔗 Kopírovat odkaz na anketu
                      </button>

                      <div style={{ display: "grid", gap: "8px" }}>
                        <div
                          style={{
                            borderRadius: "12px",
                            background: "rgba(46,204,113,.05)",
                            border: "1px solid rgba(46,204,113,.20)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: "10px 11px",
                              color: "#82eaa0",
                              fontSize: "12px",
                              fontWeight: 950,
                            }}
                          >
                            BUDOU ({yesRows.length})
                          </div>
                          <div
                            style={{
                              padding: "0 11px 11px",
                              display: "grid",
                              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                              gap: "6px 10px",
                            }}
                          >
                            {yesRows.length === 0 ? (
                              <div
                                style={{
                                  gridColumn: "1 / -1",
                                  color: "#777",
                                  fontSize: "12px",
                                }}
                              >
                                Zatím nikdo.
                              </div>
                            ) : (
                              yesRows.map((row) => (
                                <div
                                  key={`${match.id}-yes-${row.user_id}`}
                                  style={{
                                    minWidth: 0,
                                    color: "#e8e8e8",
                                    fontSize: "12px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {getPlayerNameByUserId(row.user_id)}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            borderRadius: "12px",
                            background: "rgba(231,76,60,.05)",
                            border: "1px solid rgba(231,76,60,.20)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: "10px 11px",
                              color: "#ff9190",
                              fontSize: "12px",
                              fontWeight: 950,
                            }}
                          >
                            NEBUDOU ({noRows.length})
                          </div>
                          <div
                            style={{
                              padding: "0 11px 11px",
                              display: "grid",
                              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                              gap: "6px 10px",
                            }}
                          >
                            {noRows.length === 0 ? (
                              <div
                                style={{
                                  gridColumn: "1 / -1",
                                  color: "#777",
                                  fontSize: "12px",
                                }}
                              >
                                Zatím nikdo.
                              </div>
                            ) : (
                              noRows.map((row) => (
                                <div
                                  key={`${match.id}-no-${row.user_id}`}
                                  style={{
                                    minWidth: 0,
                                    color: "#e8e8e8",
                                    fontSize: "12px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {getPlayerNameByUserId(row.user_id)}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            borderRadius: "12px",
                            background: "rgba(52,152,219,.05)",
                            border: "1px solid rgba(52,152,219,.20)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: "10px 11px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "8px",
                              color: "#83ccff",
                              fontSize: "12px",
                              fontWeight: 950,
                            }}
                          >
                            <span>NEHLASOVALI ({notVotedPlayers.length})</span>

                            {isAdmin && notVotedPlayers.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCreateNoVoteFines(match, notVotedPlayers)
                                }
                                disabled={isSavingFine}
                                style={{
                                  border: "none",
                                  borderRadius: "8px",
                                  padding: "6px 8px",
                                  background: "rgba(241,196,15,.95)",
                                  color: "#111",
                                  fontSize: "10px",
                                  fontWeight: 950,
                                  cursor: isSavingFine ? "default" : "pointer",
                                  opacity: isSavingFine ? 0.65 : 1,
                                }}
                              >
                                {isSavingFine ? "UKLÁDÁM..." : "POKUTA"}
                              </button>
                            )}
                          </div>

                          <div
                            style={{
                              padding: "0 11px 11px",
                              display: "grid",
                              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                              gap: "6px 10px",
                            }}
                          >
                            {notVotedPlayers.length === 0 ? (
                              <div
                                style={{
                                  gridColumn: "1 / -1",
                                  color: "#777",
                                  fontSize: "12px",
                                }}
                              >
                                Všichni hlasovali.
                              </div>
                            ) : (
                              notVotedPlayers.map((player) => (
                                <div
                                  key={`${match.id}-not-voted-${player.id}`}
                                  style={{
                                    minWidth: 0,
                                    color: "#e8e8e8",
                                    fontSize: "12px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {player.name}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ADMIN AKCE */}
                  {isAdmin && (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "7px",
                        paddingTop: "9px",
                        marginTop: "-2px",
                        borderTop: "1px solid rgba(255,255,255,.055)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMatchId(match.id);
                          setSelectedMode("detail");
                          setMessage("");
                        }}
                        style={{
                          border: "none",
                          borderRadius: "9px",
                          padding: "7px 10px",
                          background: "rgba(255,255,255,.055)",
                          color: "#9a9a9a",
                          fontSize: "10px",
                          fontWeight: 950,
                          cursor: "pointer",
                        }}
                      >
                        ⚙ SPRÁVA
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleDeleteMatch(
                            match.id,
                            `${match.homeTeam} vs. ${match.awayTeam}`
                          )
                        }
                        disabled={deletingMatchId === match.id}
                        style={{
                          border: "none",
                          borderRadius: "9px",
                          padding: "7px 10px",
                          background: "rgba(231,76,60,.07)",
                          color: "#e77676",
                          fontSize: "10px",
                          fontWeight: 950,
                          cursor:
                            deletingMatchId === match.id ? "default" : "pointer",
                          opacity: deletingMatchId === match.id ? 0.6 : 1,
                        }}
                      >
                        {deletingMatchId === match.id ? "MAŽU..." : "🗑 SMAZAT"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin ? (
        <div style={{ ...modernCardStyle, padding: "14px" }}>
          <button
            style={primaryButtonStyle}
            onClick={() => {
              setShowAddForm((prev) => !prev);
              setMessage("");
            }}
          >
            {showAddForm ? "Zavřít formulář" : "＋ Přidat zápas"}
          </button>

          {showAddForm && (
            <div
              style={{
                marginTop: "14px",
                display: "grid",
                gap: "10px",
              }}
            >
              <select
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value as "A" | "B")}
                style={{
                  ...styles.input,
                  appearance: "none",
                }}
              >
                <option value="A" style={{ background: "#111111", color: "white" }}>
                  A-tým
                </option>
                {hasBTeam && (
                  <option value="B" style={{ background: "#111111", color: "white" }}>
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

              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={styles.input}
              />

              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                style={styles.input}
              />

              <input
                type="text"
                placeholder="Hřiště / místo"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                style={styles.input}
              />

              <select
                value={newVenue}
                onChange={(e) => setNewVenue(e.target.value as "home" | "away")}
                style={{
                  ...styles.input,
                  appearance: "none",
                }}
              >
                <option value="home" style={{ background: "#111111", color: "white" }}>
                  Doma
                </option>
                <option value="away" style={{ background: "#111111", color: "white" }}>
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
                  ...softButtonStyle,
                  width: "100%",
                }}
                onClick={() => setShowAddForm(false)}
              >
                Zrušit
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            ...modernCardStyle,
            padding: "14px",
            color: "#b8b8b8",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          Jako člen týmu můžeš sledovat zápasy, hlasovat v anketě a otevřít live
          zápas.
        </div>
      )}
    </div>
  );
}