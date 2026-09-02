import * as THREE from "three";

/**
 * A small, deliberately self-contained Three.js rig for the Eriksberg hero.
 *
 * The module does not make any assumptions about the page's HTML or CSS. A
 * container (usually a full-bleed hero) is enough; the controller adds one
 * absolutely positioned canvas to it. A photo can remain underneath the
 * canvas, which gives the crane a little more physical presence without
 * requiring a second full-screen WebGL scene.
 */

const UP = new THREE.Vector3(0, 1, 0);

const DEFAULTS = {
  antialias: true,
  cameraDistance: 15.6,
  cameraFov: 35,
  canvasClass: "hero-3d-canvas",
  interactionTarget: null,
  initialScrollProgress: 0,
  maxPixelRatio: 1.65,
  motionScale: 1,
  transparent: true,
  wordmark: "ERIKSBERG",
};

const MOTION_EPSILON = 0.0012;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const damp = (current, target, smoothing, delta) => {
  if (smoothing <= 0 || delta <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-smoothing * delta));
};
const lerp = (a, b, amount) => a + (b - a) * amount;

function isElement(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

function resolveElement(target) {
  if (typeof document === "undefined") return null;
  if (typeof target === "string") return document.querySelector(target);
  return isElement(target) ? target : null;
}

function makeStandardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.18,
    ...options,
  });
}

function makeBox(parent, name, size, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

function makeCylinder(parent, name, radius, height, material, position = [0, 0, 0], segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

/** Create a rectangular beam between two world-space points. */
function makeBeamBetween(parent, name, start, end, width, depth, material) {
  const startPoint = start instanceof THREE.Vector3 ? start : new THREE.Vector3(...start);
  const endPoint = end instanceof THREE.Vector3 ? end : new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  if (!length) return null;

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, depth), material);
  mesh.name = name;
  mesh.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  parent.add(mesh);
  return mesh;
}

function makeWheel(parent, name, position, material, radius = 0.15) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.13, 12), material);
  wheel.name = name;
  wheel.position.set(position[0], position[1], position[2]);
  // CylinderGeometry's local axis is Y. Wheels roll along the X rail, so
  // their axle is placed on the Z axis.
  wheel.rotation.x = Math.PI / 2;
  parent.add(wheel);
  return wheel;
}

function makeWordmarkTexture(label) {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 102px Arial Narrow, Arial, sans-serif";
  context.lineJoin = "round";
  context.lineWidth = 11;
  context.strokeStyle = "rgba(6, 22, 28, 0.72)";
  context.strokeText(label, canvas.width / 2, canvas.height / 2 + 3);
  context.fillStyle = "#f2c84b";
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "eriksberg-wordmark-texture";
  texture.needsUpdate = true;
  if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addWordmark(parent, label, dimensions, materials) {
  const texture = makeWordmarkTexture(label);
  if (!texture) return { mesh: null, texture: null };

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 0.45),
    new THREE.MeshBasicMaterial({
      alphaTest: 0.02,
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  sign.name = "ERIKSBERG wordmark";
  sign.position.set(0, dimensions.girderY, dimensions.girderDepth / 2 + 0.015);
  parent.add(sign);

  // A thin dark backing lets the yellow lettering remain legible over both
  // the orange steel and a bright photo beneath the transparent canvas.
  const backing = makeBox(
    parent,
    "wordmark backing",
    [2.88, 0.49, 0.022],
    materials.wordmarkBacking,
    [0, dimensions.girderY, dimensions.girderDepth / 2 + 0.001],
  );
  backing.renderOrder = -1;

  return { mesh: sign, texture };
}

function addStripedHookBlock(parent, dimensions, materials) {
  const hookAssembly = new THREE.Group();
  hookAssembly.name = "striped hook block assembly";
  hookAssembly.position.set(0, 0, 0.02);
  parent.add(hookAssembly);

  const blockWidth = 0.64;
  const blockHeight = 0.5;
  const blockDepth = 0.52;
  const blockY = dimensions.hookY;

  makeBox(
    hookAssembly,
    "hook block core",
    [blockWidth, blockHeight, blockDepth],
    materials.hookDark,
    [0, blockY, 0],
  );

  const stripeCount = 5;
  const stripeHeight = blockHeight / stripeCount;
  for (let index = 0; index < stripeCount; index += 1) {
    const stripe = makeBox(
      hookAssembly,
      `hook block stripe ${index + 1}`,
      [blockWidth + 0.018, stripeHeight * 0.92, blockDepth + 0.018],
      index % 2 === 0 ? materials.hookYellow : materials.hookOrange,
      [0, blockY - blockHeight / 2 + stripeHeight * (index + 0.5), 0],
    );
  }

  makeCylinder(
    hookAssembly,
    "hook shank",
    0.065,
    0.43,
    materials.cable,
    [0, blockY - blockHeight / 2 - 0.22, 0],
    10,
  );

  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.052, 8, 18, Math.PI * 1.32),
    materials.hookOrange,
  );
  hook.name = "lifting hook";
  hook.position.set(0, blockY - blockHeight / 2 - 0.48, 0);
  hook.rotation.x = Math.PI / 2;
  hook.rotation.z = -0.1;
  hookAssembly.add(hook);

  return hookAssembly;
}

