// Spells: targeting, damage rules, combo, MISS / FIZZLE, lightning cooldown and the shield.
// Every cast returns a SpellResult and adds floating-text events, so UI and sound can react. No drawing here.
import { CONFIG } from '../config.ts';
import { effectiveness } from './types.ts';
import type { Element, Enemy, FloatText, SpellName, Vec3, World } from './types.ts';
import { removeEnemy } from './enemies.ts';

/** Which spell each recognizer shape casts. "line" = shield (mouse debug only). */
export const SIGIL_SPELLS: Record<string, SpellName> = {
  circle: 'water',
  triangle: 'fire',
  v: 'nature',
  zigzag: 'lightning',
  line: 'shield',
};

/** Words shown as floating text. */
export const TEXT = {
  superEffective: 'SUPER EFFECTIVE!',
  resisted: 'RESISTED',
  stunBonus: 'STUNNED x2',
  miss: 'MISS',
  fizzle: 'FIZZLE',
  blocked: 'BLOCKED!',
  cooldown: (seconds: number) => `LIGHTNING ${Math.ceil(seconds)}s`,
  kill: (score: number) => `+${score}`,
};

/** A point on the overlay canvas, in pixels. */
export type ScreenPoint = { x: number; y: number };
/** Renderer function: enemy -> its overlay screen position, or null when off screen. */
export type ProjectFn = (enemy: Enemy) => ScreenPoint | null;

/** One enemy hit by a spell. */
export interface Hit {
  enemyId: number;
  damage: number;
  /** strong = spell beats the enemy's element, weak = same element. */
  effect: 'strong' | 'weak' | 'normal';
  stunned: boolean;
  killed: boolean;
  /** Points this kill earned (0 if not killed). */
  score: number;
  pos: Vec3;
}

export interface SpellResult {
  /** hit = damage only, kill = at least one kill, block = shield stopped warlocks,
   *  miss = no target / nothing to block, fizzle = shape not recognized,
   *  cooldown = lightning not ready (no penalty), ignored = not in a round. */
  kind: 'hit' | 'kill' | 'block' | 'miss' | 'fizzle' | 'cooldown' | 'ignored';
  spell: SpellName | null;
  hits: Hit[];
  /** Warlocks the shield blocked. */
  blockedIds: number[];
  scoreGained: number;
  /** Combo after the cast. */
  combo: number;
  /** Lightning seconds left (for the "cooldown" result). */
  cooldownLeft: number;
  /** The floating texts this cast produced (also pushed to world.events as 'floatText'). */
  texts: FloatText[];
}

/**
 * Target = the living enemy whose SCREEN position is nearest the stroke centre.
 * project(enemy) comes from the renderer, so this file never needs three.js.
 */
export function pickTarget(world: World, strokeCentre: ScreenPoint, project: ProjectFn): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const enemy of world.enemies) {
    const p = project(enemy);
    if (!p) continue;
    const d = Math.hypot(p.x - strokeCentre.x, p.y - strokeCentre.y);
    if (d < bestDist) {
      bestDist = d;
      best = enemy.id;
    }
  }
  return best;
}

/**
 * Cast the spell for a drawn shape.
 * @param shape        recognizer name (line | v | zigzag | circle | triangle), or null if not recognized
 * @param strokeCentre centre of the stroke in overlay pixels: picks the target
 * @param project      renderer's enemy -> screen position function
 */
export function castSpell(world: World, shape: string | null, strokeCentre: ScreenPoint, project: ProjectFn): SpellResult {
  return castSpellOn(world, shape, pickTarget(world, strokeCentre, project));
}

/** Same as castSpell, but with the target already chosen (enemy id, or null = no target). */
export function castSpellOn(world: World, shape: string | null, targetId: number | null): SpellResult {
  if (world.phase !== 'PLAYING') return result(world, 'ignored', null);
  const spell = shape ? SIGIL_SPELLS[shape] : undefined;
  if (!spell) return fail(world, 'fizzle', null);
  if (spell === 'shield') return castShield(world);
  if (spell === 'lightning') return castLightning(world);

  const target = world.enemies.find((e) => e.id === targetId);
  if (!target) return fail(world, 'miss', spell);
  return finish(world, spell, [damageEnemy(world, target, spell)]);
}

/** Lightning: 1 damage to every enemy, then a cooldown. Casting on cooldown costs nothing. */
function castLightning(world: World): SpellResult {
  if (world.lightningCooldown > 0) {
    const left = world.lightningCooldown;
    return result(world, 'cooldown', 'lightning', { cooldownLeft: left }, [
      { text: TEXT.cooldown(left), pos: null, tone: 'info' },
    ]);
  }
  if (world.enemies.length === 0) return fail(world, 'miss', 'lightning');
  world.lightningCooldown = CONFIG.LIGHTNING_COOLDOWN_S;
  // Copy the list: killed enemies are removed while we loop.
  const hits = world.enemies.slice().map((e) => damageEnemy(world, e, null));
  return finish(world, 'lightning', hits);
}

