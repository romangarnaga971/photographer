import * as THREE from 'three';
import { watchQuality } from './quality.js';
import { buildSheetModel } from './sheet3d.js';

const filmVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

const filmFragment = `
  uniform sampler2D uMap;
  uniform float uDevelop, uReady, uFade;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec3 photo = texture2D(uMap, vUv).rgb;

    // Colour negative: inverted, under film's orange mask
    vec3 negative = (1. - photo) * vec3(.62, .36, .2) + vec3(.13, .05, .02);

    // Developer spreads unevenly, so the image comes up in soft patches
    float n = noise(vUv * 3.5) * .6 + noise(vUv * 9.) * .4;
    float shown = smoothstep(.0, .22, uDevelop * 1.22 - n * (1. - uDevelop) * 1.1);
    vec3 color = mix(negative, photo, shown);

    gl_FragColor = vec4(mix(vec3(.05, .03, .025), color, uReady), uFade);
    #include <colorspace_fragment>
  }`;

const FRAME_H = 3;
const GAP = 0.34;

export function createDarkroom(canvas, { isSmall, photos }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? 1.5 : 2));

  const scene = new THREE.Scene();
  const view = new THREE.PerspectiveCamera(24, 1, 0.1, 60);

  // The camera is shaped from the turnaround sheet
  const camera = new THREE.Group();
  scene.add(camera);
  buildSheetModel({
    src: 'assets/img/P-14.webp', sideFacesRight: false, power: 5, limbDepth: 3, gap: 6, step: isSmall ? 0.03 : 0.022,
  }).then((model) => {
    model.material.uniforms.uGloss.value = 0.1;
    camera.add(model.mesh);
  });

  // Film ring: each photo keeps its own shape, and the frames wrap around the viewer
  const total = photos.reduce((sum, p) => sum + p.aspect * FRAME_H + GAP, 0);
  const radius = total / (Math.PI * 2);
  const ring = new THREE.Group();
  ring.visible = false;
  const loader = new THREE.TextureLoader();
  let walked = 0;
  const frames = photos.map((p) => {
    const width = p.aspect * FRAME_H;
    const center = (walked + width / 2) / radius;
    walked += width + GAP;

    const geometry = new THREE.PlaneGeometry(width, FRAME_H, 28, 1);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = center + pos.getX(i) / radius;
      pos.setXYZ(i, Math.sin(a) * radius, pos.getY(i), -Math.cos(a) * radius);
    }
    const uniforms = {
      uMap: { value: null }, uDevelop: { value: 0 }, uReady: { value: 0 }, uFade: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader: filmVertex, fragmentShader: filmFragment, transparent: true, side: THREE.DoubleSide,
    });
    ring.add(new THREE.Mesh(geometry, material));

    loader.load(p.src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      uniforms.uMap.value = texture;
      uniforms.uReady.value = 1;
    });
    return { center, uniforms };
  });
  scene.add(ring);

  const state = {
    camX: 0, camY: -0.02, camZ: 0, camRotY: -0.42, camRotX: 0.08, camScale: 0.92,
    spin: 0, film: 0, viewZ: 7, fov: 24,
  };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    view.aspect = w / h;
    view.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  watchQuality(renderer, resize);

  // Rotation that brings a frame to the front: frame i sits at angle frames[i].center
  const angleOf = (i) => frames[i].center;
  const TWO_PI = Math.PI * 2;

  function frame() {
    pointer.sx += (pointer.x - pointer.sx) * 0.06;
    pointer.sy += (pointer.y - pointer.sy) * 0.06;

    camera.visible = state.camScale > 0.001 && state.camZ < state.viewZ - 0.4;
    camera.position.set(state.camX, state.camY, state.camZ);
    camera.scale.setScalar(state.camScale);
    camera.rotation.set(state.camRotX + pointer.sy * 0.3, state.camRotY + pointer.sx * 0.9, 0);

    ring.visible = state.film > 0.001;
    ring.rotation.y = state.spin - pointer.sx * 0.05;
    let nearest = 0;
    let nearestGap = Infinity;
    for (let i = 0; i < frames.length; i++) {
      // How far this frame is from straight ahead, in radians
      let off = (frames[i].center - state.spin) % TWO_PI;
      if (off > Math.PI) off -= TWO_PI;
      if (off < -Math.PI) off += TWO_PI;
      const gap = Math.abs(off);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = i;
      }
      const u = frames[i].uniforms;
      // Developed near the middle of the view, a negative further out
      u.uDevelop.value = 1 - THREE.MathUtils.smoothstep(gap * radius, 1.9, 5);
      u.uFade.value = state.film;
    }

    view.position.set(0, pointer.sy * -0.08, state.viewZ);
    if (view.fov !== state.fov) {
      view.fov = state.fov;
      view.updateProjectionMatrix();
    }
    view.lookAt(0, 0, -radius);
    renderer.render(scene, view);
    return nearest;
  }

  return { state, frame, angleOf, radius };
}
