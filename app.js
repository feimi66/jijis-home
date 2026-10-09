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

const PLAN_CENTER = new THREE.Vector3(6.4, 0, 7.05);
const CEILING_HEIGHT = 2.7;
const CONTEXT_WALL_HEIGHT = .72 * 1.5;
const WALL_THICKNESS = 0.12;
const DOOR_HEIGHT = 2.12;
const DOOR_FRAME_WIDTH = 0.05;
const DOOR_FRAME_TOP = DOOR_HEIGHT + 0.06;
const DOOR_CLEARANCE = 0.003;

const state = {
  mode: "orbit",
  room: "all",
  scheme: "merged",
  contextVisible: true,
  labelsVisible: true,
  wallsVisible: true,
  furnitureVisible: true,
  cameraTween: null,
  walkYaw: Math.PI,
  walkPitch: 0,
  walkLookActive: false,
  walkSpeed: readWalkSpeed(),
  viewSpeed: readViewSpeed(),
  panSpeed: readPanSpeed(),
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
controls.rotateSpeed = state.viewSpeed;
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
sunlight.shadow.camera.left = -22;
sunlight.shadow.camera.right = 22;
sunlight.shadow.camera.top = 14;
sunlight.shadow.camera.bottom = -14;
sunlight.shadow.camera.near=.5;
sunlight.shadow.camera.far=45;
sunlight.shadow.camera.updateProjectionMatrix();
sunlight.shadow.bias=-.0001;
sunlight.shadow.normalBias=.006;
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


materials.warmLED=new THREE.MeshStandardMaterial({color:0xffe2b0,emissive:0xffcf8b,emissiveIntensity:.65,roughness:.6});
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
const wallRuns=[];
const wallCornerCaps=[];
const structuralWallBounds=[];
const doorJambBounds=[];
const skirtingVariants=[];
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
  wallRuns.push({axis:"h",x1,x2,z,y1:y-height/2,y2:y+height/2,material});
  if (y - height / 2 < 0.25) wallSegments.push({ x1, z1: z, x2, z2: z });
  return box(wallsGroup, (x1 + x2) / 2, y, z, x2 - x1, height, WALL_THICKNESS, material);
}

