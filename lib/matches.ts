import { supabase } from "./supabaseClient";
import { getFineTemplatesByClubId } from "./fineTemplates";
import type { FinishedMatch, FinishedMatchEvent, PlannedMatch } from "@/app/page";

export type MatchRatingColor =
  | "red"
  | "orange"
  | "light_green"
  | "dark_green"
  | "blue";

type FinishedMatchPlayerStatWithId = FinishedMatch["playerStats"][number] & {
  playerId?: string | null;
  player_id?: string | null;
};

type FinishedMatchEventWithIds = FinishedMatchEvent & {
  period?: number | null;
  minute?: number | null;
  matchMinute?: number | null;
  match_minute?: number | null;

  scorerPlayerId?: string | null;
  assistPlayerId?: string | null;
  playerId?: string | null;

  scorer_player_id?: string | null;
  assist_player_id?: string | null;
  card_player_id?: string | null;
};

type GoalkeeperSegment = {
  id?: string;
  finishedMatchId?: string;
  playerId: string | null;
  playerNumber: number | null;
  period?: number | null;
  startMinute: number;
  endMinute: number;
  goalsAgainst?: number;
};

type FinishedMatchWithGoalkeepers = FinishedMatch & {
  goalkeeperSegments?: GoalkeeperSegment[];
};

function normalizeTemplateName(value?: string | null) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isYellowCardTemplate(name?: string | null) {
  const normalized = normalizeTemplateName(name);
  return (
    normalized.includes("zluta") ||
    normalized === "zk" ||
    normalized === "zk karta"
  );
}

function isRedCardTemplate(name?: string | null) {
  const normalized = normalizeTemplateName(name);
  return (
    normalized.includes("cervena") ||
    normalized === "ck" ||
    normalized === "ck karta"
  );
}

function normalizeDateToIso(value?: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoDateTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDateTimeMatch) return isoDateTimeMatch[1];

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

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

function getStatPlayerId(stat: FinishedMatchPlayerStatWithId) {
  return stat.playerId ?? stat.player_id ?? null;
}

function getEventPeriod(event: FinishedMatchEventWithIds) {
  return event.period ?? null;
}

function getEventMinute(event: FinishedMatchEventWithIds) {
  return event.minute ?? event.matchMinute ?? event.match_minute ?? null;
}

function getGoalScorerPlayerId(event: FinishedMatchEventWithIds) {
  return event.scorerPlayerId ?? event.scorer_player_id ?? null;
}

function getGoalAssistPlayerId(event: FinishedMatchEventWithIds) {
  return event.assistPlayerId ?? event.assist_player_id ?? null;
}

function getCardPlayerId(event: FinishedMatchEventWithIds) {
  return event.playerId ?? event.card_player_id ?? null;
}

function getGoalkeeperSegments(match: FinishedMatch): GoalkeeperSegment[] {
  return ((match as FinishedMatchWithGoalkeepers).goalkeeperSegments ?? []).map(
    (segment) => ({
      id: segment.id,
      finishedMatchId: segment.finishedMatchId,
      playerId: segment.playerId ?? null,
      playerNumber:
        typeof segment.playerNumber === "number" ? segment.playerNumber : null,
      period: segment.period ?? null,
      startMinute: Number(segment.startMinute ?? 0),
      endMinute: Number(segment.endMinute ?? 0),
      goalsAgainst: Number(segment.goalsAgainst ?? 0),
    })
  );
}

