import { pickRandom, randomInt, clamp } from './utils.js';

/**
 * Narrative event generator — random drama, intel reveals, and reputation shifts.
 */
export class NarrativeEngine {
  constructor(gameState) {
    this.state = gameState;
  }

  /** Generate a random daily event. */
  generateDailyEvent() {
    const roll = Math.random();
    if (roll < 0.25) return this._intelEvent();
    if (roll < 0.45) return this._dramaEvent();
    if (roll < 0.6) return this._allianceConflict();
    if (roll < 0.75) return this._reputationEvent();
    return this._ambientEvent();
  }

  _intelEvent() {
    const player = this.state.getPlayer();
    const active = this.state.getActiveContestants().filter((c) => !c.isPlayer);
    if (active.length < 2) return null;

    const informant = pickRandom(active);
    const subject = pickRandom(active.filter((c) => c.id !== informant.id));
    const events = [
      `${informant.name} pulled you aside and revealed that ${subject.name} has been campaigning against you.`,
      `${informant.name} whispered that ${subject.name}'s alliance is targeting you next week.`,
      `You overheard ${informant.name} and ${subject.name} arguing about loyalty in the house.`,
      `${informant.name} shared that ${subject.name} made a secret deal with the current HOH.`
    ];

    const text = pickRandom(events);
    this.state.playerIntel.push({
      week: this.state.week,
      about: subject.id,
      from: informant.id,
      text
    });

    informant.modifyRelationship(player.id, randomInt(3, 8));
    return { type: 'warning', text };
  }

  _dramaEvent() {
    const active = this.state.getActiveContestants().filter((c) => !c.isPlayer);
    if (active.length < 2) return null;

    const a = pickRandom(active);
    const b = pickRandom(active.filter((c) => c.id !== a.id));

    const dramas = [
      `${a.name} and ${b.name} had a blowout argument at the dinner table.`,
      `${a.name} accused ${b.name} of throwing the last competition.`,
      `Tension erupted when ${a.name} called out ${b.name} for playing both sides.`,
      `The house is divided after ${a.name} exposed ${b.name}'s two-faced gameplay.`
    ];

    a.modifyRelationship(b.id, -randomInt(10, 20));
    b.modifyRelationship(a.id, -randomInt(8, 18));
    a.reputation = clamp(a.reputation - 3, 0, 100);
    b.reputation = clamp(b.reputation - 3, 0, 100);

    return { type: 'drama', text: pickRandom(dramas) };
  }

  _allianceConflict() {
    const alliances = this.state.alliances.filter((a) => a.members.length >= 2);
    if (alliances.length === 0) {
      return {
        type: 'narrative',
        text: 'Houseguests are scrambling to form alliances before the next eviction.'
      };
    }

    const alliance = pickRandom(alliances);
    const members = alliance.members.map((id) => this.state.getContestant(id)).filter(Boolean);
    if (members.length < 2) return null;

    const conflict = pickRandom([
      `Your alliance is fracturing — members are questioning ${this.state.getContestant(alliance.leaderId)?.name}'s leadership.`,
      `Someone in an alliance was caught sharing secrets with the opposing side.`,
      `An alliance meeting turned heated when two members disagreed on nomination targets.`,
      `The house is divided after an alliance blindsided a major competitor.`
    ]);

    alliance.trust = clamp(alliance.trust - randomInt(5, 15), 0, 100);

    if (Math.random() < 0.2) {
      alliance.exposed = true;
      for (const m of members) {
        m.threat = clamp(m.threat + 5, 0, 100);
      }
    }

    const player = this.state.getPlayer();
    if (player.allianceId === alliance.id) {
      return { type: 'drama', text: conflict };
    }
    return { type: 'narrative', text: 'Alliances are shifting behind the scenes.' };
  }

  _reputationEvent() {
    const active = this.state.getActiveContestants();
    const target = pickRandom(active);
    const delta = randomInt(-8, 8);
    target.reputation = clamp(target.reputation + delta, 0, 100);

    if (target.isPlayer) {
      return {
        type: delta > 0 ? 'success' : 'warning',
        text: delta > 0
          ? 'Your genuine moments this week improved how the house sees you.'
          : 'Some houseguests are starting to see you as a threat.'
      };
    }

    return {
      type: 'narrative',
      text: delta > 0
        ? `${target.name}'s reputation in the house is rising.`
        : `${target.name} is losing favor with the house.`
    };
  }

  _ambientEvent() {
    const events = [
      'The house is quiet today — everyone seems to be strategizing.',
      'Production delivered a luxury basket. Spirits are high.',
      'Rain kept everyone inside, intensifying the cabin fever.',
      'A letter from home reduced several houseguests to tears.',
      'Whispers in the hallway suggest a major move is coming.',
      'The backyard is off-limits, forcing everyone into close quarters.'
    ];
    return { type: 'system', text: pickRandom(events) };
  }

  /** Generate endgame summary for winner/loser. */
  generateEndgameSummary() {
    const player = this.state.getPlayer();
    const winner = this.state.winner;
    const won = winner && winner.isPlayer;

    const sections = [];

    if (won) {
      sections.push(`<p class="winner-name">You won!</p>`);
      sections.push(`<p>After ${this.state.week} weeks of manipulation, competition, and survival, you outlasted everyone and claimed the title.</p>`);
      sections.push('<h3>Why You Won</h3>');
      const reasons = [];
      if (player.social >= 7) reasons.push('Your social game kept you off the block.');
      if (player.competition >= 7) reasons.push('Competition wins shielded you at critical moments.');
      if (this.state.alliances.some((a) => a.members.includes(player.id))) {
        reasons.push('Strategic alliances provided cover when you needed it most.');
      }
      if (player.threat < 40) reasons.push('You managed your threat level expertly.');
      if (reasons.length === 0) reasons.push('You survived by adapting when others could not.');
      sections.push(`<p>${reasons.join(' ')}</p>`);
    } else {
      sections.push(`<p class="winner-name">${winner?.name || 'Unknown'} wins!</p>`);
      sections.push(`<p>You were evicted in Week ${player.evictedWeek || this.state.week}. ${winner?.name} played a stronger endgame.</p>`);
      sections.push('<h3>What Went Wrong</h3>');
      const reasons = [];
      if (player.threat > 60) reasons.push('You were perceived as too big a threat.');
      if (player.aggression > 7) reasons.push('Your aggressive gameplay made you a target.');
      if (player.reputation < 40) reasons.push('The house lost trust in you.');
      const avgRel = this._avgRelationships(player);
      if (avgRel < 0) reasons.push('You failed to build enough genuine relationships.');
      if (reasons.length === 0) reasons.push('The numbers simply did not fall your way.');
      sections.push(`<p>${reasons.join(' ')}</p>`);
    }

    sections.push('<h3>Season Highlights</h3>');
    const evicted = this.state.contestants.filter((c) => c.evicted).length;
    sections.push(`<p>${evicted} houseguests were evicted over ${this.state.week} weeks. ${this.state.alliances.length} alliances formed and crumbled.</p>`);

    const dramaEvents = this.state.storyLog.filter((e) => e.type === 'drama').length;
    sections.push(`<p>The house witnessed ${dramaEvents} major dramatic moments.</p>`);

    return sections.join('');
  }

  _avgRelationships(contestant) {
    const others = this.state.getActiveContestants().filter((c) => c.id !== contestant.id);
    if (others.length === 0) return 0;
    return others.reduce((sum, c) => sum + contestant.getRelationship(c.id), 0) / others.length;
  }
}