function addServiceStairs(parent, dimensions, materials) {
  const stairs = new THREE.Group();
  stairs.name = "service stairs";
  parent.add(stairs);

  // The staircase is attached just outside the right portal frame. Keeping
  // it close to the frame also makes it read at the smaller hero sizes.
  const x = dimensions.frameXs[1] + 0.56;
  const count = 10;
  const bottomY = 0.48;
  const topY = dimensions.legTopY - 0.16;
  const bottomZ = dimensions.legBottomZ + 0.02;
  const topZ = dimensions.legTopZ + 0.09;

  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const y = lerp(bottomY, topY, progress);
    const z = lerp(bottomZ, topZ, progress);
    const tread = makeBox(
      stairs,
      `service stair ${index + 1}`,
      [0.54, 0.07, 0.34],
      index % 2 ? materials.orangeDark : materials.orange,
      [x, y, z],
    );
  }

  const railBottom = new THREE.Vector3(x - 0.31, bottomY - 0.02, bottomZ + 0.19);
  const railTop = new THREE.Vector3(x - 0.31, topY + 0.32, topZ + 0.19);
  const railBottomFar = new THREE.Vector3(x + 0.31, bottomY - 0.02, bottomZ + 0.19);
  const railTopFar = new THREE.Vector3(x + 0.31, topY + 0.32, topZ + 0.19);
  makeBeamBetween(stairs, "service stair handrail left", railBottom, railTop, 0.055, 0.055, materials.steel);
  makeBeamBetween(stairs, "service stair handrail right", railBottomFar, railTopFar, 0.055, 0.055, materials.steel);

  for (const progress of [0, 0.48, 1]) {
    const y = lerp(bottomY, topY + 0.32, progress);
    const z = lerp(bottomZ + 0.19, topZ + 0.19, progress);
    makeBox(stairs, "service stair rail post", [0.055, 0.42, 0.055], materials.steel, [x - 0.31, y - 0.18, z]);
    makeBox(stairs, "service stair rail post", [0.055, 0.42, 0.055], materials.steel, [x + 0.31, y - 0.18, z]);
  }

  // A small landing connects the stairs to the upper maintenance walkway.
  makeBox(stairs, "service stair landing", [0.88, 0.08, 0.52], materials.steel, [x, topY + 0.12, topZ + 0.02]);
  return stairs;
}

function addPortalFrame(parent, frameX, frameIndex, dimensions, materials) {
  const frame = new THREE.Group();
  frame.name = `portal frame ${frameIndex}`;
  frame.position.x = frameX;
  parent.add(frame);

  for (const side of [-1, 1]) {
    const bottom = new THREE.Vector3(0, dimensions.legBottomY, side * dimensions.legBottomZ);
    const top = new THREE.Vector3(0, dimensions.legTopY, side * dimensions.legTopZ);
    makeBeamBetween(
      frame,
      `outward-raking leg ${side < 0 ? "left" : "right"}`,
      bottom,
      top,
      dimensions.legThickness,
      dimensions.legThickness,
      side < 0 ? materials.orangeDark : materials.orange,
    );

    makeBox(frame, "leg foot", [0.5, 0.14, 0.62], materials.steel, [0, 0.07, side * dimensions.legBottomZ]);
  }

  makeBox(frame, "portal frame upper crossbar", [0.28, 0.22, dimensions.frameDepth], materials.orange, [0, dimensions.frameCrossbarY, 0]);
  makeBox(frame, "portal frame lower crossbar", [0.24, 0.16, dimensions.frameDepth * 0.84], materials.steel, [0, 0.72, 0]);

  const braceZ = dimensions.legTopZ + 0.06;
  makeBeamBetween(
    frame,
    "portal frame diagonal brace",
    [0, dimensions.frameCrossbarY - 0.08, -braceZ],
    [0, dimensions.legTopY - 0.15, braceZ],
    0.075,
    0.075,
    materials.orangeDark,
  );
  makeBeamBetween(
    frame,
    "portal frame diagonal brace",
    [0, dimensions.frameCrossbarY - 0.08, braceZ],
    [0, dimensions.legTopY - 0.15, -braceZ],
    0.075,
    0.075,
    materials.orangeDark,
  );

  return frame;
}

