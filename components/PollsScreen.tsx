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
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [pollDate, setPollDate] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);

  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [deletingPollId, setDeletingPollId] = useState<string | null>(null);

  const resetForm = () => {
    setQuestion("");
    setDescription("");
    setPollDate("");
    setAllowMultiple(false);
    setNewOptions(["", ""]);
    setEditingPollId(null);
  };

  const loadData = async () => {
    setLoading(true);

    const [{ data: pollsData, error: pollsError }, { data: optionsData, error: optionsError }, { data: votesData, error: votesError }] =
      await Promise.all([
        supabase
          .from("polls")
          .select("*")
          .eq("club_id", clubId)
          .order("created_at", { ascending: false }),
        supabase.from("poll_options").select("*"),
        supabase.from("poll_votes").select("*"),
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

    setPolls((pollsData as Poll[]) || []);
    setOptions((optionsData as PollOption[]) || []);
    setVotes((votesData as PollVote[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [clubId]);

  const pollOptionsMap = useMemo(() => {
    const map = new Map<string, PollOption[]>();

    options.forEach((option) => {
      if (!map.has(option.poll_id)) {
        map.set(option.poll_id, []);
      }
      map.get(option.poll_id)!.push(option);
    });

    return map;
  }, [options]);

  const getOptions = (pollId: string) => pollOptionsMap.get(pollId) ?? [];

  const getVotesCount = (optionId: string) =>
    votes.filter((vote) => vote.option_id === optionId).length;

  const hasVoted = (pollId: string, optionId: string) =>
    votes.some(
      (vote) =>
        vote.poll_id === pollId &&
        vote.option_id === optionId &&
        vote.user_id === userId
    );

  const handleAddOptionInput = () => {
    setNewOptions((prev) => [...prev, ""]);
  };

  const handleChangeOptionInput = (index: number, value: string) => {
    setNewOptions((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleRemoveOptionInput = (index: number) => {
    setNewOptions((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
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

      const currentOptions = getOptions(editingPollId);

      if (currentOptions.length > 0) {
        const currentOptionIds = currentOptions.map((option) => option.id);

        const { error: deleteVotesError } = await supabase
          .from("poll_votes")
          .delete()
          .in("option_id", currentOptionIds);

        if (deleteVotesError) {
          console.error("Nepodařilo se smazat hlasy ankety:", deleteVotesError);
          setMessage("Nepodařilo se upravit anketu.");
          setSaving(false);
          return;
        }

        const { error: deleteOptionsError } = await supabase
          .from("poll_options")
          .delete()
          .eq("poll_id", editingPollId);

        if (deleteOptionsError) {
          console.error("Nepodařilo se smazat původní možnosti ankety:", deleteOptionsError);
          setMessage("Nepodařilo se upravit anketu.");
          setSaving(false);
          return;
        }
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

  const handleEditPoll = (poll: Poll) => {
    const currentOptions = getOptions(poll.id);

    setEditingPollId(poll.id);
    setQuestion(poll.question);
    setDescription(poll.description ?? "");
    setPollDate(poll.poll_date ?? "");
    setAllowMultiple(poll.allow_multiple);
    setNewOptions(
      currentOptions.length > 0
        ? currentOptions.map((option) => option.text)
        : ["", ""]
    );
    setShowForm(true);
    setMessage("");
  };

  const handleDeletePoll = async (pollId: string) => {
    const confirmed = window.confirm("Opravdu chceš smazat tuto anketu?");
    if (!confirmed) return;

    setDeletingPollId(pollId);
    setMessage("");

    const currentOptions = getOptions(pollId);
    const optionIds = currentOptions.map((option) => option.id);

    if (optionIds.length > 0) {
      const { error: deleteVotesError } = await supabase
        .from("poll_votes")
        .delete()
        .in("option_id", optionIds);

      if (deleteVotesError) {
        console.error("Nepodařilo se smazat hlasy ankety:", deleteVotesError);
        setMessage("Nepodařilo se smazat anketu.");
        setDeletingPollId(null);
        return;
      }
    }

    const { error: deleteOptionsError } = await supabase
      .from("poll_options")
      .delete()
      .eq("poll_id", pollId);

    if (deleteOptionsError) {
      console.error("Nepodařilo se smazat možnosti ankety:", deleteOptionsError);
      setMessage("Nepodařilo se smazat anketu.");
      setDeletingPollId(null);
      return;
    }

    const { error: deletePollError } = await supabase
      .from("polls")
      .delete()
      .eq("id", pollId);

    if (deletePollError) {
      console.error("Nepodařilo se smazat anketu:", deletePollError);
      setMessage("Nepodařilo se smazat anketu.");
      setDeletingPollId(null);
      return;
    }

    if (editingPollId === pollId) {
      resetForm();
      setShowForm(false);
    }

    await loadData();
    setMessage("Anketa byla smazána.");
    setDeletingPollId(null);
  };

  const handleVote = async (
    pollId: string,
    optionId: string,
    multiple: boolean
  ) => {
    setMessage("");

    if (multiple) {
      const alreadySelected = hasVoted(pollId, optionId);

      if (alreadySelected) {
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

        await loadData();
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

    const { error: deletePreviousError } = await supabase
      .from("poll_votes")
      .delete()
      .eq("poll_id", pollId)
      .eq("user_id", userId);

    if (deletePreviousError) {
      console.error("Nepodařilo se přepsat předchozí hlas:", deletePreviousError);
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
  };

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <button
        type="button"
        onClick={() => {
          if (showForm && editingPollId) {
            resetForm();
          }
          setShowForm((prev) => !prev);
          setMessage("");
        }}
        style={{
          ...styles.primaryButton,
          background: primaryColor,
          border: "none",
        }}
      >
        {showForm
          ? editingPollId
            ? "Zavřít úpravu ankety"
            : "Zavřít formulář"
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

            <div style={{ fontWeight: "bold", marginTop: "4px" }}>Možnosti</div>

            {newOptions.map((opt, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  value={opt}
                  placeholder={`Možnost ${i + 1}`}
                  onChange={(e) => handleChangeOptionInput(i, e.target.value)}
                  style={{ ...styles.input, marginTop: 0 }}
                />

                {newOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOptionInput(i)}
                    style={{
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      background: "rgba(198,40,40,0.95)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Smazat
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddOptionInput}
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
                ? editingPollId
                  ? "Ukládám změny..."
                  : "Vytvářím..."
                : editingPollId
                ? "Uložit změny"
                : "Uložit anketu"}
            </button>

            {editingPollId && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                  setMessage("");
                }}
                style={{
                  ...styles.primaryButton,
                  marginTop: 0,
                  background: "rgba(255,255,255,0.12)",
                  border: "none",
                }}
              >
                Zrušit úpravu
              </button>
            )}
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
          <div style={{ color: "#b8b8b8" }}>Zatím tu nejsou žádné ankety.</div>
        </div>
      ) : (
        polls.map((poll) => (
          <div key={poll.id} style={styles.card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "flex-start",
                marginBottom: "10px",
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
                      marginTop: "6px",
                      lineHeight: 1.45,
                    }}
                  >
                    {poll.description}
                  </div>
                )}

                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "#a8a8a8",
                  }}
                >
                  {poll.allow_multiple ? "Více odpovědí" : "Jedna odpověď"}
                  {poll.poll_date ? ` • Datum: ${poll.poll_date}` : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
              {getOptions(poll.id).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    void handleVote(poll.id, opt.id, poll.allow_multiple)
                  }
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: hasVoted(poll.id, opt.id)
                      ? `1px solid ${primaryColor}`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: hasVoted(poll.id, opt.id)
                      ? primaryColor
                      : "rgba(255,255,255,0.06)",
                    color: "white",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontWeight: hasVoted(poll.id, opt.id) ? "bold" : "normal",
                    cursor: "pointer",
                  }}
                >
                  <span>{opt.text}</span>
                  <span>{getVotesCount(opt.id)}</span>
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "14px",
              }}
            >
              <button
                type="button"
                onClick={() => handleEditPoll(poll)}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 12px",
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
                disabled={deletingPollId === poll.id}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  background: "rgba(198,40,40,0.95)",
                  color: "white",
                  fontWeight: "bold",
                  cursor: deletingPollId === poll.id ? "default" : "pointer",
                  opacity: deletingPollId === poll.id ? 0.7 : 1,
                }}
              >
                {deletingPollId === poll.id ? "Mažu..." : "Smazat"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}