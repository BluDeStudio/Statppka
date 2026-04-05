"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { styles } from "@/styles/appStyles";
import { supabase } from "@/lib/supabaseClient";
import { updateClub, type Club } from "@/lib/club";

type EditTeamScreenProps = {
  club: Club;
  userId: string;
  onUpdated: (club: Club) => void;
  primaryColor?: string;
};

type ColorPreset = {
  id: string;
  name: string;
  primary: string;
  secondary: string;
};

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

export default function EditTeamScreen({
  club,
  userId,
  onUpdated,
  primaryColor = "#1db954",
}: EditTeamScreenProps) {
  const [teamName, setTeamName] = useState(club.name);
  const [hasBTeam, setHasBTeam] = useState(club.has_b_team);
  const [mainColor, setMainColor] = useState(club.primary_color || "#1db954");
  const [secondColor, setSecondColor] = useState(club.secondary_color || "#050805");

  const [selectedPresetId, setSelectedPresetId] = useState("custom");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(club.logo_url ?? "");
  const [removeLogo, setRemoveLogo] = useState(false);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    const matchedPreset = colorPresets.find(
      (preset) =>
        preset.primary.toLowerCase() === (club.primary_color || "").toLowerCase() &&
        preset.secondary.toLowerCase() === (club.secondary_color || "").toLowerCase()
    );

    setSelectedPresetId(matchedPreset?.id ?? "custom");
  }, [club.primary_color, club.secondary_color]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${secondColor} 0%, ${mainColor} 100%)`,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "16px",
      padding: "16px",
      color: "white",
      minHeight: "110px",
      display: "flex",
      gap: "14px",
      alignItems: "center",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    }),
    [mainColor, secondColor]
  );

  const applyPreset = (preset: ColorPreset) => {
    setSelectedPresetId(preset.id);
    setMainColor(preset.primary);
    setSecondColor(preset.secondary);
  };

  const handlePrimaryColorChange = (value: string) => {
    setMainColor(value);
    setSelectedPresetId("custom");
  };

  const handleSecondaryColorChange = (value: string) => {
    setSecondColor(value);
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
    setRemoveLogo(false);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setMessage("");
  };

  const handleRemoveLogo = () => {
    if (logoPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreviewUrl);
    }

    setLogoFile(null);
    setLogoPreviewUrl("");
    setRemoveLogo(true);
    setMessage("Logo bude po uložení odstraněno.");
  };

  const handleSave = async () => {
    if (!teamName.trim()) {
      setMessage("Zadej název týmu.");
      return;
    }

    setSaving(true);
    setMessage("");

    let finalLogoUrl: string | null | undefined = club.logo_url ?? null;

    if (removeLogo) {
      finalLogoUrl = null;
    }

    if (logoFile) {
      setLogoUploading(true);

      const uploadResult = await uploadClubLogo(userId, logoFile);

      setLogoUploading(false);

      if (!uploadResult.logoUrl) {
        setMessage(uploadResult.errorMessage ?? "Nepodařilo se nahrát logo.");
        setSaving(false);
        return;
      }

      finalLogoUrl = uploadResult.logoUrl;
    }

    const result = await updateClub({
      clubId: club.id,
      name: teamName.trim(),
      hasBTeam,
      primaryColor: mainColor,
      secondaryColor: secondColor,
      logoUrl: finalLogoUrl,
    });

    if (!result.club) {
      setMessage(result.errorMessage ?? "Nepodařilo se upravit tým.");
      setSaving(false);
      return;
    }

    setLogoFile(null);
    setRemoveLogo(false);
    setMessage("Tým byl upraven.");
    onUpdated(result.club);
    setSaving(false);
  };

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={styles.card}>
        <h2 style={styles.screenTitle}>Edit týmu</h2>

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
                    Změnit logo z galerie
                  </div>
                  <div style={{ fontSize: "13px", color: "#b9c4bb", marginTop: "4px" }}>
                    Nahraj nové logo týmu
                  </div>
                </div>
              </div>
            </label>

            {(logoPreviewUrl || club.logo_url) && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                style={{
                  marginTop: "10px",
                  width: "100%",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  background: "rgba(198,40,40,0.95)",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Odebrat logo
              </button>
            )}
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
                  value={mainColor}
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
                <span style={{ color: "#b9c4bb", fontSize: "14px" }}>{mainColor}</span>
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
                  value={secondColor}
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
                <span style={{ color: "#b9c4bb", fontSize: "14px" }}>{secondColor}</span>
              </div>
            </label>
          </div>

          <div style={previewStyle}>
            <div
              style={{
                width: "74px",
                height: "74px",
                borderRadius: "18px",
                overflow: "hidden",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt="Logo týmu"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ color: "#d7e6d7", fontSize: "12px", textAlign: "center" }}>
                  Bez loga
                </span>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", opacity: 0.85 }}>Náhled týmu</div>
              <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "4px" }}>
                {teamName.trim() || "Tvůj tým"}
              </div>
              <div style={{ fontSize: "13px", opacity: 0.9, marginTop: "6px" }}>
                {hasBTeam ? "A-tým + B-tým" : "Jeden tým"}
              </div>
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
            type="button"
            style={{
              ...styles.primaryButton,
              marginTop: 0,
              background: primaryColor,
              border: "none",
              opacity: saving || logoUploading ? 0.7 : 1,
            }}
            onClick={handleSave}
            disabled={saving || logoUploading}
          >
            {logoUploading
              ? "Nahrávám logo..."
              : saving
              ? "Ukládám změny..."
              : "Uložit změny"}
          </button>
        </div>
      </div>

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
    </div>
  );
}