import { randomInt, clamp } from './utils.js';

/**
 * Player-initiated actions during the social phase.
 */
export class PlayerActions {
  constructor(gameState) {
    this.state = gameState;
  }

  /** Get available actions for the current state. */
  getAvailableActions() {
    const player = this.state.getPlayer();
    if (!player || player.evicted) return [];

    const actions = [
      { id: 'talk', label: 'Talk to Houseguest', description: 'Have a conversation to build rapport.' },
      { id: 'befriend', label: 'Build Friendship', description: 'Invest time strengthening a bond.' },
      { id: 'alliance', label: 'Propose Alliance', description: 'Invite someone into a secret alliance.' },
      { id: 'spy', label: 'Spy / Gather Intel', description: 'Eavesdrop and learn house secrets.' },
      { id: 'promise', label: 'Make a Promise', description: 'Pledge your vote or loyalty.' },
      { id: 'break_promise', label: 'Break a Promise', description: 'Go back on your word (risky).' },
      { id: 'campaign', label: 'Campaign Against Target', description: 'Turn the house against someone.' },
      { id: 'influence', label: 'Influence Votes', description: 'Lobby houseguests before eviction.' },
      { id: 'reputation', label: 'Improve Reputation', description: 'Do something to look good to the house.' },
      { id: 'rest', label: 'Rest & Observe', description: 'Skip action, lower threat slightly.' }
    ];

    if (this.state.actionsRemaining <= 0) {
      return [{ id: 'end_day', label: 'End Day', description: 'Move on to the next day.' }];
    }

    return actions;
  }

  /** Execute a player action. Returns { success, text, type, effects }. */
  execute(actionId, targetId = null, extra = {}) {
    const player = this.state.getPlayer();
    const target = targetId ? this.state.getContestant(targetId) : null;

    switch (actionId) {
      case 'talk':
        return this._talk(player, target);
      case 'befriend':
        return this._befriend(player, target);
      case 'alliance':
        return this._proposeAlliance(player, target);
      case 'spy':
        return this._spy(player, target);
      case 'promise':
        return this._makePromise(player, target, extra.promiseType);
      case 'break_promise':
        return this._breakPromise(player, target);
      case 'campaign':
        return this._campaign(player, target);
      case 'influence':
        return this._influenceVotes(player, target);
      case 'reputation':
        return this._improveReputation(player);
      case 'rest':
        return this._rest(player);
      case 'end_day':
        return { success: true, text: 'You chose to end the day.', type: 'system', endDay: true };
      default:
        return { success: false, text: 'Unknown action.', type: 'system' };
    }
  }

  _talk(player, target) {
    if (!target) return { success: false, text: 'Choose someone to talk to.', type: 'system' };

    const delta = randomInt(2, 6) + Math.floor(player.social / 3);
    player.modifyRelationship(target.id, delta);
    target.modifyRelationship(player.id, delta - randomInt(0, 2));

    const dialogues = [
      `You had a heartfelt conversation with ${target.name} about life outside the house.`,
      `You and ${target.name} bonded over shared interests in the backyard.`,
      `A late-night chat with ${target.name} revealed you have more in common than you thought.`,
      `${target.name} opened up to you about feeling isolated in the house.`
    ];

    this._consumeAction();
    return {
      success: true,
      text: dialogues[randomInt(0, dialogues.length - 1)],
      type: 'narrative',
      relationshipChange: delta
    };
  }

  _befriend(player, target) {
    if (!target) return { success: false, text: 'Choose someone to befriend.', type: 'system' };

    const success = player.social + randomInt(1, 8) > target.social + randomInt(1, 5);
    const delta = success ? randomInt(8, 15) : randomInt(2, 5);

    player.modifyRelationship(target.id, delta);
    target.modifyRelationship(player.id, success ? delta - 2 : randomInt(1, 4));

    this._consumeAction();
    return {
      success: true,
      text: success
        ? `Your friendship with ${target.name} grew significantly. They seem to genuinely trust you.`
        : `You spent time with ${target.name}, but they're still keeping their guard up.`,
      type: success ? 'success' : 'narrative'
    };
  }

  _proposeAlliance(player, target) {
    if (!target) return { success: false, text: 'Choose an alliance partner.', type: 'system' };

    const acceptChance = (player.getRelationship(target.id) + player.social * 5 + target.loyalty * 3) / 100;
    const accepted = Math.random() < acceptChance;

    if (accepted) {
      if (player.allianceId) {
        const alliance = this.state.alliances.find((a) => a.id === player.allianceId);
        if (alliance && !alliance.members.includes(target.id)) {
          alliance.members.push(target.id);
          target.allianceId = alliance.id;
        }
      } else if (target.allianceId) {
        const alliance = this.state.alliances.find((a) => a.id === target.allianceId);
        if (alliance) {
          alliance.members.push(player.id);
          player.allianceId = alliance.id;
        }
      } else {
        this.state.createAlliance(player.id, [target.id], `${player.name} & ${target.name}`);
      }

      player.modifyRelationship(target.id, 20);
      target.modifyRelationship(player.id, 15);
      player.trust = clamp(player.trust + 5, 0, 100);

      this._consumeAction();
      return {
        success: true,
        text: `${target.name} accepted your alliance proposal! You now have a secret partnership.`,
        type: 'success'
      };
    }

    target.modifyRelationship(player.id, -5);
    this._consumeAction();
    return {
      success: false,
      text: `${target.name} politely declined your alliance offer. Awkward.`,
      type: 'warning'
    };
  }

