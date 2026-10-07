import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "https://esm.sh/three@0.180.0/examples/jsm/geometries/RoundedBoxGeometry.js";
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

const PLAN_CENTER = new THREE.Vector3(6.4, 0, 6.2);
const CEILING_HEIGHT = 2.7;
const WALL_THICKNESS = 0.12;
const DOOR_HEIGHT = 2.12;
const DOOR_FRAME_WIDTH = 0.05;
const DOOR_FRAME_TOP = DOOR_HEIGHT + 0.06;
const DOOR_CLEARANCE = 0.003;

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
  walkSpeed: readWalkSpeed(),
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
renderer.setClearColor(0xeae6dd);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeae6dd);
scene.fog = new THREE.Fog(0xeae6dd, 50, 110);

const camera = new THREE.PerspectiveCamera(42, 1, 0.06, 150);
camera.position.set(10.5, 13.5, 13.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.zoomSpeed = 0.85;
controls.minDistance = 1.6;
controls.maxDistance = 65;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI / 2.08;
controls.target.set(0, 0.4, 0);
controls.addEventListener("start", () => {
  state.cameraTween = null;
});

scene.add(new THREE.HemisphereLight(0xfffbf2, 0x8d8a80, 1.8));
scene.add(new THREE.AmbientLight(0xfff8ec, 0.32));

const sunlight = new THREE.DirectionalLight(0xfff1d3, 3.3);
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


function createInteriorTextures() {
  let seed=0x4a494a49;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const tau=Math.PI*2, clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
  function map(size,pixel,data=false) {
    const c=document.createElement("canvas");c.width=c.height=size;
    const ctx=c.getContext("2d"),image=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const rgb=pixel(x,y,size),i=(y*size+x)*4;
      image.data[i]=clamp(rgb[0]);image.data[i+1]=clamp(rgb[1]);image.data[i+2]=clamp(rgb[2]);image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
    const texture=new THREE.CanvasTexture(c);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    texture.colorSpace=data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    return texture;
  }
  function grain(x,y,n) {
    const bend=Math.sin(x/n*tau)*1.5+Math.sin(x/n*tau*3)*.3;
    return Math.sin(y/n*tau*7+bend*.3)*3-Math.pow(Math.max(0,Math.sin(y/n*tau*47+bend)),9)*4+(rnd()-.5)*2;
  }
  const oak=map(512,(x,y,n)=>{const s=grain(x,y,n);return [218+s,194+s,158+s];});
  const tile=map(512,(x,y,n)=>{const edge=Math.min(x,y,n-1-x,n-1-y),s=(edge<2 ? -10 : edge<4 ? -2 : 0)+Math.sin(x/n*tau)*Math.sin(y/n*tau)*1.5+(rnd()-.5)*2;return [231+s,226+s,216+s];});
  const planks=map(512,(x,y,n)=>{
    const column=Math.floor(x/64),joint=Math.min(x%64,63-x%64);
    const end=(y+column*91)%256;
    const s=grain(y,x,n)+(column%3-1)*3-(joint<1 ? 10 : joint<2 ? 3 : 0)-(end<1 ? 5 : 0);
    return [215+s,189+s,151+s];
  });
  const size=256,height=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=Math.sin(x*Math.PI/2),b=Math.sin(y*Math.PI/2);
    height[y*size+x]=(a+b)*.16+a*b*.08+(rnd()-.5)*.03;
  }
  const cloth=map(size,(x,y)=>{const s=height[y*size+x]*9+(rnd()-.5);return [233+s,227+s,216+s];});
  const sample=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
  const clothNormal=map(size,(x,y)=>{const dx=sample(x+1,y)-sample(x-1,y),dy=sample(x,y+1)-sample(x,y-1),length=Math.hypot(dx,dy,1);return [128-dx/length*127,128-dy/length*127,128+127/length];},true);
  return {oak,tile,planks,cloth,clothNormal};
}
const interiorTextures=createInteriorTextures();

