import { randomInt, clamp } from './utils.js';

/**
 * Nomination ceremony, veto/power events, and eviction voting.
 */
export class EvictionSystem {
  constructor(gameState, aiController) {
    this.state = gameState;
    this.ai = aiController;
  }

  _getHOH() {
    if (this.state.currentHOH && typeof this.state.currentHOH === 'object') {
      return this.state.currentHOH;
    }
    if (typeof this.state.currentHOH === 'string') {
      return this.state.getContestant(this.state.currentHOH);
    }
    return this.state.getActiveContestants().find((c) => c.isHOH) || null;
  }

  /** Run nomination ceremony — HOH picks 2 nominees. */
  runNominations(playerPicks = null) {
    const results = [];
    const hoh = this._getHOH();

    if (!hoh) {
      results.push({ type: 'system', text: 'No Head of Household found.' });
      return { results, nominees: [] };
    }

    results.push({
      type: 'drama',
      text: `<strong>Nomination Ceremony</strong> — ${hoh.name} must nominate two houseguests for eviction.`
    });

    let nominees;

    if (hoh.isPlayer && playerPicks && playerPicks.length === 2) {
      nominees = playerPicks.map((id) => this.state.getContestant(id)).filter(Boolean);
    } else if (hoh.isPlayer) {
      // Will be handled by player UI — return empty for now
      return { results, nominees: [], needsPlayerInput: true };
    } else {
      nominees = this.ai.chooseNominations(hoh);
    }

    for (const n of nominees) {
      n.isNominated = true;
    }
    this.state.nominees = nominees.map((n) => n.id);

    for (const n of nominees) {
      results.push({
        type: 'drama',
        text: `${hoh.name} nominates <strong>${n.name}</strong> for eviction.`
      });
      n.threat = clamp(n.threat - 5, 0, 100);
    }

    this.state.addHistory({ type: 'nominations', hoh: hoh.id, nominees: this.state.nominees });
    return { results, nominees };
  }

  /** Veto competition / power event. */
  runVetoEvent(playerWonVeto = false) {
    const results = [];
    const contestants = this.state.getActiveContestants();
    const nominees = this.state.nominees.map((id) => this.state.getContestant(id)).filter(Boolean);

    results.push({
      type: 'competition',
      text: '<strong>Power of Veto</strong> — Six players compete for the power to save a nominee.'
    });

    // Select veto players: nominees + HOH + random picks
    const hoh = this._getHOH();
    const vetoPlayers = [...nominees];
    if (hoh && !vetoPlayers.some((p) => p.id === hoh.id)) vetoPlayers.push(hoh);
    while (vetoPlayers.length < Math.min(6, contestants.length)) {
      const extra = contestants.find((c) => !vetoPlayers.some((p) => p.id === c.id));
      if (extra) vetoPlayers.push(extra);
      else break;
    }

    // Determine veto winner
    let vetoWinner;
    const player = this.state.getPlayer();
    const playerInComp = vetoPlayers.some((p) => p.id === player.id);

    if (playerInComp && playerWonVeto) {
      vetoWinner = player;
    } else if (playerInComp && !playerWonVeto) {
      const aiPlayers = vetoPlayers.filter((p) => !p.isPlayer);
      vetoWinner = aiPlayers.reduce((best, c) => (c.competition > best.competition ? c : best), aiPlayers[0]);
    } else {
      vetoWinner = vetoPlayers.reduce((best, c) => {
        const score = c.competition + randomInt(-2, 3);
        const bestScore = best.competition + randomInt(-2, 3);
        return score > bestScore ? c : best;
      }, vetoPlayers[0]);
    }

    vetoWinner.hasVeto = true;
    results.push({
      type: 'success',
      text: `${vetoWinner.name} wins the Power of Veto!`
    });

    // Decide veto usage
    if (vetoWinner.isPlayer) {
      return { results, vetoWinner, needsPlayerInput: true };
    }

    const decision = this.ai.decideVetoUse(vetoWinner, nominees);
    if (decision.use && decision.target) {
      return this._applyVeto(decision.target, results, vetoWinner);
    }

    results.push({
      type: 'narrative',
      text: `${vetoWinner.name} chose not to use the Power of Veto.`
    });
    return { results, vetoWinner, vetoUsed: false };
  }

  /** Player or AI uses veto on a nominee. */
  _applyVeto(savedNominee, results, vetoWinner) {
    savedNominee.isNominated = false;
    this.state.nominees = this.state.nominees.filter((id) => id !== savedNominee.id);
    this.state.vetoUsed = true;

    results.push({
      type: 'success',
      text: `${vetoWinner.name} uses the Veto to save <strong>${savedNominee.name}</strong>!`
    });

    // Replacement nominee
    const hoh = this._getHOH();

    let replacement;
    if (hoh?.isPlayer) {
      return { results, vetoWinner, vetoUsed: true, needsReplacementPick: true, savedNominee };
    }

    replacement = this.ai.chooseVetoReplacement(hoh, this.state.nominees.map((id) => this.state.getContestant(id)));
    if (replacement) {
      replacement.isNominated = true;
      this.state.nominees.push(replacement.id);
      results.push({
        type: 'drama',
        text: `${hoh.name} nominates <strong>${replacement.name}</strong> as the replacement.`
      });
    }

    return { results, vetoWinner, vetoUsed: true };
  }

