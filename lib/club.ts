import { supabase } from "./supabaseClient";

export type Club = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  has_b_team: boolean;
  created_by: string;
  created_at?: string;
};

export type ClubMember = {
  id: string;
  club_id: string;
  user_id: string;
  role: "admin" | "member";
  created_at?: string;
};

export type ClubInvite = {
  id: string;
  club_id: string;
  token: string;
  created_by: string;
  active: boolean;
  created_at?: string;
};

function makeInviteToken() {
  return `TEAM-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now()
    .toString(36)
    .toUpperCase()}`;
}

function getAppBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "https://myteamhub.cz";
}

export async function getMyClubMembership(userId: string): Promise<ClubMember | null> {
  try {
    const { data, error } = await supabase
      .from("club_members")
      .select("*")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Nepodařilo se načíst členství:", error.message);
      return null;
    }

    if (!data) return null;

    return {
      ...(data as ClubMember),
      role: ((data as ClubMember).role ?? "member") as "admin" | "member",
    };
  } catch (error) {
    console.error("Chyba v getMyClubMembership:", error);
    return null;
  }
}

export async function getClubById(clubId: string): Promise<Club | null> {
  try {
    const { data, error } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .maybeSingle();

    if (error) {
      console.error("Nepodařilo se načíst klub:", error.message);
      return null;
    }

    return (data as Club | null) ?? null;
  } catch (error) {
    console.error("Chyba v getClubById:", error);
    return null;
  }
}

export async function createClub(input: {
  userId: string;
  name: string;
  hasBTeam: boolean;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}): Promise<{ club: Club | null; membership: ClubMember | null; errorMessage?: string }> {
  try {
    const { data: existingMembership, error: membershipCheckError } = await supabase
      .from("club_members")
      .select("*")
      .eq("user_id", input.userId)
      .limit(1)
      .maybeSingle();

    if (membershipCheckError) {
      return {
        club: null,
        membership: null,
        errorMessage: "Nepodařilo se ověřit existující členství.",
      };
    }

    if (existingMembership) {
      return {
        club: null,
        membership: null,
        errorMessage: "Už jsi členem nějakého klubu.",
      };
    }

    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .insert([
        {
          name: input.name,
          has_b_team: input.hasBTeam,
          logo_url: input.logoUrl ?? null,
          primary_color: input.primaryColor ?? "#1db954",
          secondary_color: input.secondaryColor ?? "#050805",
          created_by: input.userId,
        },
      ])
      .select()
      .single();

    if (clubError || !club) {
      console.error("Nepodařilo se vytvořit klub:", clubError?.message);
      return {
        club: null,
        membership: null,
        errorMessage: "Nepodařilo se vytvořit tým.",
      };
    }

    const { data: membership, error: memberError } = await supabase
      .from("club_members")
      .insert([
        {
          club_id: club.id,
          user_id: input.userId,
          role: "admin",
        },
      ])
      .select()
      .single();

    if (memberError || !membership) {
      console.error("Nepodařilo se vytvořit členství:", memberError?.message);
      return {
        club: club as Club,
        membership: null,
        errorMessage: "Tým vznikl, ale nepodařilo se založit členství.",
      };
    }

    return {
      club: club as Club,
      membership: {
        ...(membership as ClubMember),
        role: ((membership as ClubMember).role ?? "admin") as "admin" | "member",
      },
    };
  } catch (error) {
    console.error("Chyba v createClub:", error);
    return {
      club: null,
      membership: null,
      errorMessage: "Při vytváření týmu nastala chyba.",
    };
  }
}

export async function updateClub(input: {
  clubId: string;
  name?: string;
  hasBTeam?: boolean;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
}): Promise<{ club: Club | null; errorMessage?: string }> {
  try {
    const payload: Record<string, unknown> = {};

    if (typeof input.name === "string") {
      payload.name = input.name.trim();
    }

    if (typeof input.hasBTeam === "boolean") {
      payload.has_b_team = input.hasBTeam;
    }

    if (typeof input.logoUrl !== "undefined") {
      payload.logo_url = input.logoUrl;
    }

    if (typeof input.primaryColor === "string") {
      payload.primary_color = input.primaryColor;
    }

    if (typeof input.secondaryColor === "string") {
      payload.secondary_color = input.secondaryColor;
    }

    const { data, error } = await supabase
      .from("clubs")
      .update(payload)
      .eq("id", input.clubId)
      .select()
      .single();

    if (error || !data) {
      console.error("Nepodařilo se upravit klub:", error?.message);
      return {
        club: null,
        errorMessage: "Nepodařilo se upravit tým.",
      };
    }

    return {
      club: data as Club,
    };
  } catch (error) {
    console.error("Chyba v updateClub:", error);
    return {
      club: null,
      errorMessage: "Při úpravě týmu nastala chyba.",
    };
  }
}

export async function createInviteLink(
  clubId: string,
  createdBy: string
): Promise<string | null> {
  try {
    const token = makeInviteToken();

    const { error } = await supabase.from("club_invites").insert([
      {
        club_id: clubId,
        token,
        created_by: createdBy,
        active: true,
      },
    ]);

    if (error) {
      console.error("Nepodařilo se vytvořit pozvánku:", error.message);
      return null;
    }

    const baseUrl = getAppBaseUrl();
    return `${baseUrl}/?invite=${encodeURIComponent(token)}`;
  } catch (error) {
    console.error("Chyba v createInviteLink:", error);
    return null;
  }
}

export async function joinClubByInviteToken(
  userId: string,
  token: string
): Promise<{ club: Club | null; membership: ClubMember | null; errorMessage?: string }> {
  try {
    const cleanedToken = token.trim();

    if (!cleanedToken) {
      return {
        club: null,
        membership: null,
        errorMessage: "Chybí token pozvánky.",
      };
    }

    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from("club_members")
      .select("*")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existingMembershipError) {
      return {
        club: null,
        membership: null,
        errorMessage: "Nepodařilo se ověřit tvoje členství.",
      };
    }

    if (existingMembership) {
      const club = await getClubById(existingMembership.club_id);
      return {
        club,
        membership: {
          ...(existingMembership as ClubMember),
          role: ((existingMembership as ClubMember).role ?? "member") as "admin" | "member",
        },
        errorMessage: club ? undefined : "Už jsi členem klubu, ale klub se nepodařilo načíst.",
      };
    }

    const { data: invite, error: inviteError } = await supabase
      .from("club_invites")
      .select("*")
      .eq("token", cleanedToken)
      .eq("active", true)
      .maybeSingle();

    if (inviteError || !invite) {
      return {
        club: null,
        membership: null,
        errorMessage: "Pozvánka nebyla nalezena nebo už není aktivní.",
      };
    }

    const { data: membership, error: memberError } = await supabase
      .from("club_members")
      .insert([
        {
          club_id: invite.club_id,
          user_id: userId,
          role: "member",
        },
      ])
      .select()
      .single();

    if (memberError || !membership) {
      return {
        club: null,
        membership: null,
        errorMessage: "Nepodařilo se připojit ke klubu.",
      };
    }

    const club = await getClubById(invite.club_id);

    return {
      club,
      membership: {
        ...(membership as ClubMember),
        role: ((membership as ClubMember).role ?? "member") as "admin" | "member",
      },
      errorMessage: club ? undefined : "Připojení proběhlo, ale klub se nepodařilo načíst.",
    };
  } catch (error) {
    console.error("Chyba v joinClubByInviteToken:", error);
    return {
      club: null,
      membership: null,
      errorMessage: "Při připojování ke klubu nastala chyba.",
    };
  }
}