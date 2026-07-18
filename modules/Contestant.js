import {
  PERSONALITY_TYPES,
  clamp,
  randomInt,
  pickRandom,
  uid,
  formatRelationship
} from './utils.js';

/**
 * Represents a houseguest with stats, relationships, and game state.
 */
export class Contestant {
  constructor({
    id,
    name,
    isPlayer = false,
    personality = null,
    stats = {},
    difficultyBonus = 0
  }) {
    this.id = id || uid('guest');
    this.name = name;
    this.isPlayer = isPlayer;
    this.personality = personality || pickRandom(PERSONALITY_TYPES);
    this.evicted = false;
    this.evictedWeek = null;

    // Core stats (1-10)
    this.loyalty = stats.loyalty ?? this._rollStat(4, 8, difficultyBonus);
    this.intelligence = stats.intelligence ?? this._rollStat(4, 8, difficultyBonus);
    this.social = stats.social ?? this._rollStat(4, 8, difficultyBonus);
    this.competition = stats.competition ?? this._rollStat(4, 8, difficultyBonus);
    this.aggression = stats.aggression ?? this._rollStat(3, 7, difficultyBonus);

    this._applyPersonalityModifiers();

    // Game state
    this.relationships = {}; // id -> score (-100 to 100)
    this.trust = 50; // house-wide trust in this person
    this.threat = 10;
    this.reputation = 50; // how the house perceives them
    this.allianceId = null;
    this.promises = []; // { targetId, type, week, kept }
    this.secretsKnown = []; // narrative intel
    this.isHOH = false;
    this.isNominated = false;
    this.hasVeto = false;
    this.votesReceived = 0;

    // Memory of events for AI
    this.grudges = []; // { againstId, reason, intensity }
    this.betrayals = []; // { byId, week }
  }

  _rollStat(min, max, bonus) {
    return clamp(randomInt(min, max) + bonus, 1, 10);
  }

  _applyPersonalityModifiers() {
    const p = this.personality;
    if (p.socialBonus) this.social = clamp(this.social + p.socialBonus, 1, 10);
    if (p.socialMod) this.social = clamp(this.social + p.socialMod, 1, 10);
    if (p.competitionBonus) this.competition = clamp(this.competition + p.competitionBonus, 1, 10);
    if (p.competitionMod) this.competition = clamp(this.competition + p.competitionMod, 1, 10);
    if (p.intelligenceBonus) this.intelligence = clamp(this.intelligence + p.intelligenceBonus, 1, 10);
    if (p.loyaltyBonus) this.loyalty = clamp(this.loyalty + p.loyaltyBonus, 1, 10);
    if (p.aggressionBonus) this.aggression = clamp(this.aggression + p.aggressionBonus, 1, 10);
    if (p.aggressionMod) this.aggression = clamp(this.aggression + p.aggressionMod, 1, 10);
  }

  /** Initialize neutral relationships with all other contestants. */
  initRelationships(others, startingTrust = 0) {
    for (const other of others) {
      if (other.id !== this.id) {
        const variance = randomInt(-15, 15);
        this.relationships[other.id] = startingTrust + variance;
      }
    }
  }

  getRelationship(targetId) {
    return this.relationships[targetId] ?? 0;
  }

  modifyRelationship(targetId, delta) {
    const current = this.getRelationship(targetId);
    this.relationships[targetId] = clamp(current + delta, -100, 100);
  }

  /** Update threat based on competition wins, alliances, and social standing. */
  recalculateThreat(house) {
    let threat = 10;
    if (this.isHOH) threat += 15;
    if (this.hasVeto) threat += 10;
    threat += this.competition * 2;
    threat += Math.max(0, (this.reputation - 50) / 5);
    threat += this.aggression;

    const alliance = house.alliances.find((a) => a.id === this.allianceId);
    if (alliance && alliance.members.length >= 3) threat += 8;

    const avgRel = this._averageRelationship(house);
    if (avgRel > 30) threat += 10;
    if (avgRel < -20) threat -= 5;

    this.threat = clamp(Math.round(threat), 0, 100);
  }

  _averageRelationship(house) {
    const active = house.getActiveContestants().filter((c) => c.id !== this.id);
    if (active.length === 0) return 0;
    const sum = active.reduce((acc, c) => acc + this.getRelationship(c.id), 0);
    return sum / active.length;
  }

  addGrudge(againstId, reason, intensity = 20) {
    const existing = this.grudges.find((g) => g.againstId === againstId);
    if (existing) {
      existing.intensity = clamp(existing.intensity + intensity, 0, 100);
    } else {
      this.grudges.push({ againstId, reason, intensity });
    }
    this.modifyRelationship(againstId, -intensity);
  }

  recordBetrayal(byId, week) {
    this.betrayals.push({ byId, week });
    this.addGrudge(byId, 'betrayal', 30);
    this.trust = clamp(this.trust - 15, 0, 100);
  }

  makePromise(targetId, type, week) {
    this.promises.push({ targetId, type, week, kept: null });
  }

  breakPromise(targetId) {
    const promise = this.promises.find((p) => p.targetId === targetId && p.kept === null);
    if (promise) promise.kept = false;
  }

  keepPromise(targetId) {
    const promise = this.promises.find((p) => p.targetId === targetId && p.kept === null);
    if (promise) promise.kept = true;
  }

  /** Serialize for save/load. */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      isPlayer: this.isPlayer,
      personality: this.personality,
      evicted: this.evicted,
      evictedWeek: this.evictedWeek,
      loyalty: this.loyalty,
      intelligence: this.intelligence,
      social: this.social,
      competition: this.competition,
      aggression: this.aggression,
      relationships: { ...this.relationships },
      trust: this.trust,
      threat: this.threat,
      reputation: this.reputation,
      allianceId: this.allianceId,
      promises: [...this.promises],
      secretsKnown: [...this.secretsKnown],
      isHOH: this.isHOH,
      isNominated: this.isNominated,
      hasVeto: this.hasVeto,
      votesReceived: this.votesReceived,
      grudges: [...this.grudges],
      betrayals: [...this.betrayals]
    };
  }

  static fromJSON(data) {
    const c = new Contestant({
      id: data.id,
      name: data.name,
      isPlayer: data.isPlayer,
      personality: data.personality,
      stats: {
        loyalty: data.loyalty,
        intelligence: data.intelligence,
        social: data.social,
        competition: data.competition,
        aggression: data.aggression
      }
    });
    Object.assign(c, {
      evicted: data.evicted,
      evictedWeek: data.evictedWeek,
      relationships: { ...data.relationships },
      trust: data.trust,
      threat: data.threat,
      reputation: data.reputation,
      allianceId: data.allianceId,
      promises: [...data.promises],
      secretsKnown: [...data.secretsKnown],
      isHOH: data.isHOH,
      isNominated: data.isNominated,
      hasVeto: data.hasVeto,
      votesReceived: data.votesReceived,
      grudges: [...data.grudges],
      betrayals: [...data.betrayals]
    });
    return c;
  }

  getRelationshipLabel(targetId) {
    return formatRelationship(this.getRelationship(targetId));
  }
}
