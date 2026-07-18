import { PHASE_LABELS, PHASES } from './GameState.js';
import { relationshipClass, formatRelationship, escapeHtml } from './utils.js';

/**
 * DOM rendering and screen management.
 */
export class UIManager {
  constructor() {
    this.elements = {
      setupScreen: document.getElementById('setup-screen'),
      gameScreen: document.getElementById('game-screen'),
      endScreen: document.getElementById('end-screen'),
      playerNameInput: document.getElementById('player-name'),
      difficultySelect: document.getElementById('difficulty'),
      btnNewGame: document.getElementById('btn-new-game'),
      btnLoadGame: document.getElementById('btn-load-game'),
      btnSave: document.getElementById('btn-save'),
      btnMenu: document.getElementById('btn-menu'),
      btnPlayAgain: document.getElementById('btn-play-again'),
      weekDay: document.getElementById('week-day'),
      phaseLabel: document.getElementById('phase-label'),
      storyLog: document.getElementById('story-log'),
      playerNameDisplay: document.getElementById('player-name-display'),
      playerStats: document.getElementById('player-stats'),
      playerStatus: document.getElementById('player-status'),
      guestCount: document.getElementById('guest-count'),
      houseguestList: document.getElementById('houseguest-list'),
      allianceOverview: document.getElementById('alliance-overview'),
      actionPrompt: document.getElementById('action-prompt'),
      actionButtons: document.getElementById('action-buttons'),
      actionDetail: document.getElementById('action-detail'),
      endTitle: document.getElementById('end-title'),
      endSummary: document.getElementById('end-summary')
    };
  }

  showScreen(screen) {
    for (const el of [this.elements.setupScreen, this.elements.gameScreen, this.elements.endScreen]) {
      el.classList.remove('active');
    }
    screen.classList.add('active');
  }

  showSetup() {
    this.showScreen(this.elements.setupScreen);
    this.elements.btnLoadGame.disabled = !StorageManagerRef.hasSave();
  }

  showGame() {
    this.showScreen(this.elements.gameScreen);
  }

  showEnd(won) {
    this.showScreen(this.elements.endScreen);
    this.elements.endTitle.textContent = won ? 'You Won!' : 'Game Over';
  }

  updateWeekDay(week, day, phase) {
    this.elements.weekDay.textContent = `Week ${week} — Day ${day}`;
    this.elements.phaseLabel.textContent = PHASE_LABELS[phase] || phase;
  }

  /** Append entries to story log. */
  addStoryEntries(entries, scroll = true) {
    for (const entry of entries) {
      const div = document.createElement('div');
      div.className = `story-entry ${entry.type || 'narrative'}`;
      div.innerHTML = entry.text;
      this.elements.storyLog.appendChild(div);
    }
    if (scroll) {
      this.elements.storyLog.scrollTop = this.elements.storyLog.scrollHeight;
    }
  }

  /** Rebuild story log from state. */
  renderStoryLog(storyLog) {
    this.elements.storyLog.innerHTML = '';
    this.addStoryEntries(storyLog, false);
    this.elements.storyLog.scrollTop = this.elements.storyLog.scrollHeight;
  }

  renderPlayer(player) {
    if (!player) return;

    this.elements.playerNameDisplay.textContent = player.name;

    const stats = [
      { label: 'Social', value: player.social, cls: 'social' },
      { label: 'Competition', value: player.competition, cls: 'competition' },
      { label: 'Threat', value: player.threat, cls: 'threat' },
      { label: 'Trust', value: player.trust, cls: 'trust' },
      { label: 'Intelligence', value: player.intelligence },
      { label: 'Aggression', value: player.aggression },
      { label: 'Reputation', value: player.reputation },
      { label: 'Loyalty', value: player.loyalty }
    ];

    this.elements.playerStats.innerHTML = stats.map((s) => {
      if (s.cls) {
        return `<div class="stat-bar-wrap">
          <div class="stat-row"><span class="stat-label">${s.label}</span><span>${s.value}</span></div>
          <div class="stat-bar"><div class="stat-bar-fill ${s.cls}" style="width:${s.value * 10}%"></div></div>
        </div>`;
      }
      return `<div class="stat-row"><span class="stat-label">${s.label}</span><span>${s.value}</span></div>`;
    }).join('');

    const tags = [];
    if (player.isHOH) tags.push('<span class="tag hoh">HOH</span>');
    if (player.isNominated) tags.push('<span class="tag nominated">Nominated</span>');
    if (player.hasVeto) tags.push('<span class="tag veto-holder">Veto</span>');
    if (player.allianceId) tags.push('<span class="tag alliance">In Alliance</span>');
    if (!player.isNominated && !player.isHOH) tags.push('<span class="tag safe">Safe</span>');

    this.elements.playerStatus.innerHTML = tags.join('');
  }

