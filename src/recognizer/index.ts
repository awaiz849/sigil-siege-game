// Public API of the recognizer: classify(points) => { name, score }.
// Flow: precheck (line? closed? open?) -> $1 against that group -> if not confident, retry ALL.
import { CONFIG } from '../config.ts';
import type { Point } from '../events.ts';
import { recognize, type Template } from './dollar.ts';
import { precheck } from './precheck.ts';
import { builtInTemplates, CLOSED_SHAPES, OPEN_SHAPES, type SigilName } from './templates.ts';

export type { SigilName } from './templates.ts';
export type Classification = { name: SigilName | null; score: number };

const builtIn = builtInTemplates();
let recorded: Template[] = [];

/** Recorded templates (from the R recorder) are used alongside the built-in ones. */
export function setRecordedTemplates(templates: Template[]): void {
  recorded = templates;
}

export function classify(points: Point[]): Classification {
  if (points.length < 2) return { name: null, score: 0 };

  const check = precheck(points);
  if (check.kind === 'line') return { name: 'line', score: check.straightness };

  const all = [...builtIn, ...recorded];
  const group = check.kind === 'closed' ? CLOSED_SHAPES : OPEN_SHAPES;

  // First try only the shapes that fit the precheck.
  const first = recognize(points, all.filter((t) => group.includes(t.name as SigilName)));
  if (first.name && first.score >= CONFIG.RECOGNIZER_THRESHOLD) {
    return { name: first.name as SigilName, score: first.score };
  }

  // Not confident: the precheck may have been wrong (e.g. a circle with a big gap). Retry all.
  const retry = recognize(points, all);
  if (retry.name && retry.score >= CONFIG.RECOGNIZER_THRESHOLD) {
    return { name: retry.name as SigilName, score: retry.score };
  }
  return { name: null, score: Math.max(first.score, retry.score) }; // FIZZLE
}