function wallV(x, z1, z2, height = CEILING_HEIGHT, material = materials.wall, y = height / 2) {
  wallRuns.push({axis:"v",x,z1,z2,y1:y-height/2,y2:y+height/2,material});
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
  unifyBoxSurfaces(group,group.children.filter(m=>m.material===materials.black),materials.black,"continuous-window-frame",1);
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
// 新原图右侧 C1。尺寸链按轴线重建；门区、窗宽及南阳台进深为照片估读。
const HOME_OUTLINE=[[0,0],[6.2,0],[6.2,1.8],[12.8,1.8],[12.8,14.1],[8.9,14.1],[8.9,10.3],[2.6,10.3],[2.6,3.5],[1.3,3.5],[1.3,1.8],[0,1.8]];
const PLAN = {
  kitchen: {x:0,z:0,w:3.5,d:1.8},
  balconyA: {x:3.5,z:0,w:2.7,d:1.8},
  dining: {x:1.3,z:1.8,w:4.9,d:1.7},
  diningSouth: {x:2.6,z:3.5,w:3.6,d:1.6},
  bedroomA: {x:6.2,z:1.8,w:3,d:3.3},
  bedroomB: {x:9.2,z:1.8,w:3.6,d:3.3},
  hall: {x:2.6,z:5.1,w:7.6,d:1.2},
  living: {x:2.6,z:6.3,w:4.5,d:4.0},
  suiteEntry: {x:7.1,z:6.3,w:3.1,d:.8},
  suiteTurn: {x:7.1,z:7.1,w:1.8,d:.9},
  bathA: {x:7.1,z:8.0,w:1.8,d:2.3},
  bathB: {x:10.2,z:5.1,w:2.6,d:2.0},
  master: {x:8.9,z:7.1,w:3.9,d:5.2},
  balconyB: {x:8.9,z:12.3,w:3.9,d:1.8},
};

function addDoorFrame(x,z,rotation,width,material=materials.oak,scheme=null) {
  const group = new THREE.Group();
  [-1, 1].forEach(side => box(group, side * (width / 2 + DOOR_FRAME_WIDTH / 2), DOOR_FRAME_TOP / 2, 0,
    DOOR_FRAME_WIDTH, DOOR_FRAME_TOP, 0.16, material));
  box(group, 0, (DOOR_HEIGHT + DOOR_FRAME_TOP) / 2, 0, width + DOOR_FRAME_WIDTH * 2,
    DOOR_FRAME_TOP - DOOR_HEIGHT, 0.16, material);
  // 门槛与两侧地面齐平，覆盖接缝而不抬高地坪。
  // 地面已连续并集，不叠加与地坪共面的门槛，避免闪烁。
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  recordDoorJambs(x,z,rotation,width,scheme);
  unifyBoxSurfaces(group,group.children.filter(m=>m.material===material),material,"continuous-door-frame",1);
  wallsGroup.add(group);
  return group;
}

function addDoor({ id, label, x, z, width = 0.86, rotation = 0, hinge = 'left', swing = 1, type = 'swing', open = true, scheme = null }) {
  const frame = addDoorFrame(x, z, rotation, width,type==="sliding"?materials.black:materials.oak,scheme);
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
  if(door.x-door.width/2-DOOR_FRAME_WIDTH>x1+1e-6)wallH(x1, door.x - door.width / 2 - DOOR_FRAME_WIDTH, z);
  if(x2>door.x+door.width/2+DOOR_FRAME_WIDTH+1e-6)wallH(door.x + door.width / 2 + DOOR_FRAME_WIDTH, x2, z);
  wallH(door.x - door.width / 2 - DOOR_FRAME_WIDTH, door.x + door.width / 2 + DOOR_FRAME_WIDTH, z, CEILING_HEIGHT - DOOR_FRAME_TOP, materials.wall, (CEILING_HEIGHT + DOOR_FRAME_TOP) / 2);
  addDoor({ ...door, z });
}

function wallWithDoorV(x, z1, z2, door) {
  if(door.z-door.width/2-DOOR_FRAME_WIDTH>z1+1e-6)wallV(x, z1, door.z - door.width / 2 - DOOR_FRAME_WIDTH);
  if(z2>door.z+door.width/2+DOOR_FRAME_WIDTH+1e-6)wallV(x, door.z + door.width / 2 + DOOR_FRAME_WIDTH, z2);
  wallV(x, door.z - door.width / 2 - DOOR_FRAME_WIDTH, door.z + door.width / 2 + DOOR_FRAME_WIDTH, CEILING_HEIGHT - DOOR_FRAME_TOP, materials.wall, (CEILING_HEIGHT + DOOR_FRAME_TOP) / 2);
  addDoor({ ...door, x, rotation: Math.PI / 2 });
}

// C1 所有地面彼此连通；公区楼梯、电梯和屋面不登记为可漫游地面。
Object.entries(PLAN).forEach(([name,p])=>{
  const room={balconyA:"balcony-a",balconyB:"balcony-b",bedroomA:"gaming",bedroomB:"guest",bathA:"bath-a",bathB:"bath-b",diningSouth:"dining",suiteEntry:"suite",suiteTurn:"suite"}[name]||name;
  const tile=name.startsWith("bath");
  const wood=name.startsWith("bedroom")||name==="master"||name==="balconyB";
  floor(room,p.x,p.z,p.w,p.d,tile?materials.floorBath:wood?materials.floorWood:materials.floorStone);
});
// 厨房北凸、生活阳台经厨房侧门相连。
wallH(0,.40,0);wallH(2.15,3.5,0);addWindowHorizontal(1.275,0,1.75,1.2,1.02);
wallV(0,0,1.8);
wallWithDoorV(3.5,0,1.8,{id:"balcony-a",label:"生活阳台门",z:1.2,width:.82,hinge:"right",swing:-1});
// 厨房与餐厅完全开放；西端保留厨房与室外入口之间的真实边界。
wallH(0,1.3,1.8);
wallH(3.5,4.20,0);wallH(5.5,6.2,0);addWindowHorizontal(4.85,0,1.30,1.4,.9);
wallV(6.2,0,1.8);wallH(3.5,6.2,1.8);
// 入口属楼梯公区，不登记在自家；仅保留通往餐厅的入户门。
wallWithDoorV(1.3,1.8,3.5,{id:"entry-dining",label:"入户门",z:2.85,width:.80,hinge:"left",swing:-1});
// 北侧两卧室：3.0m 与 3.6m 开间，3.3m 进深。
wallH(6.2,6.7,1.8);wallH(8.7,9.2,1.8);addWindowHorizontal(7.7,1.8,2.0,1.4,.95);
wallH(9.2,9.8,1.8);wallH(12.2,12.8,1.8);addWindowHorizontal(11,1.8,2.4,1.4,.95);
wallV(6.2,1.8,5.1);wallV(9.2,1.8,5.1);
wallWithDoorH(6.2,9.2,5.1,{id:"gaming",label:"电竞房门",x:8.6,width:.9,hinge:"right",swing:-1});
// 客房保留过道入口，原客卫北侧门封墙。
wallWithDoorH(9.2,12.8,5.1,{id:"guest",label:"客房门",x:9.7,width:.8,hinge:"left",swing:1});
wallV(12.8,1.8,5.7);wallV(12.8,6.55,14.1);
addWindowVertical(12.8,6.125,.85,.85,1.25,{frosted:true});
// 主卧上方原窗封成连续墙体。
// 楼梯东侧为真实住宅边界；南侧屋面绝不并入客厅。
wallV(2.6,3.5,10.3);
wallH(2.6,2.9,10.3);wallH(6.75,8.9,10.3);
addWindowHorizontal(4.825,10.3,3.85,2.64,.02,{panoramic:true});
// 客卫为一整间，取消内部隔墙；入口改为主卧北侧原衣柜位置。
wallV(10.2,5.1,7.1);
wallWithDoorH(10.2,12.8,7.1,{id:"bath-b",label:"主卧通往客卫",x:11.55,width:.86,hinge:"left",swing:-1});
// 图二连接区完全开放，取消围墙和套间/主卧入口门；仅保留主卫实体围墙。
wallV(7.1,8.0,10.3);
wallV(8.9,8.0,14.1);
wallWithDoorH(7.1,8.9,8.0,{id:"bath-a",label:"主卫门",x:8.35,width:.8,hinge:"right",swing:1});
// 主卧与南侧阳台合为连续空间，取消全部中间墙、门框及推拉门。
wallH(8.9,9.15,14.1);wallH(12.55,12.8,14.1);
addWindowHorizontal(10.85,14.1,3.4,1.5,.88);

// 合并同种材料的轴向方块，只保留整体外表面，消除重叠面和墙角拼块接缝。
// 坐标压缩保留所有窗洞与门洞；每个平面再合并成连续矩形。
function canonicalBounds(bounds){
  return bounds.map(b=>b.map(p=>p.map(v=>Number(v.toFixed(6))))).filter(([lo,hi])=>hi.every((v,a)=>v>lo[a]));
}
function meshBoxBounds(mesh){
  const {width,height,depth}=mesh.geometry.parameters;
  return [[mesh.position.x-width/2,mesh.position.y-height/2,mesh.position.z-depth/2],
    [mesh.position.x+width/2,mesh.position.y+height/2,mesh.position.z+depth/2]];
}
function recordDoorJambs(x,z,rotation,width,scheme=null){
  const cos=Math.cos(rotation),sin=Math.sin(rotation);
  const hx=Math.abs(cos)*DOOR_FRAME_WIDTH/2+Math.abs(sin)*.08;
  const hz=Math.abs(sin)*DOOR_FRAME_WIDTH/2+Math.abs(cos)*.08;
  for(const side of [-1,1]){
    const px=side*(width/2+DOOR_FRAME_WIDTH/2),cx=x+px*cos,cz=z-px*sin;
    const bounds=[[cx-hx,0,cz-hz],[cx+hx,DOOR_FRAME_TOP,cz+hz]];
    bounds.scheme=scheme;doorJambBounds.push(bounds);
  }
}
function unifyBoxSurfaces(parent,meshes,material,name,uvScale=8,{subtractBounds=[],clipBounds=[]}={}){
  if(!meshes.length)return null;
  const bounds=canonicalBounds(meshes.map(meshBoxBounds));
  const negatives=canonicalBounds(subtractBounds),clips=canonicalBounds(clipBounds);
  if(!bounds.length)return null;
  const allBounds=[...bounds,...negatives,...clips];
  const axes=[0,1,2].map(axis=>[...new Set(allBounds.flatMap(b=>[b[0][axis],b[1][axis]]))].sort((a,b)=>a-b));
  const count=axes.map(a=>a.length-1),maps=axes.map(a=>new Map(a.map((n,i)=>[n,i])));
  const cells=new Uint8Array(count[0]*count[1]*count[2]);
  const index=(x,y,z)=>(x*count[1]+y)*count[2]+z;
  function paint(list,bit){
    list.forEach(b=>{
      const lo=b[0].map((n,a)=>maps[a].get(n)),hi=b[1].map((n,a)=>maps[a].get(n));
      for(let x=lo[0];x<hi[0];x++)for(let y=lo[1];y<hi[1];y++)for(let z=lo[2];z<hi[2];z++)cells[index(x,y,z)]|=bit;
    });
  }
  paint(bounds,1);paint(negatives,2);paint(clips,4);
  const occupied=p=>{
    if(!p.every((n,a)=>n>=0&&n<count[a]))return false;
    const bits=cells[index(...p)];
    return Boolean(bits&1)&&!(bits&2)&&(!clips.length||Boolean(bits&4));
  };
  const positions=[],normals=[],uvs=[];
  function vertex(p,axis,sign){
    const normal=[0,0,0];normal[axis]=sign;
    positions.push(...p);normals.push(...normal);
    uvs.push(p[axis===0?2:0]/uvScale,p[axis===1?2:1]/uvScale);
  }
  for(let axis=0;axis<3;axis++){
    const u=(axis+1)%3,v=(axis+2)%3;
    for(let plane=0;plane<=count[axis];plane++)for(const sign of [-1,1]){
      const mask=new Uint8Array(count[u]*count[v]);
      for(let i=0;i<count[u];i++)for(let j=0;j<count[v];j++){
        const inside=[0,0,0],outside=[0,0,0];
        inside[axis]=plane+(sign===1?-1:0);outside[axis]=plane+(sign===1?0:-1);
        inside[u]=outside[u]=i;inside[v]=outside[v]=j;
        if(occupied(inside)&&!occupied(outside))mask[i*count[v]+j]=1;
      }
      for(let i=0;i<count[u];i++)for(let j=0;j<count[v];j++){
        if(!mask[i*count[v]+j])continue;
        let endJ=j+1;while(endJ<count[v]&&mask[i*count[v]+endJ])endJ++;
        let endI=i+1;
        while(endI<count[u]){
          let complete=true;
          for(let k=j;k<endJ;k++)if(!mask[endI*count[v]+k]){complete=false;break;}
          if(!complete)break;endI++;
        }
        for(let a=i;a<endI;a++)for(let b=j;b<endJ;b++)mask[a*count[v]+b]=0;
        const point=(a,b)=>{
          const p=[0,0,0];p[axis]=axes[axis][plane];p[u]=axes[u][a];p[v]=axes[v][b];return p;
        };
        // 共形边：沿所有切分坐标插入边界顶点，让相邻面共用完整的边。
        const perimeter=[];
        for(let a=i;a<endI;a++)perimeter.push(point(a,j));
        for(let b=j;b<endJ;b++)perimeter.push(point(endI,b));
        for(let a=endI;a>i;a--)perimeter.push(point(a,endJ));
        for(let b=endJ;b>j;b--)perimeter.push(point(i,b));
        const center=point(i,j);center[u]=(axes[u][i]+axes[u][endI])/2;center[v]=(axes[v][j]+axes[v][endJ])/2;
        for(let k=0;k<perimeter.length;k++){
          const current=perimeter[k],next=perimeter[(k+1)%perimeter.length];
          vertex(center,axis,sign);vertex(sign===1?current:next,axis,sign);vertex(sign===1?next:current,axis,sign);
        }
      }
    }
  }
  meshes.forEach(m=>{parent.remove(m);m.geometry.dispose();});
  if(!positions.length)return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const result=new THREE.Mesh(geometry,material);result.name=name;result.castShadow=true;result.receiveShadow=true;
  result.userData.unionBounds=bounds;parent.add(result);return result;
}

// 每个实际垂直接点补齐完整墙厚。高度取源墙交集，门窗洞不会被填上。
function buildWallCornerCaps(runs,material=materials.wall){
  const eps=1e-6,half=WALL_THICKNESS/2,nodes=new Map();
  const horizontal=runs.filter(r=>r.axis==="h"&&r.material===material);
  const vertical=runs.filter(r=>r.axis==="v"&&r.material===material);
  for(const h of horizontal)for(const v of vertical){
    if(v.x<h.x1-eps||v.x>h.x2+eps||h.z<v.z1-eps||h.z>v.z2+eps)continue;
    if(Math.min(h.y2,v.y2)-Math.max(h.y1,v.y1)<=eps)continue;
    const key=v.x.toFixed(6)+","+h.z.toFixed(6);
    let node=nodes.get(key);
    if(!node)nodes.set(key,node={x:v.x,z:h.z,h:new Set(),v:new Set()});
    node.h.add(h);node.v.add(v);
  }
  const caps=[];
  for(const node of nodes.values()){
    const connected=[...node.h,...node.v];
    const heights=[...new Set(connected.flatMap(r=>[Number(r.y1.toFixed(6)),Number(r.y2.toFixed(6))]))].sort((a,b)=>a-b);
    for(let k=0;k<heights.length-1;k++){
      const y1=heights[k],y2=heights[k+1],mid=(y1+y2)/2;
      const h=[...node.h].filter(r=>r.y1<mid&&r.y2>mid),v=[...node.v].filter(r=>r.y1<mid&&r.y2>mid);
      if(y2-y1<=eps||!h.length||!v.length)continue;
      const arms=new Set();
      h.forEach(r=>{if(r.x1<node.x-eps)arms.add("west");if(r.x2>node.x+eps)arms.add("east");});
      v.forEach(r=>{if(r.z1<node.z-eps)arms.add("north");if(r.z2>node.z+eps)arms.add("south");});
      caps.push({x:node.x,z:node.z,y1,y2,kind:arms.size===2?"L":arms.size===3?"T":"X",arms:[...arms],material,
        bounds:[[node.x-half,y1,node.z-half],[node.x+half,y2,node.z+half]]});
    }
  }
  return caps;
}
function finishStructure(){
  wallCornerCaps.push(...buildWallCornerCaps(wallRuns));
  wallCornerCaps.forEach(c=>box(wallsGroup,c.x,(c.y1+c.y2)/2,c.z,WALL_THICKNESS,c.y2-c.y1,WALL_THICKNESS,c.material,{radius:0}));
  const wallMeshes=wallsGroup.children.filter(m=>m.isMesh&&m.material===materials.wall);
  structuralWallBounds.push(...canonicalBounds(wallMeshes.map(meshBoxBounds)));
  unifyBoxSurfaces(wallsGroup,wallMeshes,materials.wall,"continuous-walls");
  [materials.floorStone,materials.floorWood,materials.floorBath].forEach((material,i)=>{
    const mesh=unifyBoxSurfaces(floorsGroup,floorsGroup.children.filter(m=>m.isMesh&&m.material===material),material,"continuous-floor-"+i);
    if(mesh)mesh.userData.isFloor=true;
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
function addSkirting(){
  const height=.066,thickness=.018;
  const group=new THREE.Group();group.name="墙脚收口";wallsGroup.add(group);
  const walls=structuralWallBounds.filter(([lo,hi])=>lo[1]<=1e-6&&hi[1]>=height);
  const clipBounds=floorAreas.map(area=>[[area.x1,0,area.z1],[area.x2,height,area.z2]]);
  for(const scheme of ["merged","glass"]){
    const variant=new THREE.Group();group.add(variant);
    for(const [lo,hi] of walls)box(variant,(lo[0]+hi[0])/2,height/2,(lo[2]+hi[2])/2,
      hi[0]-lo[0]+thickness*2,height,hi[2]-lo[2]+thickness*2,materials.baseboard,{radius:0});
    const jambs=doorJambBounds.filter(bounds=>!bounds.scheme||bounds.scheme===scheme);
    const subtractBounds=[...structuralWallBounds,...jambs]
      .filter(([lo,hi])=>lo[1]<height&&hi[1]>0)
      .map(([lo,hi])=>[[lo[0],Math.max(0,lo[1]),lo[2]],[hi[0],Math.min(height,hi[1]),hi[2]]]);
    const mesh=unifyBoxSurfaces(variant,[...variant.children],materials.baseboard,scheme==="merged"?"continuous-skirting":"continuous-skirting-glass",8,{subtractBounds,clipBounds});
    if(mesh){mesh.castShadow=false;variant.userData.scheme=scheme;variant.visible=scheme===state.scheme;skirtingVariants.push(variant);}
  }
}

function addSofa(parent) {
  const group=new THREE.Group();group.name="客厅软包沙发";parent.add(group);
  const locations=[[2.02,5.5],[2.43,5.5],[2.02,7.75],[2.43,7.75],[3.58,7.46],[3.58,7.84]];
  locations.forEach(([x,z])=>rod(group,[x,.015,z],[x,.155,z],.023,materials.walnut));
  softBox(group,2.24,.23,6.65,.92,.22,2.74,materials.fabric,.045,.002,"sofa-base");
  softBox(group,3.20,.23,7.64,1.03,.22,.80,materials.fabric,.045,.002,"sofa-return-base");
  [5.82,6.64,7.46].forEach(z=>softBox(group,2.35,.38,z,.68,.155,.78,materials.fabric,.065,.020,"sofa-seat"));
  softBox(group,3.20,.38,7.60,1.02,.155,.68,materials.fabric,.065,.020,"sofa-seat");
  softBox(group,1.88,.64,6.66,.17,.62,2.55,materials.fabric,.075,.016,"sofa-back");
  softBox(group,3.15,.64,7.98,1.32,.62,.17,materials.fabric,.07,.016,"sofa-back");
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
  box(group,0,.725,0,width,.05,depth,materials.oakLight,{radius:.012});
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*(width/2-.12),.015,b*(depth/2-.08)],[a*(width/2-.12),.70,b*(depth/2-.08)],.024,materials.black);
  return group;
}
function addOfficeChair(parent,x,z,rotation=0) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="办公椅";parent.add(group);
  softBox(group,0,.425,0,.49,.12,.48,materials.fabricDark,.06,.013);
  curvedBack(group,0,.80,.23,.47,.67,.10,materials.fabricDark,.10);
  rod(group,[0,.12,0],[0,.37,0],.042,materials.chrome);
  for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5,xp=Math.cos(angle)*.29,zp=Math.sin(angle)*.29;
    rod(group,[0,.15,0],[xp,.065,zp],.020,materials.black);
    const wheel=objectMesh(group,new THREE.CylinderGeometry(.044,.044,.04,20),materials.black,xp,.045,zp);
    wheel.rotation.x=Math.PI/2;
  }
  for(const side of [-1,1]){
    rod(group,[side*.22,.42,.09],[side*.28,.63,.06],.014,materials.black);
    softBox(group,side*.28,.648,.025,.075,.04,.25,materials.black,.018,.002);
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
  ring(group,0,.425,-.025,.218,.024,materials.porcelain,.91,1.22);
  cylinder(group,0,.382,-.035,.135,.009,new THREE.MeshStandardMaterial({color:0xdbe3e1,roughness:.16}),32).scale.z=1.2;
  box(group,0,.61,.245,.37,.32,.17,materials.porcelain,{radius:.048,name:"toilet-tank"});
  cylinder(group,0,.777,.245,.027,.012,materials.chrome,24);
  const lid=softBox(group,0,.64,.149,.405,.47,.035,materials.porcelain,.017,.002,"toilet-lid");
  lid.rotation.x=.11;
  return group;
}
function addWasher(parent,x,z) {
  const group=new THREE.Group();group.position.set(x,0,z);group.name="滚筒洗衣机";parent.add(group);
  box(group,0,.434,0,.598,.828,.59,materials.porcelain,{radius:.028});
  for(const side of [-1,1])for(const front of [-1,1])cylinder(group,side*.22,.011,front*.23,.022,.022,materials.black,16);
  box(group,0,.80,.301,.530,.095,.012,materials.offWhite,{radius:.004});
  const knob=objectMesh(group,new THREE.CylinderGeometry(.03,.03,.017,24),materials.chrome,-.16,.80,.316);knob.rotation.x=Math.PI/2;
  box(group,.105,.80,.318,.15,.046,.009,materials.black,{radius:.003});
  const lip=objectMesh(group,new THREE.TorusGeometry(.192,.025,12,48),materials.chrome,0,.45,.314);
  const gasket=objectMesh(group,new THREE.TorusGeometry(.164,.013,10,40),materials.black,0,.45,.324);
  const door=objectMesh(group,new THREE.SphereGeometry(1,24,16),new THREE.MeshPhysicalMaterial({color:0x34464b,roughness:.14,metalness:.15,clearcoat:1}),0,.45,.332);
  door.scale.set(.155,.155,.025);
  box(group,.185,.47,.346,.018,.115,.024,materials.offWhite,{radius:.008});
  return group;
}
function addNightstand(parent,x,z,depth=.40) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=-Math.PI/2;group.name="床头柜";parent.add(group);
  box(group,0,.31,0,.42,.53,depth,materials.oakLight,{radius:.018});
  for(const y of [.19,.44]) {
    box(group,0,y,depth/2+.006,.393,.229,.019,materials.oakLight,{radius:.006});
    rod(group,[-.08,y+.04,depth/2+.027],[.08,y+.04,depth/2+.027],.005,materials.chrome);
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
  softBox(group,0,.41,0,.48,.105,.50,material,.048,.012);
  curvedBack(group,0,.72,.25,.48,.45,.07,material,.12);
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*.225,.012,b*.21],[a*.17,.39,b*.15],.020,materials.oak);
  return group;
}

