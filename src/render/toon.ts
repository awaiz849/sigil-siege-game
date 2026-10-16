// Comic-book look, matching our concept art:
//   toon()          cel-shaded material: light falls into 3 hard bands instead of smooth shading
//   InkOutlinePass  post-process pass that draws dark outlines wherever the depth jumps
//                   (silhouettes), like inked lines. One full-screen pass, so the cost does not
//                   grow with the number of monsters.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { WebGLRenderTarget, WebGLRenderer } from 'three';
import { CONFIG } from '../config.ts';

/** 3-step light ramp shared by every toon material (shadow / mid / lit). */
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

/** Same parameters as MeshStandardMaterial (roughness / metalness / flatShading are ignored). */
export function toon(params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshToonMaterial {
  const { roughness: _r, metalness: _m, flatShading: _f, ...rest } = params;
  return new THREE.MeshToonMaterial({ ...rest, gradientMap });
}

/** Ink outlines from the depth buffer. Reads the depth texture of the buffer it draws over. */
export class InkOutlinePass extends ShaderPass {
  constructor(camera: THREE.PerspectiveCamera) {
    super({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        inkColor: { value: new THREE.Color(CONFIG.INK.color) },
        thickness: { value: CONFIG.INK.thickness },
        fadeStart: { value: CONFIG.INK.fadeStart },
        fadeEnd: { value: CONFIG.INK.fadeEnd },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 resolution;
        uniform float cameraNear, cameraFar, thickness, fadeStart, fadeEnd;
        uniform vec3 inkColor;
        varying vec2 vUv;
        // Depth buffer value -> distance from the camera.
        float viewZ(vec2 uv) {
          float d = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - d * (cameraFar - cameraNear));
        }
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec2 px = thickness / resolution;
          float c = viewZ(vUv);
          // Biggest depth jump to a neighbour, relative to distance (so far things outline too).
          float jump = max(max(abs(viewZ(vUv + vec2(px.x, 0.0)) - c), abs(viewZ(vUv - vec2(px.x, 0.0)) - c)),
                           max(abs(viewZ(vUv + vec2(0.0, px.y)) - c), abs(viewZ(vUv - vec2(0.0, px.y)) - c)));
          float edge = smoothstep(0.04, 0.12, jump / c);
          edge *= 1.0 - smoothstep(fadeStart, fadeEnd, c); // fade lines into the fog
          gl_FragColor = vec4(mix(color.rgb, inkColor, edge * 0.85), color.a);
        }`,
    });
  }

  setSize(width: number, height: number) {
    (this.uniforms.resolution.value as THREE.Vector2).set(width, height);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
