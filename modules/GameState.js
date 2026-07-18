import { Contestant } from './Contestant.js';
import {
  DIFFICULTY_CONFIG,
  generateAINames,
  pickRandom,
  shuffle,
  uid,
  resetIdCounter
} from './utils.js';

/** Game phases within a week. */
export const PHASES = {
  SOCIAL: 'social',
  COMPETITION: 'competition',
  NOMINATION: 'nomination',
  VETO: 'veto',
  EVICTION: 'eviction',
  WEEK_END: 'week_end'
};

export const PHASE_LABELS = {
  [PHASES.SOCIAL]: 'Social Phase',
  [PHASES.COMPETITION]: 'Competition',
  [PHASES.NOMINATION]: 'Nomination Ceremony',
  [PHASES.VETO]: 'Veto / Power Event',
  [PHASES.EVICTION]: 'Eviction Vote',
  [PHASES.WEEK_END]: 'Week Summary'
};

/**
 * Central game state: contestants, week progression, alliances, and history.
 */
export class GameState {
  constructor({ playerName, difficulty = 'normal', aiCount = 10 } = {}) {
    this.difficulty = difficulty;
    this.config = DIFFICULTY_CONFIG[difficulty];
    this.week = 1;
    this.day = 1;
    this.phase = PHASES.SOCIAL;
    this.actionsRemaining = this.config.actionsPerDay;
    this.maxDaysPerWeek = 5;

    this.contestants = [];
    this.alliances = [];
    this.history = [];
    this.storyLog = [];

    this.currentHOH = null;
    this.nominees = [];
    this.vetoUsed = false;
    this.vetoReplacements = [];
    this.evictedThisWeek = null;
    this.competitionWinner = null;
    this.lastCompetitionType = null;
    this.currentCompetition = null;
    this.challengeData = null;
    this.playerIntel = []; // secrets player has learned
    this.gameOver = false;
    this.winner = null;

    this._initContestants(playerName, aiCount);
  }

  _initContestants(playerName, aiCount) {
    const aiNames = generateAINames(aiCount);
    const player = new Contestant({
      name: playerName || 'You',
      isPlayer: true,
      personality: { id: 'player', name: 'Player', strategy: 'custom' },
      stats: {
        loyalty: 6,
        intelligence: 6,
        social: 6 + this.config.playerSocialBonus,
        competition: 6,
        aggression: 4
      }
    });

    const aiContestants = aiNames.map((name) => new Contestant({
      name,
      difficultyBonus: this.config.aiStatBonus
    }));

    // Aggression modifier from difficulty
    for (const ai of aiContestants) {
      ai.aggression = Math.max(1, Math.min(10, ai.aggression + this.config.aiAggressionMod));
    }

    this.contestants = shuffle([player, ...aiContestants]);
    const all = this.contestants;
    for (const c of all) {
      c.initRelationships(all, this.config.startingTrust);
    }
  }

  getPlayer() {
    return this.contestants.find((c) => c.isPlayer);
  }

  getActiveContestants() {
    return this.contestants.filter((c) => !c.evicted);
  }

  getContestant(id) {
    return this.contestants.find((c) => c.id === id);
  }

  getOthers(contestant) {
    return this.getActiveContestants().filter((c) => c.id !== contestant.id);
  }

  addStory(text, type = 'narrative') {
    const entry = { text, type, week: this.week, day: this.day, phase: this.phase };
    this.storyLog.push(entry);
    return entry;
  }

  addHistory(event) {
    this.history.push({ ...event, week: this.week, day: this.day });
  }

  /** Create a new alliance. */
  createAlliance(leaderId, memberIds, name = null) {
    const alliance = {
      id: uid('alliance'),
      name: name || `Alliance ${this.alliances.length + 1}`,
      leaderId,
      members: [...new Set([leaderId, ...memberIds])],
      trust: 70,
      exposed: false
    };
    this.alliances.push(alliance);
    for (const id of alliance.members) {
      const c = this.getContestant(id);
      if (c) c.allianceId = alliance.id;
    }
    return alliance;
  }

  removeFromAlliance(contestantId) {
    const c = this.getContestant(contestantId);
    if (!c || !c.allianceId) return;
    const alliance = this.alliances.find((a) => a.id === c.allianceId);
    c.allianceId = null;
    if (alliance) {
      alliance.members = alliance.members.filter((id) => id !== contestantId);
      if (alliance.members.length < 2) {
        this.alliances = this.alliances.filter((a) => a.id !== alliance.id);
        for (const id of alliance.members) {
          const member = this.getContestant(id);
          if (member) member.allianceId = null;
        }
      }
    }
  }

