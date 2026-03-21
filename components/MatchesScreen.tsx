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
  const [lineupSaved, setLineupSaved] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [goalkeeper, setGoalkeeper] = useState<number | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTeam, setNewTeam] = useState<"A" | "B">("A");
  const [newOpponent, setNewOpponent] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newVenue, setNewVenue] = useState<"home" | "away">("home");
  const [message, setMessage] = useState("");
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [savingMatch, setSavingMatch] = useState(false);

  useEffect(() => {
    onLiveModeChange(selectedMatchId !== null && lineupSaved && isAdmin);
  }, [selectedMatchId, lineupSaved, onLiveModeChange, isAdmin]);

  useEffect(() => {
    if (!hasBTeam && filter === "B") {
      setFilter("ALL");
    }

    if (!hasBTeam && newTeam === "B") {
      setNewTeam("A");
    }
  }, [hasBTeam, filter, newTeam]);

  const availableMatches = useMemo(() => {
    return plannedMatches
      .filter((match) => !finishedMatchIds.includes(match.id))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [plannedMatches, finishedMatchIds]);

  const filteredMatches =
    filter === "ALL"
      ? availableMatches
      : availableMatches.filter((match) => match.team === filter);

  const selectedMatch =
    selectedMatchId !== null
      ? plannedMatches.find((match) => match.id === selectedMatchId) ?? null
      : null;

  const teamLabelA = clubName.trim() || "Můj tým";
  const teamLabelB = `${teamLabelA} B`;

  const primaryButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    background: primaryColor,
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
      setLineupSaved(false);
      setSelectedPlayers([]);
      setGoalkeeper(null);
    }

    setMessage("Zápas byl smazán.");
    setDeletingMatchId(null);
  };

  if (selectedMatch !== null && lineupSaved && isAdmin) {
    return (
      <MatchLiveScreen
        clubId={clubId}
        primaryColor={primaryColor}
        onBack={() => setLineupSaved(false)}
        onFinishMatch={async (finishedMatch) => {
          const result = await onMatchFinished(finishedMatch);

          if (!result.success) {
            setMessage(result.errorMessage ?? "Nepodařilo se uložit odehraný zápas.");
            return;
          }

          setSelectedMatchId(null);
          setLineupSaved(false);
          setSelectedPlayers([]);
          setGoalkeeper(null);
        }}
        matchId={selectedMatch.id}
        matchTitle={`${selectedMatch.homeTeam} vs. ${selectedMatch.awayTeam}`}
        team={selectedMatch.team}
        date={formatDisplayDate(selectedMatch.date)}
        selectedPlayers={selectedPlayers}
        goalkeeper={goalkeeper}
      />
    );
  }

  if (selectedMatch !== null && isAdmin) {
    return (
      <MatchDetail
        clubId={clubId}
        primaryColor={primaryColor}
        onBack={() => setSelectedMatchId(null)}
        onSaveLineup={(players, gk) => {
          setSelectedPlayers(players);
          setGoalkeeper(gk);
          setLineupSaved(true);
        }}
        matchTitle={`${selectedMatch.homeTeam} vs. ${selectedMatch.awayTeam}`}
        team={selectedMatch.team}
        date={formatDisplayDate(selectedMatch.date)}
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

      {showAddForm && isAdmin && (
        <div
          style={{
            ...styles.card,
            marginBottom: "12px",
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

            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
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
                background: "rgba(255,255,255,0.12)",
              }}
              onClick={() => setShowAddForm(false)}
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        {filteredMatches.length === 0 ? (
          <div style={{ color: "#b8b8b8" }}>
            Žádné plánované zápasy pro tento filtr.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {filteredMatches.map((match) => (
              <div
                key={match.id}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "14px",
                  padding: "12px",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <div
                    onClick={() => {
                      if (!isAdmin) return;

                      setSelectedMatchId(match.id);
                      setLineupSaved(false);
                      setSelectedPlayers([]);
                      setGoalkeeper(null);
                    }}
                    style={{
                      cursor: isAdmin ? "pointer" : "default",
                      flex: 1,
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                      {formatDisplayDate(match.date)} — {match.team}-tým
                    </div>

                    <div style={{ fontWeight: "bold", marginTop: "4px" }}>
                      {match.homeTeam} vs. {match.awayTeam}
                    </div>

                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "13px",
                        color: "#d4d4d4",
                      }}
                    >
                      {isAdmin ? "Klikni pro správu zápasu" : "Pouze zobrazení"}
                    </div>
                  </div>

                  {isAdmin && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          border: "none",
                          background: primaryColor,
                          color: "white",
                          cursor: "pointer",
                          fontWeight: "bold",
                        }}
                        onClick={() => {
                          setSelectedMatchId(match.id);
                          setLineupSaved(false);
                          setSelectedPlayers([]);
                          setGoalkeeper(null);
                        }}
                      >
                        ✏️
                      </button>

                      <button
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#ff3b3b",
                          color: "white",
                          cursor: deletingMatchId === match.id ? "default" : "pointer",
                          fontWeight: "bold",
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
                        {deletingMatchId === match.id ? "..." : "✕"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isAdmin ? (
          !showAddForm && (
            <button
              style={primaryButtonStyle}
              onClick={() => setShowAddForm(true)}
            >
              Přidat zápas
            </button>
          )
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