const woodTexture=interiorTextures.planks;
woodTexture.repeat.set(4.8,4.8);
const tileTexture=interiorTextures.tile;
tileTexture.repeat.set(8/.6,8/.6);
const bathTexture=interiorTextures.tile.clone();bathTexture.repeat.set(16,16);

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
  frostedGlass: new THREE.MeshPhysicalMaterial({
    color: 0xf2f0e8, roughness: 0.65, transmission: 0.22, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide,
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


materials.floorStone.color.set(0xffffff);
materials.floorWood.color.set(0xffffff);
materials.floorBath.color.set(0xf3f3ee);
materials.oak.map=interiorTextures.oak; materials.oak.color.set(0xc9ae8c);
materials.oakLight.map=interiorTextures.oak; materials.oakLight.color.set(0xffffff);
materials.walnut.map=interiorTextures.oak; materials.walnut.color.set(0x886d54);
[materials.fabric,materials.fabricDark].forEach(material=>{
  material.map=interiorTextures.cloth; material.normalMap=interiorTextures.clothNormal;
  material.normalScale=new THREE.Vector2(.08,.08);material.roughness=.96;
});
materials.fabric.color.set(0xe5dfd5);materials.fabricDark.color.set(0xbab1a2);
materials.linen=materials.fabric.clone();materials.linen.color.set(0xffffff);
materials.duvet=materials.fabric.clone();materials.duvet.color.set(0xaeb9a8);
materials.porcelain=new THREE.MeshPhysicalMaterial({color:0xf6f5ef,roughness:.24,clearcoat:.6,clearcoatRoughness:.2});
materials.chrome=new THREE.MeshStandardMaterial({color:0xc8c9c6,roughness:.25,metalness:.88});
materials.baseboard=new THREE.MeshStandardMaterial({color:0xe9e4da,roughness:.65});
materials.soil=new THREE.MeshStandardMaterial({color:0x514739,roughness:1});
materials.leaf=materials.green.clone();materials.leaf.side=THREE.DoubleSide;materials.leaf.roughness=.65;
const home = new THREE.Group();
home.name = "吉吉的家";
home.position.set(-PLAN_CENTER.x, 0, -PLAN_CENTER.z);
scene.add(home);

const floorAreas = [];
const wallSegments = [];
const doors = [];
const drawers = [];
const doorsGroup = new THREE.Group();
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
home.add(floorsGroup, wallsGroup, doorsGroup, furnitureGroup, labelsGroup, mergedScheme, glassScheme);

function box(parent, x, y, z, width, height, depth, material, options = {}) {
  // 墙与地面保留准确边界；家具和饰面使用小圆角，避免生硬积木边缘。
  const shortest = Math.min(width, height, depth);
  const structural = parent === wallsGroup || parent === floorsGroup || parent === glassStructure;
  const fabric = material === materials.fabric || material === materials.fabricDark;
  const radius = options.radius ?? (structural || material.transparent || shortest < 0.02 ? 0 : Math.min(shortest / 4, fabric ? 0.035 : 0.006));
  const geometry = radius > 0 ? new RoundedBoxGeometry(width, height, depth, fabric ? 3 : 2, radius) : new THREE.BoxGeometry(width, height, depth);
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
  floorAreas.push({ room, x1: x, z1: z, x2: x + width, z2: z + depth });
  mesh.userData.isFloor = true;
  return mesh;
}

function wallH(x1, x2, z, height = CEILING_HEIGHT, material = materials.wall, y = height / 2) {
  if (y - height / 2 < 0.25) wallSegments.push({ x1, z1: z, x2, z2: z });
  return box(wallsGroup, (x1 + x2) / 2, y, z, x2 - x1, height, WALL_THICKNESS, material);
}

function wallV(x, z1, z2, height = CEILING_HEIGHT, material = materials.wall, y = height / 2) {
  if (y - height / 2 < 0.25) wallSegments.push({ x1: x, z1, x2: x, z2 });
  return box(wallsGroup, x, y, (z1 + z2) / 2, WALL_THICKNESS, height, z2 - z1, material);
}

// 普通窗嵌入墙洞，窗台下方及窗顶上方均有完整墙体。
function addWallWindow(x, z, width, height, sill, rotation = 0, { panoramic = false, frosted = false } = {}) {
  const group = new THREE.Group();
  const top = sill + height;
  const centerY = sill + height / 2;
  const left = -width / 2;
  const right = width / 2;
  const frameWidth = 0.055;
  const glassMaterial = frosted ? materials.frostedGlass : materials.windowGlass;
  if (rotation === 0) {
    if (sill > 0) wallH(x + left, x + right, z, sill, materials.wall, sill / 2);
    if (top < CEILING_HEIGHT) wallH(x + left, x + right, z, CEILING_HEIGHT - top, materials.wall, (top + CEILING_HEIGHT) / 2);
    wallSegments.push({ x1: x + left, z1: z, x2: x + right, z2: z });
  } else {
    if (sill > 0) wallV(x, z + left, z + right, sill, materials.wall, sill / 2);
    if (top < CEILING_HEIGHT) wallV(x, z + left, z + right, CEILING_HEIGHT - top, materials.wall, (top + CEILING_HEIGHT) / 2);
    wallSegments.push({ x1: x, z1: z + left, x2: x, z2: z + right });
  }
  // 客厅是一块连续的无框玻璃，边缘直接进入墙体，无中间立柱或黑色边框。
  if (panoramic) {
    box(group, 0, centerY, 0, width + 0.002, height + 0.002, 0.018, materials.windowGlass,
      { castShadow: false, name: "living-frameless-glass", radius: 0 });
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    group.userData.windowType = "panoramic";
    wallsGroup.add(group);
    return group;
  }
  box(group, 0, centerY, 0, width - frameWidth, height - frameWidth, 0.02, glassMaterial, { castShadow: false });
  [left, right].forEach(px => box(group, px, centerY, 0, frameWidth, height + frameWidth, 0.11, materials.black));
  [sill, top].forEach(y => box(group, 0, y, 0, width + frameWidth, frameWidth, 0.11, materials.black));
  const divisions = 2;
  for (let i = 1; i < divisions; i++) box(group, left + width * i / divisions, centerY, 0, 0.035, height, 0.085, materials.black);
  if (!panoramic) {
    box(group, 0, sill - 0.02, 0, width + 0.08, 0.04, WALL_THICKNESS + 0.06, materials.offWhite);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.userData.windowType = panoramic ? 'panoramic' : 'wall-window';
  wallsGroup.add(group);
  return group;
}

function addWindowHorizontal(x, z, width, height = 1.45, sill = 0.85, options = {}) {
  return addWallWindow(x, z, width, height, sill, 0, options);
}

function addWindowVertical(x, z, depth, height = 1.45, sill = 0.85, options = {}) {
  return addWallWindow(x, z, depth, height, sill, Math.PI / 2, options);
}

// 以米为单位。标注互相冲突的总尺寸不用于强行拉伸房间。
const PLAN = {
  kitchen: { x: 0, z: 0, w: 2.7, d: 1.6 },
  balconyA: { x: 2.7, z: 0, w: 2.3, d: 1.6 },
  bedroomA: { x: 5.5, z: 0.6, w: 2.8, d: 3.9 },
  bedroomB: { x: 8.3, z: 0.6, w: 3.1, d: 3.9 },
  // 原图为客餐厅向右延伸的横向过道，入口处没有隔墙。
  hall: { x: 5.5, z: 4.5, w: 4.0, d: 1.5 },
  bathA: { x: 6.1, z: 6.0, w: 2.0, d: 3.2 },
  bathB: { x: 9.5, z: 4.5, w: 1.9, d: 2.2 },
  closet: { x: 9.5, z: 6.7, w: 1.9, d: 1.6 },
  master: { x: 8.1, z: 8.3, w: 3.3, d: 3.6 },
  balconyB: { x: 8.1, z: 11.9, w: 5.7, d: 1.8 },
};

function addDoorFrame(x, z, rotation, width, material = materials.oak) {
  const group = new THREE.Group();
  [-1, 1].forEach(side => box(group, side * (width / 2 + DOOR_FRAME_WIDTH / 2), DOOR_FRAME_TOP / 2, 0,
    DOOR_FRAME_WIDTH, DOOR_FRAME_TOP, 0.16, material));
  box(group, 0, (DOOR_HEIGHT + DOOR_FRAME_TOP) / 2, 0, width + DOOR_FRAME_WIDTH * 2,
    DOOR_FRAME_TOP - DOOR_HEIGHT, 0.16, material);
  // 门槛与两侧地面齐平，覆盖接缝而不抬高地坪。
  box(group, 0, -0.02, 0, width + DOOR_FRAME_WIDTH * 2, 0.04, 0.18, materials.floorStone);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  wallsGroup.add(group);
  return group;
}

function addDoor({ id, label, x, z, width = 0.86, rotation = 0, hinge = 'left', swing = 1, type = 'swing', open = true, scheme = null }) {
  const frame = addDoorFrame(x, z, rotation, width, type === "sliding" ? materials.black : materials.oak);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  doorsGroup.add(group);
  const pivot = new THREE.Group();
  const direction = hinge === 'left' ? 1 : -1;
  if (type === 'swing') pivot.position.x = -direction * (width / 2 - DOOR_CLEARANCE);
  group.add(pivot);
  const leafWidth = type === 'sliding' ? width / 2 + 0.025 : width - DOOR_CLEARANCE * 2;
  const center = type === 'sliding' ? -width / 4 : direction * leafWidth / 2;
  const isGlass = type === 'sliding';
  const leafHeight = DOOR_HEIGHT - DOOR_CLEARANCE * 2;
  const leaf = box(pivot, center, DOOR_HEIGHT / 2, 0, leafWidth, leafHeight, 0.045, isGlass ? materials.glass : materials.oakLight);
  const trimMaterial = isGlass ? materials.black : materials.oak;
  [-1, 1].forEach(side => box(pivot, center + side * (leafWidth / 2 - 0.02), DOOR_HEIGHT / 2, 0, 0.04, leafHeight, 0.07, trimMaterial));
  [DOOR_CLEARANCE + 0.025, DOOR_HEIGHT - DOOR_CLEARANCE - 0.025].forEach(y => box(pivot, center, y, 0, leafWidth, 0.05, 0.07, trimMaterial));
  const handleX = type === 'sliding' ? center - leafWidth / 2 + 0.09 : direction * (leafWidth - 0.13);
  [-1,1].forEach(side=>{
    const rose=cylinder(pivot,handleX,1.0,side*.031,.024,.016,materials.chrome,24);rose.rotation.x=Math.PI/2;
    if(type==="sliding")rod(pivot,[handleX,.91,side*.052],[handleX,1.09,side*.052],.009,materials.black);
    else {
      rod(pivot,[handleX,1.0,side*.038],[handleX,1.0,side*.070],.011,materials.chrome);
      rod(pivot,[handleX,1.0,side*.070],[handleX-direction*.12,1.0,side*.070],.008,materials.chrome);
    }
  });
  if (type === 'sliding') {
    const fixed = box(group, width / 4, DOOR_HEIGHT / 2, -0.045, width / 2, leafHeight, 0.035, materials.glass);
    fixed.userData.doorId = id;
    const fixedStile = box(group, 0, DOOR_HEIGHT / 2, -0.045, 0.04, leafHeight, 0.055, materials.black);
    fixedStile.userData.doorId = id;
    box(group, width / 2 - 0.015, DOOR_HEIGHT / 2, -0.045, 0.04, leafHeight, 0.055, materials.black);
  }
  const door = { id, label, x, z, width, rotation, direction, swing, type, scheme, group, frame, pivot, leafWidth, open, progress: open ? 1 : 0 };
  pivot.traverse(object => { object.userData.doorId = id; });
  doors.push(door);
  applyDoorPosition(door);
  return door;
}

function applyDoorPosition(door) {
  const t = door.progress;
  if (door.type === 'sliding') door.pivot.position.x = t * door.width / 2;
  else door.pivot.rotation.y = door.swing * t * Math.PI / 2;
}

function toggleDoor(id, force) {
  const door = doors.find(item => item.id === id);
  if (!door || !door.group.visible) return;
  door.open = typeof force === 'boolean' ? force : !door.open;
  updateDoorButtons();
  showToast(door.label + (door.open ? '已打开' : '已关闭'));
}

function updateDoorButtons() {
  $$('.door-button').forEach(button => {
    const door = doors.find(item => item.id === button.dataset.door);
    button.setAttribute('aria-pressed', String(door.open));
    button.querySelector('small').textContent = door.open ? '已打开 · 点击关闭' : '已关闭 · 点击打开';
    button.disabled = door.scheme && door.scheme !== state.scheme;
  });
}

function updateDoors(delta) {
  doors.forEach(door => {
    const target = door.open ? 1 : 0;
    door.progress += Math.sign(target - door.progress) * Math.min(Math.abs(target - door.progress), delta * 2.7);
    applyDoorPosition(door);
  });
}

function wallWithDoorH(x1, x2, z, door) {
  wallH(x1, door.x - door.width / 2 - DOOR_FRAME_WIDTH, z);
  wallH(door.x + door.width / 2 + DOOR_FRAME_WIDTH, x2, z);
  wallH(door.x - door.width / 2 - DOOR_FRAME_WIDTH, door.x + door.width / 2 + DOOR_FRAME_WIDTH, z, CEILING_HEIGHT - DOOR_FRAME_TOP, materials.wall, (CEILING_HEIGHT + DOOR_FRAME_TOP) / 2);
  addDoor({ ...door, z });
}

function wallWithDoorV(x, z1, z2, door) {
  wallV(x, z1, door.z - door.width / 2 - DOOR_FRAME_WIDTH);
  wallV(x, door.z + door.width / 2 + DOOR_FRAME_WIDTH, z2);
  wallV(x, door.z - door.width / 2 - DOOR_FRAME_WIDTH, door.z + door.width / 2 + DOOR_FRAME_WIDTH, CEILING_HEIGHT - DOOR_FRAME_TOP, materials.wall, (CEILING_HEIGHT + DOOR_FRAME_TOP) / 2);
  addDoor({ ...door, x, rotation: Math.PI / 2 });
}

// 连续铺地；房间之间的门槛与通道没有缝隙。
Object.entries(PLAN).forEach(([name, p]) => {
  const room = { kitchen: 'kitchen', balconyA: 'balcony-a', bedroomA: 'gaming', bedroomB: 'guest', bathA: 'bath-a', bathB: 'bath-b', balconyB: 'balcony-b' }[name] || name;
  floor(room, p.x, p.z, p.w, p.d, name.startsWith('bath') || name === 'kitchen' ? materials.floorBath : name === 'hall' || name === 'balconyA' ? materials.floorStone : materials.floorWood);
});
floor('living', 0.7, 1.6, 4.8, 2.3, materials.floorStone);
floor('living', 1.6, 3.9, 4.5, 5.3, materials.floorStone);
floor('living', 5.5, 3.9, 0.6, 2.1, materials.floorStone);
floor('master', 8.1, 6.0, 1.4, 2.3, materials.floorWood);

// 厨房、生活阳台与玄关。
wallH(0, 0.48, 0); wallH(2.22, 2.7, 0); addWindowHorizontal(1.35, 0, 1.74, 1.2, 1.05);
wallV(0, 0, 1.6); wallV(2.7, 0, 1.6);
wallWithDoorH(0, 2.7, 1.6, { id: 'kitchen', label: '厨房门', x: 2.2, width: 0.8, hinge: 'right', swing: -1 });
wallH(2.7, 3.2, 0); wallH(4.5, 5, 0); addWindowHorizontal(3.85, 0, 1.3, 1.4, 0.9);
wallV(5, 0, 1.6);
wallWithDoorH(2.7, 5, 1.6, { id: 'balcony-a', label: '阳台A推拉门', x: 3.85, width: 1.7, type: 'sliding' });
wallH(0, 0.7, 1.6);
wallWithDoorV(0.7, 1.6, 2.95, { id: 'entry', label: '入户门', z: 2.2, width: 0.95, hinge: 'right', swing: 1, open: false });
wallH(0.7, 1.6, 2.95); wallV(1.6, 2.95, 9.2);
wallH(1.6, 2.0, 9.2); wallH(5.7, 6.1, 9.2); addWindowHorizontal(3.85, 9.2, 3.7, 2.64, 0.02, { panoramic: true });
// 阳台A到卧室A之间的外墙台阶。
wallH(5, 5.5, 1.6); wallV(5.5, 0.6, 1.6);

// 卧室南侧的门均朝向同一条横向过道；客厅到过道保持开放。
wallH(5.5, 6.1, 0.6); wallH(7.7, 8.3, 0.6); addWindowHorizontal(6.9, 0.6, 1.6, 1.5, 0.85);
wallV(5.5, 1.6, 4.5); wallV(8.3, 0.6, 4.5);
wallWithDoorH(5.5, 8.3, 4.5, { id: 'gaming', label: '卧室A / 电竞房门', x: 7.75, width: 0.9, hinge: 'right', swing: -1 });
wallH(8.3, 8.95, 0.6); wallH(10.75, 11.4, 0.6); addWindowHorizontal(9.85, 0.6, 1.8, 1.5, 0.85);
wallV(11.4, 0.6, 5.0); wallV(11.4, 5.9, 11.9);
addWindowVertical(11.4, 5.45, 0.9, 0.85, 1.25, { frosted: true });
wallWithDoorH(8.3, 11.4, 4.5, { id: 'guest', label: '卧室B / 客房门', x: 8.85, width: 0.9, hinge: 'left', swing: 1 });

// 过道净深1.38m。客厅开口从x=5.5连续进入，绝不再加封堵墙。
wallWithDoorH(6.1, 8.1, 6.0, { id: 'bath-a', label: '卫生间A门', x: 6.68, width: 0.86, hinge: 'left', swing: -1 });
wallV(6.1, 6.0, 9.2); wallV(8.1, 6.0, 11.9);
wallH(6.1, 6.7, 9.2); wallH(7.5, 8.1, 9.2); addWindowHorizontal(7.1, 9.2, 0.8, 0.85, 1.25, { frosted: true });
wallWithDoorH(8.1, 9.5, 6.0, { id: 'master', label: '卧室C / 主卧门', x: 8.7, width: 0.9, hinge: 'left', swing: -1 });
wallWithDoorV(9.5, 4.5, 6.7, { id: 'bath-b', label: '卫生间B门', z: 6.25, width: 0.76, hinge: 'right', swing: 1 });
wallH(9.5, 11.4, 6.7);
// 衣帽间图上为敞口，只保留上下墙段，入口宽0.9m。
wallV(9.5, 6.7, 7.15); wallV(9.5, 8.15, 8.3); wallH(9.5, 11.4, 8.3);

// 主卧与阳台B。方案A取消隔断；方案B保留可开关推拉门。
wallH(8.1, 8.55, 11.9); wallH(10.95, 11.4, 11.9);
addDoor({ id: 'balcony-b', label: '阳台B推拉门', x: 9.75, z: 11.9, width: 2.4, type: 'sliding', scheme: 'glass' });
wallH(11.4, 13.8, 11.9); wallV(8.1, 11.9, 13.7); wallV(13.8, 11.9, 13.7);
wallH(8.1, 8.6, 13.7); wallH(10.0, 10.25, 13.7); wallH(11.65, 11.9, 13.7); wallH(13.3, 13.8, 13.7);
[9.3, 10.95, 12.6].forEach(x => addWindowHorizontal(x, 13.7, 1.4, 1.4, 0.9));


// 合并同种材料的轴向方块，只保留整体外表面，消除重叠面和墙角拼块接缝。
// 坐标压缩保留所有窗洞与门洞；每个平面再合并成连续矩形。
function unifyBoxSurfaces(parent, meshes, material, name, uvScale = 8) {
  if (!meshes.length) return null;
  const bounds = meshes.map(mesh => {
    const p = mesh.geometry.parameters;
    return [[mesh.position.x - p.width / 2, mesh.position.y - p.height / 2, mesh.position.z - p.depth / 2],
      [mesh.position.x + p.width / 2, mesh.position.y + p.height / 2, mesh.position.z + p.depth / 2]];
  });
  const axes = [0, 1, 2].map(axis => [...new Set(bounds.flatMap(b => [b[0][axis], b[1][axis]]).map(n => Number(n.toFixed(6))))].sort((a,b) => a-b));
  const count = axes.map(a => a.length - 1);
  const maps = axes.map(a => new Map(a.map((n,i) => [n,i])));
  const cells = new Uint8Array(count[0] * count[1] * count[2]);
  const index = (x,y,z) => (x * count[1] + y) * count[2] + z;
  bounds.forEach(b => {
    const lo = b[0].map((n,a) => maps[a].get(Number(n.toFixed(6))));
    const hi = b[1].map((n,a) => maps[a].get(Number(n.toFixed(6))));
    for (let x=lo[0]; x<hi[0]; x++) for (let y=lo[1]; y<hi[1]; y++) for (let z=lo[2]; z<hi[2]; z++) cells[index(x,y,z)] = 1;
  });
  const occupied = p => p.every((n,a) => n >= 0 && n < count[a]) && cells[index(...p)] === 1;
  const positions=[], normals=[], uvs=[];
  for (let axis=0; axis<3; axis++) {
    const u=(axis+1)%3, v=(axis+2)%3;
    for (let plane=0; plane<=count[axis]; plane++) for (const sign of [-1,1]) {
      const mask=new Uint8Array(count[u]*count[v]);
      for (let i=0; i<count[u]; i++) for (let j=0; j<count[v]; j++) {
        const inside=[0,0,0], outside=[0,0,0];
        inside[axis]=plane+(sign===1 ? -1 : 0); outside[axis]=plane+(sign===1 ? 0 : -1);
        inside[u]=outside[u]=i; inside[v]=outside[v]=j;
        if (occupied(inside) && !occupied(outside)) mask[i*count[v]+j]=1;
      }
      for (let i=0; i<count[u]; i++) for (let j=0; j<count[v]; j++) {
        if (!mask[i*count[v]+j]) continue;
        let endJ=j+1; while(endJ<count[v] && mask[i*count[v]+endJ]) endJ++;
        let endI=i+1;
        while(endI<count[u]) {
          let complete=true;
          for(let k=j;k<endJ;k++) if(!mask[endI*count[v]+k]) { complete=false; break; }
          if(!complete) break;
          endI++;
        }
        for(let a=i;a<endI;a++) for(let b=j;b<endJ;b++) mask[a*count[v]+b]=0;
        const corners=[[i,j],[endI,j],[endI,endJ],[i,endJ]].map(([a,b]) => {
          const p=[0,0,0]; p[axis]=axes[axis][plane]; p[u]=axes[u][a]; p[v]=axes[v][b]; return p;
        });
        for(const corner of sign===1 ? [0,1,2,0,2,3] : [0,2,1,0,3,2]) {
          const p=corners[corner], normal=[0,0,0]; normal[axis]=sign;
          positions.push(...p); normals.push(...normal);
          uvs.push(p[axis===0 ? 2 : 0]/uvScale, p[axis===1 ? 2 : 1]/uvScale);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const result=new THREE.Mesh(geometry,material); result.name=name;
  result.castShadow=true; result.receiveShadow=true;
  meshes.forEach(mesh => { parent.remove(mesh); mesh.geometry.dispose(); });
  parent.add(result);
  return result;
}

function finishStructure() {
  unifyBoxSurfaces(wallsGroup, wallsGroup.children.filter(m => m.isMesh && m.material === materials.wall), materials.wall, "continuous-walls");
  [materials.floorStone, materials.floorWood, materials.floorBath].forEach((material,i) => {
    const mesh = unifyBoxSurfaces(floorsGroup, floorsGroup.children.filter(m => m.isMesh && m.material === material), material, "continuous-floor-"+i);
    mesh.userData.isFloor = true;
  });
}

finishStructure();


function objectMesh(parent,geometry,material,x=0,y=0,z=0,name="") {
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=true;if(name)mesh.name=name;parent.add(mesh);return mesh;
}
function rod(parent,start,end,radius=.018,material=materials.chrome) {
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),direction=b.clone().sub(a);
  const mesh=objectMesh(parent,new THREE.CylinderGeometry(radius,radius,direction.length(),16),material);
  mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return mesh;
}
function ring(parent,x,y,z,radius,tube,material,scaleX=1,scaleZ=1) {
  const mesh=objectMesh(parent,new THREE.TorusGeometry(radius,tube,10,40),material,x,y,z);
  mesh.rotation.x=Math.PI/2;mesh.scale.set(scaleX,scaleZ,1);return mesh;
}
function softBox(parent,x,y,z,w,h,d,material=materials.fabric,radius=.06,puff=.012,name="soft-cushion") {
  const geometry=new RoundedBoxGeometry(w,h,d,4,Math.min(radius,w/2,h/2,d/2));
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  for(let i=0;i<p.count;i++){
    const px=p.getX(i),py=p.getY(i),pz=p.getZ(i),a=px/(w/2),b=pz/(d/2),sign=Math.sign(py);
    const vx=Math.max(0,1-a*a),vz=Math.max(0,1-b*b);
    const dx=sign*puff*(-4*a/w)*vz,dz=sign*puff*(-4*b/d)*vx;
    p.setY(i,py+sign*puff*vx*vz);
    const normal=new THREE.Vector3(n.getX(i)-n.getY(i)*dx,n.getY(i),n.getZ(i)-n.getY(i)*dz).normalize();
    n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=objectMesh(parent,geometry,material,x,y,z,name);mesh.userData.soft=true;return mesh;
}
function curvedBack(parent,x,y,z,w,h,d,material,lean=.1) {
  const mesh=softBox(parent,x,y,z,w,h,d,material,.045,.006,"curved-chair-back");
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  for(let i=0;i<p.count;i++){
    const px=p.getX(i),slope=-.16*px/(w*w/4);
    p.setZ(i,p.getZ(i)-.08*Math.pow(px/(w/2),2));
    const normal=new THREE.Vector3(n.getX(i)-n.getZ(i)*slope,n.getY(i),n.getZ(i)).normalize();
    n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();mesh.rotation.x=lean;return mesh;
}
function outline(parent,points,material=materials.fabricDark) {
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
  const line=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:material.color,transparent:true,opacity:.35}));
  parent.add(line);return line;
}
function addSkirting() {
  const group=new THREE.Group();group.name="墙脚收口";wallsGroup.add(group);
  const seen=new Set();
  wallSegments.forEach(s=>{
    const key=[s.x1,s.z1,s.x2,s.z2].join(",");if(seen.has(key))return;seen.add(key);
    if(Math.abs(s.z1-9.2)<.001 && s.x1>=1.99 && s.x2<=5.71 && s.x2>s.x1) return;
    const horizontal=Math.abs(s.z1-s.z2)<1e-5, length=Math.hypot(s.x2-s.x1,s.z2-s.z1);
    if(length<.025)return;
    for(const side of [-1,1]){
      const x=(s.x1+s.x2)/2+(horizontal ? 0 : side*.07),z=(s.z1+s.z2)/2+(horizontal ? side*.07 : 0);
      if(!floorAreas.some(a=>x>a.x1 && x<a.x2 && z>a.z1 && z<a.z2))continue;
      box(group,x,.033,z,horizontal?length:.018,.066,horizontal?.018:length,materials.baseboard,{radius:0});
    }
  });
  unifyBoxSurfaces(group,[...group.children],materials.baseboard,"continuous-skirting");
}
function addSofa(parent) {
  const group=new THREE.Group();group.name="客厅软包沙发";parent.add(group);
  const locations=[[2.02,5.5],[2.43,5.5],[2.02,7.75],[2.43,7.75],[3.58,7.46],[3.58,7.84]];
  locations.forEach(([x,z])=>rod(group,[x,.015,z],[x,.155,z],.023,materials.walnut));
  softBox(group,2.24,.23,6.65,.92,.22,2.74,materials.fabric,.045,.002,"sofa-base");
  softBox(group,3.20,.23,7.64,1.03,.22,.80,materials.fabric,.045,.002,"sofa-return-base");
  [5.82,6.64,7.46].forEach(z=>softBox(group,2.35,.40,z,.68,.155,.78,materials.fabric,.065,.020,"sofa-seat"));
  softBox(group,3.20,.40,7.60,1.02,.155,.68,materials.fabric,.065,.020,"sofa-seat");
  softBox(group,1.88,.69,6.66,.17,.67,2.55,materials.fabric,.075,.016,"sofa-back");
  softBox(group,3.15,.69,7.98,1.32,.67,.17,materials.fabric,.07,.016,"sofa-back");
  softBox(group,2.27,.60,5.33,.78,.48,.18,materials.fabric,.075,.016,"sofa-arm");
  softBox(group,3.77,.59,7.64,.16,.46,.77,materials.fabric,.06,.014,"sofa-arm");
  [[2.04,.70,5.87,.38],[2.04,.70,7.23,-.25],[3.25,.70,7.81,.10]].forEach(([x,y,z,tilt])=>{
    const pillow=softBox(group,x,y,z,.14,.39,.42,materials.linen,.07,.025,"throw-pillow");
    pillow.rotation.z=tilt;pillow.rotation.x=-.10;
  });
  return group;
}
function addDesk(parent,x,z,width,depth=.6,rotation=0) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="细腿书桌";parent.add(group);
  box(group,0,.775,0,width,.05,depth,materials.oakLight,{radius:.012});
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*(width/2-.12),.015,b*(depth/2-.08)],[a*(width/2-.12),.75,b*(depth/2-.08)],.024,materials.black);
  return group;
}
function addOfficeChair(parent,x,z,rotation=0) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="办公椅";parent.add(group);
  softBox(group,0,.475,0,.49,.12,.48,materials.fabricDark,.06,.013);
  curvedBack(group,0,.85,.23,.47,.67,.10,materials.fabricDark,.10);
  rod(group,[0,.12,0],[0,.42,0],.042,materials.chrome);
  for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5,xp=Math.cos(angle)*.29,zp=Math.sin(angle)*.29;
    rod(group,[0,.15,0],[xp,.065,zp],.020,materials.black);
    const wheel=objectMesh(group,new THREE.CylinderGeometry(.044,.044,.04,20),materials.black,xp,.045,zp);
    wheel.rotation.x=Math.PI/2;
  }
  for(const side of [-1,1]){
    rod(group,[side*.22,.47,.09],[side*.28,.65,.06],.014,materials.black);
    softBox(group,side*.28,.668,.025,.075,.04,.25,materials.black,.018,.002);
  }
  return group;
}
function addDuvet(parent,width,depth) {
  const span=depth*.72,start=-depth*.20,end=depth/2+.08;
  const geometry=new THREE.PlaneGeometry(width+.18,end-start,26,26),p=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=start+(uv.getY(i))*(end-start);
    const drop=Math.max(Math.max(0,Math.abs(x)-(width/2-.02))/.11,Math.max(0,z-(depth/2-.025))/.105);
    const wave=.010*Math.sin(x*14+z*8)+.005*Math.sin(x*27-z*13);
    p.setXYZ(i,x,.575-Math.min(.18,drop*.18)+wave,z);
  }
  const indices=geometry.index;
  for(let i=0;i<indices.count;i+=3){const a=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,a);}
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=materials.duvet.clone();material.side=THREE.DoubleSide;
  objectMesh(parent,geometry,material,0,0,0,"folded-duvet");
  softBox(parent,0,.575,start+.055,width-.035,.06,.14,materials.linen,.025,.004,"duvet-fold");
}
function addBasin(parent,x,y,z,material=materials.porcelain,w=.64,d=.42) {
  const profile=[[0,-.115],[.08,-.115],[.21,-.075],[.262,.012],[.278,.019],[.286,.005],[.258,-.09],[.10,-.142],[0,-.142]].map(p=>new THREE.Vector2(...p));
  const basin=objectMesh(parent,new THREE.LatheGeometry([...profile].reverse(),40),material,x,y,z,"hollow-basin");
  basin.scale.set(w/.572,1,d/.572);
  const drain=cylinder(parent,x,y-.107,z,.025,.008,materials.chrome,24);
  return basin;
}
function addFaucet(parent,x,y,z) {
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y,z),new THREE.Vector3(x,y+.20,z),new THREE.Vector3(x,y+.24,z+.02),new THREE.Vector3(x,y+.23,z+.12),new THREE.Vector3(x,y+.18,z+.12)]);
  objectMesh(parent,new THREE.TubeGeometry(path,20,.009,10,false),materials.chrome,0,0,0,"tap");
  rod(parent,[x,y+.13,z],[x+.075,y+.14,z],.007,materials.chrome);
}
function addToilet(parent,x,z) {
  const group=new THREE.Group();group.position.set(x,0,z);group.name="坐便器";parent.add(group);
  const profile=[[.105,.01],[.13,.07],[.13,.20],[.205,.30],[.25,.38],[.247,.425],[.215,.425],[.18,.36],[.12,.25],[.105,.01]].map(p=>new THREE.Vector2(...p));
  const bowl=objectMesh(group,new THREE.LatheGeometry(profile,40),materials.porcelain,0,0,-.015,"toilet-bowl");
  bowl.scale.set(.9,1,1.23);
  ring(group,0,.44,-.025,.218,.024,materials.porcelain,.91,1.22);
  cylinder(group,0,.382,-.035,.135,.009,new THREE.MeshStandardMaterial({color:0xdbe3e1,roughness:.16}),32).scale.z=1.2;
  box(group,0,.66,.225,.37,.40,.17,materials.porcelain,{radius:.048,name:"toilet-tank"});
  cylinder(group,0,.867,.225,.027,.012,materials.chrome,24);
  const lid=softBox(group,0,.685,.134,.405,.47,.035,materials.porcelain,.017,.002,"toilet-lid");
  lid.rotation.x=.11;
  return group;
}
function addWasher(parent,x,z) {
  const group=new THREE.Group();group.position.set(x,0,z);group.name="滚筒洗衣机";parent.add(group);
  box(group,0,.445,0,.58,.85,.62,materials.porcelain,{radius:.028});
  box(group,0,.80,.316,.515,.095,.012,materials.offWhite,{radius:.004});
  const knob=objectMesh(group,new THREE.CylinderGeometry(.03,.03,.017,24),materials.chrome,-.16,.80,.331);knob.rotation.x=Math.PI/2;
  box(group,.105,.80,.333,.15,.046,.009,materials.black,{radius:.003});
  const lip=objectMesh(group,new THREE.TorusGeometry(.192,.025,12,48),materials.chrome,0,.45,.329);
  const gasket=objectMesh(group,new THREE.TorusGeometry(.164,.013,10,40),materials.black,0,.45,.339);
  const door=objectMesh(group,new THREE.SphereGeometry(1,24,16),new THREE.MeshPhysicalMaterial({color:0x34464b,roughness:.14,metalness:.15,clearcoat:1}),0,.45,.347);
  door.scale.set(.155,.155,.025);
  box(group,.185,.47,.361,.018,.115,.024,materials.offWhite,{radius:.008});
  return group;
}
function addNightstand(parent,x,z) {
  const group=new THREE.Group();group.position.set(x,0,z);group.name="床头柜";parent.add(group);
  box(group,0,.31,0,.46,.53,.48,materials.walnut,{radius:.018});
  for(const y of [.19,.44]) {
    box(group,0,y,.246,.433,.229,.019,materials.oakLight,{radius:.006});
    rod(group,[-.08,y+.04,.267],[.08,y+.04,.267],.005,materials.chrome);
  }
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*.16,.0,b*.17],[a*.16,.075,b*.17],.018,materials.walnut);
  return group;
}
function addPC(parent,x,z) {
  const group=new THREE.Group();group.position.set(x,0,z);group.name="电脑主机";parent.add(group);
  box(group,0,.275,0,.23,.49,.43,materials.black,{radius:.016});
  for(const y of [.17,.35]) {
    const fan=objectMesh(group,new THREE.TorusGeometry(.056,.004,6,24),materials.chrome,0,y,.221);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod(group,[0,y,.224],[Math.cos(a)*.043,y+Math.sin(a)*.043,.224],.003,materials.fabricDark);}
  }
  box(group,-.105,.50,.03,.004,.009,.16,materials.chrome,{radius:0});
  return group;
}
function addWindowShade(parent,x,z,width) {
  const group=new THREE.Group();group.position.set(x,0,z);group.name="布艺窗帘";parent.add(group);
  rod(group,[-width/2-.06,2.45,.12],[width/2+.06,2.45,.12],.008,materials.chrome);
  const material=materials.linen.clone();material.side=THREE.DoubleSide;
  for(const side of [-1,1]){
    const geometry=new THREE.PlaneGeometry(.24,2.22,14,18),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){const a=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin(a*95)*.023+(y+1.11)*.002);}
    geometry.computeVertexNormals();
    const curtain=objectMesh(group,geometry,material,side*(width/2-.06),1.30,.16,"pleated-curtain");
    curtain.castShadow=false;
  }
  return group;
}

