// Public API of the recognizer: classify(points, hero) => { name, score }.
// Flow: precheck (line? closed? open?) -> $1 against that group -> if not confident, retry ALL
// of this hero's shapes (the wizard and the Grand Warden each have their own set).
import { CONFIG } from '../config.ts';
import type { Point } from '../events.ts';
import { recognize, type Template } from './dollar.ts';
import { precheck } from './precheck.ts';
import { builtInTemplates, CLOSED_SHAPES, HERO_SHAPES, OPEN_SHAPES, type Hero, type SigilName } from './templates.ts';

export type { Hero, SigilName } from './templates.ts';
export type Classification = { name: SigilName | null; score: number };

const builtIn = builtInTemplates();
let recorded: Template[] = [];

/** Recorded templates (from the R recorder) are used alongside the built-in ones. */
export function setRecordedTemplates(templates: Template[]): void {
  recorded = templates;
}

/** The wizard has no O: a full circle is his C (water). */
function asHero(name: SigilName, hero: Hero): SigilName {
  return hero === 'wizard' && name === 'O' ? 'C' : name;
}

export function classify(points: Point[], hero: Hero = 'wizard'): Classification {
  if (points.length < 2) return { name: null, score: 0 };

  const check = precheck(points);
  if (check.kind === 'line') return { name: 'line', score: check.straightness };

  const mine = HERO_SHAPES[hero];
  const all = [...builtIn, ...recorded].filter((t) => mine.includes(t.name as SigilName));
  const group = check.kind === 'closed' ? CLOSED_SHAPES : OPEN_SHAPES;

  // First try only the shapes that fit the precheck.
  const first = recognize(points, all.filter((t) => group.includes(t.name as SigilName)));
  if (first.name && first.score >= CONFIG.RECOGNIZER_THRESHOLD) {
    return { name: asHero(first.name as SigilName, hero), score: first.score };
  }

  // Not confident: the precheck may have been wrong (e.g. a circle with a big gap). Retry all.
  const retry = recognize(points, all);
  if (retry.name && retry.score >= CONFIG.RECOGNIZER_THRESHOLD) {
    return { name: asHero(retry.name as SigilName, hero), score: retry.score };
  }
  return { name: null, score: Math.max(first.score, retry.score) }; // FIZZLE
}
