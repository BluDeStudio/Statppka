import { supabase } from "@/lib/supabaseClient";

export type FineTemplateRow = {
  id: string;
  club_id: string;
  name: string;
  default_amount: number;
  is_active: boolean;
  created_at?: string | null;
};

const DEFAULT_FINE_TEMPLATES: Array<{
  name: string;
  default_amount: number;
}> = [
  { name: "Pozdní příchod", default_amount: 20 },
  { name: "Neomluvený trénink", default_amount: 50 },
  { name: "Nesportovní chování", default_amount: 50 },
  { name: "Žlutá karta", default_amount: 125 },
  { name: "Červená karta", default_amount: 225 },
  { name: "Nedorazí na zápas", default_amount: 300 },
  { name: "Ankety", default_amount: 10 },
  { name: "Zápasy", default_amount: 20 },
];

const ensureRequestsByClub = new Map<string, Promise<FineTemplateRow[]>>();

function normalizeTemplateName(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function normalizeTemplateRow(row: FineTemplateRow): FineTemplateRow {
  return {
    ...row,
    name: row.name.trim(),
    default_amount: Number(row.default_amount),
  };
}

function deduplicateTemplates(rows: FineTemplateRow[]): FineTemplateRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;

    const aCreated = a.created_at ?? "";
    const bCreated = b.created_at ?? "";

    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return a.id.localeCompare(b.id);
  });

  const unique = new Map<string, FineTemplateRow>();

  sorted.forEach((row) => {
    const key = normalizeTemplateName(row.name);
    if (!key || unique.has(key)) return;
    unique.set(key, normalizeTemplateRow(row));
  });

  return Array.from(unique.values()).sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name, "cs");
  });
}

export async function getFineTemplatesByClubId(
  clubId: string
): Promise<FineTemplateRow[]> {
  const { data, error } = await supabase
    .from("fine_templates")
    .select("*")
    .eq("club_id", clubId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("Nepodařilo se načíst týmové pokuty:", error);
    return [];
  }

  return deduplicateTemplates(
    ((data as FineTemplateRow[]) ?? []).map(normalizeTemplateRow)
  );
}

async function ensureDefaultFineTemplatesInternal(
  clubId: string
): Promise<FineTemplateRow[]> {
  const existing = await getFineTemplatesByClubId(clubId);

  const existingNames = new Set(
    existing.map((item) => normalizeTemplateName(item.name))
  );

  const missingTemplates = DEFAULT_FINE_TEMPLATES.filter(
    (item) => !existingNames.has(normalizeTemplateName(item.name))
  );

  for (const template of missingTemplates) {
    const normalizedName = normalizeTemplateName(template.name);

    if (existingNames.has(normalizedName)) continue;

    const { error } = await supabase.from("fine_templates").insert({
      club_id: clubId,
      name: template.name.trim(),
      default_amount: Number(template.default_amount),
      is_active: true,
    });

    if (error && error.code !== "23505") {
      console.error(
        `Nepodařilo se doplnit výchozí týmovou pokutu "${template.name}":`,
        error
      );
      continue;
    }

    existingNames.add(normalizedName);
  }

  return await getFineTemplatesByClubId(clubId);
}

export async function ensureDefaultFineTemplates(
  clubId: string
): Promise<FineTemplateRow[]> {
  const runningRequest = ensureRequestsByClub.get(clubId);
  if (runningRequest) return await runningRequest;

  const request = ensureDefaultFineTemplatesInternal(clubId);
  ensureRequestsByClub.set(clubId, request);

  try {
    return await request;
  } finally {
    ensureRequestsByClub.delete(clubId);
  }
}

export async function createFineTemplate({
  clubId,
  name,
  defaultAmount,
}: {
  clubId: string;
  name: string;
  defaultAmount: number;
}): Promise<FineTemplateRow | null> {
  const trimmedName = name.trim();
  const normalizedName = normalizeTemplateName(trimmedName);

  if (!trimmedName || !normalizedName) {
    console.error("Nepodařilo se vytvořit týmovou pokutu: chybí název.");
    return null;
  }

  const existing = await getFineTemplatesByClubId(clubId);
  const duplicate = existing.find(
    (item) => normalizeTemplateName(item.name) === normalizedName
  );

  if (duplicate) {
    console.error(`Týmová pokuta "${trimmedName}" už v tomto klubu existuje.`);
    return null;
  }

  const { data, error } = await supabase
    .from("fine_templates")
    .insert({
      club_id: clubId,
      name: trimmedName,
      default_amount: Number(defaultAmount),
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      console.error(`Týmová pokuta "${trimmedName}" už v tomto klubu existuje.`);
      return null;
    }

    console.error("Nepodařilo se vytvořit týmovou pokutu:", error);
    return null;
  }

  return data ? normalizeTemplateRow(data as FineTemplateRow) : null;
}

export async function updateFineTemplate({
  templateId,
  name,
  defaultAmount,
  isActive,
}: {
  templateId: string;
  name: string;
  defaultAmount: number;
  isActive: boolean;
}): Promise<FineTemplateRow | null> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    console.error("Nepodařilo se upravit týmovou pokutu: chybí název.");
    return null;
  }

  const { data, error } = await supabase
    .from("fine_templates")
    .update({
      name: trimmedName,
      default_amount: Number(defaultAmount),
      is_active: isActive,
    })
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      console.error(`Týmová pokuta "${trimmedName}" už v tomto klubu existuje.`);
      return null;
    }

    console.error("Nepodařilo se upravit týmovou pokutu:", error);
    return null;
  }

  return data ? normalizeTemplateRow(data as FineTemplateRow) : null;
}

export async function deleteFineTemplate(templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from("fine_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    console.error("Nepodařilo se smazat týmovou pokutu:", error);
    return false;
  }

  return true;
}
