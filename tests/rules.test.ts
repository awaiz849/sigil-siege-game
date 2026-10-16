// Game rules test: every rule from CLAUDE.md "Spells", "Enemies" and win/lose, on hand-built worlds.
// Spells are cast like the real game: castSpell(world, shape, strokeCentre, project) with a fake project().
// Run: npm run test:rules
import { CONFIG } from '../src/config.ts';
import { effectiveness } from '../src/game/types.ts';
import type { Enemy, World } from '../src/game/types.ts';
import { createWorld, startRound, takeEvents, update } from '../src/game/world.ts';
import { spawnEnemy, updateEnemies, warlockStopZ } from '../src/game/enemies.ts';
import { TEXT, castShield, castSpell, castSpellOn, counterShape, pickTarget } from '../src/game/spells.ts';
import { pushApart } from '../src/game/crowd.ts';
import { formatRoundLog, noteStrokeStart } from '../src/game/roundLog.ts';

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passes++;
  else {
    failures++;
    console.log(`FAIL ${name} ${detail}`);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Empty world in a running round: no spawns happen because we never call update on it (only updateEnemies). */
const fresh = (): World => startRound(createWorld('normal', 42));

/** Fake renderer: screen x = 500 + 50 * world x, every enemy at screen y 300. */
const fakeProject = (e: Enemy) => ({ x: 500 + e.pos.x * 50, y: 300 });

/** Draw a shape right on top of an enemy, or at the far corner when target is null. */
function cast(w: World, shape: string | null, target: Enemy | null) {
  return castSpell(w, shape, target ? fakeProject(target) : { x: 0, y: 0 }, fakeProject);
}

/** Run only the enemy logic for `seconds`, in small steps. */
function runEnemies(world: World, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.01) updateEnemies(world, 0.01);
}

// ---- Element damage: base 1, x2 strong, x0.5 same element, x1 otherwise ----
{
  const cases: Array<[string, 'fire' | 'water' | 'nature', number]> = [
    ['circle', 'fire', 2], // water beats fire
    ['circle', 'water', 0.5], // same element
    ['circle', 'nature', 1],
    ['triangle', 'nature', 2], // fire beats nature
    ['triangle', 'fire', 0.5],
    ['v', 'water', 2], // nature beats water
    ['v', 'nature', 0.5],
  ];
  for (const [sigil, element, expected] of cases) {
    const w = fresh();
    const boss = spawnEnemy(w, 'boss', element, 0); // 8 HP, nothing dies
    const r = cast(w, sigil, boss);
    check(`${sigil} vs ${element} = ${expected}`, r.kind === 'hit' && near(r.hits[0].damage, expected), JSON.stringify(r.hits));
    check(`${sigil} vs ${element} hp`, near(boss.hp, CONFIG.BOSS.hp - expected));
  }
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', 0);
  check('strong hit reports effect', cast(w, 'circle', imp).hits[0].effect === 'strong');
}

// ---- Stunned enemies take x2 more (stacks with element) ----
{
  const w = fresh();
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  boss.stunT = 2;
  const r = cast(w, 'circle', boss);
  check('strong x stunned = 4', near(r.hits[0].damage, 4) && r.hits[0].stunned);
}

// ---- Kills: 100 x combo, combo +1 per kill, max x5 ----
{
  const w = fresh();
  const scores: number[] = [];
  for (let i = 0; i < 7; i++) {
    const bird = spawnEnemy(w, 'bird', 'nature', 0); // 1 HP
    const r = cast(w, 'triangle', bird);
    check(`kill ${i} kind`, r.kind === 'kill' && w.enemies.length === 0);
    scores.push(r.scoreGained);
  }
  check('combo scores 100..500 then capped', scores.join(',') === '100,200,300,400,500,500,500', scores.join(','));
  check('combo capped at max', w.combo === CONFIG.MAX_COMBO);
  check('kills counted', w.stats.kills === 7);
}

// ---- MISS and FIZZLE reset the combo ----
{
  const w = fresh();
  w.combo = 4;
  check('no enemies = miss', cast(w, 'circle', null).kind === 'miss' && w.combo === 1);
  const imp = spawnEnemy(w, 'imp', 'water', 0);
  w.combo = 4;
  check('enemy off screen = miss', castSpell(w, 'circle', { x: 0, y: 0 }, () => null).kind === 'miss' && w.combo === 1);
  w.combo = 4;
  check('dead/unknown id = miss', castSpellOn(w, 'circle', 999).kind === 'miss' && w.combo === 1);
  w.combo = 4;
  check('null sigil = fizzle', cast(w, null, null).kind === 'fizzle' && w.combo === 1);
  w.combo = 4;
  check('unknown sigil = fizzle', cast(w, 'star', null).kind === 'fizzle' && w.combo === 1);
  w.combo = 3;
  check('hit without kill keeps combo', cast(w, 'triangle', imp).kind === 'hit' && w.combo === 3);
}