  renderHouseguests(contestants, player) {
    const active = contestants.filter((c) => !c.evicted);
    this.elements.guestCount.textContent = active.length;

    this.elements.houseguestList.innerHTML = contestants.map((c) => {
      const rel = player ? player.getRelationship(c.id) : 0;
      const relDisplay = c.isPlayer ? '' : `<span class="rel-score ${relationshipClass(rel)}">${rel > 0 ? '+' : ''}${rel}</span>`;
      const icons = [];
      if (c.isHOH) icons.push('👑');
      if (c.isNominated) icons.push('⚠️');
      if (c.evicted) icons.push('❌');

      return `<li class="houseguest-item ${c.isPlayer ? 'is-player' : ''} ${c.evicted ? 'evicted' : ''}">
        <div>
          <span class="name">${icons.join(' ')} ${escapeHtml(c.name)}</span>
          <div class="personality">${escapeHtml(c.personality.name)}</div>
        </div>
        ${relDisplay}
      </li>`;
    }).join('');
  }

  renderAlliances(alliances, player) {
    if (alliances.length === 0) {
      this.elements.allianceOverview.innerHTML = '<p class="no-alliance">No known alliances yet.</p>';
      return;
    }

    this.elements.allianceOverview.innerHTML = alliances.map((a) => {
      const isPlayerAlliance = a.members.includes(player?.id);
      const memberNames = a.members.map((id) => {
        const c = window.__gameContestants?.get(id);
        return c ? c.name : 'Unknown';
      }).join(', ');

      return `<div class="alliance-group ${isPlayerAlliance ? 'player-alliance' : ''}">
        <h3>${a.name}${a.exposed ? ' (EXPOSED)' : ''}</h3>
        <div class="alliance-members">${memberNames}</div>
      </div>`;
    }).join('');
  }

  renderActions(actions, onAction) {
    this.elements.actionButtons.innerHTML = '';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-action';
      btn.textContent = action.label;
      btn.title = action.description || '';
      btn.addEventListener('click', () => onAction(action));
      this.elements.actionButtons.appendChild(btn);
    }
  }

  showActionDetail(html, onConfirm = null) {
    this.elements.actionDetail.classList.remove('hidden');
    this.elements.actionDetail.innerHTML = html;

    if (onConfirm) {
      const confirmBtn = this.elements.actionDetail.querySelector('[data-confirm]');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', onConfirm);
      }
    }
  }

  hideActionDetail() {
    this.elements.actionDetail.classList.add('hidden');
    this.elements.actionDetail.innerHTML = '';
  }

  buildTargetPicker(contestants, label, onSelect, excludeIds = []) {
    const targets = contestants.filter((c) => !c.evicted && !c.isPlayer && !excludeIds.includes(c.id));
    let html = `<p>${escapeHtml(label)}</p><div class="target-grid">`;
    for (const t of targets) {
      const rel = formatRelationship(window.__gamePlayer?.getRelationship(t.id) || 0);
      html += `<button class="btn target-btn" data-target="${t.id}">${escapeHtml(t.name)} (${rel})</button>`;
    }
    html += '</div>';
    return { html, targets };
  }

  showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  setActionPrompt(text) {
    this.elements.actionPrompt.textContent = text;
  }

  renderEndSummary(html) {
    this.elements.endSummary.innerHTML = html;
  }
}

// Avoid circular import — set from game.js
let StorageManagerRef = { hasSave: () => false };
export function setStorageRef(ref) {
  StorageManagerRef = ref;
}
