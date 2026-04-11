"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/styles/appStyles";

type Poll = {
  id: string;
  club_id: string;
  question: string;
  description?: string | null;
  allow_multiple: boolean;
  poll_date?: string | null;
  created_at: string;
  is_closed: boolean;
};

type PollOption = {
  id: string;
  poll_id: string;
  text: string;
};

type PollVote = {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
};

type Player = {
  id: string;
  club_id: string;
  name: string;
  number: number;
  position: string;
  profile_id?: string | null;
};

type PeriodRow = {
  id: string;
  club_id: string;
  name: string;
  type: "year" | "season";
  start_date: string;
  end_date: string;
  is_active: boolean;
};

type FineTemplateRow = {
  id: string;
  club_id: string;
  name: string;
  default_amount: number;
  is_active: boolean;
};

type Props = {
  clubId: string;
  userId: string;
  primaryColor?: string;
};

type OptionColorSet = {
  background: string;
  border: string;
  text: string;
  strongBackground: string;
};

const OPTION_COLORS: OptionColorSet[] = [
  {
    background: "rgba(46, 204, 113, 0.12)",
    border: "1px solid rgba(46, 204, 113, 0.22)",
    text: "#9af0b6",
    strongBackground: "rgba(46, 204, 113, 0.92)",
  },
  {
    background: "rgba(52, 152, 219, 0.12)",
    border: "1px solid rgba(52, 152, 219, 0.22)",
    text: "#9fd3ff",
    strongBackground: "rgba(52, 152, 219, 0.92)",
  },
  {
    background: "rgba(231, 76, 60, 0.12)",
    border: "1px solid rgba(231, 76, 60, 0.22)",
    text: "#ffb0a8",
    strongBackground: "rgba(231, 76, 60, 0.92)",
  },
  {
    background: "rgba(155, 89, 182, 0.12)",
    border: "1px solid rgba(155, 89, 182, 0.22)",
    text: "#ddb7ff",
    strongBackground: "rgba(155, 89, 182, 0.92)",
  },
  {
    background: "rgba(241, 196, 15, 0.12)",
    border: "1px solid rgba(241, 196, 15, 0.22)",
    text: "#ffd86b",
    strongBackground: "rgba(241, 196, 15, 0.92)",
  },
  {
    background: "rgba(26, 188, 156, 0.12)",
    border: "1px solid rgba(26, 188, 156, 0.22)",
    text: "#8ef1df",
    strongBackground: "rgba(26, 188, 156, 0.92)",
  },
];

function getOptionColors(index: number): OptionColorSet {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

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

function isDateInsidePeriod(dateValue: string, period: PeriodRow | null) {
  if (!period) return false;

  const normalizedDate = normalizeDateToIso(dateValue);
  const normalizedStart = normalizeDateToIso(period.start_date);
  const normalizedEnd = normalizeDateToIso(period.end_date);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) {
    return false;
  }

  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
}