addSkirting();

function addRug(parent,x,z,width,depth,color=0xb9a98f) {
  const material=materials.fabric.clone();material.color.set(color);
  return box(parent,x,.006,z,width,.009,depth,material,{radius:.004,castShadow:false,receiveShadow:true,name:"woven-rug"});
}

function addPlant(parent,x,z,scale=1) {
  const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(scale);group.name="叶片盆栽";parent.add(group);
  const profile=[[.105,0],[.135,.025],[.173,.31],[.175,.35],[.156,.35],[.153,.325],[.135,.05],[.105,0]].map(p=>new THREE.Vector2(...p));
  objectMesh(group,new THREE.LatheGeometry(profile,32),materials.terracotta,0,0,0,"ceramic-planter");
  cylinder(group,0,.324,0,.15,.024,materials.soil,24);
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(.30,.23,.27,.70,0,1);shape.bezierCurveTo(-.27,.70,-.30,.23,0,0);
  const leafGeometry=new THREE.ShapeGeometry(shape,10),p=leafGeometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getY(i)*Math.PI)*.11);
  leafGeometry.computeVertexNormals();
  const leaves=new THREE.InstancedMesh(leafGeometry,materials.leaf,30),dummy=new THREE.Object3D();
  for(let stem=0;stem<3;stem++){
    const angle=stem*2.4,top=.95+stem*.08,xp=Math.cos(angle)*.10,zp=Math.sin(angle)*.10;
    rod(group,[0,.32,0],[xp,top,zp],.0055,materials.walnut);
    for(let j=0;j<10;j++){
      const a=j*2.38+stem,y=.43+j*.05,spread=.075+j*.008;
      dummy.position.set(xp*.5+Math.cos(a)*spread,y,zp*.5+Math.sin(a)*spread);
      dummy.rotation.set(-.30-j*.025,a,.25*Math.sin(a));dummy.scale.set(.30,.31,.30);dummy.updateMatrix();leaves.setMatrixAt(stem*10+j,dummy.matrix);
    }
  }
  leaves.castShadow=true;leaves.receiveShadow=true;group.add(leaves);return group;
}

