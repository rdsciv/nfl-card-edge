export type Metrics = {
  week: number | null; targets?: number | null; receptions?: number | null; yards?: number | null;
  carries?: number | null; touches?: number | null; attempts?: number | null;
  targetShare?: number | null; snapShare?: number | null;
};
export type Player = {
  id: string; name: string; team: string; position: string; score: number;
  trend: number; latest: Metrics; baseline: Partial<Metrics>; history: Metrics[];
  reasons: string[]; sourceUrl: string;
};
export type Report = {
  id: string; date: string; kind: string; season: number; week: number; status: string;
  playerCount: number; leaders: { id: string; name: string; score: number }[]; sources: string[];
};
export type NFLData = {
  status: string; season: number | null; week: number | null; completedWeek: number | null;
  partialWeek: boolean; updatedAt: string | null; sourceUrl: string;
  coverage: { players: number; games: number; positions: string[]; missing: string[] };
  players: Player[]; reports: Report[]; jobs: { id: string; date: string; status: string; message: string }[];
  nextRun?: { at: string; local: string; timeZone: string; kind: string };
  methodology?: { baseline: string; targetShare: string; score: string; catalysts: string };
  providers?: { name: string; status: string; sourceUrl: string; retrievedAt?: string }[];
};
export type Card = {
  id: string; playerId: string | null; player: string; year: number; manufacturer: string;
  set: string; cardNumber: string; parallel: string; rookie: boolean;
  verified: boolean; sourceUrl: string; verifiedAt: string;
};
export type OwnedCard = { id: string; player: string; card: string; grade: string; cost: number; proceeds: number | null; status: string };
export type Preferences = {
  budget: number | null; horizon: number | null; risk: string; maxLoss: number | null;
  targetRoi: number | null; exposure: number | null; willingToGrade: string;
};
export const emptyData: NFLData = {
  status: 'unavailable', season: null, week: null, completedWeek: null, partialWeek: false,
  updatedAt: null, sourceUrl: 'https://github.com/nflverse/nflverse-data/releases',
  coverage: { players: 0, games: 0, positions: [], missing: ['Waiting for the first cloud refresh'] },
  players: [], reports: [], jobs: [],
};
export const emptyPreferences: Preferences = { budget: null, horizon: null, risk: '', maxLoss: null, targetRoi: null, exposure: null, willingToGrade: '' };
