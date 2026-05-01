import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cz.myteamhub.app",
  appName: "MyTeamHub",
  webDir: "public",
  server: {
    url: "https://myteamhub.cz",
    cleartext: false,
  },
};

export default config;