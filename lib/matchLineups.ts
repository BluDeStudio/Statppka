import { supabase } from "./supabaseClient";
import type { PlannedMatch } from "@/app/page";

type MatchLineupRow = {
  player_id: string;
};

type SaveMatchLineupParams = {
  matchId: string;
  playerIds: string[];
  goalkeeperPlayerId: string | null;
};

type SaveMatchLineupResult = {
  success: boolean;
  match: PlannedMatch | null;
  errorMessage?: string;
};

export async function getMatchLineupPlayerIds(matchId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("match_lineups")
      .select("player_id")
      .eq("planned_match_id", matchId);

    if (error) {
      console.error("Chyba při načítání sestavy zápasu:", error);
      return [];
    }

    return ((data ?? []) as MatchLineupRow[]).map((row) => row.player_id);
  } catch (error) {
    console.error("Chyba v getMatchLineupPlayerIds:", error);
    return [];
  }
}

export async function saveMatchLineup({
  matchId,
  playerIds,
  goalkeeperPlayerId,
}: SaveMatchLineupParams): Promise<SaveMatchLineupResult> {
  try {
    const uniquePlayerIds = Array.from(new Set(playerIds));

    const { error: deleteError } = await supabase
      .from("match_lineups")
      .delete()
      .eq("planned_match_id", matchId);

    if (deleteError) {
      console.error("Chyba při mazání staré sestavy:", deleteError);
      return {
        success: false,
        match: null,
        errorMessage: "Nepodařilo se uložit sestavu zápasu.",
      };
    }

    if (uniquePlayerIds.length > 0) {
      const rows = uniquePlayerIds.map((playerId) => ({
        planned_match_id: matchId,
        player_id: playerId,
      }));

      const { error: insertError } = await supabase
        .from("match_lineups")
        .insert(rows);

      if (insertError) {
        console.error("Chyba při ukládání sestavy:", insertError);
        return {
          success: false,
          match: null,
          errorMessage: "Nepodařilo se uložit sestavu zápasu.",
        };
      }
    }

    const { data: updatedMatch, error: updateError } = await supabase
      .from("planned_matches")
      .update({
        status: "prepared",
        goalkeeper_player_id: goalkeeperPlayerId,
      })
      .eq("id", matchId)
      .select("*")
      .single();

    if (updateError || !updatedMatch) {
      console.error("Chyba při přepnutí zápasu do prepared:", updateError, updatedMatch);
      return {
        success: false,
        match: null,
        errorMessage:
          updateError?.message ??
          "Sestava se uložila, ale nepodařilo se připravit zápas.",
      };
    }

    return {
      success: true,
      match: {
        id: updatedMatch.id as string,
        date: updatedMatch.date as string,
        opponent: updatedMatch.opponent as string,
        team: updatedMatch.team as "A" | "B",
        homeTeam: updatedMatch.home_team as string,
        awayTeam: updatedMatch.away_team as string,
        status: (updatedMatch.status as PlannedMatch["status"]) ?? "prepared",
        current_period: (updatedMatch.current_period as number | null) ?? 0,
        first_half_started_at:
          (updatedMatch.first_half_started_at as string | null) ?? null,
        first_half_elapsed_seconds:
          (updatedMatch.first_half_elapsed_seconds as number | null) ?? 0,
        second_half_started_at:
          (updatedMatch.second_half_started_at as string | null) ?? null,
        second_half_elapsed_seconds:
          (updatedMatch.second_half_elapsed_seconds as number | null) ?? 0,
        goalkeeper_player_id:
          (updatedMatch.goalkeeper_player_id as string | null) ?? null,
      },
    };
  } catch (error) {
    console.error("Chyba v saveMatchLineup:", error);
    return {
      success: false,
      match: null,
      errorMessage: "Při ukládání sestavy nastala chyba.",
    };
  }
}