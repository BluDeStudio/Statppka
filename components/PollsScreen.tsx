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

export default function PollsScreen({
  clubId,
  userId,
  primaryColor = "#22c55e",
}: Props) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<PollVote[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [pollDate, setPollDate] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);

  const loadData = async () => {
    setLoading(true);

    const [{ data: pollsData }, { data: optionsData }, { data: votesData }] =
      await Promise.all([
        supabase
          .from("polls")
          .select("*")
          .eq("club_id", clubId)
          .order("created_at", { ascending: false }),
        supabase.from("poll_options").select("*"),
        supabase.from("poll_votes").select("*"),
      ]);

    setPolls((pollsData as Poll[]) ?? []);
    setOptions((optionsData as PollOption[]) ?? []);
    setVotes((votesData as PollVote[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [clubId]);

  const resetForm = () => {
    setQuestion("");
    setDescription("");
    setAllowMultiple(false);
    setPollDate("");
    setNewOptions(["", ""]);
  };

  const handleAddOptionField = () => {
    setNewOptions((prev) => [...prev, ""]);
  };

  const handleOptionChange = (index: number, value: string) => {
    setNewOptions((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleRemoveOptionField = (index: number) => {
    setNewOptions((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleCreatePoll = async () => {
    const trimmedQuestion = question.trim();
    const validOptions = newOptions
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (!trimmedQuestion) {
      setMessage("Zadej název ankety.");
      return;
    }

    if (validOptions.length < 2) {
      setMessage("Anketa musí mít alespoň 2 možnosti.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { data: poll, error: pollError } = await supabase
      .from("polls")
      .insert({
        club_id: clubId,
        question: trimmedQuestion,
        description: description.trim() || null,
        allow_multiple: allowMultiple,
        poll_date: pollDate || null,
      })
      .select("*")
      .single();

    if (pollError || !poll) {
      console.error("Nepodařilo se vytvořit anketu:", pollError);
      setMessage("Nepodařilo se vytvořit anketu.");
      setSaving(false);
      return;
    }

    const { error: optionsError } = await supabase.from("poll_options").insert(
      validOptions.map((text) => ({
        poll_id: poll.id,
        text,
      }))
    );

    if (optionsError) {
      console.error("Nepodařilo se uložit možnosti ankety:", optionsError);
      setMessage("Anketa byla vytvořena, ale nepodařilo se uložit možnosti.");
      setSaving(false);
      await loadData();
      return;
    }

    resetForm();
    setShowForm(false);
    setMessage("Anketa byla vytvořena.");
    setSaving(false);
    await loadData();
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
        console.error("Nepodařilo se změnit hlas:", deleteError);
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
    } else {
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
        const { error: insertError } = await supabase
          .from("poll_votes")
          .insert({
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
    }

    await loadData();
  };

  const getOptionsForPoll = (pollId: string) => {
    return options.filter((option) => option.poll_id === pollId);
  };

  const getVotesCount = (optionId: string) => {
    return votes.filter((vote) => vote.option_id === optionId).length;
  };

  const hasUserVoted = (pollId: string, optionId: string) => {
    return votes.some(
      (vote) =>
        vote.poll_id === pollId &&
        vote.option_id === optionId &&
        vote.user_id === userId
    );
  };

  const cardStyle: React.CSSProperties = {
    ...styles.card,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.04)",
  };

  const pollList = useMemo(() => polls, [polls]);

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <button
        type="button"
        onClick={() => {
          setShowForm((prev) => !prev);
          setMessage("");
        }}
        style={{
          ...styles.primaryButton,
          marginTop: 0,
          background: primaryColor,
          border: "none",
        }}
      >
        {showForm ? "Zavřít formulář" : "Vytvořit anketu"}
      </button>

      {showForm && (
        <div style={cardStyle}>
          <h2 style={styles.screenTitle}>Nová anketa</h2>

          <div style={{ display: "grid", gap: "10px" }}>
            <input
              type="text"
              placeholder="Název ankety"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              style={styles.input}
            />

            <textarea
              placeholder="Popis ankety (nepovinné)"
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
                onChange={(e) => setAllowMultiple(e.target.checked)}
              />
              Povolit více odpovědí
            </label>

            <div style={{ display: "grid", gap: "8px" }}>
              {newOptions.map((option, index) => (
                <div
                  key={index}
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  <input
                    type="text"
                    placeholder={`Možnost ${index + 1}`}
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    style={{ ...styles.input, marginTop: 0 }}
                  />

                  {newOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOptionField(index)}
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
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddOptionField}
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
              onClick={() => void handleCreatePoll()}
              disabled={saving}
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: primaryColor,
                border: "none",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Ukládám..." : "Uložit anketu"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          style={{
            ...cardStyle,
            padding: "12px 14px",
            color: "#d9d9d9",
            fontSize: "14px",
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div style={cardStyle}>
          <div style={{ color: "#b8b8b8" }}>Načítám ankety...</div>
        </div>
      ) : pollList.length === 0 ? (
        <div style={cardStyle}>
          <div style={{ color: "#b8b8b8" }}>Zatím nejsou vytvořené žádné ankety.</div>
        </div>
      ) : (
        pollList.map((poll) => {
          const pollOptions = getOptionsForPoll(poll.id);

          return (
            <div key={poll.id} style={cardStyle}>
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                {poll.question}
              </div>

              {poll.description && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "#b8b8b8",
                    marginTop: "6px",
                    lineHeight: 1.45,
                  }}
                >
                  {poll.description}
                </div>
              )}

              <div
                style={{
                  fontSize: "12px",
                  color: "#9f9f9f",
                  marginTop: "8px",
                }}
              >
                {poll.allow_multiple ? "Více odpovědí" : "Jedna odpověď"}
                {poll.poll_date ? ` • Datum: ${poll.poll_date}` : ""}
              </div>

              <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                {pollOptions.map((option) => {
                  const selected = hasUserVoted(poll.id, option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        void handleVote(poll.id, option.id, poll.allow_multiple)
                      }
                      style={{
                        padding: "12px 14px",
                        borderRadius: "12px",
                        border: selected
                          ? "1px solid rgba(255,255,255,0.22)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: selected
                          ? primaryColor
                          : "rgba(255,255,255,0.06)",
                        color: "white",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        cursor: "pointer",
                        fontWeight: selected ? "bold" : 500,
                      }}
                    >
                      <span style={{ textAlign: "left" }}>{option.text}</span>
                      <span>{getVotesCount(option.id)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}