function addChair(parent,x,z,rotation=0,material=materials.fabricDark) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="曲面餐椅";parent.add(group);
  softBox(group,0,.452,0,.48,.105,.50,material,.048,.012);
  curvedBack(group,0,.795,.25,.48,.45,.07,material,.12);
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*.225,.012,b*.21],[a*.17,.43,b*.15],.020,materials.oak);
  return group;
}

function addBed(parent,x,z,width=1.8,depth=2,rotation=0) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="软床与床品";parent.add(group);
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*(width/2-.16),.0,b*(depth/2-.15)],[a*(width/2-.16),.13,b*(depth/2-.15)],.028,materials.walnut);
  box(group,0,.22,0,width+.055,.23,depth+.04,materials.oak,{radius:.025});
  softBox(group,0,.42,-.01,width-.055,.235,depth-.04,materials.linen,.095,.012,"mattress");
  softBox(group,0,.73,-depth/2+.01,width+.06,1.18,.16,materials.fabric,.075,.012,"upholstered-headboard");
  for(const side of [-1,1]){
    const pillow=softBox(group,side*width*.24,.61,-depth*.32,width*.41,.16,.49,materials.linen,.074,.035,"sleeping-pillow");
    pillow.rotation.y=side*.04;pillow.rotation.z=side*.025;
  }
  outline(group,[[-width/2+.055,.44,-depth/2+.04],[width/2-.055,.44,-depth/2+.04],[width/2-.055,.44,depth/2-.04],[-width/2+.055,.44,depth/2-.04]],materials.fabricDark);
  addDuvet(group,width,depth);return group;
}