  /** Apply player veto choice. */
  playerUseVeto(vetoWinner, targetId, useVeto) {
    const nominees = this.state.nominees.map((id) => this.state.getContestant(id)).filter(Boolean);
    const results = [];

    if (!useVeto) {
      results.push({ type: 'narrative', text: 'You chose not to use the Power of Veto.' });
      return { results, vetoUsed: false };
    }

    const target = this.state.getContestant(targetId);
    if (!target) return { results, vetoUsed: false };

    return this._applyVeto(target, results, vetoWinner);
  }

  /** Player picks replacement nominee. */
  playerPickReplacement(replacementId) {
    const results = [];
    const replacement = this.state.getContestant(replacementId);
    if (replacement) {
      replacement.isNominated = true;
      this.state.nominees.push(replacement.id);
      const hoh = this.state.getPlayer();
      results.push({
        type: 'drama',
        text: `${hoh.name} nominates <strong>${replacement.name}</strong> as the replacement.`
      });
    }
    return results;
  }

  /** Run eviction vote with full breakdown. */
  runEvictionVote(playerVoteTarget = null) {
    const results = [];
    const nominees = this.state.nominees.map((id) => this.state.getContestant(id)).filter(Boolean);

    if (nominees.length < 2) {
      results.push({ type: 'system', text: 'Not enough nominees for eviction.' });
      return { results, evicted: null };
    }

    results.push({
      type: 'drama',
      text: '<strong>Eviction Night</strong> — The houseguests cast their votes to evict.'
    });

    const voters = this.state.getActiveContestants().filter((c) => !c.isNominated);
    const voteLog = [];

    for (const voter of voters) {
      let vote;
      if (voter.isPlayer && playerVoteTarget) {
        vote = this.state.getContestant(playerVoteTarget);
      } else if (voter.isPlayer) {
        continue; // Player vote handled separately
      } else {
        const decision = this.ai.decideVote(voter, nominees);
        vote = decision.target;
        voteLog.push({
          voter: voter.name,
          target: vote.name,
          reason: decision.reason
        });
      }

      if (vote) {
        vote.votesReceived += 1;
      }
    }

    // Player vote
    const player = this.state.getPlayer();
    if (!player.isNominated && playerVoteTarget) {
      const vote = this.state.getContestant(playerVoteTarget);
      if (vote) {
        vote.votesReceived += 1;
        voteLog.push({
          voter: player.name,
          target: vote.name,
          reason: 'your strategic choice'
        });
      }
    }

    // Vote breakdown
    results.push({ type: 'system', text: '--- Vote Breakdown ---' });
    for (const log of voteLog) {
      results.push({
        type: 'narrative',
        text: `${log.voter} votes to evict <strong>${log.target}</strong> — ${log.reason}.`
      });
    }

    // Determine evicted (most votes; tie = random)
    let evicted = nominees[0];
    for (const n of nominees) {
      if (n.votesReceived > evicted.votesReceived) evicted = n;
    }

    const tied = nominees.filter((n) => n.votesReceived === evicted.votesReceived);
    if (tied.length > 1) {
      evicted = tied[Math.floor(Math.random() * tied.length)];
      results.push({ type: 'warning', text: 'It\'s a tie! The HOH breaks the tie.' });
    }

    evicted.evicted = true;
    evicted.evictedWeek = this.state.week;
    evicted.isNominated = false;
    this.state.evictedThisWeek = evicted.id;

    results.push({
      type: 'drama',
      text: `<strong>${evicted.name} has been evicted from the house.</strong> (${evicted.votesReceived} votes)`
    });

    if (evicted.isPlayer) {
      results.push({ type: 'warning', text: 'Your journey in the house has come to an end.' });
    }

    // Emotional reactions
    for (const c of this.state.getActiveContestants()) {
      if (c.getRelationship(evicted.id) > 30) {
        c.reputation = clamp(c.reputation - 2, 0, 100);
      }
      if (c.getRelationship(evicted.id) < -20) {
        c.modifyRelationship(evicted.id, 0); // cleanup
      }
    }

    this.state.removeFromAlliance(evicted.id);
    this.state.addHistory({ type: 'eviction', evicted: evicted.id, votes: voteLog });
    this.state.updateThreatLevels();

    return { results, evicted, voteLog, needsPlayerVote: !player.isNominated && !playerVoteTarget };
  }
}
