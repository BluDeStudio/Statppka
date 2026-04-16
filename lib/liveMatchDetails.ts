import { supabase } from "./supabaseClient";

export type LiveMatchPlayerDetailRow = {
  id: string;
  planned_match_id: string;
  player_id: string;
  is_playing: boolean;
  played_seconds: number;
  last_started_match_second: number | null;
  shots_on_target: number;
  shots_off_target: number;
  created_at: string;
  updated_at: string;
};

type ExistingPlayerIdRow = {
  player_id: string;
};

function createDefaultDetailRow(matchId: string, playerId: string) {
  return {
    id: "",
    planned_match_id: matchId,
    player_id: playerId,
    is_playing: false,
    played_seconds: 0,
    last_started_match_second: null,
    shots_on_target: 0,
    shots_off_target: 0,
    created_at: "",
    updated_at: "",
  } satisfies LiveMatchPlayerDetailRow;
}

async function ensureRowsExist(matchId: string, playerIds: string[]) {
  if (playerIds.length === 0) return;

  const { data: existingRows, error: existingError } = await supabase
    .from("live_match_player_details")
    .select("player_id")
    .eq("planned_match_id", matchId);

  if (existingError) {
    console.error("Nepodařilo se načíst live detail hráčů:", existingError);
    return;
  }

  const existingPlayerIds = new Set(
    ((existingRows ?? []) as ExistingPlayerIdRow[]).map((row) => row.player_id)
  );

  const missingRows = playerIds
    .filter((playerId) => !existingPlayerIds.has(playerId))
    .map((playerId) => ({
      planned_match_id: matchId,
      player_id: playerId,
      is_playing: false,
      played_seconds: 0,
      last_started_match_second: null,
      shots_on_target: 0,
      shots_off_target: 0,
    }));

  if (missingRows.length === 0) return;

  const { error: insertError } = await supabase
    .from("live_match_player_details")
    .insert(missingRows);

  if (insertError) {
    console.error("Nepodařilo se vytvořit live detail hráčů:", insertError);
  }
}

export async function getLiveMatchPlayerDetails(
  matchId: string,
  playerIds: string[]
): Promise<LiveMatchPlayerDetailRow[]> {
  try {
    await ensureRowsExist(matchId, playerIds);

    const { data, error } = await supabase
      .from("live_match_player_details")
      .select("*")
      .eq("planned_match_id", matchId);

    if (error) {
      console.error("Nepodařilo se načíst live detail hráčů:", error);
      return [];
    }

    return (data ?? []) as LiveMatchPlayerDetailRow[];
  } catch (error) {
    console.error("Chyba v getLiveMatchPlayerDetails:", error);
    return [];
  }
}

