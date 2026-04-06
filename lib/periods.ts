import { supabase } from "@/lib/supabaseClient";

export type Period = {
  id: string;
  club_id: string;
  name: string;
  type: "year" | "season";
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
  created_at?: string | null;
};

export async function getActivePeriod(clubId: string): Promise<Period | null> {
  const { data, error } = await supabase
    .from("periods")
    .select("*")
    .eq("club_id", clubId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Nepodařilo se načíst aktivní období:", error);
    return null;
  }

  return (data as Period) ?? null;
}

export async function getPeriodsByClubId(clubId: string): Promise<Period[]> {
  const { data, error } = await supabase
    .from("periods")
    .select("*")
    .eq("club_id", clubId)
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Nepodařilo se načíst období:", error);
    return [];
  }

  return (data as Period[]) ?? [];
}

export async function createPeriod({
  clubId,
  name,
  type,
  startDate,
  endDate,
}: {
  clubId: string;
  name: string;
  type: "year" | "season";
  startDate: string;
  endDate: string;
}): Promise<Period | null> {
  const { error: deactivateError } = await supabase
    .from("periods")
    .update({ is_active: false })
    .eq("club_id", clubId)
    .eq("is_active", true);

  if (deactivateError) {
    console.error("Nepodařilo se deaktivovat staré období:", deactivateError);
    return null;
  }

  const { data, error } = await supabase
    .from("periods")
    .insert({
      club_id: clubId,
      name,
      type,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      is_closed: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Nepodařilo se vytvořit období:", error);
    return null;
  }

  return (data as Period) ?? null;
}

export async function setActivePeriod(periodId: string, clubId: string): Promise<boolean> {
  const { error: deactivateError } = await supabase
    .from("periods")
    .update({ is_active: false })
    .eq("club_id", clubId)
    .eq("is_active", true);

  if (deactivateError) {
    console.error("Nepodařilo se deaktivovat původní aktivní období:", deactivateError);
    return false;
  }

  const { error: activateError } = await supabase
    .from("periods")
    .update({
      is_active: true,
      is_closed: false,
    })
    .eq("id", periodId)
    .eq("club_id", clubId);

  if (activateError) {
    console.error("Nepodařilo se nastavit aktivní období:", activateError);
    return false;
  }

  return true;
}

export async function closePeriod(periodId: string): Promise<boolean> {
  const { error } = await supabase
    .from("periods")
    .update({
      is_active: false,
      is_closed: true,
    })
    .eq("id", periodId);

  if (error) {
    console.error("Nepodařilo se uzavřít období:", error);
    return false;
  }

  return true;
}