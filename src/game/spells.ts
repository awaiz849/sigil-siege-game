// Spells: targeting, damage rules, combo, MISS / FIZZLE, lightning and wind cooldowns, and the shield.
// Every cast returns a SpellResult and adds floating-text events, so UI and sound can react. No drawing here.
import { CONFIG } from '../config.ts';
import { BEATS, effectiveness } from './types.ts';
import type { Element, Enemy, FloatText, SpellName, Vec3, World } from './types.ts';
import { removeEnemy } from './enemies.ts';
import { logCast } from './roundLog.ts';

/** Which spell each recognizer shape casts. The shield (open palm) and meteor (hand throw) are gestures, not shapes. */
export const SIGIL_SPELLS: Record<string, Exclude<SpellName, 'shield' | 'meteor'>> = {
  C: 'water',
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
  noMana: 'NO MANA',
  perfect: (bonus: number) => `PERFECT SIGIL! +${bonus}`,
  meteor: 'METEOR!',
  meteorCharging: (percent: number) => `METEOR ${percent}%`,
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
   *  nomana = not enough mana (nothing happens, no penalty), charging = meteor meter not full
   *  (nothing happens, no penalty), ignored = not in a round / nothing to aim at. */
  kind: 'hit' | 'kill' | 'block' | 'push' | 'miss' | 'fizzle' | 'cooldown' | 'nomana' | 'charging' | 'ignored';
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
  /** The shape was drawn cleanly enough for the PERFECT SIGIL bonus (see CONFIG.PERFECT_SIGIL). */
  perfect: boolean;
  /** Meteor only: where it landed (world units), for the explosion. */
  impactPos: Vec3 | null;
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
 * @param shape        recognizer name (line | v | zigzag | C | L), or null if not recognized
 * @param strokeCentre centre of the stroke in overlay pixels: picks the target
 * @param project      renderer's enemy -> screen position function
 * @param quality      recognizer score 0..1 (how cleanly it was drawn), for the PERFECT SIGIL bonus
 */
export function castSpell(
  world: World,
  shape: string | null,
  strokeCentre: ScreenPoint,
  project: ProjectFn,
  quality = 0,
): SpellResult {
  return castSpellOn(world, shape, pickTarget(world, strokeCentre, project), quality);
}

/** Same as castSpell, but with the target already chosen (enemy id, or null = no target). */
export function castSpellOn(world: World, shape: string | null, targetId: number | null, quality = 0): SpellResult {
  if (world.phase !== 'PLAYING') return result(world, 'ignored', null);
  const r = castShape(world, shape, targetId);
  if (quality >= CONFIG.PERFECT_SIGIL.minScore) rewardPerfect(world, r);
  logCast(world, shape, r.kind); // tuning log: pen down -> cast time
  return r;
}

/** Spells that did something: only these can earn the PERFECT SIGIL bonus (no farming on misses). */
const EFFECTIVE_KINDS: SpellResult['kind'][] = ['hit', 'kill', 'push', 'block'];

/** PERFECT SIGIL: a cleanly drawn shape that worked earns bonus points and mana. */
function rewardPerfect(world: World, r: SpellResult): void {
  if (!EFFECTIVE_KINDS.includes(r.kind)) return;
  const { bonus, mana } = CONFIG.PERFECT_SIGIL;
  world.score += bonus;
  world.mana = Math.min(CONFIG.MANA.max, world.mana + mana);
  world.stats.perfects++;
  chargeUltimate(world, CONFIG.METEOR.perPerfect);
  r.perfect = true;
  r.scoreGained += bonus;
  const text: FloatText = { text: TEXT.perfect(bonus), pos: null, tone: 'great' };
  r.texts.push(text);
  world.events.push({ type: 'floatText', ...text });
}

function castShape(world: World, shape: string | null, targetId: number | null): SpellResult {
  const spell = shape ? SIGIL_SPELLS[shape] : undefined;
  if (!spell) {
    world.mana = Math.max(0, world.mana - CONFIG.MANA.fizzle);
    return fail(world, 'fizzle', null);
  }
  if (spell === 'lightning') return castLightning(world);
  if (spell === 'wind') return castWind(world);

  if (world.mana < CONFIG.MANA.cost[spell]) return noMana(world, spell);
  world.mana -= CONFIG.MANA.cost[spell];
  const target = world.enemies.find((e) => e.id === targetId);
  if (!target) return fail(world, 'miss', spell); // the mana is spent anyway
  const hit = damageEnemy(world, target, spell);
  // The right element pays back part of its cost.
  if (hit.effect === 'strong') world.mana = Math.min(CONFIG.MANA.max, world.mana + CONFIG.MANA.strongRefund);
  return finish(world, spell, [hit]);
}

/** Not enough mana: nothing happens, no combo penalty. */
function noMana(world: World, spell: SpellName): SpellResult {
  return result(world, 'nomana', spell, {}, [{ text: TEXT.noMana, pos: null, tone: 'info' }]);
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
  if (world.mana < CONFIG.MANA.cost.lightning) return noMana(world, 'lightning');
  world.mana -= CONFIG.MANA.cost.lightning;
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
  if (world.mana < CONFIG.MANA.cost.wind) return noMana(world, 'wind');
  world.mana -= CONFIG.MANA.cost.wind;
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
  if (world.mana < CONFIG.MANA.cost.shield) return noMana(world, 'shield');
  world.mana -= CONFIG.MANA.cost.shield;
  for (const warlock of charging) {
    // The charge is lost: after the stun it waits a full recharge before charging again.
    warlock.state = 'recharge';
    warlock.stateT = 0;
    warlock.stunT = CONFIG.SHIELD_STUN_S;
  }
  const texts: FloatText[] = charging.map((w) => ({ text: TEXT.blocked, pos: { ...w.pos }, tone: 'good' }));
  return result(world, 'block', 'shield', { blockedIds: charging.map((w) => w.id) }, texts);
}

/** Fill the METEOR meter (capped). */
function chargeUltimate(world: World, amount: number): void {
  world.ultimate = Math.min(CONFIG.METEOR.meterMax, world.ultimate + amount);
}

/**
 * METEOR ultimate (fast hand throw). Needs a full meter; lands on the monster nearest the aim point
 * on screen and hits every monster within METEOR.radius of it (no element, stun x2 still counts).
 * Not full = "METEOR 60%", nothing happens. No monster to aim at = ignored, the meter is kept.
 */
export function castMeteor(world: World, aim: ScreenPoint, project: ProjectFn): SpellResult {
  if (world.phase !== 'PLAYING') return result(world, 'ignored', 'meteor');
  const { meterMax, radius, damage } = CONFIG.METEOR;
  if (world.ultimate < meterMax) {
    const percent = Math.floor((world.ultimate / meterMax) * 100);
    return result(world, 'charging', 'meteor', {}, [{ text: TEXT.meteorCharging(percent), pos: null, tone: 'info' }]);
  }
  const target = world.enemies.find((e) => e.id === pickTarget(world, aim, project));
  if (!target) return result(world, 'ignored', 'meteor');

  world.ultimate = 0;
  const impact = { ...target.pos, y: 0 };
  const inBlast = world.enemies.filter((e) => Math.hypot(e.pos.x - impact.x, e.pos.z - impact.z) <= radius);
  const hits = inBlast.map((e) => damageEnemy(world, e, null, damage, false));
  const r = finish(world, 'meteor', hits);
  r.impactPos = impact;
  const text: FloatText = { text: TEXT.meteor, pos: impact, tone: 'great' };
  r.texts.unshift(text);
  world.events.push({ type: 'floatText', ...text });
  return r;
}

/** Damage multiplier: effectiveness() of the elements (lightning has none), then x2 if stunned. */
export function damageMultiplier(spellElement: Element | null, enemy: Enemy): { mult: number; effect: Hit['effect'] } {
  let mult = spellElement ? effectiveness(spellElement, enemy.element) : 1;
  const effect: Hit['effect'] = mult > 1 ? 'strong' : mult < 1 ? 'weak' : 'normal';
  if (enemy.stunT > 0) mult *= CONFIG.DMG_STUNNED;
  return { mult, effect };
}

/** Apply base damage (times multipliers) to one enemy; a kill scores 100 x combo, raises the combo
 *  and (unless chargesUltimate is false, i.e. meteor kills) fills the METEOR meter. */
function damageEnemy(world: World, enemy: Enemy, spellElement: Element | null, base = CONFIG.DMG_BASE, chargesUltimate = true): Hit {
  const { mult, effect } = damageMultiplier(spellElement, enemy);
  const damage = base * mult;
  enemy.hp = Math.max(0, enemy.hp - damage);
  const hit: Hit = { enemyId: enemy.id, damage, effect, stunned: enemy.stunT > 0, killed: false, score: 0, pos: { ...enemy.pos } };

  if (enemy.hp <= 0) {
    hit.killed = true;
    hit.score = CONFIG.KILL_SCORE * world.combo;
    world.score += hit.score;
    world.combo = Math.min(CONFIG.MAX_COMBO, world.combo + 1);
    world.stats.kills++;
    world.log.killsByWave[world.wave - 1]++;
    if (chargesUltimate) chargeUltimate(world, CONFIG.METEOR.perKill);
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
  return { kind, spell, hits: [], blockedIds: [], pushedIds: [], scoreGained: 0, combo: world.combo, cooldownLeft: 0, texts, perfect: false, impactPos: null, ...extra };
}