export async function getPlannedMatchesByClubId(
  clubId: string
): Promise<PlannedMatch[]> {
  try {
    const { data, error } = await supabase
      .from("planned_matches")
      .select("*")
      .eq("club_id", clubId)
      .order("date", { ascending: true });

    if (error) {
      console.error("Nepodařilo se načíst plánované zápasy:", error);
      return [];
    }

    return (
      data?.map((row) => ({
        id: row.id as string,
        date: row.date as string,
        time: (row.time as string | null) ?? undefined,
        location: (row.location as string | null) ?? undefined,
        opponent: row.opponent as string,
        team: row.team as "A" | "B",
        homeTeam: row.home_team as string,
        awayTeam: row.away_team as string,
        status: (row.status as PlannedMatch["status"]) ?? "planned",
        current_period: (row.current_period as number | null) ?? 0,
        first_half_started_at:
          (row.first_half_started_at as string | null) ?? null,
        first_half_elapsed_seconds:
          (row.first_half_elapsed_seconds as number | null) ?? 0,
        second_half_started_at:
          (row.second_half_started_at as string | null) ?? null,
        second_half_elapsed_seconds:
          (row.second_half_elapsed_seconds as number | null) ?? 0,
        goalkeeper_player_id:
          (row.goalkeeper_player_id as string | null) ?? null,
      })) ?? []
    );
  } catch (error) {
    console.error("Chyba v getPlannedMatchesByClubId:", error);
    return [];
  }
}

export async function createPlannedMatch(input: {
  clubId: string;
  createdBy: string;
  match: PlannedMatch;
}): Promise<{ match: PlannedMatch | null; errorMessage?: string }> {
  try {
    const payload = {
      id: input.match.id,
      club_id: input.clubId,
      date: input.match.date,
      time: input.match.time ?? null,
      location: input.match.location ?? null,
      opponent: input.match.opponent,
      team: input.match.team,
      home_team: input.match.homeTeam,
      away_team: input.match.awayTeam,
      created_by: input.createdBy,
    };

    const { data, error } = await supabase
      .from("planned_matches")
      .insert([payload])
      .select()
      .single();

    if (error || !data) {
      console.error("Nepodařilo se vytvořit plánovaný zápas:", error);
      return {
        match: null,
        errorMessage: `Nepodařilo se uložit zápas: ${
          error?.message ?? "neznámá chyba"
        }`,
      };
    }

    return {
      match: {
        id: data.id as string,
        date: data.date as string,
        time: (data.time as string | null) ?? undefined,
        location: (data.location as string | null) ?? undefined,
        opponent: data.opponent as string,
        team: data.team as "A" | "B",
        homeTeam: data.home_team as string,
        awayTeam: data.away_team as string,
        status: (data.status as PlannedMatch["status"]) ?? "planned",
        current_period: (data.current_period as number | null) ?? 0,
        first_half_started_at:
          (data.first_half_started_at as string | null) ?? null,
        first_half_elapsed_seconds:
          (data.first_half_elapsed_seconds as number | null) ?? 0,
        second_half_started_at:
          (data.second_half_started_at as string | null) ?? null,
        second_half_elapsed_seconds:
          (data.second_half_elapsed_seconds as number | null) ?? 0,
        goalkeeper_player_id:
          (data.goalkeeper_player_id as string | null) ?? null,
      },
    };
  } catch (error) {
    console.error("Chyba v createPlannedMatch:", error);
    return {
      match: null,
      errorMessage: "Při ukládání zápasu nastala chyba.",
    };
  }
}

