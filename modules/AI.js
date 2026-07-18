import { statCheck, weightedPick, pickRandom, randomInt, clamp } from './utils.js';

/**
 * Autonomous AI decision-making for alliances, social moves, nominations, and votes.
 */
export class AIController {
  constructor(gameState) {
    this.state = gameState;
  }

  /** Run background AI activity during social phase. */
  runSocialPhase() {
    const events = [];
    const ais = this.state.getActiveContestants().filter((c) => !c.isPlayer);

    for (const ai of ais) {
      const action = this._chooseSocialAction(ai);
      const result = this._executeSocialAction(ai, action);
      if (result) events.push(result);
    }

    // Random alliance formation
    if (Math.random() < 0.35) {
      const formation = this._tryFormAlliance();
      if (formation) events.push(formation);
    }

    // Random betrayal chance
    if (Math.random() < 0.15 && this.state.week > 1) {
      const betrayal = this._tryBetrayal();
      if (betrayal) events.push(betrayal);
    }

    this.state.updateThreatLevels();
    return events;
  }

  _chooseSocialAction(ai) {
    const strategy = ai.personality.strategy;
    const roll = Math.random();

    if (strategy === 'befriend' && roll < 0.5) return 'befriend';
    if (strategy === 'attack' && roll < 0.45) return 'campaign';
    if (strategy === 'manipulate' && roll < 0.4) return 'gather_intel';
    if (strategy === 'ally' && roll < 0.35) return 'strengthen_alliance';
    if (strategy === 'chaos' && roll < 0.3) return pickRandom(['spread_rumor', 'campaign', 'befriend']);
    if (strategy === 'survive' && roll < 0.25) return 'lay_low';
    if (strategy === 'win' && roll < 0.3) return 'train';

    return pickRandom(['befriend', 'campaign', 'lay_low', 'gather_intel']);
  }

  _executeSocialAction(ai, action) {
    const others = this.state.getOthers(ai);
    if (others.length === 0) return null;

    switch (action) {
      case 'befriend': {
        const target = this._pickBefriendTarget(ai, others);
        const delta = randomInt(3, 8) + Math.floor(ai.social / 3);
        ai.modifyRelationship(target.id, delta);
        target.modifyRelationship(ai.id, delta - randomInt(0, 3));
        ai.reputation = clamp(ai.reputation + 1, 0, 100);
        return {
          type: 'social',
          text: `${ai.name} spent time bonding with ${target.name} by the pool.`
        };
      }
      case 'campaign': {
        const target = this._pickCampaignTarget(ai, others);
        const delta = randomInt(5, 12);
        for (const other of others) {
          if (other.id !== target.id) {
            const influence = ai.social + ai.aggression - 5;
            if (Math.random() < influence / 15) {
              other.modifyRelationship(target.id, -Math.floor(delta / 2));
            }
          }
        }
        target.reputation = clamp(target.reputation - 5, 0, 100);
        return {
          type: 'drama',
          text: `${ai.name} has been quietly campaigning against ${target.name} in the house.`
        };
      }
      case 'gather_intel': {
        const target = pickRandom(others);
        const secret = `overheard_${target.id}_week${this.state.week}`;
        if (!ai.secretsKnown.includes(secret)) {
          ai.secretsKnown.push(secret);
        }
        return {
          type: 'narrative',
          text: `${ai.name} was seen listening in on ${target.name}'s conversation.`
        };
      }
      case 'strengthen_alliance': {
        if (ai.allianceId) {
          const alliance = this.state.alliances.find((a) => a.id === ai.allianceId);
          if (alliance) {
            for (const memberId of alliance.members) {
              if (memberId !== ai.id) {
                const member = this.state.getContestant(memberId);
                if (member) {
                  ai.modifyRelationship(memberId, randomInt(2, 6));
                  member.modifyRelationship(ai.id, randomInt(2, 5));
                }
              }
            }
            return {
              type: 'narrative',
              text: `${ai.name} reinforced their alliance commitments in a late-night meeting.`
            };
          }
        }
        return null;
      }
      case 'spread_rumor': {
        const victim = pickRandom(others);
        const spreader = pickRandom(others.filter((o) => o.id !== victim.id));
        if (spreader) {
          spreader.modifyRelationship(victim.id, -randomInt(5, 15));
          return {
            type: 'drama',
            text: `A rumor about ${victim.name} is spreading through the house.`
          };
        }
        return null;
      }
      case 'lay_low': {
        ai.threat = clamp(ai.threat - 3, 0, 100);
        return {
          type: 'system',
          text: `${ai.name} kept a low profile today.`
        };
      }
      case 'train': {
        ai.competition = clamp(ai.competition + 1, 1, 10);
        return {
          type: 'narrative',
          text: `${ai.name} was up early training for the next competition.`
        };
      }
      default:
        return null;
    }
  }

