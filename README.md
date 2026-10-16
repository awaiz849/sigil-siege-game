# Sigil Siege

**Defend a castle wall with no controller.** You play a wizard on the battlements at night (third-person 3D) and draw
sigils in the air with one finger, tracked by your webcam.
**The shape picks the spell. Where you draw picks the target.**

OpenForge Hackathon, Track 2 Play Lab, problem PL04 *Controllerless*. Team Velocity.

No keyboard, mouse or touch is needed at any point, including the menus, starting and playing again.

## How to play

| Hand pose | What it does |
|---|---|
| Index finger out | Pen down: draw a sigil |
| Index + middle finger out | Pen up: the spell is cast |
| Open palm | Shield (blocks charging warlocks and stuns them) |
| Fist / anything else | Move the cursor without drawing |
| Hold open palm 1.2 s | Start / play again |
| Hover a button 0.8 s | Select it (difficulty) |

| Sigil | Spell | Effect |
|---|---|---|
| C (half circle; a full circle works too) | Water | Hits one enemy, beats Fire |
| L | Fire | Hits one enemy, beats Nature |
| V | Nature | Hits one enemy, beats Water |
| W zigzag | Lightning | 1 damage to every enemy, 10 s cooldown |
| — straight line | Wind | Pushes every walking enemy back, 12 s cooldown |
| open palm | Shield | Blocks every charging warlock and stuns it for 3 s |

The target is the enemy closest to the centre of your sigil (a gold ring shows it while you draw).
Super-effective hits do double damage, and stunned enemies take double again. Kills build a combo up to x5.
Survive 90 seconds or defeat the crowned boss to win.

## How to run

```
npm install
npm run dev
```

Open http://localhost:5173 in Chrome and allow the camera. Stand 1 to 1.5 m away, facing the light.

- Sound without clicking first: start Chrome with `--autoplay-policy=no-user-gesture-required`.
- Everything works offline: the MediaPipe model and wasm files and the fonts are served from `public/`.
- Without a camera the game starts in a clearly labelled **MOUSE DEBUG MODE**: left drag draws,
  holding the right button acts as the open palm.
- Debug keys (development only): `D` debug overlay, `M` toggle mouse input,
  `R` record a template, `Shift+R` delete recorded templates.
- Tests: `npm test` (recognizer, poses, game rules, spawns, UI helpers; plain Node, no test framework).

## How it works

```
webcam -> MediaPipe HandLandmarker -> One Euro filter -> finger poses -> stroke
       -> $1 recognizer -> spell -> game logic (World) -> three.js renderer + 2D overlay
```

1. **Hand tracking**: MediaPipe Hand Landmarker finds 21 hand points per frame (GPU, with CPU fallback).
2. **Smoothing**: a One Euro filter removes fingertip jitter without adding lag on fast moves.
3. **Poses**: a finger counts as extended when its tip is clearly farther from the wrist than its
   middle joint, so it works at any hand angle. A pose must hold for 3 frames before it counts.
   A pinch mode is kept as a fallback.
4. **Recognition**: a quick geometric check first (almost straight = line; closed vs open stroke),
   then our own port of the $1 Unistroke Recognizer against templates generated from math.
   If nothing is confident it retries against all templates; below a score of 0.8 the spell fizzles.
5. **Game logic** (`src/game/`) is pure TypeScript with no drawing, so every rule is tested in Node.
6. **Rendering**: three.js scene built only from primitives (no downloaded models), with bloom.
   A 2D canvas on top draws the HUD, enemy badges, trail, texts and menus.
7. **Sound**: every effect is synthesized live with the Web Audio API (no audio files).

| Folder | What is in it |
|---|---|
| `src/input/` | webcam + hand tracking, poses, One Euro filter, mouse debug input, dwell / palm-hold helpers |
| `src/recognizer/` | $1 recognizer, precheck, templates, template recorder |
| `src/game/` | world, enemies, spells, waves, difficulty, crowd rules |
| `src/render/` | three.js scene, environment, enemy models, particles |
| `src/ui/` | HUD, badges, floating texts, trail, screens, debug overlay |
| `src/audio/` | synthesized sounds |
| `src/config.ts` | every tunable number in one place |
| `tests/` | Node test scripts |

## Credits and disclosures

- **MediaPipe Hand Landmarker** by Google, Apache License 2.0 (`@mediapipe/tasks-vision` and the `hand_landmarker.task` model).
- **three.js**, MIT License.
- **$1 Unistroke Recognizer**: J. O. Wobbrock, A. D. Wilson and Y. Li, "Gestures without libraries,
  toolkits or training", UIST 2007. Our implementation is our own port.
- **1€ Filter**: G. Casiez, N. Roussel and D. Vogel, "1€ Filter: A Simple Speed-based Low-pass Filter
  for Noisy Input in Interactive Systems", CHI 2012. Our implementation is our own port.
- **Fonts**: Silkscreen (Jason Kottke) and DotGothic16 (Fontworks), SIL Open Font License 1.1.
  License texts are in `public/fonts/`.
- **Vite** and **TypeScript** for the build.
- **AI assistance**: Claude and Claude Code were used for planning and coding help.

Team Velocity:
- Vasi: input, recognition, 3D world, UI, sound
- Awaiz: gameplay logic
- Farhan: demo and presentation
