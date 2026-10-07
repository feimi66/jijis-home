import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const canvas = $("#sceneCanvas");
const stage = $("#stage");
const loadingScreen = $("#loadingScreen");
const viewStatus = $("#viewStatus");
const walkControls = $("#walkControls");
const desktopHint = $("#desktopHint");
const toast = $("#toast");

const PLAN_CENTER = new THREE.Vector3(5.45, 0, 6.25);
const CEILING_HEIGHT = 2.7;
const WALL_THICKNESS = 0.12;

const state = {
  mode: "orbit",
  room: "all",
  scheme: "merged",
  labelsVisible: true,
  wallsVisible: true,
  furnitureVisible: true,
  cameraTween: null,
  walkYaw: Math.PI,
  walkPitch: 0,
  walkLookActive: false,
  moved: false,
  pointerStart: { x: 0, y: 0 },
  lastPointer: { x: 0, y: 0 },
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeae6dd);
scene.fog = new THREE.Fog(0xeae6dd, 20, 37);

const camera = new THREE.PerspectiveCamera(42, 1, 0.06, 80);
camera.position.set(10.5, 13.5, 13.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.screenSpacePanning = true;
controls.minDistance = 4.5;
controls.maxDistance = 30;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI / 2.08;
controls.target.set(0, 0.4, 0);
controls.addEventListener("start", () => {
  state.cameraTween = null;
});

scene.add(new THREE.HemisphereLight(0xfffbf2, 0x8d8a80, 2.25));
scene.add(new THREE.AmbientLight(0xfff8ec, 0.58));

const sunlight = new THREE.DirectionalLight(0xfff1d3, 4.0);
sunlight.position.set(-8, 15, -10);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -14;
sunlight.shadow.camera.right = 14;
sunlight.shadow.camera.top = 14;
sunlight.shadow.camera.bottom = -14;
sunlight.shadow.bias = -0.00025;
scene.add(sunlight);

const warmFill = new THREE.PointLight(0xffd2a0, 13, 18, 2);
warmFill.position.set(-2.3, 3.4, -1.2);
scene.add(warmFill);

const roomFill = new THREE.PointLight(0xffebcd, 9, 12, 2);
roomFill.position.set(3.2, 3.0, 2.3);
scene.add(roomFill);

function makeWoodTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#cda574";
  ctx.fillRect(0, 0, 512, 512);

  const plankWidth = 72;
  for (let x = 0; x < 512; x += plankWidth) {
    ctx.fillStyle = x % (plankWidth * 2) === 0 ? "rgba(255,245,222,.12)" : "rgba(91,57,31,.035)";
    ctx.fillRect(x, 0, plankWidth, 512);
    ctx.strokeStyle = "rgba(87,55,31,.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();

    for (let y = 20; y < 512; y += 58) {
      const bend = Math.sin((x + y) * 0.07) * 8;
      ctx.strokeStyle = "rgba(105,68,39,.075)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 8, y);
      ctx.bezierCurveTo(x + 24 + bend, y - 5, x + 46 - bend, y + 6, x + 65, y);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.2, 4.4);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function makeTileTexture(base = "#ded8cc", grout = "#c6bfb4", size = 96) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = grout;
  ctx.lineWidth = 2;
  for (let x = 0; x <= 512; x += size) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y <= 512; y += size) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.6, 2.6);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const woodTexture = makeWoodTexture();