export async function deletePlannedMatch(matchId: string): Promise<{
  success: boolean;
  errorMessage?: string;
}> {
  try {
    const { error } = await supabase
      .from("planned_matches")
      .delete()
      .eq("id", matchId);

    if (error) {
      console.error("Nepodařilo se smazat plánovaný zápas:", error);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat plánovaný zápas: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Chyba v deletePlannedMatch:", error);
    return {
      success: false,
      errorMessage: "Při mazání plánovaného zápasu nastala chyba.",
    };
  }
}

export async function getFinishedMatchesByClubId(
  clubId: string
): Promise<FinishedMatch[]> {
  try {
    const { data: matches, error: matchesError } = await supabase
      .from("finished_matches")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });

    if (matchesError || !matches) {
      console.error("Nepodařilo se načíst odehrané zápasy:", matchesError);
      return [];
    }

    const ids = matches.map((match) => match.id);
    if (ids.length === 0) return [];

    const { data: statsRows, error: statsError } = await supabase
      .from("finished_match_player_stats")
      .select("*")
      .in("finished_match_id", ids);

    if (statsError) {
      console.error("Nepodařilo se načíst statistiky zápasů:", statsError);
      return [];
    }

    const { data: eventRows, error: eventsError } = await supabase
      .from("finished_match_events")
      .select("*")
      .in("finished_match_id", ids)
      .order("created_at", { ascending: true });

    if (eventsError) {
      console.error("Nepodařilo se načíst události zápasů:", eventsError);
      return [];
    }

    const { data: goalkeeperSegmentRows, error: goalkeeperSegmentsError } =
      await supabase
        .from("finished_match_goalkeeper_segments")
        .select("*")
        .in("finished_match_id", ids);

    if (goalkeeperSegmentsError) {
      console.error(
        "Nepodařilo se načíst úseky brankářů:",
        goalkeeperSegmentsError
      );
    }

    return matches.map((match) => {
      const playerStats =
        statsRows
          ?.filter((row) => row.finished_match_id === match.id)
          .map((row) => ({
            playerId: (row.player_id as string | null) ?? null,
            playerNumber: row.player_number as number,
            goals: row.goals as number,
            assists: row.assists as number,
            yellowCards: (row.yellow_cards as number | null) ?? 0,
            redCards: (row.red_cards as number | null) ?? 0,
            playedSeconds: (row.played_seconds as number | null) ?? 0,
            shotsOnTarget: (row.shots_on_target as number | null) ?? 0,
            shotsOffTarget: (row.shots_off_target as number | null) ?? 0,
          })) ?? [];

      const events: FinishedMatchEvent[] =
        eventRows
          ?.filter((row) => row.finished_match_id === match.id)
          .map((row) => {
            const period = (row.period as number | null) ?? null;
            const minute =
              (row.minute as number | null) ??
              (row.match_minute as number | null) ??
              null;

            if (row.type === "goal_for") {
              return {
                type: "goal_for",
                scorer: row.scorer as number,
                assist: row.assist as number | null,
                scorerPlayerId: (row.scorer_player_id as string | null) ?? null,
                assistPlayerId: (row.assist_player_id as string | null) ?? null,
                period,
                minute,
              } as FinishedMatchEvent;
            }

            if (row.type === "yellow_card") {
              return {
                type: "yellow_card",
                playerNumber: row.card_player_number as number,
                playerId: (row.card_player_id as string | null) ?? null,
                period,
                minute,
              } as FinishedMatchEvent;
            }

            if (row.type === "red_card") {
              return {
                type: "red_card",
                playerNumber: row.card_player_number as number,
                playerId: (row.card_player_id as string | null) ?? null,
                period,
                minute,
              } as FinishedMatchEvent;
            }

            return {
              type: "goal_against",
              period,
              minute,
            } as FinishedMatchEvent;
          }) ?? [];

      const goalkeeperSegments: GoalkeeperSegment[] =
        goalkeeperSegmentRows
          ?.filter((row) => row.finished_match_id === match.id)
          .map((row) => ({
            id: row.id as string,
            finishedMatchId: row.finished_match_id as string,
            playerId: (row.player_id as string | null) ?? null,
            playerNumber: (row.player_number as number | null) ?? null,
            period: (row.period as number | null) ?? null,
            startMinute: (row.start_minute as number | null) ?? 0,
            endMinute: (row.end_minute as number | null) ?? 0,
            goalsAgainst: (row.goals_against as number | null) ?? 0,
          })) ?? [];

      return {
        id: match.id as string,
        matchTitle: match.match_title as string,
        team: match.team as "A" | "B",
        date: match.date as string,
        time: (match.time as string | null) ?? undefined,
        location: (match.location as string | null) ?? undefined,
        score: match.score as string,
        goalkeeperNumber: (match.goalkeeper_number as number | null) ?? null,
        goalsAgainst: match.goals_against as number,
        playerStats,
        events,
        goalkeeperSegments,
        finished_at: (match.finished_at as string | null) ?? null,
      } as FinishedMatch;
    });
  } catch (error) {
    console.error("Chyba v getFinishedMatchesByClubId:", error);
    return [];
  }
}

