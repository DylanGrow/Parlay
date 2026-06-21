// ============================================================
// BetRadar — Type Definitions
// All data pre-computed at build time. Zero runtime API calls.
// ============================================================

export interface BookmakerOdds {
  bookmaker: string;
  bookmakerTitle: string;
  price: number; // American odds integer
  link?: string;
}

export interface ValueBet {
  id: string;
  sport: string;
  sportKey: string;
  sportTitle: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string; // ISO 8601
  outcome: string; // team/player name
  market: string; // "h2h" | "spreads" | "totals"
  marketLabel: string; // human readable
  bestPrice: number; // American odds (best available)
  bestBookmaker: string;
  bestBookmakerTitle: string;
  consensusImpliedProb: number; // 0-1, vig-removed average
  trueOdds: number; // American odds equivalent of consensusImpliedProb
  evPercent: number; // Expected Value as %
  allOdds: BookmakerOdds[];
  point?: number; // spread or total line
  reasoning: string; // human-readable why this is a value bet
}

export interface ParlayLeg {
  bet: ValueBet;
  price: number;
}

export interface Parlay {
  id: string;
  legs: ParlayLeg[];
  combinedAmericanOdds: number;
  combinedDecimalOdds: number;
  impliedProbability: number;
  estimatedEvPercent: number;
  sports: string[];
  reasoning: string;
  tier: 'elite' | 'strong' | 'solid'; // EV quality tier
}

export interface AIAnalysis {
  summary: string;
  topPickId: string; // references a ValueBet ID
  topPickRationale: string;
  parlayAnalysis: string;
  riskRating: 'Low' | 'Medium' | 'High';
  lastUpdated: string;
}

export interface BetsData {
  generatedAt: string; // ISO 8601 UTC
  nextUpdateAt: string; // ISO 8601 UTC — next scheduled build
  activeCreditsUsed: number;
  creditsRemaining: number;
  topValueBets: ValueBet[];
  parlays: Parlay[];
  lastSportsQueried: string[];
  disclaimer: string;
  aiAnalysis?: AIAnalysis;
}

export interface SportSchedule {
  sportKey: string;
  title: string;
  group: string;
  active: boolean;
  hasEvents: boolean;
}
