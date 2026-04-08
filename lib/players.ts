import { supabase } from "./supabaseClient";

export type Player = {
  id: string;
  club_id: string;
  name: string;
  number: number;
  position: string;
  profile_id?: string | null;
  birth_date?: string | null;
  created_at?: string;
};

export type ClubMemberPlayer = {
  id: string;
  club_id: string;
  name: string;
  number: number;
  position: string;
  profile_id?: string | null;
  birth_date?: string | null;
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

export async function getClubMemberPlayersByClubId(
  clubId: string
): Promise<ClubMemberPlayer[]> {
  try {
    const { data: memberships, error: membershipsError } = await supabase
      .from("club_members")
      .select("user_id, club_id, created_at")
      .eq("club_id", clubId);

    if (membershipsError) {
      console.error(
        "Nepodařilo se načíst členy klubu pro disciplínu:",
        membershipsError.message
      );
      return [];
    }

    const membershipRows =
      ((memberships as {
        user_id: string;
        club_id: string;
        created_at?: string | null;
      }[]) ?? []).filter((row) => Boolean(row.user_id));

    if (membershipRows.length === 0) {
      return [];
    }

    const userIds = membershipRows.map((row) => row.user_id);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .in("id", userIds);

    if (profilesError) {
      console.error(
        "Nepodařilo se načíst profily členů klubu pro disciplínu:",
        profilesError.message
      );
      return [];
    }

    const profilesMap = new Map<
      string,
      { id: string; email?: string | null; created_at?: string | null }
    >();

    (((profiles as {
      id: string;
      email?: string | null;
      created_at?: string | null;
    }[]) ?? [])).forEach((profile) => {
      profilesMap.set(profile.id, profile);
    });

    const mapped: ClubMemberPlayer[] = membershipRows.map((membership, index) => {
      const profile = profilesMap.get(membership.user_id);

      const email = profile?.email?.trim() ?? "";
      const fallbackName = email.includes("@") ? email.split("@")[0] : email;
      const safeName = fallbackName || `Člen ${index + 1}`;

      return {
        id: membership.user_id,
        club_id: membership.club_id,
        name: safeName,
        number: index + 1,
        position: "member",
        profile_id: membership.user_id,
        birth_date: null,
        created_at:
          membership.created_at ?? profile?.created_at ?? new Date().toISOString(),
      };
    });

    return mapped.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  } catch (error) {
    console.error("Chyba v getClubMemberPlayersByClubId:", error);
    return [];
  }
}

export async function createPlayer(input: {
  clubId: string;
  name: string;
  number: number;
  position: string;
  birth_date?: string | null;
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
          birth_date: input.birth_date ?? null,
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

export async function updatePlayer(input: {
  playerId: string;
  name: string;
  number: number;
  position: string;
  birth_date?: string | null;
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
      .update({
        name: trimmedName,
        number: input.number,
        position: trimmedPosition,
        birth_date: input.birth_date ?? null,
      })
      .eq("id", input.playerId)
      .select()
      .single();

    if (error || !data) {
      console.error("Update player error:", error?.message);
      return {
        player: null,
        errorMessage: "Nepodařilo se upravit hráče.",
      };
    }

    return {
      player: data as Player,
    };
  } catch (error) {
    console.error("Chyba v updatePlayer:", error);
    return {
      player: null,
      errorMessage: "Při úpravě hráče nastala chyba.",
    };
  }
}