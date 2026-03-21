export type Match = {
  date: string;
  opponent: string;
  team: "A" | "B";
  status: "planned" | "played";
  score?: string;
};

export const matches: Match[] = [
  {
    date: "22.03.2026",
    opponent: "FC Jerigo 1994 Plzeň",
    team: "A",
    status: "planned",
  },
  {
    date: "28.03.2026",
    opponent: "FC 11° Excelent B Doubr Hůd",
    team: "A",
    status: "planned",
  },
];