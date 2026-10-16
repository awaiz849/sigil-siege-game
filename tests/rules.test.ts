// Game rules test: every rule from CLAUDE.md "Spells", "Enemies" and win/lose, on hand-built worlds.
// Spells are cast like the real game: castSpell(world, shape, strokeCentre, project) with a fake project().
// Run: npm run test:rules
import { CONFIG } from '../src/config.ts';
import { effectiveness } from '../src/game/types.ts';
import type { Enemy, World } from '../src/game/types.ts';
import { createWorld, startRound, takeEvents, update } from '../src/game/world.ts';
import { castleMaxHp } from '../src/game/difficulty.ts';
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

/** Normal difficulty: castle HP and wall damage per monster type. */
const HP = CONFIG.DIFFICULTY.normal.castleHp;
const WALL = CONFIG.DIFFICULTY.normal.wallDamage;

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
    ['C', 'fire', 2], // water beats fire
    ['C', 'water', 0.5], // same element
    ['C', 'nature', 1],
    ['L', 'nature', 2], // fire beats nature
    ['L', 'fire', 0.5],
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
  check('strong hit reports effect', cast(w, 'C', imp).hits[0].effect === 'strong');
}

// ---- Stunned enemies take x2 more (stacks with element) ----
{
  const w = fresh();
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  boss.stunT = 2;
  const r = cast(w, 'C', boss);
  check('strong x stunned = 4', near(r.hits[0].damage, 4) && r.hits[0].stunned);
}

