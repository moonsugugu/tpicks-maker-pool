import * as THREE from '../vendor/three.module.min.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { createTPICKSModel, disposeModel } from './model.js';

const defaultBase = new URL('../assets/', import.meta.url);
const cachedShapes = new Map();
const inlineCSS = `
  :host { display:block; position:relative; min-height:120px; isolation:isolate; }
  .viewport { position:relative; width:100%; height:100%; min-height:inherit; overflow:hidden; }
  canvas { position:absolute; inset:0; display:block; width:100%; height:100%; touch-action:pan-y; }
  .fallback { position:absolute; left:14%; top:50%; width:72%; height:auto; transform:translateY(-50%); object-fit:contain; }
  .ready .fallback { opacity:0; pointer-events:none; }
  .pause { position:absolute; bottom:10px; right:12px; color:inherit; background:rgba(127,127,127,.1); border:1px solid currentColor; border-radius:50%; width:32px; height:32px; cursor:pointer; font:14px system-ui; opacity:.55; z-index:2; }
  .pause:hover, .pause:focus-visible { opacity:1; }
  :host([controls="false"]) .pause { display:none; }
`;

export async function mountTPICKSLogo(host, options = {}) {
  const root = options.root ?? host;
  const assetBase = new URL(options.assetBase ?? defaultBase, document.baseURI);
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  const fallback = document.createElement('img');
  fallback.src = new URL('logo-fallback.webp', assetBase).href;
  fallback.alt = 'TPICKS';
  fallback.className = 'fallback';
  fallback.width = 1100;
  fallback.height = 355;
  viewport.append(fallback);
  root.append(viewport);
  let stopped = false;
  let renderer, scene, camera, model, env, pmrem;
  let resizeObserver, intersectionObserver;
  let raf = 0;
  let elapsed = 0;
  let lastTime = 0;
  let paused = options.paused ?? false;
  let visible = true;
  let active = false;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  const pointer = { x: 0, y: 0 };
  const stats = { state: 'loading', frames: 0, reducedMotion: motionQuery.matches };
  const button = document.createElement('button');
  button.className = 'pause';
  button.type = 'button';
  const updateButton = () => {
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', paused ? '3D 로고 움직임 재생' : '3D 로고 움직임 일시정지');
    button.setAttribute('aria-pressed', String(paused));
  };
  updateButton();
  if (options.controls !== false) viewport.append(button);
  const renderOnce = () => {
    if (renderer && model && !stopped) {
      renderer.render(scene, camera);
      stats.frames++;
    }
  };
  const frame = now => {
    raf = 0;
    if (stopped || !model || !visible || document.hidden) return;
    const dt = Math.min(lastTime ? (now - lastTime) / 1000 : 1 / 60, 0.05);
    lastTime = now;
    if (!paused && !motionQuery.matches) {
      elapsed += dt;
      const damp = 1 - Math.exp(-7.5 * dt);
      const amplitude = coarseQuery.matches ? 0.45 : 1;
      const rx = -0.09 + Math.sin(elapsed * 0.52) * 0.085 * amplitude + pointer.y * -0.17;
      const ry = -0.16 + Math.sin(elapsed * 0.41) * 0.17 * amplitude + pointer.x * 0.28;
      model.rotation.x += (rx - model.rotation.x) * damp;
      model.rotation.y += (ry - model.rotation.y) * damp;
      model.rotation.z = -0.035 + Math.sin(elapsed * 0.48) * 0.022 * amplitude;
      model.position.y = Math.sin(elapsed * 0.86) * 0.085 * amplitude;
      // Secondary: the soft reflected key light moves very slowly across the enamel.
      scene.getObjectByName('rim').position.x = -3 + Math.sin(elapsed * 0.34) * 2;
    }
    renderOnce();
    if (!paused && !motionQuery.matches) raf = requestAnimationFrame(frame);
  };
  const start = () => {
    lastTime = 0;
    if (!raf && model && visible && !document.hidden && !stopped) raf = requestAnimationFrame(frame);
  };
  const stopFrames = () => { cancelAnimationFrame(raf); raf = 0; lastTime = 0; };
  const pointerMove = event => {
    if (coarseQuery.matches || motionQuery.matches || paused) return;
    const rect = viewport.getBoundingClientRect();
    active = true;
    pointer.x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    pointer.y = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
  };
  const pointerLeave = () => { active = false; pointer.x = 0; pointer.y = 0; };
  const visibilityChange = () => { document.hidden ? stopFrames() : start(); };
  const motionChange = () => {
    stats.reducedMotion = motionQuery.matches;
    stopFrames(); pointerLeave();
    if (model && motionQuery.matches) { model.rotation.set(-0.09,-0.16,-0.035); model.position.y=0; }
    start();
  };
  const setPaused = value => { paused = Boolean(value); updateButton(); stopFrames(); start(); };
  const toggle = () => setPaused(!paused);
  button.addEventListener('click', toggle);
  viewport.addEventListener('pointermove', pointerMove);
  viewport.addEventListener('pointerleave', pointerLeave);
  document.addEventListener('visibilitychange', visibilityChange);
  motionQuery.addEventListener('change', motionChange);

  const controller = {
    stats,
    pause: () => setPaused(true),
    play: () => setPaused(false),
    get paused() { return paused; },
    get pointerActive() { return active; },
    exportPNG() {
      if (!renderer || !model) throw new Error('3D logo is not ready');
      renderOnce();
      return renderer.domElement.toDataURL('image/png');
    },
    dispose() {
      stopped = true; stopFrames();
      resizeObserver?.disconnect(); intersectionObserver?.disconnect();
      button.removeEventListener('click', toggle);
      viewport.removeEventListener('pointermove', pointerMove);
      viewport.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibilityChange);
      motionQuery.removeEventListener('change', motionChange);
      if (model) disposeModel(model);
      env?.dispose(); pmrem?.dispose();
      renderer?.dispose();
      viewport.remove();
      stats.state = 'disposed';
    },
  };
  // Make cleanup and the ready event available even while shape data is loading.
  host.controller = controller;

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxDpr ?? 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.97;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '입체 TPICKS 라임 로고');
    viewport.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    // Narrow studio softboxes create clean moving reflections on the glossy coat.
    const addPanel=(position,width,height,color,strength)=>{
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(strength),side:THREE.DoubleSide}));
      panel.position.set(...position);panel.lookAt(0,0,0);room.add(panel);
    };
    addPanel([-3.5,3.8,5.5],1.8,6,'#ffffff',3.6);
    addPanel([4,-1,5],0.85,4.5,'#e5d4ff',2.2);
    env = pmrem.fromScene(room, 0.025);
    scene.environment = env.texture;
    room.dispose();
    const fill = new THREE.HemisphereLight(0xffffff, 0x564565, 0.75);
    scene.add(fill);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfff99, 1.2);
    rim.name = 'rim'; rim.position.set(-3, 1, -3); scene.add(rim);
    const cool = new THREE.DirectionalLight(0xc4b1ff, 0.55);
    cool.position.set(6,-1,3); scene.add(cool);

    const url = new URL('logo-shapes.json', assetBase).href;
    if (!cachedShapes.has(url)) cachedShapes.set(url, fetch(url).then(res => {
      if (!res.ok) throw new Error(`Logo shape data: ${res.status}`);
      return res.json();
    }).catch(error => { cachedShapes.delete(url); throw error; }));
    const data = await cachedShapes.get(url);
    if (stopped) return controller;
    model = createTPICKSModel(THREE, data, options);
    model.rotation.set(-0.09,-0.16,-0.035);
    scene.add(model);
    const resize = () => {
      if (stopped) return;
      const rect = host.getBoundingClientRect();
      const w = Math.max(1,rect.width), h = Math.max(1,rect.height);
      camera.aspect = w/h;
      // Fits the wide mark into any hero or header without cropping side walls.
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const halfHeight = Math.max(2.12, 6.3 / camera.aspect);
      camera.position.set(0, 0, halfHeight / Math.tan(fov/2));
      camera.updateProjectionMatrix();
      renderer.setSize(w,h,false);
      renderOnce();
    };
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
    intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      visible ? start() : stopFrames();
    }, { threshold: 0.01 });
    intersectionObserver.observe(host);
    viewport.classList.add('ready');
    stats.state = 'ready';
    host.dataset.logo3d = 'ready';
    host.dispatchEvent(new CustomEvent('tpicks-ready', {detail:controller}));
    start();
  } catch (error) {
    stats.state = 'fallback';
    host.dataset.logo3d = 'fallback';
    host.dispatchEvent(new CustomEvent('tpicks-error', {detail:error}));
    renderer?.dispose(); renderer?.domElement.remove();
    env?.dispose(); pmrem?.dispose();
    button.hidden = true;
    // The verified polished capture stays visible when WebGL is unavailable.
    console.warn('[TPICKS Logo3D] fallback image used', error);
  }
  return controller;
}

export class TPICKSLogo3D extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); this._generation = 0; }
  connectedCallback() {
    const generation = ++this._generation;
    this.shadowRoot.replaceChildren();
    const style = document.createElement('style'); style.textContent = inlineCSS;
    this.shadowRoot.append(style);
    mountTPICKSLogo(this, {
      root:this.shadowRoot,
      assetBase:this.getAttribute('asset-base') ?? defaultBase,
      controls:this.getAttribute('controls') !== 'false',
      paused:this.hasAttribute('paused'),
    }).then(controller => {
      if (generation !== this._generation || !this.isConnected) controller.dispose();
      else this.controller = controller;
    });
  }
  disconnectedCallback() { this._generation++; this.controller?.dispose(); this.controller=null; }
  pause() { this.controller?.pause(); }
  play() { this.controller?.play(); }
}

if (!customElements.get('tpicks-logo-3d')) customElements.define('tpicks-logo-3d', TPICKSLogo3D);