  _spy(player, target) {
    const success = player.intelligence + randomInt(1, 10) > 8;
    this._consumeAction();

    if (!success) {
      return {
        success: false,
        text: 'You tried to eavesdrop but got caught lingering. The house is suspicious.',
        type: 'warning'
      };
    }

    const subject = target || this._pickSpySubject();
    const intelTypes = [
      `${subject.name} was heard planning to target you next week.`,
      `${subject.name} is in a secret alliance with ${this._randomAllyName(subject)}.`,
      `${subject.name} lied about their vote last week.`,
      `${subject.name} has been spreading rumors about you.`
    ];

    const intel = intelTypes[randomInt(0, intelTypes.length - 1)];
    this.state.playerIntel.push({
      week: this.state.week,
      about: subject.id,
      text: intel
    });

    return { success: true, text: intel, type: 'warning' };
  }

  _pickSpySubject() {
    const others = this.state.getOthers(this.state.getPlayer());
    return others[randomInt(0, others.length - 1)];
  }

  _randomAllyName(subject) {
    const others = this.state.getOthers(subject);
    return others.length > 0 ? others[randomInt(0, others.length - 1)].name : 'someone';
  }

  _makePromise(player, target, promiseType = 'vote') {
    if (!target) return { success: false, text: 'Choose who to make a promise to.', type: 'system' };

    player.makePromise(target.id, promiseType, this.state.week);
    target.modifyRelationship(player.id, randomInt(8, 14));
    player.trust = clamp(player.trust + 3, 0, 100);

    const promises = {
      vote: `You promised ${target.name} your vote this week.`,
      safety: `You promised ${target.name} you would keep them safe.`,
      loyalty: `You swore loyalty to ${target.name} for the rest of the game.`
    };

    this._consumeAction();
    return {
      success: true,
      text: promises[promiseType] || promises.vote,
      type: 'narrative'
    };
  }

  _breakPromise(player, target) {
    if (!target) return { success: false, text: 'Choose whose promise to break.', type: 'system' };

    player.breakPromise(target.id);
    target.recordBetrayal(player.id, this.state.week);
    target.modifyRelationship(player.id, -25);
    player.reputation = clamp(player.reputation - 10, 0, 100);
    player.trust = clamp(player.trust - 10, 0, 100);

    this._consumeAction();
    return {
      success: true,
      text: `You broke your promise to ${target.name}. They will not forget this betrayal.`,
      type: 'drama'
    };
  }

  _campaign(player, target) {
    if (!target) return { success: false, text: 'Choose a campaign target.', type: 'system' };

    const effectiveness = player.social + player.aggression - target.social;
    const others = this.state.getOthers(player).filter((c) => c.id !== target.id);
    let influenced = 0;

    for (const other of others) {
      if (Math.random() < effectiveness / 20) {
        other.modifyRelationship(target.id, -randomInt(5, 12));
        influenced += 1;
      }
    }

    target.reputation = clamp(target.reputation - randomInt(3, 8), 0, 100);
    player.threat = clamp(player.threat + 5, 0, 100);
    target.addGrudge(player.id, 'campaign', 15);

    this._consumeAction();
    return {
      success: true,
      text: influenced > 0
        ? `Your campaign against ${target.name} swayed ${influenced} houseguest(s).`
        : `Your campaign against ${target.name} didn't gain much traction.`,
      type: 'drama'
    };
  }

  _influenceVotes(player, target) {
    if (!target) return { success: false, text: 'Choose who to lobby for.', type: 'system' };

    const others = this.state.getOthers(player).filter((c) => c.id !== target.id);
    let influenced = 0;

    for (const other of others) {
      const chance = (player.social + player.getRelationship(other.id)) / 150;
      if (Math.random() < chance) {
        other.modifyRelationship(target.id, -randomInt(3, 8));
        influenced += 1;
      }
    }

    this._consumeAction();
    return {
      success: true,
      text: influenced > 0
        ? `You influenced ${influenced} houseguest(s) to vote against ${target.name}.`
        : `Your lobbying efforts fell flat this time.`,
      type: 'narrative'
    };
  }

  _improveReputation(player) {
    player.reputation = clamp(player.reputation + randomInt(5, 12), 0, 100);
    const others = this.state.getOthers(player);
    for (const other of others) {
      if (Math.random() < 0.4) {
        other.modifyRelationship(player.id, randomInt(2, 5));
      }
    }

    this._consumeAction();
    return {
      success: true,
      text: 'You did something genuinely kind for the house. Your reputation improved.',
      type: 'success'
    };
  }

  _rest(player) {
    player.threat = clamp(player.threat - randomInt(3, 6), 0, 100);
    this._consumeAction();
    return {
      success: true,
      text: 'You kept a low profile today, watching and waiting.',
      type: 'system'
    };
  }

  _consumeAction() {
    this.state.actionsRemaining = Math.max(0, this.state.actionsRemaining - 1);
  }
}
