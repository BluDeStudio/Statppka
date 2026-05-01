"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import PlayersScreen from "@/components/PlayersScreen";
import MatchesScreen from "@/components/MatchesScreen";
import PlayedMatchDetailScreen from "@/components/PlayedMatchDetailScreen";
import PlayedMatchesScreen from "@/components/PlayedMatchesScreen";
import StatsScreen from "@/components/StatsScreen";
import DisciplineScreen from "@/components/DisciplineScreen";
import LoginScreen from "@/components/LoginScreen";
import TeamSetupScreen from "@/components/TeamSetupScreen";
import TrainingsScreen from "@/components/TrainingsScreen";
import PollsScreen from "@/components/PollsScreen";
import EditTeamScreen from "@/components/EditTeamScreen";
import PeriodsScreen from "@/components/PeriodsScreen";
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
import { getPlayersByClubId, type Player } from "@/lib/players";

type Screen =
  | "home"
  | "team"
  | "matches"
  | "trainings"
  | "polls"
  | "stats"
  | "discipline";

type TeamTab = "overview" | "players" | "periods" | "edit";
type MatchesTab = "planned" | "played";

export type FinishedMatchEvent =
  | {
      type: "goal_for";
      scorer: number;
      assist: number | null;
    }
  | {
      type: "goal_against";
    }
  | {
      type: "yellow_card";
      playerNumber: number;
    }
  | {
      type: "red_card";
      playerNumber: number;
    };

export type FinishedMatch = {
  id: string;
  matchTitle: string;
  team: "A" | "B";
  date: string;
  time?: string;
  location?: string;
  score: string;
  goalkeeperNumber: number | null;
  goalsAgainst: number;
  playerStats: {
    playerNumber: number;
    goals: number;
    assists: number;
    yellowCards?: number;
    redCards?: number;
    playedSeconds?: number;
    shotsOnTarget?: number;
    shotsOffTarget?: number;
  }[];
  events: FinishedMatchEvent[];
  finished_at?: string | null;
};

export type PlannedMatch = {
  id: string;
  date: string;
  time?: string;
  location?: string;
  opponent: string;
  team: "A" | "B";
  homeTeam: string;
  awayTeam: string;
  status?: "planned" | "prepared" | "live" | "halftime" | "finished";
  current_period?: number;
  first_half_started_at?: string | null;
  first_half_elapsed_seconds?: number;
  second_half_started_at?: string | null;
  second_half_elapsed_seconds?: number;
  goalkeeper_player_id?: string | null;
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
      return "TÝM";
    case "matches":
      return "ZÁPASY";
    case "trainings":
      return "TRÉNINKY";
    case "polls":
      return "ANKETY";
    case "stats":
      return "STATISTIKY";
    case "discipline":
      return "DISCIPLÍNA";
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

function normalizeDateToIso(value?: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed)) return trimmed.slice(0, 10);

  if (/^\d{2}\.\d{2}\.\d{4}/.test(trimmed)) {
    const [datePart] = trimmed.split(" ");
    const [day, month, year] = datePart.split(".");
    return `${year}-${month}-${day}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
    const [datePart] = trimmed.split(" ");
    const [day, month, year] = datePart.split("/");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getAge(birthDate?: string | null, atDate = new Date()) {
  if (!birthDate) return null;

  const normalized = normalizeDateToIso(birthDate);
  if (!normalized) return null;

  const birth = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  let age = atDate.getFullYear() - birth.getFullYear();
  const monthDiff = atDate.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && atDate.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

function getNextBirthdayDate(birthDate?: string | null) {
  if (!birthDate) return null;

  const normalized = normalizeDateToIso(birthDate);
  if (!normalized) return null;

  const [, month, day] = normalized.split("-");
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let next = new Date(`${today.getFullYear()}-${month}-${day}T00:00:00`);
  if (Number.isNaN(next.getTime())) return null;

  if (next.getTime() < todayStart.getTime()) {
    next = new Date(`${today.getFullYear() + 1}-${month}-${day}T00:00:00`);
  }

  return next;
}

function formatBirthdayDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.`;
}

