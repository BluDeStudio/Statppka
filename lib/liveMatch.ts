export type MatchStatus =
  | "planned"
  | "prepared"
  | "live"
  | "halftime"
  | "finished";

export const HALF_DURATION_SECONDS = 25 * 60;

export type LiveMatchFields = {
  status: MatchStatus;
  current_period: number;
  first_half_started_at: string | null;
  first_half_elapsed_seconds: number;
  second_half_started_at: string | null;
  second_half_elapsed_seconds: number;
};

export function getRunningElapsedSeconds(
  savedElapsedSeconds: number,
  startedAt: string | null
) {
  if (!startedAt) {
    return savedElapsedSeconds;
  }

  const startedAtMs = new Date(startedAt).getTime();
  const nowMs = Date.now();
  const diffSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

  return savedElapsedSeconds + diffSeconds;
}

export function getFirstHalfElapsedSeconds(match: LiveMatchFields) {
  if (match.status === "live" && match.current_period === 1) {
    return Math.min(
      HALF_DURATION_SECONDS,
      getRunningElapsedSeconds(
        match.first_half_elapsed_seconds,
        match.first_half_started_at
      )
    );
  }

  return Math.min(HALF_DURATION_SECONDS, match.first_half_elapsed_seconds);
}

export function getSecondHalfElapsedSeconds(match: LiveMatchFields) {
  if (match.status === "live" && match.current_period === 2) {
    return Math.min(
      HALF_DURATION_SECONDS,
      getRunningElapsedSeconds(
        match.second_half_elapsed_seconds,
        match.second_half_started_at
      )
    );
  }

  return Math.min(HALF_DURATION_SECONDS, match.second_half_elapsed_seconds);
}

export function getTotalElapsedSeconds(match: LiveMatchFields) {
  return (
    getFirstHalfElapsedSeconds(match) + getSecondHalfElapsedSeconds(match)
  );
}

export function formatMatchClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function canEditLineup(status: MatchStatus) {
  return status === "planned" || status === "prepared";
}

export function canStartMatch(status: MatchStatus) {
  return status === "prepared";
}