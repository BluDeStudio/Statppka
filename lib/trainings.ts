import { supabase } from "@/lib/supabaseClient";

export type TrainingAttendanceStatus = "yes" | "no";

export type TrainingRow = {
  id: string;
  club_id: string;
  created_by: string | null;
  date: string;
  time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  note?: string | null;
  poll_enabled?: boolean;
  created_at?: string | null;
};

export type TrainingAttendanceRow = {
  id?: string;
  training_id: string;
  player_id: string;
  status: TrainingAttendanceStatus;
  created_at?: string | null;
};

export type TrainingPresenceRow = {
  id?: string;
  training_id: string;
  player_id: string;
  present: boolean;
  created_at?: string | null;
};

export async function getTrainingsByClubId(clubId: string): Promise<TrainingRow[]> {
  const { data, error } = await supabase
    .from("trainings")
    .select("*")
    .eq("club_id", clubId)
    .order("date", { ascending: true });

  if (error) {
    console.error("Nepodařilo se načíst tréninky:", error);
    return [];
  }

  return (data as TrainingRow[]) ?? [];
}

export async function createTraining({
  clubId,
  userId,
  training,
}: {
  clubId: string;
  userId: string;
  training: {
    date: string;
    time?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    note?: string | null;
    poll_enabled?: boolean;
  };
}): Promise<TrainingRow | null> {
  const payload = {
    club_id: clubId,
    created_by: userId,
    date: training.date,
    time: training.time ?? null,
    start_time: training.start_time ?? null,
    end_time: training.end_time ?? null,
    location: training.location ?? null,
    note: training.note ?? null,
    poll_enabled: training.poll_enabled ?? true,
  };

  const { data, error } = await supabase
    .from("trainings")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Nepodařilo se vytvořit trénink:", error);
    return null;
  }

  return (data as TrainingRow) ?? null;
}

export async function updateTraining({
  trainingId,
  training,
}: {
  trainingId: string;
  training: {
    date: string;
    time?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    note?: string | null;
    poll_enabled?: boolean;
  };
}): Promise<TrainingRow | null> {
  const payload = {
    date: training.date,
    time: training.time ?? null,
    start_time: training.start_time ?? null,
    end_time: training.end_time ?? null,
    location: training.location ?? null,
    note: training.note ?? null,
    ...(typeof training.poll_enabled === "boolean"
      ? { poll_enabled: training.poll_enabled }
      : {}),
  };

  const { data, error } = await supabase
    .from("trainings")
    .update(payload)
    .eq("id", trainingId)
    .select()
    .single();

  if (error) {
    console.error("Nepodařilo se upravit trénink:", error);
    return null;
  }

  return (data as TrainingRow) ?? null;
}

export async function deleteTraining(trainingId: string): Promise<boolean> {
  const { error } = await supabase
    .from("trainings")
    .delete()
    .eq("id", trainingId);

  if (error) {
    console.error("Nepodařilo se smazat trénink:", error);
    return false;
  }

  return true;
}

export async function setTrainingAttendance({
  trainingId,
  playerId,
  status,
}: {
  trainingId: string;
  playerId: string;
  status: TrainingAttendanceStatus;
}): Promise<boolean> {
  const { error } = await supabase
    .from("training_attendance")
    .upsert(
      {
        training_id: trainingId,
        player_id: playerId,
        status,
      },
      {
        onConflict: "training_id,player_id",
      }
    );

  if (error) {
    console.error("Nepodařilo se uložit docházku na trénink:", error);
    return false;
  }

  return true;
}

export async function getTrainingAttendance(
  trainingId: string
): Promise<TrainingAttendanceRow[]> {
  const { data, error } = await supabase
    .from("training_attendance")
    .select("*")
    .eq("training_id", trainingId);

  if (error) {
    console.error("Nepodařilo se načíst docházku tréninku:", error);
    return [];
  }

  return (data as TrainingAttendanceRow[]) ?? [];
}

export async function getTrainingPresence(
  trainingId: string
): Promise<TrainingPresenceRow[]> {
  const { data, error } = await supabase
    .from("training_presence")
    .select("*")
    .eq("training_id", trainingId);

  if (error) {
    console.error("Nepodařilo se načíst reálnou účast na tréninku:", error);
    return [];
  }

  return (data as TrainingPresenceRow[]) ?? [];
}

export async function saveTrainingPresence({
  trainingId,
  playerIds,
}: {
  trainingId: string;
  playerIds: string[];
}): Promise<boolean> {
  const { error: deleteError } = await supabase
    .from("training_presence")
    .delete()
    .eq("training_id", trainingId);

  if (deleteError) {
    console.error("Nepodařilo se smazat původní účast:", deleteError);
    return false;
  }

  if (playerIds.length === 0) {
    return true;
  }

  const rows = playerIds.map((playerId) => ({
    training_id: trainingId,
    player_id: playerId,
    present: true,
  }));

  const { error: insertError } = await supabase
    .from("training_presence")
    .insert(rows);

  if (insertError) {
    console.error("Nepodařilo se uložit reálnou účast:", insertError);
    return false;
  }

  return true;
}

