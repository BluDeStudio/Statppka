import { supabase } from "./supabaseClient";
import type { PlannedMatch } from "@/app/page";

export type LiveMatchEventRecord = {
  id: string;
  planned_match_id: string;
  type: "goal_for" | "goal_against";
  scorer_player_id: string | null;
  assist_player_id: string | null;
  period: number;
  match_second: number;
  match_minute: number;
  created_at: string;
};

function mapPlannedMatch(row: Record<string, unknown>): PlannedMatch {
  return {
    id: row.id as string,
    date: row.date as string,
    opponent: row.opponent as string,
    team: row.team as "A" | "B",
    homeTeam: row.home_team as string,
    awayTeam: row.away_team as string,
    status: (row.status as PlannedMatch["status"]) ?? "planned",
    current_period: (row.current_period as number | null) ?? 0,
    first_half_started_at: (row.first_half_started_at as string | null) ?? null,
    first_half_elapsed_seconds:
      (row.first_half_elapsed_seconds as number | null) ?? 0,
    second_half_started_at: (row.second_half_started_at as string | null) ?? null,
    second_half_elapsed_seconds:
      (row.second_half_elapsed_seconds as number | null) ?? 0,
    goalkeeper_player_id: (row.goalkeeper_player_id as string | null) ?? null,
  };
}

export async function getPlannedMatchById(
  matchId: string
): Promise<PlannedMatch | null> {
  try {
    const { data, error } = await supabase
      .from("planned_matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (error || !data) {
      console.error("Nepodařilo se načíst detail zápasu:", error);
      return null;
    }

    return mapPlannedMatch(data as Record<string, unknown>);
  } catch (error) {
    console.error("Chyba v getPlannedMatchById:", error);
    return null;
  }
}

export async function startPreparedMatch(matchId: string): Promise<{
  success: boolean;
  match: PlannedMatch | null;
  errorMessage?: string;
}> {
  try {
    const currentMatch = await getPlannedMatchById(matchId);

    if (!currentMatch) {
      return {
        success: false,
        match: null,
        errorMessage: "Nepodařilo se načíst zápas.",
      };
    }

    if (currentMatch.status === "live") {
      return {
        success: true,
        match: currentMatch,
      };
    }

    const startIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("planned_matches")
      .update({
        status: "live",
        current_period: 1,
        first_half_started_at: currentMatch.first_half_started_at ?? startIso,
      })
      .eq("id", matchId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se zahájit zápas:", error);
      return {
        success: false,
        match: null,
        errorMessage: "Nepodařilo se zahájit zápas.",
      };
    }

    return {
      success: true,
      match: mapPlannedMatch(data as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Chyba v startPreparedMatch:", error);
    return {
      success: false,
      match: null,
      errorMessage: "Při zahájení zápasu nastala chyba.",
    };
  }
}

export async function endFirstHalf(input: {
  matchId: string;
  elapsedSeconds: number;
}): Promise<{
  success: boolean;
  match: PlannedMatch | null;
  errorMessage?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("planned_matches")
      .update({
        status: "halftime",
        current_period: 1,
        first_half_elapsed_seconds: input.elapsedSeconds,
        first_half_started_at: null,
      })
      .eq("id", input.matchId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se ukončit 1. poločas:", error);
      return {
        success: false,
        match: null,
        errorMessage: "Nepodařilo se ukončit 1. poločas.",
      };
    }

    return {
      success: true,
      match: mapPlannedMatch(data as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Chyba v endFirstHalf:", error);
    return {
      success: false,
      match: null,
      errorMessage: "Při ukončení 1. poločasu nastala chyba.",
    };
  }
}

export async function startSecondHalf(matchId: string): Promise<{
  success: boolean;
  match: PlannedMatch | null;
  errorMessage?: string;
}> {
  try {
    const startIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("planned_matches")
      .update({
        status: "live",
        current_period: 2,
        second_half_started_at: startIso,
      })
      .eq("id", matchId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se zahájit 2. poločas:", error);
      return {
        success: false,
        match: null,
        errorMessage: "Nepodařilo se zahájit 2. poločas.",
      };
    }

    return {
      success: true,
      match: mapPlannedMatch(data as Record<string, unknown>),
    };
  } catch (error) {
    console.error("Chyba v startSecondHalf:", error);
    return {
      success: false,
      match: null,
      errorMessage: "Při zahájení 2. poločasu nastala chyba.",
    };
  }
}

export async function getLiveMatchEvents(
  matchId: string
): Promise<LiveMatchEventRecord[]> {
  try {
    const { data, error } = await supabase
      .from("live_match_events")
      .select("*")
      .eq("planned_match_id", matchId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Nepodařilo se načíst live události:", error);
      return [];
    }

    return (data ?? []) as LiveMatchEventRecord[];
  } catch (error) {
    console.error("Chyba v getLiveMatchEvents:", error);
    return [];
  }
}

export async function addGoalForEvent(input: {
  matchId: string;
  scorerPlayerId: string;
  assistPlayerId: string | null;
  period: number;
  matchSecond: number;
  matchMinute: number;
}): Promise<{
  success: boolean;
  event: LiveMatchEventRecord | null;
  errorMessage?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("live_match_events")
      .insert([
        {
          planned_match_id: input.matchId,
          type: "goal_for",
          scorer_player_id: input.scorerPlayerId,
          assist_player_id: input.assistPlayerId,
          period: input.period,
          match_second: input.matchSecond,
          match_minute: input.matchMinute,
        },
      ])
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se uložit náš gól:", error);
      return {
        success: false,
        event: null,
        errorMessage: "Nepodařilo se uložit gól.",
      };
    }

    return {
      success: true,
      event: data as LiveMatchEventRecord,
    };
  } catch (error) {
    console.error("Chyba v addGoalForEvent:", error);
    return {
      success: false,
      event: null,
      errorMessage: "Při ukládání gólu nastala chyba.",
    };
  }
}

export async function addGoalAgainstEvent(input: {
  matchId: string;
  period: number;
  matchSecond: number;
  matchMinute: number;
}): Promise<{
  success: boolean;
  event: LiveMatchEventRecord | null;
  errorMessage?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("live_match_events")
      .insert([
        {
          planned_match_id: input.matchId,
          type: "goal_against",
          scorer_player_id: null,
          assist_player_id: null,
          period: input.period,
          match_second: input.matchSecond,
          match_minute: input.matchMinute,
        },
      ])
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se uložit inkasovaný gól:", error);
      return {
        success: false,
        event: null,
        errorMessage: "Nepodařilo se uložit inkasovaný gól.",
      };
    }

    return {
      success: true,
      event: data as LiveMatchEventRecord,
    };
  } catch (error) {
    console.error("Chyba v addGoalAgainstEvent:", error);
    return {
      success: false,
      event: null,
      errorMessage: "Při ukládání inkasovaného gólu nastala chyba.",
    };
  }
}