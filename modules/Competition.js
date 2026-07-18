import { statCheck, randomInt, pickRandom, clamp, compareStats } from './utils.js';

/**
 * Text-based competitions with stat-based outcomes and player choices.
 */
export const COMPETITION_TYPES = [
  {
    id: 'trivia',
    name: 'Trivia Challenge',
    description: 'Answer rapid-fire questions about pop culture, geography, and house facts.',
    primaryStat: 'intelligence',
    secondaryStat: 'social'
  },
  {
    id: 'memory',
    name: 'Memory Challenge',
    description: 'Memorize a sequence of colors, numbers, and houseguest faces.',
    primaryStat: 'intelligence',
    secondaryStat: 'competition'
  },
  {
    id: 'logic',
    name: 'Logic Puzzle',
    description: 'Solve a complex puzzle before time runs out.',
    primaryStat: 'intelligence',
    secondaryStat: 'loyalty'
  },
  {
    id: 'endurance',
    name: 'Endurance Challenge',
    description: 'Hold your position as long as possible while distractions mount.',
    primaryStat: 'competition',
    secondaryStat: 'loyalty'
  },
  {
    id: 'luck',
    name: 'Pandora\'s Box',
    description: 'A game of chance with unpredictable twists.',
    primaryStat: 'competition',
    secondaryStat: 'social',
    randomWeight: 0.4
  }
];

const TRIVIA_QUESTIONS = [
  { q: 'Which continent has the most countries?', choices: ['Africa', 'Europe', 'Asia', 'South America'], answer: 0 },
  { q: 'What year did the first reality competition show air?', choices: ['1992', '2000', '1988', '1997'], answer: 1 },
  { q: 'How many weeks has this season been running?', choices: ['Too many', 'Not enough', 'Just right', 'Who cares'], answer: 2 },
  { q: 'Which strategy wins most often?', choices: ['Aggression', 'Social bonds', 'Pure luck', 'Doing nothing'], answer: 1 }
];

const LOGIC_PUZZLES = [
  {
    q: 'Three houseguests: one always lies, one always tells truth, one alternates. Who do you trust?',
    choices: ['The quiet one', 'The one who helped you', 'The competition beast', 'Trust no one'],
    scores: [2, 4, 1, 3]
  },
  {
    q: 'Nominees A and B. A has 3 allies, B has 1. Who is safer at eviction?',
    choices: ['Nominee A', 'Nominee B', 'Both equally', 'Neither'],
    scores: [1, 4, 2, 3]
  }
];

export class CompetitionManager {
  constructor(gameState) {
    this.state = gameState;
    this.currentCompetition = null;
    this.playerChoices = [];
  }

  /** Select and start a random competition for the week. */
  startCompetition() {
    this.currentCompetition = pickRandom(COMPETITION_TYPES);
    this.state.lastCompetitionType = this.currentCompetition.id;
    this.playerChoices = [];
    return this.currentCompetition;
  }

  /** Run full competition and return { winner, narrative[], playerParticipated }. */
  runCompetition(playerChoiceCallback = null) {
    const comp = this.currentCompetition || this.startCompetition();
    const contestants = this.state.getActiveContestants();
    const results = [];
    const scores = new Map();

    results.push({
      type: 'competition',
      text: `<strong>${comp.name}</strong> — ${comp.description}`
    });

    switch (comp.id) {
      case 'trivia':
        this._runTrivia(contestants, scores, results, playerChoiceCallback);
        break;
      case 'memory':
        this._runMemory(contestants, scores, results, playerChoiceCallback);
        break;
      case 'logic':
        this._runLogic(contestants, scores, results, playerChoiceCallback);
        break;
      case 'endurance':
        this._runEndurance(contestants, scores, results, playerChoiceCallback);
        break;
      case 'luck':
        this._runLuck(contestants, scores, results);
        break;
      default:
        this._runGeneric(contestants, scores, comp);
    }

    // Determine winner from scores
    let winner = contestants[0];
    let bestScore = -Infinity;
    for (const c of contestants) {
      const score = scores.get(c.id) || 0;
      if (score > bestScore) {
        bestScore = score;
        winner = c;
      }
    }

    // Tiebreaker
    const tied = contestants.filter((c) => scores.get(c.id) === bestScore);
    if (tied.length > 1) {
      winner = compareStats(tied[0], comp.primaryStat, tied[1], comp.primaryStat);
    }

    this.state.competitionWinner = winner;
    winner.isHOH = true;
    this.state.currentHOH = winner;

    results.push({
      type: 'success',
      text: `<strong>${winner.name}</strong> wins Head of Household!${winner.isPlayer ? ' You hold all the power this week.' : ` ${winner.name} will nominate two houseguests.`}`
    });

    return { winner, results, competition: comp };
  }

  _baseScore(contestant, comp) {
    const primary = contestant[comp.primaryStat] || contestant.competition;
    const secondary = contestant[comp.secondaryStat] || contestant.social;
    const bonus = this.state.config.competitionPlayerBonus;
    const playerBonus = contestant.isPlayer ? bonus : 0;
    return primary * 3 + secondary + randomInt(-2, 4) + playerBonus;
  }