// ---- effectiveness(spell, enemy): 2 / 1 / 0.5 ----
{
  check('water > fire', effectiveness('water', 'fire') === 2);
  check('fire > nature', effectiveness('fire', 'nature') === 2);
  check('nature > water', effectiveness('nature', 'water') === 2);
  check('same element = 0.5', effectiveness('fire', 'fire') === 0.5);
  check('losing element = 1', effectiveness('fire', 'water') === 1);
  // Hints: the shape that beats each element.
  check('fire enemy -> circle', counterShape('fire') === 'circle');
  check('nature enemy -> triangle', counterShape('nature') === 'triangle');
  check('water enemy -> v', counterShape('water') === 'v');
}

// ---- Floating texts: in the result AND as world events ----
{
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', 0);
  const r = cast(w, 'circle', imp); // water on fire: 2 damage kills the 2-HP imp
  const texts = r.texts.map((t) => t.text);
  check('super effective text', texts.includes(TEXT.superEffective), texts.join(','));
  check('kill score text', texts.includes('+100'), texts.join(','));
  check('texts placed over the enemy', r.texts.every((t) => t.pos !== null && t.pos.x === 0));
  cast(w, 'circle', null);
  cast(w, null, null);
  const events = takeEvents(w).filter((e) => e.type === 'floatText');
  check('float text events', events.map((e) => e.text).join(',') === `${TEXT.superEffective},+100,${TEXT.miss},${TEXT.fizzle}`, events.map((e) => e.text).join(','));
  check('takeEvents clears the list', w.events.length === 0);
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  check('resisted text', cast(w, 'triangle', boss).texts.some((t) => t.text === TEXT.resisted));
  w.lightningCooldown = 6.2;
  check('cooldown text shows seconds', cast(w, 'zigzag', null).texts[0].text === TEXT.cooldown(6.2) && TEXT.cooldown(6.2) === 'LIGHTNING 7s');
}

// ---- Phases: MENU -> PLAYING -> WIN / LOSE ----
{
  const w = createWorld('normal', 1);
  check('new world waits in MENU', w.phase === 'MENU');
  update(w, 0.05);
  check('nothing moves in MENU', w.time === 0 && w.enemies.length === 0);
  check('no casting in MENU', cast(w, 'circle', null).kind === 'ignored' && castShield(w).kind === 'ignored');
  startRound(w);
  update(w, 0.05);
  check('startRound -> PLAYING', w.phase === 'PLAYING' && w.time > 0);
  update(w, 10);
  check('dt capped at MAX_DT', Math.abs(w.time - 2 * CONFIG.MAX_DT) < 1e-9, `time ${w.time}`);
}

// ---- Lightning: 1 damage to every enemy, 10 s cooldown, cooldown costs nothing ----
{
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', -3);
  const bird = spawnEnemy(w, 'bird', 'water', 3);
  const boss = spawnEnemy(w, 'boss', 'nature', 0);
  const r = cast(w, 'zigzag', null);
  check('lightning hits all', r.hits.length === 3 && r.kind === 'kill');
  check('lightning ignores elements', near(imp.hp, 1) && near(boss.hp, CONFIG.BOSS.hp - 1));
  check('lightning kills 1-HP bird', !w.enemies.includes(bird));
  check('lightning sets cooldown', near(w.lightningCooldown, CONFIG.LIGHTNING_COOLDOWN_S));
  w.combo = 3;
  const again = cast(w, 'zigzag', null);
  check('lightning on cooldown', again.kind === 'cooldown' && near(again.cooldownLeft, CONFIG.LIGHTNING_COOLDOWN_S));
  check('cooldown keeps combo', w.combo === 3);
  check('cooldown does no damage', near(imp.hp, 1));

  const empty = fresh();
  check('lightning with no enemies = miss', cast(empty, 'zigzag', null).kind === 'miss');
  check('missed lightning keeps it ready', empty.lightningCooldown === 0);

  // Cooldown ticks down in update.
  const timed = fresh();
  timed.lightningCooldown = 1;
  for (let i = 0; i < 30; i++) update(timed, 0.05);
  check('cooldown ticks to 0', timed.lightningCooldown === 0);
}