const tileTexture = makeTileTexture();
const bathTexture = makeTileTexture("#d7d9d7", "#babfbd", 128);

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf0ece3, roughness: 0.92 }),
  wallWarm: new THREE.MeshStandardMaterial({ color: 0xe6dacb, roughness: 0.9 }),
  floorStone: new THREE.MeshStandardMaterial({ map: tileTexture, color: 0xf4eee3, roughness: 0.68 }),
  floorWood: new THREE.MeshStandardMaterial({ map: woodTexture, color: 0xffe6c4, roughness: 0.76 }),
  floorBath: new THREE.MeshStandardMaterial({ map: bathTexture, color: 0xe5e6e3, roughness: 0.58 }),
  oak: new THREE.MeshStandardMaterial({ color: 0xb98552, roughness: 0.72 }),
  oakLight: new THREE.MeshStandardMaterial({ color: 0xd6b17f, roughness: 0.74 }),
  walnut: new THREE.MeshStandardMaterial({ color: 0x74513a, roughness: 0.68 }),
  black: new THREE.MeshStandardMaterial({ color: 0x242321, roughness: 0.44, metalness: 0.18 }),
  offWhite: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.83 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xc9bcaa, roughness: 0.98 }),
  fabricDark: new THREE.MeshStandardMaterial({ color: 0x746d63, roughness: 0.96 }),
  green: new THREE.MeshStandardMaterial({ color: 0x64755b, roughness: 0.86 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0x9d6846, roughness: 0.8 }),
  screen: new THREE.MeshStandardMaterial({
    color: 0x1f2931,
    emissive: 0x6389ac,
    emissiveIntensity: 0.72,
    roughness: 0.34,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xcfe3e1,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.78,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  windowGlass: new THREE.MeshPhysicalMaterial({
    color: 0xbfd5d8,
    roughness: 0.08,
    transmission: 0.7,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
};

const home = new THREE.Group();
home.name = "吉吉的家";
home.position.set(-PLAN_CENTER.x, 0, -PLAN_CENTER.z);
scene.add(home);

const floorsGroup = new THREE.Group();
const wallsGroup = new THREE.Group();
const furnitureGroup = new THREE.Group();
const labelsGroup = new THREE.Group();
const mergedScheme = new THREE.Group();
const glassScheme = new THREE.Group();
const mergedFurniture = new THREE.Group();
const glassFurniture = new THREE.Group();
const glassStructure = new THREE.Group();
mergedScheme.add(mergedFurniture);
glassScheme.add(glassFurniture, glassStructure);
home.add(floorsGroup, wallsGroup, furnitureGroup, labelsGroup, mergedScheme, glassScheme);

function box(parent, x, y, z, width, height, depth, material, options = {}) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  if (options.name) mesh.name = options.name;
  if (options.room) mesh.userData.room = options.room;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, x, y, z, radius, height, material, sides = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function floor(room, x, z, width, depth, material) {
  const mesh = box(floorsGroup, x + width / 2, -0.06, z + depth / 2, width, 0.12, depth, material, {
    room,
    name: `floor-${room}`,
  });
  mesh.userData.isFloor = true;
  return mesh;
}

function wallH(x1, x2, z, height = CEILING_HEIGHT, material = materials.wall, y = height / 2) {
  return box(wallsGroup, (x1 + x2) / 2, y, z, x2 - x1, height, WALL_THICKNESS, material);
}

function wallV(x, z1, z2, height = CEILING_HEIGHT, material = materials.wall, y = height / 2) {
  return box(wallsGroup, x, y, (z1 + z2) / 2, WALL_THICKNESS, height, z2 - z1, material);
}

function addWindowHorizontal(x, z, width, height = 1.55, sill = 0.72) {
  const group = new THREE.Group();
  const centerY = sill + height / 2;
  box(group, x, centerY, z, width, height, 0.045, materials.windowGlass, { castShadow: false });
  box(group, x, sill - 0.03, z, width + 0.1, 0.075, 0.08, materials.black);
  box(group, x, sill + height + 0.03, z, width + 0.1, 0.075, 0.08, materials.black);
  box(group, x - width / 2, centerY, z, 0.065, height + 0.08, 0.08, materials.black);
  box(group, x + width / 2, centerY, z, 0.065, height + 0.08, 0.08, materials.black);
  box(group, x, centerY, z, 0.045, height, 0.07, materials.black);
  home.add(group);
  return group;
}

function addWindowVertical(x, z, depth, height = 1.55, sill = 0.72) {
  const group = addWindowHorizontal(0, 0, depth, height, sill);
  group.rotation.y = Math.PI / 2;
  group.position.set(x, 0, z);
  return group;
}

function addDoorFrame(x, z, rotation = 0, width = 0.86) {
  const group = new THREE.Group();
  box(group, -width / 2, 1.05, 0, 0.07, 2.1, 0.1, materials.oak);
  box(group, width / 2, 1.05, 0, 0.07, 2.1, 0.1, materials.oak);
  box(group, 0, 2.07, 0, width, 0.07, 0.1, materials.oak);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  wallsGroup.add(group);
  return group;
}

// 平面分区：尺寸来自用户提供的户型图，局部凹凸结构做了适合网页浏览的简化。
floor("kitchen", 0.0, 0.0, 2.7, 1.6, materials.floorBath);
floor("balcony-a", 2.7, 0.0, 2.3, 1.6, materials.floorStone);
floor("living", 0.6, 1.6, 4.4, 2.3, materials.floorStone);
floor("living", 1.3, 3.9, 4.0, 5.3, materials.floorStone);
floor("gaming", 5.0, 0.6, 2.8, 3.3, materials.floorWood);
floor("guest", 7.8, 0.6, 3.1, 3.9, materials.floorWood);
floor("hall", 6.7, 4.0, 1.7, 2.3, materials.floorWood);
floor("bath", 5.0, 4.5, 1.7, 3.9, materials.floorBath);
floor("bath", 8.4, 4.5, 2.2, 2.2, materials.floorBath);
floor("closet", 8.4, 6.7, 2.2, 1.6, materials.floorWood);
floor("master", 6.7, 6.3, 3.3, 4.3, materials.floorWood);
floor("balcony-b", 6.7, 10.6, 4.0, 1.8, materials.floorStone);

// 外围墙与主要隔墙。
wallH(0, 0.42, 0);
wallH(2.28, 2.7, 0);
addWindowHorizontal(1.35, 0, 1.8);
wallV(0, 0, 1.6);
wallV(2.7, 0, 1.6);
wallH(0, 1.78, 1.6);
wallH(2.62, 5.0, 1.6);
addDoorFrame(2.2, 1.6, 0, 0.78);

wallH(2.7, 3.02, 0);
wallH(4.68, 5.0, 0);
addWindowHorizontal(3.85, 0, 1.62);
wallV(5.0, 0, 0.6);

wallH(5.0, 5.38, 0.6);
wallH(7.42, 7.8, 0.6);
addWindowHorizontal(6.4, 0.6, 2.0);
wallV(5.0, 0.6, 3.9);
wallV(7.8, 0.6, 3.08);
wallH(5.0, 6.82, 3.9);
wallH(7.62, 7.8, 3.9);
addDoorFrame(7.22, 3.9, 0, 0.76);

wallH(7.8, 8.28, 0.6);
wallH(10.42, 10.9, 0.6);
addWindowHorizontal(9.35, 0.6, 2.1);
wallV(10.9, 0.6, 4.5);
wallV(7.8, 0.6, 3.1);
wallH(7.8, 8.04, 4.5);
wallH(8.88, 10.9, 4.5);
addDoorFrame(8.46, 4.5, 0, 0.76);

wallV(0.6, 1.6, 2.34);
wallV(0.6, 3.18, 3.9);
addDoorFrame(0.6, 2.76, Math.PI / 2, 0.78);
wallV(1.3, 3.9, 9.2);
wallH(1.3, 1.66, 9.2);
wallH(4.72, 5.3, 9.2);
addWindowHorizontal(3.18, 9.2, 3.0, 1.62, 0.58);
wallV(5.3, 3.9, 4.62);
wallV(5.3, 8.3, 9.2);

wallV(5.0, 4.5, 8.4);
wallV(6.7, 4.5, 5.02);
wallV(6.7, 5.88, 8.4);
wallH(5.0, 5.4, 4.5);
wallH(6.22, 6.7, 4.5);
addDoorFrame(5.82, 4.5, 0, 0.76);
wallH(5.0, 5.32, 8.4);
wallH(6.28, 6.7, 8.4);
addWindowHorizontal(5.8, 8.4, 0.86, 1.2, 0.82);

wallV(8.4, 4.5, 5.0);
wallV(8.4, 5.86, 6.7);
addDoorFrame(8.4, 5.44, Math.PI / 2, 0.78);
wallV(10.6, 4.5, 6.7);
wallH(8.4, 10.6, 6.7);

wallV(8.4, 6.7, 7.08);
wallV(8.4, 7.94, 8.3);
addDoorFrame(8.4, 7.52, Math.PI / 2, 0.78);
wallV(10.6, 6.7, 8.3);
wallH(8.4, 10.6, 8.3);

wallV(6.7, 6.3, 8.64);
wallV(6.7, 9.5, 10.6);
addDoorFrame(6.7, 9.07, Math.PI / 2, 0.8);
wallV(10.0, 8.3, 10.6);
wallH(6.7, 7.16, 6.3);
wallH(8.08, 8.4, 6.3);
addDoorFrame(7.62, 6.3, 0, 0.8);

wallV(6.7, 10.6, 12.4);
wallV(10.7, 10.6, 12.4);
wallH(6.7, 7.14, 12.4);
wallH(10.22, 10.7, 12.4);
addWindowHorizontal(8.68, 12.4, 3.0, 1.72, 0.52);

function addRug(parent, x, z, width, depth, color = 0xb9a98f) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  return box(parent, x, 0.018, z, width, 0.035, depth, mat, { receiveShadow: true, castShadow: false });
}

function addPlant(parent, x, z, scale = 1) {
  cylinder(parent, x, 0.22 * scale, z, 0.18 * scale, 0.42 * scale, materials.terracotta, 18);
  const leafGeometry = new THREE.IcosahedronGeometry(0.34 * scale, 1);
  const leaf = new THREE.Mesh(leafGeometry, materials.green);
  leaf.position.set(x, 0.72 * scale, z);
  leaf.scale.set(0.86, 1.2, 0.86);
  leaf.castShadow = true;
  parent.add(leaf);
}

function addChair(parent, x, z, rotation = 0, material = materials.fabricDark) {
  const group = new THREE.Group();
  box(group, 0, 0.46, 0, 0.48, 0.12, 0.5, material);
  box(group, 0, 0.8, 0.21, 0.48, 0.65, 0.11, material);
  [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([px, pz]) => {
    box(group, px, 0.22, pz, 0.055, 0.44, 0.055, materials.black);
  });
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  return group;
}

function addBed(parent, x, z, width = 1.8, depth = 2.0, rotation = 0) {
  const group = new THREE.Group();
  box(group, 0, 0.24, 0, width, 0.36, depth, materials.oak);
  box(group, 0, 0.48, -0.02, width - 0.12, 0.3, depth - 0.16, materials.offWhite);
  box(group, 0, 0.78, -depth / 2 + 0.06, width, 1.15, 0.13, materials.fabric);
  box(group, -width * 0.25, 0.69, -depth * 0.28, width * 0.42, 0.16, 0.5, materials.offWhite);
  box(group, width * 0.25, 0.69, -depth * 0.28, width * 0.42, 0.16, 0.5, materials.offWhite);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  return group;
}

function addMonitor(parent, x, z, rotation = 0, scale = 1) {
  const group = new THREE.Group();
  box(group, 0, 1.11 * scale, 0, 0.67 * scale, 0.4 * scale, 0.045 * scale, materials.screen);
  box(group, 0, 0.86 * scale, 0.04 * scale, 0.06 * scale, 0.24 * scale, 0.06 * scale, materials.black);
  box(group, 0, 0.74 * scale, 0.04 * scale, 0.28 * scale, 0.035 * scale, 0.16 * scale, materials.black);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  return group;
}

function addCabinet(parent, x, z, width, depth, height, material = materials.oakLight, rotation = 0) {
  const group = new THREE.Group();
  box(group, 0, height / 2, 0, width, height, depth, material);
  const divisions = Math.max(1, Math.round(width / 0.72));
  for (let i = 1; i < divisions; i += 1) {
    box(group, -width / 2 + (width / divisions) * i, height / 2, depth / 2 + 0.003, 0.012, height * 0.9, 0.01, materials.black);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  return group;
}

// 客餐厅：3米L形沙发、75寸电视、六人餐桌。
addRug(furnitureGroup, 3.25, 6.15, 2.45, 2.6, 0xb9aa93);
box(furnitureGroup, 2.12, 0.43, 6.0, 0.78, 0.76, 2.75, materials.fabric);
box(furnitureGroup, 3.05, 0.43, 7.02, 1.45, 0.76, 0.78, materials.fabric);
box(furnitureGroup, 2.08, 0.74, 6.0, 0.16, 0.64, 2.72, materials.fabricDark);
box(furnitureGroup, 3.08, 0.74, 7.29, 1.5, 0.64, 0.16, materials.fabricDark);
box(furnitureGroup, 3.48, 0.27, 5.94, 1.2, 0.35, 0.65, materials.oakLight);
box(furnitureGroup, 5.08, 0.39, 6.2, 0.32, 0.72, 2.4, materials.oakLight);
box(furnitureGroup, 5.02, 1.32, 6.2, 0.055, 1.0, 1.7, materials.screen);

box(furnitureGroup, 2.75, 0.75, 2.72, 1.75, 0.09, 0.88, materials.oakLight);
box(furnitureGroup, 2.75, 0.37, 2.72, 0.12, 0.75, 0.58, materials.black);
[
  [1.94, 2.28, Math.PI], [2.75, 2.28, Math.PI], [3.56, 2.28, Math.PI],
  [1.94, 3.17, 0], [2.75, 3.17, 0], [3.56, 3.17, 0],
].forEach(([x, z, r]) => addChair(furnitureGroup, x, z, r, materials.fabric));
addPlant(furnitureGroup, 1.0, 3.45, 0.92);

// 厨房与生活阳台A。
box(furnitureGroup, 0.3, 0.46, 0.8, 0.52, 0.9, 1.34, materials.oakLight);
box(furnitureGroup, 1.38, 0.46, 0.27, 1.65, 0.9, 0.52, materials.oakLight);
box(furnitureGroup, 0.32, 1.64, 0.8, 0.43, 0.68, 1.25, materials.offWhite);
box(furnitureGroup, 1.42, 1.64, 0.29, 1.55, 0.68, 0.4, materials.offWhite);
box(furnitureGroup, 1.27, 0.94, 0.27, 0.7, 0.06, 0.45, materials.black);
box(furnitureGroup, 2.95, 0.5, 0.78, 0.58, 0.98, 0.64, materials.offWhite);
const washerDoor = cylinder(furnitureGroup, 2.95, 0.5, 0.445, 0.2, 0.035, materials.black, 32);
washerDoor.rotation.x = Math.PI / 2;

// 卧室A：双人直排电竞位，两套电脑，每人一台显示器。
box(furnitureGroup, 6.4, 0.76, 1.03, 2.24, 0.1, 0.66, materials.oakLight);
box(furnitureGroup, 6.4, 1.25, 0.72, 2.4, 0.06, 0.7, materials.wallWarm);
addMonitor(furnitureGroup, 5.82, 1.18, 0, 0.94);
addMonitor(furnitureGroup, 6.98, 1.18, 0, 0.94);
addChair(furnitureGroup, 5.82, 1.92, Math.PI, materials.black);
addChair(furnitureGroup, 6.98, 1.92, Math.PI, materials.black);
box(furnitureGroup, 5.34, 0.54, 3.42, 0.48, 1.04, 0.42, materials.black);
box(furnitureGroup, 7.45, 0.54, 3.42, 0.48, 1.04, 0.42, materials.black);
box(furnitureGroup, 6.4, 2.18, 3.72, 2.25, 0.08, 0.08, materials.black);

// 卧室B：客房兼未来儿童房，1.5米床、书桌、衣柜。
addBed(furnitureGroup, 9.65, 2.25, 1.5, 2.0, 0);
addCabinet(furnitureGroup, 8.12, 1.48, 0.45, 0.65, 2.1, materials.oakLight, 0);
box(furnitureGroup, 8.35, 0.74, 3.86, 0.92, 0.1, 0.48, materials.oakLight);
addChair(furnitureGroup, 8.45, 3.38, 0, materials.fabric);

// 卧室C：1.8米床与床头柜，衣帽间保留。
addBed(furnitureGroup, 8.62, 8.62, 1.8, 2.05, Math.PI / 2);
box(furnitureGroup, 9.64, 0.34, 7.88, 0.46, 0.62, 0.48, materials.walnut);
box(furnitureGroup, 9.64, 0.34, 9.38, 0.46, 0.62, 0.48, materials.walnut);
box(furnitureGroup, 6.92, 1.23, 7.1, 0.4, 2.35, 1.4, materials.oakLight);
addCabinet(furnitureGroup, 9.5, 7.12, 1.75, 0.45, 2.25, materials.oakLight, 0);

// 双卫：干湿分离淋浴。
function addBathroom(parent, x, z, rotation = 0) {
  const group = new THREE.Group();
  box(group, -0.42, 0.39, -0.46, 0.52, 0.76, 0.42, materials.offWhite);
  cylinder(group, 0.42, 0.34, -0.46, 0.29, 0.68, materials.offWhite, 30);
  box(group, 0, 1.15, 0.45, 1.45, 2.12, 0.035, materials.glass, { castShadow: false });
  box(group, 0, 2.2, 0.45, 1.5, 0.06, 0.065, materials.black);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
}
addBathroom(furnitureGroup, 5.86, 6.37, 0);
addBathroom(furnitureGroup, 9.5, 5.56, Math.PI / 2);

// 衣帽间。
addCabinet(furnitureGroup, 8.66, 7.5, 0.42, 0.68, 2.2, materials.oakLight, 0);
addCabinet(furnitureGroup, 10.32, 7.5, 0.42, 0.68, 2.2, materials.oakLight, 0);
box(furnitureGroup, 9.5, 0.46, 7.5, 0.95, 0.08, 0.42, materials.fabric);

// 阳台B方案A：与主卧连成一体，形成阅读、休憩空间。
box(mergedScheme, 8.7, 0.012, 11.5, 4.0, 0.08, 1.8, materials.floorWood, { receiveShadow: true });
box(mergedFurniture, 7.52, 0.42, 11.58, 1.15, 0.72, 0.72, materials.fabric);
box(mergedFurniture, 9.7, 0.43, 11.85, 1.45, 0.72, 0.48, materials.oakLight);
addPlant(mergedFurniture, 10.2, 10.95, 1.0);
addPlant(mergedFurniture, 7.1, 11.05, 0.78);

// 阳台B方案B：玻璃围合的电脑/喝茶多功能房。
box(glassScheme, 8.7, 0.012, 11.5, 4.0, 0.08, 1.8, materials.floorWood, { receiveShadow: true });
for (let i = 0; i < 4; i += 1) {
  const panelX = 7.2 + i * 1.0;
  box(glassStructure, panelX, 1.36, 10.62, 0.94, 2.6, 0.035, materials.glass, { castShadow: false });
  box(glassStructure, panelX - 0.49, 1.36, 10.62, 0.045, 2.66, 0.065, materials.black);
}
box(glassStructure, 8.7, 0.08, 10.62, 4.0, 0.065, 0.07, materials.black);
box(glassStructure, 8.7, 2.67, 10.62, 4.0, 0.065, 0.07, materials.black);
box(glassFurniture, 7.62, 0.75, 11.76, 1.42, 0.1, 0.52, materials.oakLight);
addMonitor(glassFurniture, 7.62, 11.47, 0, 0.78);
addChair(glassFurniture, 7.62, 11.18, 0, materials.fabricDark);
cylinder(glassFurniture, 9.42, 0.64, 11.62, 0.47, 0.08, materials.oakLight, 40);
cylinder(glassFurniture, 9.42, 0.31, 11.62, 0.07, 0.62, materials.black, 18);
addChair(glassFurniture, 9.42, 11.05, Math.PI, materials.fabric);
addChair(glassFurniture, 10.05, 11.66, -Math.PI / 2, materials.fabric);
addPlant(glassFurniture, 10.2, 10.98, 0.78);

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function addLabel(room, title, subtitle, x, z) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 170;
  const ctx = labelCanvas.getContext("2d");
  roundedRect(ctx, 8, 8, 496, 154, 42);
  ctx.fillStyle = "rgba(255,253,248,.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(89,74,55,.16)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#2c2924";
  ctx.font = "700 48px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, 256, 73);
  ctx.fillStyle = "#8a8176";
  ctx.font = "500 27px Microsoft YaHei, sans-serif";
  ctx.fillText(subtitle, 256, 121);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, 2.06, z);
  sprite.scale.set(1.8, 0.6, 1);
  sprite.renderOrder = 20;
  sprite.userData.room = room;
  labelsGroup.add(sprite);
}

addLabel("living", "客餐厅", "33.8㎡", 3.3, 4.45);
addLabel("kitchen", "厨房", "4.7㎡", 1.35, 0.8);
addLabel("gaming", "电竞房", "双人位", 6.4, 2.6);
addLabel("guest", "客房", "未来儿童房", 9.35, 2.9);
addLabel("bath", "双卫", "干湿分离", 7.7, 5.65);
addLabel("master", "主卧", "1.8米床", 8.35, 9.6);
addLabel("balcony-b", "阳台B", "双方案", 8.7, 11.72);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 34),
  new THREE.MeshStandardMaterial({ color: 0xded9d0, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.135;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(34, 34, 0xbcb4a8, 0xd3cdc3);
grid.position.y = -0.128;
grid.material.opacity = 0.24;
grid.material.transparent = true;
scene.add(grid);

const roomViews = {
  all: {
    label: "全屋鸟瞰",
    target: [5.45, 0.45, 6.25],
    offset: [10.7, 13.7, 13.1],
    walk: [3.6, 1.62, 5.4],
    yaw: Math.PI * 0.82,
  },
  living: {
    label: "客餐厅",
    target: [3.0, 0.65, 5.15],
    offset: [5.5, 6.4, 6.0],
    walk: [3.7, 1.62, 5.3],
    yaw: Math.PI * 0.56,
  },
  gaming: {
    label: "双人电竞房",
    target: [6.4, 0.72, 2.15],
    offset: [4.2, 5.3, 4.8],
    walk: [6.4, 1.62, 3.25],
    yaw: 0,
  },
  guest: {
    label: "客房 / 未来儿童房",
    target: [9.35, 0.7, 2.55],
    offset: [4.4, 5.6, 5.0],
    walk: [8.35, 1.62, 3.75],
    yaw: -Math.PI * 0.12,
  },
  master: {
    label: "主卧与阳台B",
    target: [8.6, 0.7, 9.55],
    offset: [4.8, 5.7, 5.6],
    walk: [7.25, 1.62, 9.2],
    yaw: -Math.PI * 0.22,
  },
  kitchen: {
    label: "厨房与生活阳台",
    target: [2.0, 0.65, 1.2],
    offset: [4.6, 5.2, 4.8],
    walk: [2.0, 1.62, 1.15],
    yaw: Math.PI * 0.5,
  },
  bath: {
    label: "双卫生间",
    target: [7.65, 0.7, 6.0],
    offset: [4.8, 5.8, 5.0],
    walk: [7.45, 1.62, 5.55],
    yaw: Math.PI * 0.5,
  },
};

function worldPoint(planX, y, planZ) {
  return new THREE.Vector3(planX - PLAN_CENTER.x, y, planZ - PLAN_CENTER.z);
}

function tweenToView(roomKey, immediate = false) {
  const view = roomViews[roomKey] || roomViews.all;
  const target = worldPoint(view.target[0], view.target[1], view.target[2]);
  const distanceFactor = window.innerWidth < 760 ? (roomKey === "all" ? 1.2 : 1.36) : 1;
  const position = target.clone().add(new THREE.Vector3(
    view.offset[0] * distanceFactor,
    view.offset[1] * distanceFactor,
    view.offset[2] * distanceFactor,
  ));

  if (immediate) {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    return;
  }

  state.cameraTween = {
    start: performance.now(),
    duration: 900,
    fromPosition: camera.position.clone(),
    toPosition: position,
    fromTarget: controls.target.clone(),
    toTarget: target,
  };
}

function updateRoomButtons(roomKey) {
  $$(".room-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.room === roomKey);
  });
}

function selectRoom(roomKey) {
  const view = roomViews[roomKey] || roomViews.all;
  state.room = roomKey;
  updateRoomButtons(roomKey);
  viewStatus.textContent = view.label;

  if (state.mode === "walk") {
    const spawn = view.walk;
    camera.position.copy(worldPoint(spawn[0], spawn[1], spawn[2]));
    state.walkYaw = view.yaw;
    state.walkPitch = 0;
    updateWalkRotation();
  } else {
    tweenToView(roomKey);
  }
}

function updateWalkRotation() {
  camera.rotation.order = "YXZ";
  camera.rotation.set(state.walkPitch, state.walkYaw, 0);
}

function setMode(mode) {
  if (mode !== "orbit" && mode !== "walk") return;
  state.mode = mode;
  controls.enabled = mode === "orbit";
  walkControls.classList.toggle("is-visible", mode === "walk");
  desktopHint.style.display = mode === "walk" ? "none" : "";
  labelsGroup.visible = mode === "orbit" && state.labelsVisible;
  $(".scheme-card").classList.toggle("is-hidden-mobile", mode === "walk");

  $$(".mode-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  $$(".mobile-nav-button").forEach((button) => {
    if (button.dataset.mobileAction === "orbit" || button.dataset.mobileAction === "walk") {
      button.classList.toggle("is-active", button.dataset.mobileAction === mode);
    }
  });

  if (mode === "walk") {
    const view = roomViews[state.room] || roomViews.living;
    const spawn = state.room === "all" ? roomViews.living.walk : view.walk;
    camera.position.copy(worldPoint(spawn[0], spawn[1], spawn[2]));
    camera.near = 0.04;
    camera.fov = 64;
    camera.updateProjectionMatrix();
    state.walkYaw = state.room === "all" ? roomViews.living.yaw : view.yaw;
    state.walkPitch = 0;
    updateWalkRotation();
    viewStatus.textContent = `${state.room === "all" ? "客餐厅" : view.label} · 第一人称`;
    showToast("使用方向键移动，拖动画面转向");
  } else {
    camera.near = 0.06;
    camera.fov = 42;
    camera.updateProjectionMatrix();
    viewStatus.textContent = (roomViews[state.room] || roomViews.all).label;
    tweenToView(state.room);
  }
}

