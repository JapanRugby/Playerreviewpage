export type MomentumIndexItem = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  hasJapan: boolean;
};

export type MomentumPoint = {
  minute: number;
  matchClock: string;
  rmi: number;
  raw: number;
};

export type MomentumPeak = {
  time?: string;
  matchClock?: string;
  minute?: number;
  team?: string;
  rmi?: number;
  signal?: number;
  reason?: string;
};

export type MomentumMatch = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  hasJapan: boolean;
  series: MomentumPoint[];
  peaks: MomentumPeak[];
};

export type PlayerMomentum = {
  FXID: number;
  team_id: number;
  teamName: string;
  PLID: number;
  playerName: string;
  net_momentum: number;
  momentum_added: number;
  momentum_lost: number;
  events_count: number;
  scoring_threat_player_team: number;
  territory_player_team: number;
  possession_quality_player_team: number;
  contact_breakdown_player_team: number;
  discipline_turnover_player_team: number;
  review_priority: 'Low' | 'Medium' | 'High' | 'Critical' | string;
};

export type MomentumReviewClip = {
  FXID: number;
  sample_id?: string;
  SetNum?: number;
  startSecond: number;
  endSecond: number;
  team: string;
  signal: number;
  reason: string;
  clip_type: string;
  PLID?: number;
  playerName?: string;
};