  _runTrivia(contestants, scores, results, playerChoiceCallback) {
    const questions = pickRandom(TRIVIA_QUESTIONS);
    for (const c of contestants) {
      let score = this._baseScore(c, this.currentCompetition);
      if (c.isPlayer && playerChoiceCallback) {
        const correct = playerChoiceCallback('trivia', questions);
        score += correct ? 15 : -5;
        results.push({
          type: 'competition',
          text: correct
            ? 'You nailed the trivia question!'
            : 'You whiffed on the trivia question.'
        });
      } else {
        const correct = statCheck(c.intelligence, 5);
        score += correct ? randomInt(8, 15) : randomInt(-5, 3);
      }
      scores.set(c.id, score);
    }
    results.push({
      type: 'competition',
      text: `Question: "${questions.q}"`
    });
  }

  _runMemory(contestants, scores, results, playerChoiceCallback) {
    const sequence = Array.from({ length: 5 }, () => randomInt(1, 4)).join('-');
    results.push({ type: 'competition', text: `Memorize this sequence: ${sequence}` });

    for (const c of contestants) {
      let score = this._baseScore(c, this.currentCompetition);
      if (c.isPlayer && playerChoiceCallback) {
        const playerSeq = playerChoiceCallback('memory', sequence);
        const match = playerSeq === sequence;
        score += match ? 20 : randomInt(-8, 2);
        results.push({
          type: 'competition',
          text: match ? 'Perfect memory! You recalled the full sequence.' : 'Your sequence was wrong.'
        });
      } else {
        const recall = c.intelligence + randomInt(0, 6);
        score += recall > 10 ? randomInt(10, 18) : randomInt(0, 8);
      }
      scores.set(c.id, score);
    }
  }

  _runLogic(contestants, scores, results, playerChoiceCallback) {
    const puzzle = pickRandom(LOGIC_PUZZLES);
    results.push({ type: 'competition', text: puzzle.q });

    for (const c of contestants) {
      let score = this._baseScore(c, this.currentCompetition);
      if (c.isPlayer && playerChoiceCallback) {
        const choiceIdx = playerChoiceCallback('logic', puzzle);
        score += (puzzle.scores[choiceIdx] || 0) * 3;
      } else {
        const best = Math.max(...puzzle.scores);
        const aiScore = statCheck(c.intelligence, 6) ? best : pickRandom(puzzle.scores);
        score += aiScore * 2;
      }
      scores.set(c.id, score);
    }
  }

  _runEndurance(contestants, scores, results, playerChoiceCallback) {
    results.push({ type: 'competition', text: 'Hold steady! Distractions are coming...' });

    const rounds = 3;
    for (let round = 1; round <= rounds; round += 1) {
      const distractions = ['cold water', 'temptation food', 'verbal taunts', 'fake eviction news'];
      results.push({
        type: 'competition',
        text: `Round ${round}: ${pickRandom(distractions)} tests everyone's resolve.`
      });
    }

    for (const c of contestants) {
      let score = this._baseScore(c, this.currentCompetition);
      if (c.isPlayer && playerChoiceCallback) {
        const held = playerChoiceCallback('endurance', rounds);
        score += held ? 25 : randomInt(5, 12);
        results.push({
          type: 'competition',
          text: held ? 'You endured all distractions!' : 'You faltered but survived the challenge.'
        });
      } else {
        const endurance = c.competition + c.loyalty + randomInt(-1, 3);
        score += endurance * 2;
        if (endurance < 10 && Math.random() < 0.3) {
          results.push({ type: 'competition', text: `${c.name} nearly gave up but held on.` });
        }
      }
      scores.set(c.id, score);
    }
  }

  _runLuck(contestants, scores, results) {
    results.push({ type: 'competition', text: 'Each houseguest draws a card from Pandora\'s Box...' });
    for (const c of contestants) {
      const roll = randomInt(1, 10);
      let score = roll * 3;
      if (roll >= 9) {
        results.push({ type: 'competition', text: `${c.name} drew a GOLD card!` });
        score += 10;
      } else if (roll <= 2) {
        results.push({ type: 'competition', text: `${c.name} drew a CURSE card!` });
        score -= 8;
      }
      scores.set(c.id, score + this._baseScore(c, this.currentCompetition) * 0.3);
    }
  }

  _runGeneric(contestants, scores, comp) {
    for (const c of contestants) {
      scores.set(c.id, this._baseScore(c, comp));
    }
  }

  /** Player competition helpers — return choice UI data. */
  getPlayerChallengeData(type, data) {
    switch (type) {
      case 'trivia':
        return {
          prompt: data.q,
          choices: data.choices.map((c, i) => ({ label: c, value: i, correct: i === data.answer }))
        };
      case 'memory':
        return {
          prompt: `Memorize: ${data}`,
          choices: [
            { label: 'I remember it!', value: data, action: 'input' },
            { label: 'Guess: 1-2-3-4-1', value: '1-2-3-4-1' },
            { label: 'Guess: 2-4-1-3-2', value: '2-4-1-3-2' },
            { label: 'Guess: 3-1-4-2-3', value: '3-1-4-2-3' }
          ]
        };
      case 'logic':
        return {
          prompt: data.q,
          choices: data.choices.map((c, i) => ({ label: c, value: i }))
        };
      case 'endurance':
        return {
          prompt: 'Can you endure all 3 rounds of distractions?',
          choices: [
            { label: 'Hold strong!', value: true },
            { label: 'Give in to temptation', value: false }
          ]
        };
      default:
        return null;
    }
  }
}
