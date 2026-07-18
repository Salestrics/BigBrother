const SAVE_KEY = 'house_of_strategy_save';

/**
 * Persist and restore game state via localStorage.
 */
export class StorageManager {
  static hasSave() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  static save(gameState) {
    try {
      const data = JSON.stringify(gameState.toJSON());
      localStorage.setItem(SAVE_KEY, data);
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  static loadRaw() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  static clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }
}

export { SAVE_KEY };
