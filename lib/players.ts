import { supabase } from "./supabaseClient";

export type Player = {
  id: string;
  club_id: string;
  name: string;
  number: number;
  position: string;
  profile_id?: string | null;
  created_at?: string;
};

export async function getPlayersByClubId(clubId: string): Promise<Player[]> {
  try {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("club_id", clubId)
      .order("number", { ascending: true });

    if (error) {
      console.error("Nepodařilo se načíst hráče:", error.message);
      return [];
    }

    return (data as Player[]) ?? [];
  } catch (error) {
    console.error("Chyba v getPlayersByClubId:", error);
    return [];
  }
}

export async function createPlayer(input: {
  clubId: string;
  name: string;
  number: number;
  position: string;
}): Promise<{ player: Player | null; errorMessage?: string }> {
  try {
    const trimmedName = input.name.trim();
    const trimmedPosition = input.position.trim();

    if (!trimmedName) {
      return {
        player: null,
        errorMessage: "Zadej jméno hráče.",
      };
    }

    if (!trimmedPosition) {
      return {
        player: null,
        errorMessage: "Zadej pozici hráče.",
      };
    }

    if (!Number.isInteger(input.number) || input.number <= 0) {
      return {
        player: null,
        errorMessage: "Zadej platné číslo hráče.",
      };
    }

    const { data, error } = await supabase
      .from("players")
      .insert([
        {
          club_id: input.clubId,
          name: trimmedName,
          number: input.number,
          position: trimmedPosition,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.error("Nepodařilo se vytvořit hráče:", error?.message);
      return {
        player: null,
        errorMessage: "Nepodařilo se uložit hráče.",
      };
    }

    return {
      player: data as Player,
    };
  } catch (error) {
    console.error("Chyba v createPlayer:", error);
    return {
      player: null,
      errorMessage: "Při ukládání hráče nastala chyba.",
    };
  }
}