  /** Recalculate threat for all active contestants. */
  updateThreatLevels() {
    for (const c of this.getActiveContestants()) {
      c.recalculateThreat(this);
    }
  }

  resetWeeklyFlags() {
    for (const c of this.getActiveContestants()) {
      c.isHOH = false;
      c.isNominated = false;
      c.hasVeto = false;
      c.votesReceived = 0;
    }
    this.nominees = [];
    this.vetoUsed = false;
    this.vetoReplacements = [];
    this.evictedThisWeek = null;
    this.competitionWinner = null;
    this.currentHOH = null;
  }

  advancePhase() {
    const order = [
      PHASES.SOCIAL,
      PHASES.COMPETITION,
      PHASES.NOMINATION,
      PHASES.VETO,
      PHASES.EVICTION,
      PHASES.WEEK_END
    ];
    const idx = order.indexOf(this.phase);
    if (idx < order.length - 1) {
      this.phase = order[idx + 1];
      return true;
    }
    return false;
  }

  startNewWeek() {
    this.week += 1;
    this.day = 1;
    this.phase = PHASES.SOCIAL;
    this.actionsRemaining = this.config.actionsPerDay;
    this.resetWeeklyFlags();
  }

  checkWinCondition(allowFinalTwo = true) {
    const active = this.getActiveContestants();
    if (active.length === 1) {
      this.gameOver = true;
      this.winner = active[0];
      return true;
    }
    if (allowFinalTwo && active.length === 2) {
      const [a, b] = active;
      const scoreA = a.competition * 2 + a.social + a.reputation / 10;
      const scoreB = b.competition * 2 + b.social + b.reputation / 10;
      this.gameOver = true;
      this.winner = scoreA >= scoreB ? a : b;
      return true;
    }
    return false;
  }

  toJSON() {
    return {
      difficulty: this.difficulty,
      week: this.week,
      day: this.day,
      phase: this.phase,
      actionsRemaining: this.actionsRemaining,
      maxDaysPerWeek: this.maxDaysPerWeek,
      contestants: this.contestants.map((c) => c.toJSON()),
      alliances: this.alliances,
      history: this.history,
      storyLog: this.storyLog,
      currentHOH: this.currentHOH?.id ?? this.currentHOH,
      nominees: this.nominees,
      vetoUsed: this.vetoUsed,
      vetoReplacements: this.vetoReplacements,
      evictedThisWeek: this.evictedThisWeek,
      competitionWinner: this.competitionWinner?.id ?? this.competitionWinner,
      lastCompetitionType: this.lastCompetitionType,
      currentCompetition: this.currentCompetition,
      challengeData: this.challengeData,
      playerIntel: this.playerIntel,
      gameOver: this.gameOver,
      winner: this.winner ? this.winner.id : null
    };
  }

  static fromJSON(data) {
    resetIdCounter(1000);
    const state = Object.create(GameState.prototype);
    state.difficulty = data.difficulty;
    state.config = DIFFICULTY_CONFIG[data.difficulty];
    state.week = data.week;
    state.day = data.day;
    state.phase = data.phase;
    state.actionsRemaining = data.actionsRemaining;
    state.maxDaysPerWeek = data.maxDaysPerWeek;
    state.contestants = data.contestants.map((c) => Contestant.fromJSON(c));
    state.alliances = data.alliances;
    state.history = data.history;
    state.storyLog = data.storyLog;
    state.currentHOH = data.currentHOH
      ? state.contestants.find((c) => c.id === data.currentHOH) || data.currentHOH
      : null;
    state.nominees = data.nominees;
    state.vetoUsed = data.vetoUsed;
    state.vetoReplacements = data.vetoReplacements;
    state.evictedThisWeek = data.evictedThisWeek;
    state.competitionWinner = data.competitionWinner
      ? state.contestants.find((c) => c.id === data.competitionWinner) || null
      : null;
    state.lastCompetitionType = data.lastCompetitionType;
    state.currentCompetition = data.currentCompetition || null;
    state.challengeData = data.challengeData || null;
    state.playerIntel = data.playerIntel;
    state.gameOver = data.gameOver;
    state.winner = data.winner ? state.contestants.find((c) => c.id === data.winner) : null;
    return state;
  }
}
