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

export async function getMatchLineupState(matchId: string): Promise<{
  playerIds: string[];
  goalkeeperPlayerId: string | null;
}> {
  try {
    const [{ data: lineupData, error: lineupError }, { data: matchData, error: matchError }] =
      await Promise.all([
        supabase
          .from("match_lineups")
          .select("player_id")
          .eq("planned_match_id", matchId),

        supabase
          .from("planned_matches")
          .select("goalkeeper_player_id")
          .eq("id", matchId)
          .maybeSingle(),
      ]);

    if (lineupError) {
      console.error("Chyba při načítání sestavy zápasu:", lineupError);
    }

    if (matchError) {
      console.error("Chyba při načítání brankáře zápasu:", matchError);
    }

    return {
      playerIds: ((lineupData ?? []) as MatchLineupRow[]).map(
        (row) => row.player_id
      ),
      goalkeeperPlayerId:
        (matchData?.goalkeeper_player_id as string | null) ?? null,
    };
  } catch (error) {
    console.error("Chyba v getMatchLineupState:", error);
    return {
      playerIds: [],
      goalkeeperPlayerId: null,
    };
  }
}

export async function getMatchLineupPlayerIds(matchId: string): Promise<string[]> {
  const state = await getMatchLineupState(matchId);
  return state.playerIds;
}

export async function saveMatchLineup({
  matchId,
  playerIds,
  goalkeeperPlayerId,
}: SaveMatchLineupParams): Promise<SaveMatchLineupResult> {
  try {
    const uniquePlayerIds = Array.from(new Set(playerIds));

    const safeGoalkeeperPlayerId =
      goalkeeperPlayerId && uniquePlayerIds.includes(goalkeeperPlayerId)
        ? goalkeeperPlayerId
        : null;

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
        goalkeeper_player_id: safeGoalkeeperPlayerId,
      })
      .eq("id", matchId)
      .select("*")
      .single();

    if (updateError || !updatedMatch) {
      console.error("Chyba při přepnutí zápasu do prepared:", updateError);
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
        time: (updatedMatch.time as string | null) ?? undefined,
        location: (updatedMatch.location as string | null) ?? undefined,
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