function addTopRailsAndBogie(parent, dimensions, materials) {
  const rails = new THREE.Group();
  rails.name = "top rails and bogies";
  parent.add(rails);

  for (const z of [-dimensions.railZ, dimensions.railZ]) {
    makeBox(
      rails,
      "top rail",
      [dimensions.span + 0.54, 0.1, 0.1],
      materials.steel,
      [0, dimensions.railY, z],
    );
    for (const x of dimensions.frameXs) {
      makeBox(rails, "rail support", [0.68, 0.13, 0.15], materials.orangeDark, [x, dimensions.railY - 0.1, z]);
    }
  }

  dimensions.frameXs.forEach((x, frameIndex) => {
    const bogie = new THREE.Group();
    bogie.name = `bogie ${frameIndex + 1}`;
    bogie.position.x = x;
    rails.add(bogie);
    makeBox(bogie, "bogie platform", [0.9, 0.14, 0.8], materials.steel, [0, dimensions.railY - 0.17, 0]);
    for (const z of [-dimensions.railZ, dimensions.railZ]) {
      makeWheel(bogie, "bogie wheel", [0, dimensions.railY - 0.27, z], materials.wheel, 0.145);
    }
    makeBox(bogie, "bogie orange guard", [0.68, 0.15, 0.12], materials.orange, [0, dimensions.railY - 0.07, 0]);
  });

  return rails;
}

function addTrolley(parent, dimensions, materials, wordmark) {
  const trolley = new THREE.Group();
  trolley.name = "traveling trolley";
  trolley.position.x = -dimensions.trolleyTravel;
  parent.add(trolley);

  makeBox(trolley, "trolley lower carriage", [1.05, 0.18, 0.72], materials.steel, [0, dimensions.trolleyRailY + 0.06, 0]);
  makeBox(trolley, "trolley orange body", [1.22, 0.42, 0.78], materials.orange, [0, dimensions.trolleyY, 0]);
  makeBox(trolley, "trolley roof", [1.38, 0.12, 0.88], materials.orangeDark, [0, dimensions.trolleyY + 0.3, 0]);
  makeBox(trolley, "trolley window", [0.5, 0.18, 0.018], materials.window, [0, dimensions.trolleyY + 0.03, 0.4]);

  for (const x of [-0.39, 0.39]) {
    for (const z of [-dimensions.railZ, dimensions.railZ]) {
      makeWheel(trolley, "trolley rail wheel", [x, dimensions.trolleyRailY, z], materials.wheel, 0.15);
    }
  }

  for (const x of [-0.3, 0.3]) {
    const pulley = makeCylinder(
      trolley,
      "trolley pulley drum",
      0.14,
      0.52,
      materials.steel,
      [x, dimensions.trolleyY + 0.48, 0],
      16,
    );
    pulley.rotation.x = Math.PI / 2;
  }

  const cablePair = new THREE.Group();
  cablePair.name = "two lifting cables";
  trolley.add(cablePair);

  const cableLength = dimensions.trolleyY - dimensions.hookY - 0.08;
  for (const x of [-0.22, 0.22]) {
    makeCylinder(cablePair, "lifting cable", 0.027, cableLength, materials.cable, [x, dimensions.hookY + cableLength / 2, 0.19], 8);
    makeCylinder(cablePair, "cable eye", 0.06, 0.06, materials.cable, [x, dimensions.trolleyY - 0.18, 0.19], 8);
  }

  addStripedHookBlock(cablePair, dimensions, materials);

  if (wordmark) {
    wordmark.position.x = 0;
  }
  return trolley;
}

