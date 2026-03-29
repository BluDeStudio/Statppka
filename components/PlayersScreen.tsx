"use client";

import { useEffect, useMemo, useState } from "react";
import { styles } from "@/styles/appStyles";
import {
  createPlayer,
  getPlayersByClubId,
  updatePlayer,
  type Player,
} from "@/lib/players";
import { supabase } from "@/lib/supabaseClient";

type PlayersScreenProps = {
  clubId: string;
  primaryColor?: string;
};

const defaultPositions = [
  "Brankář",
  "Obránce",
  "Útočník",
  "Křídlo",
  "Pivot",
];

function getAge(birthDate?: string | null) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

function isBirthdayToday(birthDate?: string | null) {
  if (!birthDate) return false;

  const birth = new Date(birthDate);
  const today = new Date();

  return (
    birth.getDate() === today.getDate() &&
    birth.getMonth() === today.getMonth()
  );
}

export default function PlayersScreen({
  clubId,
  primaryColor = "#888888",
}: PlayersScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState(defaultPositions[2]);
  const [birthDate, setBirthDate] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadPlayers = async () => {
      setLoading(true);
      setMessage("");

      const [
        loadedPlayers,
        {
          data: { user },
        },
      ] = await Promise.all([
        getPlayersByClubId(clubId),
        supabase.auth.getUser(),
      ]);

      if (!active) return;

      setPlayers(loadedPlayers);
      setCurrentUserId(user?.id ?? null);
      setLoading(false);
    };

    void loadPlayers();

    return () => {
      active = false;
    };
  }, [clubId]);

  const linkedCount = useMemo(
    () => players.filter((player) => player.profile_id).length,
    [players]
  );

  const resetForm = () => {
    setEditingPlayer(null);
    setName("");
    setNumber("");
    setPosition(defaultPositions[2]);
    setBirthDate("");
    setMessage("");
  };

  const handleAddPlayer = async () => {
    if (!name.trim()) {
      setMessage("Zadej jméno hráče.");
      return;
    }

    if (!number.trim()) {
      setMessage("Zadej číslo hráče.");
      return;
    }

    const parsedNumber = Number(number);

    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      setMessage("Číslo hráče musí být kladné celé číslo.");
      return;
    }

    if (players.some((player) => player.number === parsedNumber)) {
      setMessage("Hráč s tímto číslem už v týmu existuje.");
      return;
    }

    setSaving(true);
    setMessage("");

    const result = await createPlayer({
      clubId,
      name,
      number: parsedNumber,
      position,
      birth_date: birthDate || null,
    });

    if (result.player) {
      setPlayers((prev) =>
        [...prev, result.player as Player].sort((a, b) => a.number - b.number)
      );
      resetForm();
      setMessage("Hráč byl přidán.");
    } else {
      setMessage(result.errorMessage ?? "Nepodařilo se přidat hráče.");
    }

    setSaving(false);
  };

  const startEditingPlayer = (player: Player) => {
    setEditingPlayer(player);
    setName(player.name);
    setNumber(String(player.number));
    setPosition(player.position);
    setBirthDate(player.birth_date ?? "");
    setMessage("");
  };

  const handleUpdatePlayer = async () => {
    if (!editingPlayer) return;

    if (!name.trim()) {
      setMessage("Zadej jméno hráče.");
      return;
    }

    if (!number.trim()) {
      setMessage("Zadej číslo hráče.");
      return;
    }

    const parsedNumber = Number(number);

    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      setMessage("Číslo hráče musí být kladné celé číslo.");
      return;
    }

    if (
      players.some(
        (player) =>
          player.id !== editingPlayer.id && player.number === parsedNumber
      )
    ) {
      setMessage("Hráč s tímto číslem už v týmu existuje.");
      return;
    }

    setSaving(true);
    setMessage("");

    const result = await updatePlayer({
      playerId: editingPlayer.id,
      name,
      number: parsedNumber,
      position,
      birth_date: birthDate || null,
    });

    if (result.player) {
      setPlayers((prev) =>
        prev
          .map((player) =>
            player.id === editingPlayer.id ? (result.player as Player) : player
          )
          .sort((a, b) => a.number - b.number)
      );
      resetForm();
      setMessage("Hráč byl upraven.");
    } else {
      setMessage(result.errorMessage ?? "Nepodařilo se upravit hráče.");
    }

    setSaving(false);
  };

  return (
    <div>
      <h2 style={styles.screenTitle}>
        {editingPlayer ? "Upravit hráče" : "Soupiska"}
      </h2>

      <div style={styles.card}>
        <div
          style={{
            marginBottom: "12px",
            display: "grid",
            gap: "6px",
            color: "#d7d7d7",
            fontSize: "14px",
          }}
        >
          <div>
            Celkem hráčů: <strong>{players.length}</strong>
          </div>
          <div>
            Propojeno s účtem: <strong>{linkedCount}</strong>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <input
            type="text"
            placeholder="Jméno hráče"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />

          <input
            type="number"
            placeholder="Číslo"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            style={styles.input}
          />

          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            style={{
              ...styles.input,
              appearance: "none",
              cursor: "pointer",
            }}
          >
            {defaultPositions.map((item) => (
              <option
                key={item}
                value={item}
                style={{ background: "#111111", color: "white" }}
              >
                {item}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            style={styles.input}
          />

          {editingPlayer ? (
            <>
              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  marginTop: 0,
                  background: primaryColor,
                  opacity: saving ? 0.7 : 1,
                }}
                onClick={handleUpdatePlayer}
                disabled={saving}
              >
                {saving ? "Ukládám..." : "Uložit změny"}
              </button>

              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  marginTop: 0,
                  background: "rgba(255,255,255,0.12)",
                }}
                onClick={resetForm}
                disabled={saving}
              >
                Zrušit úpravu
              </button>
            </>
          ) : (
            <button
              type="button"
              style={{
                ...styles.primaryButton,
                marginTop: 0,
                background: primaryColor,
                opacity: saving ? 0.7 : 1,
              }}
              onClick={handleAddPlayer}
              disabled={saving}
            >
              {saving ? "Ukládám..." : "Přidat hráče"}
            </button>
          )}

          {message && (
            <p style={{ margin: 0, color: "#cfcfcf", fontSize: "14px" }}>
              {message}
            </p>
          )}
        </div>

        {loading ? (
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "center",
              color: "#b8b8b8",
            }}
          >
            Načítám hráče...
          </div>
        ) : players.length === 0 ? (
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "center",
              color: "#b8b8b8",
            }}
          >
            Zatím nemáš žádné hráče.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "10px",
            }}
          >
            {players.map((player) => {
              const isMe =
                currentUserId !== null && player.profile_id === currentUserId;
              const isLinked = Boolean(player.profile_id);
              const age = getAge(player.birth_date);
              const hasBirthdayToday = isBirthdayToday(player.birth_date);

              return (
                <div
                  key={player.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: isMe
                      ? "rgba(61, 214, 140, 0.10)"
                      : "rgba(255,255,255,0.04)",
                    borderRadius: "14px",
                    padding: "10px 12px",
                    border: isMe
                      ? "1px solid rgba(61, 214, 140, 0.30)"
                      : "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    style={{
                      minWidth: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      background: primaryColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      color: "white",
                    }}
                  >
                    {player.number}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "bold" }}>{player.name}</div>

                    <div style={{ fontSize: "12px", color: "#b8b8b8" }}>
                      {player.position}
                      {age !== null ? ` • ${age} let` : ""}
                    </div>

                    {hasBirthdayToday && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#ffd54f",
                          marginTop: "2px",
                          fontWeight: "bold",
                        }}
                      >
                        🎂 Dnes má narozeniny!
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "6px",
                      justifyItems: "end",
                      flexShrink: 0,
                    }}
                  >
                    {isMe ? (
                      <>
                        <div
                          style={{
                            padding: "5px 9px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            background: "rgba(61, 214, 140, 0.18)",
                            color: "#7dffbc",
                            border: "1px solid rgba(61, 214, 140, 0.30)",
                          }}
                        >
                          JÁ
                        </div>

                        <button
                          type="button"
                          style={{
                            border: "none",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            background: primaryColor,
                            color: "white",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "11px",
                          }}
                          onClick={() => startEditingPlayer(player)}
                        >
                          UPRAVIT
                        </button>
                      </>
                    ) : null}

                    <div
                      style={{
                        padding: "5px 9px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        background: isLinked
                          ? "rgba(255,255,255,0.10)"
                          : "rgba(255,255,255,0.05)",
                        color: isLinked ? "#ffffff" : "#b8b8b8",
                        border: isLinked
                          ? "1px solid rgba(255,255,255,0.12)"
                          : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {isLinked ? "PROPOJENÝ" : "VOLNÝ"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}