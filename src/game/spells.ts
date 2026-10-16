// Spells: damage rules, combo, MISS / FIZZLE, lightning cooldown and the shield.
// Every cast returns a SpellResult so UI and sound can react. No drawing here.
import { CONFIG } from '../config.ts';
import type { Element, Enemy, SpellName, Vec3, World } from './types.ts';
import { removeEnemy } from './enemies.ts';

/** Which spell each recognizer sigil casts. "line" = shield (mouse debug only). */
export const SIGIL_SPELLS: Record<string, SpellName> = {
  circle: 'water',
  triangle: 'fire',
  v: 'nature',
  zigzag: 'lightning',
  line: 'shield',
};

/** Rock-paper-scissors: each element beats the next one. Water > Fire > Nature > Water. */
export const BEATS: Record<Element, Element> = {
  water: 'fire',
  fire: 'nature',
  nature: 'water',
};

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
   *  miss = no target / nothing to block, fizzle = sigil not recognized,
   *  cooldown = lightning not ready (no penalty), ignored = round is over. */
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
}

function result(world: World, kind: SpellResult['kind'], spell: SpellName | null, extra: Partial<SpellResult> = {}): SpellResult {
  return { kind, spell, hits: [], blockedIds: [], scoreGained: 0, combo: world.combo, cooldownLeft: 0, ...extra };
}

/** MISS and FIZZLE reset the combo. */
function fail(world: World, kind: 'miss' | 'fizzle', spell: SpellName | null): SpellResult {
  world.combo = 1;
  return result(world, kind, spell);
}

/**
 * Target = the living enemy whose SCREEN position is nearest the stroke centre.
 * project(enemy) comes from the renderer (null = off screen), so this file never needs three.js.
 */
export function pickTarget(
  world: World,
  centre: { x: number; y: number },
  project: (enemy: Enemy) => { x: number; y: number } | null,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const enemy of world.enemies) {
    const p = project(enemy);
    if (!p) continue;
    const d = Math.hypot(p.x - centre.x, p.y - centre.y);
    if (d < bestDist) {
      bestDist = d;
      best = enemy.id;
    }
  }
  return best;
}

/**
 * Cast the spell for a recognized sigil.
 * @param sigilName recognizer name (line | v | zigzag | circle | triangle), or null if not recognized
 * @param targetId  enemy nearest the stroke centre on screen, or null if none
 */
export function castSpell(world: World, sigilName: string | null, targetId: number | null): SpellResult {
  if (world.phase !== 'playing') return result(world, 'ignored', null);
  const spell = sigilName ? SIGIL_SPELLS[sigilName] : undefined;
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
    return result(world, 'cooldown', 'lightning', { cooldownLeft: world.lightningCooldown });
  }
  if (world.enemies.length === 0) return fail(world, 'miss', 'lightning');
  world.lightningCooldown = CONFIG.LIGHTNING_COOLDOWN_S;
  // Copy the list: killed enemies are removed while we loop.
  const hits = world.enemies.slice().map((e) => damageEnemy(world, e, null));
  return finish(world, 'lightning', hits);
}

/** Shield (open palm): blocks every charging warlock and stuns each one. */
export function castShield(world: World): SpellResult {
  if (world.phase !== 'playing') return result(world, 'ignored', 'shield');
  const charging = world.enemies.filter((e) => e.type === 'warlock' && e.state === 'charge' && e.stunT === 0);
  if (charging.length === 0) return fail(world, 'miss', 'shield');
  for (const warlock of charging) {
    // The charge is lost: after the stun it waits a full recharge before charging again.
    warlock.state = 'recharge';
    warlock.stateT = 0;
    warlock.stunT = CONFIG.SHIELD_STUN_S;
  }
  return result(world, 'block', 'shield', { blockedIds: charging.map((w) => w.id) });
}

/** Damage multiplier: x2 if the spell beats the element, x0.5 if same element, then x2 if stunned. */
export function damageMultiplier(spellElement: Element | null, enemy: Enemy): { mult: number; effect: Hit['effect'] } {
  let mult = 1;
  let effect: Hit['effect'] = 'normal';
  if (spellElement && BEATS[spellElement] === enemy.element) {
    mult = CONFIG.DMG_STRONG;
    effect = 'strong';
  } else if (spellElement === enemy.element) {
    mult = CONFIG.DMG_WEAK;
    effect = 'weak';
  }
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
    if (enemy.type === 'boss') world.bossDefeated = true; // updateWorld ends the round
    removeEnemy(world, enemy.id);
  }
  return hit;
}

function finish(world: World, spell: SpellName, hits: Hit[]): SpellResult {
  const scoreGained = hits.reduce((sum, h) => sum + h.score, 0);
  const kind = hits.some((h) => h.killed) ? 'kill' : 'hit';
  return result(world, kind, spell, { hits, scoreGained });
}