// ---- Warlock: stops halfway, charges 3 s, blasts 20, re-charges after 4 s ----
{
  const w = fresh();
  const warlock = spawnEnemy(w, 'warlock', 'fire', 0);
  const walkTime = (warlockStopZ() - CONFIG.FIELD.spawnZ) / CONFIG.WARLOCK.speed;
  runEnemies(w, walkTime + 0.05);
  check('warlock stops halfway', near(warlock.pos.z, warlockStopZ()) && warlock.state === 'charge');
  runEnemies(w, CONFIG.WARLOCK.chargeS);
  check('warlock blast = 20', w.castleHp === CONFIG.CASTLE_HP - CONFIG.WARLOCK.blastDamage && warlock.state === 'recharge');
  runEnemies(w, CONFIG.WARLOCK.rechargeS);
  check('warlock charges again', warlock.state === 'charge');
}

// ---- Shield: blocks every charging warlock, stuns 3 s; nothing to block = MISS ----
{
  const w = fresh();
  const a = spawnEnemy(w, 'warlock', 'fire', -3);
  const b = spawnEnemy(w, 'warlock', 'water', 3);
  const imp = spawnEnemy(w, 'imp', 'nature', 0);
  w.combo = 3;
  check('shield with no charging warlock = miss', castShield(w).kind === 'miss' && w.combo === 1);
  a.state = 'charge';
  b.state = 'charge';
  a.stateT = 2.9; // just about to blast
  const r = castShield(w);
  check('shield blocks both', r.kind === 'block' && r.blockedIds.length === 2);
  check('blocked warlocks stunned 3 s', a.stunT === CONFIG.SHIELD_STUN_S && b.stunT === CONFIG.SHIELD_STUN_S);
  check('imp not stunned', imp.stunT === 0);
  imp.pos.z = CONFIG.FIELD.spawnZ; // keep the imp away from the wall
  runEnemies(w, 0.5);
  check('blocked blast does no damage', w.castleHp === CONFIG.CASTLE_HP);
  const zBefore = a.pos.z;
  runEnemies(w, 2);
  check('stunned enemy frozen', a.pos.z === zBefore && a.stunT > 0 && a.stateT === 0);
  check('line sigil = shield', cast(w, 'line', null).spell === 'shield');
}

// ---- Enemies at the wall: 10 damage, removed. Birds dive. ----
{
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', 0);
  const bird = spawnEnemy(w, 'bird', 'fire', 3);
  check('bird starts high', bird.pos.y === CONFIG.BIRD_FLIGHT.flyY);
  const distance = CONFIG.FIELD.wallZ - CONFIG.FIELD.spawnZ;
  runEnemies(w, (distance - 2) / CONFIG.BIRD.speed);
  check('bird dives near the wall', bird.pos.y < CONFIG.BIRD_FLIGHT.flyY && bird.pos.y > CONFIG.BIRD_FLIGHT.diveY);
  runEnemies(w, distance / CONFIG.IMP.speed);
  check('wall hits = 2 x 10', w.castleHp === CONFIG.CASTLE_HP - 2 * CONFIG.WALL_HIT_DAMAGE);
  check('enemies removed at wall', !w.enemies.includes(imp) && !w.enemies.includes(bird));
}

// ---- Boss: element swap every 5 s with a 1.5 s warning ----
{
  const w = fresh();
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  runEnemies(w, CONFIG.BOSS.elementSwapS - CONFIG.BOSS.swapWarningS - 0.05);
  check('no warning yet', boss.nextElement === null);
  runEnemies(w, 0.1);
  const next = boss.nextElement;
  check('warning shows next element', next !== null && next !== 'fire');
  runEnemies(w, CONFIG.BOSS.swapWarningS);
  check('boss swapped to warned element', boss.element === next && boss.nextElement === null);
}

