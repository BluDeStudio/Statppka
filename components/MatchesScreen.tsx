"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MatchDetail from "@/components/MatchDetail";
import MatchLiveScreen from "@/components/MatchLiveScreen";
import {
  getPlayersByClubId,
  getClubMemberPlayersByClubId,
  type Player,
  type ClubMemberPlayer,
} from "@/lib/players";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch, PlannedMatch } from "@/app/page";

type MatchAttendanceStatus = "yes" | "no";

type MatchAttendanceRow = {
  id?: string;
  match_id: string;
  user_id: string;
  status: MatchAttendanceStatus;
  created_at?: string | null;
};

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

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isMatchInFuture(match: PlannedMatch) {
  const now = new Date();
  const datePart = normalizeDateToIso(match.date);
  const timePart = match.time?.slice(0, 5) || "23:59";

  if (!datePart) return true;

  const matchDate = new Date(`${datePart}T${timePart}:00`);
  if (Number.isNaN(matchDate.getTime())) return true;

  return matchDate.getTime() >= now.getTime();
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
  const [expandedAttendanceMatchId, setExpandedAttendanceMatchId] = useState<
    string | null
  >(null);
  const [matchOverrides, setMatchOverrides] = useState<
    Record<string, PlannedMatch>
  >({});

  const [players, setPlayers] = useState<Player[]>([]);
  const [clubMemberPlayers, setClubMemberPlayers] = useState<
    ClubMemberPlayer[]
  >([]);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, MatchAttendanceRow[]>
  >({});
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceSavingMatchId, setAttendanceSavingMatchId] = useState<
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

  const allMatchPeople = useMemo(() => {
    const byUserId = new Map<string, { userId: string; name: string }>();

    for (const player of players) {
      if (player.profile_id) {
        byUserId.set(player.profile_id, {
          userId: player.profile_id,
          name: player.name,
        });
      }
    }

    for (const member of clubMemberPlayers) {
      if (!byUserId.has(member.id)) {
        byUserId.set(member.id, {
          userId: member.id,
          name: member.name,
        });
      }
    }

    return Array.from(byUserId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "cs")
    );
  }, [players, clubMemberPlayers]);

  const loadAttendanceData = async () => {
    setAttendanceLoading(true);

    const matchIds = availableMatches.map((match) => match.id);

    const [playersData, clubMembersData, attendanceResult] = await Promise.all([
      getPlayersByClubId(clubId),
      getClubMemberPlayersByClubId(clubId),
      matchIds.length > 0
        ? supabase.from("match_attendance").select("*").in("match_id", matchIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (attendanceResult.error) {
      console.error("Nepodařilo se načíst účast na zápasy:", attendanceResult.error);
    }

    const nextAttendanceMap: Record<string, MatchAttendanceRow[]> = {};
    const attendanceRows = (attendanceResult.data as MatchAttendanceRow[]) ?? [];

    for (const matchId of matchIds) {
      nextAttendanceMap[matchId] = attendanceRows.filter(
        (row) => row.match_id === matchId
      );
    }

    setPlayers(playersData ?? []);
    setClubMemberPlayers(clubMembersData ?? []);
    setAttendanceMap(nextAttendanceMap);
    setAttendanceLoading(false);
  };

  useEffect(() => {
    void loadAttendanceData();
  }, [clubId, plannedMatches, finishedMatchIds]);

  const getAttendanceRows = (matchId: string) => {
    return attendanceMap[matchId] ?? [];
  };

  const getAttendanceSummary = (matchId: string) => {
    const rows = getAttendanceRows(matchId);
    const yesCount = rows.filter((row) => row.status === "yes").length;
    const noCount = rows.filter((row) => row.status === "no").length;
    const votedUserIds = new Set(rows.map((row) => row.user_id));
    const notVotedCount = allMatchPeople.filter(
      (person) => !votedUserIds.has(person.userId)
    ).length;

    return {
      total: rows.length,
      yesCount,
      noCount,
      notVotedCount,
    };
  };

  const getPersonName = (userIdValue: string) => {
    return (
      allMatchPeople.find((person) => person.userId === userIdValue)?.name ??
      "Neznámý hráč"
    );
  };

  const getYesPeople = (matchId: string) => {
    return getAttendanceRows(matchId)
      .filter((row) => row.status === "yes")
      .slice()
      .sort((a, b) =>
        getPersonName(a.user_id).localeCompare(getPersonName(b.user_id), "cs")
      );
  };

  const getNoPeople = (matchId: string) => {
    return getAttendanceRows(matchId)
      .filter((row) => row.status === "no")
      .slice()
      .sort((a, b) =>
        getPersonName(a.user_id).localeCompare(getPersonName(b.user_id), "cs")
      );
  };

  const getNonVotedPeople = (matchId: string) => {
    const votedUserIds = new Set(getAttendanceRows(matchId).map((row) => row.user_id));

    return allMatchPeople
      .filter((person) => !votedUserIds.has(person.userId))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  };

  const getMyAttendanceStatus = (matchId: string): MatchAttendanceStatus | null => {
    const myRow = getAttendanceRows(matchId).find((row) => row.user_id === userId);
    return myRow?.status ?? null;
  };

  const handleMatchVote = async (
    matchId: string,
    status: MatchAttendanceStatus
  ) => {
    setAttendanceSavingMatchId(matchId);
    setMessage("");

    const { error } = await supabase.from("match_attendance").upsert(
      {
        match_id: matchId,
        user_id: userId,
        status,
      },
      {
        onConflict: "match_id,user_id",
      }
    );

    if (error) {
      console.error("Nepodařilo se uložit účast na zápas:", error);
      setMessage("Nepodařilo se uložit účast na zápas.");
      setAttendanceSavingMatchId(null);
      return;
    }

    const { data: refreshedRows, error: refreshError } = await supabase
      .from("match_attendance")
      .select("*")
      .eq("match_id", matchId);

    if (refreshError) {
      console.error("Nepodařilo se obnovit účast na zápas:", refreshError);
    }

    setAttendanceMap((prev) => ({
      ...prev,
      [matchId]: (refreshedRows as MatchAttendanceRow[]) ?? [],
    }));

    setMessage(
      status === "yes"
        ? "Potvrdil jsi účast na zápas."
        : "Označil jsi, že nepřijdeš na zápas."
    );
    setAttendanceSavingMatchId(null);
  };

  const handleAddMatch = async () => {
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
    const confirmed = window.confirm(`Opravdu chceš smazat zápas "${matchTitle}"?`);

    if (!confirmed) return;

    setDeletingMatchId(matchId);
    setMessage("");

    const { error: deleteAttendanceError } = await supabase
      .from("match_attendance")
      .delete()
      .eq("match_id", matchId);

    if (deleteAttendanceError) {
      console.error("Nepodařilo se smazat účast na zápas:", deleteAttendanceError);
    }

    const result = await onDeleteMatch(matchId);

    if (!result.success) {
      setMessage(result.errorMessage ?? "Nepodařilo se smazat zápas.");
      setDeletingMatchId(null);
      return;
    }

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

  if (selectedMatch !== null && selectedMode === "live" && isAdmin) {
    return (
      <MatchLiveScreen
        clubId={clubId}
        primaryColor={primaryColor}
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
        date={
          selectedMatch.time
            ? `${formatDisplayDate(selectedMatch.date)} ${selectedMatch.time}`
            : formatDisplayDate(selectedMatch.date)
        }
        selectedPlayers={[]}
        goalkeeper={null}
      />
    );
  }

  if (selectedMatch !== null && selectedMode === "detail" && isAdmin) {
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
        date={
          selectedMatch.time
            ? `${formatDisplayDate(selectedMatch.date)} ${selectedMatch.time}`
            : formatDisplayDate(selectedMatch.date)
        }
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
              const isExpandedAttendance = expandedAttendanceMatchId === match.id;
              const summary = getAttendanceSummary(match.id);
              const myStatus = getMyAttendanceStatus(match.id);
              const yesPeople = getYesPeople(match.id);
              const noPeople = getNoPeople(match.id);
              const nonVotedPeople = getNonVotedPeople(match.id);
              const canVote = isMatchInFuture(match);

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
                          : "Klikni na správu zápasu."}
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
                          HLASOVALO: {attendanceLoading ? "..." : summary.total}
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
                          BUDU: {attendanceLoading ? "..." : summary.yesCount}
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
                          NEBUDU: {attendanceLoading ? "..." : summary.noCount}
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
                          NEHLASOVAL: {attendanceLoading ? "..." : summary.notVotedCount}
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
                        onClick={() => {
                          setExpandedAttendanceMatchId((prev) =>
                            prev === match.id ? null : match.id
                          );
                          setMessage("");
                        }}
                      >
                        {isExpandedAttendance ? "Zavřít" : "Anketa"}
                      </button>

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

                          <button
                            style={{
                              minWidth: "92px",
                              height: "36px",
                              borderRadius: "8px",
                              border: "none",
                              background: "#ff3b3b",
                              color: "white",
                              cursor:
                                deletingMatchId === match.id ? "default" : "pointer",
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

                  {isExpandedAttendance && (
                    <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => void handleMatchVote(match.id, "yes")}
                          disabled={!canVote || attendanceSavingMatchId === match.id}
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
                            cursor:
                              !canVote || attendanceSavingMatchId === match.id
                                ? "default"
                                : "pointer",
                            opacity:
                              !canVote || attendanceSavingMatchId === match.id
                                ? 0.7
                                : 1,
                          }}
                        >
                          BUDU
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleMatchVote(match.id, "no")}
                          disabled={!canVote || attendanceSavingMatchId === match.id}
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
                            cursor:
                              !canVote || attendanceSavingMatchId === match.id
                                ? "default"
                                : "pointer",
                            opacity:
                              !canVote || attendanceSavingMatchId === match.id
                                ? 0.7
                                : 1,
                          }}
                        >
                          NEBUDU
                        </button>
                      </div>

                      {!canVote && (
                        <div
                          style={{
                            padding: "12px",
                            borderRadius: "12px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            color: "#cfcfcf",
                            fontSize: "13px",
                            lineHeight: 1.5,
                          }}
                        >
                          U staršího zápasu už hlasování neměníme. Přehled zůstává vidět.
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
                            BUDU ({attendanceLoading ? "..." : yesPeople.length})
                          </div>

                          {yesPeople.length === 0 ? (
                            <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                              Zatím nikdo.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: "6px" }}>
                              {yesPeople.map((row) => (
                                <div
                                  key={`${match.id}-yes-${row.user_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPersonName(row.user_id)}
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
                            NEBUDU ({attendanceLoading ? "..." : noPeople.length})
                          </div>

                          {noPeople.length === 0 ? (
                            <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                              Zatím nikdo.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: "6px" }}>
                              {noPeople.map((row) => (
                                <div
                                  key={`${match.id}-no-${row.user_id}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {getPersonName(row.user_id)}
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
                            NEHLASOVAL ({attendanceLoading ? "..." : nonVotedPeople.length})
                          </div>

                          {nonVotedPeople.length === 0 ? (
                            <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                              Všichni hlasovali.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: "6px" }}>
                              {nonVotedPeople.map((person) => (
                                <div
                                  key={`${match.id}-not-voted-${person.userId}`}
                                  style={{ fontSize: "13px", color: "white" }}
                                >
                                  {person.name}
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
            Jako člen týmu můžeš plánované zápasy sledovat a hlasovat svou účast.
          </div>
        )}

        {message && (
          <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
        )}
      </div>
    </div>
  );
}