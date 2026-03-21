"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import PlayersScreen from "@/components/PlayersScreen";
import MatchesScreen from "@/components/MatchesScreen";
import PlayedMatchDetailScreen from "@/components/PlayedMatchDetailScreen";
import PlayedMatchesScreen from "@/components/PlayedMatchesScreen";
import StatsScreen from "@/components/StatsScreen";
import LoginScreen from "@/components/LoginScreen";
import TeamSetupScreen from "@/components/TeamSetupScreen";
import { styles } from "@/styles/appStyles";
import { teamTheme } from "@/data/teamTheme";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateProfile, type UserProfile } from "@/lib/getUserProfile";
import {
  createInviteLink,
  getClubById,
  getMyClubMembership,
  type Club,
  type ClubMember,
} from "@/lib/club";
import {
  createPlannedMatch,
  deleteFinishedMatch,
  deletePlannedMatch,
  getFinishedMatchesByClubId,
  getPlannedMatchesByClubId,
  saveFinishedMatch,
} from "@/lib/matches";

type Screen = "team" | "players" | "planned" | "played" | "stats";

export type FinishedMatchEvent =
  | {
      type: "goal_for";
      scorer: number;
      assist: number | null;
    }
  | {
      type: "goal_against";
    };

export type FinishedMatch = {
  id: string;
  matchTitle: string;
  team: "A" | "B";
  date: string;
  score: string;
  goalkeeperNumber: number | null;
  goalsAgainst: number;
  playerStats: {
    playerNumber: number;
    goals: number;
    assists: number;
  }[];
  events: FinishedMatchEvent[];
};

export type PlannedMatch = {
  id: string;
  date: string;
  opponent: string;
  team: "A" | "B";
  homeTeam: string;
  awayTeam: string;
};

function clearSupabaseStorage() {
  if (typeof window === "undefined") return;

  const keys: string[] = [];

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("sb-")) {
      keys.push(key);
    }
  }

  keys.forEach((key) => window.localStorage.removeItem(key));
}

function getScreenTitle(screen: Screen) {
  switch (screen) {
    case "team":
      return "MŮJ TÝM";
    case "players":
      return "HRÁČI";
    case "planned":
      return "PLÁNOVANÉ ZÁPASY";
    case "played":
      return "ODEHRANÉ ZÁPASY";
    case "stats":
      return "STATISTIKY";
    default:
      return "";
  }
}