function isSameMonthPreviousMonth(dateValue: string) {
  const normalized = normalizeDateToIso(dateValue);
  if (!normalized) return false;

  const matchDate = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(matchDate.getTime())) return false;

  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return (
    matchDate.getFullYear() === previousMonth.getFullYear() &&
    matchDate.getMonth() === previousMonth.getMonth()
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [teamTab, setTeamTab] = useState<TeamTab>("overview");
  const [matchesTab, setMatchesTab] = useState<MatchesTab>("planned");
  const [isLiveMatch, setIsLiveMatch] = useState(false);
  const [finishedMatches, setFinishedMatches] = useState<FinishedMatch[]>([]);
  const [selectedPlayedMatchId, setSelectedPlayedMatchId] = useState<string | null>(null);

  const [plannedMatches, setPlannedMatches] = useState<PlannedMatch[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const matchesLoadedRef = useRef(false);
  const matchesLoadingRef = useRef(false);

  const [overviewPlayers, setOverviewPlayers] = useState<Player[]>([]);
  const [overviewPlayersLoaded, setOverviewPlayersLoaded] = useState(false);
  const [overviewPlayersLoading, setOverviewPlayersLoading] = useState(false);

  const overviewPlayersLoadingRef = useRef(false);

  const [session, setSession] = useState<Session | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [appError, setAppError] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentClub, setCurrentClub] = useState<Club | null>(null);
  const [currentMembership, setCurrentMembership] = useState<ClubMember | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");

  const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null);
  const [availablePlayersToLink, setAvailablePlayersToLink] = useState<Player[]>([]);
  const [playerLinkLoading, setPlayerLinkLoading] = useState(false);
  const [playerLinkSavingId, setPlayerLinkSavingId] = useState<string | null>(null);
  const [playerLinkMessage, setPlayerLinkMessage] = useState("");

  const [openTrainingId, setOpenTrainingId] = useState<string | null>(null);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  const isCurrentUserAdmin = currentMembership?.role === "admin";

  const isMainMenuVisible =
    !isLiveMatch && selectedPlayedMatchId === null && screen === "home";

  const selectedPlayedMatch = finishedMatches.find(
    (match) => match.id === selectedPlayedMatchId
  );

  const finishedMatchIds = finishedMatches.map((match) => match.id);

  const plannedMatchesRenderKey = useMemo(() => {
    return plannedMatches
      .map(
        (match) =>
          `${match.id}-${match.status ?? "planned"}-${match.current_period ?? 0}-${match.first_half_elapsed_seconds ?? 0}-${match.second_half_elapsed_seconds ?? 0}`
      )
      .join("|");
  }, [plannedMatches]);

  const loadClubMatchData = useCallback(async (clubId: string, force = false) => {
    if (!force && (matchesLoadedRef.current || matchesLoadingRef.current)) {
      return;
    }

    try {
      matchesLoadingRef.current = true;
      setMatchesLoading(true);

      const [planned, finished] = await Promise.all([
        getPlannedMatchesByClubId(clubId),
        getFinishedMatchesByClubId(clubId),
      ]);

      setPlannedMatches(planned);
      setFinishedMatches(finished);

      matchesLoadedRef.current = true;
      setMatchesLoaded(true);
      setAppError("");
    } catch (error) {
      console.error("Nepodařilo se načíst zápasy:", error);
      setAppError("Nepodařilo se načíst zápasy.");
    } finally {
      matchesLoadingRef.current = false;
      setMatchesLoading(false);
    }
  }, []);

  const ensureClubMatchDataLoaded = useCallback(
    async (clubId: string) => {
      await loadClubMatchData(clubId, false);
    },
    [loadClubMatchData]
  );

  const loadOverviewPlayers = useCallback(async (clubId: string, force = false) => {
    if (!force && overviewPlayersLoadingRef.current) return;

    try {
      overviewPlayersLoadingRef.current = true;
      setOverviewPlayersLoading(true);

      const loadedPlayers = await getPlayersByClubId(clubId);

      setOverviewPlayers(loadedPlayers);
      setOverviewPlayersLoaded(true);
    } catch (error) {
      console.error("Nepodařilo se načíst hráče pro přehled:", error);
    } finally {
      overviewPlayersLoadingRef.current = false;
      setOverviewPlayersLoading(false);
    }
  }, []);

  const loadLinkedPlayerState = useCallback(
    async (clubId: string, userId: string) => {
      try {
        setPlayerLinkLoading(true);
        setPlayerLinkMessage("");

        const { data: linkedRow, error: linkedError } = await supabase
          .from("players")
          .select("*")
          .eq("club_id", clubId)
          .eq("profile_id", userId)
          .maybeSingle();

        if (linkedError) {
          console.error("Nepodařilo se načíst propojeného hráče:", linkedError);
          setLinkedPlayer(null);
          setAvailablePlayersToLink([]);
          setPlayerLinkMessage("Nepodařilo se načíst hráčský profil.");
          return;
        }

        if (linkedRow) {
          setLinkedPlayer(linkedRow as Player);
          setAvailablePlayersToLink([]);
          return;
        }

        setLinkedPlayer(null);

        const { data: freePlayers, error: freePlayersError } = await supabase
          .from("players")
          .select("*")
          .eq("club_id", clubId)
          .is("profile_id", null)
          .order("number", { ascending: true });

        if (freePlayersError) {
          console.error("Nepodařilo se načíst volné hráče:", freePlayersError);
          setAvailablePlayersToLink([]);
          setPlayerLinkMessage("Nepodařilo se načíst seznam hráčů.");
          return;
        }

        setAvailablePlayersToLink((freePlayers as Player[]) ?? []);
      } catch (error) {
        console.error("Chyba v loadLinkedPlayerState:", error);
        setLinkedPlayer(null);
        setAvailablePlayersToLink([]);
        setPlayerLinkMessage("Při načítání hráčů nastala chyba.");
      } finally {
        setPlayerLinkLoading(false);
      }
    },
    []
  );

  const resetLoadedClubData = () => {
    setPlannedMatches([]);
    setFinishedMatches([]);
    setMatchesLoaded(false);
    matchesLoadedRef.current = false;
    matchesLoadingRef.current = false;

    setOverviewPlayers([]);
    setOverviewPlayersLoaded(false);
    overviewPlayersLoadingRef.current = false;
  };

  const loadAppState = useCallback(
    async (currentSession: Session | null) => {
      try {
        setAppError("");

        if (!currentSession) {
          setSession(null);
          setUserProfile(null);
          setCurrentClub(null);
          setCurrentMembership(null);
          resetLoadedClubData();
          setLinkedPlayer(null);
          setAvailablePlayersToLink([]);
          setPlayerLinkMessage("");
          return;
        }

        setSession(currentSession);

        const profile = await getOrCreateProfile();
        setUserProfile(profile);

        const membership = await getMyClubMembership(currentSession.user.id);
        setCurrentMembership(membership);

        if (!membership) {
          setCurrentClub(null);
          resetLoadedClubData();
          setLinkedPlayer(null);
          setAvailablePlayersToLink([]);
          setPlayerLinkMessage("");
          return;
        }

        const club = await getClubById(membership.club_id);
        setCurrentClub(club);

        if (club) {
          await loadLinkedPlayerState(club.id, currentSession.user.id);
        } else {
          resetLoadedClubData();
          setLinkedPlayer(null);
          setAvailablePlayersToLink([]);
          setPlayerLinkMessage("");
        }
      } catch (error) {
        console.error("Chyba při načítání aplikace:", error);
        setAppError("Nepodařilo se načíst přihlášení nebo tým.");
        setUserProfile(null);
        setCurrentClub(null);
        setCurrentMembership(null);
        resetLoadedClubData();
        setLinkedPlayer(null);
        setAvailablePlayersToLink([]);
        setPlayerLinkMessage("");
      }
    },
    [loadLinkedPlayerState]
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session || !currentClub) return;

    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    const id = params.get("id");

    if (!open || !id) return;

    if (open === "training") {
      setScreen("trainings");
      setOpenTrainingId(id);
      setOpenMatchId(null);
      setSelectedPlayedMatchId(null);
      setIsLiveMatch(false);
    }

    if (open === "match") {
      setScreen("matches");
      setMatchesTab("planned");
      setOpenMatchId(id);
      setOpenTrainingId(null);
      setSelectedPlayedMatchId(null);
      setIsLiveMatch(false);
      void loadClubMatchData(currentClub.id, true);
    }
  }, [session, currentClub, loadClubMatchData]);

  useEffect(() => {
    if (!currentClub) return;
    if (screen !== "team" || teamTab !== "overview") return;

    void loadOverviewPlayers(currentClub.id, false);
    void ensureClubMatchDataLoaded(currentClub.id);
  }, [
    currentClub,
    screen,
    teamTab,
    loadOverviewPlayers,
    ensureClubMatchDataLoaded,
  ]);

  const todaysBirthdayPlayers = useMemo(() => {
    const today = new Date();

    return overviewPlayers
      .filter((player) => {
        const nextBirthday = getNextBirthdayDate(player.birth_date);
        if (!nextBirthday) return false;

        return (
          nextBirthday.getDate() === today.getDate() &&
          nextBirthday.getMonth() === today.getMonth()
        );
      })
      .map((player) => ({
        player,
        age: getAge(player.birth_date),
      }));
  }, [overviewPlayers]);

  const nextBirthdayPlayer = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const sorted = overviewPlayers
      .map((player) => {
        const nextBirthday = getNextBirthdayDate(player.birth_date);
        if (!nextBirthday) return null;

        const age = getAge(player.birth_date, nextBirthday);
        const diffDays = Math.ceil(
          (nextBirthday.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          player,
          nextBirthday,
          age,
          diffDays,
        };
      })
      .filter(Boolean) as {
      player: Player;
      nextBirthday: Date;
      age: number | null;
      diffDays: number;
    }[];

    return sorted.sort((a, b) => a.diffDays - b.diffDays)[0] ?? null;
  }, [overviewPlayers]);

  const playerOfPreviousMonth = useMemo(() => {
    const pointsByNumber = new Map<
      number,
      {
        points: number;
        goals: number;
        assists: number;
        matches: number;
      }
    >();

    finishedMatches
      .filter((match) => isSameMonthPreviousMonth(match.date))
      .forEach((match) => {
        match.playerStats.forEach((stat) => {
          if (!pointsByNumber.has(stat.playerNumber)) {
            pointsByNumber.set(stat.playerNumber, {
              points: 0,
              goals: 0,
              assists: 0,
              matches: 0,
            });
          }

          const current = pointsByNumber.get(stat.playerNumber)!;
          current.goals += stat.goals;
          current.assists += stat.assists;
          current.points += stat.goals + stat.assists;
          current.matches += 1;
        });
      });

    const sorted = Array.from(pointsByNumber.entries())
      .map(([playerNumber, stats]) => {
        const player = overviewPlayers.find((item) => item.number === playerNumber);

        return {
          playerNumber,
          name: player?.name ?? `#${playerNumber}`,
          ...stats,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.assists !== a.assists) return b.assists - a.assists;
        return a.name.localeCompare(b.name, "cs");
      });

    return sorted[0] ?? null;
  }, [finishedMatches, overviewPlayers]);

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
      resetLoadedClubData();
      setLinkedPlayer(null);
      setAvailablePlayersToLink([]);
      setPlayerLinkMessage("");
      setOpenTrainingId(null);
      setOpenMatchId(null);
      setScreen("home");
      setTeamTab("overview");
      setMatchesTab("planned");
      setBootLoading(false);
      window.location.replace("/");
    }
  };

  const handleCreateInvite = async () => {
    if (!currentClub || !session || !isCurrentUserAdmin) return;

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

  const handleLinkPlayer = async (player: Player) => {
    if (!session || !currentClub) return;

    try {
      setPlayerLinkSavingId(player.id);
      setPlayerLinkMessage("");

      const { data: currentPlayerRow, error: currentPlayerError } = await supabase
        .from("players")
        .select("*")
        .eq("id", player.id)
        .maybeSingle();

      if (currentPlayerError || !currentPlayerRow) {
        console.error("Nepodařilo se ověřit hráče:", currentPlayerError);
        setPlayerLinkMessage("Nepodařilo se načíst hráče.");
        return;
      }

      if (currentPlayerRow.profile_id) {
        setPlayerLinkMessage("Tento hráč už je propojený s jiným účtem.");
        await loadLinkedPlayerState(currentClub.id, session.user.id);
        return;
      }

      const { data: updatedPlayer, error: updateError } = await supabase
        .from("players")
        .update({
          profile_id: session.user.id,
        })
        .eq("id", player.id)
        .is("profile_id", null)
        .select("*")
        .single();

      if (updateError || !updatedPlayer) {
        console.error("Nepodařilo se propojit hráče:", updateError);
        setPlayerLinkMessage("Nepodařilo se propojit hráče s účtem.");
        await loadLinkedPlayerState(currentClub.id, session.user.id);
        return;
      }

      setLinkedPlayer(updatedPlayer as Player);
      setAvailablePlayersToLink([]);
      setPlayerLinkMessage("");
    } catch (error) {
      console.error("Chyba v handleLinkPlayer:", error);
      setPlayerLinkMessage("Při propojení hráče nastala chyba.");
    } finally {
      setPlayerLinkSavingId(null);
    }
  };

  const appTitle = teamTheme.appName ?? "MyTeamHub";
  const currentDisplayName = currentClub?.name ?? "Bez týmu";

  const shouldForcePlayerLink =
    !linkedPlayer && availablePlayersToLink.length > 0;

  const showMissingPlayerInfo =
    !linkedPlayer && availablePlayersToLink.length === 0;

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
    borderRadius: "0",
    objectFit: "contain",
    display: "block",
    boxShadow: "none",
    border: "none",
    background: "transparent",
    padding: 0,
  };

  const subTabBaseStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  };

  const getSubTabStyle = (active: boolean): React.CSSProperties => ({
    ...subTabBaseStyle,
    background: active ? dynamicTheme.primary : "rgba(255,255,255,0.08)",
    color: active ? dynamicTheme.primaryText : "white",
  });

  const renderMatchesLoadingCard = () => (
    <div
      style={{
        ...styles.card,
        background: dynamicTheme.cardBackground,
        border: `1px solid ${dynamicTheme.cardBorder}`,
        color: "#b8b8b8",
      }}
    >
      Načítám zápasy...
    </div>
  );

  const overviewInfoCardStyle: React.CSSProperties = {
    padding: "14px 16px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${dynamicTheme.cardBorder}`,
  };

  if (bootLoading) {
    return (
      <main style={{ ...styles.page, background: dynamicTheme.pageBackground }}>
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
      <main style={{ ...styles.page, background: dynamicTheme.pageBackground }}>
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
            <img src="/logo.png" alt="MyTeamHub logo" style={mainLogoStyle} />

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
      <main style={{ ...styles.page, background: dynamicTheme.pageBackground }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <img src="/icon.png" alt="MyTeamHub icon" style={iconLogoStyle} />

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
              resetLoadedClubData();
              await loadLinkedPlayerState(club.id, session.user.id);
            }}
          />
        </div>
      </main>
    );
  }

  if (shouldForcePlayerLink) {
    return (
      <main style={{ ...styles.page, background: dynamicTheme.pageBackground }}>
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
              <img src="/icon.png" alt="MyTeamHub icon" style={iconLogoStyle} />

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

          <div
            style={{
              ...styles.card,
              background: dynamicTheme.cardBackground,
              border: `1px solid ${dynamicTheme.cardBorder}`,
              padding: "18px 16px",
            }}
          >
            <h2 style={styles.screenTitle}>Vyber se ze soupisky</h2>

            <div
              style={{
                marginTop: "8px",
                color: "#d9d9d9",
                lineHeight: 1.5,
                fontSize: "14px",
              }}
            >
              Aby šly v budoucnu ankety, přihlášky na zápasy a hlasování správně
              přiřadit ke konkrétnímu hráči, vyber svoje jméno ze seznamu hráčů.
            </div>

            {playerLinkMessage && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${dynamicTheme.cardBorder}`,
                  color: "#ffb3b3",
                  fontSize: "14px",
                  lineHeight: 1.45,
                }}
              >
                {playerLinkMessage}
              </div>
            )}

            {playerLinkLoading ? (
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${dynamicTheme.cardBorder}`,
                  textAlign: "center",
                  color: "#b8b8b8",
                }}
              >
                Načítám hráče...
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  marginTop: "16px",
                  maxHeight: "460px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {availablePlayersToLink.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => void handleLinkPlayer(player)}
                    disabled={playerLinkSavingId !== null}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      textAlign: "left",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "14px",
                      padding: "10px 12px",
                      border: "1px solid rgba(255,255,255,0.05)",
                      color: "white",
                      cursor: playerLinkSavingId ? "default" : "pointer",
                      opacity:
                        playerLinkSavingId && playerLinkSavingId !== player.id
                          ? 0.65
                          : 1,
                    }}
                  >
                    <div
                      style={{
                        minWidth: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: dynamicTheme.primary,
                        color: dynamicTheme.primaryText,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {player.number}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold" }}>{player.name}</div>
                      <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                        {player.position}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#ffffff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {playerLinkSavingId === player.id ? "Propojuji..." : "Vybrat"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ ...styles.page, background: dynamicTheme.pageBackground }}>
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
              src={currentClub.logo_url || "/icon.png"}
              alt="MyTeamHub icon"
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
              {linkedPlayer ? (
                <>
                  <p
                    style={{
                      color: teamTheme.mutedText,
                      marginTop: "4px",
                      fontSize: "12px",
                    }}
                  >
                    Přihlášený hráč: {linkedPlayer.name}
                  </p>

                  <p
                    style={{
                      color: isCurrentUserAdmin ? "#ffd86b" : teamTheme.mutedText,
                      marginTop: "4px",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    Role: {isCurrentUserAdmin ? "ADMIN" : "ČLEN"}
                  </p>
                </>
              ) : (
                <p
                  style={{
                    color: "#ffd98a",
                    marginTop: "4px",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                >
                  Profil zatím není propojený s hráčem
                </p>
              )}
            </div>
          </div>

          <button onClick={handleLogout} style={logoutButtonStyle}>
            Odhlásit
          </button>
        </div>

        {showMissingPlayerInfo && (
          <div
            style={{
              ...styles.card,
              marginBottom: "14px",
              padding: "14px 16px",
              background: "rgba(255, 193, 7, 0.08)",
              border: "1px solid rgba(255, 193, 7, 0.22)",
              color: "#ffe7a8",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                fontSize: "14px",
                marginBottom: "6px",
              }}
            >
              Profil zatím není propojený s hráčem
            </div>

            <div
              style={{
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              V týmu zatím není žádný hráč k propojení. Nejdřív si vytvoř soupisku
              v sekci TÝM → HRÁČI a potom svůj účet napojíš na konkrétního hráče.
            </div>
          </div>
        )}

        {isMainMenuVisible && (
          <div style={{ display: "grid", gap: "10px" }}>
            <button
              style={menuButtonStyle}
              onClick={() => {
                setScreen("team");
                setTeamTab("overview");
                void loadOverviewPlayers(currentClub.id, true);
                void ensureClubMatchDataLoaded(currentClub.id);
              }}
            >
              TÝM
            </button>

            <button
              style={menuButtonStyle}
              onClick={() => {
                setScreen("matches");
                setMatchesTab("planned");
                void ensureClubMatchDataLoaded(currentClub.id);
              }}
            >
              ZÁPASY
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("trainings")}>
              TRÉNINKY
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("polls")}>
              ANKETY
            </button>

            <button
              style={menuButtonStyle}
              onClick={() => {
                setScreen("stats");
                void ensureClubMatchDataLoaded(currentClub.id);
              }}
            >
              STATISTIKY
            </button>

            <button style={menuButtonStyle} onClick={() => setScreen("discipline")}>
              DISCIPLÍNA
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
              <button onClick={() => setScreen("home")} style={backButtonStyle}>
                ← Zpět
              </button>

              <div style={sectionTitleStyle}>{getScreenTitle(screen)}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: isMainMenuVisible ? "20px" : "0px" }}>
          {screen === "team" && selectedPlayedMatchId === null && !isLiveMatch && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  style={getSubTabStyle(teamTab === "overview")}
                  onClick={() => {
                    setTeamTab("overview");
                    void loadOverviewPlayers(currentClub.id, true);
                    void ensureClubMatchDataLoaded(currentClub.id);
                  }}
                >
                  PŘEHLED
                </button>

                <button
                  style={getSubTabStyle(teamTab === "players")}
                  onClick={() => setTeamTab("players")}
                >
                  HRÁČI
                </button>

                {isCurrentUserAdmin && (
                  <button
                    style={getSubTabStyle(teamTab === "periods")}
                    onClick={() => setTeamTab("periods")}
                  >
                    OBDOBÍ
                  </button>
                )}

                {isCurrentUserAdmin && (
                  <button
                    style={getSubTabStyle(teamTab === "edit")}
                    onClick={() => setTeamTab("edit")}
                  >
                    EDIT TÝMU
                  </button>
                )}
              </div>

              {teamTab === "overview" && (
                <div
                  style={{
                    ...styles.card,
                    background: dynamicTheme.cardBackground,
                    border: `1px solid ${dynamicTheme.cardBorder}`,
                    padding: "18px 16px",
                  }}
                >
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div style={overviewInfoCardStyle}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#b8b8b8",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}
                      >
                        🎂 Dnes slaví
                      </div>

                      {overviewPlayersLoading ? (
                        <div style={{ color: "#b8b8b8", fontSize: "14px" }}>
                          Načítám narozeniny...
                        </div>
                      ) : todaysBirthdayPlayers.length > 0 ? (
                        <div style={{ display: "grid", gap: "6px" }}>
                          {todaysBirthdayPlayers.map(({ player, age }) => (
                            <div
                              key={player.id}
                              style={{
                                color: "#ffffff",
                                fontWeight: "bold",
                                fontSize: "15px",
                              }}
                            >
                              {player.name}
                              {age !== null ? ` • ${age} let` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: "#b8b8b8", fontSize: "14px" }}>
                          Dnes nikdo neslaví.
                        </div>
                      )}
                    </div>

                    <div style={overviewInfoCardStyle}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#b8b8b8",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}
                      >
                        📅 Nejbližší oslavenec
                      </div>

                      {overviewPlayersLoading ? (
                        <div style={{ color: "#b8b8b8", fontSize: "14px" }}>
                          Načítám...
                        </div>
                      ) : nextBirthdayPlayer ? (
                        <div>
                          <div
                            style={{
                              color: "#ffffff",
                              fontWeight: "bold",
                              fontSize: "15px",
                            }}
                          >
                            {nextBirthdayPlayer.player.name}
                            {nextBirthdayPlayer.age !== null
                              ? ` • ${nextBirthdayPlayer.age} let`
                              : ""}
                          </div>
                          <div
                            style={{
                              color: "#b8b8b8",
                              fontSize: "13px",
                              marginTop: "4px",
                            }}
                          >
                            {formatBirthdayDate(nextBirthdayPlayer.nextBirthday)}
                            {nextBirthdayPlayer.diffDays === 0
                              ? " • dnes"
                              : ` • za ${nextBirthdayPlayer.diffDays} dní`}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: "#b8b8b8", fontSize: "14px" }}>
                          Zatím nejsou vyplněná data narození.
                        </div>
                      )}
                    </div>

                    <div style={overviewInfoCardStyle}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#b8b8b8",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}
                      >
                        ⭐ Hráč měsíce
                      </div>

                      {matchesLoading && !matchesLoaded ? (
                        <div style={{ color: "#b8b8b8", fontSize: "14px" }}>
                          Načítám zápasy...
                        </div>
                      ) : playerOfPreviousMonth ? (
                        <div>
                          <div
                            style={{
                              color: "#ffffff",
                              fontWeight: "bold",
                              fontSize: "15px",
                            }}
                          >
                            {playerOfPreviousMonth.name}
                          </div>
                          <div
                            style={{
                              color: "#b8b8b8",
                              fontSize: "13px",
                              marginTop: "4px",
                            }}
                          >
                            {playerOfPreviousMonth.points} bodů • G{" "}
                            {playerOfPreviousMonth.goals} / A{" "}
                            {playerOfPreviousMonth.assists}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: "#b8b8b8", fontSize: "14px" }}>
                          Za minulý měsíc zatím nejsou data.
                        </div>
                      )}
                    </div>

                    {isCurrentUserAdmin && (
                      <button style={primaryButtonStyle} onClick={handleCreateInvite}>
                        Vygenerovat pozvánkový odkaz
                      </button>
                    )}

                    {isCurrentUserAdmin && inviteMessage && (
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

              {teamTab === "players" && (
                <PlayersScreen
                  clubId={currentClub.id}
                  primaryColor={currentClub.primary_color}
                  isAdmin={isCurrentUserAdmin}
                />
              )}

              {teamTab === "periods" && isCurrentUserAdmin && (
                <PeriodsScreen
                  clubId={currentClub.id}
                  primaryColor={currentClub.primary_color}
                />
              )}

              {teamTab === "edit" && isCurrentUserAdmin && (
                <EditTeamScreen
                  club={currentClub}
                  userId={session.user.id}
                  primaryColor={currentClub.primary_color}
                  onUpdated={(updatedClub) => {
                    setCurrentClub(updatedClub);
                    setAppError("");
                  }}
                />
              )}
            </div>
          )}

          {screen === "matches" && selectedPlayedMatchId === null && (
            <div style={{ display: "grid", gap: "12px" }}>
              {!isLiveMatch && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    style={getSubTabStyle(matchesTab === "planned")}
                    onClick={() => {
                      setMatchesTab("planned");
                      void ensureClubMatchDataLoaded(currentClub.id);
                    }}
                  >
                    PLÁNOVANÉ
                  </button>

                  <button
                    style={getSubTabStyle(matchesTab === "played")}
                    onClick={() => {
                      setMatchesTab("played");
                      void ensureClubMatchDataLoaded(currentClub.id);
                    }}
                  >
                    ODEHRANÉ
                  </button>
                </div>
              )}

              {matchesLoading && !matchesLoaded ? (
                renderMatchesLoadingCard()
              ) : (
                <>
                  {matchesTab === "planned" && (
                    <MatchesScreen
                      key={plannedMatchesRenderKey}
                      clubId={currentClub.id}
                      clubName={currentClub.name}
                      hasBTeam={currentClub.has_b_team}
                      userId={session.user.id}
                      primaryColor={currentClub.primary_color}
                      plannedMatches={plannedMatches}
                      finishedMatchIds={finishedMatchIds}
                      openMatchId={openMatchId}
                      onOpenMatchHandled={() => setOpenMatchId(null)}
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

                        await loadClubMatchData(currentClub.id, true);
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
                            errorMessage:
                              result.errorMessage ?? "Nepodařilo se smazat zápas.",
                          };
                        }

                        setPlannedMatches((prev) =>
                          prev.filter((match) => match.id !== matchId)
                        );
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

                        const matchWithTime: FinishedMatch = {
                          ...finishedMatch,
                          finished_at: new Date().toISOString(),
                        };

                        const result = await saveFinishedMatch({
                          clubId: currentClub.id,
                          createdBy: session.user.id,
                          finishedMatch: matchWithTime,
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
                        setScreen("matches");
                        setMatchesTab("played");
                        setIsLiveMatch(false);
                        matchesLoadedRef.current = true;
                        setMatchesLoaded(true);
                        setAppError("");

                        return {
                          success: true,
                        };
                      }}
                      isAdmin={isCurrentUserAdmin}
                    />
                  )}

                  {matchesTab === "played" && !isLiveMatch && (
                    <PlayedMatchesScreen
                      finishedMatches={finishedMatches}
                      onSelectMatch={(matchId) => setSelectedPlayedMatchId(matchId)}
                      onDeleteMatch={async (matchId) => {
                        const result = await deleteFinishedMatch(matchId);

                        if (!result.success) {
                          setAppError(result.errorMessage ?? "Nepodařilo se smazat zápas.");
                          return {
                            success: false,
                            errorMessage:
                              result.errorMessage ?? "Nepodařilo se smazat zápas.",
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
                </>
              )}
            </div>
          )}

          {screen === "trainings" && selectedPlayedMatchId === null && !isLiveMatch && (
            <TrainingsScreen
              clubId={currentClub.id}
              primaryColor={currentClub.primary_color}
              isAdmin={isCurrentUserAdmin}
              openTrainingId={openTrainingId}
              onOpenTrainingHandled={() => setOpenTrainingId(null)}
            />
          )}

          {screen === "polls" && selectedPlayedMatchId === null && !isLiveMatch && (
            <PollsScreen
              clubId={currentClub.id}
              userId={session.user.id}
              primaryColor={currentClub.primary_color}
            />
          )}

          {screen === "stats" && selectedPlayedMatchId === null && !isLiveMatch && (
            <>
              {matchesLoading && !matchesLoaded ? (
                renderMatchesLoadingCard()
              ) : (
                <StatsScreen
                  clubId={currentClub.id}
                  finishedMatches={finishedMatches}
                  primaryColor={currentClub.primary_color}
                />
              )}
            </>
          )}

          {screen === "discipline" && selectedPlayedMatchId === null && !isLiveMatch && (
            <DisciplineScreen
              clubId={currentClub.id}
              primaryColor={currentClub.primary_color}
              isAdmin={isCurrentUserAdmin}
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