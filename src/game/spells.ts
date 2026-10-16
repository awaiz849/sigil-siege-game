// Spells: targeting, damage rules, combo, MISS / FIZZLE, lightning and wind cooldowns, and the shield.
// Every cast returns a SpellResult and adds floating-text events, so UI and sound can react. No drawing here.
import { CONFIG } from '../config.ts';
import { BEATS, effectiveness } from './types.ts';
import type { Element, Enemy, FloatText, SpellName, Vec3, World } from './types.ts';
import { removeEnemy } from './enemies.ts';
import { logCast } from './roundLog.ts';

/** Which spell each recognizer shape casts. The shield is the open palm, not a shape. */
export const SIGIL_SPELLS: Record<string, SpellName> = {
  circle: 'water',
  L: 'fire',
  v: 'nature',
  zigzag: 'lightning',
  line: 'wind',
};

/** The shape to draw against an enemy of this element (the spell that beats it). Used for hints. */
export function counterShape(element: Element): string {
  const spell = (Object.keys(BEATS) as Element[]).find((s) => BEATS[s] === element)!;
  return Object.keys(SIGIL_SPELLS).find((shape) => SIGIL_SPELLS[shape] === spell)!;
}

/** Words shown as floating text. */
export const TEXT = {
  superEffective: 'SUPER EFFECTIVE!',
  resisted: 'RESISTED',
  stunBonus: 'STUNNED x2',
  miss: 'MISS',
  fizzle: 'FIZZLE',
  blocked: 'BLOCKED!',
  wind: 'WIND!',
  cooldown: (spell: SpellName, seconds: number) => `${spell.toUpperCase()} ${Math.ceil(seconds)}s`,
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
   *  push = wind pushed enemies back, cooldown = lightning / wind not ready (no penalty),
   *  ignored = not in a round. */
  kind: 'hit' | 'kill' | 'block' | 'push' | 'miss' | 'fizzle' | 'cooldown' | 'ignored';
  spell: SpellName | null;
  hits: Hit[];
  /** Warlocks the shield blocked. */
  blockedIds: number[];
  /** Enemies the wind pushed back. */
  pushedIds: number[];
  scoreGained: number;
  /** Combo after the cast. */
  combo: number;
  /** Seconds until lightning / wind is ready (for the "cooldown" result). */
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
 * @param shape        recognizer name (line | v | zigzag | circle | L), or null if not recognized
 * @param strokeCentre centre of the stroke in overlay pixels: picks the target
 * @param project      renderer's enemy -> screen position function
 */
export function castSpell(world: World, shape: string | null, strokeCentre: ScreenPoint, project: ProjectFn): SpellResult {
  return castSpellOn(world, shape, pickTarget(world, strokeCentre, project));
}

/** Same as castSpell, but with the target already chosen (enemy id, or null = no target). */
export function castSpellOn(world: World, shape: string | null, targetId: number | null): SpellResult {
  if (world.phase !== 'PLAYING') return result(world, 'ignored', null);
  const r = castShape(world, shape, targetId);
  logCast(world, shape, r.kind); // tuning log: pen down -> cast time
  return r;
}

function castShape(world: World, shape: string | null, targetId: number | null): SpellResult {
  const spell = shape ? SIGIL_SPELLS[shape] : undefined;
  if (!spell) return fail(world, 'fizzle', null);
  if (spell === 'shield') return castShield(world);
  if (spell === 'lightning') return castLightning(world);
  if (spell === 'wind') return castWind(world);

  const target = world.enemies.find((e) => e.id === targetId);
  if (!target) return fail(world, 'miss', spell);
  return finish(world, spell, [damageEnemy(world, target, spell)]);
}

/** Lightning: 1 damage to every enemy, then a cooldown. Casting on cooldown costs nothing. */
function castLightning(world: World): SpellResult {
  if (world.lightningCooldown > 0) {
    const left = world.lightningCooldown;
    return result(world, 'cooldown', 'lightning', { cooldownLeft: left }, [
      { text: TEXT.cooldown('lightning', left), pos: null, tone: 'info' },
    ]);
  }
  if (world.enemies.length === 0) return fail(world, 'miss', 'lightning');
  world.lightningCooldown = CONFIG.LIGHTNING_COOLDOWN_S;
  // Copy the list: killed enemies are removed while we loop.
  const hits = world.enemies.slice().map((e) => damageEnemy(world, e, null));
  return finish(world, 'lightning', hits);
}

/** Wind (drawn line): pushes every WALKING enemy back toward the forest. The boss and
 *  warlocks that are casting hold their ground. Casting on cooldown costs nothing. */
function castWind(world: World): SpellResult {
  if (world.windCooldown > 0) {
    const left = world.windCooldown;
    return result(world, 'cooldown', 'wind', { cooldownLeft: left }, [
      { text: TEXT.cooldown('wind', left), pos: null, tone: 'info' },
    ]);
  }
  const pushed = world.enemies.filter((e) => e.type !== 'boss' && e.state === 'walk');
  if (pushed.length === 0) return fail(world, 'miss', 'wind');
  world.windCooldown = CONFIG.WIND_COOLDOWN_S;
  for (const e of pushed) e.pos.z = Math.max(CONFIG.FIELD.spawnZ, e.pos.z - CONFIG.WIND_PUSH);
  return result(world, 'push', 'wind', { pushedIds: pushed.map((e) => e.id) }, [
    { text: TEXT.wind, pos: null, tone: 'good' },
  ]);
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
    world.log.killsByWave[world.wave - 1]++;
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
  return { kind, spell, hits: [], blockedIds: [], pushedIds: [], scoreGained: 0, combo: world.combo, cooldownLeft: 0, texts, ...extra };
}