/** Shield (open palm): blocks every charging warlock and stuns each one. */
export function castShield(world: World): SpellResult {
  if (world.phase !== 'PLAYING') return result(world, 'ignored', 'shield');
  const charging = world.enemies.filter((e) => e.type === 'warlock' && e.state === 'charge' && e.stunT === 0);
  if (charging.length === 0) return fail(world, 'miss', 'shield');
  for (const warlock of charging) {
    // The charge is lost: after the stun it waits a full recharge before charging again.
    warlock.state = 'recharge';
    warlock.stateT = 0;
    warlock.stunT = CONFIG.SHIELD_STUN_S;
  }
  const texts: FloatText[] = charging.map((w) => ({ text: TEXT.blocked, pos: { ...w.pos }, tone: 'good' }));
  return result(world, 'block', 'shield', { blockedIds: charging.map((w) => w.id) }, texts);
}

/** Damage multiplier: effectiveness() of the elements (lightning has none), then x2 if stunned. */
export function damageMultiplier(spellElement: Element | null, enemy: Enemy): { mult: number; effect: Hit['effect'] } {
  let mult = spellElement ? effectiveness(spellElement, enemy.element) : 1;
  const effect: Hit['effect'] = mult > 1 ? 'strong' : mult < 1 ? 'weak' : 'normal';
  if (enemy.stunT > 0) mult *= CONFIG.DMG_STUNNED;
  return { mult, effect };
}

/** Apply base damage (times multipliers) to one enemy; a kill scores 100 x combo and raises the combo. */
function damageEnemy(world: World, enemy: Enemy, spellElement: Element | null): Hit {
  const { mult, effect } = damageMultiplier(spellElement, enemy);
  const damage = CONFIG.DMG_BASE * mult;
  enemy.hp = Math.max(0, enemy.hp - damage);
  const hit: Hit = { enemyId: enemy.id, damage, effect, stunned: enemy.stunT > 0, killed: false, score: 0, pos: { ...enemy.pos } };

  if (enemy.hp <= 0) {
    hit.killed = true;
    hit.score = CONFIG.KILL_SCORE * world.combo;
    world.score += hit.score;
    world.combo = Math.min(CONFIG.MAX_COMBO, world.combo + 1);
    world.stats.kills++;
    if (enemy.type === 'boss') world.bossDefeated = true; // update() ends the round
    removeEnemy(world, enemy.id);
  }
  return hit;
}

/** Floating texts for one hit: effectiveness, stun bonus, kill score. */
function hitTexts(hit: Hit): FloatText[] {
  const texts: FloatText[] = [];
  if (hit.effect === 'strong') texts.push({ text: TEXT.superEffective, pos: hit.pos, tone: 'great' });
  if (hit.effect === 'weak') texts.push({ text: TEXT.resisted, pos: hit.pos, tone: 'bad' });
  if (hit.stunned) texts.push({ text: TEXT.stunBonus, pos: hit.pos, tone: 'great' });
  if (hit.killed) texts.push({ text: TEXT.kill(hit.score), pos: hit.pos, tone: 'great' });
  return texts;
}

function finish(world: World, spell: SpellName, hits: Hit[]): SpellResult {
  const scoreGained = hits.reduce((sum, h) => sum + h.score, 0);
  const kind = hits.some((h) => h.killed) ? 'kill' : 'hit';
  return result(world, kind, spell, { hits, scoreGained }, hits.flatMap(hitTexts));
}

/** MISS and FIZZLE reset the combo. */
function fail(world: World, kind: 'miss' | 'fizzle', spell: SpellName | null): SpellResult {
  world.combo = 1;
  const text = kind === 'miss' ? TEXT.miss : TEXT.fizzle;
  return result(world, kind, spell, {}, [{ text, pos: null, tone: 'bad' }]);
}

/** Build the result and push its floating texts as events for the UI. */
function result(
  world: World,
  kind: SpellResult['kind'],
  spell: SpellName | null,
  extra: Partial<SpellResult> = {},
  texts: FloatText[] = [],
): SpellResult {
  for (const t of texts) world.events.push({ type: 'floatText', ...t });
  return { kind, spell, hits: [], blockedIds: [], scoreGained: 0, combo: world.combo, cooldownLeft: 0, texts, ...extra };
}