// ---- Kills: 100 x combo, combo +1 per kill, max x5 ----
{
  const w = fresh();
  const scores: number[] = [];
  for (let i = 0; i < 7; i++) {
    const bird = spawnEnemy(w, 'bird', 'nature', 0); // 1 HP
    const r = cast(w, 'L', bird);
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
  check('no enemies = miss', cast(w, 'C', null).kind === 'miss' && w.combo === 1);
  const imp = spawnEnemy(w, 'imp', 'water', 0);
  w.combo = 4;
  check('enemy off screen = miss', castSpell(w, 'C', { x: 0, y: 0 }, () => null).kind === 'miss' && w.combo === 1);
  w.combo = 4;
  check('dead/unknown id = miss', castSpellOn(w, 'C', 999).kind === 'miss' && w.combo === 1);
  w.combo = 4;
  check('null sigil = fizzle', cast(w, null, null).kind === 'fizzle' && w.combo === 1);
  w.combo = 4;
  check('unknown sigil = fizzle', cast(w, 'star', null).kind === 'fizzle' && w.combo === 1);
  w.combo = 3;
  check('hit without kill keeps combo', cast(w, 'L', imp).kind === 'hit' && w.combo === 3);
}

// ---- effectiveness(spell, enemy): 2 / 1 / 0.5 ----
{
  check('water > fire', effectiveness('water', 'fire') === 2);
  check('fire > nature', effectiveness('fire', 'nature') === 2);
  check('nature > water', effectiveness('nature', 'water') === 2);
  check('same element = 0.5', effectiveness('fire', 'fire') === 0.5);
  check('losing element = 1', effectiveness('fire', 'water') === 1);
  // Hints: the shape that beats each element.
  check('fire enemy -> C', counterShape('fire') === 'C');
  check('nature enemy -> L', counterShape('nature') === 'L');
  check('water enemy -> v', counterShape('water') === 'v');
}

// ---- Floating texts: in the result AND as world events ----
{
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', 0);
  const r = cast(w, 'C', imp); // water on fire: 2 damage kills the 2-HP imp
  const texts = r.texts.map((t) => t.text);
  check('super effective text', texts.includes(TEXT.superEffective), texts.join(','));
  check('kill score text', texts.includes('+100'), texts.join(','));
  check('texts placed over the enemy', r.texts.every((t) => t.pos !== null && t.pos.x === 0));
  cast(w, 'C', null);
  cast(w, null, null);
  const events = takeEvents(w).filter((e) => e.type === 'floatText');
  check('float text events', events.map((e) => e.text).join(',') === `${TEXT.superEffective},+100,${TEXT.miss},${TEXT.fizzle}`, events.map((e) => e.text).join(','));
  check('takeEvents clears the list', w.events.length === 0);
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  check('resisted text', cast(w, 'L', boss).texts.some((t) => t.text === TEXT.resisted));
  w.lightningCooldown = 6.2;
  check('cooldown text shows seconds', cast(w, 'zigzag', null).texts[0].text === TEXT.cooldown('lightning', 6.2) && TEXT.cooldown('lightning', 6.2) === 'LIGHTNING 7s');
}

// ---- Phases: MENU -> PLAYING -> WIN / LOSE ----
{
  const w = createWorld('normal', 1);
  check('new world waits in MENU', w.phase === 'MENU');
  update(w, 0.05);
  check('nothing moves in MENU', w.time === 0 && w.enemies.length === 0);
  check('no casting in MENU', cast(w, 'C', null).kind === 'ignored' && castShield(w).kind === 'ignored');
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
  check('warlock blast = 20', w.castleHp === HP - CONFIG.WARLOCK.blastDamage && warlock.state === 'recharge');
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
  check('blocked blast does no damage', w.castleHp === HP);
  const zBefore = a.pos.z;
  runEnemies(w, 2);
  check('stunned enemy frozen', a.pos.z === zBefore && a.stunT > 0 && a.stateT === 0);
  check('line is not the shield any more', cast(w, 'line', null).spell === 'wind');
}

// ---- Wind (drawn line): pushes walking enemies back, boss and casting warlocks hold, cooldown ----
{
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', -3);
  const bird = spawnEnemy(w, 'bird', 'water', 3);
  const boss = spawnEnemy(w, 'boss', 'nature', 0);
  const warlock = spawnEnemy(w, 'warlock', 'fire', 6);
  for (const e of w.enemies) e.pos.z = -10;
  warlock.state = 'charge';
  w.combo = 3;
  const r = cast(w, 'line', null);
  check('wind pushes walkers', r.kind === 'push' && r.pushedIds.length === 2 && imp.pos.z === -10 - CONFIG.WIND_PUSH && bird.pos.z === -10 - CONFIG.WIND_PUSH, JSON.stringify(r.pushedIds));
  check('wind: boss holds', boss.pos.z === -10);
  check('wind: casting warlock holds', warlock.pos.z === -10);
  check('wind keeps combo', w.combo === 3);
  check('wind sets cooldown', w.windCooldown === CONFIG.WIND_COOLDOWN_S);
  check('wind text', r.texts[0].text === TEXT.wind);
  const again = cast(w, 'line', null);
  check('wind on cooldown', again.kind === 'cooldown' && again.texts[0].text === `WIND ${CONFIG.WIND_COOLDOWN_S}s` && w.combo === 3);
  check('wind does no damage', imp.hp === CONFIG.IMP.hp);

  imp.pos.z = CONFIG.FIELD.spawnZ + 1;
  w.windCooldown = 0;
  cast(w, 'line', null);
  check('wind never pushes past the spawn line', imp.pos.z === CONFIG.FIELD.spawnZ);

  const empty = fresh();
  spawnEnemy(empty, 'boss', 'fire', 0);
  empty.combo = 4;
  check('wind with nothing to push = miss', cast(empty, 'line', null).kind === 'miss' && empty.combo === 1 && empty.windCooldown === 0);
}

// ---- Enemies at the wall: damage per type (Normal: imp/bird 10), removed. Birds dive. ----
{
  const w = fresh();
  const imp = spawnEnemy(w, 'imp', 'fire', 0);
  const bird = spawnEnemy(w, 'bird', 'fire', 3);
  check('bird starts high', bird.pos.y === CONFIG.BIRD_FLIGHT.flyY);
  const distance = CONFIG.FIELD.wallZ - CONFIG.FIELD.spawnZ;
  runEnemies(w, (distance - 2) / CONFIG.BIRD.speed);
  check('bird dives near the wall', bird.pos.y < CONFIG.BIRD_FLIGHT.flyY && bird.pos.y > CONFIG.BIRD_FLIGHT.diveY);
  runEnemies(w, distance / CONFIG.IMP.speed);
  check('wall hits = imp + bird damage', w.castleHp === HP - WALL.imp - WALL.bird);
  check('enemies removed at wall', !w.enemies.includes(imp) && !w.enemies.includes(bird));
}

// ---- Castle HP per difficulty: Easy 200, Normal 150, Hard 100 ----
check('castle HP easy 200', createWorld('easy').castleHp === 200 && castleMaxHp({ difficulty: 'easy' }) === 200);
check('castle HP normal 150', createWorld('normal').castleHp === 150);
check('castle HP hard 100', createWorld('hard').castleHp === 100);

// ---- Boss at the wall: stays and smashes the gate every smashS until killed ----
{
  const w = fresh();
  const boss = spawnEnemy(w, 'boss', 'fire', 0);
  boss.pos.z = CONFIG.FIELD.wallZ - 0.01;
  runEnemies(w, 0.05);
  check('boss hits the wall', w.castleHp === HP - WALL.boss && boss.state === 'smash');
  check('boss stays at the wall', w.enemies.includes(boss) && boss.pos.z === CONFIG.FIELD.wallZ);
  runEnemies(w, CONFIG.BOSS.smashS);
  check('boss smashes again', w.castleHp === HP - 2 * WALL.boss, String(w.castleHp));
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
  check('cast after game over ignored', cast(w, 'C', null).kind === 'ignored');

  const lose = fresh();
  lose.castleHp = 5;
  const imp = spawnEnemy(lose, 'imp', 'fire', 0);
  imp.pos.z = CONFIG.FIELD.wallZ - 0.01;
  update(lose, 0.05);
  check('castle at 0 HP loses', lose.castleHp === 0 && lose.phase === 'LOSE');

  // Survive the round: the "player" clears the field every frame (boss too), so no damage -> 3 clean waves.
  const win = fresh();
  while (win.phase === 'PLAYING') {
    update(win, 1 / 60);
    win.enemies = [];
  }
  check('surviving 90 s wins', win.phase === 'WIN' && win.time >= CONFIG.ROUND_SECONDS);
  check('3 clean waves = +1500', win.score === 3 * CONFIG.CLEAN_WAVE_BONUS, `score ${win.score}`);

  // The clock can't end the round while the boss lives: it must be killed.
  const overtime = fresh();
  overtime.castleHp = Infinity;
  while (overtime.time < CONFIG.ROUND_SECONDS + 5) {
    update(overtime, 1 / 60);
    overtime.enemies = overtime.enemies.filter((e) => e.type === 'boss');
  }
  const lateBoss = overtime.enemies.find((e) => e.type === 'boss');
  check('boss alive = no win at 90 s', overtime.phase === 'PLAYING' && lateBoss !== undefined);
  if (lateBoss) lateBoss.hp = 1;
  cast(overtime, 'v', lateBoss ?? null);
  cast(overtime, 'C', lateBoss ?? null);
  cast(overtime, 'L', lateBoss ?? null);
  update(overtime, 0.01);
  check('killing the boss in overtime wins', overtime.phase === 'WIN');

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

// ---- Mana: every cast costs mana, the right element refunds some, empty = NO MANA ----
{
  const M = CONFIG.MANA;
  const w = fresh();
  check('mana starts full', w.mana === M.max);
  const imp = spawnEnemy(w, 'imp', 'nature', 0);
  imp.hp = 10;
  cast(w, 'C', imp); // water on nature: normal hit
  check('cast costs mana', w.mana === M.max - M.cost.water, String(w.mana));
  cast(w, 'L', imp); // fire on nature: super effective, part refunded
  check('super effective refunds', w.mana === M.max - M.cost.water - M.cost.fire + M.strongRefund, String(w.mana));

  w.mana = M.cost.water - 1;
  w.combo = 3;
  const hpBefore = imp.hp;
  const r = cast(w, 'C', imp);
  check('not enough mana = nomana', r.kind === 'nomana' && r.texts[0].text === TEXT.noMana);
  check('nomana: no damage, no mana spent, combo kept', imp.hp === hpBefore && w.mana === M.cost.water - 1 && w.combo === 3);

  w.mana = 50;
  cast(w, null, imp);
  check('fizzle costs a little', w.mana === 50 - M.fizzle);
  w.mana = 50;
  castShield(w);
  check('shield with nothing to block costs nothing', w.mana === 50);

  // Refill: manaRegen per second (Normal), capped at max.
  const regen = fresh();
  regen.mana = 0;
  for (let i = 0; i < 60; i++) update(regen, 1 / 60);
  check('mana refills per second', Math.abs(regen.mana - CONFIG.DIFFICULTY.normal.manaRegen) < 0.5, String(regen.mana));
  for (let i = 0; i < 1200; i++) update(regen, 1 / 60);
  check('mana capped at max', regen.mana === M.max);
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
  cast(w, 'C', target);
  const stroke = w.log.strokes[0];
  check('stroke logged', w.log.strokes.length === 1 && Math.abs(stroke.seconds - 1.5) < 1e-6, JSON.stringify(stroke));
  cast(w, 'C', target);
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
