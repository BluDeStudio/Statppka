"use client";

import { useEffect, useMemo, useState } from "react";
import MatchDetail from "@/components/MatchDetail";
import MatchLiveScreen from "@/components/MatchLiveScreen";
import { styles } from "@/styles/appStyles";
import type { FinishedMatch, PlannedMatch } from "@/app/page";

type MatchesScreenProps = {
  clubId: string;
  clubName: string;
  hasBTeam: boolean;
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

export default function MatchesScreen({
  clubId,
  clubName,
  hasBTeam,
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
  const [selectedMode, setSelectedMode] = useState<"detail" | "live" | null>(null);
  const [matchOverrides, setMatchOverrides] = useState<Record<string, PlannedMatch>>(
    {}
  );

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

  const getFilterButtonStyle = (value: "ALL" | "A" | "B"): React.CSSProperties => ({
    ...inactiveButtonStyle,
    background: filter === value ? primaryColor : "rgba(255,255,255,0.1)",
  });

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
                    </div>

                    {isAdmin && (
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
                      </div>
                    )}
                  </div>
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
            Jako člen týmu můžeš plánované zápasy zatím pouze sledovat.
          </div>
        )}

        {message && (
          <p style={{ marginTop: "12px", color: "#d9d9d9" }}>{message}</p>
        )}
      </div>
    </div>
  );
}