let desktopTexture=null,keyboardTexture=null;
function addMonitor(parent,x,z,rotation=0,scale=1) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="电脑显示器";parent.add(group);
  if(!desktopTexture){
    const c=document.createElement("canvas");c.width=512;c.height=288;const ctx=c.getContext("2d");
    const gradient=ctx.createLinearGradient(0,0,512,288);gradient.addColorStop(0,"#315c69");gradient.addColorStop(1,"#b6c8b6");ctx.fillStyle=gradient;ctx.fillRect(0,0,512,288);
    ctx.fillStyle="rgba(250,251,247,.85)";ctx.fillRect(48,42,215,155);ctx.fillStyle="#93aaa4";for(let j=0;j<5;j++)ctx.fillRect(63,62+j*23,170-j*16,6);
    ctx.fillStyle="#eee9dd";ctx.fillRect(288,75,168,121);ctx.fillStyle="#657d77";ctx.fillRect(307,97,128,66);ctx.fillStyle="#c6d0c6";ctx.fillRect(0,267,512,21);
    desktopTexture=new THREE.CanvasTexture(c);desktopTexture.colorSpace=THREE.SRGBColorSpace;
  }
  box(group,0,1.075,0,.665*scale,.395*scale,.034,materials.black,{radius:.01,name:"monitor-body"});
  objectMesh(group,new THREE.PlaneGeometry(.633*scale,.356*scale),new THREE.MeshBasicMaterial({map:desktopTexture,toneMapped:false}),0,1.078,.019,"monitor-display");
  rod(group,[0,.809,-.025],[0,.97,-.025],.016,materials.chrome);
  box(group,0,.809,-.025,.25,.018,.14,materials.black,{radius:.006});
  if(!keyboardTexture){
    const c=document.createElement("canvas");c.width=512;c.height=180;const ctx=c.getContext("2d");ctx.fillStyle="#393b39";ctx.fillRect(0,0,512,180);
    ctx.fillStyle="#696c68";for(let row=0;row<4;row++)for(let col=0;col<13;col++)ctx.fillRect(9+col*38,8+row*32,31,25);ctx.fillRect(126,141,232,28);
    keyboardTexture=new THREE.CanvasTexture(c);keyboardTexture.colorSpace=THREE.SRGBColorSpace;
  }
  box(group,-.03,.814,.19,.35,.022,.125,materials.black,{radius:.008,name:"keyboard"});
  const keys=objectMesh(group,new THREE.PlaneGeometry(.332,.112),new THREE.MeshBasicMaterial({map:keyboardTexture,toneMapped:false}),-.03,.826,.19);keys.rotation.x=-Math.PI/2;
  const mouse=objectMesh(group,new THREE.SphereGeometry(1,16,10),materials.black,.22,.829,.185);mouse.scale.set(.032,.024,.055);
  return group;
}

function addCabinet(parent,x,z,width,depth,height,material=materials.oakLight,rotation=0,omitTop=false) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="木纹收纳柜";parent.add(group);
  for(const side of [-1,1])box(group,side*(width/2-.01),(height+.08)/2,0,.02,height-.08,depth,material,{radius:.005});
  box(group,0,.097,0,width-.04,.034,depth-.022,material,{radius:.004});
  box(group,0,(height+.08)/2,-depth/2+.01,width-.04,height-.08,.02,material,{radius:.003});
  if(!omitTop)box(group,0,height-.013,0,width,.026,depth,material,{radius:.006,name:"cabinet-top"});
  box(group,0,height*.48,0,width-.04,.022,depth-.04,material,{radius:.003});
  box(group,0,.045,-.022,width-.07,.09,depth-.08,materials.walnut,{radius:.003});
  const divisions=Math.max(1,Math.round(width/.62)),doorWidth=width/divisions;
  for(let i=0;i<divisions;i++){
    const px=-width/2+doorWidth*(i+.5);
    box(group,px,(height+.08)/2,depth/2+.009,doorWidth-.004,height-.095,.019,material,{radius:.004,name:"cabinet-door"});
    const hx=px+doorWidth/2-.05;
    rod(group,[hx,height*.49,depth/2+.034],[hx,height*.49+.14,depth/2+.034],.0045,materials.chrome);
  }
  return group;
}

function makeTVScreenTexture() {
  const c=document.createElement("canvas"); c.width=1024; c.height=576;
  const ctx=c.getContext("2d");
  const sky=ctx.createLinearGradient(0,0,0,576); sky.addColorStop(0,"#173449"); sky.addColorStop(0.6,"#bb8061"); sky.addColorStop(1,"#e1b67d");
  ctx.fillStyle=sky; ctx.fillRect(0,0,1024,576);
  ctx.fillStyle="#f8dca2"; ctx.beginPath(); ctx.arc(738,210,58,0,Math.PI*2); ctx.fill();
  [["#536875",330],["#354c58",420],["#173540",515]].forEach(([color,y],layer) => {
    ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(0,576); ctx.lineTo(0,y);
    for(let x=0;x<=1024;x+=128) ctx.lineTo(x,y-Math.sin(x*0.009+layer)*65-35);
    ctx.lineTo(1024,576); ctx.closePath(); ctx.fill();
  });
  ctx.fillStyle="rgba(250,248,240,.93)"; ctx.font="400 32px Microsoft YaHei, sans-serif"; ctx.fillText("吉吉的家",48,67);
  ctx.font="22px sans-serif"; ctx.fillText("19:30",900,66);
  const texture=new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=renderer.capabilities.getMaxAnisotropy(); return texture;
}