function createMaterials() {
  return {
    orange: makeStandardMaterial(0xe5703d, { roughness: 0.693, metalness: 0.2 }),
    orangeDark: makeStandardMaterial(0x432527, { roughness: 0.76, metalness: 0.25 }),
    orangeLight: makeStandardMaterial(0xf88a54, { roughness: 0.62, metalness: 0.17 }),
    steel: makeStandardMaterial(0x263b3e, { roughness: 0.84, metalness: 0.63 }),
    wheel: makeStandardMaterial(0x111b1d, { roughness: 0.9, metalness: 0.5 }),
    cable: makeStandardMaterial(0x0b1719, { roughness: 0.55, metalness: 0.76 }),
    hookDark: makeStandardMaterial(0x202d2f, { roughness: 0.82, metalness: 0.42 }),
    hookOrange: makeStandardMaterial(0xd55d26, { roughness: 0.68, metalness: 0.2 }),
    hookYellow: makeStandardMaterial(0xf2c84b, { roughness: 0.62, metalness: 0.14 }),
    window: makeStandardMaterial(0x183f4a, { roughness: 0.34, metalness: 0.48 }),
    wordmarkBacking: makeStandardMaterial(0x12282d, { roughness: 0.88, metalness: 0.2 }),
  };
}

function addCraneLights(scene) {
  const hemisphere = new THREE.HemisphereLight(0xeef7f5, 0x061a25, 1.55);
  hemisphere.name = "soft sky light";
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffe6bf, 2.25);
  key.name = "warm key light";
  key.position.set(7, 11, 9);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x48a9c8, 0.78);
  rim.name = "river rim light";
  rim.position.set(-9, 5, -8);
  scene.add(rim);
}

/**
 * Build a lightweight procedural crane from primitives.
 *
 * The returned object is intentionally useful on its own, while
 * `initHero3D` below adds the renderer and lifecycle management around it.
 */
export function createEriksbergGantryCrane(options = {}) {
  const span = Number(options.span) > 8 ? Number(options.span) : 15.8;
  const dimensions = {
    span,
    girderY: 4.03,
    girderHeight: 0.44,
    girderDepth: 0.5,
    frameXs: [-span * 0.31, span * 0.31],
    legBottomY: 0.22,
    legTopY: 3.86,
    legBottomZ: 1.46,
    legTopZ: 0.52,
    legThickness: 0.22,
    frameDepth: 2.82,
    frameCrossbarY: 2.43,
    railY: 4.34,
    railZ: 0.22,
    trolleyRailY: 4.38,
    trolleyY: 4.65,
    hookY: 1.18,
    trolleyTravel: Math.min(3.6, span * 0.255),
  };

  const scene = new THREE.Scene();
  const model = new THREE.Group();
  model.name = "Eriksberg gantry crane";
  model.userData.sourceImage = "/images/crane-today.jpg";
  model.userData.description = "Procedural gantry crane inspired by Eriksberg's preserved orange bockkran.";
  model.position.y = -0.06;
  scene.add(model);

  const materials = createMaterials();
  const girder = makeBox(
    model,
    "long orange main girder",
    [dimensions.span, dimensions.girderHeight, dimensions.girderDepth],
    materials.orange,
    [0, dimensions.girderY, 0],
  );

  makeBox(model, "girder lower shadow rail", [dimensions.span + 0.12, 0.11, 0.56], materials.orangeDark, [0, dimensions.girderY - 0.26, 0]);
  makeBox(model, "girder upper cap", [dimensions.span + 0.18, 0.11, 0.56], materials.orangeLight, [0, dimensions.girderY + 0.26, 0]);

  for (let index = -4; index <= 4; index += 1) {
    const bolt = makeCylinder(
      model,
      "girder inspection bolt",
      0.035,
      0.035,
      materials.hookYellow,
      [index * (span / 9), dimensions.girderY, dimensions.girderDepth / 2 + 0.035],
      8,
    );
    bolt.rotation.x = Math.PI / 2;
  }

  dimensions.frameXs.forEach((x, index) => addPortalFrame(model, x, index + 1, dimensions, materials));
  addTopRailsAndBogie(model, dimensions, materials);
  addServiceStairs(model, dimensions, materials);

  const wordmarkInfo = addWordmark(model, options.wordmark ?? DEFAULTS.wordmark, dimensions, materials);
  const trolley = addTrolley(model, dimensions, materials, wordmarkInfo.mesh);

  // Small warning lights on the girder help the crane read against a dark
  // photo, but remain cheap emissive-looking geometry rather than point lights.
  for (const x of [-span * 0.43, span * 0.43]) {
    const beacon = makeCylinder(model, "amber warning beacon", 0.075, 0.06, materials.hookYellow, [x, dimensions.girderY + 0.39, 0], 12);
    beacon.rotation.x = Math.PI / 2;
  }

  addCraneLights(scene);

  const cameraTarget = new THREE.Vector3(0, 2.18, 0);
  const dispose = () => disposeObject3D(scene);

  return {
    cameraTarget,
    dimensions,
    dispose,
    model,
    scene,
    trolley,
    wordmark: wordmarkInfo.mesh,
  };
}