export default function PollsScreen({
  clubId,
  userId,
  primaryColor = "#22c55e",
}: Props) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [expandedPollId, setExpandedPollId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [pollDate, setPollDate] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);
  const [closingPollId, setClosingPollId] = useState<string | null>(null);
  const [savingFinePollId, setSavingFinePollId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);

    const [
      { data: pollsData, error: pollsError },
      { data: optionsData, error: optionsError },
      { data: votesData, error: votesError },
      { data: playersData, error: playersError },
    ] = await Promise.all([
      supabase
        .from("polls")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false }),
      supabase.from("poll_options").select("*"),
      supabase.from("poll_votes").select("*"),
      supabase
        .from("players")
        .select("*")
        .eq("club_id", clubId)
        .order("number", { ascending: true }),
    ]);

    if (pollsError) {
      console.error("Nepodařilo se načíst ankety:", pollsError);
    }

    if (optionsError) {
      console.error("Nepodařilo se načíst možnosti anket:", optionsError);
    }

    if (votesError) {
      console.error("Nepodařilo se načíst hlasy anket:", votesError);
    }

    if (playersError) {
      console.error("Nepodařilo se načíst hráče pro ankety:", playersError);
    }

    setPolls((pollsData as Poll[]) ?? []);
    setOptions((optionsData as PollOption[]) ?? []);
    setVotes((votesData as PollVote[]) ?? []);
    setPlayers((playersData as Player[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [clubId]);

  const resetForm = () => {
    setEditingPollId(null);
    setQuestion("");
    setDescription("");
    setAllowMultiple(false);
    setPollDate("");
    setNewOptions(["", ""]);
    setMessage("");
  };

  const handleOpenCreate = () => {
    if (showForm && !editingPollId) {
      setShowForm(false);
      resetForm();
      return;
    }

    resetForm();
    setShowForm(true);
  };

  const handleEditPoll = (poll: Poll) => {
    const pollOptions = options
      .filter((option) => option.poll_id === poll.id)
      .map((option) => option.text);

    setEditingPollId(poll.id);
    setQuestion(poll.question);
    setDescription(poll.description ?? "");
    setAllowMultiple(poll.allow_multiple);
    setPollDate(poll.poll_date ?? "");
    setNewOptions(pollOptions.length > 0 ? pollOptions : ["", ""]);
    setShowForm(true);
    setMessage("");
  };

  const handleCreateOrUpdatePoll = async () => {
    if (!question.trim()) {
      setMessage("Zadej název ankety.");
      return;
    }

    const validOptions = newOptions
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (validOptions.length < 2) {
      setMessage("Anketa musí mít alespoň 2 možnosti.");
      return;
    }

    if (saving) return;

    setSaving(true);
    setMessage("");

    if (editingPollId) {
      const { error: updatePollError } = await supabase
        .from("polls")
        .update({
          question: question.trim(),
          description: description.trim() || null,
          allow_multiple: allowMultiple,
          poll_date: pollDate || null,
        })
        .eq("id", editingPollId);

      if (updatePollError) {
        console.error("Nepodařilo se upravit anketu:", updatePollError);
        setMessage("Nepodařilo se upravit anketu.");
        setSaving(false);
        return;
      }

      const { error: deleteVotesError } = await supabase
        .from("poll_votes")
        .delete()
        .eq("poll_id", editingPollId);

      if (deleteVotesError) {
        console.error("Nepodařilo se smazat staré hlasy ankety:", deleteVotesError);
        setMessage("Nepodařilo se upravit anketu.");
        setSaving(false);
        return;
      }

      const { error: deleteOptionsError } = await supabase
        .from("poll_options")
        .delete()
        .eq("poll_id", editingPollId);

      if (deleteOptionsError) {
        console.error("Nepodařilo se smazat staré možnosti ankety:", deleteOptionsError);
        setMessage("Nepodařilo se upravit anketu.");
        setSaving(false);
        return;
      }

      const { error: insertOptionsError } = await supabase
        .from("poll_options")
        .insert(
          validOptions.map((text) => ({
            poll_id: editingPollId,
            text,
          }))
        );

      if (insertOptionsError) {
        console.error("Nepodařilo se uložit nové možnosti ankety:", insertOptionsError);
        setMessage("Nepodařilo se upravit anketu.");
        setSaving(false);
        return;
      }

      resetForm();
      setShowForm(false);
      await loadData();
      setMessage("Anketa byla upravena.");
      setSaving(false);
      return;
    }

    const { data: createdPoll, error: createPollError } = await supabase
      .from("polls")
      .insert({
        club_id: clubId,
        question: question.trim(),
        description: description.trim() || null,
        allow_multiple: allowMultiple,
        poll_date: pollDate || null,
        is_closed: false,
      })
      .select("*")
      .single();

    if (createPollError || !createdPoll) {
      console.error("Nepodařilo se vytvořit anketu:", createPollError);
      setMessage("Nepodařilo se vytvořit anketu.");
      setSaving(false);
      return;
    }

    const { error: createOptionsError } = await supabase
      .from("poll_options")
      .insert(
        validOptions.map((text) => ({
          poll_id: createdPoll.id,
          text,
        }))
      );

    if (createOptionsError) {
      console.error("Nepodařilo se uložit možnosti ankety:", createOptionsError);
      setMessage("Nepodařilo se uložit možnosti ankety.");
      setSaving(false);
      return;
    }

    resetForm();
    setShowForm(false);
    await loadData();
    setMessage("Anketa byla vytvořena.");
    setSaving(false);
  };

  const handleDeletePoll = async (pollId: string) => {
    const confirmed = window.confirm("Opravdu chceš smazat tuto anketu?");
    if (!confirmed) return;

    setMessage("");

    const { error: deleteVotesError } = await supabase
      .from("poll_votes")
      .delete()
      .eq("poll_id", pollId);

    if (deleteVotesError) {
      console.error("Nepodařilo se smazat hlasy ankety:", deleteVotesError);
      setMessage("Nepodařilo se smazat anketu.");
      return;
    }

    const { error: deleteOptionsError } = await supabase
      .from("poll_options")
      .delete()
      .eq("poll_id", pollId);

    if (deleteOptionsError) {
      console.error("Nepodařilo se smazat možnosti ankety:", deleteOptionsError);
      setMessage("Nepodařilo se smazat anketu.");
      return;
    }

    const { error: deletePollError } = await supabase
      .from("polls")
      .delete()
      .eq("id", pollId);

    if (deletePollError) {
      console.error("Nepodařilo se smazat anketu:", deletePollError);
      setMessage("Nepodařilo se smazat anketu.");
      return;
    }

    if (editingPollId === pollId) {
      resetForm();
      setShowForm(false);
    }

    if (expandedPollId === pollId) {
      setExpandedPollId(null);
    }

    await loadData();
    setMessage("Anketa byla smazána.");
  };

  const handleClosePoll = async (poll: Poll) => {
    if (poll.is_closed) return;

    const confirmed = window.confirm(`Opravdu chceš uzavřít anketu "${poll.question}"?`);
    if (!confirmed) return;

    setClosingPollId(poll.id);
    setMessage("");

    const { error } = await supabase
      .from("polls")
      .update({ is_closed: true })
      .eq("id", poll.id);

    if (error) {
      console.error("Nepodařilo se uzavřít anketu:", error);
      setMessage("Nepodařilo se uzavřít anketu.");
      setClosingPollId(null);
      return;
    }

    await loadData();
    setMessage("Anketa byla uzavřena.");
    setClosingPollId(null);
  };

  const handleVote = async (
    pollId: string,
    optionId: string,
    multiple: boolean,
    isClosed: boolean
  ) => {
    if (isClosed) {
      setMessage("Tato anketa je uzavřená.");
      return;
    }

    setMessage("");

    if (!multiple) {
      const { error: deleteError } = await supabase
        .from("poll_votes")
        .delete()
        .eq("poll_id", pollId)
        .eq("user_id", userId);

      if (deleteError) {
        console.error("Nepodařilo se upravit hlas:", deleteError);
        setMessage("Nepodařilo se uložit hlas.");
        return;
      }

      const { error: insertError } = await supabase.from("poll_votes").insert({
        poll_id: pollId,
        option_id: optionId,
        user_id: userId,
      });

      if (insertError) {
        console.error("Nepodařilo se uložit hlas:", insertError);
        setMessage("Nepodařilo se uložit hlas.");
        return;
      }

      await loadData();
      return;
    }

    const alreadyVoted = votes.some(
      (vote) =>
        vote.poll_id === pollId &&
        vote.option_id === optionId &&
        vote.user_id === userId
    );

    if (alreadyVoted) {
      const { error: deleteError } = await supabase
        .from("poll_votes")
        .delete()
        .eq("poll_id", pollId)
        .eq("option_id", optionId)
        .eq("user_id", userId);

      if (deleteError) {
        console.error("Nepodařilo se odebrat hlas:", deleteError);
        setMessage("Nepodařilo se odebrat hlas.");
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("poll_votes").insert({
        poll_id: pollId,
        option_id: optionId,
        user_id: userId,
      });

      if (insertError) {
        console.error("Nepodařilo se uložit hlas:", insertError);
        setMessage("Nepodařilo se uložit hlas.");
        return;
      }
    }

    await loadData();
  };

  const handleCreateNoVoteFines = async (poll: Poll, notVotedPlayers: Player[]) => {
    if (notVotedPlayers.length === 0) {
      setMessage("Nikdo není v seznamu NEHLASOVALO.");
      return;
    }

    const normalizedPollDate = normalizeDateToIso(
      poll.poll_date || poll.created_at
    );

    if (!normalizedPollDate) {
      setMessage("Anketa nemá platné datum.");
      return;
    }

    setSavingFinePollId(poll.id);
    setMessage("");

    const [{ data: periodsData, error: periodsError }, { data: templatesData, error: templatesError }] =
      await Promise.all([
        supabase.from("periods").select("*").eq("club_id", clubId),
        supabase.from("fine_templates").select("*").eq("club_id", clubId),
      ]);

    if (periodsError) {
      console.error("Nepodařilo se načíst období:", periodsError);
      setMessage("Nepodařilo se načíst období.");
      setSavingFinePollId(null);
      return;
    }

    if (templatesError) {
      console.error("Nepodařilo se načíst předvolby pokut:", templatesError);
      setMessage("Nepodařilo se načíst předvolby pokut.");
      setSavingFinePollId(null);
      return;
    }

    const periods = (periodsData as PeriodRow[]) ?? [];
    const fineTemplates = (templatesData as FineTemplateRow[]) ?? [];

    const matchedPeriod =
      periods.find((period) => isDateInsidePeriod(normalizedPollDate, period)) ??
      null;

    if (!matchedPeriod) {
      setMessage("Pro datum ankety nebylo nalezeno žádné období.");
      setSavingFinePollId(null);
      return;
    }

    const anketyTemplate =
      fineTemplates.find(
        (item) => item.name.trim().toLowerCase() === "ankety" && item.is_active
      ) ?? null;

    if (!anketyTemplate) {
      setMessage('Chybí aktivní týmová pokuta s názvem "Ankety".');
      setSavingFinePollId(null);
      return;
    }

    let createdCount = 0;

    for (const player of notVotedPlayers) {
      const { data: existingFine, error: existingFineError } = await supabase
        .from("fines")
        .select("id")
        .eq("period_id", matchedPeriod.id)
        .eq("player_id", player.id)
        .eq("note", `poll:${poll.id}`)
        .maybeSingle();

      if (existingFineError) {
        console.error("Nepodařilo se ověřit existující pokutu:", existingFineError);
        continue;
      }

      if (existingFine) {
        continue;
      }

      const { error: createFineError } = await supabase.from("fines").insert({
        club_id: clubId,
        period_id: matchedPeriod.id,
        player_id: player.id,
        amount: Number(anketyTemplate.default_amount),
        reason: anketyTemplate.name,
        note: `poll:${poll.id}`,
        fine_date: normalizedPollDate,
        created_by: userId,
        is_paid: false,
      });

      if (createFineError) {
        console.error("Nepodařilo se vytvořit pokutu za anketu:", createFineError);
        continue;
      }

      createdCount += 1;
    }

    if (createdCount === 0) {
      setMessage("Žádné nové pokuty nevznikly. Možná už byly přidělené dřív.");
      setSavingFinePollId(null);
      return;
    }

    setMessage(`Bylo přidáno ${createdCount} pokut za nehlasování v anketě.`);
    setSavingFinePollId(null);
  };

  const getOptionsByPollId = (pollId: string) =>
    options.filter((option) => option.poll_id === pollId);

  const getVotesCount = (optionId: string) =>
    votes.filter((vote) => vote.option_id === optionId).length;

  const hasVoted = (pollId: string, optionId: string) =>
    votes.some(
      (vote) =>
        vote.poll_id === pollId &&
        vote.option_id === optionId &&
        vote.user_id === userId
    );

  const getPlayerNameByUserId = (voteUserId: string) => {
    return (
      players.find((player) => player.profile_id === voteUserId)?.name ??
      "Neznámý hráč"
    );
  };

  const totalVotesByPollId = useMemo(() => {
    const map = new Map<string, number>();

    votes.forEach((vote) => {
      map.set(vote.poll_id, (map.get(vote.poll_id) ?? 0) + 1);
    });

    return map;
  }, [votes]);

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <button
        onClick={handleOpenCreate}
        style={{
          ...styles.primaryButton,
          marginTop: 0,
          background: primaryColor,
          border: "none",
        }}
      >
        {showForm
          ? editingPollId
            ? "Zavřít úpravu"
            : "Zavřít"
          : "Vytvořit anketu"}
      </button>

      {showForm && (
        <div style={styles.card}>
          <h2 style={{ ...styles.screenTitle, marginTop: 0 }}>
            {editingPollId ? "Upravit anketu" : "Nová anketa"}
          </h2>

          <div style={{ display: "grid", gap: "10px" }}>
            <input
              placeholder="Název ankety"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              style={styles.input}
            />

            <textarea
              placeholder="Popis (nepovinné)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                ...styles.input,
                minHeight: "90px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />

            <input
              type="date"
              value={pollDate}
              onChange={(e) => setPollDate(e.target.value)}
              style={styles.input}
            />

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#d9d9d9",
                fontSize: "14px",
              }}
            >
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={() => setAllowMultiple((prev) => !prev)}
              />
              Povolit více odpovědí
            </label>

            <div
              style={{
                color: "#cfcfcf",
                fontSize: "13px",
                fontWeight: "bold",
                marginTop: "4px",
              }}
            >
              Možnosti ankety
            </div>

            {newOptions.map((option, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  value={option}
                  placeholder={`Možnost ${index + 1}`}
                  onChange={(e) => {
                    const copy = [...newOptions];
                    copy[index] = e.target.value;
                    setNewOptions(copy);
                  }}
                  style={{
                    ...styles.input,
                    marginTop: 0,
                    flex: 1,
                  }}
                />

                {newOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewOptions((prev) =>
                        prev.filter((_, optionIndex) => optionIndex !== index)
                      );
                    }}
                    style={{
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      background: "rgba(198,40,40,0.95)",
                      color: "white",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    X
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setNewOptions((prev) => [...prev, ""])}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: "rgba(255,255,255,0.12)",
                border: "none",
              }}
            >
              + Přidat možnost
            </button>

            <button
              type="button"
              onClick={() => void handleCreateOrUpdatePoll()}
              disabled={saving}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: primaryColor,
                border: "none",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? "Ukládám..."
                : editingPollId
                ? "Uložit změny"
                : "Uložit anketu"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          style={{
            ...styles.card,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div style={styles.card}>
          <div style={{ color: "#b8b8b8" }}>Načítám ankety...</div>
        </div>
      ) : polls.length === 0 ? (
        <div style={styles.card}>
          <div style={{ color: "#b8b8b8" }}>Zatím tu není žádná anketa.</div>
        </div>
      ) : (
        polls.map((poll) => {
          const pollOptions = getOptionsByPollId(poll.id);
          const isExpanded = expandedPollId === poll.id;
          const isClosed = poll.is_closed === true;
          const votedUserIds = new Set(
            votes
              .filter((vote) => vote.poll_id === poll.id)
              .map((vote) => vote.user_id)
          );

          const notVotedPlayers = players
            .filter(
              (player) =>
                player.profile_id && !votedUserIds.has(player.profile_id)
            )
            .sort((a, b) => a.name.localeCompare(b.name, "cs"));

          return (
            <div key={poll.id} style={styles.card}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                    {poll.question}
                  </div>

                  {poll.description && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#b8b8b8",
                        marginTop: "8px",
                        lineHeight: 1.5,
                      }}
                    >
                      {poll.description}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: "10px",
                      color: "#a8a8a8",
                      fontSize: "12px",
                    }}
                  >
                    {poll.allow_multiple ? "Více odpovědí" : "Jedna odpověď"}
                    {poll.poll_date ? ` • Datum: ${poll.poll_date}` : ""}
                    {isClosed ? " • UZAVŘENÁ" : ""}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedPollId((prev) => (prev === poll.id ? null : poll.id))
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#b8b8b8",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    padding: 0,
                  }}
                >
                  {isExpanded ? "Skrýt" : "Detail"}
                </button>
              </div>

              <div style={{ marginTop: "14px", display: "grid", gap: "8px" }}>
                {pollOptions.map((option, index) => {
                  const selected = hasVoted(poll.id, option.id);
                  const votesCount = getVotesCount(option.id);
                  const colors = getOptionColors(index);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        void handleVote(
                          poll.id,
                          option.id,
                          poll.allow_multiple,
                          isClosed
                        )
                      }
                      disabled={isClosed}
                      style={{
                        padding: "16px 16px",
                        borderRadius: "14px",
                        border: selected ? "1px solid transparent" : colors.border,
                        background: selected ? colors.strongBackground : colors.background,
                        color: "white",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        fontSize: "15px",
                        fontWeight: "bold",
                        cursor: isClosed ? "default" : "pointer",
                        textAlign: "left",
                        opacity: isClosed ? 0.7 : 1,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          lineHeight: 1.35,
                          color: selected ? "white" : colors.text,
                        }}
                      >
                        {option.text}
                      </span>

                      <span
                        style={{
                          minWidth: "24px",
                          textAlign: "right",
                          color: "white",
                          fontWeight: "bold",
                          fontSize: "16px",
                        }}
                      >
                        {votesCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#c7c7c7",
                }}
              >
                Celkem hlasů: {totalVotesByPollId.get(poll.id) ?? 0}
              </div>

              <div
                style={{
                  marginTop: "12px",
                  display: "inline-flex",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  background: "rgba(241, 196, 15, 0.16)",
                  border: "1px solid rgba(241, 196, 15, 0.24)",
                  color: "#ffd86b",
                  fontSize: "13px",
                  fontWeight: "bold",
                }}
              >
                NEHLASOVALO: {notVotedPlayers.length}
              </div>

              {isExpanded && (
                <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
                  {pollOptions.map((option, index) => {
                    const optionVotes = votes
                      .filter((vote) => vote.option_id === option.id)
                      .sort((a, b) =>
                        getPlayerNameByUserId(a.user_id).localeCompare(
                          getPlayerNameByUserId(b.user_id),
                          "cs"
                        )
                      );

                    const colors = getOptionColors(index);

                    return (
                      <div
                        key={`${poll.id}-detail-${option.id}`}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "14px",
                          background: colors.background,
                          border: colors.border,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "bold",
                            color: colors.text,
                            marginBottom: "10px",
                            fontSize: "17px",
                            lineHeight: 1.35,
                          }}
                        >
                          {option.text} ({optionVotes.length})
                        </div>

                        {optionVotes.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                            Zatím nikdo.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "6px" }}>
                            {optionVotes.map((vote) => (
                              <div
                                key={`${poll.id}-${option.id}-${vote.user_id}`}
                                style={{ fontSize: "14px", color: "white" }}
                              >
                                {getPlayerNameByUserId(vote.user_id)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      background: "rgba(241, 196, 15, 0.10)",
                      border: "1px solid rgba(241, 196, 15, 0.20)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        color: "#ffd86b",
                        marginBottom: "10px",
                        fontSize: "17px",
                        lineHeight: 1.35,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <span>NEHLASOVALO ({notVotedPlayers.length})</span>

                      {notVotedPlayers.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleCreateNoVoteFines(poll, notVotedPlayers)
                          }
                          disabled={savingFinePollId === poll.id}
                          style={{
                            border: "none",
                            borderRadius: "10px",
                            padding: "8px 10px",
                            background: "rgba(241, 196, 15, 0.95)",
                            color: "#111111",
                            fontWeight: "bold",
                            cursor:
                              savingFinePollId === poll.id ? "default" : "pointer",
                            opacity: savingFinePollId === poll.id ? 0.7 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {savingFinePollId === poll.id ? "Ukládám..." : "POKUTA"}
                        </button>
                      )}
                    </div>

                    {notVotedPlayers.length === 0 ? (
                      <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                        Všichni hlasovali.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "6px" }}>
                        {notVotedPlayers.map((player) => (
                          <div
                            key={`${poll.id}-not-voted-${player.id}`}
                            style={{ fontSize: "14px", color: "white" }}
                          >
                            {player.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    {!isClosed && (
                      <button
                        type="button"
                        onClick={() => void handleClosePoll(poll)}
                        disabled={closingPollId === poll.id}
                        style={{
                          flex: 1,
                          border: "none",
                          borderRadius: "12px",
                          padding: "12px 14px",
                          background: "rgba(241, 196, 15, 0.95)",
                          color: "#111111",
                          fontWeight: "bold",
                          cursor: closingPollId === poll.id ? "default" : "pointer",
                          opacity: closingPollId === poll.id ? 0.7 : 1,
                        }}
                      >
                        {closingPollId === poll.id ? "Uzavírám..." : "UZAVŘÍT"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleEditPoll(poll)}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        background: primaryColor,
                        color: "white",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      Upravit
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDeletePoll(poll.id)}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        background: "rgba(198,40,40,0.95)",
                        color: "white",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      Smazat
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}