export async function saveFinishedMatch(input: {
  clubId: string;
  createdBy: string;
  finishedMatch: FinishedMatch;
}): Promise<{ finishedMatch: FinishedMatch | null; errorMessage?: string }> {
  try {
    const { finishedMatch } = input;
    const normalizedMatchDate = normalizeDateToIso(finishedMatch.date);

    if (!normalizedMatchDate) {
      return {
        finishedMatch: null,
        errorMessage: "Datum zápasu není ve správném formátu.",
      };
    }

    const { error: matchError } = await supabase.from("finished_matches").insert([
      {
        id: finishedMatch.id,
        club_id: input.clubId,
        match_title: finishedMatch.matchTitle,
        team: finishedMatch.team,
        date: normalizedMatchDate,
        time: finishedMatch.time ?? null,
        location: finishedMatch.location ?? null,
        score: finishedMatch.score,
        goalkeeper_number: finishedMatch.goalkeeperNumber,
        goals_against: finishedMatch.goalsAgainst,
        created_by: input.createdBy,
        finished_at: finishedMatch.finished_at ?? new Date().toISOString(),
      },
    ]);

    if (matchError) {
      console.error("Nepodařilo se uložit odehraný zápas:", matchError);
      return {
        finishedMatch: null,
        errorMessage: `Nepodařilo se uložit odehraný zápas: ${matchError.message}`,
      };
    }

    if (finishedMatch.playerStats.length > 0) {
      const { error: statsError } = await supabase
        .from("finished_match_player_stats")
        .insert(
          finishedMatch.playerStats.map((rawStat) => {
            const stat = rawStat as FinishedMatchPlayerStatWithId;

            return {
              finished_match_id: finishedMatch.id,
              player_id: getStatPlayerId(stat),
              player_number: stat.playerNumber,
              goals: stat.goals,
              assists: stat.assists,
              yellow_cards: stat.yellowCards ?? 0,
              red_cards: stat.redCards ?? 0,
              played_seconds: stat.playedSeconds ?? 0,
              shots_on_target: stat.shotsOnTarget ?? 0,
              shots_off_target: stat.shotsOffTarget ?? 0,
            };
          })
        );

      if (statsError) {
        console.error("Nepodařilo se uložit statistiky hráčů:", statsError);
        return {
          finishedMatch: null,
          errorMessage: `Nepodařilo se uložit statistiky hráčů: ${statsError.message}`,
        };
      }
    }

    if (finishedMatch.events.length > 0) {
      const { error: eventsError } = await supabase
        .from("finished_match_events")
        .insert(
          (finishedMatch.events as FinishedMatchEventWithIds[]).map((event) => ({
            finished_match_id: finishedMatch.id,
            type: event.type,
            period: getEventPeriod(event),
            minute: getEventMinute(event),
            scorer: event.type === "goal_for" ? event.scorer : null,
            assist: event.type === "goal_for" ? event.assist : null,
            scorer_player_id:
              event.type === "goal_for" ? getGoalScorerPlayerId(event) : null,
            assist_player_id:
              event.type === "goal_for" ? getGoalAssistPlayerId(event) : null,
            card_player_number:
              event.type === "yellow_card" || event.type === "red_card"
                ? event.playerNumber
                : null,
            card_player_id:
              event.type === "yellow_card" || event.type === "red_card"
                ? getCardPlayerId(event)
                : null,
          }))
        );

      if (eventsError) {
        console.error("Nepodařilo se uložit události zápasu:", eventsError);
        return {
          finishedMatch: null,
          errorMessage: `Nepodařilo se uložit události zápasu: ${eventsError.message}`,
        };
      }
    }

    const goalkeeperSegments = getGoalkeeperSegments(finishedMatch);

    if (goalkeeperSegments.length > 0) {
      const { error: goalkeeperSegmentsError } = await supabase
        .from("finished_match_goalkeeper_segments")
        .insert(
          goalkeeperSegments.map((segment) => ({
            finished_match_id: finishedMatch.id,
            player_id: segment.playerId,
            player_number: segment.playerNumber,
            period: segment.period ?? null,
            start_minute: segment.startMinute,
            end_minute: segment.endMinute,
            goals_against: segment.goalsAgainst ?? 0,
          }))
        );

      if (goalkeeperSegmentsError) {
        console.error(
          "Nepodařilo se uložit brankářské úseky:",
          goalkeeperSegmentsError
        );
      }
    }

    const cardEvents = finishedMatch.events.filter(
      (event) => event.type === "yellow_card" || event.type === "red_card"
    );

    if (cardEvents.length > 0) {
      const [{ data: periodsData, error: periodsError }, templates, playersResponse] =
        await Promise.all([
          supabase.from("periods").select("*").eq("club_id", input.clubId),
          getFineTemplatesByClubId(input.clubId),
          supabase.from("players").select("id, number").eq("club_id", input.clubId),
        ]);

      if (periodsError) {
        console.error("Nepodařilo se načíst období pro pokuty za karty:", periodsError);
      } else {
        const matchedPeriod =
          ((periodsData ?? []) as Array<{
            id: string;
            start_date: string;
            end_date: string;
            is_active?: boolean;
          }>).find((period) => {
            const start = normalizeDateToIso(period.start_date);
            const end = normalizeDateToIso(period.end_date);
            if (!start || !end) return false;
            return normalizedMatchDate >= start && normalizedMatchDate <= end;
          }) ?? null;

        const playersRows = playersResponse.data ?? [];

        const yellowTemplate =
          templates.find(
            (item) => item.is_active && isYellowCardTemplate(item.name)
          ) ?? null;

        const redTemplate =
          templates.find(
            (item) => item.is_active && isRedCardTemplate(item.name)
          ) ?? null;

        if (matchedPeriod) {
          const fineRows: {
            club_id: string;
            period_id: string;
            player_id: string;
            amount: number;
            reason: string;
            note: string | null;
            fine_date: string;
            is_paid: boolean;
            created_by: string;
          }[] = [];

          for (const rawEvent of cardEvents) {
            const event = rawEvent as FinishedMatchEventWithIds;
            const playerIdFromEvent = getCardPlayerId(event);

            const fallbackPlayerNumber =
  "playerNumber" in event ? event.playerNumber : null;

const playerRow =
  (playerIdFromEvent
    ? playersRows.find(
        (player) => String(player.id) === playerIdFromEvent
      )
    : null) ??
  playersRows.find(
    (player) =>
      Number(player.number) === Number(fallbackPlayerNumber)
  ) ??
  null;

            if (!playerRow) continue;

            if (event.type === "yellow_card" && yellowTemplate) {
              fineRows.push({
                club_id: input.clubId,
                period_id: matchedPeriod.id,
                player_id: String(playerRow.id),
                amount: Number(yellowTemplate.default_amount),
                reason: yellowTemplate.name,
                note: `match:${finishedMatch.id}:yellow_card:${playerRow.id}`,
                fine_date: normalizedMatchDate,
                is_paid: false,
                created_by: input.createdBy,
              });
            }

            if (event.type === "red_card" && redTemplate) {
              fineRows.push({
                club_id: input.clubId,
                period_id: matchedPeriod.id,
                player_id: String(playerRow.id),
                amount: Number(redTemplate.default_amount),
                reason: redTemplate.name,
                note: `match:${finishedMatch.id}:red_card:${playerRow.id}`,
                fine_date: normalizedMatchDate,
                is_paid: false,
                created_by: input.createdBy,
              });
            }
          }

          if (fineRows.length > 0) {
            const { error: finesError } = await supabase
              .from("fines")
              .insert(fineRows);

            if (finesError) {
              console.error("Nepodařilo se vytvořit pokuty za karty:", finesError);
            }
          }
        }
      }
    }

    const { error: deletePlannedError } = await supabase
      .from("planned_matches")
      .delete()
      .eq("id", finishedMatch.id);

    if (deletePlannedError) {
      console.error("Nepodařilo se smazat plánovaný zápas:", deletePlannedError);
    }

    return {
      finishedMatch: {
        ...finishedMatch,
        date: normalizedMatchDate,
      },
    };
  } catch (error) {
    console.error("Chyba v saveFinishedMatch:", error);
    return {
      finishedMatch: null,
      errorMessage: "Při ukládání odehraného zápasu nastala chyba.",
    };
  }
}