function disposeObject3D(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value && value.isTexture && !textures.has(value)) {
          textures.add(value);
          value.dispose();
        }
      });
      material.dispose();
    });
  });
}

function applyFallback(fallback, detail) {
  if (!fallback) return;
  if (typeof fallback === "function") {
    fallback(detail);
    return;
  }

  let node = fallback;
  if (typeof fallback === "string" && typeof document !== "undefined") {
    node = document.querySelector(fallback);
  }
  if (!node || !node.style) return;
  node.hidden = false;
  node.removeAttribute?.("aria-hidden");
  node.style.removeProperty("display");
  node.style.removeProperty("visibility");
}

function createNoopController(element, reason) {
  return {
    canvas: null,
    element,
    error: reason,
    isSupported: false,
    pause() {},
    refresh() {},
    resume() {},
    setScrollProgress() {},
    dispose() {},
  };
}

class Hero3DController {
  constructor(element, options = {}) {
    this.element = element;
    this.options = { ...DEFAULTS, ...options };
    this.canvas = null;
    this.createdCanvas = false;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.crane = null;
    this.model = null;
    this.trolley = null;
    this.mediaQuery = null;
    this.intersectionObserver = null;
    this.resizeObserver = null;
    this.interactionElement = null;
    this.rafId = 0;
    this.lastTime = 0;
    this.disposed = false;
    this.failed = false;
    this.userPaused = false;
    this.visible = true;
    this.documentVisible = typeof document === "undefined" || document.visibilityState !== "hidden";
    this.running = false;
    this.reducedMotion = false;
    this.targetScrollProgress = clamp(Number(this.options.initialScrollProgress) || 0);
    this.scrollProgress = this.targetScrollProgress;
    this.pointerTarget = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.baseCamera = new THREE.Vector3(8.8, 5.08, this.options.cameraDistance);
    this.cameraLookTarget = new THREE.Vector3(0, 2.18, 0);
    this.baseModelRotation = { x: 0.015, y: -0.16 };

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleContextLost = this.handleContextLost.bind(this);
    this.tick = this.tick.bind(this);
  }

