"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { styles } from "@/styles/appStyles";
import { supabase } from "@/lib/supabaseClient";
import type { Club, ClubMember } from "@/lib/club";
import { createClub, joinClubByInviteToken } from "@/lib/club";

type TeamSetupScreenProps = {
  userId: string;
  onReady: (club: Club, membership: ClubMember) => void;
};

type ColorPreset = {
  id: string;
  name: string;
  primary: string;
  secondary: string;
};

const INVITE_STORAGE_KEY = "statppka_invite_token";

const colorPresets: ColorPreset[] = [
  {
    id: "green-black",
    name: "Zelená / černá",
    primary: "#1db954",
    secondary: "#050805",
  },
  {
    id: "blue-dark",
    name: "Modrá / tmavá",
    primary: "#2563eb",
    secondary: "#0b1220",
  },
  {
    id: "red-black",
    name: "Červená / černá",
    primary: "#dc2626",
    secondary: "#090909",
  },
  {
    id: "yellow-dark",
    name: "Žlutá / tmavá",
    primary: "#eab308",
    secondary: "#111827",
  },
  {
    id: "purple-dark",
    name: "Fialová / tmavá",
    primary: "#7c3aed",
    secondary: "#111111",
  },
  {
    id: "cyan-dark",
    name: "Tyrkysová / tmavá",
    primary: "#06b6d4",
    secondary: "#0f172a",
  },
];

function extractInviteToken(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("invite") ?? "";
    } catch {
      return "";
    }
  }

  if (trimmed.includes("invite=")) {
    try {
      const prefixed = trimmed.startsWith("?") ? trimmed : `?${trimmed.split("?").pop()}`;
      const params = new URLSearchParams(prefixed);
      return params.get("invite") ?? "";
    } catch {
      return "";
    }
  }

  return trimmed;
}

function getInviteTokenFromCurrentUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get("invite") ?? "";
}

function getStoredInviteToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(INVITE_STORAGE_KEY) ?? "";
}

function storeInviteToken(token: string) {
  if (typeof window === "undefined") return;

  if (token.trim()) {
    window.localStorage.setItem(INVITE_STORAGE_KEY, token.trim());
  }
}

function clearStoredInviteToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(INVITE_STORAGE_KEY);
}

function makeLogoPath(userId: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "png";
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
}

async function uploadClubLogo(userId: string, file: File): Promise<{
  logoUrl: string | null;
  errorMessage?: string;
}> {
  try {
    const filePath = makeLogoPath(userId, file);

    const { error: uploadError } = await supabase.storage
      .from("club-logos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/png",
      });

    if (uploadError) {
      console.error("Nepodařilo se nahrát logo:", uploadError);
      return {
        logoUrl: null,
        errorMessage: `Nepodařilo se nahrát logo: ${uploadError.message}`,
      };
    }

    const { data } = supabase.storage.from("club-logos").getPublicUrl(filePath);

    return {
      logoUrl: data.publicUrl,
    };
  } catch (error) {
    console.error("Chyba při uploadu loga:", error);
    return {
      logoUrl: null,
      errorMessage: "Při nahrávání loga nastala chyba.",
    };
  }
}

