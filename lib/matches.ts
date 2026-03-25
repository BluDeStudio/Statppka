import { supabase } from "./supabaseClient";
import type { FinishedMatch, FinishedMatchEvent, PlannedMatch } from "@/app/page";

export type MatchRatingColor =
  | "red"
  | "orange"
  | "light_green"
  | "dark_green"
  | "blue";

export async function getPlannedMatchesByClubId(clubId: string): Promise<PlannedMatch[]> {
  try {
    const { data, error } = await supabase
      .from("planned_matches")
      .select("*")
      .eq("club_id", clubId)
      .order("date", { ascending: true });

    if (error) {
      console.error("Nepodařilo se načíst plánované zápasy:", error);
      return [];
    }

    return (
      data?.map((row) => ({
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
      })) ?? []
    );
  } catch (error) {
    console.error("Chyba v getPlannedMatchesByClubId:", error);
    return [];
  }
}

export async function createPlannedMatch(input: {
  clubId: string;
  createdBy: string;
  match: PlannedMatch;
}): Promise<{ match: PlannedMatch | null; errorMessage?: string }> {
  try {
    const payload = {
      id: input.match.id,
      club_id: input.clubId,
      date: input.match.date,
      opponent: input.match.opponent,
      team: input.match.team,
      home_team: input.match.homeTeam,
      away_team: input.match.awayTeam,
      created_by: input.createdBy,
    };

    console.log("createPlannedMatch payload:", payload);

    const { data, error } = await supabase
      .from("planned_matches")
      .insert([payload])
      .select()
      .single();

    if (error || !data) {
      console.error("Nepodařilo se vytvořit plánovaný zápas:", error);
      return {
        match: null,
        errorMessage: `Nepodařilo se uložit zápas: ${error?.message ?? "neznámá chyba"}`,
      };
    }

    return {
      match: {
        id: data.id as string,
        date: data.date as string,
        opponent: data.opponent as string,
        team: data.team as "A" | "B",
        homeTeam: data.home_team as string,
        awayTeam: data.away_team as string,
        status: (data.status as PlannedMatch["status"]) ?? "planned",
        current_period: (data.current_period as number | null) ?? 0,
        first_half_started_at: (data.first_half_started_at as string | null) ?? null,
        first_half_elapsed_seconds:
          (data.first_half_elapsed_seconds as number | null) ?? 0,
        second_half_started_at: (data.second_half_started_at as string | null) ?? null,
        second_half_elapsed_seconds:
          (data.second_half_elapsed_seconds as number | null) ?? 0,
        goalkeeper_player_id: (data.goalkeeper_player_id as string | null) ?? null,
      },
    };
  } catch (error) {
    console.error("Chyba v createPlannedMatch:", error);
    return {
      match: null,
      errorMessage: "Při ukládání zápasu nastala chyba.",
    };
  }
}

export async function deletePlannedMatch(matchId: string): Promise<{
  success: boolean;
  errorMessage?: string;
}> {
  try {
    const { error } = await supabase
      .from("planned_matches")
      .delete()
      .eq("id", matchId);

    if (error) {
      console.error("Nepodařilo se smazat plánovaný zápas:", error);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat plánovaný zápas: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Chyba v deletePlannedMatch:", error);
    return {
      success: false,
      errorMessage: "Při mazání plánovaného zápasu nastala chyba.",
    };
  }
}

export async function getFinishedMatchesByClubId(clubId: string): Promise<FinishedMatch[]> {
  try {
    const { data: matches, error: matchesError } = await supabase
      .from("finished_matches")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });

    if (matchesError || !matches) {
      console.error("Nepodařilo se načíst odehrané zápasy:", matchesError);
      return [];
    }

    const ids = matches.map((match) => match.id);
    if (ids.length === 0) return [];

    const { data: statsRows, error: statsError } = await supabase
      .from("finished_match_player_stats")
      .select("*")
      .in("finished_match_id", ids);

    if (statsError) {
      console.error("Nepodařilo se načíst statistiky zápasů:", statsError);
      return [];
    }

    const { data: eventRows, error: eventsError } = await supabase
      .from("finished_match_events")
      .select("*")
      .in("finished_match_id", ids)
      .order("created_at", { ascending: true });

    if (eventsError) {
      console.error("Nepodařilo se načíst události zápasů:", eventsError);
      return [];
    }

    return matches.map((match) => {
      const playerStats =
        statsRows
          ?.filter((row) => row.finished_match_id === match.id)
          .map((row) => ({
            playerNumber: row.player_number as number,
            goals: row.goals as number,
            assists: row.assists as number,
          })) ?? [];

      const events: FinishedMatchEvent[] =
        eventRows
          ?.filter((row) => row.finished_match_id === match.id)
          .map((row) => {
            if (row.type === "goal_for") {
              return {
                type: "goal_for",
                scorer: row.scorer as number,
                assist: row.assist as number | null,
              };
            }

            return { type: "goal_against" };
          }) ?? [];

      return {
        id: match.id as string,
        matchTitle: match.match_title as string,
        team: match.team as "A" | "B",
        date: match.date as string,
        score: match.score as string,
        goalkeeperNumber: (match.goalkeeper_number as number | null) ?? null,
        goalsAgainst: match.goals_against as number,
        playerStats,
        events,
      };
    });
  } catch (error) {
    console.error("Chyba v getFinishedMatchesByClubId:", error);
    return [];
  }
}