  init() {
    if (!this.element || typeof window === "undefined" || typeof document === "undefined") {
      return this;
    }

    try {
      this.setupCanvas();
      this.renderer = new THREE.WebGLRenderer({
        alpha: this.options.transparent,
        antialias: this.options.antialias,
        canvas: this.canvas,
        powerPreference: "high-performance",
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = false;
      this.renderer.setClearColor(0x071c27, this.options.transparent ? 0 : 1);

      this.crane = createEriksbergGantryCrane(this.options);
      this.scene = this.crane.scene;
      this.model = this.crane.model;
      this.trolley = this.crane.trolley;
      this.cameraLookTarget.copy(this.crane.cameraTarget);
      this.camera = new THREE.PerspectiveCamera(this.options.cameraFov, 1, 0.1, 100);
      this.camera.name = "Eriksberg hero camera";
      this.scene.add(this.camera);

      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      this.reducedMotion = Boolean(this.options.reducedMotion ?? prefersReducedMotion);
      this.installLifecycle();
      this.resize();
      this.targetScrollProgress = this.readScrollProgress();
      this.scrollProgress = this.reducedMotion ? 1 : this.targetScrollProgress;
      this.applyMotionState(0, true);
      this.render();

      this.element.dataset.hero3d = "ready";
      this.options.onReady?.({
        camera: this.camera,
        canvas: this.canvas,
        controller: this,
        model: this.model,
        renderer: this.renderer,
        scene: this.scene,
      });

      if (!this.reducedMotion) this.start();
    } catch (error) {
      this.enableFallback(error);
    }
    return this;
  }

  setupCanvas() {
    const isCanvas = this.element.tagName === "CANVAS";
    this.canvas = isCanvas ? this.element : this.element.querySelector("canvas[data-hero3d-canvas]");
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.createdCanvas = true;
      this.element.appendChild(this.canvas);
    }

    this.canvas.dataset.hero3dCanvas = "true";
    this.canvas.classList.add(this.options.canvasClass);
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.setAttribute("role", "presentation");
    this.canvas.tabIndex = -1;
    Object.assign(this.canvas.style, {
      display: "block",
      height: "100%",
      inset: "0",
      pointerEvents: this.options.interactive === false ? "none" : "auto",
      position: "absolute",
      width: "100%",
    });
  }

  installLifecycle() {
    const observeTarget = this.element.tagName === "CANVAS" ? this.element.parentElement || this.element : this.element;
    this.observeTarget = observeTarget;
    this.interactionElement = resolveElement(this.options.interactionTarget) || this.element;
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    if (this.options.interactive !== false) {
      this.interactionElement.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      this.interactionElement.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });
    }

