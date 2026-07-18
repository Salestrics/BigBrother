/**
 * House of Strategy — Main game controller.
 * Orchestrates the weekly loop: social → competition → nominations → veto → eviction.
 */

import { GameState, PHASES, PHASE_LABELS } from './modules/GameState.js';
import { AIController } from './modules/AI.js';
import { CompetitionManager, COMPETITION_TYPES } from './modules/Competition.js';
import { NarrativeEngine } from './modules/Events.js';
import { EvictionSystem } from './modules/Eviction.js';
import { PlayerActions } from './modules/PlayerActions.js';
import { UIManager, setStorageRef } from './modules/UI.js';
import { StorageManager } from './modules/Storage.js';
import { pickRandom, randomInt } from './modules/utils.js';

class Game {
  constructor() {
    this.state = null;
    this.ui = new UIManager();
    this.ai = null;
    this.competition = null;
    this.narrative = null;
    this.eviction = null;
    this.playerActions = null;

    // Pending player input state
    this.pendingAction = null;
    this.pendingCompetition = null;
    this.competitionData = null;
    this.playerChoiceResolver = null;

    setStorageRef(StorageManager);
    this._bindSetupEvents();
  }

  _bindSetupEvents() {
    const { ui } = this;

    ui.elements.btnNewGame.addEventListener('click', () => {
      const name = ui.elements.playerNameInput.value.trim() || 'You';
      const difficulty = ui.elements.difficultySelect.value;
      this.startNewGame(name, difficulty);
    });

    ui.elements.btnLoadGame.addEventListener('click', () => this.loadGame());
    ui.elements.btnSave.addEventListener('click', () => this.saveGame());
    ui.elements.btnMenu.addEventListener('click', () => this.returnToMenu());
    ui.elements.btnPlayAgain.addEventListener('click', () => {
      ui.showSetup();
    });

    ui.showSetup();
  }

  startNewGame(playerName, difficulty) {
    this.state = new GameState({ playerName, difficulty, aiCount: 10 });
    this._initSystems();
    this._exposeGlobals();

    this.state.addStory({
      text: `Welcome to the House, <strong>${playerName}</strong>! ${this.state.getActiveContestants().length} houseguests are competing. Only one will win.`,
      type: 'success'
    });
    this.state.addStory({
      text: 'Week 1 begins. Build relationships, win competitions, and avoid eviction.',
      type: 'system'
    });

    this.ui.showGame();
    this.render();
    this.runPhase();
  }

  loadGame() {
    const data = StorageManager.loadRaw();
    if (!data) {
      this.ui.showToast('No save found.');
      return;
    }

    this.state = GameState.fromJSON(data);
    this._initSystems();
    this._exposeGlobals();
    this.ui.showGame();
    this.render();
    this.runPhase();
    this.ui.showToast('Game loaded!');
  }

  saveGame() {
    if (!this.state) return;
    if (StorageManager.save(this.state)) {
      this.ui.showToast('Game saved!');
    } else {
      this.ui.showToast('Save failed.');
    }
  }

  returnToMenu() {
    if (confirm('Return to menu? Unsaved progress will be lost.')) {
      this.ui.showSetup();
    }
  }

  _initSystems() {
    this.ai = new AIController(this.state);
    this.competition = new CompetitionManager(this.state);
    this.narrative = new NarrativeEngine(this.state);
    this.eviction = new EvictionSystem(this.state, this.ai);
    this.playerActions = new PlayerActions(this.state);
  }

  _exposeGlobals() {
    window.__gameContestants = new Map(this.state.contestants.map((c) => [c.id, c]));
    window.__gamePlayer = this.state.getPlayer();
  }

  render() {
    const { state, ui } = this;
    ui.updateWeekDay(state.week, state.day, state.phase);
    ui.renderStoryLog(state.storyLog);
    ui.renderPlayer(state.getPlayer());
    ui.renderHouseguests(state.contestants, state.getPlayer());
    ui.renderAlliances(state.alliances, state.getPlayer());
    state.updateThreatLevels();
  }

  logAndRender(entries) {
    for (const entry of entries) {
      this.state.storyLog.push({
        ...entry,
        week: this.state.week,
        day: this.state.day,
        phase: this.state.phase
      });
    }
    this.ui.addStoryEntries(entries);
    this.render();
  }