export async function saveFinishedMatch(input: {
  clubId: string;
  createdBy: string;
  finishedMatch: FinishedMatch;
}): Promise<{ finishedMatch: FinishedMatch | null; errorMessage?: string }> {
  try {
    const { finishedMatch } = input;

    const { error: matchError } = await supabase.from("finished_matches").insert([
      {
        id: finishedMatch.id,
        club_id: input.clubId,
        match_title: finishedMatch.matchTitle,
        team: finishedMatch.team,
        date: finishedMatch.date,
        score: finishedMatch.score,
        goalkeeper_number: finishedMatch.goalkeeperNumber,
        goals_against: finishedMatch.goalsAgainst,
        created_by: input.createdBy,
      },
    ]);

    if (matchError) {
      console.error("Nepodařilo se uložit odehraný zápas:", matchError);
      return {
        finishedMatch: null,
        errorMessage: `Nepodařilo se uložit odehraný zápas: ${matchError.message}`,
      };
    }

    if (finishedMatch.playerStats.length > 0) {
      const { error: statsError } = await supabase
        .from("finished_match_player_stats")
        .insert(
          finishedMatch.playerStats.map((stat) => ({
            finished_match_id: finishedMatch.id,
            player_number: stat.playerNumber,
            goals: stat.goals,
            assists: stat.assists,
          }))
        );

      if (statsError) {
        console.error("Nepodařilo se uložit statistiky hráčů:", statsError);
        return {
          finishedMatch: null,
          errorMessage: `Nepodařilo se uložit statistiky hráčů: ${statsError.message}`,
        };
      }
    }

    if (finishedMatch.events.length > 0) {
      const { error: eventsError } = await supabase
        .from("finished_match_events")
        .insert(
          finishedMatch.events.map((event) => ({
            finished_match_id: finishedMatch.id,
            type: event.type,
            scorer: event.type === "goal_for" ? event.scorer : null,
            assist: event.type === "goal_for" ? event.assist : null,
          }))
        );

      if (eventsError) {
        console.error("Nepodařilo se uložit události zápasu:", eventsError);
        return {
          finishedMatch: null,
          errorMessage: `Nepodařilo se uložit události zápasu: ${eventsError.message}`,
        };
      }
    }

    const { error: deletePlannedError } = await supabase
      .from("planned_matches")
      .delete()
      .eq("id", finishedMatch.id);

    if (deletePlannedError) {
      console.error("Nepodařilo se smazat plánovaný zápas:", deletePlannedError);
    }

    return { finishedMatch };
  } catch (error) {
    console.error("Chyba v saveFinishedMatch:", error);
    return {
      finishedMatch: null,
      errorMessage: "Při ukládání odehraného zápasu nastala chyba.",
    };
  }
}

export async function deleteFinishedMatch(matchId: string): Promise<{
  success: boolean;
  errorMessage?: string;
}> {
  try {
    const { error: ratingsError } = await supabase
      .from("match_player_ratings")
      .delete()
      .eq("finished_match_id", matchId);

    if (ratingsError) {
      console.error("Nepodařilo se smazat hodnocení zápasu:", ratingsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat hodnocení zápasu: ${ratingsError.message}`,
      };
    }

    const { error: statsError } = await supabase
      .from("finished_match_player_stats")
      .delete()
      .eq("finished_match_id", matchId);

    if (statsError) {
      console.error("Nepodařilo se smazat statistiky hráčů:", statsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat statistiky hráčů: ${statsError.message}`,
      };
    }

    const { error: eventsError } = await supabase
      .from("finished_match_events")
      .delete()
      .eq("finished_match_id", matchId);

    if (eventsError) {
      console.error("Nepodařilo se smazat události zápasu:", eventsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat události zápasu: ${eventsError.message}`,
      };
    }

    const { error: matchError } = await supabase
      .from("finished_matches")
      .delete()
      .eq("id", matchId);

    if (matchError) {
      console.error("Nepodařilo se smazat odehraný zápas:", matchError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat odehraný zápas: ${matchError.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Chyba v deleteFinishedMatch:", error);
    return {
      success: false,
      errorMessage: "Při mazání odehraného zápasu nastala chyba.",
    };
  }
}

export function getRatingColor(value: number, isBest: boolean): MatchRatingColor {
  if (isBest) return "blue";
  if (value <= 6.0) return "red";
  if (value <= 6.9) return "orange";
  if (value <= 7.9) return "light_green";
  return "dark_green";
}