import { supabase } from "@/lib/supabaseClient";

export type FineTemplateRow = {
  id: string;
  club_id: string;
  name: string;
  default_amount: number;
  is_active: boolean;
  created_at?: string | null;
};

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

  return ((data as FineTemplateRow[]) ?? []).map((item) => ({
    ...item,
    default_amount: Number(item.default_amount),
  }));
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
  const { data, error } = await supabase
    .from("fine_templates")
    .insert({
      club_id: clubId,
      name,
      default_amount: defaultAmount,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Nepodařilo se vytvořit týmovou pokutu:", error);
    return null;
  }

  return data
    ? {
        ...(data as FineTemplateRow),
        default_amount: Number((data as FineTemplateRow).default_amount),
      }
    : null;
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
  const { data, error } = await supabase
    .from("fine_templates")
    .update({
      name,
      default_amount: defaultAmount,
      is_active: isActive,
    })
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) {
    console.error("Nepodařilo se upravit týmovou pokutu:", error);
    return null;
  }

  return data
    ? {
        ...(data as FineTemplateRow),
        default_amount: Number((data as FineTemplateRow).default_amount),
      }
    : null;
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