function setScheme(scheme) {
  if (scheme !== "merged" && scheme !== "glass") return;
  state.scheme = scheme;
  mergedScheme.visible = scheme === "merged";
  glassScheme.visible = scheme === "glass";
  $("#schemeCaption").textContent = scheme === "merged" ? "阳台并入主卧" : "电脑 / 喝茶多功能房";
  $$(".scheme-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.scheme === scheme);
  });
  showToast(scheme === "merged" ? "已切换：阳台并入主卧" : "已切换：玻璃多功能房");
}

function updateDisplayOptions() {
  wallsGroup.visible = state.wallsVisible;
  glassStructure.visible = state.wallsVisible;
  furnitureGroup.visible = state.furnitureVisible;
  mergedFurniture.visible = state.furnitureVisible;
  glassFurniture.visible = state.furnitureVisible;
  labelsGroup.visible = state.mode === "orbit" && state.labelsVisible;
}

let toastTimer = 0;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

// 点击房间地面即可进入对应视角。
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener("pointerdown", (event) => {
  state.pointerStart.x = event.clientX;
  state.pointerStart.y = event.clientY;
  state.lastPointer.x = event.clientX;
  state.lastPointer.y = event.clientY;
  state.moved = false;

  if (state.mode === "walk") {
    state.walkLookActive = true;
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointermove", (event) => {
  const totalDx = event.clientX - state.pointerStart.x;
  const totalDy = event.clientY - state.pointerStart.y;
  if (Math.abs(totalDx) + Math.abs(totalDy) > 8) state.moved = true;

  if (state.mode === "walk" && state.walkLookActive) {
    const dx = event.clientX - state.lastPointer.x;
    const dy = event.clientY - state.lastPointer.y;
    state.walkYaw -= dx * 0.0052;
    state.walkPitch -= dy * 0.0042;
    state.walkPitch = THREE.MathUtils.clamp(state.walkPitch, -1.05, 1.05);
    updateWalkRotation();
  }

  state.lastPointer.x = event.clientX;
  state.lastPointer.y = event.clientY;
});

canvas.addEventListener("pointerup", (event) => {
  if (state.mode === "walk") {
    state.walkLookActive = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
    return;
  }

  if (state.moved) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(floorsGroup.children, false);
  const room = hits.find((hit) => hit.object.userData.room)?.object.userData.room;
  if (room && roomViews[room]) selectRoom(room);
});

canvas.addEventListener("pointercancel", () => {
  state.walkLookActive = false;
});

const pressed = new Set();
const keyToMove = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

window.addEventListener("keydown", (event) => {
  const move = keyToMove[event.code];
  if (move && state.mode === "walk") {
    pressed.add(move);
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const move = keyToMove[event.code];
  if (move) pressed.delete(move);
});

$$('[data-move]').forEach((button) => {
  const move = button.dataset.move;
  const start = (event) => {
    pressed.add(move);
    button.classList.add("is-pressed");
    event.preventDefault();
  };
  const end = () => {
    pressed.delete(move);
    button.classList.remove("is-pressed");
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
});

function updateWalk(delta) {
  if (state.mode !== "walk" || pressed.size === 0) return;
  let forwardAmount = 0;
  let rightAmount = 0;
  if (pressed.has("forward")) forwardAmount += 1;
  if (pressed.has("backward")) forwardAmount -= 1;
  if (pressed.has("right")) rightAmount += 1;
  if (pressed.has("left")) rightAmount -= 1;

  const length = Math.hypot(forwardAmount, rightAmount) || 1;
  forwardAmount /= length;
  rightAmount /= length;
  const speed = 2.05 * delta;
  const forward = new THREE.Vector3(-Math.sin(state.walkYaw), 0, -Math.cos(state.walkYaw));
  const right = new THREE.Vector3(Math.cos(state.walkYaw), 0, -Math.sin(state.walkYaw));
  camera.position.addScaledVector(forward, forwardAmount * speed);
  camera.position.addScaledVector(right, rightAmount * speed);

  // 保持相机在户型范围内。第一版不做施工级墙体碰撞，确保参观流畅。
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -5.0, 5.15);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -5.65, 5.95);
  camera.position.y = 1.62;
}

function bindUI() {
  $$(".room-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectRoom(button.dataset.room);
      closeMobileSheet();
    });
  });

  $$(".mode-button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  $$(".scheme-button").forEach((button) => {
    button.addEventListener("click", () => setScheme(button.dataset.scheme));
  });

  $("#resetView").addEventListener("click", () => {
    if (state.mode !== "orbit") setMode("orbit");
    selectRoom("all");
  });

  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    if (state.mode !== "orbit") setMode("orbit");
    selectRoom("all");
  });

  $("#wallsToggle").addEventListener("change", (event) => {
    state.wallsVisible = event.target.checked;
    updateDisplayOptions();
  });
  $("#furnitureToggle").addEventListener("change", (event) => {
    state.furnitureVisible = event.target.checked;
    updateDisplayOptions();
  });
  $("#labelsToggle").addEventListener("change", (event) => {
    state.labelsVisible = event.target.checked;
    updateDisplayOptions();
  });

  $("#shareButton").addEventListener("click", sharePage);
  $("#helpButton").addEventListener("click", openHelp);
  $("#startTour").addEventListener("click", closeHelp);
  $(".dialog-close").addEventListener("click", closeHelp);
  $(".dialog-backdrop").addEventListener("click", closeHelp);

  $$(".mobile-nav-button").forEach((button) => {
    button.addEventListener("click", () => handleMobileAction(button.dataset.mobileAction));
  });
  $("#closeSheet").addEventListener("click", closeMobileSheet);
  $(".sheet-backdrop").addEventListener("click", closeMobileSheet);
}