  // ─── Phase orchestration ───────────────────────────────────────────

  runPhase() {
    if (this.state.gameOver) {
      this.endGame();
      return;
    }

    const player = this.state.getPlayer();
    if (player.evicted && !this.state.gameOver) {
      this._spectateRemaining();
      return;
    }

    switch (this.state.phase) {
      case PHASES.SOCIAL:
        this.runSocialPhase();
        break;
      case PHASES.COMPETITION:
        this.runCompetitionPhase();
        break;
      case PHASES.NOMINATION:
        this.runNominationPhase();
        break;
      case PHASES.VETO:
        this.runVetoPhase();
        break;
      case PHASES.EVICTION:
        this.runEvictionPhase();
        break;
      case PHASES.WEEK_END:
        this.runWeekEnd();
        break;
      default:
        break;
    }
  }

  runSocialPhase() {
    this.ui.setActionPrompt(
      this.state.actionsRemaining > 0
        ? `What will you do? (${this.state.actionsRemaining} action${this.state.actionsRemaining > 1 ? 's' : ''} left today)`
        : 'End the day to continue.'
    );

    const actions = this.playerActions.getAvailableActions();
    this.ui.renderActions(actions, (action) => this.handlePlayerAction(action));
  }

  handlePlayerAction(action) {
    if (action.id === 'end_day') {
      this.advanceDay();
      return;
    }

    const needsTarget = ['talk', 'befriend', 'alliance', 'spy', 'promise', 'break_promise', 'campaign', 'influence'].includes(action.id);

    if (needsTarget) {
      this.pendingAction = action;
      const { html } = this.ui.buildTargetPicker(
        this.state.contestants,
        `Choose a target for: ${action.label}`,
        null
      );

      this.ui.showActionDetail(
        html + '<button class="btn btn-ghost" data-cancel>Cancel</button>',
        null
      );

      this.ui.elements.actionDetail.querySelectorAll('[data-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.target;
          this.executePlayerAction(action.id, targetId);
        });
      });

      const cancel = this.ui.elements.actionDetail.querySelector('[data-cancel]');
      if (cancel) cancel.addEventListener('click', () => this.ui.hideActionDetail());
      return;
    }

    this.executePlayerAction(action.id);
  }

  executePlayerAction(actionId, targetId = null, extra = {}) {
    const result = this.playerActions.execute(actionId, targetId, extra);
    this.ui.hideActionDetail();

    if (result.endDay) {
      this.advanceDay();
      return;
    }

    if (result.text) {
      this.logAndRender([{ text: result.text, type: result.type || 'narrative' }]);
    }

    if (this.state.actionsRemaining <= 0) {
      this.ui.setActionPrompt('No actions remaining. End the day.');
      this.ui.renderActions(
        [{ id: 'end_day', label: 'End Day', description: 'Proceed to next day.' }],
        (a) => this.handlePlayerAction(a)
      );
    } else {
      this.runSocialPhase();
    }
  }

  advanceDay() {
    this.ui.hideActionDetail();

    // AI background activity
    const aiEvents = this.ai.runSocialPhase();
    if (aiEvents.length > 0) {
      this.logAndRender(aiEvents);
    }

    // Random narrative event
    const event = this.narrative.generateDailyEvent();
    if (event) {
      this.logAndRender([event]);
    }

    this.state.day += 1;
    this.state.actionsRemaining = this.state.config.actionsPerDay;

    if (this.state.day > this.state.maxDaysPerWeek) {
      this.state.phase = PHASES.COMPETITION;
      this.logAndRender([{
        type: 'system',
        text: `Day ${this.state.maxDaysPerWeek} ends. Competition day has arrived!`
      }]);
      this.render();
      setTimeout(() => this.runPhase(), 800);
    } else {
      this.logAndRender([{
        type: 'system',
        text: `— Day ${this.state.day} —`
      }]);
      this.render();
      this.runSocialPhase();
    }
  }

  // ─── Competition ─────────────────────────────────────────────────

  runCompetitionPhase() {
    const comp = this.competition.startCompetition();
    this.ui.setActionPrompt(`${comp.name} — Get ready!`);

    this.logAndRender([{
      type: 'competition',
      text: `<strong>${comp.name}</strong>: ${comp.description}`
    }]);

    const player = this.state.getPlayer();
    if (player.evicted) {
      this._resolveCompetitionAI();
      return;
    }

    // Player-interactive competitions
    if (['trivia', 'memory', 'logic', 'endurance'].includes(comp.id)) {
      this._startPlayerCompetition(comp);
    } else {
      this._resolveCompetitionAI();
    }
  }

  _startPlayerCompetition(comp) {
    let challengeData;
    switch (comp.id) {
      case 'trivia': {
        const questions = [
          { q: 'Which continent has the most countries?', choices: ['Africa', 'Europe', 'Asia', 'South America'], answer: 0 },
          { q: 'What wins Big Brother most often?', choices: ['Aggression', 'Social game', 'Luck', 'Doing nothing'], answer: 1 },
          { q: 'How many houseguests started this game?', choices: ['8', '10', '11', '12'], answer: 2 },
          { q: 'When should you win HOH?', choices: ['Always', 'When threatened', 'Never', 'Week 1 only'], answer: 1 }
        ];
        challengeData = this.competition.getPlayerChallengeData('trivia', pickRandom(questions));
        this.competitionData = pickRandom(questions);
        break;
      }
      case 'memory': {
        const seq = Array.from({ length: 5 }, () => randomInt(1, 4)).join('-');
        challengeData = this.competition.getPlayerChallengeData('memory', seq);
        this.competitionData = seq;
        break;
      }
      case 'logic': {
        const puzzles = [
          { q: 'Three houseguests: one lies, one tells truth, one alternates. Who do you trust?', choices: ['The quiet one', 'The ally', 'The beast', 'Trust no one'], scores: [2, 4, 1, 3] },
          { q: 'Nominee A has 3 allies, B has 1. Who is likelier evicted?', choices: ['A', 'B', 'Equal', 'Neither'], scores: [1, 4, 2, 3] }
        ];
        const puzzle = pickRandom(puzzles);
        challengeData = this.competition.getPlayerChallengeData('logic', puzzle);
        this.competitionData = puzzle;
        break;
      }
      case 'endurance':
        challengeData = this.competition.getPlayerChallengeData('endurance', 3);
        this.competitionData = 3;
        break;
      default:
        break;
    }

    if (!challengeData) {
      this._resolveCompetitionAI();
      return;
    }

    let html = `<p>${challengeData.prompt}</p><div class="competition-choices">`;
    for (const choice of challengeData.choices) {
      html += `<button class="btn btn-action competition-choice" data-value="${choice.value}">${choice.label}</button>`;
    }
    html += '</div>';

    this.ui.showActionDetail(html);
    this.ui.renderActions([], () => {});

    this.ui.elements.actionDetail.querySelectorAll('.competition-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.value;
        let value = raw;
        if (raw === 'true') value = true;
        if (raw === 'false') value = false;
        if (/^\d+$/.test(raw)) value = parseInt(raw, 10);
        this._resolveCompetitionWithPlayerChoice(comp.id, value);
      });
    });
  }

  _resolveCompetitionWithPlayerChoice(compId, playerChoice) {
    this.ui.hideActionDetail();

    const playerChoiceFn = (type, data) => {
      if (type === 'trivia') return playerChoice === data.answer;
      if (type === 'memory') return playerChoice === data;
      if (type === 'logic') return playerChoice;
      if (type === 'endurance') return playerChoice === true;
      return false;
    };

    const { winner, results } = this.competition.runCompetition(playerChoiceFn);
    this.logAndRender(results);
    this._afterCompetition(winner);
  }

  _resolveCompetitionAI() {
    const { winner, results } = this.competition.runCompetition();
    this.logAndRender(results);
    this._afterCompetition(winner);
  }

  _afterCompetition(winner) {
    this.state.phase = PHASES.NOMINATION;
    this.render();
    setTimeout(() => this.runPhase(), 1000);
  }

  // ─── Nominations ───────────────────────────────────────────────────

  runNominationPhase() {
    const hoh = this.state.getActiveContestants().find((c) => c.isHOH);

    if (hoh?.isPlayer) {
      this.ui.setActionPrompt('You are HOH! Nominate two houseguests.');
      this._showNominationPicker();
      return;
    }

    const { results, nominees } = this.eviction.runNominations();
    this.logAndRender(results);
    this.state.phase = PHASES.VETO;
    this.render();
    setTimeout(() => this.runPhase(), 1200);
  }

  _showNominationPicker() {
    const player = this.state.getPlayer();
    const targets = this.state.getOthers(player);
    let selected = [];

    const renderPicker = () => {
      let html = `<p>Select 2 nominees (${selected.length}/2):</p><div class="target-grid">`;
      for (const t of targets) {
        const isSelected = selected.includes(t.id);
        html += `<button class="btn target-btn ${isSelected ? 'selected' : ''}" data-target="${t.id}">${t.name}</button>`;
      }
      html += `</div>`;
      if (selected.length === 2) {
        html += '<button class="btn btn-confirm" data-confirm>Confirm Nominations</button>';
      }
      this.ui.showActionDetail(html);

      this.ui.elements.actionDetail.querySelectorAll('[data-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.target;
          if (selected.includes(id)) {
            selected = selected.filter((s) => s !== id);
          } else if (selected.length < 2) {
            selected.push(id);
          }
          renderPicker();
        });
      });

      const confirm = this.ui.elements.actionDetail.querySelector('[data-confirm]');
      if (confirm) {
        confirm.addEventListener('click', () => {
          const picks = selected.map((id) => this.state.getContestant(id));
          const { results } = this.eviction.runNominations(picks);
          this.ui.hideActionDetail();
          this.logAndRender(results);
          this.state.phase = PHASES.VETO;
          this.render();
          setTimeout(() => this.runPhase(), 1000);
        });
      }
    };

    renderPicker();
    this.ui.renderActions([], () => {});
  }

  // ─── Veto ──────────────────────────────────────────────────────────

  runVetoPhase() {
    const player = this.state.getPlayer();
    const result = this.eviction.runVetoEvent(false);

    this.logAndRender(result.results);

    if (result.needsPlayerInput && result.vetoWinner?.isPlayer) {
      this._showVetoChoice(result.vetoWinner);
      return;
    }

    if (result.needsReplacementPick) {
      this._showReplacementPicker();
      return;
    }

    this.state.phase = PHASES.EVICTION;
    this.render();
    setTimeout(() => this.runPhase(), 1200);
  }

  _showVetoChoice(vetoWinner) {
    const nominees = this.state.nominees.map((id) => this.state.getContestant(id)).filter(Boolean);
    let html = '<p>You won the Veto! Use it?</p><div class="target-grid">';
    for (const n of nominees) {
      html += `<button class="btn target-btn" data-veto-target="${n.id}">Save ${n.name}</button>`;
    }
    html += '<button class="btn btn-action" data-veto-skip>Don\'t use the Veto</button></div>';
    this.ui.showActionDetail(html);

    this.ui.elements.actionDetail.querySelectorAll('[data-veto-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = this.eviction.playerUseVeto(vetoWinner, btn.dataset.vetoTarget, true);
        this.ui.hideActionDetail();
        this.logAndRender(result.results);
        if (result.needsReplacementPick) {
          this._showReplacementPicker();
        } else {
          this.state.phase = PHASES.EVICTION;
          setTimeout(() => this.runPhase(), 1000);
        }
      });
    });

    const skip = this.ui.elements.actionDetail.querySelector('[data-veto-skip]');
    if (skip) {
      skip.addEventListener('click', () => {
        const result = this.eviction.playerUseVeto(vetoWinner, null, false);
        this.ui.hideActionDetail();
        this.logAndRender(result.results);
        this.state.phase = PHASES.EVICTION;
        setTimeout(() => this.runPhase(), 1000);
      });
    }
  }

  _showReplacementPicker() {
    const player = this.state.getPlayer();
    const nominees = new Set(this.state.nominees);
    const targets = this.state.getOthers(player).filter((c) => !nominees.has(c.id));

    let html = '<p>Pick a replacement nominee:</p><div class="target-grid">';
    for (const t of targets) {
      html += `<button class="btn target-btn" data-replacement="${t.id}">${t.name}</button>`;
    }
    html += '</div>';
    this.ui.showActionDetail(html);

    this.ui.elements.actionDetail.querySelectorAll('[data-replacement]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const results = this.eviction.playerPickReplacement(btn.dataset.replacement);
        this.ui.hideActionDetail();
        this.logAndRender(results);
        this.state.phase = PHASES.EVICTION;
        setTimeout(() => this.runPhase(), 1000);
      });
    });
  }

  // ─── Eviction ──────────────────────────────────────────────────────

  runEvictionPhase() {
    const player = this.state.getPlayer();

    if (!player.isNominated && !player.evicted) {
      this._showEvictionVote();
      return;
    }

    const { results, evicted } = this.eviction.runEvictionVote(null);
    this.logAndRender(results);
    this._afterEviction(evicted);
  }

  _showEvictionVote() {
    const nominees = this.state.nominees.map((id) => this.state.getContestant(id)).filter(Boolean);
    let html = '<p>Cast your vote to evict:</p><div class="target-grid">';
    for (const n of nominees) {
      html += `<button class="btn target-btn btn-danger" data-evict="${n.id}">Evict ${n.name}</button>`;
    }
    html += '</div>';
    this.ui.showActionDetail(html);
    this.ui.setActionPrompt('Eviction Night — cast your vote!');
    this.ui.renderActions([], () => {});

    this.ui.elements.actionDetail.querySelectorAll('[data-evict]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { results, evicted } = this.eviction.runEvictionVote(btn.dataset.evict);
        this.ui.hideActionDetail();
        this.logAndRender(results);
        this._afterEviction(evicted);
      });
    });
  }

  _afterEviction(evicted) {
    if (this.state.getPlayer().evicted) {
      this.state.checkWinCondition();
      if (!this.state.gameOver) {
        this.logAndRender([{
          type: 'system',
          text: 'You may continue watching the house as a spectator...'
        }]);
        setTimeout(() => this._spectateRemaining(), 1500);
      } else {
        this.endGame();
      }
      return;
    }

    this.state.phase = PHASES.WEEK_END;
    this.render();
    setTimeout(() => this.runPhase(), 1500);
  }

  // ─── Week end ──────────────────────────────────────────────────────

  runWeekEnd() {
    const active = this.state.getActiveContestants().length;

    this.logAndRender([{
      type: 'system',
      text: `Week ${this.state.week} is over. ${active} houseguests remain.`
    }]);

    if (this.state.checkWinCondition()) {
      this.endGame();
      return;
    }

    this.state.startNewWeek();
    this.logAndRender([{
      type: 'success',
      text: `<strong>Week ${this.state.week}</strong> begins. The game is heating up.`
    }]);

    this.render();
    this.runSocialPhase();
  }

  // ─── Spectator mode (player evicted) ───────────────────────────────

  _spectateRemaining() {
    while (!this.state.gameOver) {
      this.state.startNewWeek();
      this.state.phase = PHASES.COMPETITION;

      const { results } = this.competition.runCompetition();
      this.state.storyLog.push(...results.map((r) => ({ ...r, week: this.state.week, day: 1, phase: PHASES.COMPETITION })));

      const nomResults = this.eviction.runNominations();
      this.state.storyLog.push(...nomResults.results.map((r) => ({ ...r, week: this.state.week, day: 6, phase: PHASES.NOMINATION })));

      const vetoResults = this.eviction.runVetoEvent(false);
      this.state.storyLog.push(...vetoResults.results.map((r) => ({ ...r, week: this.state.week, day: 7, phase: PHASES.VETO })));

      const evictResults = this.eviction.runEvictionVote(null);
      this.state.storyLog.push(...evictResults.results.map((r) => ({ ...r, week: this.state.week, day: 7, phase: PHASES.EVICTION })));

      if (this.state.checkWinCondition()) break;
    }

    this.render();
    this.endGame();
  }

  // ─── End game ──────────────────────────────────────────────────────

  endGame() {
    const summary = this.narrative.generateEndgameSummary();
    const won = this.state.winner?.isPlayer;
    this.ui.renderEndSummary(summary);
    this.ui.showEnd(won);
    StorageManager.clear();
  }
}

// Boot
const game = new Game();

export default game;
