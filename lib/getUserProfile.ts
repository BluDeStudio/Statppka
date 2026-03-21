import { supabase } from "./supabaseClient";

export type UserProfile = {
  id: string;
  email: string | null;
  role?: "admin" | "host" | null;
  created_at?: string;
};

export async function getOrCreateProfile(): Promise<UserProfile | null> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Nepodařilo se načíst přihlášeného uživatele:", userError?.message);
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileError && profile) {
      return profile as UserProfile;
    }

    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert([
        {
          id: user.id,
          email: user.email,
          role: "host",
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Nepodařilo se vytvořit profil:", insertError.message);
      return null;
    }

    return newProfile as UserProfile;
  } catch (error) {
    console.error("Chyba v getOrCreateProfile:", error);
    return null;
  }
}