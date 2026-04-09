"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  getClubMemberPlayersByClubId,
  type ClubMemberPlayer,
} from "@/lib/players";
import { styles } from "@/styles/appStyles";

type Poll = {
  id: string;
  club_id: string;
  question: string;
  description?: string | null;
  allow_multiple: boolean;
  poll_date?: string | null;
  created_at: string;
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

type Props = {
  clubId: string;
  userId: string;
  primaryColor?: string;
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

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value?: string | null) {
  const iso = normalizeDateToIso(value);
  if (!iso) return "";

  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;

  return `${day}.${month}.${year}`;
}

export default function PollsScreen({
  clubId,
  userId,
  primaryColor = "#22c55e",
}: Props) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [clubMembers, setClubMembers] = useState<ClubMemberPlayer[]>([]);

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

  const loadData = async () => {
    setLoading(true);

    const [
      { data: pollsData, error: pollsError },
      { data: optionsData, error: optionsError },
      { data: votesData, error: votesError },
      clubMembersData,
    ] = await Promise.all([
      supabase
        .from("polls")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false }),
      supabase.from("poll_options").select("*"),
      supabase.from("poll_votes").select("*"),
      getClubMemberPlayersByClubId(clubId),
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

    setPolls((pollsData as Poll[]) ?? []);
    setOptions((optionsData as PollOption[]) ?? []);
    setVotes((votesData as PollVote[]) ?? []);
    setClubMembers(clubMembersData ?? []);
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
        console.error(
          "Nepodařilo se smazat staré hlasy ankety:",
          deleteVotesError
        );
        setMessage("Nepodařilo se upravit anketu.");
        setSaving(false);
        return;
      }

      const { error: deleteOptionsError } = await supabase
        .from("poll_options")
        .delete()
        .eq("poll_id", editingPollId);

      if (deleteOptionsError) {
        console.error(
          "Nepodařilo se smazat staré možnosti ankety:",
          deleteOptionsError
        );
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
        console.error(
          "Nepodařilo se uložit nové možnosti ankety:",
          insertOptionsError
        );
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
      console.error(
        "Nepodařilo se smazat možnosti ankety:",
        deleteOptionsError
      );
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

  const handleVote = async (
    pollId: string,
    optionId: string,
    multiple: boolean
  ) => {
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

  const getMemberName = (memberUserId: string) => {
    return (
      clubMembers.find((member) => member.id === memberUserId)?.name ??
      "Neznámý člen"
    );
  };

  const getVotesByOptionId = (optionId: string) => {
    return votes
      .filter((vote) => vote.option_id === optionId)
      .slice()
      .sort((a, b) =>
        getMemberName(a.user_id).localeCompare(getMemberName(b.user_id), "cs")
      );
  };

  const getNonVotedMembersByPollId = (pollId: string) => {
    const votedUserIds = new Set(
      votes.filter((vote) => vote.poll_id === pollId).map((vote) => vote.user_id)
    );

    return clubMembers
      .filter((member) => !votedUserIds.has(member.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
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
          const nonVotedMembers = getNonVotedMembersByPollId(poll.id);

          return (
            <div key={poll.id} style={styles.card}>
              <button
                type="button"
                onClick={() =>
                  setExpandedPollId((prev) => (prev === poll.id ? null : poll.id))
                }
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "white",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
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
                      {poll.poll_date
                        ? ` • Datum: ${formatDisplayDate(poll.poll_date)}`
                        : ""}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginTop: "10px",
                      }}
                    >
                      {pollOptions.map((option, index) => (
                        <div
                          key={option.id}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background: "rgba(255,255,255,0.08)",
                            fontSize: "12px",
                            fontWeight: "bold",
                          }}
                        >
                          MOŽNOST {index + 1}: {getVotesCount(option.id)}
                        </div>
                      ))}

                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "rgba(255, 193, 7, 0.16)",
                          border: "1px solid rgba(255, 193, 7, 0.24)",
                          color: "#ffd97a",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        NEHLASOVALO: {nonVotedMembers.length}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#b8b8b8",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isExpanded ? "Skrýt" : "Detail"}
                  </div>
                </div>
              </button>

              <div style={{ marginTop: "14px", display: "grid", gap: "8px" }}>
                {pollOptions.map((option, index) => {
                  const selected = hasVoted(poll.id, option.id);
                  const votesCount = getVotesCount(option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        void handleVote(poll.id, option.id, poll.allow_multiple)
                      }
                      style={{
                        padding: "14px 16px",
                        borderRadius: "12px",
                        border: selected
                          ? `1px solid ${primaryColor}`
                          : "1px solid rgba(255,255,255,0.08)",
                        background: selected
                          ? primaryColor
                          : "rgba(255,255,255,0.04)",
                        color: "white",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "15px",
                        fontWeight: selected ? "bold" : "normal",
                        cursor: "pointer",
                      }}
                    >
                      <span>
                        {option.text}
                        <span style={{ marginLeft: "8px", opacity: 0.8 }}>
                          (MOŽNOST {index + 1})
                        </span>
                      </span>
                      <span>{votesCount}</span>
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#9f9f9f",
                }}
              >
                Celkem hlasů: {totalVotesByPollId.get(poll.id) ?? 0}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
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

              {isExpanded && (
                <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
                  {pollOptions.map((option, index) => {
                    const optionVotes = getVotesByOptionId(option.id);

                    return (
                      <div
                        key={`${poll.id}-detail-${option.id}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "12px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "bold",
                            color: "#d9d9d9",
                            marginBottom: "8px",
                          }}
                        >
                          MOŽNOST {index + 1} ({optionVotes.length})
                        </div>

                        <div
                          style={{
                            fontSize: "13px",
                            color: "#b8b8b8",
                            marginBottom: "8px",
                          }}
                        >
                          {option.text}
                        </div>

                        {optionVotes.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                            Zatím nikdo.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "6px" }}>
                            {optionVotes.map((vote) => (
                              <div
                                key={vote.id}
                                style={{ fontSize: "13px", color: "white" }}
                              >
                                {getMemberName(vote.user_id)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "12px",
                      background: "rgba(255, 193, 7, 0.10)",
                      border: "1px solid rgba(255, 193, 7, 0.20)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        color: "#ffd97a",
                        marginBottom: "8px",
                      }}
                    >
                      NEHLASOVALO ({nonVotedMembers.length})
                    </div>

                    {nonVotedMembers.length === 0 ? (
                      <div style={{ fontSize: "13px", color: "#b8b8b8" }}>
                        Všichni hlasovali.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "6px" }}>
                        {nonVotedMembers.map((member) => (
                          <div
                            key={`${poll.id}-non-voted-${member.id}`}
                            style={{ fontSize: "13px", color: "white" }}
                          >
                            {member.name}
                          </div>
                        ))}
                      </div>
                    )}
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