export default function TeamSetupScreen({
  userId,
  onReady,
}: TeamSetupScreenProps) {
  const defaultPreset = colorPresets[0];

  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [hasBTeam, setHasBTeam] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [primaryColor, setPrimaryColor] = useState(defaultPreset.primary);
  const [secondaryColor, setSecondaryColor] = useState(defaultPreset.secondary);
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPreset.id);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const inviteFromUrl = getInviteTokenFromCurrentUrl();
    const inviteFromStorage = getStoredInviteToken();
    const resolvedInvite = inviteFromUrl || inviteFromStorage;

    if (inviteFromUrl) {
      storeInviteToken(inviteFromUrl);
    }

    if (resolvedInvite) {
      setInviteToken(resolvedInvite);
      setMode("join");
      setMessage("Otevřel jsi pozvánku do týmu. Připoj se.");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%)`,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "16px",
      padding: "16px",
      color: "white",
      minHeight: "90px",
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "space-between",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    }),
    [primaryColor, secondaryColor]
  );

  const applyPreset = (preset: ColorPreset) => {
    setSelectedPresetId(preset.id);
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
  };

  const handlePrimaryColorChange = (value: string) => {
    setPrimaryColor(value);
    setSelectedPresetId("custom");
  };

  const handleSecondaryColorChange = (value: string) => {
    setSecondaryColor(value);
    setSelectedPresetId("custom");
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Vyber obrázek loga.");
      return;
    }

    if (logoPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreviewUrl);
    }

    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setMessage("");
  };

  const handleCreate = async () => {
    if (!teamName.trim()) {
      setMessage("Zadej název týmu.");
      return;
    }

    setLoading(true);
    setMessage("");

    let uploadedLogoUrl: string | undefined;

    if (logoFile) {
      setLogoUploading(true);

      const uploadResult = await uploadClubLogo(userId, logoFile);

      setLogoUploading(false);

      if (!uploadResult.logoUrl) {
        setMessage(uploadResult.errorMessage ?? "Nepodařilo se nahrát logo.");
        setLoading(false);
        return;
      }

      uploadedLogoUrl = uploadResult.logoUrl;
    }

    const result = await createClub({
      userId,
      name: teamName.trim(),
      hasBTeam,
      primaryColor,
      secondaryColor,
      logoUrl: uploadedLogoUrl,
    });

    if (result.club && result.membership) {
      onReady(result.club, result.membership);
      setMessage("");
    } else {
      setMessage(result.errorMessage ?? "Nepodařilo se vytvořit tým.");
    }

    setLoading(false);
  };

  const handleJoin = async () => {
    const cleanedToken = extractInviteToken(inviteToken);

    if (!cleanedToken) {
      setMessage("Zadej platný pozvánkový odkaz nebo token.");
      return;
    }

    setLoading(true);
    setMessage("");
    storeInviteToken(cleanedToken);

    const result = await joinClubByInviteToken(userId, cleanedToken);

    if (result.club && result.membership) {
      clearStoredInviteToken();
      onReady(result.club, result.membership);
      setMessage("");
    } else {
      setMessage(result.errorMessage ?? "Nepodařilo se připojit ke klubu.");
    }

    setLoading(false);
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.screenTitle}>Začínáme</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => setMode("create")}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "10px",
            border: "none",
            background: mode === "create" ? primaryColor : "rgba(255,255,255,0.1)",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Vytvořit tým
        </button>

        <button
          onClick={() => setMode("join")}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "10px",
            border: "none",
            background: mode === "join" ? primaryColor : "rgba(255,255,255,0.1)",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Připojit se
        </button>
      </div>

      {mode === "create" && (
        <div style={{ display: "grid", gap: "12px" }}>
          <input
            type="text"
            placeholder="Název týmu"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={styles.input}
          />

          <div>
            <p
              style={{
                color: "white",
                fontWeight: "bold",
                marginBottom: "8px",
              }}
            >
              Logo týmu
            </p>

            <label
              style={{
                display: "grid",
                gap: "10px",
                cursor: "pointer",
              }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                style={{ display: "none" }}
              />

              <div
                style={{
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.05)",
                  padding: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Náhled loga"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ color: "#b9c4bb", fontSize: "12px", textAlign: "center" }}>
                      Bez loga
                    </span>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: "bold", color: "white" }}>
                    Vybrat logo z galerie
                  </div>
                  <div style={{ fontSize: "13px", color: "#b9c4bb", marginTop: "4px" }}>
                    Nahraj obrázek loga týmu
                  </div>
                </div>
              </div>
            </label>
          </div>

          <div>
            <p
              style={{
                color: "white",
                fontWeight: "bold",
                marginBottom: "8px",
              }}
            >
              Vyber barvy týmu
            </p>

            <div style={{ display: "grid", gap: "8px" }}>
              {colorPresets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      border: isSelected
                        ? "1px solid rgba(255,255,255,0.35)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{preset.name}</span>

                    <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "999px",
                          background: preset.primary,
                          border: "1px solid rgba(255,255,255,0.2)",
                        }}
                      />
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "999px",
                          background: preset.secondary,
                          border: "1px solid rgba(255,255,255,0.2)",
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: "8px",
                color: "white",
                fontWeight: 600,
              }}
            >
              Primární
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "8px 10px",
                }}
              >
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => handlePrimaryColorChange(e.target.value)}
                  style={{
                    width: "42px",
                    height: "42px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                  }}
                />
                <span style={{ color: "#b9c4bb", fontSize: "14px" }}>{primaryColor}</span>
              </div>
            </label>

            <label
              style={{
                display: "grid",
                gap: "8px",
                color: "white",
                fontWeight: 600,
              }}
            >
              Sekundární
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "8px 10px",
                }}
              >
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => handleSecondaryColorChange(e.target.value)}
                  style={{
                    width: "42px",
                    height: "42px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                  }}
                />
                <span style={{ color: "#b9c4bb", fontSize: "14px" }}>{secondaryColor}</span>
              </div>
            </label>
          </div>

          <div style={previewStyle}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Náhled týmu</div>
            <div style={{ fontSize: "22px", fontWeight: 800 }}>
              {teamName.trim() || "Tvůj tým"}
            </div>
            <div style={{ fontSize: "13px", opacity: 0.9 }}>
              {hasBTeam ? "A-tým + B-tým" : "Jeden tým"}
            </div>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "white",
            }}
          >
            <input
              type="checkbox"
              checked={hasBTeam}
              onChange={(e) => setHasBTeam(e.target.checked)}
            />
            Má váš tým rezervu (B-tým)?
          </label>

          <button
            style={{
              ...styles.primaryButton,
              opacity: loading || logoUploading ? 0.7 : 1,
              background: primaryColor,
            }}
            onClick={handleCreate}
            disabled={loading || logoUploading}
          >
            {logoUploading
              ? "Nahrávám logo..."
              : loading
              ? "Zakládám..."
              : "Založit tým"}
          </button>
        </div>
      )}

      {mode === "join" && (
        <div style={{ display: "grid", gap: "10px" }}>
          <input
            type="text"
            placeholder="Vlož pozvánkový odkaz nebo token"
            value={inviteToken}
            onChange={(e) => setInviteToken(e.target.value)}
            style={styles.input}
          />

          <button
            style={{
              ...styles.primaryButton,
              opacity: loading ? 0.7 : 1,
              background: primaryColor,
            }}
            onClick={handleJoin}
            disabled={loading}
          >
            {loading ? "Připojuji..." : "Připojit se ke týmu"}
          </button>
        </div>
      )}

      {message && (
        <p style={{ marginTop: "12px", color: "#b9c4bb" }}>{message}</p>
      )}
    </div>
  );
}