  _pickBefriendTarget(ai, others) {
    return weightedPick(others, (o) => {
      let weight = 10 - o.threat / 10;
      weight += ai.getRelationship(o.id) / 10;
      if (o.allianceId === ai.allianceId && ai.allianceId) weight += 15;
      return Math.max(1, weight);
    });
  }

  _pickCampaignTarget(ai, others) {
    return weightedPick(others, (o) => o.threat + o.aggression + Math.max(0, -ai.getRelationship(o.id) / 5));
  }

  _tryFormAlliance() {
    const ais = this.state.getActiveContestants().filter((c) => !c.isPlayer && !c.allianceId);
    if (ais.length < 2) return null;

    const strategists = ais.filter((a) => ['strategist', 'loyalist', 'social'].includes(a.personality.id));
    const leaderPool = strategists.length > 0 ? strategists : ais;
    const leader = pickRandom(leaderPool);
    if (!leader) return null;

    const candidates = this.state.getOthers(leader).filter((c) => !c.allianceId && !c.isPlayer);
    if (candidates.length === 0) return null;

    const member = weightedPick(candidates, (c) => {
      return 10 + leader.getRelationship(c.id) / 5 + (c.personality.id === 'loyalist' ? 10 : 0);
    });

    if (leader.getRelationship(member.id) < 5 && Math.random() > 0.3) return null;

    const alliance = this.state.createAlliance(leader.id, [member.id]);
    leader.modifyRelationship(member.id, 15);
    member.modifyRelationship(leader.id, 12);

    return {
      type: 'drama',
      text: `${leader.name} and ${member.name} seem to be forming a secret alliance.`
    };
  }

  _tryBetrayal() {
    const alliances = this.state.alliances.filter((a) => a.members.length >= 2);
    if (alliances.length === 0) return null;

    const alliance = pickRandom(alliances);
    const members = alliance.members.map((id) => this.state.getContestant(id)).filter(Boolean);
    const aiMembers = members.filter((m) => !m.isPlayer);
    if (aiMembers.length < 2) return null;

    const leader = this.state.getContestant(alliance.leaderId);
    const betrayerCandidates = aiMembers.filter((m) => m.id !== leader?.id);
    const betrayer = betrayerCandidates.length > 0
      ? pickRandom(betrayerCandidates)
      : pickRandom(aiMembers);

    return this._executeBetrayal(betrayer, alliance);
  }

  _executeBetrayal(betrayer, alliance) {
    const otherMembers = alliance.members.filter((id) => id !== betrayer.id);
    const victimId = pickRandom(otherMembers);
    const victim = this.state.getContestant(victimId);
    if (!victim) return null;

    this.state.removeFromAlliance(betrayer.id);
    victim.recordBetrayal(betrayer.id, this.state.week);
    betrayer.reputation = clamp(betrayer.reputation - 10, 0, 100);

    return {
      type: 'drama',
      text: `${betrayer.name} betrayed their alliance with ${victim.name}! The house is reeling.`
    };
  }

