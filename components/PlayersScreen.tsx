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
  isAdmin: boolean;
};

type ClubMemberRoleRow = {
  user_id: string;
  role: "admin" | "member";
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
  isAdmin,
}: PlayersScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberRoles, setMemberRoles] = useState<Record<string, "admin" | "member">>({});

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState(defaultPositions[2]);
  const [birthDate, setBirthDate] = useState("");
  const [message, setMessage] = useState("");

  const loadAll = async () => {
    setLoading(true);
    setMessage("");

    const [
      loadedPlayers,
      {
        data: { user },
      },
      { data: memberRows, error: memberRowsError },
    ] = await Promise.all([
      getPlayersByClubId(clubId),
      supabase.auth.getUser(),
      supabase
        .from("club_members")
        .select("user_id, role")
        .eq("club_id", clubId),
    ]);

    if (memberRowsError) {
      console.error("Nepodařilo se načíst role členů:", memberRowsError);
    }

    const nextRoles: Record<string, "admin" | "member"> = {};

    ((memberRows as ClubMemberRoleRow[]) ?? []).forEach((row) => {
      nextRoles[row.user_id] = row.role ?? "member";
    });

    setPlayers(loadedPlayers);
    setCurrentUserId(user?.id ?? null);
    setMemberRoles(nextRoles);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!active) return;
      await loadAll();
    };

    void run();

    return () => {
      active = false;
    };
  }, [clubId]);

  const linkedCount = useMemo(
    () => players.filter((player) => player.profile_id).length,
    [players]
  );

  const adminCount = useMemo(() => {
    return Object.values(memberRoles).filter((role) => role === "admin").length;
  }, [memberRoles]);

  const resetForm = () => {
    setEditingPlayer(null);
    setName("");
    setNumber("");
    setPosition(defaultPositions[2]);
    setBirthDate("");
  };

  const handleOpenAddForm = () => {
    if (!isAdmin) return;

    if (editingPlayer) {
      return;
    }

    setMessage("");

    setShowForm((prev) => {
      const next = !prev;

      if (!next) {
        resetForm();
      }

      return next;
    });
  };

  const handleAddPlayer = async () => {
    if (!isAdmin) {
      setMessage("Pouze admin může přidávat hráče.");
      return;
    }

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
      setShowForm(false);
      setMessage("Hráč byl přidán.");
    } else {
      setMessage(result.errorMessage ?? "Nepodařilo se přidat hráče.");
    }

    setSaving(false);
  };

  const startEditingPlayer = (player: Player) => {
    const isMe =
      currentUserId !== null && player.profile_id === currentUserId;

    if (!isAdmin && !isMe) {
      setMessage("Můžeš upravit jen svůj profil.");
      return;
    }

    setEditingPlayer(player);
    setName(player.name);
    setNumber(String(player.number));
    setPosition(player.position);
    setBirthDate(player.birth_date ?? "");
    setShowForm(true);
    setMessage("");
  };

  const handleUpdatePlayer = async () => {
    if (!editingPlayer) return;

    const isMe =
      currentUserId !== null && editingPlayer.profile_id === currentUserId;

    if (!isAdmin && !isMe) {
      setMessage("Můžeš upravit jen svůj profil.");
      return;
    }

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
      setShowForm(false);
      setMessage("Hráč byl upraven.");
    } else {
      setMessage(result.errorMessage ?? "Nepodařilo se upravit hráče.");
    }

    setSaving(false);
  };

  const handleCancelForm = () => {
    resetForm();
    setShowForm(false);
    setMessage("");
  };

  const handleToggleAdmin = async (player: Player) => {
    if (!isAdmin) {
      setMessage("Pouze admin může měnit role.");
      return;
    }

    if (!player.profile_id) {
      setMessage("Admina lze nastavit jen hráči, který má propojený účet.");
      return;
    }

    const currentRole = memberRoles[player.profile_id] ?? "member";
    const nextRole: "admin" | "member" =
      currentRole === "admin" ? "member" : "admin";

    if (
      currentRole === "admin" &&
      player.profile_id === currentUserId &&
      adminCount <= 1
    ) {
      setMessage("Nemůžeš odebrat admina poslednímu adminovi v klubu.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("club_members")
      .update({ role: nextRole })
      .eq("club_id", clubId)
      .eq("user_id", player.profile_id);

    if (error) {
      console.error("Nepodařilo se změnit roli člena:", error);
      setMessage("Nepodařilo se změnit roli.");
      setSaving(false);
      return;
    }

    setMemberRoles((prev) => ({
      ...prev,
      [player.profile_id as string]: nextRole,
    }));

    setMessage(
      nextRole === "admin"
        ? `${player.name} je teď admin.`
        : `${player.name} už není admin.`
    );
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
          <div>
            Adminů: <strong>{adminCount}</strong>
          </div>
        </div>

        {!editingPlayer && isAdmin && (
          <button
            type="button"
            style={{
              ...styles.primaryButton,
              marginTop: 0,
              marginBottom: showForm ? "12px" : "16px",
              background: primaryColor,
              opacity: saving ? 0.7 : 1,
            }}
            onClick={handleOpenAddForm}
            disabled={saving}
          >
            {showForm ? "Zavřít formulář" : "Přidat hráče"}
          </button>
        )}

        {showForm && (
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

            <div
              style={{
                padding: "10px 12px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#cfcfcf",
                fontSize: "12px",
                lineHeight: 1.45,
              }}
            >
              Datum narození slouží pouze pro účely této aplikace – pro zobrazení
              narozenin a automatickou aktualizaci věku hráče. Vyplněním data
              narození souhlasíš s jeho použitím v rámci týmové aplikace
              MyTeamHub.
            </div>

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
                  onClick={handleCancelForm}
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
          </div>
        )}

        {message && (
          <p
            style={{
              margin: "0 0 16px 0",
              color: "#cfcfcf",
              fontSize: "14px",
            }}
          >
            {message}
          </p>
        )}

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
              const playerRole = player.profile_id
                ? memberRoles[player.profile_id] ?? "member"
                : "member";
              const isPlayerAdmin = playerRole === "admin";

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
                    ) : isAdmin ? (
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
                    ) : null}

                    {isLinked && (
                      <div
                        style={{
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          background: isPlayerAdmin
                            ? "rgba(241, 196, 15, 0.16)"
                            : "rgba(255,255,255,0.10)",
                          color: isPlayerAdmin ? "#ffd86b" : "#ffffff",
                          border: isPlayerAdmin
                            ? "1px solid rgba(241, 196, 15, 0.24)"
                            : "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        {isPlayerAdmin ? "ADMIN" : "ČLEN"}
                      </div>
                    )}

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

                    {isAdmin && isLinked && !isMe && (
                      <button
                        type="button"
                        style={{
                          border: "none",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          background: isPlayerAdmin
                            ? "rgba(198,40,40,0.95)"
                            : "rgba(241,196,15,0.95)",
                          color: isPlayerAdmin ? "white" : "#111111",
                          cursor: saving ? "default" : "pointer",
                          fontWeight: "bold",
                          fontSize: "11px",
                          opacity: saving ? 0.7 : 1,
                        }}
                        onClick={() => void handleToggleAdmin(player)}
                        disabled={saving}
                      >
                        {isPlayerAdmin ? "ODEBRAT ADMIN" : "UDĚLAT ADMINA"}
                      </button>
                    )}
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