export async function removePlayerFromFinishedMatch(input: {
  finishedMatchId: string;
  playerNumber: number;
  playerId?: string | null;
  goalkeeperNumber: number | null;
  events: FinishedMatchEvent[];
  playerStats: FinishedMatch["playerStats"];
}): Promise<{
  success: boolean;
  errorMessage?: string;
}> {
  try {
    if (input.goalkeeperNumber === input.playerNumber) {
      return {
        success: false,
        errorMessage: "Brankáře zápasu nelze odebrat.",
      };
    }

    const stat = input.playerStats.find((item) => {
      const itemWithId = item as FinishedMatchPlayerStatWithId;
      const itemPlayerId = getStatPlayerId(itemWithId);

      return input.playerId
        ? itemPlayerId === input.playerId
        : item.playerNumber === input.playerNumber;
    });

    if (!stat) {
      return {
        success: false,
        errorMessage: "Hráč v tomto zápase není zapsaný.",
      };
    }

    const statWithId = stat as FinishedMatchPlayerStatWithId;
    const statPlayerId = getStatPlayerId(statWithId);

    const hasStats =
      stat.goals > 0 ||
      stat.assists > 0 ||
      (stat.yellowCards ?? 0) > 0 ||
      (stat.redCards ?? 0) > 0;

    const hasEvent = input.events.some((rawEvent) => {
      const event = rawEvent as FinishedMatchEventWithIds;

      if (event.type === "goal_for") {
        if (input.playerId || statPlayerId) {
          const playerIdToCheck = input.playerId ?? statPlayerId;

          return (
            getGoalScorerPlayerId(event) === playerIdToCheck ||
            getGoalAssistPlayerId(event) === playerIdToCheck
          );
        }

        return (
          event.scorer === input.playerNumber ||
          event.assist === input.playerNumber
        );
      }

      if (event.type === "yellow_card" || event.type === "red_card") {
        if (input.playerId || statPlayerId) {
          const playerIdToCheck = input.playerId ?? statPlayerId;
          return getCardPlayerId(event) === playerIdToCheck;
        }

        return event.playerNumber === input.playerNumber;
      }

      return false;
    });

    if (hasStats || hasEvent) {
      return {
        success: false,
        errorMessage: "Hráče se statistikou nebo událostí nelze odebrat.",
      };
    }

    const { data: goalkeeperSegments, error: goalkeeperSegmentsError } =
      await supabase
        .from("finished_match_goalkeeper_segments")
        .select("id")
        .eq("finished_match_id", input.finishedMatchId)
        .or(
          input.playerId
            ? `player_id.eq.${input.playerId},player_number.eq.${input.playerNumber}`
            : `player_number.eq.${input.playerNumber}`
        );

    if (goalkeeperSegmentsError) {
      console.error(
        "Nepodařilo se ověřit brankářské úseky hráče:",
        goalkeeperSegmentsError
      );
    }

    if ((goalkeeperSegments ?? []).length > 0) {
      return {
        success: false,
        errorMessage: "Hráče nelze odebrat, protože má brankářský úsek.",
      };
    }

    let ratingsQuery = supabase
      .from("match_player_ratings")
      .delete()
      .eq("finished_match_id", input.finishedMatchId);

    ratingsQuery = input.playerId
      ? ratingsQuery.eq("player_id", input.playerId)
      : ratingsQuery.eq("player_number", input.playerNumber);

    const { error: ratingsError } = await ratingsQuery;

    if (ratingsError) {
      console.error("Nepodařilo se smazat hodnocení hráče:", ratingsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat hodnocení hráče: ${ratingsError.message}`,
      };
    }

    let statsQuery = supabase
      .from("finished_match_player_stats")
      .delete()
      .eq("finished_match_id", input.finishedMatchId);

    statsQuery = input.playerId
      ? statsQuery.eq("player_id", input.playerId)
      : statsQuery.eq("player_number", input.playerNumber);

    const { error: statsError } = await statsQuery;

    if (statsError) {
      console.error("Nepodařilo se odebrat hráče ze zápasu:", statsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se odebrat hráče ze zápasu: ${statsError.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Chyba v removePlayerFromFinishedMatch:", error);
    return {
      success: false,
      errorMessage: "Při odebírání hráče ze zápasu nastala chyba.",
    };
  }
}

export async function deleteFinishedMatch(matchId: string): Promise<{
  success: boolean;
  errorMessage?: string;
}> {
  try {
    const { error: goalkeeperSegmentsError } = await supabase
      .from("finished_match_goalkeeper_segments")
      .delete()
      .eq("finished_match_id", matchId);

    if (goalkeeperSegmentsError) {
      console.error(
        "Nepodařilo se smazat brankářské úseky:",
        goalkeeperSegmentsError
      );
    }

    const { error: ratingsError } = await supabase
      .from("match_player_ratings")
      .delete()
      .eq("finished_match_id", matchId);

    if (ratingsError) {
      console.error("Nepodařilo se smazat hodnocení zápasu:", ratingsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat hodnocení zápasu: ${ratingsError.message}`,
      };
    }

    const { error: statsError } = await supabase
      .from("finished_match_player_stats")
      .delete()
      .eq("finished_match_id", matchId);

    if (statsError) {
      console.error("Nepodařilo se smazat statistiky hráčů:", statsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat statistiky hráčů: ${statsError.message}`,
      };
    }

    const { error: eventsError } = await supabase
      .from("finished_match_events")
      .delete()
      .eq("finished_match_id", matchId);

    if (eventsError) {
      console.error("Nepodařilo se smazat události zápasu:", eventsError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat události zápasu: ${eventsError.message}`,
      };
    }

    const { error: finesError } = await supabase
      .from("fines")
      .delete()
      .like("note", `match:${matchId}:%`);

    if (finesError) {
      console.error("Nepodařilo se smazat pokuty za karty:", finesError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat pokuty za karty: ${finesError.message}`,
      };
    }

    const { error: matchError } = await supabase
      .from("finished_matches")
      .delete()
      .eq("id", matchId);

    if (matchError) {
      console.error("Nepodařilo se smazat odehraný zápas:", matchError);
      return {
        success: false,
        errorMessage: `Nepodařilo se smazat odehraný zápas: ${matchError.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Chyba v deleteFinishedMatch:", error);
    return {
      success: false,
      errorMessage: "Při mazání odehraného zápasu nastala chyba.",
    };
  }
}

export function getRatingColor(
  value: number,
  isBest: boolean
): MatchRatingColor {
  if (isBest) return "blue";
  if (value <= 6.0) return "red";
  if (value <= 6.9) return "orange";
  if (value <= 7.9) return "light_green";
  return "dark_green";
}