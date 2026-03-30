import { supabase } from "@/lib/supabaseClient";

export async function getTrainingsByClubId(clubId: string) {
  const { data, error } = await supabase
    .from("trainings")
    .select("*")
    .eq("club_id", clubId)
    .order("date", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
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
    time?: string;
    location?: string;
    note?: string;
  };
}) {
  const { data, error } = await supabase
    .from("trainings")
    .insert({
      club_id: clubId,
      created_by: userId,
      ...training,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function setTrainingAttendance({
  trainingId,
  playerId,
  status,
}: {
  trainingId: string;
  playerId: string;
  status: "yes" | "no";
}) {
  const { error } = await supabase
    .from("training_attendance")
    .upsert({
      training_id: trainingId,
      player_id: playerId,
      status,
    });

  if (error) {
    console.error(error);
    return false;
  }

  return true;
}

export async function getTrainingAttendance(trainingId: string) {
  const { data, error } = await supabase
    .from("training_attendance")
    .select("*")
    .eq("training_id", trainingId);

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