function addTVConsole(parent, x, z) {
  const group=new THREE.Group(); group.name="电视与收纳柜";
  group.position.set(x,0,z); group.rotation.y=-Math.PI/2; parent.add(group);
  // 柜体有完整内腔、底板、侧板和顶板，抽屉拉出后能看见收纳空间。
  box(group,0,0.16,0,2.2,0.055,0.43,materials.oak);
  box(group,0,0.69,0,2.22,0.055,0.45,materials.oakLight);
  box(group,0,0.42,-0.201,2.2,0.52,0.028,materials.oak);
  [-1.08,1.08].forEach(px => box(group,px,0.42,0,0.04,0.52,0.43,materials.oakLight));
  [-0.37,0.37].forEach(px => box(group,px,0.42,0,0.026,0.52,0.4,materials.oak));
  box(group,0,0.54,0,2.16,0.024,0.41,materials.oak);
  [-0.9,0.9].forEach(px => [-0.14,0.14].forEach(pz => box(group,px,0.075,pz,0.045,0.15,0.045,materials.black)));
  for(let i=0;i<3;i++) {
    const drawer=new THREE.Group(); drawer.position.set((i-1)*0.733,0,0); group.add(drawer);
    const id="tv-drawer-"+i;
    box(drawer,0,0.215,0,0.684,0.022,0.36,materials.oakLight);
    [-0.326,0.326].forEach(px => box(drawer,px,0.35,0,0.025,0.27,0.36,materials.oakLight));
    box(drawer,0,0.35,-0.17,0.684,0.27,0.022,materials.oakLight);
    box(drawer,0,0.365,0.222,0.719,0.327,0.032,materials.oakLight);
    box(drawer,0,0.46,0.247,0.24,0.018,0.021,materials.black);
    // 小物件体现可用的收纳深度，不封住柜体。
    if(i===0) {
      box(drawer,-0.12,0.25,0.015,0.18,0.047,0.23,materials.offWhite);
      box(drawer,0.14,0.245,0.01,0.055,0.035,0.15,materials.black);
    }
    drawer.traverse(object => { object.userData.drawerId=id; });
    drawers.push({id,label:["左侧收纳抽屉","中间收纳抽屉","右侧收纳抽屉"][i],group:drawer,open:false,progress:0});
  }
  box(group,-0.75,0.592,0.02,0.32,0.08,0.2,materials.offWhite);
  box(group,-0.75,0.635,0.02,0.32,0.018,0.2,materials.green);
  box(group,0.68,0.584,0.02,0.15,0.065,0.22,materials.black);
  // 75寸16:9屏幕朝向沙发，画面与黑色机身分开。
  box(group,0,1.46,-0.10,1.72,1.0,0.062,materials.black,{name:"tv-body",radius:0.009});
  const display=new THREE.Mesh(new THREE.PlaneGeometry(1.665,0.937),
    new THREE.MeshBasicMaterial({map:makeTVScreenTexture(),toneMapped:false}));
  display.position.set(0,1.465,-0.066); display.name="tv-display"; group.add(display);
  box(group,0,1.0,-0.065,0.055,0.007,0.006,new THREE.MeshBasicMaterial({color:0x91d7a0}),{radius:0,castShadow:false});
  box(group,0,1.38,-0.17,0.4,0.25,0.07,materials.black);
  return group;
}

function toggleDrawer(id,force) {
  const drawer=drawers.find(item => item.id===id); if(!drawer) return;
  drawer.open=typeof force==="boolean" ? force : !drawer.open;
  updateDrawerButtons();
  showToast(drawer.label+(drawer.open ? "已拉开" : "已收起"));
}
function updateDrawerButtons() {
  $$(".drawer-button").forEach(button => {
    const drawer=drawers.find(item => item.id===button.dataset.drawer);
    button.setAttribute("aria-pressed",String(drawer.open));
    button.querySelector("small").textContent=drawer.open ? "已拉开 · 点击收起" : "已收起 · 点击拉开";
  });
}
function updateDrawers(delta) {
  drawers.forEach(drawer => {
    const target=drawer.open ? 1 : 0;
    drawer.progress+=Math.sign(target-drawer.progress)*Math.min(Math.abs(target-drawer.progress),delta*2.7);
    drawer.group.position.z=drawer.progress*0.28;
  });
}
function bindDrawerButtons(scope) {
  $$(".drawer-button",scope).forEach(button => button.addEventListener("click",()=>toggleDrawer(button.dataset.drawer)));
}

// 家具位置与重建后的房间保持同一坐标，不占用过道及门扇回转区。
addRug(furnitureGroup, 3.65, 6.7, 2.65, 2.9, 0xb9aa93);
addSofa(furnitureGroup);

addTVConsole(furnitureGroup, 5.82, 7.32);
box(furnitureGroup, 3.45, 0.75, 2.9, 1.55, 0.09, 0.88, materials.oakLight);
[[-.58,-.29],[.58,-.29],[-.58,.29],[.58,.29]].forEach(([px,pz]) =>
  rod(furnitureGroup,[3.45+px,.055,2.9+pz],[3.45+px*.9,.705,2.9+pz*.9],.035,materials.oak));
[[2.9,2.26,Math.PI],[3.9,2.26,Math.PI],[2.9,3.54,0],[3.9,3.54,0]].forEach(([x,z,r])=>addChair(furnitureGroup,x,z,r,materials.fabric));
// 客厅与餐厅保留通畅活动空间，已移除盆栽和茶几。

// 厨房与阳台A。
addCabinet(furnitureGroup,.3,.8,1.34,.52,.9,materials.oakLight,Math.PI/2);
addCabinet(furnitureGroup,1.38,.27,1.65,.52,.9,materials.oakLight,0,true);
const upperKitchen = new THREE.Group(); upperKitchen.position.y=1.36; furnitureGroup.add(upperKitchen);
addCabinet(upperKitchen,.25,.8,1.25,.4,.62,materials.offWhite,Math.PI/2);

const kitchenCounter = [
  box(furnitureGroup,0.3,0.9225,0.8,0.58,0.035,1.4,materials.offWhite,{radius:0}),
  box(furnitureGroup,.8075,.9225,.27,.575,.035,.58,materials.offWhite,{radius:0}),
  box(furnitureGroup,1.9325,.9225,.27,.615,.035,.58,materials.offWhite,{radius:0}),
  box(furnitureGroup,1.36,.9225,.025,.53,.035,.09,materials.offWhite,{radius:0}),
  box(furnitureGroup,1.36,.9225,.525,.53,.035,.07,materials.offWhite,{radius:0}),
];
unifyBoxSurfaces(furnitureGroup,kitchenCounter,materials.offWhite,"continuous-kitchen-counter");
addBasin(furnitureGroup,1.36,.942,.28,materials.chrome,.57,.46);
addFaucet(furnitureGroup,1.36,.95,.067);
const hob=box(furnitureGroup,.3,.956,.85,.44,.027,.63,materials.black,{radius:.012,name:"kitchen-hob"});
[.68,1.02].forEach(pz=>{
  cylinder(furnitureGroup,.3,.977,pz,.096,.012,materials.chrome,32);
  ring(furnitureGroup,.3,.986,pz,.071,.010,materials.black);
  rod(furnitureGroup,[.21,.99,pz],[.39,.99,pz],.009,materials.black);
  rod(furnitureGroup,[.3,.99,pz-.09],[.3,.99,pz+.09],.009,materials.black);
});
[.16,.23].forEach(px=>cylinder(furnitureGroup,px,.98,1.10,.015,.013,materials.chrome,16));
box(furnitureGroup,.28,1.47,.84,.47,.10,.62,materials.chrome,{radius:.025,name:"range-hood"});
box(furnitureGroup,.15,1.83,.84,.21,.63,.32,materials.chrome);
const fridge=new THREE.Group(); fridge.name="双门冰箱"; fridge.position.set(2.43,0,.34); furnitureGroup.add(fridge);
box(fridge,0,.96,0,.44,1.92,.49,materials.offWhite,{radius:.025});
box(fridge,0,1.60,.258,.424,.60,.022,materials.porcelain,{radius:.018});
box(fridge,0,.657,.258,.424,1.25,.022,materials.porcelain,{radius:.018});
rod(fridge,[-.15,1.06,.295],[-.15,1.34,.295],.007,materials.chrome);
rod(fridge,[-.15,1.66,.295],[-.15,1.88,.295],.007,materials.chrome);
addWasher(furnitureGroup,3.1,.45);

addPlant(furnitureGroup, 4.55, 0.42, 0.75);

// 电竞房的南侧1m门区保持空旷。
addDesk(furnitureGroup,6.9,1.05,2.2,.66);
addMonitor(furnitureGroup, 6.32, 1.12, 0, 0.94); addMonitor(furnitureGroup, 7.48, 1.12, 0, 0.94);
addOfficeChair(furnitureGroup,6.32,1.92); addOfficeChair(furnitureGroup,7.48,1.92);
addPC(furnitureGroup,5.97,1.02); addPC(furnitureGroup,7.89,1.02);
addWindowShade(furnitureGroup,6.9,.6,1.6);
addWindowShade(furnitureGroup,9.85,.6,1.8);

// 客房床与柜避开左下角内开门。
addBed(furnitureGroup, 10.32, 2.3, 1.5, 2, 0);
addCabinet(furnitureGroup, 8.65, 1.32, 0.45, 0.65, 2.1);
addDesk(furnitureGroup,10.5,4.0,1.1,.48);
addChair(furnitureGroup,10.5,3.5,Math.PI,materials.fabric);

// 主卧床位在衣帽间南侧，不占主卧入口的纵向通道。
addBed(furnitureGroup,10.12,10.12,1.8,2.05,-Math.PI/2);
addNightstand(furnitureGroup,10.7,9.0);
addNightstand(furnitureGroup,10.7,11.2);
addCabinet(furnitureGroup,11.12,7.50,1.25,.42,2.2,materials.oakLight,-Math.PI/2);