async function sharePage() {
  const shareData = {
    title: "吉吉的家 · 3D看房",
    text: "欢迎参观吉吉的家：约130㎡现代原木风3D设计方案",
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      showToast("链接已复制，可以发给家人朋友了");
    } else {
      window.prompt("复制下面的网页地址进行分享", window.location.href);
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast("暂时无法分享，请复制浏览器地址");
  }
}

function openHelp() {
  const dialog = $("#helpDialog");
  dialog.classList.add("is-open");
  dialog.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  const dialog = $("#helpDialog");
  dialog.classList.remove("is-open");
  dialog.setAttribute("aria-hidden", "true");
}

function handleMobileAction(action) {
  if (action === "orbit" || action === "walk") {
    setMode(action);
    return;
  }
  if (action === "rooms") openMobileSheet("rooms");
  if (action === "scheme") openMobileSheet("scheme");
}

function openMobileSheet(type) {
  const sheet = $("#mobileSheet");
  const content = $("#sheetContent");
  if (type === "rooms") {
    $("#sheetTitle").textContent = "快速看房";
    $("#sheetSubtitle").textContent = "选择要查看的空间";
    content.innerHTML = $("#roomList").outerHTML;
    $$(".room-button", content).forEach((button) => {
      button.addEventListener("click", () => {
        selectRoom(button.dataset.room);
        closeMobileSheet();
      });
    });
  } else {
    $("#sheetTitle").textContent = "主卧阳台方案";
    $("#sheetSubtitle").textContent = "直接比较两种空间利用方式";
    content.innerHTML = `
      <div class="segmented-control" role="group" aria-label="切换主卧阳台方案">
        <button class="scheme-button ${state.scheme === "merged" ? "is-active" : ""}" type="button" data-scheme="merged">A · 并入主卧</button>
        <button class="scheme-button ${state.scheme === "glass" ? "is-active" : ""}" type="button" data-scheme="glass">B · 玻璃多功能房</button>
      </div>`;
    $$(".scheme-button", content).forEach((button) => {
      button.addEventListener("click", () => {
        setScheme(button.dataset.scheme);
        selectRoom("master");
        closeMobileSheet();
      });
    });
  }
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
}