    if (typeof window.matchMedia === "function") {
      this.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener("change", this.handleReducedMotionChange);
      } else {
        this.mediaQuery.addListener?.(this.handleReducedMotionChange);
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(observeTarget);
    }

    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          this.visible = Boolean(entry?.isIntersecting);
          if (this.visible) {
            this.handleResize();
            if (!this.reducedMotion) this.start();
          } else {
            this.stop();
          }
        },
        { threshold: 0.01 },
      );
      this.intersectionObserver.observe(observeTarget);
    }
  }

  handleReducedMotionChange = (event) => {
    this.reducedMotion = Boolean(event.matches);
    if (this.reducedMotion) {
      this.stop();
      this.scrollProgress = 1;
      this.targetScrollProgress = 1;
      this.applyMotionState(0, true);
      this.render();
    } else if (this.visible && this.documentVisible) {
      this.targetScrollProgress = this.readScrollProgress();
      this.start();
    }
  };

  handlePointerMove(event) {
    if (this.reducedMotion || this.failed || this.disposed) return;
    const rect = (this.interactionElement || this.element).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointerTarget.x = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    this.pointerTarget.y = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    this.start();
  }

  handlePointerLeave() {
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
    this.start();
  }

  handleScroll() {
    if (this.failed || this.disposed) return;
    this.targetScrollProgress = this.readScrollProgress();
    if (this.reducedMotion) return;
    this.start();
  }

  handleResize() {
    if (this.failed || this.disposed) return;
    this.resize();
    this.applyMotionState(0, true);
    this.render();
  }

  handleVisibilityChange() {
    this.documentVisible = document.visibilityState !== "hidden";
    if (this.documentVisible && this.visible && !this.reducedMotion) {
      this.start();
    } else if (!this.documentVisible) {
      this.stop();
    }
  }

  handleContextLost(event) {
    event.preventDefault();
    this.enableFallback(new Error("WebGL context lost"));
  }

  readScrollProgress() {
    if (typeof this.options.getScrollProgress === "function") {
      try {
        return clamp(Number(this.options.getScrollProgress({ element: this.element, window })) || 0);
      } catch {
        return this.scrollProgress;
      }
    }

    const rect = this.element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const travel = Math.max(viewportHeight * 1.08, rect.height || viewportHeight);
    return clamp(-rect.top / travel);
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const rect = this.element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.element.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Math.round(rect.height || this.element.clientHeight || window.innerHeight || 1));
    const aspect = width / height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, Number(this.options.maxPixelRatio) || DEFAULTS.maxPixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    const narrowness = clamp((1.15 - aspect) / 0.72);
    this.camera.fov = lerp(Number(this.options.cameraFov) || DEFAULTS.cameraFov, 53, narrowness);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // A gantry crane is much wider than it is tall. Portrait viewports need
    // substantially more breathing room than a desktop layout, otherwise
    // both portal frames fall outside the horizontal frustum.
    const distanceMultiplier = 1 + narrowness * 0.85;
    this.baseCamera.set(8.8 * distanceMultiplier, 5.08 * distanceMultiplier, (Number(this.options.cameraDistance) || DEFAULTS.cameraDistance) * distanceMultiplier);
    this.cameraLookTarget.y = lerp(this.crane.cameraTarget.y, -1.05, narrowness);
    this.camera.position.copy(this.baseCamera);
    this.camera.lookAt(this.cameraLookTarget);
  }

  getMotionState(immediate = false) {
    const progress = this.reducedMotion ? 1 : immediate ? this.scrollProgress : this.targetScrollProgress;
    const motionScale = Number(this.options.motionScale) || DEFAULTS.motionScale;
    const pointerX = this.reducedMotion ? 0 : this.pointerTarget.x * motionScale;
    const pointerY = this.reducedMotion ? 0 : this.pointerTarget.y * motionScale;
    const trolleyX = lerp(-this.crane.dimensions.trolleyTravel, this.crane.dimensions.trolleyTravel, progress);
    const modelRotationY = this.baseModelRotation.y + pointerX * 0.045 + (progress - 0.5) * 0.06;
    const modelRotationX = this.baseModelRotation.x - pointerY * 0.018;

    return {
      cameraX: this.baseCamera.x + pointerX * 0.24 + (progress - 0.5) * 0.28,
      cameraY: this.baseCamera.y + pointerY * 0.11 + Math.sin(progress * Math.PI) * 0.1,
      cameraZ: this.baseCamera.z - progress * 0.24,
      modelRotationX,
      modelRotationY,
      pointerX,
      pointerY,
      progress,
      trolleyX,
    };
  }

  applyMotionState(delta, immediate = false) {
    const target = this.getMotionState(immediate);

    if (immediate) {
      this.pointer.x = target.pointerX;
      this.pointer.y = target.pointerY;
      this.trolley.position.x = target.trolleyX;
      this.model.rotation.y = target.modelRotationY;
      this.model.rotation.x = target.modelRotationX;
      this.camera.position.set(target.cameraX, target.cameraY, target.cameraZ);
      this.camera.lookAt(this.cameraLookTarget);
      return;
    }

    this.pointer.x = damp(this.pointer.x, target.pointerX, 4.2, delta);
    this.pointer.y = damp(this.pointer.y, target.pointerY, 4.2, delta);
    this.scrollProgress = damp(this.scrollProgress, target.progress, 4.6, delta);
    this.trolley.position.x = damp(this.trolley.position.x, target.trolleyX, 3.8, delta);
    this.model.rotation.y = damp(this.model.rotation.y, target.modelRotationY, 3.2, delta);
    this.model.rotation.x = damp(this.model.rotation.x, target.modelRotationX, 3.2, delta);
    this.camera.position.x = damp(this.camera.position.x, target.cameraX, 3.1, delta);
    this.camera.position.y = damp(this.camera.position.y, target.cameraY, 3.1, delta);
    this.camera.position.z = damp(this.camera.position.z, target.cameraZ, 3.1, delta);
    this.camera.lookAt(this.cameraLookTarget);
  }

  isMotionSettled() {
    if (!this.camera || !this.model || !this.trolley) return true;
    const target = this.getMotionState();
    return [
      Math.abs(this.pointer.x - target.pointerX),
      Math.abs(this.pointer.y - target.pointerY),
      Math.abs(this.scrollProgress - target.progress),
      Math.abs(this.trolley.position.x - target.trolleyX),
      Math.abs(this.model.rotation.x - target.modelRotationX),
      Math.abs(this.model.rotation.y - target.modelRotationY),
      Math.abs(this.camera.position.x - target.cameraX),
      Math.abs(this.camera.position.y - target.cameraY),
      Math.abs(this.camera.position.z - target.cameraZ),
    ].every((difference) => difference <= MOTION_EPSILON);
  }

  start() {
    if (this.failed || this.disposed || this.userPaused || this.reducedMotion || !this.visible || !this.documentVisible || this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  tick(time) {
    if (!this.running || this.failed || this.disposed) return;
    const delta = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = time;
    this.applyMotionState(delta);
    this.render();
    if (this.isMotionSettled()) {
      this.stop();
      return;
    }
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  render() {
    if (!this.renderer || !this.scene || !this.camera || this.failed || this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  setScrollProgress(value, immediate = false) {
    if (this.failed || this.disposed) return this;
    this.targetScrollProgress = clamp(Number(value) || 0);
    if (immediate || this.reducedMotion) {
      this.scrollProgress = this.reducedMotion ? 1 : this.targetScrollProgress;
      this.applyMotionState(0, true);
      this.render();
    } else {
      this.start();
    }
    return this;
  }

  refresh() {
    if (this.failed || this.disposed) return this;
    this.resize();
    this.targetScrollProgress = this.readScrollProgress();
    if (this.reducedMotion) {
      this.scrollProgress = 1;
    }
    this.applyMotionState(0, true);
    this.render();
    if (!this.reducedMotion) this.start();
    return this;
  }

  pause() {
    this.userPaused = true;
    this.stop();
    return this;
  }

  resume() {
    this.userPaused = false;
    if (!this.reducedMotion) this.start();
    return this;
  }

  removeLifecycleListeners() {
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", this.handleScroll);
      window.removeEventListener("resize", this.handleResize);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    this.interactionElement?.removeEventListener("pointermove", this.handlePointerMove);
    this.interactionElement?.removeEventListener("pointerleave", this.handlePointerLeave);
    if (this.mediaQuery?.removeEventListener) {
      this.mediaQuery.removeEventListener("change", this.handleReducedMotionChange);
    } else {
      this.mediaQuery?.removeListener?.(this.handleReducedMotionChange);
    }
    this.canvas?.removeEventListener("webglcontextlost", this.handleContextLost);
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.intersectionObserver = null;
    this.resizeObserver = null;
    this.mediaQuery = null;
    this.interactionElement = null;
  }

  disposeGraphics(removeCanvas = false) {
    if (this.scene) {
      try {
        disposeObject3D(this.scene);
      } catch (error) {
        if (typeof console !== "undefined" && console.error) console.error(error);
      }
    }
    if (this.renderer) {
      try {
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
      } catch (error) {
        if (typeof console !== "undefined" && console.error) console.error(error);
      }
    }
    if (removeCanvas && this.createdCanvas && this.canvas?.parentNode === this.element) {
      this.canvas.remove();
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.model = null;
    this.trolley = null;
    this.crane = null;
    this.canvas = null;
    this.createdCanvas = false;
  }

  enableFallback(error) {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.stop();
    const detail = { canvas: this.canvas, element: this.element, error, controller: this };
    this.removeLifecycleListeners();
    this.disposeGraphics(this.createdCanvas);
    this.element.dataset.hero3d = "fallback";
    try {
      applyFallback(this.options.fallback, detail);
      this.options.onWebGLFailure?.(detail);
    } catch (callbackError) {
      // A fallback must never turn a graphics failure into an application
      // failure. Surface the callback exception for developers when possible.
      if (typeof console !== "undefined" && console.error) console.error(callbackError);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.removeLifecycleListeners();
    this.disposeGraphics(true);
    if (this.element?.dataset?.hero3d) delete this.element.dataset.hero3d;
  }
}

/**
 * Mount the procedural crane in `element` and return its lifecycle controller.
 *
 * Example:
 *   const hero = initHero3D(document.querySelector('.hero-3d'), {
 *     fallback: '.hero-photo',
 *     interactionTarget: '.hero',
 *     onWebGLFailure: ({ error }) => console.warn('3D unavailable', error),
 *   });
 *
 * `interactionTarget` accepts a selector or Element; pointer movement is
 * measured against that element and the controller falls back to its mount
 * element when the selector cannot be resolved. Public controller methods are
 * `setScrollProgress`, `refresh`, `pause`, `resume`, and `dispose`. `pause`
 * persists across scroll and pointer events until `resume` is called.
 */
export function initHero3D(target, options = {}) {
  const element = resolveElement(target);
  if (!element) return createNoopController(null, new Error("Hero 3D target element was not found"));
  const controller = new Hero3DController(element, options);
  return controller.init();
}

export default initHero3D;
