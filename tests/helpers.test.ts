// Tests for the hands-free UI helpers (dwell + palm hold), driven by fake cursor events and times.
// Run: npm run test:helpers
import { emitCursor } from '../src/events.ts';
import { createDwell } from '../src/input/dwell.ts';
import { createPalmHold } from '../src/input/palmHold.ts';

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

// ---- dwell: 0.8 s over a 100x50 button at (100, 100)
{
  let selected = 0;
  const dwell = createDwell(() => ({ x: 100, y: 100, w: 100, h: 50 }), () => selected++, 0.8);
  emitCursor(150, 125, 'other');
  dwell.update(0);
  dwell.update(400);
  check(Math.abs(dwell.progress - 0.5) < 0.01 && selected === 0, `halfway after 0.4 s (progress ${dwell.progress.toFixed(2)})`);
  dwell.update(800);
  check(selected === 1, 'fires after 0.8 s');
  dwell.update(2000);
  check(selected === 1, 'does not fire again while still hovering');
  emitCursor(10, 10, 'other');
  dwell.update(2100);
  check(dwell.progress === 0, 'leaving resets progress');
  emitCursor(150, 125, 'other');
  dwell.update(3000);
  dwell.update(3500);
  emitCursor(250, 125, 'other'); // left early
  dwell.update(3600);
  emitCursor(150, 125, 'other');
  dwell.update(3700);
  dwell.update(4300);
  check(selected === 1, 'leaving early restarts the timer');
  dwell.update(4500);
  check(selected === 2, 'fires again after a full new hold');
  dwell.dispose();
}

// ---- palm hold: 1.2 s
{
  let held = 0;
  const hold = createPalmHold(() => held++, 1.2);
  emitCursor(0, 0, 'palm');
  hold.update(0);
  hold.update(600);
  check(Math.abs(hold.progress - 0.5) < 0.01, `halfway after 0.6 s (progress ${hold.progress.toFixed(2)})`);
  emitCursor(0, 0, 'other'); // palm closed early
  hold.update(700);
  check(hold.progress === 0 && held === 0, 'closing the palm resets');
  emitCursor(0, 0, 'palm');
  hold.update(1000);
  hold.update(2200);
  check(held === 1, 'fires after 1.2 s of palm');
  hold.update(5000);
  check(held === 1, 'fires once per hold');
  hold.dispose();
}

if (failures > 0) throw new Error(`${failures} helper checks failed`);
console.log('ALL helper checks passed');