  /** AI chooses nomination targets when AI is HOH. */
  chooseNominations(hoh) {
    const others = this.state.getOthers(hoh);
    if (others.length === 0) return [];
    if (others.length === 1) return [others[0]];

    const sorted = [...others].sort((a, b) => {
      const scoreA = this._nominationScore(hoh, a);
      const scoreB = this._nominationScore(hoh, b);
      return scoreB - scoreA;
    });

    const first = sorted[0];
    const second = sorted.find((c) => c.id !== first.id);
    return second ? [first, second] : [first];
  }

  _nominationScore(hoh, target) {
    let score = target.threat;
    score += Math.max(0, -hoh.getRelationship(target.id) / 3);
    score += target.aggression;

    if (target.allianceId && target.allianceId !== hoh.allianceId) {
      score += 10;
    }
    if (hoh.allianceId && target.allianceId === hoh.allianceId) {
      score -= 25;
    }

    const grudge = hoh.grudges.find((g) => g.againstId === target.id);
    if (grudge) score += grudge.intensity / 3;

    return score;
  }

  /** AI decides eviction vote with reasoning. */
  decideVote(voter, nominees) {
    const reasons = [];
    let target = nominees[0];
    let bestScore = -Infinity;

    for (const nominee of nominees) {
      let score = 0;
      const rel = voter.getRelationship(nominee.id);
      score -= rel / 5;
      score += nominee.threat / 5;

      const grudge = voter.grudges.find((g) => g.againstId === nominee.id);
      if (grudge) {
        score += grudge.intensity / 4;
        reasons.push(`grudge against ${nominee.name}`);
      }

      if (voter.allianceId && nominee.allianceId === voter.allianceId) {
        score -= 30;
        reasons.push(`alliance member ${nominee.name} is protected`);
      }

      if (voter.allianceId && nominee.allianceId && nominee.allianceId !== voter.allianceId) {
        score += 15;
        reasons.push(`rival alliance target`);
      }

      if (rel < -20) {
        score += 10;
        reasons.push(`poor relationship with ${nominee.name}`);
      }
      if (rel > 30) {
        score -= 15;
        reasons.push(`close with ${nominee.name}`);
      }

      if (nominee.aggression > 7) {
        score += 5;
        reasons.push(`${nominee.name} is too aggressive`);
      }

      // Honor or punish broken promises
      const promiseToNominee = voter.promises.find(
        (p) => p.targetId === nominee.id && p.kept === null
      );
      if (promiseToNominee) {
        score -= 20;
        reasons.push(`promised safety to ${nominee.name}`);
      }
      const brokenByNominee = nominee.promises.find(
        (p) => p.targetId === voter.id && p.kept === false
      );
      if (brokenByNominee) {
        score += 15;
        reasons.push(`${nominee.name} broke a promise`);
      }

      // Strategists target bigger threats rather than bandwagoning
      if (voter.personality.strategy === 'manipulate') {
        score += nominee.threat / 4;
      }

      if (score > bestScore) {
        bestScore = score;
        target = nominee;
      }
    }

    const reasonText = reasons.length > 0
      ? reasons.slice(0, 2).join('; ')
      : `${target.name} is the bigger threat`;

    return { target, reason: reasonText };
  }

  /** AI uses veto decision. */
  decideVetoUse(holder, nominees) {
    const ally = nominees.find((n) => n.allianceId && n.allianceId === holder.allianceId);
    if (ally && holder.getRelationship(ally.id) > 10) {
      return { use: true, target: ally };
    }
    if (holder.isNominated && Math.random() < 0.85) {
      return { use: true, target: holder };
    }
    if (holder.personality.strategy === 'survive' && holder.getRelationship(nominees[0].id) < -10) {
      return { use: false, target: null };
    }
    return { use: Math.random() < 0.25, target: nominees[0] };
  }

  /** AI picks veto replacement nominee. */
  chooseVetoReplacement(hoh, currentNominees) {
    const others = this.state.getOthers(hoh).filter((c) => !currentNominees.some((n) => n.id === c.id));
    if (others.length === 0) return null;
    return weightedPick(others, (c) => this._nominationScore(hoh, c));
  }
}