function addBathroom(parent,x,z,width,depth) {
  const group=new THREE.Group(); group.name="卫浴细节"; group.position.set(x,0,z); parent.add(group);
  const sinkX=width<1.95?0:width/2-.38, sinkZ=-depth/2+.39;
  addCabinet(group,sinkX,sinkZ,.65,.48,.75,materials.oakLight,0,true);
  [-1,1].forEach(side=>{
    box(group,sinkX+side*.28375,.782,sinkZ,.1225,.045,.52,materials.offWhite,{radius:.006});
    box(group,sinkX,.782,sinkZ+side*.2075,.445,.045,.105,materials.offWhite,{radius:.006});
  });
  addBasin(group,sinkX,.87,sinkZ,materials.porcelain,.48,.34);
  addFaucet(group,sinkX,.81,sinkZ-.225);
  const mirrorCanvas=document.createElement("canvas");mirrorCanvas.width=128;mirrorCanvas.height=128;
  const ctx=mirrorCanvas.getContext("2d"),gradient=ctx.createLinearGradient(0,0,128,128);
  gradient.addColorStop(0,"#d7e3e5");gradient.addColorStop(.4,"#a4b6bb");gradient.addColorStop(.42,"#d2dcdb");gradient.addColorStop(1,"#8d9f9f");
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const mirrorMap=new THREE.CanvasTexture(mirrorCanvas);mirrorMap.colorSpace=THREE.SRGBColorSpace;
  box(group,sinkX,1.51,-depth/2+.085,.68,.76,.022,materials.chrome,{radius:.025});
  const mirror=objectMesh(group,new THREE.PlaneGeometry(.644,.721),new THREE.MeshStandardMaterial({map:mirrorMap,roughness:.14,metalness:.24}),sinkX,1.51,-depth/2+.098,"bathroom-mirror");
  addToilet(group,width<1.95?width/2-.39:-width/2+.43,depth/2-.55);
  cylinder(group,sinkX+.245,.83,sinkZ+.07,.024,.056,materials.offWhite,20);
  rod(group,[sinkX+.245,.866,sinkZ+.07],[sinkX+.275,.866,sinkZ+.07],.005,materials.chrome);
  rod(group,[-width/2+.09,1.21,-.15],[-width/2+.09,1.21,.35],.012,materials.chrome);
  box(group,-width/2+.13,.985,.13,.028,.40,.28,materials.linen,{radius:.016,name:"bath-towel"});
  if(depth>2.5) {
    const showerZ=depth/2-.52,showerX=width/2-.48;
    box(group,showerX,.047,showerZ,.83,.062,.87,materials.porcelain,{radius:.025,name:"shower-tray"});
    box(group,showerX,1.12,depth/2-.98,.80,2.1,.018,materials.glass,{radius:0});
    rod(group,[width/2-.095,.85,depth/2-.11],[width/2-.095,2.15,depth/2-.11],.012,materials.chrome);
    const head=cylinder(group,width/2-.095,2.18,depth/2-.20,.09,.025,materials.chrome,32);
    head.rotation.x=.25;
    rod(group,[width/2-.095,2.12,depth/2-.11],[width/2-.095,2.18,depth/2-.20],.012,materials.chrome);
    ring(group,showerX,.081,showerZ,.027,.004,materials.chrome);
  }
}

addBathroom(furnitureGroup, 7.1, 7.6, 2, 3.2);
addBathroom(furnitureGroup, 10.45, 5.6, 1.9, 2.2);


// 两套阳台家具均远离2.4m推拉门入口。
const balconyBench=new THREE.Group();balconyBench.position.set(8.8,0,13.17);mergedFurniture.add(balconyBench);
softBox(balconyBench,0,.405,0,1.05,.14,.62,materials.fabric,.055,.024,"balcony-bench-seat");
curvedBack(balconyBench,0,.71,.255,1.05,.46,.12,materials.fabricDark,.015);
[-.42,.42].forEach(px=>[-.22,.22].forEach(pz=>rod(balconyBench,[px,.06,pz],[px,.335,pz],.023,materials.oak)));
addCabinet(mergedFurniture,12.3,13.25,1.45,.48,.72);
addPlant(mergedFurniture, 13.2, 12.6, 0.9);
// 独立多功能房使用普通墙体和玻璃推拉门，门框上方补足过梁。
box(glassStructure, 9.75, (CEILING_HEIGHT + DOOR_FRAME_TOP) / 2, 11.9, 2.4 + DOOR_FRAME_WIDTH * 2, CEILING_HEIGHT - DOOR_FRAME_TOP, WALL_THICKNESS, materials.wall);
addDesk(glassFurniture,8.95,13.25,1.45,.52);
addMonitor(glassFurniture,8.95,13.05,0,.78); addOfficeChair(glassFurniture,8.95,12.6,Math.PI);
cylinder(glassFurniture, 12.55, 0.64, 12.9, 0.47, 0.08, materials.oakLight, 40);
cylinder(glassFurniture, 12.55, 0.31, 12.9, 0.07, 0.62, materials.black, 18);
addChair(glassFurniture, 11.9, 12.9, Math.PI / 2); addPlant(glassFurniture, 13.25, 12.25, 0.7);

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

addLabel('living', '客餐厅', '33.8㎡ · 开放连通过道', 3.5, 5.9);
addLabel('kitchen', '厨房', '4.7㎡', 1.35, 0.8);
addLabel('balcony-a', '阳台A', '3.8㎡', 3.85, 0.7);
addLabel('gaming', '电竞房', '卧室A · 9.6㎡', 6.9, 2.8);
addLabel('guest', '客房', '卧室B · 11.8㎡', 10, 2.8);
addLabel('hall', '过道', '客厅直接进入', 7.55, 5.25);
addLabel('bath-a', '卫生间A', '6.5㎡', 7.1, 7.6);
addLabel('bath-b', '卫生间B', '4.2㎡', 10.45, 5.6);
addLabel('closet', '衣帽间', '3.1㎡ · 开放入口', 10.45, 7.5);
addLabel('master', '主卧', '卧室C · 14.9㎡', 9.5, 10.2);
addLabel('balcony-b', '阳台B', '10.3㎡ · 双方案', 11, 12.8);

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
  all: { label: '全屋鸟瞰', target: [6.5, 0.4, 6.7], offset: [12, 16, 17], walk: [4.65, 1.62, 5.2], yaw: -Math.PI / 2 },
  living: { label: '客餐厅', target: [3.7, 0.65, 5.9], offset: [6.6, 7.4, 7.3], walk: [4.65, 1.62, 5.2], yaw: -Math.PI / 2 },
  tv: { label: '电视与收纳柜', target: [5.75, 1.25, 7.32], offset: [-2.8, 1.1, 1.0], walk: [4.5, 1.62, 7.32], yaw: -Math.PI / 2 },
  hall: { label: '过道', target: [7.5, 0.4, 5.25], offset: [4.8, 6.5, 6.1], walk: [6.9, 1.62, 5.25], yaw: -Math.PI / 2 },
  gaming: { label: '双人电竞房', target: [6.9, 0.7, 2.6], offset: [4.7, 6, 5.5], walk: [7.25, 1.62, 3.6], yaw: 0 },
  guest: { label: '客房 / 未来儿童房', target: [9.9, 0.7, 2.6], offset: [4.8, 6.1, 5.8], walk: [9.15, 1.62, 3.8], yaw: 0 },
  master: { label: '主卧与阳台B', target: [10.2, 0.7, 10.6], offset: [6, 7.4, 7], walk: [8.8, 1.62, 9.2], yaw: -Math.PI / 2 },
  kitchen: { label: '厨房与阳台A', target: [2.2, 0.7, 0.8], offset: [4.9, 5.9, 5.6], walk: [1.7, 1.62, 1.05], yaw: Math.PI / 2 },
  'balcony-a': { label: '阳台A', target: [3.85, 0.6, 0.8], offset: [4.8, 5.9, 5.6], walk: [4.0, 1.62, 1], yaw: 0 },
  'bath-a': { label: '卫生间A', target: [7.1, 0.6, 7.6], offset: [4.6, 5.9, 5.5], walk: [7.1, 1.62, 7], yaw: Math.PI },
  'bath-b': { label: '卫生间B', target: [10.45, 0.6, 5.6], offset: [4.6, 5.9, 5.5], walk: [10.15, 1.62, 6.1], yaw: 0 },
  closet: { label: '衣帽间', target: [10.45, 0.6, 7.5], offset: [4.5, 5.7, 5.3], walk: [10.1, 1.62, 7.8], yaw: -Math.PI / 2 },
  'balcony-b': { label: '阳台B', target: [10.95, 0.6, 12.8], offset: [5.8, 7, 6.5], walk: [10.7, 1.62, 12.55], yaw: -Math.PI / 2 },
};

function worldPoint(planX, y, planZ) {
  return new THREE.Vector3(planX - PLAN_CENTER.x, y, planZ - PLAN_CENTER.z);
}

function tweenToView(roomKey, immediate = false) {
  const view = roomViews[roomKey] || roomViews.all;
  const target = worldPoint(view.target[0], view.target[1], view.target[2]);
  const distanceFactor = window.innerWidth < 760 ? (roomKey === "all" ? 1.85 : 1.36) : 1;
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
  stage.classList.remove("is-plan");
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
  state.cameraTween = null;
  controls.minPolarAngle = 0.05;
  pressed.clear();
  state.mode = mode;
  stage.classList.remove("is-plan");
  stage.classList.toggle("is-walk", mode === "walk");
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
  const balconyDoor = doors.find(door => door.id === "balcony-b");
  balconyDoor.group.visible = scheme === "glass";
  balconyDoor.frame.visible = scheme === "glass";
  updateDoorButtons();
  showToast(scheme === "merged" ? "已切换：阳台并入主卧" : "已切换：独立多功能房");
}

