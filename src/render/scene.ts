// three.js world: renderer + bloom, first-person camera on the castle wall, environment, enemies.
// render(world) only READS the World. project() turns an enemy into overlay pixels
// (used for targeting and for badges drawn on the 2D overlay).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../config.ts';
import type { Enemy, Hero, World } from '../game/types.ts';
import { createEnvironment, WALL_TOP } from './environment.ts';
import { createEnemyView } from './enemyView.ts';
import { createParticles } from './particles.ts';
import { ELEMENT_COLOR, PALETTE } from './palette.ts';
import { radialTexture } from './environment.ts';
import { createWizard } from './wizard.ts';
import { createCastleFire } from './castleFire.ts';
import { createEnding } from './ending.ts';
import { castleMaxHp } from '../game/difficulty.ts';
import { InkOutlinePass, toon } from './toon.ts';
import { mixNum, themedColor, themeForWave, THEMES, type PerTheme, type Themed, type ThemeWeights } from './themes.ts';

/** A spell orb flying from where the sigil was drawn to its target. */
type Shot = { sprite: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; t: number; color: number; onArrive: () => void };

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = CONFIG.SHADOWS;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const valleyLight = CONFIG.WAVE_SCENERY.light.valley;
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.FogExp2(PALETTE.fog, valleyLight.fog);

  // Third-person camera: behind and above the wizard on the wall, looking down the field.
  const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.fov, 1, 0.1, 1000);
  const camBase = new THREE.Vector3(CONFIG.CAMERA.x, WALL_TOP + CONFIG.CAMERA.height, CONFIG.FIELD.wallZ + CONFIG.CAMERA.back);
  const lookAt = new THREE.Vector3(0, CONFIG.CAMERA.lookAtY, CONFIG.CAMERA.lookAtZ);
  camera.position.copy(camBase);
  camera.lookAt(lookAt);

  // Sunset lighting: warm sky fill (peach above, dusky purple from the ground), a warm key light
  // from behind the castle (so the monsters' faces are lit), and the low sun behind the monsters
  // as an orange rim light on their silhouettes. Lightning briefly lights everything.
  const sky = new THREE.HemisphereLight(0xffc4a0, 0x3a2346, valleyLight.ambient);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xffd8b0, valleyLight.key);
  key.position.set(25, 40, 40);
  key.castShadow = CONFIG.SHADOWS;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a3a, valleyLight.rim);
  rim.position.set(CONFIG.SCENERY.sun.x, CONFIG.SCENERY.sun.y, CONFIG.SCENERY.sun.z);
  scene.add(rim);

  const environment = createEnvironment(scene);
  // Scenery per wave (themes.ts): the lights, fog and background follow the theme too.
  // Per theme [valley, frost, inferno]: warm sunset / cold white daylight / red glow of lava at night.
  const fog = scene.fog as THREE.FogExp2;
  const lights = (['ambient', 'key', 'rim', 'fog'] as const).map((k) =>
    THEMES.map((t) => CONFIG.WAVE_SCENERY.light[t][k]),
  ) as unknown as [PerTheme<number>, PerTheme<number>, PerTheme<number>, PerTheme<number>];
  const themedLights: Themed[] = [
    themedColor(sky.color, [0xffc4a0, 0xdcecff, 0xe8a090]),
    themedColor(sky.groundColor, [0x3a2346, 0x56668a, 0x2a0c0a]),
    themedColor(key.color, [0xffd8b0, 0xf2f6ff, 0xffdcc8]),
    themedColor(rim.color, [0xff8a3a, 0xa8d4ff, 0xff3a10]),
    themedColor(fog.color, [PALETTE.fog, 0xb2c2d8, 0x2e0e0a]),
    themedColor(scene.background as THREE.Color, [PALETTE.skyHorizon, 0xc2d6ee, 0x5a160c]),
  ];
  let ambient = valleyLight.ambient;
  // Theme fade: weights slide from `fadeFrom` to the target theme over CONFIG.WAVE_SCENERY.fadeS.
  let weights: ThemeWeights = [1, 0, 0];
  let fadeFrom: ThemeWeights = weights;
  let themeTarget = 0;
  let fade = 1;
  function applyTheme(w: ThemeWeights) {
    environment.setTheme(w);
    for (const f of themedLights) f(w);
    ambient = mixNum(lights[0], w);
    key.intensity = mixNum(lights[1], w);
    rim.intensity = mixNum(lights[2], w);
    fog.density = mixNum(lights[3], w);
  }
  applyTheme(weights);
  /** Follow the wave: wave 1 (and the menus) = valley, then CONFIG.WAVE_SCENERY.byWave. */
  function updateTheme(world: World, dt: number) {
    const want = world.phase === 'MENU' ? 0 : themeForWave(world.wave);
    if (want !== themeTarget) {
      themeTarget = want;
      fadeFrom = weights;
      fade = 0;
    }
    if (fade >= 1) return;
    fade = Math.min(1, fade + dt / CONFIG.WAVE_SCENERY.fadeS);
    const k = THREE.MathUtils.smootherstep(fade, 0, 1);
    weights = fadeFrom.map((f, i) => THREE.MathUtils.lerp(f, i === themeTarget ? 1 : 0, k)) as unknown as ThemeWeights;
    applyTheme(weights);
  }
  // The castle burns as it loses HP.
  const castleFire = createCastleFire(scene);
  const wizard = createWizard();
  wizard.group.position.set(CONFIG.CAMERA.wizardX, WALL_TOP, CONFIG.FIELD.wallZ + CONFIG.CAMERA.wizardBack);
  scene.add(wizard.group);
  let lightningT = 0;
  let sparkT = 0;
  const particles = createParticles(scene);
  // Victory / defeat cinematics (camera swings out, banners + fireworks or the castle falls).
  const ending = createEnding({
    scene,
    renderer,
    particles,
    wall: environment.castle.wall,
    towers: environment.castle.towers,
    hero: wizard.group,
    heroCast: (color) => wizard.cast(color),
    shake: (amount) => (shakeAmount = Math.min(1, Math.max(shakeAmount, amount))),
  });
  // Archers shoot a glowing arrow at the wall when their charge completes.
  const enemies = createEnemyView(scene, particles, (from, enemy) => {
    const to = new THREE.Vector3(enemy.pos.x * 0.4, WALL_TOP + 0.8, CONFIG.FIELD.wallZ + 0.3);
    fire(from, to, ELEMENT_COLOR[enemy.element], () => particles.burst(to, 0xff5030, 25, 4, 1, 0.6));
  });

  // Bloom makes emissive things (eyes, orbs, torches, sun) glow.
  // Multisampled render target: without it the post-processing path loses anti-aliasing (jagged edges).
  // The depth texture lets the ink pass find silhouettes.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: CONFIG.MSAA_SAMPLES });
  target.depthTexture = new THREE.DepthTexture(1, 1);
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ink = new InkOutlinePass(camera);
  ink.enabled = CONFIG.INK.enabled;
  composer.addPass(ink);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CONFIG.BLOOM.strength, CONFIG.BLOOM.radius, CONFIG.BLOOM.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const shots: Shot[] = [];
  // Ground shockwave rings where spells land.
  const waves: Array<{ mesh: THREE.Mesh; t: number }> = [];
  const waveGeo = new THREE.RingGeometry(0.8, 1, 40);
  waveGeo.rotateX(-Math.PI / 2);
  function shockwave(x: number, z: number, color: number) {
    const mesh = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.set(x, 0.06, z);
    scene.add(mesh);
    waves.push({ mesh, t: 0 });
  }
  function updateWaves(dt: number) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.t += dt / 0.45;
      w.mesh.scale.setScalar(0.5 + w.t * 3);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - w.t);
      if (w.t >= 1) {
        scene.remove(w.mesh);
        (w.mesh.material as THREE.Material).dispose();
        waves.splice(i, 1);
      }
    }
  }
  const orbTexture = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  // Quick bright flash sprites at impacts (grow + fade in ~0.25 s).
  const flashes: Array<{ s: THREE.Sprite; t: number; size: number }> = [];
  function flash(at: THREE.Vector3, color: number, size: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTexture, color, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(at);
    scene.add(s);
    flashes.push({ s, t: 0, size });
  }
  function updateFlashes(dt: number) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt / 0.25;
      f.s.scale.setScalar(f.size * (0.4 + f.t));
      f.s.material.opacity = Math.max(0, 1 - f.t);
      if (f.t >= 1) {
        scene.remove(f.s);
        f.s.material.dispose();
        flashes.splice(i, 1);
      }
    }
  }

  /** Launch an orb from -> to; onArrive runs when it lands. */
  // METEOR ultimate: a burning rock falls from high over the field, then explodes.
  type Meteor = { group: THREE.Group; rock: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; trailT: number; onImpact: () => void };
  const meteors: Meteor[] = [];
  const meteorGeo = new THREE.IcosahedronGeometry(1.1, 1);
  const meteorMat = toon({ color: 0x5a2a1a, emissive: 0xff5a10, emissiveIntensity: 1.4 });
  function dropMeteor(target: { x: number; z: number }, onImpact: () => void) {
    const group = new THREE.Group();
    const rock = new THREE.Mesh(meteorGeo, meteorMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTexture, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(5.5);
    group.add(glow, rock);
    const to = new THREE.Vector3(target.x, 0.6, target.z);
    const from = to.clone().add(new THREE.Vector3(12, 40, -28)); // from high up, beyond the field
    group.position.copy(from);
    scene.add(group);
    meteors.push({ group, rock, from, to, t: 0, trailT: 0, onImpact });
  }
  function updateMeteors(dt: number) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.t = Math.min(1, m.t + dt / CONFIG.METEOR_FX.fallS);
      m.group.position.lerpVectors(m.from, m.to, m.t * m.t); // speeds up as it falls
      m.rock.rotation.x += dt * 6;
      m.rock.rotation.y += dt * 4;
      m.trailT -= dt;
      if (m.trailT <= 0) {
        m.trailT = 0.02;
        particles.burst(m.group.position, 0xff7a20, 6, 1.5, 0, 0.5); // fire trail
        particles.burst(m.group.position, 0x3a3034, 3, 1, 1, 1.2); // smoke
      }
      if (m.t < 1) continue;
      scene.remove(m.group);
      meteors.splice(i, 1);
      const at = m.to.clone().setY(1);
      particles.burst(at, 0xff6a1a, 140, 12, 4, 1.0); // fireball
      particles.burst(at, 0xffd25a, 60, 7, 3, 0.7); // bright core
      particles.burst(at, 0x2e2628, 50, 4, 5, 1.8); // smoke column
      particles.burst(at, 0x7a6a5a, 40, 8, 6, 1.2); // rocks and dirt
      flash(at, 0xffa040, 18);
      shockwave(m.to.x, m.to.z, 0xff7a30);
      shockwave(m.to.x, m.to.z, 0xffd25a);
      shakeAmount = 1;
      m.onImpact();
    }
  }

  function fire(from: THREE.Vector3, to: THREE.Vector3, color: number, onArrive: () => void) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTexture, color, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(1.3);
    sprite.position.copy(from);
    scene.add(sprite);
    shots.push({ sprite, from, to, t: 0, color, onArrive });
  }

  function updateShots(dt: number) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t = Math.min(1, s.t + dt / CONFIG.PROJECTILE_S);
      // Straight line plus a small upward arc.
      s.sprite.position.lerpVectors(s.from, s.to, s.t);
      s.sprite.position.y += Math.sin(s.t * Math.PI) * 0.8;
      particles.burst(s.sprite.position.clone(), s.color, 3, 0.8, 0.2, 0.35); // spark trail
      if (s.t >= 1) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        shots.splice(i, 1);
        shockwave(s.to.x, s.to.z, s.color);
        s.onArrive();
      }
    }
  }

  let width = 1;
  let height = 1;
  let shakeAmount = 0;
  let time = 0;
  const tmp = new THREE.Vector3();

  function resize(w: number, h: number) {
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    // Bloom is soft anyway: compute it at lower resolution (much cheaper).
    const pr = renderer.getPixelRatio();
    bloom.setSize(w * pr * CONFIG.BLOOM.resolutionScale, h * pr * CONFIG.BLOOM.resolutionScale);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---- Automatic quality: step down when the frame rate stays low.
  let quality = 0; // 0 = full, 1 = pixel ratio 1 + shadows off + extras off, 2 = no bloom, 3 = pixel ratio 0.75
  let fps = 60;
  let slowFor = 0;
  let warmup = 3; // ignore the first seconds (loading, shader compiles)
  function autoQuality(dt: number) {
    if (!CONFIG.AUTO_QUALITY.enabled || dt <= 0) return;
    fps += (1 / dt - fps) * 0.05;
    if (warmup > 0) {
      warmup -= dt;
      return;
    }
    slowFor = fps < CONFIG.AUTO_QUALITY.minFps ? slowFor + dt : 0;
    if (slowFor < CONFIG.AUTO_QUALITY.seconds || quality >= 3) return;
    quality++;
    slowFor = 0;
    warmup = 1.5; // let the new setting settle before judging again
    if (quality === 1) {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
      environment.setExtras(false);
      particles.setScale(CONFIG.AUTO_QUALITY.lowParticles);
      resize(width, height);
    } else if (quality === 3) {
      renderer.setPixelRatio(0.75);
      resize(width, height);
    }
    const what = ['full', 'pixel ratio 1, shadows + extras off', 'bloom off', 'pixel ratio 0.75'][quality];
    console.info(`Auto quality: level ${quality} (${what}) after ${CONFIG.AUTO_QUALITY.seconds} s under ${CONFIG.AUTO_QUALITY.minFps} fps`);
  }

  /** Draw one frame. dt in seconds. */
  function render(world: World, dt: number) {
    time += dt;
    environment.update(time, dt);
    // The scenery changes with the wave (fades back to the valley for a new round).
    updateTheme(world, dt);
    castleFire.update(world.castleHp / castleMaxHp(world), time, dt);
    wizard.update(time, dt);
    // A trickle of golden sparks from the wizard's orb.
    sparkT += dt;
    if (sparkT > 0.06) {
      sparkT = 0;
      particles.burst(wizard.orbWorldPosition(new THREE.Vector3()), PALETTE.gold, 1, 0.6, 0.8, 0.6);
    }
    // Lightning flash: the whole scene lights up for a moment.
    lightningT = Math.max(0, lightningT - dt * 4);
    sky.intensity = ambient + lightningT * 6;
    enemies.update(world, time, dt);
    updateShots(dt);
    updateWaves(dt);
    updateFlashes(dt);
    updateMeteors(dt);
    particles.update(dt);

    // Camera shake (castle hits) + a very slow idle sway so the view feels alive.
    // At the end of a round the cinematic takes the camera out over the field.
    shakeAmount = Math.max(0, shakeAmount - dt * 2.5);
    const s = shakeAmount * shakeAmount;
    const cine = ending.update(world, dt, camBase, lookAt);
    const base = cine ? cine.pos : camBase;
    camera.position.set(
      base.x + Math.sin(time * 0.4) * 0.05 + (Math.random() - 0.5) * s,
      base.y + Math.sin(time * 0.6) * 0.03 + (Math.random() - 0.5) * s,
      base.z,
    );
    camera.lookAt(cine ? cine.look : lookAt);

    autoQuality(dt);
    // Post-processing chain: render -> ink outlines -> bloom (dropped first when FPS is low) -> output.
    bloom.enabled = CONFIG.BLOOM.enabled && quality < 2;
    composer.render(dt);
  }

  /** World point -> overlay pixels, or null if it is behind the camera. */
  function projectPoint(x: number, y: number, z: number): { x: number; y: number } | null {
    tmp.set(x, y, z).project(camera);
    if (tmp.z > 1) return null;
    return { x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height };
  }

  /** Enemy position in overlay pixels. heightFactor 0 = feet, 0.5 = middle, 1 = top of head. */
  function project(enemy: Enemy, heightFactor = 0.5): { x: number; y: number } | null {
    return projectPoint(enemy.pos.x, enemy.pos.y + enemies.heightOf(enemy.id) * heightFactor, enemy.pos.z);
  }

  return {
    renderer,
    scene,
    camera,
    resize,
    render,
    project,
    projectPoint,
    /** Model height of an enemy (world units). */
    heightOf: (id: number) => enemies.heightOf(id),
    /** Fire a glowing orb from the wizard's hands to a world position at an enemy. */
    castProjectile(pos: { x: number; y: number; z: number }, enemyId: number, color: number, onArrive: () => void) {
      const from = wizard.orbWorldPosition(new THREE.Vector3());
      const to = new THREE.Vector3(pos.x, pos.y + enemies.heightOf(enemyId) * 0.5, pos.z);
      fire(from, to, color, onArrive);
    },
    /** The wizard casts: arms thrust forward, orb flashes in the spell colour. */
    wizardCast(color: number) {
      wizard.cast(color);
    },
    /** Which hero stands on the wall (level 1 wizard, level 2 Grand Warden). */
    setHero(hero: Hero) {
      wizard.setHero(hero);
      ending.setHero(hero);
    },
    /** The element being drawn (live recognition): the wizard's orb glows in it. */
    wizardElement(color: number | null) {
      wizard.setElement(color);
    },
    /** METEOR: a burning rock falls onto this spot; onImpact runs when it lands (the damage happens then). */
    meteor(target: { x: number; z: number }, onImpact: () => void) {
      dropMeteor(target, onImpact);
    },
    /** Light up the whole scene (lightning). */
    lightningFlash() {
      lightningT = 1;
    },
    /** Current auto-quality level (0 = full). */
    get quality() {
      return quality;
    },
    /** Kick the camera (0..1). */
    shake(amount: number) {
      shakeAmount = Math.min(1, shakeAmount + amount);
    },
    /** Spray particles at a world position, raised to the middle of an enemy of that id (spell hits). */
    burstAt(pos: { x: number; y: number; z: number }, enemyId: number, color: number, count = 24) {
      const p = new THREE.Vector3(pos.x, pos.y + enemies.heightOf(enemyId) * 0.5, pos.z);
      particles.burst(p, color, count, 5, 2, 0.6);
    },
    /** Element-specific spell impact on an enemy: water splashes, fire explodes, nature bursts into leaves. */
    impact(spell: string, pos: { x: number; y: number; z: number }, enemyId: number, strong: boolean) {
      const h = enemies.heightOf(enemyId);
      const p = new THREE.Vector3(pos.x, pos.y + h * 0.5, pos.z);
      const k = strong ? 1.6 : 1;
      if (spell === 'water') {
        particles.burst(p, 0x3fa9ff, Math.round(30 * k), 3, 6, 0.9); // droplets thrown up, falling back
        particles.burst(p, 0xdff4ff, Math.round(12 * k), 5, 1, 0.4); // white spray
        flash(p, 0x6fc4ff, 3.5 * k);
      } else if (spell === 'fire') {
        particles.burst(p, 0xff6a1a, Math.round(40 * k), 7, 2.5, 0.7); // explosion
        particles.burst(p, 0xffd25a, Math.round(16 * k), 3, 3, 0.5); // bright core sparks
        flash(p, 0xffa040, 5 * k);
      } else if (spell === 'nature') {
        particles.burst(p, 0x6fe05a, Math.round(28 * k), 4, 1, 1.4); // leaves drifting slowly
        particles.burst(p, 0xd8ffa8, Math.round(10 * k), 2.5, 2, 0.8);
        flash(p, 0x9cff7a, 3.5 * k);
      } else {
        particles.burst(p, 0xcfe6ff, Math.round(22 * k), 6, 2, 0.5); // lightning sparks
        flash(p, 0xe8f4ff, 4 * k);
      }
    },
  };
}
