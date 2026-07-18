# House of Strategy

A single-player text-based social strategy game inspired by reality competition shows like Big Brother.

## Play

Open `index.html` in a modern browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## How to Play

1. Enter your name and choose a difficulty level.
2. Each week has five social days (Days 1–5) where you can talk, befriend, spy, campaign, and form alliances.
3. Day 6 is the Head of Household competition — win to control nominations.
4. Day 7 brings nominations, the Power of Veto, and the eviction vote.
5. Survive until you're the last houseguest standing.

## Features

- 11 houseguests (you + 10 AI contestants) with unique personalities and stats
- Autonomous AI that forms alliances, betrays allies, and votes strategically
- Five competition types: trivia, memory, logic, endurance, and chance
- Full eviction system with vote breakdowns and reasoning
- Random drama events and intel gathering
- Save/load via localStorage
- Three difficulty levels
- Endgame summary explaining your win or loss

## Project Structure

```
index.html          # Game shell and layout
style.css           # UI styling
game.js             # Main game controller and weekly loop
modules/
  Contestant.js     # Houseguest class and stats
  GameState.js      # Core state and week progression
  AI.js             # Autonomous AI behavior
  Competition.js    # Competition types and resolution
  Events.js         # Narrative and drama events
  Eviction.js       # Nominations, veto, and eviction votes
  PlayerActions.js  # Player social actions
  UI.js             # DOM rendering
  Storage.js        # localStorage save/load
  utils.js          # Shared helpers
```

## Tech

Vanilla JavaScript (ES modules), HTML, and CSS. No external dependencies.