function addBed(parent,x,z,width=1.8,depth=2,rotation=0) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;group.name="软床与床品";parent.add(group);
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*(width/2-.16),.0,b*(depth/2-.15)],[a*(width/2-.16),.13,b*(depth/2-.15)],.028,materials.walnut);
  box(group,0,.22,0,width+.08,.23,depth+.12,materials.oak,{radius:.025});
  softBox(group,0,.42,0,width,.235,depth,materials.linen,.095,.012,"mattress");
  softBox(group,0,.73,-depth/2-.08,width+.06,1.18,.16,materials.fabric,.075,.012,"upholstered-headboard");
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
  group.position.y=-.05;
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

function addDiningTable(parent,x,z){
  const group=new THREE.Group();group.name="餐桌";group.position.set(x,0,z);parent.add(group);
  group.userData.nominalSize=[1.55,.88,.75];
  box(group,0,.73,0,1.55,.04,.88,materials.oakLight,{radius:.012,name:"dining-table-top"});
  for(const a of [-1,1])for(const b of [-1,1])rod(group,[a*.58,.018,b*.29],[a*.53,.71,b*.26],.035,materials.oak);
  return group;
}
function addWardrobe(parent,x,z,width=1,depth=.58,height=2.364,rotation=0){
  const group=addCabinet(parent,x,z,width,depth,height,materials.oakLight,rotation);
  group.name="主卧衣柜";group.userData.nominalSize=[width,depth,height];
  rod(group,[-width/2+.055,1.86,0],[width/2-.055,1.86,0],.012,materials.chrome);
  return group;
}
function addExteriorDryingRack(parent,x){
  const group=new THREE.Group();group.name="阳台A外侧晾衣架";group.position.set(x,0,0);parent.add(group);
  group.userData.nominalSize=[1.58,.62,1.92];
  for(const side of [-1,1]){
    box(group,side*.70,1.74,-.0725,.055,.38,.025,materials.chrome,{radius:.005,name:"drying-wall-mount"});
    rod(group,[side*.70,1.89,-.085],[side*.70,1.89,-.69],.012,materials.chrome);
    rod(group,[side*.70,1.59,-.085],[side*.70,1.89,-.58],.010,materials.chrome);
  }
  for(const z of [-.24,-.45,-.67])rod(group,[-.78,1.89,z],[.78,1.89,z],.010,materials.chrome);
  const clothes=[[-.30,-.67,materials.linen],[.28,-.67,materials.duvet]];
  for(const [px,pz,source] of clothes){
    const hanger=new THREE.Group();hanger.position.set(px,1.85,pz);group.add(hanger);
    const hookPath=new THREE.CatmullRomCurve3([new THREE.Vector3(-.012,.025,0),new THREE.Vector3(-.017,.065,0),new THREE.Vector3(.023,.072,0),new THREE.Vector3(.032,.044,0),new THREE.Vector3(0,.020,0)]);
    objectMesh(hanger,new THREE.TubeGeometry(hookPath,14,.0035,6,false),materials.chrome);
    rod(hanger,[0,.012,0],[-.17,-.11,0],.004,materials.chrome);
    rod(hanger,[-.17,-.11,0],[.17,-.11,0],.004,materials.chrome);
    rod(hanger,[.17,-.11,0],[0,.012,0],.004,materials.chrome);
    const shape=new THREE.Shape();
    [[-.055,-.04],[-.135,-.065],[-.215,-.13],[-.17,-.22],[-.13,-.18],[-.13,-.47],[.13,-.47],[.13,-.18],[.17,-.22],[.215,-.13],[.135,-.065],[.055,-.04],[.035,-.085],[-.035,-.085]].forEach(([sx,sy],i)=>i?shape.lineTo(sx,sy):shape.moveTo(sx,sy));
    shape.closePath();const geometry=new THREE.ShapeGeometry(shape,8),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*27)*.012+Math.sin(p.getY(i)*13)*.010);
    geometry.computeVertexNormals();const material=source.clone();material.side=THREE.DoubleSide;
    objectMesh(hanger,geometry,material,0,0,.008,"drying-shirt");
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

