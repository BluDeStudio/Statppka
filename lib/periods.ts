import { supabase } from "@/lib/supabaseClient";

export type PeriodType = "year" | "season";

export type Period = {
  id: string;
  club_id: string;
  name: string;
  type: PeriodType;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
  created_at?: string | null;
};

type CreatePeriodInput = {
  clubId: string;
  name: string;
  type: PeriodType;
  startDate: string;
  endDate: string;
};

type CloseAndCreatePeriodInput = CreatePeriodInput & {
  closingPeriodId: string;
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
}: CreatePeriodInput): Promise<Period | null> {
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

export async function setActivePeriod(
  periodId: string,
  clubId: string
): Promise<boolean> {
  const { data: selectedPeriod, error: selectedPeriodError } = await supabase
    .from("periods")
    .select("id, is_closed")
    .eq("id", periodId)
    .eq("club_id", clubId)
    .maybeSingle();

  if (selectedPeriodError || !selectedPeriod) {
    console.error(
      "Nepodařilo se ověřit období:",
      selectedPeriodError ?? "Období neexistuje."
    );
    return false;
  }

  if (selectedPeriod.is_closed) {
    console.error("Uzavřené období nelze znovu nastavit jako aktivní.");
    return false;
  }

  const { error: deactivateError } = await supabase
    .from("periods")
    .update({ is_active: false })
    .eq("club_id", clubId)
    .eq("is_active", true);

  if (deactivateError) {
    console.error(
      "Nepodařilo se deaktivovat původní aktivní období:",
      deactivateError
    );
    return false;
  }

  const { error: activateError } = await supabase
    .from("periods")
    .update({ is_active: true })
    .eq("id", periodId)
    .eq("club_id", clubId)
    .eq("is_closed", false);

  if (activateError) {
    console.error("Nepodařilo se nastavit aktivní období:", activateError);
    return false;
  }

  return true;
}

export async function closePeriod(
  periodId: string,
  clubId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("periods")
    .update({
      is_active: false,
      is_closed: true,
    })
    .eq("id", periodId)
    .eq("club_id", clubId);

  if (error) {
    console.error("Nepodařilo se uzavřít období:", error);
    return false;
  }

  return true;
}

/**
 * Uzavře současné období a vytvoří nové aktivní období.
 * Pokud vytvoření nového období selže, pokusí se původní období znovu otevřít,
 * aby klub nezůstal bez aktivního období.
 */
export async function closeAndCreatePeriod({
  clubId,
  closingPeriodId,
  name,
  type,
  startDate,
  endDate,
}: CloseAndCreatePeriodInput): Promise<Period | null> {
  const { data: closingPeriod, error: closingPeriodError } = await supabase
    .from("periods")
    .select("*")
    .eq("id", closingPeriodId)
    .eq("club_id", clubId)
    .maybeSingle();

  if (closingPeriodError || !closingPeriod) {
    console.error(
      "Nepodařilo se načíst uzavírané období:",
      closingPeriodError ?? "Období neexistuje."
    );
    return null;
  }

  const closed = await closePeriod(closingPeriodId, clubId);
  if (!closed) return null;

  const { data: createdPeriod, error: createError } = await supabase
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

  if (!createError && createdPeriod) {
    return createdPeriod as Period;
  }

  console.error("Nepodařilo se vytvořit navazující období:", createError);

  const { error: rollbackError } = await supabase
    .from("periods")
    .update({
      is_active: true,
      is_closed: false,
    })
    .eq("id", closingPeriodId)
    .eq("club_id", clubId);

  if (rollbackError) {
    console.error(
      "Nepodařilo se obnovit původní období po chybě:",
      rollbackError
    );
  }

  return null;
}