function updateDisplayOptions() {
  wallsGroup.visible = state.wallsVisible;
  doorsGroup.visible = state.wallsVisible;
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

function interactionFromHits(hits) {
  for (const hit of hits) {
    let object = hit.object;
    let visible = true;
    while (object) { if (!object.visible) visible = false; object = object.parent; }
    if (!visible) continue;
    // 只操作视线中第一个物体，不透过墙壁点击房间另一面的门。
    return { doorId: hit.object.userData.doorId, drawerId: hit.object.userData.drawerId };
  }
  return null;
}

canvas.addEventListener('pointerup', (event) => {
  if (state.mode === 'walk') {
    state.walkLookActive = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  }
  if (state.moved) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([doorsGroup, wallsGroup, furnitureGroup, floorsGroup], true);
  const interaction = interactionFromHits(hits);
  if (interaction?.doorId) { toggleDoor(interaction.doorId); return; }
  if (interaction?.drawerId) { toggleDrawer(interaction.drawerId); return; }
  if (state.mode !== 'orbit') return;
  const floorHit = hits.find(hit => hit.object.userData.isFloor);
  const localPoint = floorHit ? home.worldToLocal(floorHit.point.clone()) : null;
  const room = localPoint ? floorAreas.find(area => localPoint.x >= area.x1 && localPoint.x <= area.x2 && localPoint.z >= area.z1 && localPoint.z <= area.z2)?.room : null;
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
  if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
  const move = keyToMove[event.code];
  if (event.code === "KeyE" && state.mode === "walk") {
    const door = nearestDoor();
    if (door) toggleDoor(door.id);
  }
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
    button.setPointerCapture?.(event.pointerId);
    pressed.add(move);
    button.classList.add("is-pressed");
    event.preventDefault();
  };
  const end = (event) => {
    pressed.delete(move);
    button.classList.remove("is-pressed");
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("click", (event) => { if (event.detail === 0) { pressed.add(move); updateWalk(0.08); pressed.delete(move); } });
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("lostpointercapture", end);
});


const WALK_SPEED_MIN = 0.25;
const WALK_SPEED_MAX = 2.0;
function readWalkSpeed() {
  try {
    const saved=localStorage.getItem("jiji-walk-speed");
    const value=saved===null ? 0.65 : Number(saved);
    return Number.isFinite(value) ? Math.max(0.25,Math.min(2.0,value)) : 0.65;
  } catch (_) { return 0.65; }
}
function setWalkSpeed(value) {
  if(!Number.isFinite(Number(value))) return;
  state.walkSpeed=Math.max(WALK_SPEED_MIN,Math.min(WALK_SPEED_MAX,Number(value)));
  $("#walkSpeed").value=String(state.walkSpeed);
  $("#walkSpeedValue").textContent=state.walkSpeed.toFixed(2)+" 米/秒";
  try { localStorage.setItem("jiji-walk-speed",String(state.walkSpeed)); } catch (_) { /* 私密模式仍能在当前页调整 */ }
}
window.addEventListener("blur",()=>pressed.clear());
document.addEventListener("visibilitychange",()=>{ if(document.hidden) pressed.clear(); });

const WALK_RADIUS = 0.16;

function segmentDistance(x, z, segment) {
  const dx = segment.x2 - segment.x1;
  const dz = segment.z2 - segment.z1;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - segment.x1) * dx + (z - segment.z1) * dz) / lengthSq)) : 0;
  return Math.hypot(x - segment.x1 - t * dx, z - segment.z1 - t * dz);
}

function localSegment(door, x1, z1, x2, z2) {
  const c = Math.cos(door.rotation), s = Math.sin(door.rotation);
  return { x1: door.x + x1 * c + z1 * s, z1: door.z - x1 * s + z1 * c,
    x2: door.x + x2 * c + z2 * s, z2: door.z - x2 * s + z2 * c };
}

function doorSegments(door) {
  if (door.scheme && door.scheme !== state.scheme) return [];
  if (door.type === 'sliding') {
    const slide = door.progress * door.width / 2;
    return [localSegment(door, -door.width / 2 + slide, 0, slide, 0), localSegment(door, 0, -0.045, door.width / 2, -0.045)];
  }
  const hinge = -door.direction * (door.width / 2 - DOOR_CLEARANCE);
  const angle = door.progress * door.swing * Math.PI / 2;
  return [localSegment(door, hinge, 0, hinge + door.direction * door.leafWidth * Math.cos(angle), -door.direction * door.leafWidth * Math.sin(angle))];
}

function canStand(x, z) {
  if (!floorAreas.some(area => x >= area.x1 - 1e-6 && x <= area.x2 + 1e-6 && z >= area.z1 - 1e-6 && z <= area.z2 + 1e-6)) return false;
  if (wallSegments.some(segment => segmentDistance(x, z, segment) < WALK_RADIUS + WALL_THICKNESS / 2)) return false;
  return !doors.some(door => doorSegments(door).some(segment => segmentDistance(x, z, segment) < WALK_RADIUS + 0.025));
}

function nearestDoor() {
  const x = camera.position.x + PLAN_CENTER.x;
  const z = camera.position.z + PLAN_CENTER.z;
  return doors.filter(door => door.group.visible && (!door.scheme || door.scheme === state.scheme))
    .map(door => ({ door, distance: Math.hypot(x - door.x, z - door.z) }))
    .filter(item => item.distance < 1.65).sort((a, b) => a.distance - b.distance)[0]?.door;
}

function updateDoorAction() {
  const button = $('#interactDoor');
  const door = state.mode === 'walk' ? nearestDoor() : null;
  button.hidden = !door;
  if (door) button.textContent = (door.open ? '关门 · ' : '开门 · ') + door.label;
}

function updateWalk(delta) {
  if (state.mode !== 'walk' || pressed.size === 0) return;
  let forwardAmount = Number(pressed.has('forward')) - Number(pressed.has('backward'));
  let rightAmount = Number(pressed.has('right')) - Number(pressed.has('left'));
  const length = Math.hypot(forwardAmount, rightAmount) || 1;
  const speed = state.walkSpeed * delta / length;
  const dx = (-Math.sin(state.walkYaw) * forwardAmount + Math.cos(state.walkYaw) * rightAmount) * speed;
  const dz = (-Math.cos(state.walkYaw) * forwardAmount - Math.sin(state.walkYaw) * rightAmount) * speed;
  let x = camera.position.x + PLAN_CENTER.x;
  let z = camera.position.z + PLAN_CENTER.z;
  // 分轴滑动避免在门框处卡住；最快每帧步长0.1m，不穿墙。
  if (canStand(x + dx, z)) x += dx;
  if (canStand(x, z + dz)) z += dz;
  camera.position.set(x - PLAN_CENTER.x, 1.62, z - PLAN_CENTER.z);
}

function showPlan() {
  setMode('orbit');
  state.cameraTween = null;
  stage.classList.add('is-plan');
  const planDistance = Math.max(16.2, 15.5 / camera.aspect) / (2 * Math.tan(camera.fov * Math.PI / 360));
  camera.position.copy(worldPoint(6.9, planDistance, 6.85));
  controls.target.copy(worldPoint(6.9, 0, 6.85));
  controls.minPolarAngle = 0;
  controls.update();
  viewStatus.textContent = '平面核对 · 点击门可开关';
}

function populateDoors() {
  $('#doorList').innerHTML = doors.map(door => '<button class="door-button" type="button" data-door="' + door.id + '"><span>' + door.label + '</span><small></small></button>').join('');
  bindDoorButtons($('#doorList'));
  updateDoorButtons();
}

function bindDoorButtons(scope) {
  $$('.door-button', scope).forEach(button => button.addEventListener('click', () => toggleDoor(button.dataset.door)));
}

function bindUI() {
  populateDoors();
  $("#drawerList").innerHTML=drawers.map(drawer => '<button class="drawer-button" type="button" data-drawer="'+drawer.id+'"><span>'+drawer.label+'</span><small></small></button>').join("");
  bindDrawerButtons($("#drawerList"));
  updateDrawerButtons();
  setWalkSpeed(state.walkSpeed);
  $("#walkSpeed").addEventListener("input",event=>setWalkSpeed(event.target.value));
  $("#planView").addEventListener("click", showPlan);
  $("#interactDoor").addEventListener("click", () => { const door = nearestDoor(); if (door) toggleDoor(door.id); });
  $("#openAllDoors").addEventListener("click", () => { doors.forEach(door => { door.open = true; }); updateDoorButtons(); showToast("所有门已打开"); });
  $("#closeAllDoors").addEventListener("click", () => { doors.forEach(door => { door.open = false; }); updateDoorButtons(); showToast("所有门已关闭"); });
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
  if (action === "doors") openMobileSheet("doors");
  if (action === "scheme") openMobileSheet("scheme");
}

function openMobileSheet(type) {
  const sheet = $("#mobileSheet");
  const content = $("#sheetContent");
  if (type === "rooms") {
    $("#sheetTitle").textContent = "快速看房";
    $("#sheetSubtitle").textContent = "选择要查看的空间";
    content.innerHTML = '<button id="sheetPlan" class="primary-button" type="button">平面核对 · 查看完整通道</button>' + $("#roomList").outerHTML;
    $("#sheetPlan").addEventListener("click", () => { showPlan(); closeMobileSheet(); });
    $$(".room-button", content).forEach((button) => {
      button.addEventListener("click", () => {
        selectRoom(button.dataset.room);
        closeMobileSheet();
      });
    });
  } else if (type === 'doors') {
    $('#sheetTitle').textContent = '门的开关';
    $('#sheetSubtitle').textContent = '也可直接点击3D门扇；漫游靠近门后可开关';
    content.innerHTML = '<div class="door-list">' + $('#doorList').innerHTML + '</div><h3 class="drawer-heading">电视柜抽屉</h3><div class="drawer-list">'+$('#drawerList').innerHTML+'</div>'; 
    bindDrawerButtons(content);
    updateDrawerButtons();
    bindDoorButtons(content);
    updateDoorButtons();
  } else {
    $("#sheetTitle").textContent = "主卧阳台方案";
    $("#sheetSubtitle").textContent = "直接比较两种空间利用方式";
    content.innerHTML = `
      <div class="segmented-control" role="group" aria-label="切换主卧阳台方案">
        <button class="scheme-button ${state.scheme === "merged" ? "is-active" : ""}" type="button" data-scheme="merged">A · 并入主卧</button>
        <button class="scheme-button ${state.scheme === "glass" ? "is-active" : ""}" type="button" data-scheme="glass">B · 独立多功能房</button>
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
  updateDoors(delta);
  updateDrawers(delta);
  updateDoorAction();
  canvas.dataset.cameraX = (camera.position.x + PLAN_CENTER.x).toFixed(3);
  canvas.dataset.cameraZ = (camera.position.z + PLAN_CENTER.z).toFixed(3);
  canvas.dataset.mode = state.mode;
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
  toggleDoor,
  toggleDrawer,
  setWalkSpeed,
  showPlan,
};
