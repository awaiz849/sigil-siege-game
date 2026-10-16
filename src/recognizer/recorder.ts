// Debug template recorder. R = record the next stroke as a template (asks for its name),
// Shift+R = delete all recorded templates. Saved in localStorage.
// Never demo with stale templates: the overlay shows how many are loaded.
import type { Point } from '../events.ts';
import { makeTemplate } from './dollar.ts';
import { setRecordedTemplates } from './index.ts';
import { SIGIL_NAMES, type SigilName } from './templates.ts';

const STORAGE_KEY = 'sigil-siege-templates';
type Saved = { name: SigilName; points: Point[] };

export function createRecorder(notify: (message: string) => void) {
  let saved: Saved[] = load();
  let armed = false;
  apply();

  function load(): Saved[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Saved[];
    } catch {
      return [];
    }
  }

  function apply() {
    setRecordedTemplates(saved.map((s) => makeTemplate(s.name, s.points)));
  }

  return {
    count: () => saved.length,
    isArmed: () => armed,

    /** R pressed: the next finished stroke becomes a template. */
    arm() {
      armed = true;
      notify('RECORDING: draw a sigil');
    },

    /** Shift+R pressed: forget all recorded templates. */
    clear() {
      saved = [];
      localStorage.removeItem(STORAGE_KEY);
      apply();
      notify('Recorded templates deleted');
    },

    /** Called with each finished stroke. Returns true if the recorder used it. */
    consume(points: Point[]): boolean {
      if (!armed) return false;
      armed = false;
      const name = window.prompt(`Template name? (${SIGIL_NAMES.join(' | ')})`)?.trim() as SigilName | undefined;
      if (!name || !SIGIL_NAMES.includes(name)) {
        notify('Recording cancelled');
        return true;
      }
      saved.push({ name, points });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      apply();
      notify(`Saved "${name}" (${saved.length} recorded)`);
      return true;
    },
  };
}