export async function setLiveMatchPlayerPlaying(input: {
  matchId: string;
  playerId: string;
  isPlaying: boolean;
  currentMatchSecond: number;
}): Promise<{
  success: boolean;
  row: LiveMatchPlayerDetailRow | null;
  errorMessage?: string;
}> {
  try {
    const { data: existing, error: loadError } = await supabase
      .from("live_match_player_details")
      .select("*")
      .eq("planned_match_id", input.matchId)
      .eq("player_id", input.playerId)
      .maybeSingle();

    if (loadError) {
      console.error("Nepodařilo se načíst live detail hráče:", loadError);
      return {
        success: false,
        row: null,
        errorMessage: "Nepodařilo se načíst detail hráče.",
      };
    }

    const currentRow =
      (existing as LiveMatchPlayerDetailRow | null) ??
      createDefaultDetailRow(input.matchId, input.playerId);

    let nextPlayedSeconds = currentRow.played_seconds ?? 0;
    let nextLastStartedMatchSecond = currentRow.last_started_match_second ?? null;

    if (input.isPlaying) {
      if (!currentRow.is_playing) {
        nextLastStartedMatchSecond = input.currentMatchSecond;
      }
    } else if (currentRow.is_playing && currentRow.last_started_match_second !== null) {
      nextPlayedSeconds += Math.max(
        0,
        input.currentMatchSecond - currentRow.last_started_match_second
      );
      nextLastStartedMatchSecond = null;
    }

    const payload = {
      planned_match_id: input.matchId,
      player_id: input.playerId,
      is_playing: input.isPlaying,
      played_seconds: nextPlayedSeconds,
      last_started_match_second: nextLastStartedMatchSecond,
      shots_on_target: currentRow.shots_on_target ?? 0,
      shots_off_target: currentRow.shots_off_target ?? 0,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("live_match_player_details")
      .upsert(payload, {
        onConflict: "planned_match_id,player_id",
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se uložit stav hráče:", error);
      return {
        success: false,
        row: null,
        errorMessage: "Nepodařilo se uložit stav hráče.",
      };
    }

    return {
      success: true,
      row: data as LiveMatchPlayerDetailRow,
    };
  } catch (error) {
    console.error("Chyba v setLiveMatchPlayerPlaying:", error);
    return {
      success: false,
      row: null,
      errorMessage: "Při ukládání stavu hráče nastala chyba.",
    };
  }
}

export async function addLiveMatchPlayerShot(input: {
  matchId: string;
  playerId: string;
  shotType: "on_target" | "off_target";
}): Promise<{
  success: boolean;
  row: LiveMatchPlayerDetailRow | null;
  errorMessage?: string;
}> {
  try {
    const { data: existing, error: loadError } = await supabase
      .from("live_match_player_details")
      .select("*")
      .eq("planned_match_id", input.matchId)
      .eq("player_id", input.playerId)
      .maybeSingle();

    if (loadError) {
      console.error("Nepodařilo se načíst live detail hráče:", loadError);
      return {
        success: false,
        row: null,
        errorMessage: "Nepodařilo se načíst detail hráče.",
      };
    }

    const currentRow =
      (existing as LiveMatchPlayerDetailRow | null) ??
      createDefaultDetailRow(input.matchId, input.playerId);

    const payload = {
      planned_match_id: input.matchId,
      player_id: input.playerId,
      is_playing: currentRow.is_playing,
      played_seconds: currentRow.played_seconds,
      last_started_match_second: currentRow.last_started_match_second,
      shots_on_target:
        (currentRow.shots_on_target ?? 0) +
        (input.shotType === "on_target" ? 1 : 0),
      shots_off_target:
        (currentRow.shots_off_target ?? 0) +
        (input.shotType === "off_target" ? 1 : 0),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("live_match_player_details")
      .upsert(payload, {
        onConflict: "planned_match_id,player_id",
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Nepodařilo se uložit střelu hráče:", error);
      return {
        success: false,
        row: null,
        errorMessage: "Nepodařilo se uložit střelu hráče.",
      };
    }

    return {
      success: true,
      row: data as LiveMatchPlayerDetailRow,
    };
  } catch (error) {
    console.error("Chyba v addLiveMatchPlayerShot:", error);
    return {
      success: false,
      row: null,
      errorMessage: "Při ukládání střely nastala chyba.",
    };
  }
}

export async function finalizeLiveMatchPlayerDetails(input: {
  matchId: string;
  currentMatchSecond: number;
}): Promise<LiveMatchPlayerDetailRow[]> {
  try {
    const { data, error } = await supabase
      .from("live_match_player_details")
      .select("*")
      .eq("planned_match_id", input.matchId);

    if (error) {
      console.error("Nepodařilo se načíst live detail hráčů:", error);
      return [];
    }

    const rows = (data ?? []) as LiveMatchPlayerDetailRow[];
    const activeRows = rows.filter(
      (row) => row.is_playing && row.last_started_match_second !== null
    );

    if (activeRows.length === 0) {
      return rows;
    }

    for (const row of activeRows) {
      const nextPlayedSeconds =
        row.played_seconds +
        Math.max(0, input.currentMatchSecond - (row.last_started_match_second ?? 0));

      const { error: updateError } = await supabase
        .from("live_match_player_details")
        .update({
          played_seconds: nextPlayedSeconds,
          is_playing: false,
          last_started_match_second: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        console.error("Nepodařilo se dokončit čas hráče:", updateError);
      }
    }

    const { data: refreshed, error: refreshedError } = await supabase
      .from("live_match_player_details")
      .select("*")
      .eq("planned_match_id", input.matchId);

    if (refreshedError) {
      console.error("Nepodařilo se znovu načíst live detail hráčů:", refreshedError);
      return rows;
    }

    return (refreshed ?? []) as LiveMatchPlayerDetailRow[];
  } catch (error) {
    console.error("Chyba v finalizeLiveMatchPlayerDetails:", error);
    return [];
  }
}