// 按 C1 原图重排整套装修。家具均使用真实尺度，门前与横向过道保持空旷。
addRug(furnitureGroup,4.65,8.5,2.65,2.9,0xb9aa93);
const livingSofa=addSofa(furnitureGroup);livingSofa.position.set(1,0,1.8);
addTVConsole(furnitureGroup,6.78,8.75);
addDiningTable(furnitureGroup,4.45,3.45);
[[3.95,2.76,Math.PI],[4.95,2.76,Math.PI],[3.95,4.14,0],[4.95,4.14,0]].forEach(([x,z,r])=>addChair(furnitureGroup,x,z,r,materials.fabric));
// 厨房L形台面，水槽、灶台、抽油烟机和冰箱保持连续合理比例。
addCabinet(furnitureGroup,.36,1.00,1.38,.60,.87,materials.oakLight,Math.PI/2);
addCabinet(furnitureGroup,1.69,.34,2.07,.60,.87,materials.oakLight,0,true);
const upperKitchen=new THREE.Group();upperKitchen.position.y=1.50;furnitureGroup.add(upperKitchen);
addCabinet(upperKitchen,.26,.3,.48,.4,.70,materials.offWhite,Math.PI/2);
const kitchenCounter=[
  box(furnitureGroup,.36,.8925,.91,.64,.035,1.70,materials.offWhite,{radius:0}),
  box(furnitureGroup,.88,.8925,.35,.44,.035,.65,materials.offWhite,{radius:0}),
  box(furnitureGroup,2.25,.8925,.35,1.0,.035,.65,materials.offWhite,{radius:0}),
  box(furnitureGroup,1.425,.8925,.085,.65,.035,.12,materials.offWhite,{radius:0}),
  box(furnitureGroup,1.425,.8925,.62,.65,.035,.12,materials.offWhite,{radius:0}),
];
unifyBoxSurfaces(furnitureGroup,kitchenCounter,materials.offWhite,"continuous-kitchen-counter");
addBasin(furnitureGroup,1.425,.912,.35,materials.chrome,.57,.46);
addFaucet(furnitureGroup,1.425,.92,.085);
box(furnitureGroup,.36,.926,1.11,.44,.027,.63,materials.black,{radius:.012,name:"kitchen-hob"});
[.94,1.28].forEach(pz=>{
  cylinder(furnitureGroup,.36,.947,pz,.096,.012,materials.chrome,32);
  ring(furnitureGroup,.36,.956,pz,.071,.01,materials.black);
  rod(furnitureGroup,[.27,.96,pz],[.45,.96,pz],.009,materials.black);
  rod(furnitureGroup,[.36,.96,pz-.09],[.36,.96,pz+.09],.009,materials.black);
});
box(furnitureGroup,.28,1.70,1.11,.47,.10,.62,materials.chrome,{radius:.025,name:"range-hood"});
box(furnitureGroup,.15,2.15,1.11,.21,.78,.32,materials.chrome);
const fridge=new THREE.Group();fridge.name="双门冰箱";fridge.position.set(3.145,0,.385);furnitureGroup.add(fridge);
fridge.userData.nominalSize=[.55,.557,1.824];
for(const side of [-1,1])for(const front of [-1,1])cylinder(fridge,side*.2,.012,front*.21,.022,.024,materials.black,16);
box(fridge,0,.924,0,.55,1.824,.557,materials.offWhite,{radius:.025});
box(fridge,0,1.534,.288,.53,.595,.022,materials.porcelain,{radius:.018});
box(fridge,0,.625,.288,.53,1.20,.022,materials.porcelain,{radius:.018});
rod(fridge,[-.2,.95,.325],[-.2,1.22,.325],.007,materials.chrome);
rod(fridge,[-.2,1.48,.325],[-.2,1.71,.325],.007,materials.chrome);
addWasher(furnitureGroup,4.06,.45);
addCabinet(furnitureGroup,5.68,.35,.78,.58,.86,materials.oakLight,0,true);
addBasin(furnitureGroup,5.68,.91,.35,materials.porcelain,.50,.39);
addFaucet(furnitureGroup,5.68,.9,.09);
addExteriorDryingRack(furnitureGroup,4.85);
rod(furnitureGroup,[4.18,.7,.13],[4.18,.7,.067],.015,materials.chrome);
rod(furnitureGroup,[4.18,.7,.13],[4.18,.46,.135],.014,materials.offWhite);
// 电竞房两人工作位，南门区与座椅后方留出活动空间。
for(const x of [7.08,8.32]){
  addDesk(furnitureGroup,x,2.25,1.20,.70);
  addMonitor(furnitureGroup,x,2.28,0,.94);
  addOfficeChair(furnitureGroup,x,3.14);
}
addPC(furnitureGroup,6.65,2.23);addPC(furnitureGroup,8.75,2.23);
box(furnitureGroup,7.7,.64,2.0,2.05,.08,.11,materials.black,{radius:.01,name:"书桌理线槽"});
addWindowShade(furnitureGroup,7.7,1.8,2.0);
addWindowShade(furnitureGroup,11,1.8,2.4);
// 客房床头靠东，不挡北窗；书桌在西墙中段，南侧门扇避开家具。
const guestBed=addBed(furnitureGroup,11.54,3.60,1.5,2,-Math.PI/2);guestBed.userData.room="guest";
const guestWardrobe=addCabinet(furnitureGroup,9.87,2.16,.95,.58,2.364);guestWardrobe.name="客房衣柜";
addDesk(furnitureGroup,9.58,3.59,1.10,.60,Math.PI/2);
addChair(furnitureGroup,10.18,3.59,-Math.PI/2,materials.fabric);
// 主卧北侧衣柜暂时删除，原柜位作为通往客卫的门前区域。
const masterBed=addBed(furnitureGroup,11.52,10.60,1.8,2,-Math.PI/2);masterBed.userData.room="master";
addNightstand(furnitureGroup,12.24,9.37);addNightstand(furnitureGroup,12.24,11.83);
function addWallLight(parent,x,y,z,rotation=0){
  const group=new THREE.Group();group.name="床头阅读壁灯";group.position.set(x,y,z);group.rotation.y=rotation;parent.add(group);
  box(group,0,0,0,.075,.14,.018,materials.black,{radius:.01});
  rod(group,[0,-.01,.02],[0,-.055,.105],.012,materials.black);
  const shade=objectMesh(group,new THREE.CylinderGeometry(.037,.052,.08,24),materials.offWhite,0,-.075,.115);
  shade.rotation.x=-.3;
  const diffuser=cylinder(group,0,-.115,.128,.045,.005,materials.warmLED,24);diffuser.castShadow=false;
}
addWallLight(furnitureGroup,12.725,1.35,9.37,-Math.PI/2);
addWallLight(furnitureGroup,12.725,1.35,11.83,-Math.PI/2);
box(furnitureGroup,12.725,1.04,10.60,.026,1.30,2.96,materials.oakLight,{radius:.007,name:"主卧连续床头饰面"});
box(furnitureGroup,.28,1.584,.30,.26,.007,.30,materials.warmLED,{radius:.003,name:"厨房柜下照明"});
box(furnitureGroup,.39,1.648,1.11,.06,.008,.40,materials.warmLED,{radius:.003,name:"灶台工作照明"});
// 卫浴分别布置，避免马桶和淋浴占据同一位置。
function addVanity(parent,x,z,width=.65,depth=.48){
  const group=new THREE.Group();group.name="卫浴洗手区";group.position.set(x,0,z);parent.add(group);
  addCabinet(group,0,0,width,depth,.75,materials.oakLight,0,true);
  box(group,0,.785,0,width+.035,.04,depth+.02,materials.offWhite,{radius:.009});
  addBasin(group,0,.87,0,materials.porcelain,width-.14,depth-.11);addFaucet(group,0,.81,-depth/2+.015);
  box(group,0,1.50,-depth/2-.002,width,.76,.022,materials.chrome,{radius:.025,name:"bathroom-mirror"});
  box(group,0,1.925,-depth/2+.025,width-.05,.032,.046,materials.warmLED,{radius:.006,name:"镜前灯"});
  return group;
}
function addShower(parent,x,z,w=.83,d=.87){
  const group=new THREE.Group();group.name="独立淋浴区";group.position.set(x,0,z);parent.add(group);
  box(group,0,.047,0,w,.062,d,materials.porcelain,{radius:.025,name:"shower-tray"});
  box(group,0,1.12,-d/2,w-.03,2.1,.018,materials.glass,{radius:0});
  rod(group,[w/2-.08,.90,d/2-.08],[w/2-.08,2.15,d/2-.08],.012,materials.chrome);
  rod(group,[w/2-.08,2.12,d/2-.08],[w/2-.08,2.18,d/2-.22],.012,materials.chrome);
  cylinder(group,w/2-.08,2.18,d/2-.22,.09,.025,materials.chrome,32);
  ring(group,0,.081,0,.027,.004,materials.chrome);
  return group;
}
addVanity(furnitureGroup,7.62,8.32,.65,.48);
const masterToilet=addToilet(furnitureGroup,7.57,9.05);masterToilet.rotation.y=-Math.PI/2;
addShower(furnitureGroup,8.35,9.78,.83,.87);
rod(furnitureGroup,[7.17,1.2,8.65],[7.17,1.2,9.1],.012,materials.chrome);
box(furnitureGroup,7.2,.98,8.84,.028,.4,.26,materials.linen,{radius:.014,name:"bath-towel"});
addVanity(furnitureGroup,10.69,5.46,.66,.48);
const guestToilet=addToilet(furnitureGroup,12.39,6.66);guestToilet.rotation.y=Math.PI/2;
addShower(furnitureGroup,10.70,6.59,.86,.85);
// 狭长主卧阳台仅做小尺度生活布置，两套方案不更改房屋边界。
const balconyBench=new THREE.Group();balconyBench.name="阳台休闲凳";balconyBench.position.set(9.67,0,13.59);mergedFurniture.add(balconyBench);
softBox(balconyBench,0,.382,0,.95,.14,.54,materials.fabric,.055,.02,"balcony-bench-seat");
curvedBack(balconyBench,0,.71,.22,.95,.46,.12,materials.fabricDark,.015);
[-.37,.37].forEach(px=>[-.19,.19].forEach(pz=>rod(balconyBench,[px,.06,pz],[px,.315,pz],.023,materials.oak)));
addCabinet(mergedFurniture,12.16,13.63,.80,.35,.72);
addDesk(glassFurniture,9.46,13.43,.9,.45,Math.PI/2);
addChair(glassFurniture,10.10,13.43,-Math.PI/2);
addCabinet(glassFurniture,12.16,13.63,.80,.35,.72);

