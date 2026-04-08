import { supabase } from "@/lib/supabaseClient";

export type FineRow = {
  id: string;
  club_id: string;
  period_id: string;
  player_id: string;
  amount: number;
  reason: string;
  note?: string | null;
  fine_date: string;
  is_paid: boolean;
  created_by?: string | null;
  created_at?: string | null;
};

export type FineSummaryRow = {
  player_id: string;
  fines_count: number;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
};

function normalizeDateToIso(value?: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoDateTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDateTimeMatch) {
    return isoDateTimeMatch[1];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+.*)?$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month}-${day}`;
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+.*)?$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeFineRow(row: FineRow): FineRow {
  return {
    ...row,
    amount: Number(row.amount),
    fine_date: normalizeDateToIso(row.fine_date) || row.fine_date,
  };
}

export async function getFinesByPeriodId(periodId: string): Promise<FineRow[]> {
  const { data, error } = await supabase
    .from("fines")
    .select("*")
    .eq("period_id", periodId)
    .order("fine_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Nepodařilo se načíst pokuty období:", error);
    return [];
  }

  return ((data as FineRow[]) ?? []).map(normalizeFineRow);
}

export async function createFine({
  clubId,
  periodId,
  playerId,
  amount,
  reason,
  note,
  fineDate,
  createdBy,
}: {
  clubId: string;
  periodId: string;
  playerId: string;
  amount: number;
  reason: string;
  note?: string | null;
  fineDate: string;
  createdBy?: string | null;
}): Promise<FineRow | null> {
  const normalizedFineDate = normalizeDateToIso(fineDate);

  if (!normalizedFineDate) {
    console.error("Nepodařilo se vytvořit pokutu: neplatné datum", fineDate);
    return null;
  }

  const { data, error } = await supabase
    .from("fines")
    .insert({
      club_id: clubId,
      period_id: periodId,
      player_id: playerId,
      amount: Number(amount),
      reason,
      note: note ?? null,
      fine_date: normalizedFineDate,
      is_paid: false,
      created_by: createdBy ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      console.error(
        "Pokuta už existuje, duplicita byla zablokována databází:",
        error
      );
      return null;
    }

    console.error("Nepodařilo se vytvořit pokutu:", error);
    return null;
  }

  return data ? normalizeFineRow(data as FineRow) : null;
}

export async function findExistingPollFine({
  periodId,
  playerId,
  trainingId,
}: {
  periodId: string;
  playerId: string;
  trainingId: string;
}): Promise<FineRow | null> {
  const { data, error } = await supabase
    .from("fines")
    .select("*")
    .eq("period_id", periodId)
    .eq("player_id", playerId)
    .eq("note", `training:${trainingId}`)
    .maybeSingle();

  if (error) {
    console.error("Nepodařilo se ověřit existující pokutu za anketu:", error);
    return null;
  }

  if (!data) return null;

  return normalizeFineRow(data as FineRow);
}

export async function updateFine({
  fineId,
  amount,
  reason,
  note,
  fineDate,
}: {
  fineId: string;
  amount: number;
  reason: string;
  note?: string | null;
  fineDate: string;
}): Promise<FineRow | null> {
  const normalizedFineDate = normalizeDateToIso(fineDate);

  if (!normalizedFineDate) {
    console.error("Nepodařilo se upravit pokutu: neplatné datum", fineDate);
    return null;
  }

  const { data, error } = await supabase
    .from("fines")
    .update({
      amount: Number(amount),
      reason,
      note: note ?? null,
      fine_date: normalizedFineDate,
    })
    .eq("id", fineId)
    .select("*")
    .single();

  if (error) {
    console.error("Nepodařilo se upravit pokutu:", error);
    return null;
  }

  return data ? normalizeFineRow(data as FineRow) : null;
}

export async function setFinePaidStatus({
  fineId,
  isPaid,
}: {
  fineId: string;
  isPaid: boolean;
}): Promise<boolean> {
  const { error } = await supabase
    .from("fines")
    .update({
      is_paid: isPaid,
    })
    .eq("id", fineId);

  if (error) {
    console.error("Nepodařilo se změnit stav pokuty:", error);
    return false;
  }

  return true;
}

export async function deleteFine(fineId: string): Promise<boolean> {
  const { error } = await supabase
    .from("fines")
    .delete()
    .eq("id", fineId);

  if (error) {
    console.error("Nepodařilo se smazat pokutu:", error);
    return false;
  }

  return true;
}

export function buildFineSummaryByPlayer(fines: FineRow[]): FineSummaryRow[] {
  const map = new Map<string, FineSummaryRow>();

  fines.forEach((fine) => {
    if (!map.has(fine.player_id)) {
      map.set(fine.player_id, {
        player_id: fine.player_id,
        fines_count: 0,
        total_amount: 0,
        paid_amount: 0,
        unpaid_amount: 0,
      });
    }

    const current = map.get(fine.player_id)!;
    const amount = Number(fine.amount);

    current.fines_count += 1;
    current.total_amount += amount;

    if (fine.is_paid) {
      current.paid_amount += amount;
    } else {
      current.unpaid_amount += amount;
    }
  });

  return Array.from(map.values()).map((item) => ({
    ...item,
    total_amount: Number(item.total_amount.toFixed(2)),
    paid_amount: Number(item.paid_amount.toFixed(2)),
    unpaid_amount: Number(item.unpaid_amount.toFixed(2)),
  }));
}

export function getTotalFineAmount(fines: FineRow[]): number {
  return Number(
    fines.reduce((sum, fine) => sum + Number(fine.amount), 0).toFixed(2)
  );
}

export function getPaidFineAmount(fines: FineRow[]): number {
  return Number(
    fines
      .filter((fine) => fine.is_paid)
      .reduce((sum, fine) => sum + Number(fine.amount), 0)
      .toFixed(2)
  );
}

export function getUnpaidFineAmount(fines: FineRow[]): number {
  return Number(
    fines
      .filter((fine) => !fine.is_paid)
      .reduce((sum, fine) => sum + Number(fine.amount), 0)
      .toFixed(2)
  );
}