// ---- Win / lose / clean-wave bonus ----
{
  const w = fresh();
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  boss.hp = 1;
  cast(w, 'v', boss);
  update(w, 0.01);
  check('killing the boss wins', w.phase === 'WIN' && w.events.some((e) => e.type === 'gameOver'));
  check('cast after game over ignored', cast(w, 'circle', null).kind === 'ignored');

  const lose = fresh();
  lose.castleHp = 5;
  const imp = spawnEnemy(lose, 'imp', 'fire', 0);
  imp.pos.z = CONFIG.FIELD.wallZ - 0.01;
  update(lose, 0.05);
  check('castle at 0 HP loses', lose.castleHp === 0 && lose.phase === 'LOSE');

  // Survive the round: the "player" clears the field every frame, so no damage -> 3 clean waves.
  const win = fresh();
  while (win.phase === 'PLAYING') {
    update(win, 1 / 60);
    win.enemies = win.enemies.filter((e) => e.type === 'boss');
    for (const e of win.enemies) e.pos.z = CONFIG.FIELD.spawnZ; // boss never arrives
  }
  check('surviving 90 s wins', win.phase === 'WIN' && win.time >= CONFIG.ROUND_SECONDS);
  check('3 clean waves = +1500', win.score === 3 * CONFIG.CLEAN_WAVE_BONUS, `score ${win.score}`);

  // Damage in wave 1 loses only that wave's bonus.
  const hurt = fresh();
  update(hurt, 0.05);
  hurt.castleHp -= 10;
  hurt.waveDamaged = true;
  while (hurt.time < CONFIG.WAVE_SECONDS + 1) {
    update(hurt, 1 / 60);
    hurt.enemies = [];
  }
  check('damaged wave gets no bonus', hurt.score === 0 && hurt.wave === 2, `score ${hurt.score}`);
}

// ---- Targeting: nearest enemy on SCREEN to the stroke centre ----
{
  const w = fresh();
  const a = spawnEnemy(w, 'imp', 'fire', -6);
  const b = spawnEnemy(w, 'imp', 'fire', 6);
  check('target left', pickTarget(w, { x: 250, y: 300 }, fakeProject) === a.id);
  check('target right', pickTarget(w, { x: 700, y: 280 }, fakeProject) === b.id);
  check('off-screen skipped', pickTarget(w, { x: 250, y: 300 }, (e) => (e.id === a.id ? null : fakeProject(e))) === b.id);
  check('no enemies = null', pickTarget(fresh(), { x: 0, y: 0 }, fakeProject) === null);
}

// ---- Crowd: push apart; boss / stunned / charging warlocks hold their ground ----
{
  const w = fresh();
  const a = spawnEnemy(w, 'imp', 'fire', 0);
  const b = spawnEnemy(w, 'imp', 'fire', 0);
  pushApart(w);
  check('overlapping imps pushed apart', Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) >= a.radius + b.radius - 1e-6);

  const w2 = fresh();
  const boss = spawnEnemy(w2, 'boss', 'fire', 0);
  const imp = spawnEnemy(w2, 'imp', 'fire', 0.5);
  pushApart(w2);
  check('boss not pushed', boss.pos.x === 0 && boss.pos.z === CONFIG.FIELD.spawnZ);
  check('imp pushed off boss', Math.abs(imp.pos.x) > 0.5);

  const w3 = fresh();
  const warlock = spawnEnemy(w3, 'warlock', 'fire', 0);
  warlock.state = 'charge';
  spawnEnemy(w3, 'imp', 'fire', 0.2);
  pushApart(w3);
  check('charging warlock not pushed', warlock.pos.x === 0);

  const w4 = fresh();
  const bird = spawnEnemy(w4, 'bird', 'fire', 0);
  spawnEnemy(w4, 'imp', 'fire', 0);
  pushApart(w4);
  check('birds fly over ground enemies', bird.pos.x === 0);
}

// ---- Round log (A3 tuning): pen down -> cast, kills and damage per wave, enemies per second ----
{
  const w = startRound(createWorld('normal', 5));
  for (let i = 0; i < 60; i++) update(w, 0.05); // 3 s
  noteStrokeStart(w);
  for (let i = 0; i < 30; i++) update(w, 0.05); // drawing for 1.5 s
  const target = w.enemies[0];
  cast(w, 'circle', target);
  const stroke = w.log.strokes[0];
  check('stroke logged', w.log.strokes.length === 1 && Math.abs(stroke.seconds - 1.5) < 1e-6, JSON.stringify(stroke));
  cast(w, 'circle', target);
  check('cast without pen-down not logged', w.log.strokes.length === 1);
  check('enemies sampled each second', w.log.enemiesPerSecond.length === 4, String(w.log.enemiesPerSecond));
  const kills = w.stats.kills;
  check('kills per wave', w.log.killsByWave[0] === kills && kills > 0, String(w.log.killsByWave));

  // Let enemies hit the castle in wave 1.
  w.castleHp = 1e9;
  while (w.time < 25) update(w, 0.05);
  check('damage logged in wave 1', w.log.damageByWave[0] > 0 && w.log.damageByWave[1] === 0, String(w.log.damageByWave));
  const report = formatRoundLog(w);
  check('report has the lines', report.includes('pen down -> cast avg 1.50 s') && report.includes('castle damage per wave'), report);
}

if (failures > 0) throw new Error(`${failures} rule checks failed (${passes} passed)`);
console.log(`ALL ${passes} rule checks passed`);