function closeMobileSheet() {
  const sheet = $("#mobileSheet");
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
}

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);

function updateCameraTween(now) {
  const tween = state.cameraTween;
  if (!tween) return;
  const progress = Math.min(1, (now - tween.start) / tween.duration);
  const eased = 1 - Math.pow(1 - progress, 3);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  if (progress >= 1) state.cameraTween = null;
}

let previousTime = performance.now();
function animate(now) {
  const delta = Math.min(0.05, (now - previousTime) / 1000);
  previousTime = now;
  if (state.mode === "orbit") {
    updateCameraTween(now);
    controls.update();
  } else {
    updateWalk(delta);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// 可选GLB入口：部署后可使用 ?model=assets/house.glb 载入精细模型，网页交互保持不变。
async function loadOptionalGLB() {
  const modelUrl = new URLSearchParams(window.location.search).get("model");
  if (!modelUrl) return;
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(modelUrl);
    gltf.scene.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    scene.add(gltf.scene);
    showToast("精细GLB模型已载入");
  } catch (error) {
    console.warn("GLB模型载入失败，继续使用网页内置模型。", error);
    showToast("精细模型未载入，已使用内置3D户型");
  }
}

bindUI();
setScheme("merged");
updateDisplayOptions();
resize();
tweenToView("all", true);
requestAnimationFrame(animate);
loadOptionalGLB();

window.setTimeout(() => {
  loadingScreen.classList.add("is-hidden");
}, 650);

window.JijiHome = {
  selectRoom,
  setMode,
  setScheme,
};