// 其余楼层仅为毛坯参照，不属于自家的可行走空间。
function buildBuildingContext(){
  const group=new THREE.Group();group.name="其他住户与公区毛坯轮廓";group.userData.isBuildingContext=true;
  const floorGroup=new THREE.Group(),wallGroup=new THREE.Group();group.add(floorGroup,wallGroup);
  const concrete=new THREE.MeshStandardMaterial({color:0xbfc0bb,roughness:1});
  const bare=new THREE.MeshStandardMaterial({color:0xc9cbc6,roughness:1});
  const floors=[],walls=[],runs=[];
  function slab(x1,z1,x2,z2){floors.push(box(floorGroup,(x1+x2)/2,-.04,(z1+z2)/2,x2-x1,.08,z2-z1,concrete,{radius:0,castShadow:false}));}
  function line(x1,z1,x2,z2,h=CONTEXT_WALL_HEIGHT){
    const isH=Math.abs(z1-z2)<1e-6;if(Math.hypot(x2-x1,z2-z1)<1e-6)return;
    walls.push(box(wallGroup,(x1+x2)/2,h/2,(z1+z2)/2,isH?Math.abs(x2-x1):.14,h,isH?.14:Math.abs(z2-z1),bare,{radius:0,castShadow:false}));
    runs.push({x1:Math.min(x1,x2),x2:Math.max(x1,x2),z1:Math.min(z1,z2),z2:Math.max(z1,z2),isH,h});
  }
  function path(points,closed=false,h=CONTEXT_WALL_HEIGHT){for(let i=1;i<points.length;i++)line(...points[i-1],...points[i],h);if(closed)line(...points.at(-1),...points[0],h);}
  // C3 左侧住宅及南阳台。
  [[-13.4,1.8,-10.1,10.3],[-10.1,5.1,-5.2,10.3],[-8.3,3.5,-6.1,5.1],[-13.4,10.3,-5.2,15.6],[-12.9,15.6,-6,17.7]].forEach(p=>slab(...p));
  path([[-13.4,1.8],[-10.1,1.8],[-10.1,5.1],[-8.3,5.1],[-8.3,3.5],[-6.1,3.5],[-6.1,5.1],[-5.2,5.1],[-5.2,15.6],[-6,15.6],[-6,17.7],[-12.9,17.7],[-12.9,15.6],[-13.4,15.6]],true);
  [[-13.4,5.1,-10.1,5.1],[-13.4,6.7,-10.1,6.7],[-12.2,5.1,-12.2,6.7],[-10.1,7.7,-10.1,10.3],[-8.3,6,-8.3,8.7],[-8.3,8.7,-5.2,8.7],[-10.1,11.4,-10.1,15.6],[-12.9,15.6,-6,15.6]].forEach(p=>line(...p));
  // C2 南侧住户，内部只划分房间轮廓。
  slab(-5.2,10.3,2.6,18.6);slab(-5.2,18.6,-1,20.1);
  path([[-5.2,10.3],[.35,10.3]]);path([[1.25,10.3],[2.6,10.3],[2.6,18.6],[-1,18.6],[-1,20.1],[-5.2,20.1],[-5.2,10.3]]);
  [[-3.4,10.3,-3.4,12.45],[-5.2,13.4,-3.4,13.4],[-1,10.3,-1,12.55],[-1,13.6,0,13.6],[.9,13.6,2.6,13.6],[0,13.6,0,15.3],[1.15,13.6,1.15,15.3],[0,15.3,2.6,15.3],[-1,16.25,-1,18.6],[-5.2,18.6,-1,18.6]].forEach(p=>line(...p));
  // 两部电梯、前厅、外廊、中央楼梯及室外入口，地坪连为一个毛坯区域。
  slab(0,1.8,1.3,3.5);
  slab(-2.2,1.8,0,8.5);slab(-5.2,8.5,0,10.3);slab(0,3.5,2.6,10.3);slab(-4.5,3.5,-2.2,8.5);
  [[-2.2,1.8,0,1.8],[-2.2,1.8,-2.2,3.5],[0,1.8,0,8.9],[0,9.8,0,10.3],[1.3,5.15,1.3,9.45]].forEach(p=>line(...p));
  // 公区矮墙沿入口左侧接续楼梯外围，入口下方保持敞开，不再重建横墙。
  for(const [z1,z2]of [[3.5,5.85],[6.15,8.5]]){
    path([[-2.2,z1],[-4.5,z1],[-4.5,z2],[-2.2,z2]],false,.85*1.5);
    line(-2.2,z1,-2.2,z1+.62,.85*1.5);line(-2.2,z2-.62,-2.2,z2,.85*1.5);
    for(const sign of [-1,1]){
      const mark=box(group,-3.35,.014,(z1+z2)/2,.026,.02,2.70,bare,{radius:0,castShadow:false});mark.rotation.y=sign*.68;
    }
  }
  for(let i=0;i<12;i++){
    const h=.08+i*.045;
    box(group,.69,h/2,9.23-i*.34,.98,h,.34,concrete,{radius:0,castShadow:false});
    box(group,1.91,h/2,5.49+i*.34,.98,h,.34,concrete,{radius:0,castShadow:false});
  }
  box(group,1.3,.595,4.325,2.28,.06,1.65,concrete,{radius:0,castShadow:false});
  // 用户确认客厅南侧是空地，不制作平台、围墙或毛坯地坪。
  for(const h of runs.filter(r=>r.isH))for(const v of runs.filter(r=>!r.isH)){
    if(v.x1<h.x1||v.x1>h.x2||h.z1<v.z1||h.z1>v.z2)continue;
    const height=Math.min(h.h,v.h);
    walls.push(box(wallGroup,v.x1,height/2,h.z1,.14,height,.14,bare,{radius:0,castShadow:false}));
  }
  unifyBoxSurfaces(floorGroup,floors,concrete,"building-context-floor");
  unifyBoxSurfaces(wallGroup,walls,bare,"building-context-walls");
  group.traverse(o=>{o.userData.isBuildingContext=true;if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
  return group;
}
const buildingContext=buildBuildingContext();home.add(buildingContext);
function setContextVisible(value){
  state.contextVisible=Boolean(value);buildingContext.visible=state.contextVisible;
  $("#contextToggle").checked=state.contextVisible;
  $("#contextQuickToggle").setAttribute("aria-pressed",String(state.contextVisible));
  $("#contextQuickToggle").textContent="周边毛坯："+(state.contextVisible?"显示":"关闭");
  try{localStorage.setItem("jiji-context-visible",String(state.contextVisible));}catch(_){}
}
function showBuilding(){
  setMode("orbit");state.cameraTween=null;setContextVisible(true);stage.classList.remove("is-plan");
  const target=worldPoint(-.4,.25,10);
  const distance=Math.max(33,30/camera.aspect)/(2*Math.tan(camera.fov*Math.PI/360));
  controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(0,distance*.91,distance*.41));
  controls.update();viewStatus.textContent="整层轮廓 · 右侧C1是我家";
}

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

addLabel("living","客厅","单片全景玻璃 · 无茶几",4.8,8.7);
addLabel("dining","餐厅","开放厨房 · 连通过道",4.45,3.5);
addLabel("kitchen","厨房","原图北侧凸出",1.8,.85);
addLabel("balcony-a","生活阳台","洗衣 · 外侧晾晒",4.85,.85);
addLabel("gaming","电竞房","3.0m × 3.3m轴线",7.7,3.9);
addLabel("guest","客房","3.6m × 3.3m轴线",11.4,3.8);
addLabel("hall","开放过道","客餐厅直接进入",6.5,5.7);
addLabel("suite","开放连接区","客厅连通主卧与主卫",8.2,7.0);
addLabel("bath-a","主卫","独立淋浴区",8,9.3);
addLabel("bath-b","客卫","整间卫浴 · 由主卧进入",11.55,6.2);
addLabel("master","主卧","3.9m开间 · 南侧延伸",10.9,10.4);
addLabel("balcony-b","主卧阳台","与主卧连成一体",10.85,13.55);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({ color: 0xded9d0, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.x=-5;
ground.position.y = -0.135;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(50, 50, 0xbcb4a8, 0xd3cdc3);
grid.position.y = -0.128;
grid.position.x=-5;
grid.material.opacity = 0.24;
grid.material.transparent = true;
scene.add(grid);

const roomViews={
  all:{label:"我家 C1 · 完整户型",target:[6.4,.4,7.05],offset:[-12,21,17],walk:[5.85,1.62,5.65],yaw:-Math.PI/2},
  living:{label:"客厅",target:[4.85,.6,8.4],offset:[-5.5,8.5,6.5],walk:[5.85,1.62,8.0],yaw:-Math.PI/2},
  dining:{label:"餐厅",target:[4.3,.6,3.3],offset:[-5,8,6],walk:[3.1,1.62,4.5],yaw:-Math.PI/2},
  tv:{label:"电视与收纳柜",target:[6.72,1.25,8.75],offset:[-2.8,1.1,.8],walk:[5.5,1.62,8.75],yaw:-Math.PI/2},
  hall:{label:"开放过道",target:[6.5,.4,5.7],offset:[-4.8,8.5,6.1],walk:[6.9,1.62,5.7],yaw:-Math.PI/2},
  gaming:{label:"双人电竞房",target:[7.7,.7,3.4],offset:[-4.5,8,5.5],walk:[8.5,1.62,4.4],yaw:0},
  guest:{label:"客房",target:[11,.7,3.4],offset:[-4.8,8,5.8],walk:[10.45,1.62,4.6],yaw:0},
  suite:{label:"客厅与主卧连接区",target:[8.7,.5,7.1],offset:[-3.5,6,5],walk:[8.3,1.62,7.5],yaw:-Math.PI/2},
  master:{label:"主卧与南阳台",target:[10.8,.7,10.8],offset:[-6,10.4,7],walk:[9.6,1.62,10.2],yaw:-Math.PI/2},
  kitchen:{label:"厨房",target:[1.8,.7,.9],offset:[4.5,7,5],walk:[2.15,1.62,1.15],yaw:Math.PI/2},
  "balcony-a":{label:"生活阳台",target:[4.85,.6,.9],offset:[4.1,6.5,5.2],walk:[4.9,1.62,1.3],yaw:0},
  "bath-a":{label:"主卫",target:[8,.6,9.1],offset:[-4.6,7.5,5.5],walk:[8.25,1.62,8.75],yaw:Math.PI},
  "bath-b":{label:"客卫",target:[11.55,.6,6.1],offset:[-4.6,7.5,5.5],walk:[11.75,1.62,5.85],yaw:0},
  "balcony-b":{label:"主卧阳台",target:[10.85,.6,13.3],offset:[-4.5,8,6],walk:[10.85,1.62,13.05],yaw:Math.PI},
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
  viewPanPressed.clear();
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

function setScheme(scheme){
  if(scheme!=="merged"&&scheme!=="glass")return;
  state.scheme=scheme;
  skirtingVariants.forEach(group=>group.visible=group.userData.scheme===scheme);
  mergedScheme.visible=scheme==="merged";glassScheme.visible=scheme==="glass";
  $("#schemeCaption").textContent=scheme==="merged"?"休闲与收纳":"小工作台与收纳";
  $$(".scheme-button").forEach(button=>button.classList.toggle("is-active",button.dataset.scheme===scheme));
  updateDoorButtons();showToast(scheme==="merged"?"主卧阳台：休闲布置":"主卧阳台：生活工作台");
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
    const sensitivity=event.pointerType==="touch" ? state.viewSpeed : 1;
    state.walkYaw -= dx * 0.0052 * sensitivity;
    state.walkPitch -= dy * 0.0042 * sensitivity;
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
const viewPanPressed=new Set();
function readViewSpeed(){
  try{const saved=localStorage.getItem("jiji-view-speed"),value=saved === null ? .55 : Number(saved);
    return Number.isFinite(value)?Math.max(.20,Math.min(1.50,value)):.55;
  }catch(_){return .55;}
}
function setViewSpeed(value){
  if(!Number.isFinite(Number(value)))return;
  state.viewSpeed=THREE.MathUtils.clamp(Number(value),.20,1.50);
  controls.rotateSpeed=state.viewSpeed;
  $("#viewSpeed").value=String(state.viewSpeed);
  $("#viewSpeedValue").textContent=state.viewSpeed.toFixed(2)+"×";
  try{localStorage.setItem("jiji-view-speed",String(state.viewSpeed));}catch(_){}
}
function readPanSpeed(){
  try{const saved=localStorage.getItem("jiji-pan-speed"),value=saved===null?1.50:Number(saved);
    return Number.isFinite(value)?THREE.MathUtils.clamp(value,.25,3.00):1.50;
  }catch(_){return 1.50;}
}
function setPanSpeed(value){
  if(!Number.isFinite(Number(value)))return;
  state.panSpeed=THREE.MathUtils.clamp(Number(value),.25,3.00);
  $("#panSpeed").value=String(state.panSpeed);
  $("#panSpeedValue").textContent=state.panSpeed.toFixed(2)+"×";
  try{localStorage.setItem("jiji-pan-speed",String(state.panSpeed));}catch(_){}
}
function updateViewPan(delta){
  if(state.mode!=="orbit" || viewPanPressed.size===0)return;
  const x=Number(viewPanPressed.has("right"))-Number(viewPanPressed.has("left"));
  const y=Number(viewPanPressed.has("up"))-Number(viewPanPressed.has("down"));
  const length=Math.hypot(x,y);if(!length)return;
  state.cameraTween=null;
  camera.updateMatrixWorld();
  const distance=camera.position.distanceTo(controls.target);
  const step=2*distance*Math.tan(camera.fov*Math.PI/360)/Math.max(1,stage.clientHeight)*160*state.panSpeed*delta/length;
  // 用户指定上下、左右全部反转；移动镜头跟随按键方向，房屋在画面中相向移动。
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  right.y=0;right.normalize();
  const forward=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),right).normalize();
  const screenUp=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
  const verticalProjection=Math.max(.12,forward.dot(screenUp));
  const movement=right.multiplyScalar(x*step).add(forward.multiplyScalar(y*step/verticalProjection));
  camera.position.add(movement);controls.target.add(movement);
  controls.update();
}
function clearDirectionButtons(){
  pressed.clear();viewPanPressed.clear();state.walkLookActive=false;
  $$("[data-move], [data-pan]").forEach(b=>b.classList.remove("is-pressed"));
}
window.addEventListener("blur",clearDirectionButtons);
document.addEventListener("visibilitychange",()=>{if(document.hidden)clearDirectionButtons();});

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
  if(wallCornerCaps.some(c=>c.y1<.25&&Math.hypot(
    Math.max(c.bounds[0][0]-x,0,x-c.bounds[1][0]),
    Math.max(c.bounds[0][2]-z,0,z-c.bounds[1][2]))<WALK_RADIUS))return false;
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
  const planDistance = Math.max(17.2, 15.5 / camera.aspect) / (2 * Math.tan(camera.fov * Math.PI / 360));
  camera.position.copy(worldPoint(6.4, planDistance, 7.05));
  controls.target.copy(worldPoint(6.4, 0, 7.05));
  controls.minPolarAngle = 0;
  controls.update();
  viewStatus.textContent = 'C1 完整平面 · 点击门可开关';
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
  setViewSpeed(state.viewSpeed);
  setPanSpeed(state.panSpeed);
  $("#panSpeed").addEventListener("input",event=>setPanSpeed(event.target.value));
  $("#viewSpeed").addEventListener("input",event=>setViewSpeed(event.target.value));
  $$("[data-pan]").forEach(button=>{
    const direction=button.dataset.pan;
    const stop=()=>{viewPanPressed.delete(direction);button.classList.remove("is-pressed");};
    button.addEventListener("pointerdown",event=>{
      if(state.mode!=="orbit")return;
      event.preventDefault();button.setPointerCapture?.(event.pointerId);
      viewPanPressed.add(direction);button.classList.add("is-pressed");updateViewPan(.10);
    });
    ["pointerup","pointercancel","lostpointercapture"].forEach(type=>button.addEventListener(type,stop));
    button.addEventListener("click",event=>{
      if(event.detail===0){viewPanPressed.add(direction);updateViewPan(.12);stop();}
    });
  });
  $("#northUp").addEventListener("click",faceNorth);
  $("#planView").addEventListener("click", showPlan);
  $("#buildingView").addEventListener("click",showBuilding);
  $("#contextToggle").addEventListener("change",event=>setContextVisible(event.target.checked));
  $("#contextQuickToggle").addEventListener("click",()=>setContextVisible(!state.contextVisible));
  try{setContextVisible(localStorage.getItem("jiji-context-visible")!=="false");}catch(_){setContextVisible(true);}
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
    $("#sheetTitle").textContent = "范围与阳台布置";
    $("#sheetSubtitle").textContent = "右侧C1为我家，周边只显示毛坯";
    content.innerHTML = `
      <div class="scope-actions"><button id="sheetHome" type="button">查看我家</button><button id="sheetBuilding" type="button">整层轮廓</button><button id="sheetContext" type="button">${state.contextVisible?"关闭":"显示"}周边毛坯</button></div>
      <div class="segmented-control" role="group" aria-label="切换主卧阳台方案">
        <button class="scheme-button ${state.scheme === "merged" ? "is-active" : ""}" type="button" data-scheme="merged">A · 休闲收纳</button>
        <button class="scheme-button ${state.scheme === "glass" ? "is-active" : ""}" type="button" data-scheme="glass">B · 小工作台</button>
      </div>`;
    $("#sheetHome").addEventListener("click",()=>{selectRoom("all");closeMobileSheet();});
    $("#sheetBuilding").addEventListener("click",()=>{showBuilding();closeMobileSheet();});
    $("#sheetContext").addEventListener("click",()=>{setContextVisible(!state.contextVisible);closeMobileSheet();});
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

function updateCompass(){
  const indicator=$("#compassRose");
  let angle;
  if(state.mode==="walk")angle=state.walkYaw;
  else{
    camera.updateMatrixWorld();
    const north=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion.clone().invert());
    angle=Math.atan2(north.x,north.y);
  }
  indicator.style.transform="rotate("+angle+"rad)";
  $("#northUp").dataset.bearing=(angle*180/Math.PI).toFixed(2);
}
function faceNorth(){
  clearDirectionButtons();
  state.cameraTween=null;
  if(state.mode==="walk"){
    state.walkYaw=0;updateWalkRotation();updateCompass();showToast("已朝向图面上方");return;
  }
  // 清掉拖拽阻尼，再用球面角度旋转，保留当前焦点、俯仰和缩放。
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
  const offset=camera.position.clone().sub(controls.target);
  const spherical=new THREE.Spherical().setFromVector3(offset);
  state.cameraTween={kind:"north",start:performance.now(),duration:550,
    target:controls.target.clone(),radius:spherical.radius,phi:spherical.phi,theta:spherical.theta};
  showToast("北朝上");
}
function updateCameraTween(now) {
  const tween = state.cameraTween;
  if (!tween) return;
  const progress = Math.min(1, (now - tween.start) / tween.duration);
  const eased = 1 - Math.pow(1 - progress, 3);
  if(tween.kind==="north"){
    controls.target.copy(tween.target);
    camera.position.copy(tween.target).add(new THREE.Vector3().setFromSphericalCoords(tween.radius,tween.phi,tween.theta*(1-eased)));
    if(progress>=1)state.cameraTween=null;
    return;
  }
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
    updateViewPan(delta);
    controls.update();
  } else {
    updateWalk(delta);
  }
  updateCompass();
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
  setViewSpeed,
  setPanSpeed,
  showPlan,
  faceNorth,
  setContextVisible,
  showBuilding,
};
