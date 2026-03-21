import { supabase } from "./supabaseClient";

export type PlayerRatingRow = {
  id: string;
  finished_match_id: string;
  player_number: number;
  rated_by_user_id: string;
  rating: number;
  created_at?: string;
};

export type RatingBadgeColor =
  | "neutral"
  | "red"
  | "orange"
  | "light_green"
  | "dark_green"
  | "blue";

export type MatchPlayerRatingSummary = {
  playerNumber: number;
  averageRating: number | null;
  votes: number;
  isBest: boolean;
  color: RatingBadgeColor;
};

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

export async function getMatchPlayerRatings(
  finishedMatchId: string
): Promise<PlayerRatingRow[]> {
  try {
    const { data, error } = await supabase
      .from("match_player_ratings")
      .select("*")
      .eq("finished_match_id", finishedMatchId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Nepodařilo se načíst hodnocení zápasu:", error);
      return [];
    }

    return (data as PlayerRatingRow[]) ?? [];
  } catch (error) {
    console.error("Chyba v getMatchPlayerRatings:", error);
    return [];
  }
}

export async function getRatingsForMatches(
  finishedMatchIds: string[]
): Promise<PlayerRatingRow[]> {
  try {
    if (finishedMatchIds.length === 0) return [];

    const { data, error } = await supabase
      .from("match_player_ratings")
      .select("*")
      .in("finished_match_id", finishedMatchIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Nepodařilo se načíst hodnocení zápasů:", error);
      return [];
    }

    return (data as PlayerRatingRow[]) ?? [];
  } catch (error) {
    console.error("Chyba v getRatingsForMatches:", error);
    return [];
  }
}

export async function upsertMatchPlayerRating(input: {
  finishedMatchId: string;
  playerNumber: number;
  ratedByUserId: string;
  rating: number;
}): Promise<{ success: boolean; errorMessage?: string }> {
  try {
    const { error } = await supabase.from("match_player_ratings").upsert(
      [
        {
          finished_match_id: input.finishedMatchId,
          player_number: input.playerNumber,
          rated_by_user_id: input.ratedByUserId,
          rating: input.rating,
        },
      ],
      {
        onConflict: "finished_match_id,player_number,rated_by_user_id",
      }
    );

    if (error) {
      console.error("Nepodařilo se uložit hodnocení hráče:", error);
      return {
        success: false,
        errorMessage: `Nepodařilo se uložit hodnocení: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Chyba v upsertMatchPlayerRating:", error);
    return {
      success: false,
      errorMessage: "Při ukládání hodnocení nastala chyba.",
    };
  }
}

export function getRatingBadgeColor(
  value: number | null,
  isBest: boolean
): RatingBadgeColor {
  if (value === null) return "neutral";
  if (isBest) return "blue";
  if (value <= 6.0) return "red";
  if (value <= 6.9) return "orange";
  if (value <= 7.9) return "light_green";
  return "dark_green";
}

export function getRatingBadgeStyles(color: RatingBadgeColor): {
  background: string;
  color: string;
} {
  switch (color) {
    case "red":
      return {
        background: "#c62828",
        color: "#ffffff",
      };
    case "orange":
      return {
        background: "#ef6c00",
        color: "#ffffff",
      };
    case "light_green":
      return {
        background: "#66bb6a",
        color: "#081108",
      };
    case "dark_green":
      return {
        background: "#1b5e20",
        color: "#ffffff",
      };
    case "blue":
      return {
        background: "#1565c0",
        color: "#ffffff",
      };
    default:
      return {
        background: "rgba(255,255,255,0.12)",
        color: "#ffffff",
      };
  }
}

export function buildMatchRatingSummary(
  playerNumbers: number[],
  ratings: PlayerRatingRow[]
): MatchPlayerRatingSummary[] {
  const uniquePlayerNumbers = Array.from(new Set(playerNumbers));

  const summaries = uniquePlayerNumbers.map((playerNumber) => {
    const playerRatings = ratings.filter(
      (rating) => rating.player_number === playerNumber
    );

    if (playerRatings.length === 0) {
      return {
        playerNumber,
        averageRating: null,
        votes: 0,
        isBest: false,
        color: "neutral" as RatingBadgeColor,
      };
    }

    const total = playerRatings.reduce((sum, rating) => sum + Number(rating.rating), 0);
    const averageRating = roundToOne(total / playerRatings.length);

    return {
      playerNumber,
      averageRating,
      votes: playerRatings.length,
      isBest: false,
      color: "neutral" as RatingBadgeColor,
    };
  });

  const ratedPlayers = summaries.filter(
    (summary) => summary.averageRating !== null && summary.votes > 0
  );

  let bestPlayerNumber: number | null = null;

  if (ratedPlayers.length > 0) {
    const best = [...ratedPlayers].sort((a, b) => {
      if ((b.averageRating ?? 0) !== (a.averageRating ?? 0)) {
        return (b.averageRating ?? 0) - (a.averageRating ?? 0);
      }

      if (b.votes !== a.votes) {
        return b.votes - a.votes;
      }

      return a.playerNumber - b.playerNumber;
    })[0];

    bestPlayerNumber = best.playerNumber;
  }

  return summaries.map((summary) => {
    const isBest = bestPlayerNumber === summary.playerNumber && summary.averageRating !== null;

    return {
      ...summary,
      isBest,
      color: getRatingBadgeColor(summary.averageRating, isBest),
    };
  });
}