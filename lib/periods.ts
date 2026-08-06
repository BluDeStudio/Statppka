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
  makeActive?: boolean;
};

type CloseAndCreatePeriodInput = {
  clubId: string;
  closingPeriodId: string;
  name: string;
  type: PeriodType;
  startDate: string;
  endDate: string;
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
  makeActive = true,
}: CreatePeriodInput): Promise<Period | null> {
  if (makeActive) {
    const { error: deactivateError } = await supabase
      .from("periods")
      .update({ is_active: false })
      .eq("club_id", clubId)
      .eq("is_active", true);

    if (deactivateError) {
      console.error("Nepodařilo se deaktivovat původní období:", deactivateError);
      return null;
    }
  }

  const { data, error } = await supabase
    .from("periods")
    .insert({
      club_id: clubId,
      name,
      type,
      start_date: startDate,
      end_date: endDate,
      is_active: makeActive,
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

  if (!closingPeriod.is_active) {
    console.error("Ukončit lze pouze právě aktivní období.");
    return null;
  }

  const { data: unpaidFines, error: unpaidFinesError } = await supabase
    .from("fines")
    .select("id")
    .eq("period_id", closingPeriodId)
    .eq("is_paid", false)
    .limit(1);

  if (unpaidFinesError) {
    console.error("Nepodařilo se ověřit nezaplacené pokuty:", unpaidFinesError);
    return null;
  }

  if ((unpaidFines?.length ?? 0) > 0) {
    console.error("Období nelze uzavřít, dokud existují nezaplacené pokuty.");
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