function getContrastTextColor(hexColor?: string | null) {
  if (!hexColor) return "#ffffff";

  const clean = hexColor.replace("#", "");
  if (clean.length !== 6) return "#ffffff";

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 145 ? "#111111" : "#ffffff";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("team");
  const [isLiveMatch, setIsLiveMatch] = useState(false);
  const [finishedMatches, setFinishedMatches] = useState<FinishedMatch[]>([]);
  const [selectedPlayedMatchId, setSelectedPlayedMatchId] = useState<string | null>(null);

  const [plannedMatches, setPlannedMatches] = useState<PlannedMatch[]>([]);

  const [session, setSession] = useState<Session | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [appError, setAppError] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentClub, setCurrentClub] = useState<Club | null>(null);
  const [currentMembership, setCurrentMembership] = useState<ClubMember | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");

  const isMainMenuVisible =
    !isLiveMatch && selectedPlayedMatchId === null && screen === "team";

  const selectedPlayedMatch = finishedMatches.find(
    (match) => match.id === selectedPlayedMatchId
  );

  const finishedMatchIds = finishedMatches.map((match) => match.id);

  const loadClubMatchData = useCallback(async (clubId: string) => {
    const [planned, finished] = await Promise.all([
      getPlannedMatchesByClubId(clubId),
      getFinishedMatchesByClubId(clubId),
    ]);

    setPlannedMatches(planned);
    setFinishedMatches(finished);
  }, []);

  const loadAppState = useCallback(
    async (currentSession: Session | null) => {
      try {
        setAppError("");

        if (!currentSession) {
          setSession(null);
          setUserProfile(null);
          setCurrentClub(null);
          setCurrentMembership(null);
          setPlannedMatches([]);
          setFinishedMatches([]);
          return;
        }

        setSession(currentSession);

        const profile = await getOrCreateProfile();
        setUserProfile(profile);

        const membership = await getMyClubMembership(currentSession.user.id);
        setCurrentMembership(membership);

        if (!membership) {
          setCurrentClub(null);
          setPlannedMatches([]);
          setFinishedMatches([]);
          return;
        }

        const club = await getClubById(membership.club_id);
        setCurrentClub(club);

        if (club) {
          await loadClubMatchData(club.id);
        } else {
          setPlannedMatches([]);
          setFinishedMatches([]);
        }
      } catch (error) {
        console.error("Chyba při načítání aplikace:", error);
        setAppError("Nepodařilo se načíst přihlášení nebo tým.");
        setUserProfile(null);
        setCurrentClub(null);
        setCurrentMembership(null);
        setPlannedMatches([]);
        setFinishedMatches([]);
      }
    },
    [loadClubMatchData]
  );

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setBootLoading(true);

        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        await loadAppState(currentSession ?? null);
      } catch (error) {
        console.error("Auth init error:", error);
        if (!mounted) return;
        setAppError("Nepodařilo se spustit přihlášení.");
        setSession(null);
      } finally {
        if (mounted) {
          setBootLoading(false);
        }
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      setBootLoading(true);

      void (async () => {
        await loadAppState(newSession ?? null);

        if (mounted) {
          setBootLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAppState]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearSupabaseStorage();
      setSession(null);
      setUserProfile(null);
      setCurrentClub(null);
      setCurrentMembership(null);
      setSelectedPlayedMatchId(null);
      setIsLiveMatch(false);
      setPlannedMatches([]);
      setFinishedMatches([]);
      setScreen("team");
      setBootLoading(false);
      window.location.replace("/");
    }
  };

  const handleCreateInvite = async () => {
    if (!currentClub || !session) return;

    const link = await createInviteLink(currentClub.id, session.user.id);

    if (!link) {
      setInviteMessage("Nepodařilo se vytvořit pozvánku.");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setInviteMessage("Pozvánkový odkaz byl zkopírován.");
    } catch {
      setInviteMessage(link);
    }
  };

  const appTitle = teamTheme.appName ?? "StAtppka";
  const currentDisplayName = currentClub?.name ?? "Bez týmu";

  const dynamicTheme = useMemo(() => {
    const primary = currentClub?.primary_color || teamTheme.primary;
    const secondary = currentClub?.secondary_color || teamTheme.secondary;
    const primaryText = getContrastTextColor(primary);

    return {
      primary,
      secondary,
      primaryText,
      pageBackground: `linear-gradient(180deg, ${secondary} 0%, #111111 55%, ${secondary} 100%)`,
      phoneBackground: "rgba(255,255,255,0.03)",
      cardBackground: "rgba(255,255,255,0.04)",
      cardBorder: "rgba(255,255,255,0.06)",
      buttonBackground: primary,
      buttonText: primaryText,
      accentSoft: `${primary}22`,
      inviteBackground: `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)`,
    };
  }, [currentClub]);

  const primaryButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    background: dynamicTheme.buttonBackground,
    color: dynamicTheme.buttonText,
    border: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
  };

  const menuButtonStyle: React.CSSProperties = {
    ...styles.primaryButton,
    marginTop: 0,
    background: dynamicTheme.buttonBackground,
    color: dynamicTheme.buttonText,
    border: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
  };

  const logoutButtonStyle: React.CSSProperties = {
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.1)",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
  };

  const backButtonStyle: React.CSSProperties = {
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    background: dynamicTheme.accentSoft,
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: "bold",
    whiteSpace: "nowrap",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
  };

  const sectionHeaderCardStyle: React.CSSProperties = {
    ...styles.card,
    background: dynamicTheme.cardBackground,
    border: `1px solid ${dynamicTheme.cardBorder}`,
    marginBottom: "14px",
    padding: "12px 14px",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: "16px",
    letterSpacing: "0.3px",
    color: dynamicTheme.primary,
  };

  const mainLogoStyle: React.CSSProperties = {
    width: "140px",
    maxWidth: "40vw",
    height: "auto",
    objectFit: "contain",
    display: "block",
  };

  const iconLogoStyle: React.CSSProperties = {
    width: "72px",
    height: "72px",
    borderRadius: "18px",
    objectFit: "cover",
    display: "block",
    boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
  };

  if (bootLoading) {
    return (
      <main
        style={{
          ...styles.page,
          background: dynamicTheme.pageBackground,
        }}
      >
        <div
          style={{
            ...styles.phone,
            background: dynamicTheme.phoneBackground,
            border: `1px solid ${dynamicTheme.cardBorder}`,
          }}
        >
          <div
            style={{
              ...styles.card,
              background: dynamicTheme.cardBackground,
              border: `1px solid ${dynamicTheme.cardBorder}`,
            }}
          >
            <h2 style={styles.screenTitle}>Načítám přihlášení...</h2>
            {appError && (
              <p style={{ marginTop: "12px", color: "#ffb3b3" }}>{appError}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main
        style={{
          ...styles.page,
          background: dynamicTheme.pageBackground,
        }}
      >
        <div
          style={{
            ...styles.phone,
            background: dynamicTheme.phoneBackground,
            border: `1px solid ${dynamicTheme.cardBorder}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <img
              src="/logo-main.png"
              alt="StAtppka logo"
              style={mainLogoStyle}
            />

            <div>
              <h1 style={{ ...styles.title, margin: 0 }}>{appTitle}</h1>
              <p style={{ color: teamTheme.mutedText, marginTop: "4px" }}>
                Zápasové statistiky pro tvůj tým
              </p>
            </div>
          </div>

          {appError && (
            <div
              style={{
                ...styles.card,
                background: dynamicTheme.cardBackground,
                border: `1px solid ${dynamicTheme.cardBorder}`,
              }}
            >
              <p style={{ color: "#ffb3b3", margin: 0 }}>{appError}</p>
            </div>
          )}

          <LoginScreen />
        </div>
      </main>
    );
  }

  if (!currentClub || !currentMembership) {
    return (
      <main
        style={{
          ...styles.page,
          background: dynamicTheme.pageBackground,
        }}
      >
        <div
          style={{
            ...styles.phone,
            background: dynamicTheme.phoneBackground,
            border: `1px solid ${dynamicTheme.cardBorder}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <img
                src="/logo-icon.png"
                alt="StAtppka icon"
                style={iconLogoStyle}
              />

              <div>
                <h1 style={{ ...styles.title, margin: 0 }}>{appTitle}</h1>
                <p style={{ color: teamTheme.mutedText, marginTop: "4px" }}>
                  {session.user.email}
                </p>
                {userProfile?.email && (
                  <p
                    style={{
                      color: teamTheme.mutedText,
                      marginTop: "4px",
                      fontSize: "12px",
                    }}
                  >
                    Profil připraven
                  </p>
                )}
              </div>
            </div>

            <button onClick={handleLogout} style={logoutButtonStyle}>
              Odhlásit
            </button>
          </div>

          {appError && (
            <div
              style={{
                ...styles.card,
                background: dynamicTheme.cardBackground,
                border: `1px solid ${dynamicTheme.cardBorder}`,
              }}
            >
              <p style={{ color: "#ffb3b3", margin: 0 }}>{appError}</p>
            </div>
          )}

          <TeamSetupScreen
            userId={session.user.id}
            onReady={async (club, membership) => {
              setCurrentClub(club);
              setCurrentMembership(membership);
              setAppError("");
              await loadClubMatchData(club.id);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        ...styles.page,
        background: dynamicTheme.pageBackground,
      }}
    >
      <div
        style={{
          ...styles.phone,
          background: dynamicTheme.phoneBackground,
          border: `1px solid ${dynamicTheme.cardBorder}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              minWidth: 0,
            }}
          >
            <img
              src="/logo-icon.png"
              alt="StAtppka icon"
              style={iconLogoStyle}
            />

            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  ...styles.title,
                  margin: 0,
                  lineHeight: 1.1,
                  wordBreak: "break-word",
                }}
              >
                {currentDisplayName}
              </h1>
              <p style={{ color: teamTheme.mutedText, marginTop: "8px" }}>
                {session.user.email}
              </p>
            </div>
          </div>

          <button onClick={handleLogout} style={logoutButtonStyle}>
            Odhlásit
          </button>
        </div>

        {isMainMenuVisible && (
          <div style={{ display: "grid", gap: "10px" }}>
            <button style={menuButtonStyle} onClick={() => setScreen("team")}>
              MŮJ TÝM
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("players")}>
              HRÁČI
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("planned")}>
              PLÁNOVANÉ ZÁPASY
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("played")}>
              ODEHRANÉ ZÁPASY
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("stats")}>
              STATISTIKY
            </button>
          </div>
        )}

        {!isMainMenuVisible && !isLiveMatch && selectedPlayedMatchId === null && (
          <div style={sectionHeaderCardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <button onClick={() => setScreen("team")} style={backButtonStyle}>
                ← Zpět
              </button>

              <div style={sectionTitleStyle}>{getScreenTitle(screen)}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: isMainMenuVisible ? "20px" : "0px" }}>
          {screen === "team" && selectedPlayedMatchId === null && !isLiveMatch && (
            <div
              style={{
                ...styles.card,
                background: dynamicTheme.cardBackground,
                border: `1px solid ${dynamicTheme.cardBorder}`,
                padding: "18px 16px",
              }}
            >
              <div style={{ display: "grid", gap: "14px" }}>
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${dynamicTheme.cardBorder}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#d9d9d9",
                      lineHeight: 1.5,
                    }}
                  >
                    Sdílej pozvánkový odkaz s hráči a členy týmu, aby se mohli
                    připojit do stejného klubu.
                  </div>
                </div>

                <button style={primaryButtonStyle} onClick={handleCreateInvite}>
                  Vygenerovat pozvánkový odkaz
                </button>

                {inviteMessage && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${dynamicTheme.cardBorder}`,
                      color: "#d9d9d9",
                      fontSize: "14px",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {inviteMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {screen === "players" && selectedPlayedMatchId === null && !isLiveMatch && (
            <PlayersScreen
              clubId={currentClub.id}
              primaryColor={currentClub.primary_color}
            />
          )}

          {screen === "planned" && selectedPlayedMatchId === null && (
  <MatchesScreen
    clubId={currentClub.id}
    clubName={currentClub.name}
    hasBTeam={currentClub.has_b_team}
    primaryColor={currentClub.primary_color}
    plannedMatches={plannedMatches}
    finishedMatchIds={finishedMatchIds}
    onLiveModeChange={setIsLiveMatch}
    onAddMatch={async (newMatch) => {
      if (!session) {
        return {
          success: false,
          errorMessage: "Chybí přihlášený uživatel.",
        };
      }

      const result = await createPlannedMatch({
        clubId: currentClub.id,
        createdBy: session.user.id,
        match: newMatch,
      });

      if (!result.match) {
        setAppError(result.errorMessage ?? "Nepodařilo se uložit zápas.");
        return {
          success: false,
          errorMessage:
            result.errorMessage ?? "Nepodařilo se uložit zápas.",
        };
      }

      setPlannedMatches((prev) => [...prev, result.match as PlannedMatch]);
      setAppError("");

      return {
        success: true,
      };
    }}
    onDeleteMatch={async (matchId) => {
      const result = await deletePlannedMatch(matchId);

      if (!result.success) {
        setAppError(result.errorMessage ?? "Nepodařilo se smazat zápas.");
        return {
          success: false,
          errorMessage: result.errorMessage ?? "Nepodařilo se smazat zápas.",
        };
      }

      setPlannedMatches((prev) => prev.filter((match) => match.id !== matchId));
      setAppError("");

      return {
        success: true,
      };
    }}
    onMatchFinished={async (finishedMatch) => {
      if (!session) {
        return {
          success: false,
          errorMessage: "Chybí přihlášený uživatel.",
        };
      }

      const result = await saveFinishedMatch({
        clubId: currentClub.id,
        createdBy: session.user.id,
        finishedMatch,
      });

      if (!result.finishedMatch) {
        setAppError(
          result.errorMessage ?? "Nepodařilo se uložit odehraný zápas."
        );
        return {
          success: false,
          errorMessage:
            result.errorMessage ??
            "Nepodařilo se uložit odehraný zápas.",
        };
      }

      setFinishedMatches((prev) => [
        result.finishedMatch as FinishedMatch,
        ...prev,
      ]);
      setPlannedMatches((prev) =>
        prev.filter((match) => match.id !== finishedMatch.id)
      );
      setScreen("played");
      setIsLiveMatch(false);
      setAppError("");

      return {
        success: true,
      };
    }}
    isAdmin={true}
  />
)}

          {screen === "played" && selectedPlayedMatchId === null && !isLiveMatch && (
            <PlayedMatchesScreen
              finishedMatches={finishedMatches}
              onSelectMatch={(matchId) => setSelectedPlayedMatchId(matchId)}
              onDeleteMatch={async (matchId) => {
                const result = await deleteFinishedMatch(matchId);

                if (!result.success) {
                  setAppError(result.errorMessage ?? "Nepodařilo se smazat zápas.");
                  return {
                    success: false,
                    errorMessage: result.errorMessage ?? "Nepodařilo se smazat zápas.",
                  };
                }

                setFinishedMatches((prev) =>
                  prev.filter((match) => match.id !== matchId)
                );

                if (selectedPlayedMatchId === matchId) {
                  setSelectedPlayedMatchId(null);
                }

                setAppError("");

                return {
                  success: true,
                };
              }}
              primaryColor={currentClub.primary_color}
            />
          )}

          {screen === "stats" && selectedPlayedMatchId === null && !isLiveMatch && (
            <StatsScreen
              clubId={currentClub.id}
              finishedMatches={finishedMatches}
              primaryColor={currentClub.primary_color}
            />
          )}

          {selectedPlayedMatchId !== null && selectedPlayedMatch && (
            <PlayedMatchDetailScreen
              clubId={currentClub.id}
              match={selectedPlayedMatch}
              onBack={() => setSelectedPlayedMatchId(null)}
            />
          )}
        </div>

        <div
          style={{
            marginTop: "18px",
            textAlign: "center",
            fontSize: "12px",
            color: "rgba(255,255,255,0.38)",
            letterSpacing: "0.4px",
          }}
        >
          {appTitle}
        </div>
      </div>
    </main>
  );
}