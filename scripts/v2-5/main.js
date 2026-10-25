import * as THREE from "three";
import WebGL from "three/addons/capabilities/WebGL.js";
import { MEDIA_ASSETS, placeholderImage } from "./config/assets.js";
import {
    UI_FONT as DEFAULT_UI_FONT, LOOK_SENS, PITCH_LIMIT, SPAWN_POS, EYE_Y, WALL_H, MARGIN,
    RED, BLUE, GREEN, GOLD,
    R_CORE, R_OUTER, WALL_THICK, BOUNDARY_WALL_LENGTH, BOUNDARY_GAP, FRAME_DEPTH, WALL_MOUNT_R, MID_R,
    BOUNDARIES, ZONES, getZoneById
} from "./config/scene-config.js";
import {
    normalizeAngle, zonePoint as radialZonePoint, faceCoreRotY, createSRGBCanvasTexture,
    bendGeometry, buildRingFloor, createAnnularSectorMesh, createArcFascia
} from "./geometry/radial-geometry.js";
import { createRadialCollision } from "./collision/radial-collision.js";
import { MAIN_DOOR_TARGET } from "./config/topic-navigation.js";
import {
    createTopicDoorState,
    registerTopicDoor,
    openTopicDoor,
    updateTopicDoorOpening,
    tryStartTopicDoorTransition,
    updateTopicDoorTransition,
    resetTopicDoor
} from "./interaction/topic-door.js";
import {
    ARCHITECTURE_COLORS,
    createCircularArchitectureMaterials
} from "./core/architectural-materials.js?v=20261025-2";
import { createConfiguredRenderer, resizeRenderer } from "./core/renderer.js";
import { loadDisplayTexture, getTextureLoadAudit } from "./core/texture-loader.js";
import { createAdaptiveFramePolicy } from "./runtime/frame-policy.js";
import { collectSceneAudit } from "./core/scene-audit.js";
import { PROFILE_DATA } from "../data/profiles.js";
import { initProfileModal, openProfileModal, closeProfileModal, isProfileModalOpen } from "./profile-modal.js?v=20261025-3";
import { createEmbossedLogo } from "../objects/embossed-logo.js";

THREE.ColorManagement.enabled = true;

// Bản LTR giữ nguyên dữ liệu và các khoảng cách đã căn chỉnh của bản gốc,
// nhưng phản chiếu trục nội dung trong từng cung. Nhờ đó phần đầu của mỗi cụm
// luôn xuất hiện ở phía người xem đi vào và diễn tiến từ trái sang phải.
function zonePoint(zone, angleFraction, radius) {
    return radialZonePoint(zone, 1 - angleFraction, radius);
}

let scene, camera, renderer;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let prevTime = performance.now();

let yaw = 0, pitch = 0;
let isDragging = false, dragMoved = false, lastMouseX = 0, lastMouseY = 0;
let started = false;
let isDocumentOpen = false;

let raycaster;
const interactiveObjects = [];
// Hình học kiến trúc tham gia che khuất ray tương tác nhưng không thể click.
// Tách khỏi interactiveObjects để tường/vách chặn được TV, ảnh và hotspot phía sau.
const interactionOccluders = [];
const DEFAULT_INTERACTION_DISTANCE = 8.5;
const INTERACTION_OCCLUSION_EPSILON = 0.035;
const provinceMarkerGroups = new Map();
let hoveredObject = null;
const effectUpdaters = [];
const framePolicy = createAdaptiveFramePolicy({ activeFps: 60, idleFps: 12 });
let webglContextAvailable = true;
const topicDoorState = createTopicDoorState();

let elHoverDot, elFocusLabel, elZoneBanner, elFade, elZoneFlash, elCanvas;
let elNowPlaying, elTrackName, elMuteBtn, elVolDown, elVolUp;
let elProvinceSelector, elProvinceButtons, elJourneyProgress;

let masterVolume = 1.0;   // 0..1 — âm lượng tổng do người dùng điều chỉnh
let isMuted = false;      // tắt tiếng thủ công

// Phương án lai cho việc đổi zone: rời khỏi 1 zone từ ngưỡng này trở lên thì
// lần sau quay lại sẽ phát LẠI TỪ ĐẦU; nhanh hơn ngưỡng này thì PHÁT TIẾP đoạn dang dở.
const RESTART_THRESHOLD_MS = 20000; // 20 giây — chỉnh số này nếu muốn nhạy/chậm hơn
// Màu nhận diện dùng cho các mảng nền chữ/trưng bày của riêng Cụm 2.
// Không dùng màu này để thay bảng màu bản đồ, TV hoặc popup giao diện.
const ZONE2_CONTENT_BLUE = '#0092DF';
const ZONE1_BA_PALETTE = Object.freeze({
    dark: '#006EA8',
    pale: '#EAF4FD',
    blue: '#0092DF',
    gold: '#FFCF62',
    text: '#263A4A'
});
const USE_ZONE1_EDITORIAL_V2 = document.body.dataset.zone1Layout === 'editorial-v2';
const ZONE2_PHOTO_ONLY = document.body.dataset.zone2PhotoOnly === 'true';
const ZONE1_RAISED_TEXT_DEMO = true;
const architectureMaterials = createCircularArchitectureMaterials();
const UI_FONT = USE_ZONE1_EDITORIAL_V2
    ? "'Roboto','Arial','Helvetica',sans-serif"
    : DEFAULT_UI_FONT;

// Biến cho 3D Audio
let audioListener;
let audioLoader;
const positionalAudios = [];

let heatmapTVCanvas, heatmapTVCtx, heatmapTVTex, heatmapTVMesh;
let vietnamMapState = null;
const provinceActivityCursor = new Map();
let heatmapTVRenderToken = 0;
let heatmapTVNavButtons = [];
let activeProvinceSelection = null;
let heatmapOverviewSlides = [];
let heatmapOverviewIndex = 0;
let heatmapOverviewNextAt = 0;
let heatmapCurrentImageIndex = 0;
let heatmapManualPauseUntil = 0;
let heatmapDisplayedActivity = null;
const HEATMAP_SINGLE_ACTIVITY_MS = 7500;
const HEATMAP_FIRST_IMAGE_MS = 6000;
const HEATMAP_NEXT_IMAGE_MS = 5000;
const HEATMAP_LAST_IMAGE_EXTRA_MS = 2000;
const HEATMAP_MANUAL_PAUSE_MS = 15000;

// GLB chỉ có một mesh, nên các vùng bấm được đặt trên một lớp trong suốt ở phía
// trước bản đồ. Tọa độ được chuẩn hoá (0..1), tính từ góc trái dưới của mặt map.
// Có thể bổ sung/sửa polygon tại đây khi chốt vị trí các tỉnh cùng người biên tập.
const VIETNAM_MAP_GEOJSON = '../Đồ 3D JS/vietnam-34-map/data/overview.geojson';
const VIETNAM_ARCHIPELAGO_GEOJSON = '../Đồ 3D JS/Free-GIS-Data-main/Vietnam Administrative Divisions (Pre-2025) - Đơn vị hành chính Việt Nam (Trước 2025)/Provinces_included_Paracel_SpratlyIslands_combine.geojson';
const VIETNAM_REGION_META = Object.freeze({
    'mien-bac': Object.freeze({ name: 'MIỀN BẮC', color: 0x1261a0 }),
    'mien-trung': Object.freeze({ name: 'MIỀN TRUNG', color: 0xd56b1f }),
    'mien-nam': Object.freeze({ name: 'MIỀN NAM', color: 0x147a50 })
});
const VIETNAM_PROVINCE_PALETTE = Object.freeze([0xe0b92f, 0x239263, 0xdd6937, 0x2386a3, 0x96922a, 0xc94d55, 0x397dcc, 0x8b58a3]);
const VIETNAM_OVERVIEW_RED = 0xc8102e;
const VIETNAM_OVERVIEW_HOVER_RED = 0xef3340;
const VIETNAM_CAPITAL_GOLD = 0xffd21c;
const VIETNAM_REGION_BORDER = 0x20384a;
const VIETNAM_MAP_SIZE = Object.freeze({ width: 4.50, height: 6.00 });
const VIETNAM_MAP_RELIEF_DEPTH = 0.08;
const VIETNAM_ARCHIPELAGO_INSETS = Object.freeze({
    // GeoJSON gắn Hoàng Sa với Đà Nẵng và Trường Sa với Khánh Hòa.
    'Đà Nẵng': Object.freeze({
        source: Object.freeze({ minX: 111.19, maxX: 112.75, minY: 15.77, maxY: 17.12 }),
        target: Object.freeze({ minX: 1.38, maxX: 2.12 })
    }),
    'Khánh Hòa': Object.freeze({
        source: Object.freeze({ minX: 109.11, maxX: 116.95, minY: 6.95, maxY: 12.05 }),
        target: Object.freeze({ minX: 1.18, maxX: 2.12 })
    })
});
const NORTHERN_MAP_DISPLAY_SCALE = 1.1;
const NORTHERN_MAP_SIZE = Object.freeze({
    width: 8.5 * NORTHERN_MAP_DISPLAY_SCALE,
    height: 5.34 * NORTHERN_MAP_DISPLAY_SCALE
});
// Bản đồ đã được uốn theo tường lõi; chỉ chừa một khe rất mỏng để tránh
// z-fighting nhưng vẫn tạo cảm giác bản đồ được áp trực tiếp lên bề mặt tường.
const NORTHERN_MAP_WALL_CLEARANCE = 0.015;
// Khe cửa chính nằm giữa đầu Cụm 1 và cuối Cụm 3 trong hành trình trái → phải.
const ENTRANCE_HALF_ANGLE = 0.145;
// Bật trong giai đoạn căn chỉnh: hiện chấm vàng tại tâm từng hotspot.
// Khi đã chốt vị trí, đổi thành false để ẩn toàn bộ chấm mà không xoá hotspot.
const SHOW_PROVINCE_HOTSPOT_MARKERS = false;
const SHOW_PROVINCE_SELECTOR = false;
// Vùng bấm theo đúng bán kính ngoài của chấm vàng (bao gồm cả viền).
const PROVINCE_HOTSPOT_RADIUS = 0.15;
const createProvince = (id, name, polygon, color = '#43e8d8', markerOffset = [0, 0], activities = []) => Object.freeze({
    id, name, polygon, color,
    markerOffset,
    title: `Hoạt động tình nguyện tại ${name}`,
    content: activities.length
        ? `${activities.length} hoạt động đã xác nhận: ${activities.join('; ')}.`
        : `Chọn ${name}. Nội dung, hình ảnh và tư liệu hoạt động của Đoàn trường tại địa phương này sẽ được cập nhật trên màn hình tương tác.`
});

// Các polygon được căn theo khung UV của GLB trong cảnh hiện tại (gốc trái dưới).
// Nút trong bảng chọn là phương án truy cập chính xác cho mọi tỉnh, kể cả tỉnh nhỏ.
const NORTHERN_MAP_HOTSPOTS = Object.freeze([
    createProvince('lai-chau', 'Lai Châu', [[.00,.49],[.10,.80],[.25,.73],[.25,.53],[.16,.45],[.07,.49]], '#d62828', [.07, .15]),
    createProvince('dien-bien', 'Điện Biên', [[.06,.35],[.18,.55],[.24,.48],[.20,.37],[.12,.32]], '#d62828', [0, .025]),
    createProvince('son-la', 'Sơn La', [[.12,.20],[.42,.39],[.35,.52],[.24,.48],[.20,.37],[.12,.32],[.04,.39]], '#d62828', [.075, 0]),
    createProvince('lao-cai', 'Lào Cai', [[.23,.48],[.32,.80],[.45,.85],[.50,.62],[.43,.45],[.34,.43]], '#43b7ac'),
    createProvince('tuyen-quang', 'Tuyên Quang', [[.42,.51],[.50,.98],[.62,.86],[.63,.57],[.54,.45]], '#43b7ac'),
    createProvince('cao-bang', 'Cao Bằng', [[.52,.74],[.61,.92],[.76,.83],[.74,.70],[.62,.67]], '#d62828', [.025, .025]),
    createProvince('thai-nguyen', 'Thái Nguyên', [[.55,.47],[.63,.70],[.73,.67],[.76,.52],[.68,.43]], '#43b7ac', [-.025, 0]),
    createProvince('lang-son', 'Lạng Sơn', [[.71,.48],[.74,.70],[.86,.60],[.88,.47],[.78,.42]], '#d62828', [-.025, 0]),
    createProvince('phu-tho', 'Phú Thọ', [[.39,.28],[.49,.49],[.57,.43],[.59,.30],[.51,.20],[.43,.21]], '#43b7ac'),
    createProvince('ha-noi', 'Hà Nội', [[.52,.22],[.58,.42],[.65,.36],[.64,.25],[.58,.18]], '#d62828', [0, 0], [
        'Bình dân học vụ số tại xã Yên Lãng',
        'Lớp học tình thương tại Làng trẻ SOS và Làng trẻ Birla',
        'Tập huấn tình nguyện viên A80'
    ]),
    createProvince('bac-ninh', 'Bắc Ninh', [[.63,.35],[.67,.50],[.77,.45],[.76,.34],[.69,.30]], '#43b7ac'),
    createProvince('quang-ninh', 'Quảng Ninh', [[.77,.31],[.84,.50],[1.00,.44],[.91,.29],[.84,.26]], '#d62828'),
    createProvince('hai-phong', 'Hải Phòng', [[.67,.15],[.75,.35],[.82,.29],[.80,.17],[.74,.13]], '#43b7ac', [-.025, .025]),
    createProvince('hung-yen', 'Hưng Yên', [[.60,.06],[.67,.25],[.75,.19],[.76,.08],[.69,.03]], '#43b7ac', [.025, .020]),
    createProvince('ninh-binh', 'Ninh Bình', [[.63,.00],[.69,.16],[.76,.13],[.75,.01],[.69,.00]], '#43b7ac', [-.025, .025])
]);

const { resolveMovement } = createRadialCollision({
    rCore: R_CORE,
    rOuter: R_OUTER,
    wallThickness: WALL_THICK,
    margin: MARGIN,
    boundaries: BOUNDARIES,
    boundaryGap: BOUNDARY_GAP
});

function updateJourneyProgress(activeZoneId = 0) {
    if (!elJourneyProgress) return;
    elJourneyProgress.querySelectorAll('.journey-step').forEach(step => {
        const zoneId = Number(step.dataset.zone);
        step.classList.add('is-unlocked');
        step.classList.toggle('is-active', zoneId === activeZoneId);
    });
}

function pointInPolygon(point, vs) {
    let x = point[0], y = point[1]; let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1]; let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function selectProvince(province) {
    updateHeatmapTV(province.title, province.content, province.color);
    provinceMarkerGroups.forEach((markerGroup, provinceId) => {
        markerGroup.visible = provinceId !== province.id;
    });
    elProvinceButtons?.querySelectorAll('.province-button').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.provinceId === province.id);
    });
}

function buildProvinceSelector() {
    NORTHERN_MAP_HOTSPOTS.forEach((province) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'province-button';
        button.dataset.provinceId = province.id;
        button.textContent = province.name;
        button.addEventListener('click', () => selectProvince(province));
        elProvinceButtons.appendChild(button);
    });
}

function getPolygonCenter(polygon) {
    const center = polygon.reduce((sum, point) => {
        sum.x += point[0]; sum.y += point[1];
        return sum;
    }, { x: 0, y: 0 });
    return { x: center.x / polygon.length, y: center.y / polygon.length };
}

function bendMapPoint(x, z, radius) {
    if (!radius) return { x, z, rotationY: 0 };
    const theta = x / radius;
    return {
        x: (radius - z) * Math.sin(theta),
        z: radius - (radius - z) * Math.cos(theta),
        rotationY: -theta
    };
}

function addProvinceHotspotMarkers(mapRoot, curveRadius = null) {
    if (!SHOW_PROVINCE_HOTSPOT_MARKERS) return;

    const dotGeometry = new THREE.CircleGeometry(0.105, 20);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffd21f, side: THREE.DoubleSide });
    const rimGeometry = new THREE.RingGeometry(0.115, 0.15, 20);
    const rimMaterial = new THREE.MeshBasicMaterial({ color: 0x7a4a00, side: THREE.DoubleSide });

    NORTHERN_MAP_HOTSPOTS.forEach((province) => {
        const center = getPolygonCenter(province.polygon);
        const x = (center.x + province.markerOffset[0] - 0.5) * NORTHERN_MAP_SIZE.width;
        const y = (center.y + province.markerOffset[1] - 0.5) * NORTHERN_MAP_SIZE.height;
        const z = NORTHERN_MAP_WALL_CLEARANCE + 0.1;

        const curved = bendMapPoint(x, z, curveRadius);
        const markerGroup = new THREE.Group();
        markerGroup.position.set(curved.x, y, curved.z);
        markerGroup.rotation.y = curved.rotationY;
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.position.z = -0.002;
        markerGroup.add(rim);

        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.userData.provinceId = province.id;
        markerGroup.add(dot);
        mapRoot.add(markerGroup);
        provinceMarkerGroups.set(province.id, markerGroup);
    });
}

function walnutDoorTex() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#6b4429'); gradient.addColorStop(.5, '#7a5133'); gradient.addColorStop(1, '#5e3a22');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 26; index += 1) {
        const x = Math.random() * canvas.width;
        ctx.strokeStyle = `rgba(30,15,6,${Math.random() * .22 + .07})`;
        ctx.lineWidth = Math.random() * 1.8 + .5;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + Math.random() * 14 - 7, 170, x + Math.random() * 14 - 7, 340, x + Math.random() * 10 - 5, 512);
        ctx.stroke();
    }
    [[.14, .08, .42], [.14, .54, .88]].forEach(([left, top, bottom]) => {
        const x = canvas.width * left; const y = canvas.height * top;
        const width = canvas.width * (1 - 2 * left); const height = canvas.height * (bottom - top);
        ctx.strokeStyle = 'rgba(20,10,4,.55)'; ctx.lineWidth = 5; ctx.strokeRect(x, y, width, height);
        ctx.strokeStyle = 'rgba(230,190,140,.35)'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
    });
    return createSRGBCanvasTexture(canvas);
}

function init() {
    initProfileModal();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(ARCHITECTURE_COLORS.ceiling);
    scene.fog = new THREE.Fog(ARCHITECTURE_COLORS.ceiling, 18, 64);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d6b35, 0.92);
    hemiLight.position.set(0, 30, 0); scene.add(hemiLight);
    const ambient = new THREE.AmbientLight(0xffffff, 0.76); scene.add(ambient);

    camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 140);
    camera.position.set(SPAWN_POS.x, EYE_Y, SPAWN_POS.z);
    yaw = Math.PI + Math.atan2(SPAWN_POS.x, -SPAWN_POS.z); 
    pitch = 0; applyCameraRotation();

    // -- THÊM AUDIO LISTENER VÀO CAMERA --
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    audioLoader = new THREE.AudioLoader();

    renderer = createConfiguredRenderer({
        onContextLost: () => { webglContextAvailable = false; },
        onContextRestored: () => {
            webglContextAvailable = true;
            framePolicy.invalidate(4);
        }
    });

    elCanvas = renderer.domElement;
    document.getElementById('canvas-container').appendChild(elCanvas);

    raycaster = new THREE.Raycaster();

    const blocker = document.getElementById('blocker');
    const startBtn = document.getElementById('btn-start');
    
    elHoverDot = document.getElementById('hover-dot');
    elFocusLabel = document.getElementById('focus-label');
    elZoneBanner = document.getElementById('zone-banner');
    elFade = document.getElementById('fade-overlay');
    elZoneFlash = document.getElementById('zone-flash');
    elNowPlaying = document.getElementById('now-playing');
    elTrackName = document.getElementById('np-track-name');
    elMuteBtn = document.getElementById('np-mute-btn');
    elVolDown = document.getElementById('np-vol-down');
    elVolUp = document.getElementById('np-vol-up');
    elProvinceSelector = document.getElementById('province-selector');
    elProvinceButtons = document.getElementById('province-buttons');
    elJourneyProgress = document.getElementById('journey-progress');
    // Bản khung Chủ đề 5 không lấy bản đồ hoặc dữ liệu trưng bày của Chủ đề 3.

    startBtn.addEventListener('click', () => {
        started = true; blocker.style.display = 'none'; 
        document.getElementById('hud-hint').style.display = 'block';
        document.getElementById('hud-toolbar').style.display = 'flex'; 
        elZoneBanner.style.display = 'block';
        elJourneyProgress.style.display = 'flex';
        updateJourneyProgress(0);
        // Bảng tỉnh chỉ xuất hiện sau khi camera thực sự đi vào Cụm 2.
        elProvinceSelector.style.display = 'none';

        // Đánh thức Context Audio (Yêu cầu bắt buộc của trình duyệt)
        if (audioListener.context.state === 'suspended') {
            audioListener.context.resume();
        }

        // Phát ngầm tất cả các nhạc nền cụm đã tải xong (đang ở volume 0)
        // Âm lượng thực tế sẽ do recalcAudioTargets() + vòng lặp fade trong animate() quyết định
        positionalAudios.forEach(entry => {
            if (!entry.sound.isPlaying && entry.sound.buffer) entry.sound.play();
        });
    });

    document.getElementById('btn-guide').addEventListener('click', () => {
        moveForward = moveBackward = moveLeft = moveRight = false;
        velocity.set(0, 0, 0);
        clearInteractionHover();
        document.getElementById('guide-overlay').style.display = 'flex';
    });
    document.getElementById('guide-close').addEventListener('click', () => {
        document.getElementById('guide-overlay').style.display = 'none';
        scheduleHeatmapAutoAdvance(performance.now());
    });
    document.getElementById('btn-reset').addEventListener('click', resetToSpawn);
    document.getElementById('info-close').addEventListener('click', () => {
        document.getElementById('info-overlay').style.display = 'none';
        scheduleHeatmapAutoAdvance(performance.now());
    });
    document.getElementById('document-close').addEventListener('click', closeDocumentReader);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) scheduleHeatmapAutoAdvance(performance.now());
    });

    // ── Điều khiển âm lượng: click icon loa để tắt/bật tiếng, nút +/- để tăng giảm 10%/lần ──
    elMuteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        updateVolumeIcon();
        recalcAudioTargets();
    });
    elVolDown.addEventListener('click', () => setMasterVolume(masterVolume - 0.1));
    elVolUp.addEventListener('click', () => setMasterVolume(masterVolume + 0.1));
    updateVolumeIcon();

    document.addEventListener('keydown', (e) => {
        if (!started) return;
        if (e.code === 'Escape') {
            if (isProfileModalOpen()) { closeProfileModal(); return; }
            if (isDocumentOpen) { closeDocumentReader(); return; }
            const infoOverlay = document.getElementById('info-overlay');
            if (infoOverlay?.style.display === 'flex') {
                infoOverlay.style.display = 'none';
                scheduleHeatmapAutoAdvance(performance.now());
                return;
            }
            const guideOverlay = document.getElementById('guide-overlay');
            if (guideOverlay?.style.display === 'flex') {
                guideOverlay.style.display = 'none';
                return;
            }
        }
        if (isInteractionModalOpen()) return;
        switch (e.code) { case 'KeyW': case 'ArrowUp': moveForward = true; break; case 'KeyA': case 'ArrowLeft': moveLeft = true; break; case 'KeyS': case 'ArrowDown': moveBackward = true; break; case 'KeyD': case 'ArrowRight': moveRight = true; break; }
    });
    document.addEventListener('keyup', (e) => {
        switch (e.code) { case 'KeyW': case 'ArrowUp': moveForward = false; break; case 'KeyA': case 'ArrowLeft': moveLeft = false; break; case 'KeyS': case 'ArrowDown': moveBackward = false; break; case 'KeyD': case 'ArrowRight': moveRight = false; break; }
    });

    elCanvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', onWindowResize);

    buildArchitecture();
    buildCeilings(); buildZoneContents();
}

function applyCameraRotation() {
    camera.rotation.order = 'YXZ'; camera.rotation.y = yaw; camera.rotation.x = pitch; camera.rotation.z = 0;
}

function resetToSpawn() {
    resetTopicDoor(topicDoorState, elFade); velocity.set(0, 0, 0);
    camera.position.set(SPAWN_POS.x, EYE_Y, SPAWN_POS.z); yaw = Math.PI + Math.atan2(SPAWN_POS.x, -SPAWN_POS.z); pitch = 0; applyCameraRotation();
    document.getElementById('info-overlay').style.display = 'none';
    closeProfileModal();
    updateJourneyProgress(0);
    framePolicy.invalidate(3);
}

function onMouseDown(e) {
    if (!started || isInteractionModalOpen() || topicDoorState.controlsLocked || e.button !== 0) return;
    isDragging = true; dragMoved = false; lastMouseX = e.clientX; lastMouseY = e.clientY;
    elCanvas.classList.add('dragging');
}

function onMouseMove(e) {
    if (!started || isInteractionModalOpen() || topicDoorState.controlsLocked) return;
    if (isDragging) {
        const dx = e.clientX - lastMouseX, dy = e.clientY - lastMouseY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        lastMouseX = e.clientX; lastMouseY = e.clientY;
        yaw -= dx * LOOK_SENS; pitch -= dy * LOOK_SENS; pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
        applyCameraRotation();
        framePolicy.invalidate(2);
    } else updateHoverAt(e.clientX, e.clientY);
}

function onMouseUp(e) {
    if (!started || isInteractionModalOpen() || topicDoorState.controlsLocked || e.button !== 0) return;
    elCanvas.classList.remove('dragging');
    if (isDragging && !dragMoved) handleClickAt(e.clientX, e.clientY);
    isDragging = false;
}

function ndcFromClient(clientX, clientY) { return { x: (clientX / window.innerWidth) * 2 - 1, y: -(clientY / window.innerHeight) * 2 + 1 }; }

function isInteractionModalOpen() {
    return isDocumentOpen
        || isProfileModalOpen()
        || document.getElementById('info-overlay')?.style.display === 'flex'
        || document.getElementById('guide-overlay')?.style.display === 'flex';
}

function clearInteractionHover() {
    if (hoveredObject?.userData.type === 'heatmap-tv-nav') {
        const disabled = hoveredObject.userData.disabled;
        hoveredObject.material.emissiveIntensity = disabled ? 0.10 : 0.34;
        hoveredObject.userData.glowMaterial.opacity = disabled ? 0.02 : 0.09;
        hoveredObject.userData.outlineMaterial.opacity = disabled ? 0.30 : 0.92;
    }
    if (hoveredObject?.userData.hoverBorder) hoveredObject.userData.hoverBorder.material.opacity = 0;
    updateVietnamMapHover(null);
    hoveredObject = null;
    if (elFocusLabel) elFocusLabel.style.display = 'none';
    if (elHoverDot) elHoverDot.style.display = 'none';
}

function getAllowedInteractiveHit(clientX, clientY) {
    raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const hits = raycaster.intersectObjects(interactiveObjects, false);
    const hit = hits.find(candidate => candidate.object.visible !== false) || null;
    if (!hit) return null;

    const data = hit.object.userData;
    // Một nút bị khóa hoặc cửa ở ngoài phạm vi phải chặn thao tác tại đúng vị
    // trí đó, không được để ray tiếp tục chọn vật thể xa hơn ở phía sau.
    if (data.disabled) return null;
    if (data.type === 'topic-door') {
        const door = data.door;
        if (!door?.hitArea) return null;
        const dx = camera.position.x - door.hitArea.position.x;
        const dz = camera.position.z - door.hitArea.position.z;
        if (dx * dx + dz * dz > door.interactionRadiusSq) return null;
    }

    const maxDistance = data.interactionDistance ?? DEFAULT_INTERACTION_DISTANCE;
    if (hit.distance > maxDistance) return null;

    const blocker = raycaster.intersectObjects(interactionOccluders, false)
        .find(candidate => candidate.object.visible !== false);
    if (blocker && blocker.distance + INTERACTION_OCCLUSION_EPSILON < hit.distance) return null;
    return hit;
}

function updateHoverAt(clientX, clientY) {
    const hit = getAllowedInteractiveHit(clientX, clientY);
    const hitObj = hit?.object || null;

    if (hitObj !== hoveredObject) {
        if (hoveredObject?.userData.type === 'heatmap-tv-nav') {
            const disabled = hoveredObject.userData.disabled;
            hoveredObject.material.emissiveIntensity = disabled ? 0.10 : 0.34;
            hoveredObject.userData.glowMaterial.opacity = disabled ? 0.02 : 0.09;
            hoveredObject.userData.outlineMaterial.opacity = disabled ? 0.30 : 0.92;
        }
        if (hoveredObject?.userData.hoverBorder) {
            hoveredObject.userData.hoverBorder.material.opacity = 0;
        }
        updateVietnamMapHover(null);
        hoveredObject = hitObj;
        if (hoveredObject) {
            if (hoveredObject.userData.type === 'heatmap-tv-nav' && !hoveredObject.userData.disabled) {
                hoveredObject.material.emissiveIntensity = 0.68;
                hoveredObject.userData.glowMaterial.opacity = 0.18;
                hoveredObject.userData.outlineMaterial.opacity = 1;
            }
            if (hoveredObject.userData.hoverBorder) {
                hoveredObject.userData.hoverBorder.material.opacity = 1;
            }
            updateVietnamMapHover(hoveredObject);
            elFocusLabel.style.display = 'block'; elHoverDot.style.display = 'block';
        }
        else { elFocusLabel.style.display = 'none'; elHoverDot.style.display = 'none'; }
    }
    if (hoveredObject) {
        const d = hoveredObject.userData;
        const province = d.type === 'map-panel' && hit?.uv ? getProvinceAtUV(hit.uv.x, hit.uv.y) : null;
        elFocusLabel.textContent = province ? province.name : (d.title || 'Chi tiết');
        elFocusLabel.style.display = 'block';
        elHoverDot.style.display = 'block';
    }
    if (hoveredObject) { elFocusLabel.style.left = clientX + 'px'; elFocusLabel.style.top = clientY + 'px'; elHoverDot.style.left = clientX + 'px'; elHoverDot.style.top = clientY + 'px'; }
}

function handleClickAt(clientX, clientY) {
    const hit = getAllowedInteractiveHit(clientX, clientY);
    if (hit) {
        const d = hit.object.userData;
        if (d.profile) {
            moveForward = moveBackward = moveLeft = moveRight = false;
            velocity.set(0, 0, 0);
            clearInteractionHover();
            openProfileModal(d.profile);
        } else if (d.type === 'artifact' || d.type === 'infographic' || d.type === 'tv-panel') {
            showInfoPanel(d);
        } else if (d.type === 'pdf-document') {
            openDocumentReader(d);
        } else if (d.type === 'map-panel') {
            checkMapHotspotClick(hit.uv.x, hit.uv.y);
        } else if (d.type === 'vietnam-province') {
            handleVietnamMapSelection(d);
        } else if (d.type === 'heatmap-tv-nav' && !d.disabled) {
            navigateProvinceActivity(d.direction);
        } else if (d.type === 'heatmap-tv') {
            handleHeatmapTVClick(hit.uv);
        } else if (d.type === 'vietnam-map-reset') {
            focusVietnamRegion(null);
        } else if (d.type === 'topic-door') {
            openTopicDoor(topicDoorState, d.door);
        }
    }
}

function openDocumentReader(d) {
    isDocumentOpen = true;
    moveForward = moveBackward = moveLeft = moveRight = false;
    velocity.set(0, 0, 0);
    clearInteractionHover();
    document.getElementById('document-title').textContent = d.title || 'Tài liệu';
    document.getElementById('document-page-count').textContent = `${d.pageCount || ''} TRANG`;
    document.getElementById('document-frame').src = `${d.pdfUrl}#page=1&zoom=page-width`;
    document.getElementById('document-overlay').style.display = 'flex';
    elHoverDot.style.display = 'none';
    elFocusLabel.style.display = 'none';
}

function closeDocumentReader() {
    if (!isDocumentOpen) return;
    isDocumentOpen = false;
    document.getElementById('document-overlay').style.display = 'none';
    document.getElementById('document-frame').src = 'about:blank';
    scheduleHeatmapAutoAdvance(performance.now());
}

function publicSourceLabel(source = '') {
    return String(source)
        .replace(/\s*[·;,-]?\s*Excel\s+dòng\s+\d+/giu, '')
        .replace(/\s*[·;,-]?\s*(?:nguồn(?:\s+hyperlink)?|trong)\s+cột\s+G(?:\s*[·;,-]\s*[A-Z]{2}-\d+)?/giu, '')
        .replace(/\s*[·;,-]?\s*(?:trích\s+trong\s+)?DOCX\s+cập nhật(?:\s*[·;,-]\s*[A-Z]{2}-\d+)?/giu, '')
        .replace(/\s*\(theo\s+(?:Excel|DOCX)\s+cập nhật\)\.?/giu, '')
        .replace(/^Ổ cứng tư liệu$/iu, 'Tư liệu lưu trữ Đoàn trường')
        .replace(/\s*[·;,-]\s*$/u, '')
        .trim();
}

function showInfoPanel(d) {
    moveForward = moveBackward = moveLeft = moveRight = false;
    velocity.set(0, 0, 0);
    clearInteractionHover();
    const hex = '#' + (d.color || GOLD).toString(16).padStart(6, '0');
    const panel = document.getElementById('info-panel');
    panel.classList.toggle('has-image', Boolean(d.imageUrl));
    panel.classList.toggle('photo-caption-mode', d.displayMode === 'photo-caption');
    panel.classList.toggle('infographic-mode', d.displayMode === 'infographic');
    panel.style.setProperty('--accent', hex);
    document.getElementById('info-zone').textContent = d.zoneName || '';
    document.getElementById('info-zone').style.color = hex;
    document.getElementById('info-code').textContent = d.code || '';
    document.getElementById('info-title').textContent = d.title || '';
    const publicSource = publicSourceLabel(d.source);
    const metaParts = []; if (d.year) metaParts.push(d.year); if (publicSource) metaParts.push(publicSource);
    document.getElementById('info-meta').textContent = metaParts.join(' · ');
    document.getElementById('info-content').textContent = d.content || '';
    
    const imgCont = document.getElementById('info-img-container');
    const imgEl = document.getElementById('info-img');
    if (d.imageUrl) {
        // Tên ảnh tư liệu có dấu, khoảng trắng và dấu ngoặc. Mã hóa URL trước khi
        // đưa vào thẻ <img> để modal dùng đúng cùng tệp mà TextureLoader đã đọc.
        imgEl.src = encodeURI(d.imageUrl);
        imgCont.style.display = 'block';
    } else {
        imgCont.style.display = 'none';
        imgEl.src = '';
    }

    panel.querySelector('.info-extra')?.remove();
    const structuredGallery = Array.isArray(d.galleryItems) ? d.galleryItems : [];
    const gallery = structuredGallery.length
        ? structuredGallery
        : [d.imageUrl, ...(d.gallery || [])]
            .filter((value, index, values) => value && values.indexOf(value) === index)
            .map(imageUrl => ({ imageUrl, title: d.title, content: d.content, year: d.year }));
    const links = Array.isArray(d.links) ? d.links : [];
    const documents = Array.isArray(d.documents) ? d.documents : [];
    if (gallery.length > 1 || links.length || documents.length) {
        const extra = document.createElement('div');
        extra.className = 'info-extra';
        if (gallery.length > 1) {
            const nav = document.createElement('div');
            nav.className = 'info-gallery-nav';
            gallery.forEach((galleryItem, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = String(index + 1).padStart(2, '0');
                button.className = index === (d.galleryIndex || 0) ? 'is-active' : '';
                button.addEventListener('click', () => {
                    imgEl.src = encodeURI(galleryItem.imageUrl); imgCont.style.display = 'block';
                    document.getElementById('info-title').textContent = galleryItem.title || '';
                    document.getElementById('info-content').textContent = galleryItem.content || '';
                    document.getElementById('info-meta').textContent = galleryItem.year || '';
                    nav.querySelectorAll('button').forEach(item => item.classList.toggle('is-active', item === button));
                });
                nav.appendChild(button);
            });
            extra.appendChild(nav);
        }
        const actions = document.createElement('div');
        actions.className = 'info-resource-actions';
        links.forEach(link => {
            const anchor = document.createElement('a');
            anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
            anchor.textContent = link.label || 'Mở nguồn tham khảo'; actions.appendChild(anchor);
        });
        documents.forEach(documentItem => {
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = documentItem.label || 'Đọc tài liệu';
            button.addEventListener('click', () => openDocumentReader({
                title: documentItem.title || d.title, pdfUrl: documentItem.url, pageCount: documentItem.pageCount
            }));
            actions.appendChild(button);
        });
        if (actions.childElementCount) extra.appendChild(actions);
        panel.appendChild(extra);
    }

    document.getElementById('info-overlay').style.display = 'flex';
}

// --- HÀM TẠO GIÁ SÁCH 3D (Cụm 3: NCKH) ---
function createBookshelf(position, rotationY) {
    const group = new THREE.Group();
    
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.7 });
    const shelfW = 2.0, shelfH = 3.5, shelfD = 0.4;
    
    // Khung chính
    const back = new THREE.Mesh(new THREE.BoxGeometry(shelfW, shelfH, 0.05), shelfMat);
    back.position.set(0, shelfH/2, -shelfD/2);
    group.add(back);
    
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.05, shelfH, shelfD), shelfMat);
    left.position.set(-shelfW/2, shelfH/2, 0);
    group.add(left);
    
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.05, shelfH, shelfD), shelfMat);
    right.position.set(shelfW/2, shelfH/2, 0);
    group.add(right);
    
    // 5 kệ sách
    for (let i = 0; i < 5; i++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(shelfW, 0.04, shelfD), shelfMat);
        shelf.position.set(0, i * 0.7 + 0.02, 0);
        group.add(shelf);
    }
    
    // Sách trên mỗi kệ (mỗi kệ 4-5 cuốn)
    const bookColors = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x1abc9c, 0xe74c3c, 0x3498db];
    for (let shelf = 0; shelf < 4; shelf++) {
        const numBooks = 4 + Math.floor(Math.random() * 2);
        let x = -shelfW/2 + 0.15;
        for (let b = 0; b < numBooks; b++) {
            const bw = 0.08 + Math.random() * 0.12;
            const bh = 0.45 + Math.random() * 0.15;
            const bd = 0.25 + Math.random() * 0.1;
            const bookMat = new THREE.MeshStandardMaterial({ 
                color: bookColors[Math.floor(Math.random() * bookColors.length)], 
                roughness: 0.8 
            });
            const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bookMat);
            book.position.set(x + bw/2, shelf * 0.7 + 0.02 + bh/2 + 0.02, 0);
            group.add(book);
            x += bw + 0.02;
        }
    }
    
    group.position.set(position.x, position.y || 0, position.z);
    if (rotationY) group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

// --- HÀM TẠO BỤC PHÁT BIỂU 3D (Cụm 1: Yêu nước) ---
function createPodium(position, rotationY) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3a2a, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.5, roughness: 0.3 });
    
    // Bệ podium
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.6), goldMat);
    base.position.set(0, 0.075, 0);
    group.add(base);
    
    // Thân podium (hình tam giác cắt)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), woodMat);
    body.position.set(0, 0.65, 0);
    group.add(body);
    
    // Mặt nghiêng để đặt tài liệu
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.45), woodMat);
    top.position.set(0, 1.2, 0.05);
    top.rotation.x = -0.2;
    group.add(top);
    
    // Viền vàng trên
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.52), goldMat);
    trim.position.set(0, 1.22, 0.05);
    trim.rotation.x = -0.2;
    group.add(trim);
    
    // Logo tròn trên mặt (đại diện logo Đoàn)
    const logoGeo = new THREE.CircleGeometry(0.12, 24);
    const logoMat = new THREE.MeshStandardMaterial({ color: 0xe3000f, side: THREE.DoubleSide });
    const logo = new THREE.Mesh(logoGeo, logoMat);
    logo.position.set(0, 1.23, 0.05);
    logo.rotation.x = -Math.PI/2 - 0.2;
    group.add(logo);
    
    group.position.set(position.x, position.y || 0, position.z);
    if (rotationY) group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function buildArcWall(radius, a0, a1, skipRanges, height, thickness, color, steps, isCore = false) {
    const mat = isCore ? architectureMaterials.innerWall : architectureMaterials.wall;
    for (let i = 0; i < steps; i++) {
        const aS = a0 + (a1 - a0) * i / steps; const aE = a0 + (a1 - a0) * (i + 1) / steps; const aMid = (aS + aE) / 2;
        let inGap = false; for (const [s0, s1] of skipRanges) if (aMid >= s0 && aMid <= s1) inGap = true;
        if (inGap) continue;
        const x0 = Math.cos(aS) * radius, z0 = Math.sin(aS) * radius; const x1 = Math.cos(aE) * radius, z1 = Math.sin(aE) * radius;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; const len = Math.hypot(x1 - x0, z1 - z0) * 1.2; const rotY = -Math.atan2(z1 - z0, x1 - x0);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, height, thickness), mat);
        wall.position.set(mx, height / 2, mz); wall.rotation.y = rotY; scene.add(wall);
        wall.userData.interactionOccluder = true;
        interactionOccluders.push(wall);
    }
}

function buildRadialWall(angle, rInner, rOuter, skipRanges, height, thickness, steps) {
    const mat = architectureMaterials.wall;
    const accentMat = architectureMaterials.trim;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for (let i = 0; i < steps; i++) {
        const r0 = rInner + (rOuter - rInner) * i / steps; const r1 = rInner + (rOuter - rInner) * (i + 1) / steps; const rmid = (r0 + r1) / 2;
        let inGap = false; for (const [g0, g1] of skipRanges) if (rmid >= g0 && rmid <= g1) inGap = true;
        if (inGap) continue;
        const len = r1 - r0; const mx = ca * rmid, mz = sa * rmid;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, len), mat);
        wall.position.set(mx, height / 2, mz); wall.rotation.y = Math.PI / 2 - angle; scene.add(wall);
        wall.userData.interactionOccluder = true;
        interactionOccluders.push(wall);
        if (accentMat && i === 0) {
            const accentRadius = rInner - .012;
            const accent = new THREE.Mesh(new THREE.BoxGeometry(thickness + .025, height + .01, .022), accentMat);
            accent.position.set(ca * accentRadius, height / 2, sa * accentRadius);
            accent.rotation.y = Math.PI / 2 - angle;
            scene.add(accent);
        }
    }
}

function buildBronzeCoreBand(angle) {
    const bronzeMat = architectureMaterials.trim;
    const bandRadius = R_CORE + WALL_THICK / 2 + 0.025;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, WALL_H, 0.05), bronzeMat);
    band.position.set(Math.cos(angle) * bandRadius, WALL_H / 2, Math.sin(angle) * bandRadius);
    band.rotation.y = faceCoreRotY(angle);
    band.receiveShadow = true;
    band.userData.type = 'zone-boundary-band';
    scene.add(band);
}

function buildBaseboardStripe(radius, a0, a1, steps) {
    const tileMat = architectureMaterials.baseboard;
    const groutMat = architectureMaterials.baseboardGrout;
    const capMat = architectureMaterials.trim;
    // Tỉ lệ tham khảo nẹp Chủ đề 5: nền mạch xám, ô ốp sáng và nẹp kim loại
    // mảnh. Tổng cao 0.40, xấp xỉ một nửa nẹp cũ (0.84).
    const backingHeight = .36;
    const tileHeight = .30;
    const capHeight = .06;
    for (let i = 0; i < steps; i++) {
        const aS = a0 + (a1 - a0) * i / steps; const aE = a0 + (a1 - a0) * (i + 1) / steps;
        const x0 = Math.cos(aS) * radius, z0 = Math.sin(aS) * radius; const x1 = Math.cos(aE) * radius, z1 = Math.sin(aE) * radius;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; const len = Math.hypot(x1 - x0, z1 - z0) * 1.2; const rotY = -Math.atan2(z1 - z0, x1 - x0);
        const backing = new THREE.Mesh(
            new THREE.BoxGeometry(len, backingHeight, WALL_THICK + .055),
            groutMat
        );
        backing.position.set(mx, backingHeight / 2, mz);
        backing.rotation.y = rotY;
        scene.add(backing);

        const tile = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(.2, len - .035), tileHeight, WALL_THICK + .075),
            tileMat
        );
        tile.position.set(mx, .17, mz);
        tile.rotation.y = rotY;
        scene.add(tile);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(len + .025, capHeight, WALL_THICK + .1), capMat);
        cap.position.set(mx, .37, mz);
        cap.rotation.y = rotY;
        scene.add(cap);
    }
}

function buildCrownStripe(radius, a0, a1, steps) {
    for (let i = 0; i < steps; i++) {
        const aS = a0 + (a1 - a0) * i / steps;
        const aE = a0 + (a1 - a0) * (i + 1) / steps;
        const x0 = Math.cos(aS) * radius, z0 = Math.sin(aS) * radius;
        const x1 = Math.cos(aE) * radius, z1 = Math.sin(aE) * radius;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const len = Math.hypot(x1 - x0, z1 - z0) * 1.2;
        const crown = new THREE.Mesh(
            new THREE.BoxGeometry(len, .18, WALL_THICK + .1),
            architectureMaterials.trim
        );
        crown.position.set(mx, WALL_H - .12, mz);
        crown.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        scene.add(crown);
    }
}

let lotusWallMaterial = null;

function getLotusWallMaterial() {
    if (lotusWallMaterial) return lotusWallMaterial;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Cánh giữa và hai cánh bên được tách nét, không dùng đường chân chạy
    // liên tục nên khi lặp quanh phòng không còn cảm giác một vệt thẳng.
    ctx.beginPath();
    ctx.moveTo(128, 133);
    ctx.bezierCurveTo(91, 102, 94, 55, 128, 25);
    ctx.bezierCurveTo(162, 55, 165, 102, 128, 133);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(122, 134);
    ctx.bezierCurveTo(75, 130, 47, 98, 42, 62);
    ctx.bezierCurveTo(83, 70, 111, 91, 122, 134);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(134, 134);
    ctx.bezierCurveTo(181, 130, 209, 98, 214, 62);
    ctx.bezierCurveTo(173, 70, 145, 91, 134, 134);
    ctx.stroke();

    const texture = createSRGBCanvasTexture(canvas);
    texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() || 4;
    lotusWallMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: .40,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
    return lotusWallMaterial;
}

function buildLotusWallBand(radius, a0, a1, faceInnerWall = false) {
    const material = getLotusWallMaterial();
    const arcLength = Math.abs(a1 - a0) * radius;
    const count = Math.max(1, Math.floor(arcLength / 1.18));
    const inset = Math.min(.045, Math.abs(a1 - a0) * .04);
    const start = a0 + inset;
    const end = a1 - inset;
    for (let index = 0; index < count; index += 1) {
        const t = (index + .5) / count;
        const angle = THREE.MathUtils.lerp(start, end, t);
        const lotus = new THREE.Mesh(new THREE.PlaneGeometry(.54, .34), material);
        lotus.position.set(Math.cos(angle) * radius, WALL_H - 1.08, Math.sin(angle) * radius);
        lotus.rotation.y = faceCoreRotY(angle) + (faceInnerWall ? Math.PI : 0);
        lotus.renderOrder = 2;
        lotus.userData.type = 'lotus-wall-pattern';
        scene.add(lotus);
    }
}

let floralVineMaterial = null;

function getFloralVineMaterial() {
    if (floralVineMaterial) return floralVineMaterial;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1536;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const GOLD_VINE = 'rgba(184,152,56,.72)';
    const GOLD_FLOWER = 'rgba(212,175,55,.82)';
    const BLUE_LEAF = 'rgba(85,91,192,.58)';
    const BLUE_FLOWER = 'rgba(114,121,220,.62)';

    const vine = (points, width = 12) => {
        ctx.strokeStyle = GOLD_VINE;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 6) {
            ctx.bezierCurveTo(points[i], points[i + 1], points[i + 2], points[i + 3], points[i + 4], points[i + 5]);
        }
        ctx.stroke();
    };

    const leaf = (x, y, length, width, rotation, color = BLUE_LEAF) => {
        ctx.save();
        ctx.translate(x, y); ctx.rotate(rotation);
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(212,175,55,.46)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-length / 2, 0);
        ctx.quadraticCurveTo(0, -width, length / 2, 0);
        ctx.quadraticCurveTo(0, width, -length / 2, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-length * .32, 0); ctx.lineTo(length * .34, 0); ctx.stroke();
        ctx.restore();
    };

    const flower = (x, y, radius, petals = 7, rotation = 0, color = BLUE_FLOWER) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
        for (let i = 0; i < petals; i += 1) {
            ctx.save(); ctx.rotate(i * Math.PI * 2 / petals);
            ctx.fillStyle = color;
            ctx.strokeStyle = GOLD_FLOWER;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(0, -radius * .18);
            ctx.bezierCurveTo(-radius * .28, -radius * .4, -radius * .22, -radius * .95, 0, -radius);
            ctx.bezierCurveTo(radius * .22, -radius * .95, radius * .28, -radius * .4, 0, -radius * .18);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = GOLD_FLOWER;
        ctx.beginPath(); ctx.arc(0, 0, radius * .19, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    };

    const bud = (x, y, rotation = 0) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
        ctx.fillStyle = BLUE_FLOWER; ctx.strokeStyle = GOLD_FLOWER; ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-22, 15); ctx.quadraticCurveTo(-12, -44, 0, -56);
        ctx.quadraticCurveTo(18, -35, 24, 12); ctx.quadraticCurveTo(0, 29, -22, 15);
        ctx.fill(); ctx.stroke(); ctx.restore();
    };

    // Ba nhánh bất đối xứng dạng S/C mô phỏng nhịp hoa dây jacquard.
    vine([70, 1480, 210, 1370, 140, 1160, 350, 1050, 560, 940, 320, 760, 520, 650, 720, 550, 660, 360, 900, 250], 13);
    vine([940, 1430, 760, 1320, 870, 1130, 650, 1040, 480, 960, 710, 820, 570, 710], 11);
    vine([20, 650, 170, 560, 120, 400, 300, 315, 455, 245, 390, 100, 560, 30], 10);
    vine([1010, 760, 840, 690, 900, 520, 720, 445, 585, 370, 770, 230, 680, 115], 10);

    // Các vòng xoắn ngắn đặc trưng nhưng không nối thành lưới.
    ctx.strokeStyle = GOLD_VINE; ctx.lineWidth = 11;
    [[330,1050,78,1.1,5.5],[650,1040,70,.2,4.8],[300,315,62,.4,5.3],[720,445,66,.1,5.1],[570,710,58,.8,5.7]].forEach(([x,y,r,a0,a1]) => {
        ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
    });

    flower(348, 1048, 64, 8, .12);
    flower(706, 824, 54, 7, -.18, 'rgba(73,81,180,.66)');
    flower(298, 315, 48, 7, .2);
    flower(720, 446, 50, 8, -.1);
    flower(565, 1320, 43, 6, .1);
    leaf(236, 1240, 112, 34, -.72);
    leaf(468, 945, 120, 38, .22);
    leaf(724, 1190, 105, 32, -.28);
    leaf(195, 505, 108, 34, -.4);
    leaf(825, 600, 116, 35, .55);
    leaf(520, 590, 98, 30, -.7);
    bud(875, 290, .55);
    bud(140, 900, -.65);
    bud(850, 1370, .75);

    const texture = createSRGBCanvasTexture(canvas);
    texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() || 4;
    floralVineMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: .24,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
    return floralVineMaterial;
}

function buildFloralVineField(radius, a0, a1, faceInnerWall = false) {
    const material = getFloralVineMaterial();
    const curveRadius = faceInnerWall ? -radius : radius;
    const arcLength = Math.abs(a1 - a0) * radius;
    const count = Math.max(1, Math.ceil(arcLength / 4.35));
    for (let index = 0; index < count; index += 1) {
        const t = (index + .5) / count;
        const angle = THREE.MathUtils.lerp(a0, a1, t);
        const width = 4.55;
        const height = 7.05;
        const geometry = new THREE.PlaneGeometry(width, height, 24, 1);
        bendGeometry(geometry, curveRadius);
        const watermark = new THREE.Mesh(geometry, material);
        watermark.position.set(Math.cos(angle) * radius, 4.8 + (index % 3 - 1) * .22, Math.sin(angle) * radius);
        watermark.rotation.y = faceCoreRotY(angle) + (faceInnerWall ? Math.PI : 0);
        watermark.rotation.z = index % 2 === 0 ? -.025 : .025;
        watermark.scale.x = index % 2 === 0 ? 1 : -1;
        watermark.renderOrder = -1;
        watermark.userData.type = 'floral-vine-wall-pattern';
        scene.add(watermark);
    }
}

function buildArchitecture() {
    const floorMat = architectureMaterials.floor;
    
    // --- 1. SẢNH TRUNG TÂM ---
    const coreFloor = new THREE.Mesh(new THREE.CircleGeometry(R_CORE, 56), floorMat);
    coreFloor.rotation.x = -Math.PI / 2; scene.add(coreFloor);

    // Tường lõi đóng kín 360°, không còn lối đi xuyên vào vòng tròn trung tâm.
    buildArcWall(R_CORE, 0, Math.PI * 2, [], WALL_H, WALL_THICK, ARCHITECTURE_COLORS.wall, 56, true);
    buildBaseboardStripe(R_CORE + WALL_THICK / 2 + .04, 0, Math.PI * 2, 56);
    buildCrownStripe(R_CORE + WALL_THICK / 2 + .04, 0, Math.PI * 2, 56);
    // Giữ tường lõi trung tâm sạch, không phủ lớp thảm xanh và họa tiết hoa dây.

    // --- 2. CÁC CỤM PHÒNG (ZONES) ---
    ZONES.filter(zone => zone.surface === 'outer').forEach(zone => {
        buildRingFloor(R_CORE, R_OUTER, zone.a0, zone.a1, floorMat, 40, scene);
        const outerStart = Math.abs(zone.a0 + Math.PI / 2) < .001 ? zone.a0 + ENTRANCE_HALF_ANGLE : zone.a0;
        const outerEnd = Math.abs(zone.a1 - Math.PI * 3 / 2) < .001 ? zone.a1 - ENTRANCE_HALF_ANGLE : zone.a1;
        buildArcWall(R_OUTER, outerStart, outerEnd, [], WALL_H, WALL_THICK, ARCHITECTURE_COLORS.wall, 26);
        buildBaseboardStripe(R_OUTER - WALL_THICK / 2 - 0.04, outerStart, outerEnd, 26);
        buildCrownStripe(R_OUTER - WALL_THICK / 2 - 0.04, outerStart, outerEnd, 26);
        // Giữ mặt tường kem sạch đúng ngôn ngữ kiến trúc của cd3_1.

    });

    // Sảnh cửa là một hình quạt độc lập: rộng ở tường ngoài và thu dần
    // về tường lõi theo đúng hai cạnh hướng tâm của khoảng mở cửa.
    const entranceFloorMat = architectureMaterials.floor;
    const entranceFloor = createAnnularSectorMesh(
        R_CORE, R_OUTER,
        -Math.PI / 2 - ENTRANCE_HALF_ANGLE,
        -Math.PI / 2 + ENTRANCE_HALF_ANGLE,
        .012, entranceFloorMat, 28, scene
    );
    entranceFloor.name = 'entrance-radial-sector-floor';

    // Chỉ giữ hai nẹp phân cách Cụm 1–2 và Cụm 2–3. Cung tường nhỏ đối diện
    // cửa chính được để liền mạch dành cho bảng lời dẫn tổng quát.
    BOUNDARIES.forEach((angle) => {
        // Nẹp đồng rộng 0,2 áp trên mặt ngoài tường lõi tại ranh giới cụm.
        buildBronzeCoreBand(angle);
        // Vách ngắn nhận diện ranh giới khu nhưng không khóa tuyến tham quan vòng tròn.
        buildRadialWall(angle, R_OUTER - BOUNDARY_WALL_LENGTH, R_OUTER, [], WALL_H, WALL_THICK, 1);
    });

    createOuterEntranceDoor();
}

function createOuterEntranceDoor() {
    const doorW = 4.4; const doorH = 5.0; const gap = 0.06;
    const leafW = doorW / 2 - gap;
    const wallZ = -R_OUTER;
    const frameZ = wallZ - 0.02;
    const leafZ = wallZ - 0.16;
    const gold = architectureMaterials.trim;
    const wood = new THREE.MeshStandardMaterial({ map: walnutDoorTex(), roughness: 0.5 });
    const wallMaterial = architectureMaterials.wall;

    // Lấp phần phía trên cửa nhưng giữ trống toàn bộ chiều rộng lối vào bên dưới.
    const openingW = 2 * R_OUTER * Math.sin(ENTRANCE_HALF_ANGLE);
    const upperWallH = WALL_H - doorH - 0.3;
    const upperWall = new THREE.Mesh(new THREE.BoxGeometry(openingW, upperWallH, WALL_THICK), wallMaterial);
    upperWall.position.set(0, doorH + 0.3 + upperWallH / 2, wallZ);
    scene.add(upperWall);
    upperWall.userData.interactionOccluder = true;
    interactionOccluders.push(upperWall);

    // Phủ kín hai khoảng chuyển tiếp từ tường cong tới sát khung cửa. Trước đây
    // hai khoảng này để lộ mảng sáng nên tường thảm xanh trông bị tách khỏi cửa.
    const framedDoorW = doorW + 0.6;
    const sideFillW = Math.max(0, (openingW - framedDoorW) / 2);
    [-1, 1].forEach(side => {
        const sideFill = new THREE.Mesh(
            new THREE.BoxGeometry(sideFillW + 0.06, doorH + 0.3, WALL_THICK),
            wallMaterial
        );
        sideFill.position.set(
            side * (framedDoorW / 2 + sideFillW / 2),
            (doorH + 0.3) / 2,
            wallZ
        );
        scene.add(sideFill);
        sideFill.userData.interactionOccluder = true;
        interactionOccluders.push(sideFill);
    });

    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.3, doorH + 0.3, 0.34), gold);
    leftFrame.position.set(-doorW / 2 - 0.15, (doorH + 0.3) / 2, frameZ); scene.add(leftFrame);
    const rightFrame = leftFrame.clone(); rightFrame.position.x = doorW / 2 + 0.15; scene.add(rightFrame);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.6, 0.3, 0.34), gold);
    lintel.position.set(0, doorH + 0.3, frameZ); scene.add(lintel);

    let leftPivot = null;
    let rightPivot = null;
    [-1, 1].forEach(side => {
        const pivot = new THREE.Group();
        pivot.position.set(side * doorW / 2, doorH / 2, leafZ);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH, 0.08), wood);
        leaf.position.set(-side * (leafW / 2 + gap / 2), 0, 0);
        pivot.add(leaf);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 12), gold);
        handle.position.set(-side * (leafW - 0.16), 0, 0.09);
        pivot.add(handle);
        scene.add(pivot);
        if (side < 0) leftPivot = pivot;
        else rightPivot = pivot;
    });

    const hoverGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(doorW + 0.7, doorH + 0.55));
    const hoverBorder = new THREE.LineSegments(hoverGeometry, new THREE.LineBasicMaterial({
        color: 0xf4b223,
        transparent: true,
        opacity: 0,
        depthTest: false
    }));
    hoverBorder.position.set(0, doorH / 2 + 0.1, wallZ + 0.24);
    hoverBorder.renderOrder = 12;
    scene.add(hoverBorder);

    const hitArea = new THREE.Mesh(
        new THREE.BoxGeometry(doorW + 0.55, doorH + 0.45, 0.45),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
    );
    hitArea.position.set(0, doorH / 2, wallZ + 0.18);
    scene.add(hitArea);

    const door = registerTopicDoor(topicDoorState, {
        title: `Mở cửa · ${MAIN_DOOR_TARGET.title}`,
        targetUrl: MAIN_DOOR_TARGET.url,
        leftPivot,
        rightPivot,
        hitArea,
        hoverBorder,
        entryPoint: new THREE.Vector3(0, EYE_Y, -17.82),
        insidePoint: new THREE.Vector3(0, EYE_Y, -18.48),
        exitPoint: new THREE.Vector3(0, EYE_Y, -20.6),
        // Chỉ cho hotspot cửa tham gia hover/click khi người xem thực sự ở gần cửa.
        // Tránh raycast xuyên TV/tường lõi rồi bắt nhầm cửa phía sau.
        interactionRadiusSq: 3.8 * 3.8,
        entryRadiusSq: 0.38 * 0.38,
        transitionDuration: 1.85
    });
    hitArea.userData = {
        type: 'topic-door',
        title: door.title,
        door,
        hoverBorder
    };
    interactiveObjects.push(hitArea);
    return door;
}

function createTV(angle, radius, y, index) {
    const w = 3.2, h = 1.8;
    const geo = new THREE.PlaneGeometry(w, h, 24, 1);
    bendGeometry(geo, radius);
    
    // Đã thay đổi đường link video sang nguồn cho phép CORS và xử lý lỗi Promise
    const video = document.createElement('video');
    video.src = MEDIA_ASSETS.lobbyVideo;
    video.loop = true; video.muted = true; video.playsInline = true; video.crossOrigin = 'anonymous';
    
    document.getElementById('btn-start').addEventListener('click', () => {
        video.play().catch(e => console.warn(`Màn hình số ${index} chưa tải được video:`, e));
    });

    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle)*radius, y, Math.sin(angle)*radius);
    mesh.rotation.y = faceCoreRotY(angle);
    
    const fGeo = new THREE.BoxGeometry(w+0.1, h+0.1, 0.1, 24, 1, 1);
    fGeo.translate(0,0,-0.06);
    bendGeometry(fGeo, radius);
    const frame = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({color: 0x111, roughness: 0.2}));
    frame.position.copy(mesh.position); frame.rotation.copy(mesh.rotation);
    
    scene.add(mesh); scene.add(frame);
    
    mesh.userData = { 
        type: 'tv-panel', title: `MÀN HÌNH TƯƠNG TÁC SỐ ${index}`, zoneName: 'SẢNH TRUNG TÂM', color: GOLD,
        content: `Video tư liệu về phong trào và hoạt động tiêu biểu của Đoàn thanh niên. Nhấp chuột vào màn hình để phóng to.`
    };
    interactiveObjects.push(mesh);
}

// --- HÀM TẠO INFOGRAPHIC LỚN TRÀN TƯỜNG (Sảnh trung tâm) ---
function createWallInfographic(radius, y) {
    const c = document.createElement('canvas');
    c.width = 3200; c.height = 1200;
    const ctx = c.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#1a0a0a');
    grad.addColorStop(0.5, '#2d0a0a');
    grad.addColorStop(1, '#1a0505');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    // Viền vàng
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, c.width - 40, c.height - 40);

    // Header区域
    ctx.fillStyle = '#e3000f';
    ctx.fillRect(0, 0, c.width, 200);

    // Logo vòng tròn
    ctx.beginPath();
    ctx.arc(160, 100, 60, 0, Math.PI * 2);
    ctx.fillStyle = '#fff200';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(160, 100, 50, 0, Math.PI * 2);
    ctx.fillStyle = '#e3000f';
    ctx.fill();
    ctx.fillStyle = '#fff200';
    ctx.font = '900 36px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ĐHSP', 160, 100);

    // Tiêu đề chính
    ctx.fillStyle = '#fff200';
    ctx.font = '900 64px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.fillText('PHÒNG TRUYỀN THỐNG SỐ', c.width / 2, 80);
    ctx.fillStyle = '#d6b46a';
    ctx.font = '700 36px ' + UI_FONT;
    ctx.fillText('TRƯỜNG ĐẠI HỌC SƯ PHẠM HÀ NỘI', c.width / 2, 145);

    // Dòng kẻ vàng
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(400, 190, c.width - 800, 3);

    // 3 cột nội dung
    const colW = 900;
    const colX = [150, 1150, 2150];
    const titles = ['LỊCH SỬ TRUYỀN THỐNG', 'PHONG TRÀO TIÊU BIỂU', 'TÀI NĂNG & KHỞI NGHIỆP'];
    const contents = [
        'Trường Đại học Sư phạm Hà Nội - cái nôi đào tạo教师,\nđược thành lập năm 1954. Hơn 70 năm xây dựng và phát triển,\ntrường đã đào tạo hàng trăm ngàn教师 cho đất nước.',
        'Từ phong trào "Ba sẵn sàng" đến "Mùa hè xanh",\nthanh niên Sư phạm luôn xung phong đi đầu trong mọi phong trào,\nđóng góp tích cực vào sự nghiệp cách mạng.',
        'Nhiều giáo sư, nhà khoa học xuất sắc của trường\nđã có đóng góp to lớn cho nền giáo dục và khoa học Việt Nam,\nxứng đáng là niềm tự hào của Sư phạm.'
    ];

    for (let i = 0; i < 3; i++) {
        // Box nền
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(colX[i], 230, colW - 80, 700);
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(colX[i], 230, colW - 80, 700);

        // Icon vòng tròn
        ctx.beginPath();
        ctx.arc(colX[i] + 80, 310, 40, 0, Math.PI * 2);
        ctx.fillStyle = '#e3000f';
        ctx.fill();
        ctx.fillStyle = '#fff200';
        ctx.font = '900 28px ' + UI_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((i + 1).toString(), colX[i] + 80, 310);

        // Tiêu đề cột
        ctx.fillStyle = '#d4af37';
        ctx.font = '700 32px ' + UI_FONT;
        ctx.textAlign = 'left';
        ctx.fillText(titles[i], colX[i] + 30, 400);

        // Dòng kẻ
        ctx.fillStyle = '#e3000f';
        ctx.fillRect(colX[i] + 30, 420, 200, 3);

        // Nội dung
        ctx.fillStyle = '#e8d5b5';
        ctx.font = '400 26px ' + UI_FONT;
        ctx.textAlign = 'left';
        const lines = contents[i].split('\n');
        lines.forEach((line, j) => {
            ctx.fillText(line, colX[i] + 30, 470 + j * 45);
        });
    }

    // Footer
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(0, c.height - 80, c.width, 80);
    ctx.fillStyle = '#1a0a0a';
    ctx.font = '900 32px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.fillText('NCKH · KHOA CÔNG NGHỆ THÔNG TIN · 2025', c.width / 2, c.height - 35);

    const tex = createSRGBCanvasTexture(c);
    tex.anisotropy = 4;

    // Tạo geometry cong theo tường
    const w = 15.0, h = 6.0;
    const segments = 64;
    const panelGeo = new THREE.PlaneGeometry(w, h, segments, 1);
    bendGeometry(panelGeo, radius);

    const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.5
    }));

    // Đặt giữa tường (góc 90° = Math.PI/2)
    const angle = Math.PI / 2;
    panel.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    panel.rotation.y = faceCoreRotY(angle);
    scene.add(panel);

    // Khung viền
    const fGeo = new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.08, segments, 1, 1);
    fGeo.translate(0, 0, -0.05);
    bendGeometry(fGeo, radius);
    const frame = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.5 }));
    frame.position.copy(panel.position);
    frame.rotation.copy(panel.rotation);
    scene.add(frame);

    panel.userData = {
        type: 'infographic', title: 'PHÒNG TRUYỀN THỐNG SỐ - ĐHSP HÀ NỘI',
        zoneName: 'SẢNH TRUNG TÂM', color: RED,
        content: 'Phòng Truyền thống số Trường Đại học Sư phạm Hà Nội - nơi lưu giữ và tôn vinh truyền thống vẻ vang của hơn 70 năm xây dựng và phát triển.'
    };
    interactiveObjects.push(panel);
}

function buildCeilings() {
    const ceiling = new THREE.Group();
    ceiling.name = 'radial-drop-ceiling';
    scene.add(ceiling);

    const backstopY = WALL_H + 0.28;
    const recessedY = WALL_H + 0.18;
    const rimY = WALL_H - 0.18;
    const rimThickness = 0.36;
    const angleOverlap = 0.006;

    const backstopMat = architectureMaterials.ceiling;
    const rimMat = architectureMaterials.baseboard.clone();
    rimMat.side = THREE.DoubleSide;
    const recessedMat = architectureMaterials.ceiling.clone();
    recessedMat.color.offsetHSL(0, 0, -.025);
    const fasciaMat = new THREE.MeshStandardMaterial({
        color: ARCHITECTURE_COLORS.baseboard, roughness: 0.82, side: THREE.DoubleSide
    });
    const goldMat = architectureMaterials.trim;

    // Sảnh trung tâm: trần nền, vành hạ cốt và lõi tròn cao hơn.
    const coreBackstop = new THREE.Mesh(new THREE.CircleGeometry(R_CORE + 0.14, 96), backstopMat);
    coreBackstop.rotation.x = Math.PI / 2;
    coreBackstop.position.y = backstopY;
    ceiling.add(coreBackstop);

    const coreRecessR = 3.55;
    const coreRim = new THREE.Mesh(new THREE.RingGeometry(coreRecessR, R_CORE + 0.14, 96), rimMat);
    coreRim.rotation.x = Math.PI / 2;
    coreRim.position.y = rimY;
    ceiling.add(coreRim);

    const coreRecess = new THREE.Mesh(new THREE.CircleGeometry(coreRecessR + 0.02, 96), recessedMat);
    coreRecess.rotation.x = Math.PI / 2;
    coreRecess.position.y = recessedY;
    ceiling.add(coreRecess);

    const coreFascia = new THREE.Mesh(
        new THREE.CylinderGeometry(coreRecessR, coreRecessR, recessedY - rimY, 96, 1, true),
        fasciaMat
    );
    coreFascia.position.y = (rimY + recessedY) / 2;
    ceiling.add(coreFascia);

    const coreGoldRing = new THREE.Mesh(new THREE.TorusGeometry(coreRecessR, 0.055, 10, 96), goldMat);
    coreGoldRing.rotation.x = Math.PI / 2;
    coreGoldRing.position.y = rimY - rimThickness / 2 - 0.01;
    ceiling.add(coreGoldRing);

    // Ba vùng trưng bày: nền kín, hai vành hạ cốt, lõi cong và dải nhận diện.
    const innerTransitionR = R_CORE + 1.3;
    const outerTransitionR = R_OUTER - 1.6;
    ZONES.filter(zone => zone.surface === 'outer').forEach(zone => {
        const a0 = zone.a0 - angleOverlap;
        const a1 = zone.a1 + angleOverlap;
        const steps = 48;

        createAnnularSectorMesh(R_CORE - 0.1, R_OUTER + 0.12, a0, a1, backstopY, backstopMat, steps, ceiling);
        createAnnularSectorMesh(R_CORE - 0.08, innerTransitionR + 0.08, a0, a1, rimY, rimMat, steps, ceiling);
        createAnnularSectorMesh(outerTransitionR - 0.08, R_OUTER + 0.1, a0, a1, rimY, rimMat, steps, ceiling);
        createAnnularSectorMesh(innerTransitionR, outerTransitionR, a0, a1, recessedY, recessedMat, steps, ceiling);

        createArcFascia(innerTransitionR, a0, a1, rimY, recessedY, fasciaMat, steps, ceiling);
        createArcFascia(outerTransitionR, a0, a1, rimY, recessedY, fasciaMat, steps, ceiling);

        const accentMat = architectureMaterials.trim.clone();
        accentMat.side = THREE.DoubleSide;
        createAnnularSectorMesh(
            outerTransitionR - 0.02, outerTransitionR + 0.1,
            a0, a1, rimY - rimThickness / 2 - 0.012,
            accentMat, steps, ceiling
        );

    });

    // Hai vòng đèn âm trần đồng tâm: một vòng sát trụ giữa và một vòng gần
    // tường ngoài. InstancedMesh giữ 74 bộ đèn ở đúng 2 draw call chính.
    createConcentricCeilingLightRings(ceiling, rimY - .205);

    // Hai dầm hai bên sảnh cửa thay cho dầm giữa cũ, nhờ đó toàn bộ hình quạt
    // từ cửa đến vòng tròn trong trở thành một không gian riêng thống nhất.
    [
        -Math.PI / 2 - ENTRANCE_HALF_ANGLE,
        -Math.PI / 2 + ENTRANCE_HALF_ANGLE,
        ...BOUNDARIES
    ].forEach(angle => {
        const length = R_OUTER - R_CORE + 0.25;
        const radiusMid = (R_CORE + R_OUTER) / 2;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(length, rimThickness, 0.24), rimMat);
        beam.position.set(Math.cos(angle) * radiusMid, rimY, Math.sin(angle) * radiusMid);
        beam.rotation.y = -angle;
        ceiling.add(beam);

        const inlay = new THREE.Mesh(new THREE.BoxGeometry(length - 0.2, 0.05, 0.065), goldMat);
        inlay.position.set(Math.cos(angle) * radiusMid, rimY - rimThickness / 2 - 0.012, Math.sin(angle) * radiusMid);
        inlay.rotation.y = -angle;
        ceiling.add(inlay);
    });

    // Trần sảnh cửa cũng dùng đúng hình quạt của sàn, không còn khối chữ nhật
    // chồng lên phần trần nhận diện của Cụm 1 và Cụm 3.
    const entranceA0 = -Math.PI / 2 - ENTRANCE_HALF_ANGLE;
    const entranceA1 = -Math.PI / 2 + ENTRANCE_HALF_ANGLE;
    const entranceCeilingMat = architectureMaterials.ceiling;
    createAnnularSectorMesh(
        R_CORE - .08, R_OUTER + .1,
        entranceA0, entranceA1,
        rimY - rimThickness / 2 - .025,
        entranceCeilingMat, 32, ceiling
    );

    const entranceCenterInlay = architectureMaterials.trim.clone();
    entranceCenterInlay.side = THREE.DoubleSide;
    createAnnularSectorMesh(
        R_CORE + .06, R_OUTER - .12,
        -Math.PI / 2 - .012, -Math.PI / 2 + .012,
        rimY - rimThickness / 2 - .032,
        entranceCenterInlay, 6, ceiling
    );

}

function createConcentricCeilingLightRings(parent, y) {
    const rings = [
        { radius: 19.6, count: 30, phase: 0 },
        { radius: 28.8, count: 44, phase: .5 }
    ];
    const total = rings.reduce((sum, ring) => sum + ring.count, 0);
    const housingGeometry = new THREE.CylinderGeometry(.31, .31, .09, 24);
    const diffuserGeometry = new THREE.CircleGeometry(.255, 24);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x8c7650, metalness: .7, roughness: .3
    });
    const diffuserMaterial = new THREE.MeshStandardMaterial({
        color: 0xfff4d5,
        emissive: 0xffd98f,
        emissiveIntensity: .9,
        roughness: .35,
        side: THREE.DoubleSide
    });
    const housings = new THREE.InstancedMesh(housingGeometry, housingMaterial, total);
    const diffusers = new THREE.InstancedMesh(diffuserGeometry, diffuserMaterial, total);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const housingRotation = new THREE.Quaternion();
    const diffuserRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const entranceClearance = ENTRANCE_HALF_ANGLE + THREE.MathUtils.degToRad(1.5);
    const start = -Math.PI / 2 + entranceClearance;
    const sweep = Math.PI * 2 - entranceClearance * 2;
    let instanceIndex = 0;

    rings.forEach(ring => {
        const step = sweep / ring.count;
        for (let index = 0; index < ring.count; index += 1) {
            // Hai vòng lệch nhau nửa bước để ánh sáng không tạo thành các tia
            // hướng tâm, nhưng từng vòng vẫn đọc rõ là một đường tròn liên tục.
            const offset = (index + .5 + ring.phase) * step;
            const angle = start + (offset % sweep);
            const x = Math.cos(angle) * ring.radius;
            const z = Math.sin(angle) * ring.radius;
            position.set(x, y - .015, z);
            matrix.compose(position, housingRotation, scale);
            housings.setMatrixAt(instanceIndex, matrix);
            position.set(x, y - .065, z);
            matrix.compose(position, diffuserRotation, scale);
            diffusers.setMatrixAt(instanceIndex, matrix);
            instanceIndex += 1;
        }
    });

    housings.instanceMatrix.needsUpdate = true;
    diffusers.instanceMatrix.needsUpdate = true;
    housings.name = 'ceiling-light-housings-inner-outer-rings';
    diffusers.name = 'ceiling-light-diffusers-inner-outer-rings';
    parent.add(housings, diffusers);
}

// --- HÀM TẠO LOA 3D CHUYÊN DỤNG ---

function createZone3DAudio(path, position, zoneId) {
    const sound = new THREE.PositionalAudio(audioListener);

    // Metadata điều khiển "cách ly cứng theo zone": mỗi loa chỉ được mở âm lượng
    // khi camera đang đứng trong đúng zoneId của nó. Bắt đầu ở mức 0 (câm lặng).
    // leftAt = 0 nghĩa là "chưa từng ghé qua" → lần đầu tiên vào zone sẽ luôn phát từ đầu bài.
    const audioEntry = { zoneId, sound, baseVolume: 1.0, targetVolume: 0, leftAt: 0 };

    audioLoader.load(path, function(buffer) {
        sound.setBuffer(buffer);
        // Cấu hình mô hình lan truyền âm thanh (vẫn giữ để có chiều sâu không gian
        // NHẸ trong phạm vi zone, nhưng việc cách ly giữa các zone do targetVolume quyết định)
        sound.setDistanceModel('linear'); 
        sound.setRefDistance(8);   
        sound.setMaxDistance(25);  
        sound.setRolloffFactor(1);
        sound.setLoop(true);
        
        // KHÔNG bật to ngay: chỉ phát "ngầm" ở volume 0, chờ recalcAudioTargets() mở dần
        sound.setVolume(0);
        
        // Nếu người dùng đã click Bắt Đầu trước khi load xong
        if (started) {
            sound.play();
        }
    }, 
    undefined, 
    function(err) {
        // KHÔNG còn phát âm thanh dự phòng nữa — nếu file lỗi/không tải được thì
        // track này im lặng vĩnh viễn (sound.buffer vẫn là null, mọi nơi khác trong code
        // đều kiểm tra "if (entry.sound.buffer)" trước khi play/tính volume nên tự động bỏ qua).
        // Cảnh báo rõ trong Console để người chỉnh sửa dễ debug đường dẫn/CORS.
        console.warn(`⚠️ Không tải được nhạc cho zone ${zoneId}: "${path}"`);
        console.warn('   → Kiểm tra lại đường dẫn file, hoặc file không cho phép CORS. Zone này sẽ không phát nhạc.');
    });

    // Tạo Mesh rỗng để neo Âm thanh vào Không gian
    const speakerMesh = new THREE.Object3D();
    speakerMesh.position.copy(position);
    speakerMesh.add(sound);
    scene.add(speakerMesh);
    
    positionalAudios.push(audioEntry);
}

// Phương án lai: nếu rời khỏi 1 zone từ RESTART_THRESHOLD_MS trở lên thì lần quay lại
// sẽ phát LẠI TỪ ĐẦU bài (stop rồi play lại, offset về 0); nếu quay lại nhanh hơn ngưỡng
// đó (ví dụ đứng gần biên 2 zone rồi nhích qua lại) thì PHÁT TIẾP đúng đoạn đang dang dở,
// tránh giật/restart liên tục.
function handleZoneMusicTransition(oldZoneId, newZoneId) {
    const now = performance.now();

    // Đánh dấu mốc thời gian vừa rời khỏi zone cũ (nếu có zone cũ)
    if (oldZoneId !== null) {
        positionalAudios.forEach(entry => {
            if (entry.zoneId === oldZoneId) entry.leftAt = now;
        });
    }

    // Zone mới được kích hoạt: nếu đã "vắng mặt" đủ lâu (hoặc chưa từng ghé, leftAt=0)
    // thì restart về đầu bài; ngược lại giữ nguyên nguồn phát đang chạy ngầm.
    positionalAudios.forEach(entry => {
        if (entry.zoneId === newZoneId && entry.sound.buffer) {
            const awayMs = now - entry.leftAt;
            if (awayMs >= RESTART_THRESHOLD_MS) {
                if (entry.sound.isPlaying) entry.sound.stop();
                entry.sound.play();
            }
            entry.leftAt = now; // đang active — mốc này sẽ bị ghi đè khi thực sự rời đi lần sau
        }
    });
}

// Cách ly cứng theo zone + áp dụng âm lượng tổng/mute do người dùng điều chỉnh.
// Chỉ zone đang đứng trong mới có targetVolume > 0, và toàn bộ bị nhân thêm masterVolume,
// hoặc về thẳng 0 nếu đang isMuted — tất cả gói gọn trong MỘT nguồn sự thật duy nhất.
function recalcAudioTargets() {
    positionalAudios.forEach(entry => {
        const zoneActive = (entry.zoneId === lastZoneId);
        entry.targetVolume = (zoneActive && !isMuted) ? entry.baseVolume * masterVolume : 0;
    });
}

// Đặt âm lượng tổng (0..1), tự động bỏ mute nếu người dùng chủ động tăng lên từ 0
function setMasterVolume(v) {
    masterVolume = Math.min(1, Math.max(0, v));
    if (masterVolume > 0 && isMuted) isMuted = false;
    updateVolumeIcon();
    recalcAudioTargets();
}

// Cập nhật icon loa theo trạng thái: 🔇 khi mute/volume=0, 🔉 khi nhỏ, 🔊 khi bình thường
function updateVolumeIcon() {
    if (!elMuteBtn) return;
    if (isMuted || masterVolume <= 0) {
        elMuteBtn.textContent = '🔇';
        elMuteBtn.classList.add('muted');
        elMuteBtn.title = 'Bật tiếng';
    } else if (masterVolume < 0.55) {
        elMuteBtn.textContent = '🔉';
        elMuteBtn.classList.remove('muted');
        elMuteBtn.title = 'Tắt tiếng';
    } else {
        elMuteBtn.textContent = '🔊';
        elMuteBtn.classList.remove('muted');
        elMuteBtn.title = 'Tắt tiếng';
    }
}

// --- HÀM RENDER CHỮ 3D VÀ BẢNG THÔNG TIN ---
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' '); let line = ''; const lines = [];
    for (let n = 0; n < words.length; n++) {
        const test = line + words[n] + ' ';
        if (ctx.measureText(test).width > maxWidth && n > 0) { lines.push(line.trim()); line = words[n] + ' '; } else line = test;
    }
    lines.push(line.trim()); 
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight)); 
}

// Cơ chế nổi nhiều lớp giống Logo nổi của Chủ đề 5. Mỗi lớp dùng chính
// texture của mặt trước, cùng kích thước, không có tấm đệm hoặc khung nền.
function createLayeredRaisedSurface({
    geometry, texture = null, position, rotationY = 0,
    depth = .105, layers = 7, tint = 0xa8a8a8,
    roughness = .62, metalness = .03, transparent = false
}) {
    // Giảm toàn bộ độ nổi còn 3/4 so với thiết lập ban đầu.
    const effectiveDepth = depth * .75;
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: tint,
        roughness,
        metalness,
        side: THREE.DoubleSide,
        transparent,
        alphaTest: transparent ? .035 : 0,
        depthWrite: true
    });
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);
    group.rotation.y = rotationY;
    for (let index = 0; index < layers; index += 1) {
        const layerGeometry = geometry.clone();
        layerGeometry.translate(0, 0, -effectiveDepth + index * (effectiveDepth / layers));
        const layer = new THREE.Mesh(layerGeometry, material);
        layer.castShadow = true;
        layer.receiveShadow = true;
        layer.renderOrder = 2;
        group.add(layer);
    }
    scene.add(group);
    return { group, material };
}

function createReferenceTitle(cfg) {
    const c = document.createElement('canvas'); 
    c.width = cfg.w ? cfg.w * 200 : 900; 
    c.height = cfg.h ? cfg.h * 200 : 150; 
    const ctx = c.getContext('2d'); 
    
    const unifiedBgColor = USE_ZONE1_EDITORIAL_V2 && cfg.bgColor ? ZONE2_CONTENT_BLUE : cfg.bgColor;
    const unifiedTextColor = USE_ZONE1_EDITORIAL_V2 && cfg.bgColor ? '#ffffff' : cfg.textColor;
    if (unifiedBgColor) {
        ctx.fillStyle = unifiedBgColor; ctx.fillRect(0, 0, c.width, c.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
    } else ctx.clearRect(0, 0, c.width, c.height);

    const tColor = unifiedTextColor || ('#' + cfg.color.toString(16).padStart(6, '0'));
    const fontSize = cfg.fontSize || (unifiedBgColor ? 60 : 42);
    ctx.fillStyle = tColor; ctx.font = '700 ' + fontSize + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wrapText(ctx, cfg.text, c.width / 2, c.height / 2, c.width - 80, fontSize * 1.25); 

    const tex = createSRGBCanvasTexture(c);
    const segments = cfg.curveRadius ? 32 : 1;
    const panelGeo = new THREE.PlaneGeometry(cfg.w || 4.8, cfg.h || 0.8, segments, 1);
    if (cfg.curveRadius) bendGeometry(panelGeo, cfg.curveRadius);

    const matOpts = { map: tex, transparent: !unifiedBgColor };
    if (cfg.color && !unifiedBgColor) { matOpts.emissive = cfg.color; matOpts.emissiveMap = tex; matOpts.emissiveIntensity = 0.28; } else if (unifiedBgColor) { matOpts.roughness = 0.6; }

    const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial(matOpts));
    panel.position.set(cfg.x, cfg.y, cfg.z); panel.rotation.y = cfg.rotY; scene.add(panel);
    if (unifiedBgColor) {
        createLayeredRaisedSurface({
            geometry: panelGeo, texture: tex,
            position: { x: cfg.x, y: cfg.y, z: cfg.z }, rotationY: cfg.rotY,
            tint: 0x9fc9df, depth: .09, layers: 6
        });
    }
}

function createPortraitNamePanel(cfg) {
    const canvas=document.createElement('canvas');
    canvas.width=720; canvas.height=Math.round(canvas.width*cfg.h/cfg.w);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=ZONE2_CONTENT_BLUE; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(255,255,255,.22)'; ctx.lineWidth=10;
    ctx.strokeRect(12,12,canvas.width-24,canvas.height-24);
    // Chữ bám về phía ảnh: lề trái nhỏ, vai trò và tên đều căn trái phía trên.
    const pad=30,maxWidth=canvas.width-pad*2;
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillStyle='rgba(255,255,255,.82)'; ctx.font=`700 50px ${UI_FONT}`;
    const roleLines=[]; let roleLine='';
    String(cfg.role||'').toUpperCase().split(/\s+/).forEach(word=>{
        const candidate=roleLine?`${roleLine} ${word}`:word;
        if(roleLine&&ctx.measureText(candidate).width>maxWidth){roleLines.push(roleLine);roleLine=word;}
        else roleLine=candidate;
    });
    if(roleLine)roleLines.push(roleLine);
    roleLines.forEach((line,index)=>ctx.fillText(line,pad,70+index*64,maxWidth));
    const ruleY=70+roleLines.length*64+22;
    ctx.fillStyle=ZONE1_BA_PALETTE.gold; ctx.fillRect(pad,ruleY,Math.min(210,maxWidth*.65),9);
    // Mỗi thành phần họ / tên đệm / tên đứng trên một hàng riêng.
    let nameSize=138;
    const buildNameLines=()=>String(cfg.name||'').toUpperCase().split(/\s+/).filter(Boolean);
    let nameLines=buildNameLines();
    ctx.font=`800 ${nameSize}px ${UI_FONT}`;
    while(nameSize>58&&nameLines.some(line=>ctx.measureText(line).width>maxWidth)){
        nameSize-=2;ctx.font=`800 ${nameSize}px ${UI_FONT}`;
    }
    const nameRuleGap=63;
    const nameLineStep=1.65;
    const nameBlockHeight=()=>nameSize+(nameLines.length-1)*nameSize*nameLineStep;
    while(nameSize>44&&nameBlockHeight()>canvas.height-ruleY-nameRuleGap-70){
        nameSize-=2;ctx.font=`800 ${nameSize}px ${UI_FONT}`;
    }
    ctx.fillStyle='#fff'; ctx.font=`800 ${nameSize}px ${UI_FONT}`;
    nameLines.forEach((line,index)=>ctx.fillText(line,pad,ruleY+nameRuleGap+index*nameSize*nameLineStep,maxWidth));
    const texture=createSRGBCanvasTexture(canvas);
    const geometry=new THREE.PlaneGeometry(cfg.w,cfg.h,24,1);
    if(cfg.curveRadius)bendGeometry(geometry,cfg.curveRadius);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:.7,side:THREE.DoubleSide}));
    mesh.position.set(cfg.x,cfg.y,cfg.z); mesh.rotation.y=cfg.rotY; scene.add(mesh);
    createLayeredRaisedSurface({geometry,texture,position:cfg,rotationY:cfg.rotY,tint:0x8ebbd1,depth:.10,layers:7});
    return mesh;
}

function createLargeInfographic(cfg) {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const ctx = c.getContext('2d');
    const accent = '#' + (cfg.accent || RED).toString(16).padStart(6, '0');
    
    ctx.fillStyle = cfg.bgColor || '#171a21'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, c.width, 180);
    ctx.fillStyle = cfg.titleColor || '#ffffff'; ctx.font = '900 86px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cfg.title.toUpperCase(), c.width/2, 90);
    
    ctx.fillStyle = cfg.textColor || '#ffffff'; ctx.font = '700 48px ' + UI_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText("PHONG TRÀO NỔI BẬT", 80, 240);
    
    ctx.fillStyle = cfg.contentColor || '#cbd5e1'; ctx.font = '400 36px ' + UI_FONT;
    wrapText(ctx, cfg.content, 80, 320, 800, 52);
    
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(1250, 500, 220, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = cfg.bgColor || '#171a21'; ctx.beginPath(); ctx.arc(1250, 500, 180, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = cfg.titleColor || '#ffffff'; ctx.font = '900 96px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cfg.year || "1964", 1250, 500);
    
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(80, 750, 1440, 180);
    ctx.fillStyle = accent; ctx.font = '900 64px ' + UI_FONT; ctx.textAlign = 'left';
    ctx.fillText("200,000+", 120, 840);
    ctx.fillStyle = cfg.textColor || '#ffffff'; ctx.font = '400 32px ' + UI_FONT;
    ctx.fillText("Lá đơn tình nguyện", 440, 840);

    const tex = createSRGBCanvasTexture(c); tex.anisotropy = 4;
    const segments = cfg.curveRadius ? 48 : 1;
    const panelGeo = new THREE.PlaneGeometry(cfg.w, cfg.h, segments, 1);
    
    let frameDepth = 0.1, framePadding = 0.2;
    const frameGeo = new THREE.BoxGeometry(cfg.w + framePadding, cfg.h + framePadding, frameDepth, segments, 1, 1);
    frameGeo.translate(0, 0, -frameDepth / 2 - 0.01);
    if (cfg.curveRadius) { bendGeometry(panelGeo, cfg.curveRadius); bendGeometry(frameGeo, cfg.curveRadius); }

    const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.1, roughness: 0.5 }));
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.5, metalness: 0.5 }));
    
    const group = new THREE.Group(); group.add(frame, panel);
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);
    
    panel.userData = { 
        type: 'infographic', title: cfg.title, zoneName: cfg.zoneName, 
        content: cfg.content, color: cfg.accent, 
        imageUrl: placeholderImage(1600, 1000, cfg.accent.toString(16).padStart(6, '0'), cfg.title)
    };
    interactiveObjects.push(panel); return group;
}

function createWallPicture(cfg) {
    const segments = cfg.curveRadius ? 24 : 1;
    const group = new THREE.Group();
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);

    const w = cfg.w; const h = cfg.h;
    const thinFrame = USE_ZONE1_EDITORIAL_V2;
    const frameMat = new THREE.MeshStandardMaterial({
        color: thinFrame ? 0xb99a55 : 0xcdbb86,
        roughness: thinFrame ? .42 : .36,
        metalness: thinFrame ? .36 : .42
    });
    const matBoardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .62 });

    // Viền kim loại mảnh: đủ tách ảnh/infographic khỏi tường nhưng
    // không lấn át nội dung như kiểu khung bản rộng trước đây.
    const outerGeo = new THREE.BoxGeometry(
        w + (thinFrame ? .12 : .48), h + (thinFrame ? .12 : .48), thinFrame ? .07 : .18,
        segments, 1, 1
    );
    outerGeo.translate(0, 0, thinFrame ? .015 : .03);
    if (cfg.curveRadius) bendGeometry(outerGeo, cfg.curveRadius);
    group.add(new THREE.Mesh(outerGeo, frameMat));

    const matGeo = new THREE.BoxGeometry(
        w + (thinFrame ? .04 : .18), h + (thinFrame ? .04 : .18), thinFrame ? .035 : .08,
        segments, 1, 1
    );
    matGeo.translate(0, 0, thinFrame ? .055 : .1);
    if (cfg.curveRadius) bendGeometry(matGeo, cfg.curveRadius);
    group.add(new THREE.Mesh(matGeo, matBoardMat));

    const picGeo = new THREE.PlaneGeometry(w, h, segments, 1);
    picGeo.translate(0, 0, thinFrame ? .08 : .15);
    if (cfg.curveRadius) bendGeometry(picGeo, cfg.curveRadius);
    
    const picMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, side: THREE.DoubleSide });
    if (cfg.imageUrl) {
        loadDisplayTexture(cfg.imageUrl, renderer, tex => {
            const imageAspect = tex.image.width / tex.image.height;
            const frameAspect = w / h;
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            if (imageAspect > frameAspect) {
                tex.repeat.x = frameAspect / imageAspect;
                tex.offset.x = (1 - tex.repeat.x) / 2;
            } else {
                tex.repeat.y = imageAspect / frameAspect;
                tex.offset.y = (1 - tex.repeat.y) / 2;
            }
            picMat.map = tex;
            picMat.needsUpdate = true;
            framePolicy.invalidate(2);
        });
    }
    const picture = new THREE.Mesh(picGeo, picMat);
    picture.userData = {
        type: 'artifact', code: cfg.code, title: cfg.title, zoneName: cfg.zoneName, content: cfg.content,
        color: cfg.accent, imageUrl: cfg.imageUrl, year: cfg.year, source: cfg.source
    };
    interactiveObjects.push(picture); group.add(picture);

    if (cfg.subtitle || cfg.year) {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 1200; labelCanvas.height = 240;
        const labelCtx = labelCanvas.getContext('2d');
        labelCtx.fillStyle = '#17344c'; labelCtx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
        labelCtx.fillStyle = '#d7b56b'; labelCtx.fillRect(0, 0, 18, labelCanvas.height);
        labelCtx.textAlign = 'left'; labelCtx.textBaseline = 'middle';
        labelCtx.fillStyle = '#ffffff'; labelCtx.font = '700 48px ' + UI_FONT;
        labelCtx.fillText(cfg.title, 52, 76, 1080);
        labelCtx.fillStyle = '#d7b56b'; labelCtx.font = '600 34px ' + UI_FONT;
        labelCtx.fillText([cfg.year, cfg.subtitle].filter(Boolean).join(' · '), 52, 158, 1080);
        const labelTexture = createSRGBCanvasTexture(labelCanvas);
        const labelGeo = new THREE.PlaneGeometry(w + .18, .62);
        labelGeo.translate(0, -h / 2 - .42, thinFrame ? .1 : .17);
        const label = new THREE.Mesh(labelGeo, new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .58 }));
        group.add(label);
    }
}

// Ảnh tư liệu được làm dày bằng chính các lớp ảnh đồng kích thước.
function createWallPhotoTile(cfg) {
    const segments = cfg.curveRadius ? 24 : 1;
    const geometry = new THREE.PlaneGeometry(cfg.w, cfg.h, segments, 1);
    geometry.translate(0, 0, 0.035);
    if (cfg.curveRadius) bendGeometry(geometry, cfg.curveRadius);

    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, side: THREE.DoubleSide });
    const tile = new THREE.Mesh(geometry, material);
    let raisedLayers = null;
    loadDisplayTexture(cfg.imageUrl, renderer, texture => {
        const imageAspect = texture.image.width / texture.image.height;
        const tileAspect = cfg.w / cfg.h;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        if (cfg.preserveAspect) {
            // Thu ảnh vừa bên trong ô trưng bày, giữ nguyên toàn bộ khung hình.
            // Không crop cạnh và không kéo méo ảnh ngang/dọc.
            texture.repeat.set(1, 1);
            texture.offset.set(0, 0);
            if (imageAspect > tileAspect) tile.scale.y = tileAspect / imageAspect;
            else tile.scale.x = imageAspect / tileAspect;
        } else if (imageAspect > tileAspect) {
            texture.repeat.x = tileAspect / imageAspect;
            texture.offset.x = (1 - texture.repeat.x) / 2;
        } else {
            texture.repeat.y = imageAspect / tileAspect;
            texture.offset.y = (1 - texture.repeat.y) / 2;
        }
        material.map = texture;
        material.needsUpdate = true;
        if (raisedLayers) {
            raisedLayers.material.map = texture;
            raisedLayers.material.needsUpdate = true;
            raisedLayers.group.scale.x = tile.scale.x;
            raisedLayers.group.scale.y = tile.scale.y;
        }
        framePolicy.invalidate(2);
    });

    const borderGeometry = new THREE.EdgesGeometry(geometry, 20);
    borderGeometry.translate(0, 0, 0.012);
    const hoverBorder = new THREE.LineSegments(
        borderGeometry,
        new THREE.LineBasicMaterial({
            color: 0xd6b46a,
            linewidth: 2,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false
        })
    );
    hoverBorder.renderOrder = 5;
    tile.add(hoverBorder);
    if (cfg.permanentBorder) {
        const permanentBorder = new THREE.LineSegments(
            borderGeometry.clone(),
            new THREE.LineBasicMaterial({
                color: cfg.permanentBorderColor || 0x0092df,
                transparent: true,
                opacity: .74,
                depthWrite: false,
                toneMapped: false
            })
        );
        permanentBorder.renderOrder = 4;
        tile.add(permanentBorder);
    }
    tile.position.set(cfg.x, cfg.y, cfg.z);
    tile.rotation.y = cfg.rotY;
    tile.castShadow = true;
    tile.receiveShadow = true;
    raisedLayers = createLayeredRaisedSurface({
        geometry, position: cfg, rotationY: cfg.rotY,
        tint: 0xa4a4a4, depth: cfg.photoDepth || .105, layers: 7
    });
    tile.userData = {
        type: 'artifact', title: cfg.title, zoneName: cfg.zoneName, content: cfg.content,
        color: cfg.accent, imageUrl: cfg.modalImageUrl || cfg.imageUrl, year: cfg.year, source: cfg.source,
        gallery: cfg.gallery, links: cfg.links, documents: cfg.documents,
        galleryItems: cfg.galleryItems, galleryIndex: cfg.galleryIndex,
        // Giữ nguyên bố cục ghép ảnh trên tường; riêng ảnh thuộc Cụm 2 mở theo
        // giao diện ảnh lớn + dải chú thích xanh như các ảnh tư liệu ở Cụm 1.
        displayMode: cfg.displayMode || (cfg.zoneName?.startsWith('Cụm 2') ? 'photo-caption' : undefined),
        hoverBorder, profile: cfg.profile || null
    };
    interactiveObjects.push(tile);
    scene.add(tile);
    return tile;
}

function addExhibitBox(group, size, material, position, rotation = null) {
    const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    group.add(object);
    return object;
}

function createExhibitPhoto(group, cfg, width, height, z = .2, emissive = false) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: emissive ? .28 : .62,
        emissive: emissive ? 0xffffff : 0x000000,
        emissiveIntensity: emissive ? .1 : 0,
        side: THREE.DoubleSide
    });
    loadDisplayTexture(cfg.imageUrl, renderer, texture => {
        const imageAspect = texture.image.width / texture.image.height;
        const frameAspect = width / height;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        if (imageAspect > frameAspect) {
            texture.repeat.x = frameAspect / imageAspect;
            texture.offset.x = (1 - texture.repeat.x) / 2;
        } else {
            texture.repeat.y = imageAspect / frameAspect;
            texture.offset.y = (1 - texture.repeat.y) / 2;
        }
        material.map = texture;
        if (emissive) material.emissiveMap = texture;
        material.needsUpdate = true;
        framePolicy.invalidate(2);
    });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    photo.position.z = z;
    photo.userData = { type: 'artifact', title: cfg.title, zoneName: cfg.zoneName, content: cfg.content, color: cfg.accent, imageUrl: cfg.imageUrl };
    interactiveObjects.push(photo);
    group.add(photo);
    return photo;
}

function createExhibitLabel(group, cfg, y, width, palette = {}, height = .66) {
    const canvas = document.createElement('canvas');
    canvas.width = 1400; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const resolvedPalette = USE_ZONE1_EDITORIAL_V2 ? {
        background: ZONE2_CONTENT_BLUE,
        accent: ZONE1_BA_PALETTE.gold,
        border: ZONE1_BA_PALETTE.dark,
        title: '#ffffff',
        meta: ZONE1_BA_PALETTE.pale
    } : palette;
    ctx.fillStyle = resolvedPalette.background || '#17344c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = resolvedPalette.accent || '#d7b56b'; ctx.fillRect(0, 0, 20, canvas.height);
    ctx.strokeStyle = resolvedPalette.border || 'rgba(215,181,107,.7)'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = resolvedPalette.title || '#ffffff'; ctx.font = '700 48px ' + UI_FONT;
    wrapText(ctx, cfg.title, canvas.width / 2, 96, canvas.width - 120, 54);
    ctx.fillStyle = resolvedPalette.meta || '#d7b56b'; ctx.font = '600 34px ' + UI_FONT;
    ctx.fillText([cfg.year, cfg.subtitle].filter(Boolean).join(' · '), canvas.width / 2, 242, canvas.width - 110);
    const texture = createSRGBCanvasTexture(canvas);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .52 }));
    label.position.set(0, y, .24); group.add(label);
    return label;
}

function createHeritageExhibit(cfg) {
    const group = new THREE.Group();
    const goldVariant = cfg.displayStyle === 'heritage-gold';
    const wood = new THREE.MeshStandardMaterial({ color: 0x4b2b20, roughness: .64, metalness: .02 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x20120d, roughness: .72 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb58a3c, roughness: .3, metalness: .68 });
    const warm = new THREE.MeshStandardMaterial({ color: 0xeee2ce, roughness: .82 });
    const w = cfg.w, h = cfg.h;
    addExhibitBox(group, [w + .48, h + .48, .16], goldVariant ? brass : woodDark, [0, 0, 0]);
    addExhibitBox(group, [w + .32, h + .32, .13], goldVariant ? woodDark : wood, [0, 0, .09]);
    addExhibitBox(group, [w + .14, h + .14, .08], goldVariant ? wood : brass, [0, 0, .17]);
    addExhibitBox(group, [w, h, .05], warm, [0, 0, .22]);
    createExhibitPhoto(group, cfg, w - .18, h - .18, .26, false);
    if (goldVariant) {
        addExhibitBox(group, [w * .72, .1, .12], brass, [0, h / 2 + .32, .2]);
        addExhibitBox(group, [w * .42, .1, .14], woodDark, [0, h / 2 + .46, .21]);
    } else {
        const crest = new THREE.Mesh(new THREE.CircleGeometry(.16, 32), brass);
        crest.position.set(0, h / 2 + .37, .22); group.add(crest);
        addExhibitBox(group, [.7, .06, .08], brass, [0, h / 2 + .16, .2]);
    }
    createExhibitLabel(group, cfg, -h / 2 - .48, w + .38, { background: '#2a1811', accent: '#b58a3c', border: '#6f4b22', meta: '#e0bd73' }, .68);
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);
    return group;
}

function createDigitalScholarExhibit(cfg) {
    const group = new THREE.Group();
    const portraitMode = cfg.displayStyle === 'digital-portrait';
    const navy = new THREE.MeshStandardMaterial({ color: 0x102f4a, roughness: .28, metalness: .32 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x38c8ef, emissive: 0x18a8df, emissiveIntensity: .75, roughness: .18, metalness: .48 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xdbe6ed, roughness: .32, metalness: .45 });
    const w = cfg.w, h = cfg.h;
    addExhibitBox(group, [w + .38, h + .38, .15], navy, [0, 0, .02]);
    addExhibitBox(group, [w + .16, h + .16, .06], silver, [0, 0, .13]);
    createExhibitPhoto(group, cfg, w, h, .19, true);
    if (portraitMode) {
        addExhibitBox(group, [.07, h + .7, .1], cyan, [-w / 2 - .27, 0, .14]);
        addExhibitBox(group, [.07, h + .7, .1], cyan, [w / 2 + .27, 0, .14]);
        addExhibitBox(group, [w * .55, .07, .1], cyan, [0, h / 2 + .28, .14]);
    } else {
        addExhibitBox(group, [w + .72, .08, .1], cyan, [0, h / 2 + .28, .14]);
        addExhibitBox(group, [.55, .08, .1], cyan, [-w / 2 - .08, -h / 2 - .12, .14], [0, 0, -.42]);
        addExhibitBox(group, [.55, .08, .1], cyan, [w / 2 + .08, -h / 2 - .12, .14], [0, 0, .42]);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w + .04, h + .04), new THREE.MeshPhysicalMaterial({ color: 0xdff7ff, transparent: true, opacity: .08, roughness: .05, clearcoat: 1, depthWrite: false }));
    glass.position.z = .225; group.add(glass);
    createExhibitLabel(group, cfg, -h / 2 - .48, w + .35, { background: '#0b2942', accent: '#38c8ef', border: '#237fa4', meta: '#8ee9ff' }, .68);
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);
    return group;
}

function createAwardExhibit(cfg) {
    const group = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xd7b56b, roughness: .26, metalness: .72 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x17344c, roughness: .38, metalness: .22 });
    const ivory = new THREE.MeshStandardMaterial({ color: 0xf3eadb, roughness: .78 });
    const w = cfg.w, h = cfg.h;
    addExhibitBox(group, [w + .5, h + .5, .18], navy, [0, 0, 0]);
    addExhibitBox(group, [w + .28, h + .28, .08], brass, [0, 0, .12]);
    addExhibitBox(group, [w + .08, h + .08, .04], ivory, [0, 0, .18]);
    createExhibitPhoto(group, cfg, w - .1, h - .1, .22, false);
    const shelf = addExhibitBox(group, [w + .7, .12, .48], brass, [0, -h / 2 - .22, .12]);
    shelf.rotation.x = -.06;
    [-.38, 0, .38].forEach((x, index) => {
        const medal = new THREE.Mesh(new THREE.CylinderGeometry(.09 + index * .01, .09 + index * .01, .08, 24), brass);
        medal.rotation.x = Math.PI / 2; medal.position.set(x, -h / 2 - .18, .42); group.add(medal);
    });
    createExhibitLabel(group, cfg, -h / 2 - .72, w + .45, { background: '#f0e5d3', accent: '#b58a3c', border: '#b58a3c', title: '#17344c', meta: '#76502e' }, .66);
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);
    return group;
}

function createSeminarScreenExhibit(cfg) {
    const group = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: .2, metalness: .5 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x4bd5f4, emissive: 0x1eaed5, emissiveIntensity: .9, roughness: .16, metalness: .4 });
    const w = cfg.w, h = cfg.h;
    addExhibitBox(group, [w + .42, h + .42, .2], black, [0, 0, 0]);
    createExhibitPhoto(group, cfg, w, h, .13, true);
    addExhibitBox(group, [w + .56, .07, .09], cyan, [0, h / 2 + .25, .14]);
    addExhibitBox(group, [w * .66, .07, .09], cyan, [w * .12, -h / 2 - .24, .14]);
    const tagCanvas = document.createElement('canvas'); tagCanvas.width = 600; tagCanvas.height = 180;
    const tagCtx = tagCanvas.getContext('2d'); tagCtx.fillStyle = '#4bd5f4'; tagCtx.fillRect(0, 0, 600, 180);
    tagCtx.fillStyle = '#071722'; tagCtx.textAlign = 'center'; tagCtx.textBaseline = 'middle'; tagCtx.font = '800 68px ' + UI_FONT; tagCtx.fillText('SEMINAR · 2025', 300, 90);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.75, .46), new THREE.MeshStandardMaterial({ map: createSRGBCanvasTexture(tagCanvas), emissive: 0x4bd5f4, emissiveIntensity: .15 }));
    tag.position.set(-w / 2 + .7, h / 2 + .48, .18); group.add(tag);
    createExhibitLabel(group, cfg, -h / 2 - .52, w + .3, { background: '#111820', accent: '#4bd5f4', border: '#287b93', meta: '#8ee9ff' }, .7);
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);
    return group;
}

function createResearchPanoramaExhibit(cfg) {
    const group = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x102f4a, roughness: .3, metalness: .3 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd7b56b, roughness: .28, metalness: .66 });
    const w = cfg.w, h = cfg.h;
    addExhibitBox(group, [w + .5, h + .38, .15], navy, [0, 0, 0]);
    createExhibitPhoto(group, cfg, w, h, .12, true);
    addExhibitBox(group, [.55, .1, .1], brass, [-w / 2 - .18, h / 2 + .05, .14], [0, 0, -.55]);
    addExhibitBox(group, [.55, .1, .1], brass, [w / 2 + .18, -h / 2 - .05, .14], [0, 0, -.55]);
    const stats = [['743', 'ĐỀ TÀI'], ['2.000+', 'SINH VIÊN'], ['100', 'GIẢI THƯỞNG']];
    stats.forEach(([value, label], index) => {
        const c = document.createElement('canvas'); c.width = 420; c.height = 240; const ctx = c.getContext('2d');
        ctx.fillStyle = '#f0e5d3'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.strokeStyle = '#d7b56b'; ctx.lineWidth = 10; ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
        ctx.fillStyle = '#17344c'; ctx.textAlign = 'center'; ctx.font = '800 72px ' + UI_FONT; ctx.fillText(value, 210, 100);
        ctx.fillStyle = '#76502e'; ctx.font = '700 34px ' + UI_FONT; ctx.fillText(label, 210, 178);
        const chip = new THREE.Mesh(new THREE.PlaneGeometry(.82, .48), new THREE.MeshStandardMaterial({ map: createSRGBCanvasTexture(c), roughness: .62 }));
        chip.position.set((index - 1) * .94, -h / 2 - .38, .18); group.add(chip);
    });
    createExhibitLabel(group, cfg, h / 2 + .52, w + .25, { background: '#17344c', accent: '#d7b56b', border: '#d7b56b', meta: '#f0d598' }, .66);
    group.position.set(cfg.x, cfg.y, cfg.z); group.rotation.y = cfg.rotY; scene.add(group);
    return group;
}

function createResearchExhibit(cfg) {
    // Ver2 dùng một ngôn ngữ trưng bày thống nhất cho Cụm NCKH: ảnh được dán
    // nổi trực tiếp trên tường, không khung gỗ/kim loại, kính hay bảng tên rời.
    // Thông tin đầy đủ vẫn mở khi người xem chọn ảnh.
    if (USE_ZONE1_EDITORIAL_V2) return createWallPhotoTile(cfg);
    if (cfg.displayStyle?.startsWith('heritage-')) return createHeritageExhibit(cfg);
    if (cfg.displayStyle?.startsWith('digital-')) return createDigitalScholarExhibit(cfg);
    if (cfg.displayStyle === 'award') return createAwardExhibit(cfg);
    if (cfg.displayStyle === 'seminar-screen') return createSeminarScreenExhibit(cfg);
    if (cfg.displayStyle === 'research-panorama') return createResearchPanoramaExhibit(cfg);
    return createWallPicture(cfg);
}

function createResearchKiosk(position, rotationY) {
    const group = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x102f4a, roughness: .36, metalness: .18 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x76502e, roughness: .68, metalness: .04 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd7b56b, roughness: .28, metalness: .62 });
    const addBox = (size, material, xyz, rotX = 0) => {
        const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        object.position.set(...xyz); object.rotation.x = rotX; group.add(object); return object;
    };
    addBox([2.9, .14, 1.72], brass, [0, .07, 0]);
    addBox([2.72, .1, 1.56], navy, [0, .16, 0]);
    addBox([1.62, 1.08, .86], wood, [0, .68, .06]);
    addBox([1.42, .9, .7], navy, [0, .78, -.1]);
    addBox([3.05, .15, 1.96], navy, [0, 1.42, -.02], -.38);

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1200; screenCanvas.height = 700;
    const ctx = screenCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 1200, 700);
    gradient.addColorStop(0, '#0b2942'); gradient.addColorStop(1, '#086994');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 700);
    ctx.strokeStyle = '#42c9ee'; ctx.lineWidth = 8; ctx.strokeRect(28, 28, 1144, 644);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '800 64px ' + UI_FONT;
    ctx.fillText('TRA CỨU TƯ LIỆU NCKH', 600, 145);
    ctx.fillStyle = '#8ee9ff'; ctx.font = '500 38px ' + UI_FONT;
    ctx.fillText('Chọn các khung ảnh trên tường để xem chi tiết', 600, 220);
    ['04 NHÀ KHOA HỌC', '03 HOẠT ĐỘNG', '05 MỐC THỜI GIAN'].forEach((text, index) => {
        const x = 110 + index * 360;
        ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x, 320, 300, 190);
        ctx.fillStyle = '#d7b56b'; ctx.font = '700 36px ' + UI_FONT; ctx.fillText(text, x + 150, 420);
    });
    const screenTexture = createSRGBCanvasTexture(screenCanvas);
    const screenMaterial = new THREE.MeshStandardMaterial({ map: screenTexture, emissive: 0x0b5f8d, emissiveMap: screenTexture, emissiveIntensity: .28, roughness: .22 });
    addBox([2.75, .035, 1.66], screenMaterial, [0, 1.49, .12], -.38);
    addBox([2.48, .018, .035], brass, [0, 1.77, .22], -.38);
    group.position.set(position.x, position.y || 0, position.z);
    group.rotation.y = rotationY;
    scene.add(group);
    return group;
}

function createZoneTimeline(zone, entries) {
    const radius = WALL_MOUNT_R - .16;
    const lineMat = new THREE.MeshStandardMaterial({ color: USE_ZONE1_EDITORIAL_V2 ? 0x0092df : 0x17344c, roughness: .34, metalness: .28 });
    const dotMat = new THREE.MeshStandardMaterial({ color: USE_ZONE1_EDITORIAL_V2 ? 0xffcf62 : 0xd7b56b, roughness: .26, metalness: .68 });
    const steps = 36;
    const safeStart = .13;
    const safeSpan = .78;
    for (let i = 0; i < steps; i++) {
        const f0 = safeStart + i * (safeSpan / steps);
        const f1 = safeStart + (i + 1) * (safeSpan / steps);
        const p0 = zonePoint(zone, f0, radius);
        const p1 = zonePoint(zone, f1, radius);
        const mid = zonePoint(zone, (f0 + f1) / 2, radius);
        const segment = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(p1.x - p0.x, p1.z - p0.z) * 1.08, .08, .07), lineMat);
        segment.position.set(mid.x, 1.18, mid.z);
        segment.rotation.y = faceCoreRotY(mid.angle);
        scene.add(segment);
    }
    entries.forEach(entry => {
        const p = zonePoint(zone, entry.fraction, radius - .03);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.16, 24, 16), dotMat);
        dot.position.set(p.x, 1.18, p.z); scene.add(dot);
        createReferenceTitle({
            x: p.x, z: p.z, y: .68, rotY: faceCoreRotY(p.angle), text: entry.year,
            color: BLUE, curveRadius: radius, bgColor: '#f0e5d3', textColor: '#17344c', w: 1.4, h: .38
        });
    });
}

function buildZoneContents() {
    buildTopic5PortraitGallery();
}

const STANDARDIZED_PRINCIPAL_FILES = Object.freeze({
    'HT-01':'Lê Văn Thiêm.png', 'HT-02':'Đặng Thai Mai.png', 'HT-03':'Phạm Huy Thông.png',
    'HT-04':'GS.TS.NGND Ngu.png', 'HT-05':'Nguyễn Cảnh Toàn.png',
    'HT-06':'GS.TS.NGND Dương Trọng Bái.png', 'HT-07':'PGS.TS.NGND. Phạm Quý Tư.png',
    'HT-08':'GS.TS.NGND. Vũ Tuấn.png', 'HT-09':'PGS.TS.NGƯT Nghiêm Đình Vỳ.png',
    'HT-10':'GS.TS.NGƯT Đinh Quang Báo.png', 'HT-11':'GS.TS.NGƯT Nguyễn Viết Thịnh.png',
    'HT-12':'GS.TS.NGƯT Nguyễn Văn Minh.png', 'HT-13':'PGS.TS. Nguyễn Đức Sơn.png'
});

const STANDARDIZED_NAME_EXCEPTIONS = Object.freeze({
    'DT-15':'Dương Huy Bằng', 'DT-16':'Nguyễn Tân An',
    'DU-01':'Trần Văn Giàu(Đảng Ủy)', 'DU-17':'Nguyễn Văn Minh(Đảng Ủy)',
    'DU-18':'Nguyễn Văn Hiền(Đảng Ủy)'
});

// Tệp nằm trong hồ sơ HT-09 hiện là contact sheet 12 hiệu trưởng, không phải
// ảnh cá nhân. Dùng đúng bản chuẩn hóa riêng đang lưu ở thư mục cấp trên.
const STANDARDIZED_PORTRAIT_OVERRIDES = Object.freeze({
    'HT-09':'./HIỆU TRƯỞNG NHÀ TRƯỜNG /PGS.TS.NGƯT Nghiêm Đình Vỳ.png'
});

function standardizedPortraitPath(profile) {
    if (STANDARDIZED_PORTRAIT_OVERRIDES[profile.code]) {
        return STANDARDIZED_PORTRAIT_OVERRIDES[profile.code];
    }
    const original = String(profile.sources?.portrait || profile.image || '').replace(/^\.\//u, '');
    const slash = original.lastIndexOf('/');
    if (slash < 0) return profile.image;
    let fileName = STANDARDIZED_PRINCIPAL_FILES[profile.code];
    if (!fileName) {
        const displayName = STANDARDIZED_NAME_EXCEPTIONS[profile.code] || String(profile.name || '').replace(
            /^(?:(?:GS|PGS|TSKH|ThS|TS|NGND|NGƯT|Đồng chí|Nhà giáo)\.?\s*)+/u, ''
        );
        fileName = `${displayName}.png`;
    }
    return `./${original.slice(0, slash + 1)}Ảnh đã chuẩn hóa - ${fileName}`;
}

function profileModalText(profile) {
    return [
        profile.bio?.td ? `Học hàm, học vị: ${profile.bio.td}` : '',
        profile.bio?.cv ? `Quá trình công tác: ${profile.bio.cv}` : '',
        profile.bio?.que ? `Quê quán: ${profile.bio.que}` : ''
    ].filter(Boolean).join('\n\n');
}

function addTopic5AreaHeaderLogos({ key, titleAngle, titleWidth, radius, y, isCore }) {
    const logoRadius = isCore ? .47 : .50;
    // Đặt logo theo chiều đọc của biển. Khoảng cách được tính theo cung tường
    // nên cả logo và chữ vẫn bám đúng mặt cong thay vì dùng tọa độ cố định.
    const logoOffset = titleWidth / 2 + logoRadius * 1.22 + .34;
    const logoAngle = titleAngle - logoOffset / radius;
    const logoPosition = angle => [
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
    ];
    const logoRotation = angle => faceCoreRotY(angle) + (isCore ? Math.PI : 0);

    if (key === 'bt') {
        createEmbossedLogo(
            './image/youth-union-emblem-cutout.png',
            logoPosition(logoAngle), logoRadius, logoRotation(logoAngle), scene
        );
        const hnueAngle = titleAngle + logoOffset / radius;
        createEmbossedLogo(
            './image/hnue-emblem-cutout.png',
            logoPosition(hnueAngle), logoRadius * .92, logoRotation(hnueAngle), scene
        );
        return;
    }

    // Giữ đúng hệ biển của ver 2.3: khu Hiệu trưởng và Đảng ủy dùng logo HNUE.
    createEmbossedLogo(
        './image/hnue-emblem-cutout.png',
        logoPosition(logoAngle), logoRadius, logoRotation(logoAngle), scene
    );
}

function buildTopic5PortraitGallery() {
    const configurations = [
        { zoneId: 1, key: 'du', expected: 19, width: 3.80, accent: 0x9a6f3a, surface: 'outer' },
        { zoneId: 2, key: 'ht', expected: 13, width: 3.80, accent: 0xb58a43, surface: 'outer' },
        { zoneId: 3, key: 'bt', expected: 29, width: 3.55, accent: 0x235da8, surface: 'core' }
    ];

    configurations.forEach(configuration => {
        const zone = getZoneById(configuration.zoneId);
        const profiles = PROFILE_DATA.filter(profile => profile.rk === configuration.key);
        if (profiles.length !== configuration.expected) {
            console.warn(`[Chủ đề 5] ${zone.name}: dự kiến ${configuration.expected}, nhận ${profiles.length} hồ sơ.`);
        }

        const isCore = configuration.surface === 'core';
        const radius = isCore
            ? R_CORE + WALL_THICK / 2 + .15 + FRAME_DEPTH / 2
            : WALL_MOUNT_R;
        const wallStart = !isCore && Math.abs(zone.a0 + Math.PI / 2) < .001
            ? zone.a0 + ENTRANCE_HALF_ANGLE : zone.a0;
        const wallEnd = !isCore && Math.abs(zone.a1 - Math.PI * 3 / 2) < .001
            ? zone.a1 - ENTRANCE_HALF_ANGLE : zone.a1;
        // Lề động gồm nửa bề rộng ảnh và khoảng thở 0,42 đơn vị.
        // Nhờ vậy ảnh đầu/cuối không thể xuyên vào vách hướng tâm tại ranh giới khu.
        const marginAngle = isCore ? 0 : (configuration.width / 2 + .42) / radius;
        const start = wallStart + marginAngle;
        const end = wallEnd - marginAngle;
        const height = configuration.width / (10 / 9);

        profiles.forEach((profile, index) => {
            // Góc tăng dần tương ứng đúng chiều trái → phải khi đứng đối diện tường ngoài.
            // Vòng giữa kín 360° dùng tâm từng ô để ảnh đầu và cuối không trùng nhau.
            const fraction = isCore
                ? (index + .5) / profiles.length
                : (profiles.length === 1 ? .5 : index / (profiles.length - 1));
            const angle = THREE.MathUtils.lerp(start, end, fraction);
            const originalPortrait = profile.sources?.portrait
                ? `./${String(profile.sources.portrait).replace(/^\.\//u, '')}`
                : profile.image;
            createWallPhotoTile({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                y: isCore ? 3.45 : 3.72,
                rotY: faceCoreRotY(angle) + (isCore ? Math.PI : 0),
                w: configuration.width,
                h: height,
                curveRadius: isCore ? -radius : radius,
                imageUrl: standardizedPortraitPath(profile),
                modalImageUrl: originalPortrait,
                preserveAspect: true,
                photoDepth: .12,
                title: profile.name,
                year: profile.period,
                code: profile.code,
                zoneName: zone.name,
                content: profileModalText(profile),
                source: profile.sources?.references?.[0] || '',
                accent: configuration.accent,
                profile
            });
        });

        const titleAngle = isCore ? -Math.PI / 2 : (wallStart + wallEnd) / 2;
        const titleWidth = isCore ? 10.5 : configuration.key === 'ht' ? 15 : 13;
        const titleY = isCore ? 6.35 : 6.82;
        createZone1RaisedText({
            x: Math.cos(titleAngle) * radius,
            z: Math.sin(titleAngle) * radius,
            y: titleY,
            rotY: faceCoreRotY(titleAngle) + (isCore ? Math.PI : 0),
            curveRadius: isCore ? -radius : radius,
            w: titleWidth,
            h: isCore ? 1.05 : .72,
            text: zone.name.toUpperCase(),
            textRole: 'section-title',
            align: 'center',
            fontWeight: 900,
            textColor: '#d3b36d',
            depth: .095
        });
        addTopic5AreaHeaderLogos({
            key: configuration.key,
            titleAngle,
            titleWidth,
            radius,
            y: titleY,
            isCore
        });
    });
}

function getZone1TypographyProfile(cfg, canvas) {
    const text = String(cfg.text || '').trim();
    const length = [...text].length;
    const role = cfg.textRole || (cfg.h <= .70 ? 'photo-caption' : 'body');
    let sizeRatio;
    let minRatio;
    let captionRatio;

    if (role === 'section-title') {
        sizeRatio = .31; minRatio = .16; captionRatio = .24;
    } else if (role === 'photo-caption') {
        if (length <= 45) { sizeRatio = .38; captionRatio = .24; }
        else if (length <= 90) { sizeRatio = .32; captionRatio = .27; }
        else if (length <= 160) { sizeRatio = .27; captionRatio = .32; }
        else { sizeRatio = .23; captionRatio = .36; }
        minRatio = .15;
    } else {
        if (length <= 90) sizeRatio = .26;
        else if (length <= 180) sizeRatio = .21;
        else sizeRatio = .17;
        minRatio = .09;
        captionRatio = .30;
    }

    const automaticSize = Math.round(canvas.height * sizeRatio * (cfg.fontScale || 1));
    // maxFontSize cũ được giữ như một ngưỡng ưu tiên để các bố cục đã duyệt
    // không đột ngột nhỏ đi; nội dung mới không cần khai báo thuộc tính này.
    const preferredSize = Number.isFinite(cfg.maxFontSize)
        ? Math.max(automaticSize, cfg.maxFontSize)
        : automaticSize;
    return {
        role, length, preferredSize,
        recommendedMinSize: Math.max(18, Math.round(canvas.height * minRatio)),
        hardMinSize: Math.max(16, Math.round(canvas.height * .045)),
        captionRatio
    };
}

function getZone1CaptionRatio(text, role='photo-caption') {
    // Dùng canvas giả chỉ để tái sử dụng cùng quy tắc phân loại độ dài.
    return getZone1TypographyProfile({text, textRole:role, h:.5}, {height:1000}).captionRatio;
}

function createZone1RaisedText(cfg) {
    const aspect = Math.max(.18, cfg.w / cfg.h);
    const canvas = document.createElement('canvas');
    canvas.width = THREE.MathUtils.clamp(Math.round(1050 * Math.sqrt(aspect)), 720, 3072);
    canvas.height = Math.round(canvas.width / aspect);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const text = String(cfg.text || '').trim();
    const meta = String(cfg.meta || '').trim();
    const padX = Math.max(34, canvas.width * .045);
    const padY = Math.max(22, canvas.height * .11);
    const maxWidth = canvas.width - padX * 2;
    const maxHeight = canvas.height - padY * 2;
    const typography = getZone1TypographyProfile(cfg, canvas);
    let fontSize = Math.max(16, Math.min(typography.preferredSize, canvas.height * .44));
    const minSize = Math.min(fontSize, typography.recommendedMinSize);
    let lines = [];

    const buildLines = size => {
        ctx.font = `${cfg.fontWeight || 800} ${size}px ${UI_FONT}`;
        const result = [];
        text.split(/\n+/).forEach(paragraph => {
            let line = '';
            paragraph.trim().split(/\s+/).filter(Boolean).forEach(word => {
                const candidate = line ? `${line} ${word}` : word;
                if (line && ctx.measureText(candidate).width > maxWidth) {
                    result.push(line); line = word;
                } else line = candidate;
            });
            if (line) result.push(line);
        });
        return result;
    };
    while (fontSize >= minSize) {
        lines = buildLines(fontSize);
        const lineHeight = fontSize * 1.18;
        const metaHeight = meta ? Math.max(22, fontSize * .58) + fontSize * .18 : 0;
        if (lines.length * lineHeight + metaHeight <= maxHeight) break;
        fontSize -= 2;
    }
    // Nếu nội dung nguồn quá dài so với khối, tiếp tục co tới ngưỡng an toàn
    // để không cắt chữ, đồng thời cảnh báo để người thiết kế cân nhắc tăng khối.
    if (fontSize < minSize) {
        fontSize = minSize;
        lines = buildLines(fontSize);
        while (fontSize > typography.hardMinSize) {
            const lineHeight = fontSize * 1.18;
            const metaHeight = meta ? Math.max(22, fontSize * .58) + fontSize * .18 : 0;
            if (lines.length * lineHeight + metaHeight <= maxHeight) break;
            fontSize -= 2;
            lines = buildLines(fontSize);
        }
        if (fontSize < typography.recommendedMinSize) {
            console.warn('[Cụm 1] Khối chữ dài, nên tăng chiều cao:', cfg.label || text.slice(0, 72));
        }
    }
    // Luôn dựng ít nhất một lượt dòng, kể cả khi caller yêu cầu cỡ tối đa
    // nhỏ hơn ngưỡng suy ra từ chiều cao canvas.
    fontSize = Math.max(minSize, fontSize);
    if (!lines.length && text) lines = buildLines(Math.max(minSize, fontSize));

    const lineHeight = fontSize * 1.18;
    const metaSize = Math.max(20, fontSize * .56);
    const contentHeight = lines.length * lineHeight + (meta ? metaSize + fontSize * .18 : 0);
    const top = Math.max(padY, (canvas.height - contentHeight) / 2);
    const align = cfg.align === 'right' ? 'right' : cfg.align === 'center' ? 'center' : 'left';
    const x = align === 'left' ? padX : align === 'right' ? canvas.width - padX : canvas.width / 2;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(2,4,35,.72)';
    ctx.shadowBlur = Math.max(5, fontSize * .08);
    ctx.shadowOffsetY = Math.max(3, fontSize * .045);
    ctx.fillStyle = cfg.textColor || '#f5f3e8';
    ctx.font = `${cfg.fontWeight || 800} ${fontSize}px ${UI_FONT}`;
    lines.forEach((line, index) => ctx.fillText(line, x, top + index * lineHeight, maxWidth));
    if (meta) {
        ctx.shadowBlur = Math.max(3, metaSize * .06);
        ctx.fillStyle = '#d4af37';
        ctx.font = `800 ${metaSize}px ${UI_FONT}`;
        ctx.fillText(meta, x, top + lines.length * lineHeight + fontSize * .18, maxWidth);
    }

    const texture = createSRGBCanvasTexture(canvas);
    texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() || 4;
    const geometry = new THREE.PlaneGeometry(cfg.w, cfg.h, cfg.curveRadius ? 24 : 1, 1);
    if (cfg.curveRadius) bendGeometry(geometry, cfg.curveRadius);
    const face = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        map: texture, transparent: true, alphaTest: .035,
        roughness: .36, metalness: .02, side: THREE.DoubleSide
    }));
    face.position.set(cfg.x, cfg.y, cfg.z);
    face.rotation.y = cfg.rotY;
    face.castShadow = true;
    face.renderOrder = 4;
    scene.add(face);

    createLayeredRaisedSurface({
        geometry, texture, position: cfg, rotationY: cfg.rotY,
        tint: 0x9b7826, depth: cfg.depth || .085, layers: 7,
        roughness: .34, metalness: .38, transparent: true
    });
    return face;
}

function createZone1TextPanel(cfg) {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 760;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ZONE2_CONTENT_BLUE; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ZONE1_BA_PALETTE.dark; ctx.fillRect(0, 0, canvas.width, 118);
    ctx.fillStyle = ZONE1_BA_PALETTE.gold; ctx.fillRect(535, 150, 330, 9);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff'; ctx.font = '800 52px ' + UI_FONT;
    ctx.fillText(cfg.kicker || cfg.year || 'DẤU MỐC', 700, 30, 1280);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 64px ' + UI_FONT;
    wrapText(ctx, cfg.title, 700, 205, 1160, 72);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '500 38px ' + UI_FONT;
    wrapText(ctx, cfg.summary, 700, 485, 1160, 50);
    const texture = createSRGBCanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(cfg.w, cfg.h, 32, 1);
    geometry.translate(0, 0, .035); if (cfg.curveRadius) bendGeometry(geometry, cfg.curveRadius);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: .72, side: THREE.DoubleSide }));
    mesh.position.set(cfg.x, cfg.y, cfg.z); mesh.rotation.y = cfg.rotY;
    createLayeredRaisedSurface({geometry,texture,position:cfg,rotationY:cfg.rotY,tint:0x8ebbd1,depth:.10,layers:7});
    mesh.userData = { type: 'artifact', title: cfg.title, year: cfg.year, zoneName: cfg.zoneName,
        content: cfg.content || cfg.summary, source: cfg.source, color: RED,
        imageUrl: cfg.imageUrl, gallery: cfg.gallery, links: cfg.links, documents: cfg.documents };
    interactiveObjects.push(mesh); scene.add(mesh); return mesh;
}

function createZone1TealTextPanel(cfg) {
    if (ZONE1_RAISED_TEXT_DEMO) {
        const text = String(cfg.rawText ?? cfg.content ?? '').trim();
        const mesh = createZone1RaisedText({
            ...cfg, text, meta: cfg.year,
            align: cfg.alignToImage === 'right' ? 'right' : 'left',
            fontWeight: text.length > 150 ? 600 : 800,
            maxFontSize: cfg.maxFontSize
        });
        mesh.userData = {
            type:'artifact', title:cfg.label||'NỘI DUNG TƯ LIỆU', year:cfg.year,
            zoneName:cfg.zoneName, content:text, source:cfg.source,
            color:0xd4af37, links:cfg.links
        };
        if (cfg.interactive !== false) interactiveObjects.push(mesh);
        return mesh;
    }
    const canvas = document.createElement('canvas');
    // Giữ đúng tỷ lệ của mặt phẳng 3D. Canvas 1200x620 cố định trước đây làm
    // các bảng ngang bị kéo giãn chữ khi texture phủ lên hình học.
    const panelAspect = Math.max(.1, cfg.w / cfg.h);
    const targetArea = 1200 * 720;
    canvas.width = THREE.MathUtils.clamp(Math.round(Math.sqrt(targetArea * panelAspect)), 640, 4096);
    canvas.height = Math.round(canvas.width / panelAspect);
    if (canvas.height > 2048) {
        canvas.height = 2048;
        canvas.width = Math.round(canvas.height * panelAspect);
    }
    const ctx = canvas.getContext('2d');
    const pad = Number.isFinite(cfg.padding) ? cfg.padding : 68;
    ctx.fillStyle = ZONE2_CONTENT_BLUE; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const alignToImage = cfg.alignToImage === 'right' ? 'right' : 'left';
    const accentX = alignToImage === 'left' ? 0 : canvas.width - 18;
    ctx.fillStyle = ZONE1_BA_PALETTE.gold; ctx.fillRect(accentX, 0, 18, canvas.height);
    const text = String(cfg.rawText ?? cfg.content ?? '').trim();
    const maxWidth = canvas.width - pad * 2;
    const maxHeight = canvas.height - pad * 2;
    const buildLines = () => {
        const lines = [];
        text.split(/\n+/).forEach(paragraph => {
            const words = paragraph.trim().split(/\s+/).filter(Boolean);
            let line = '';
            words.forEach(word => {
                const candidate = line ? `${line} ${word}` : word;
                if (line && ctx.measureText(candidate).width > maxWidth) {
                    lines.push(line); line = word;
                } else line = candidate;
            });
            if (line) lines.push(line);
        });
        return lines;
    };
    // Mỗi ô có lượng chữ khác nhau: bắt đầu từ cỡ lớn rồi giảm dần cho tới
    // khi nguyên văn nguồn vừa trọn ô. Không dùng một cỡ chữ cố định khiến
    // chú thích ngắn bị lọt thỏm hoặc đoạn dài bị cắt.
    const requestedMaxFontSize = Number.isFinite(cfg.maxFontSize) ? cfg.maxFontSize : 260;
    let fontSize = Math.min(requestedMaxFontSize, Math.round(canvas.height * .42));
    let lineHeight = fontSize * 1.38;
    let lines = [];
    while (fontSize >= 24) {
        ctx.font = `500 ${fontSize}px ${UI_FONT}`;
        lines = buildLines();
        lineHeight = fontSize * 1.38;
        if (lines.length * lineHeight <= maxHeight) break;
        fontSize -= 2;
    }
    ctx.textAlign = alignToImage;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 ${fontSize}px ${UI_FONT}`;
    const textX = alignToImage === 'left' ? pad : canvas.width - pad;
    const textTop = Math.max(pad, (canvas.height - lines.length * lineHeight) / 2);
    lines.forEach((line,index)=>ctx.fillText(line,textX,textTop+index*lineHeight,maxWidth));
    ctx.fillStyle = ZONE1_BA_PALETTE.gold;
    const ruleW = Math.min(240, maxWidth * .26);
    ctx.fillRect(alignToImage === 'left' ? pad : canvas.width-pad-ruleW, Math.max(24,textTop-28), ruleW, 7);
    const texture = createSRGBCanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(cfg.w, cfg.h, 24, 1);
    geometry.translate(0, 0, .035);
    if (cfg.curveRadius) bendGeometry(geometry, cfg.curveRadius);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map:texture, roughness:.72, side:THREE.DoubleSide }));
    mesh.position.set(cfg.x,cfg.y,cfg.z); mesh.rotation.y=cfg.rotY;
    createLayeredRaisedSurface({geometry,texture,position:cfg,rotationY:cfg.rotY,tint:0x8ebbd1,depth:.10,layers:7});
    mesh.userData={type:'artifact',title:cfg.label||'NỘI DUNG TƯ LIỆU',year:cfg.year,zoneName:cfg.zoneName,content:text,source:cfg.source,color:0x0092df,links:cfg.links};
    // Một số bảng chữ chỉ là thành phần trình bày gắn với ảnh. Khi
    // interactive=false, bảng vẫn hiển thị đầy đủ nhưng không hover/click
    // và không mở modal như một hiện vật độc lập.
    if (cfg.interactive !== false) interactiveObjects.push(mesh);
    scene.add(mesh); return mesh;
}

function createZone1CaptionedPhotoCard(cfg) {
    if (ZONE1_RAISED_TEXT_DEMO) {
        const captionH = cfg.h * (cfg.captionRatio || getZone1CaptionRatio(cfg.content || cfg.title));
        const imageH = cfg.h - captionH;
        const photo = createWallPhotoTile({
            ...cfg,
            y: cfg.y + captionH / 2,
            h: imageH,
            imageUrl: cfg.imageUrl,
            title: cfg.title,
            content: cfg.content,
            displayMode: 'photo-caption',
            enableHoverBorder: true
        });
        createZone1RaisedText({
            ...cfg,
            y: cfg.y - imageH / 2,
            h: captionH,
            text: cfg.content || cfg.title,
            textRole: 'photo-caption',
            align: 'left',
            fontWeight: 800,
            maxFontSize: cfg.captionFontSize || 62,
            depth: .075
        });
        return photo;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 820;
    const ctx = canvas.getContext('2d');
    const imageBox = { x: 0, y: 0, w: 1200, h: 650 };
    const captionTop = 650;
    const drawCard = image => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#dfeffc'; ctx.fillRect(imageBox.x, imageBox.y, imageBox.w, imageBox.h);
        if (image) drawCanvasImageCover(ctx, image, imageBox.x, imageBox.y, imageBox.w, imageBox.h);
        ctx.fillStyle = ZONE2_CONTENT_BLUE; ctx.fillRect(0, captionTop, 1200, 170);
        ctx.fillStyle = ZONE1_BA_PALETTE.gold; ctx.fillRect(24, captionTop + 24, 8, 122);
        const text = String(cfg.content || cfg.title || '').trim();
        const maxWidth = 1080;
        let fontSize = 34; let lines = [];
        do {
            ctx.font = `600 ${fontSize}px ${UI_FONT}`;
            lines = []; let line = '';
            text.split(/\s+/).forEach(word => {
                const candidate = line ? `${line} ${word}` : word;
                if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
                else line = candidate;
            });
            if (line) lines.push(line);
            if (lines.length <= 3) break;
            fontSize -= 2;
        } while (fontSize >= 20);
        const lineHeight = fontSize * 1.18;
        const textTop = captionTop + (170 - lines.length * lineHeight) / 2;
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        lines.forEach((line, index) => ctx.fillText(line, 52, textTop + index * lineHeight, maxWidth));
    };
    drawCard(null);
    const texture = createSRGBCanvasTexture(canvas);
    loadDisplayTexture(cfg.imageUrl, renderer, loadedTexture => {
        drawCard(loadedTexture.image); texture.needsUpdate = true; loadedTexture.dispose(); framePolicy.invalidate(3);
    });
    const geometry = new THREE.PlaneGeometry(cfg.w, cfg.h, 24, 1);
    geometry.translate(0, 0, .035);
    if (cfg.curveRadius) bendGeometry(geometry, cfg.curveRadius);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map:texture, roughness:.68, side:THREE.DoubleSide }));
    const hoverGeometry = new THREE.EdgesGeometry(geometry, 20);
    hoverGeometry.translate(0, 0, .012);
    const hoverBorder = new THREE.LineSegments(hoverGeometry, new THREE.LineBasicMaterial({
        color:0xd6b46a, transparent:true, opacity:0, depthWrite:false, toneMapped:false
    }));
    hoverBorder.renderOrder = 5;
    mesh.add(hoverBorder);
    mesh.position.set(cfg.x, cfg.y, cfg.z); mesh.rotation.y = cfg.rotY;
    mesh.castShadow = true; mesh.receiveShadow = true;
    createLayeredRaisedSurface({
        geometry, texture, position: cfg, rotationY: cfg.rotY,
        tint: 0xa4a4a4, depth: cfg.photoDepth || .105, layers: 7
    });
    mesh.userData = {
        type:'artifact', displayMode:'photo-caption', title:cfg.title, zoneName:cfg.zoneName,
        content:cfg.content, source:cfg.source, color:0x0092df, imageUrl:cfg.imageUrl,
        hoverBorder
    };
    interactiveObjects.push(mesh); scene.add(mesh); return mesh;
}

function createZone1Infographic(zone, cfg) {
    const innerSide = cfg.side === 'inner';
    const radius = innerSide ? R_CORE + WALL_THICK / 2 + .07 : WALL_MOUNT_R - .025;
    const point = zonePoint(zone, cfg.fraction, radius);
    // Ver2 giữ đúng tỉ lệ ảnh gốc 943 × 2000 và kéo tấm infographic gần
    // suốt chiều cao hữu dụng của tường: chừa chân tường và dải tiêu đề trên.
    const displayH = USE_ZONE1_EDITORIAL_V2 ? 7.5 : 4.84;
    const displayW = USE_ZONE1_EDITORIAL_V2 ? displayH * 943 / 2000 : 2.28;
    const displayY = USE_ZONE1_EDITORIAL_V2 ? 4.55 : 4.85;
    createWallPhotoTile({
        x: point.x, z: point.z, y: displayY, rotY: faceCoreRotY(point.angle) + (innerSide ? Math.PI : 0),
        w: displayW, h: displayH, curveRadius: innerSide ? -radius : radius, imageUrl: cfg.imageUrl,
        title: cfg.title, year: cfg.year, content: cfg.content, source: cfg.source,
        links: cfg.links, accent: cfg.accent || RED, backingColor: cfg.backingColor, zoneName: zone.name,
        permanentBorder: true, permanentBorderColor: 0x0092df, displayMode: 'infographic'
    });
    // Ở bản editorial v2, infographic là một tấm in nổi trực tiếp trên tường,
    // không dùng khung ray hoặc đường viền trang trí.
    if (USE_ZONE1_EDITORIAL_V2) return;
    const fractionHalfWidth = 1.30 / (Math.abs(zone.a1 - zone.a0) * radius);
    if (innerSide) {
        [
            { pad:.18, color:0x9a744f, opacity:.95 },
            { pad:.08, color:0xc6a25c, opacity:1 }
        ].forEach(layer => {
            const geometry = new THREE.PlaneGeometry(2.28 + layer.pad, 4.84 + layer.pad, 32, 1);
            bendGeometry(geometry, -radius);
            const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), new THREE.LineBasicMaterial({ color:layer.color, transparent:true, opacity:layer.opacity, toneMapped:false }));
            outline.position.set(point.x, 4.85, point.z); outline.rotation.y = faceCoreRotY(point.angle) + Math.PI;
            outline.renderOrder = 4; scene.add(outline);
        });
        return;
    }
    createCurvedGlassZoneFrame({
        zone, radius: radius - .018, start: cfg.fraction - fractionHalfWidth, end: cfg.fraction + fractionHalfWidth,
        bottom: 2.22, top: 7.48, showGlass: false, railColor: 0x9a744f, railWidth: .085, emissiveIntensity: .015
    });
    createCurvedGlassZoneFrame({
        zone, radius: radius - .006, start: cfg.fraction - fractionHalfWidth + .006, end: cfg.fraction + fractionHalfWidth - .006,
        bottom: 2.36, top: 7.34, showGlass: false, railColor: 0xc6a25c, railWidth: .03, emissiveIntensity: .08
    });
}

function buildZone1EditorialV2() {
    const Z = getZoneById(1);
    const outer = WALL_MOUNT_R - .055;
    const inner = R_CORE + WALL_THICK / 2 + .055;
    const base = 'Tư liệu cụm 1/';
    const xepRoot = base + 'Khu vực Xếp bút nghiên/';
    const doi146Root = xepRoot + 'Một số hình ảnh của Đội 146 ĐHSP Hà Nội tham gia khắc phục hậu quả chiến tranh tại Hầm Nà Tòng, Đồng Mỏ, Lạng Sơn, 1972/';
    const td32Root = xepRoot + 'Ảnh Đội Thanh niên Xung kích hoạt động tại mặt trận Lạng Sơn; xây dựng phòng tuyến sông Cầu, bảo vệ Thủ đô/';
    const sourceLinks = [
        { label: 'Bài viết lịch sử HNUE', url: 'https://staff.hnue.edu.vn/Tintuc-Sukien/Trangtintonghop/tabid/260/news/8/LichsuDHSPHaNoiThoiki1956-1965phanIIThapsangngonluaBasansang.aspx' },
        { label: 'Bảo tàng Lịch sử Quốc gia', url: 'https://baotanglichsu.vn/vi/Articles/3097/14827/noi-khoi-nguon-phong-trao-ba-san-sangcua-thanh-nien-viet-nam-thoi-chong-my.html' }
    ];
    const zoneArcLength = Math.abs(Z.a1 - Z.a0) * outer;
    // Neo cố định mốc 1979; suy ngược tâm 1972 và infographic để khoảng
    // trống mép–mép giữa ba phần luôn bằng 0.50 đơn vị theo cung tường.
    const trungDoanCenter=.145;
    const xepSectionGap=.50;
    const doi146Center=trungDoanCenter+(4.575+xepSectionGap+2.955)/zoneArcLength;
    const xepInfoW=7.5*943/2000;
    const xepInfoCenter=doi146Center+(3.01+xepSectionGap+xepInfoW/2)/zoneArcLength;
    const pCenter = zonePoint(Z, .5, MID_R);
    createZone3DAudio(Z.audio, new THREE.Vector3(pCenter.x, WALL_H / 2, pCenter.z), Z.id);
    const titleP = zonePoint(Z, .5, outer);
    createReferenceTitle({ x:titleP.x,z:titleP.z,y:9.35,rotY:faceCoreRotY(titleP.angle),text:'YÊU NƯỚC CÁCH MẠNG',
        color:RED,curveRadius:outer,bgColor:'#8f1f18',textColor:'#fff4cf',w:7.5,h:.72 });

    // Hai infographic giữ vai trò bảng tổng quan độc lập ở hai đầu tường.
    createZone1Infographic(Z, { fraction:.86, title:'PHONG TRÀO BA SẴN SÀNG', year:'1964',
        imageUrl:'infographic/inforgraphic phong trào Ba sẵn sàng.png',
        content:'Từ phong trào Tam bất kỳ do BCH Đoàn Trường khởi xướng đến lời hiệu triệu Ba sẵn sàng lan rộng trong thanh niên Thủ đô và miền Bắc.',
        source:'Tư liệu tổng hợp Chủ đề 3', links:sourceLinks, accent:0x0092df, backingColor:0x006ea8 });
    createZone1Infographic(Z, { fraction:xepInfoCenter, title:'XẾP BÚT NGHIÊN LÊN ĐƯỜNG RA TRẬN', year:'1966–1979',
        imageUrl:'infographic/Infographic phong trào Xếp bút nghiên lên đường ra trận.png',
        content:'Cán bộ và sinh viên tạm gác việc giảng dạy, học tập để trực tiếp chiến đấu, phục vụ chiến đấu và bảo vệ Tổ quốc.',
        source:'Tư liệu tổng hợp Chủ đề 3', links:sourceLinks });

    const pointAtDistance = (center, distance) => zonePoint(Z, center + distance / zoneArcLength, outer);
    const cleanXepCaption = file => file.replace(/\.(?:jpe?g|png)$/iu,'').replaceAll('_',' ').replace(/\s+/gu,' ').trim();
    const withoutSmall1979 = text => String(text).replace(/(?:,|\s)\s*(?:5\s*\/\s*)?1979\b/giu,'').replace(/\s+/gu,' ').trim();
    const placeXepPhoto = ({center,offset=0,y,w,h,file,title,year='1979',root=xepRoot,captionRatio,captionMaxHeight,captionFontSize}) => {
        const p = pointAtDistance(center,offset);
        const caption = title || cleanXepCaption(file);
        // Đồng bộ với Ba sẵn sàng: ảnh và dải chú thích là hai mặt phẳng riêng.
        // Không kéo canvas ảnh–chữ cố định 1200x820 lên các khung có tỷ lệ khác nhau.
        const captionH = THREE.MathUtils.clamp(h * (captionRatio || .22), .36, captionMaxHeight || .50);
        const imageH = h - captionH;
        createWallPhotoTile({x:p.x,z:p.z,y:y+captionH/2,rotY:faceCoreRotY(p.angle),curveRadius:outer,
            w,h:imageH,imageUrl:root+file,title:caption,year,content:caption,
            source:'Tư liệu Khu vực Xếp bút nghiên',accent:0x0092df,backingColor:0x006ea8,
            zoneName:Z.name,displayMode:'photo-caption',enableHoverBorder:true});
        createStoryCaption({x:p.x,z:p.z,y:y-imageH/2,rotY:faceCoreRotY(p.angle),curveRadius:outer,
            title:caption,meta:year,zoneName:Z.name,bgColor:ZONE2_CONTENT_BLUE,w,h:captionH,
            maxFontSize:captionFontSize});
    };
    const placeXepBarePhoto = ({center,offset=0,y,w,h,file,title,year='1979',root=xepRoot}) => {
        const p = pointAtDistance(center,offset);
        const caption = title || cleanXepCaption(file);
        createWallPhotoTile({x:p.x,z:p.z,y,rotY:faceCoreRotY(p.angle),curveRadius:outer,w,h,
            imageUrl:root+file,title:caption,year,content:caption,source:'Tư liệu Khu vực Xếp bút nghiên',
            accent:0x0092df,backingColor:0x006ea8,zoneName:Z.name,displayMode:'photo-caption',enableHoverBorder:true});
    };
    const placeXepSharedTitle = ({center,offset=0,y,w,h=.42,text,year,interactive=true,alignToImage='left',maxFontSize=48,padding}) => {
        const p = pointAtDistance(center,offset);
        if (h >= .8) {
            createZone1TealTextPanel({x:p.x,z:p.z,y,rotY:faceCoreRotY(p.angle),curveRadius:outer,
                w,h,rawText:text,alignToImage,label:text,year,
                source:'Tư liệu Khu vực Xếp bút nghiên',links:sourceLinks,
                zoneName:Z.name,maxFontSize,padding,interactive});
        } else {
            createStoryCaption({x:p.x,z:p.z,y,rotY:faceCoreRotY(p.angle),curveRadius:outer,
                title:text,meta:year,zoneName:Z.name,bgColor:ZONE2_CONTENT_BLUE,w,h,maxFontSize});
        }
    };
    const placeXepText = ({center,offset=0,y,w,h,text,label,maxFontSize=78}) => {
        const p = pointAtDistance(center,offset);
        createZone1TealTextPanel({x:p.x,z:p.z,y,rotY:faceCoreRotY(p.angle),curveRadius:outer,
            w,h,rawText:text,alignToImage:'left',label,source:'Tư liệu Khu vực Xếp bút nghiên',
            links:sourceLinks,zoneName:Z.name,maxFontSize});
    };
    // Viền cụm bám đúng mép ngoài của ảnh/khối nội dung, tương tự viền
    // infographic; không chừa khoảng đệm nằm ngoài kích thước đã khai báo.
    const placeZone1GroupOutline = ({center,offset=0,y,w,h,pad=.08}) => {
        const p = pointAtDistance(center,offset);
        const geometry = new THREE.PlaneGeometry(w+pad*2,h+pad*2,32,1);
        geometry.translate(0,0,.065);
        bendGeometry(geometry,outer);
        const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry,20),
            new THREE.LineBasicMaterial({color:0x0092df,transparent:true,opacity:.72,depthWrite:false,toneMapped:false})
        );
        outline.position.set(p.x,y,p.z);
        outline.rotation.y=faceCoreRotY(p.angle);
        outline.renderOrder=4;
        scene.add(outline);
    };

    // Căn mép trên hai bảng giới thiệu theo mép trên infographic Xếp bút
    // nghiên (displayY 4.55 + nửa chiều cao 7.5 = 8.30).
    const xepInfoTop = 8.30;
    const doi146IntroH = .98;
    const doi146IntroY = xepInfoTop - doi146IntroH / 2;
    // Bố cục theo sơ đồ draw.io: infographic -> Đội 146 -> đài quan sát -> Trung đoàn 32.
    placeXepText({center:doi146Center,y:doi146IntroY,w:6.05,h:doi146IntroH,label:'ĐỘI THANH NIÊN XUNG KÍCH · 1972',maxFontSize:56,
        text:'Cuối năm 1972, Đội Thanh niên Xung kích gồm 36 cán bộ, sinh viên Trường Đại học Sư phạm Hà Nội I đã tham gia phục vụ giao thông vận tải, khắc phục hậu quả bom đạn Mỹ trên tuyến đường sắt Hà Nội – Lạng Sơn'});
    placeZone1GroupOutline({center:doi146Center,y:doi146IntroY,w:6.05,h:doi146IntroH,pad:.04});
    // Cụm trái: ảnh trên bằng đúng tổng chiều ngang hai ảnh dưới và khe giữa.
    // Các khe .06–.08 tạo nhịp đều, không còn ảnh trên nhô khỏi hai ảnh dưới.
    placeXepBarePhoto({center:doi146Center,offset:-1.60,y:6.00,w:2.64,h:2.25,file:'Một số hình ảnh của Đội 146 ĐHSP Hà Nội tham gia khắc phục hậu quả chiến tranh tại Hầm Nà Tòng, Đồng Mỏ, Lạng Sơn, 1972 - 3.jpg',year:'1972',root:doi146Root});
    placeXepBarePhoto({center:doi146Center,offset:-2.275,y:4.275,w:1.29,h:1.10,file:'Một số hình ảnh của Đội 146 ĐHSP Hà Nội tham gia khắc phục hậu quả chiến tranh tại Hầm Nà Tòng, Đồng Mỏ, Lạng Sơn, 1972 - 3(1).jpg',year:'1972',root:doi146Root});
    placeXepBarePhoto({center:doi146Center,offset:-.925,y:4.275,w:1.29,h:1.10,file:'Một số hình ảnh của Đội 146 ĐHSP Hà Nội tham gia khắc phục hậu quả chiến tranh tại Hầm Nà Tòng, Đồng Mỏ, Lạng Sơn, 1972 - 3(2).jpg',year:'1972',root:doi146Root});
    placeXepSharedTitle({center:doi146Center,offset:-1.60,y:3.45,w:2.64,year:'1972',maxFontSize:112,text:'Một số hình ảnh của Đội 146 ĐHSP Hà Nội tham gia khắc phục hậu quả chiến tranh tại Hầm Nà Tòng, Đồng Mỏ, Lạng Sơn, 1972 - 3'});

    // Cụm phải được tăng kích thước nhưng vẫn nằm gọn trong bề ngang bảng 1972.
    placeXepPhoto({center:doi146Center,offset:1.65,y:6.05,w:2.70,h:2.00,file:'Đồng chí Bí thư Đoàn trường Trần Quang Nhiếp phát biểu tại lễ xuất phát đội 146.jpg',year:'1972',root:doi146Root,captionRatio:.28,captionMaxHeight:.58,captionFontSize:118});
    placeXepPhoto({center:doi146Center,offset:.965,y:4.14,w:1.35,h:1.55,file:'Nữ sinh viên hát tại lễ xuất phát đội 146 dì tham gia khắc phục hậu quả chiến tranh 1972.jpg',year:'1972',root:doi146Root,captionRatio:.30,captionMaxHeight:.48,captionFontSize:102});
    placeXepPhoto({center:doi146Center,offset:2.335,y:4.14,w:1.35,h:1.55,file:'Quang cảnh buổi lễ xuất phát.jpg',year:'1972',root:doi146Root,captionRatio:.30,captionMaxHeight:.48,captionFontSize:108});
    placeXepPhoto({center:doi146Center,offset:-1.48,y:1.78,w:2.95,h:2.25,file:'Ảnh tổ trực đài quan sát trên sân thượng tòa nhà A7.jpg',year:'1972',captionRatio:.27,captionMaxHeight:.62,captionFontSize:126});
    placeXepText({center:doi146Center,offset:1.50,y:1.78,w:2.95,h:2.25,label:'TỔ TRỰC ĐÀI QUAN SÁT A7 · 07/8/1972',maxFontSize:72,
        text:"Ngày 07/8/1972, Đại đội Tự vệ Trường Đại học Sư phạm Hà Nội I đã phối hợp với lực lượng quân sự huyện Từ Liêm bắn rơi một máy bay F-4 của Mỹ. Tổ trực đài quan sát đặt trên sân thượng toà nhà A7 của Trường được coi là 'con mắt phía tây của thành phố' và được tặng thưởng Huân chương Kháng chiến hạng Ba."});
    placeZone1GroupOutline({center:doi146Center,offset:-1.60,y:5.18,w:2.64,h:3.90});
    placeZone1GroupOutline({center:doi146Center,offset:1.65,y:5.21,w:2.72,h:3.75});
    placeZone1GroupOutline({center:doi146Center,offset:.01,y:1.78,w:5.93,h:2.25});

    const trungDoanIntroH = .92;
    const trungDoanIntroY = xepInfoTop - trungDoanIntroH / 2;
    placeXepText({center:trungDoanCenter,y:trungDoanIntroY,w:9.45,h:trungDoanIntroH,label:'TRUNG ĐOÀN 32 · 1979',maxFontSize:54,
        text:"Tháng 5 năm 1979, Trường Đại học Sư phạm Hà Nội I thành lập Trung đoàn 32 gồm 1.345 người (gần 1/3 số cán bộ, sinh viên của Trường lúc đó), có nhiệm vụ tham gia xây dựng phòng tuyến sông Cầu, bảo vệ Thủ đô. Với khẩu hiệu: 'Mỗi thước chiến hào làm đẹp lòng chiến sĩ. Mỗi mét chiến hào là một vị trí tiến công'."});
    placeZone1GroupOutline({center:trungDoanCenter,y:trungDoanIntroY,w:9.45,h:trungDoanIntroH,pad:.04});
    // Bố cục 1979 gồm hai cột dọc cân nhau. Mỗi nhóm nội dung có viền riêng;
    // các ảnh/ô chữ bên trong nhóm ghép liền, không dùng năm nhỏ trên mặt tường.
    const trungDoanBodyDrop=.20;
    const left1979X=-2.40, right1979X=2.40, column1979W=4.35;
    const mosaicX=left1979X, mosaicCellW=column1979W/2, mosaicHalf=mosaicCellW/2;
    const mosaicRows=[
        {y:6.65,file:'Hiệu trưởng Dương Trọng Bái đến thăm cán bộ, chiến sĩ Trung đoàn 32 trên phòng tuyến Sông Cầu, 1979.jpg',photo:-mosaicHalf,title:mosaicHalf},
        {y:5.30,file:'Cán bộ kĩ thuật Đoàn Nguyễn Huệ nghiệm thu sau mỗi ngày làm việc phân việc của trường ĐHSP Hà Nội trên phòng tuyến Sông Cầu, 1979.jpg',photo:mosaicHalf,title:-mosaicHalf},
        {y:3.95,file:'Ban chỉ huy Trung đoàn 32 hội ý phương án mới ngay trên phòng tuyến.jpg',photo:-mosaicHalf,title:mosaicHalf}
    ];
    mosaicRows.forEach(item=>{
        placeXepBarePhoto({center:trungDoanCenter,offset:mosaicX+item.photo,y:item.y-trungDoanBodyDrop,w:mosaicCellW,h:1.35,file:item.file,year:'',root:td32Root});
        placeXepSharedTitle({center:trungDoanCenter,offset:mosaicX+item.title,y:item.y-trungDoanBodyDrop,w:mosaicCellW,h:1.35,year:'',
            text:withoutSmall1979(cleanXepCaption(item.file)),interactive:false,
            alignToImage:item.photo < item.title ? 'left' : 'right',maxFontSize:82,padding:38});
    });
    placeZone1GroupOutline({center:trungDoanCenter,offset:mosaicX,y:5.30-trungDoanBodyDrop,w:column1979W,h:4.05});

    const activityGap=.10, activityW=(column1979W-activityGap)/2, activityY=2.28-trungDoanBodyDrop, activityH=1.55;
    placeXepPhoto({center:trungDoanCenter,offset:left1979X-(activityW+activityGap)/2,y:activityY,w:activityW,h:activityH,file:'Thi đấu bóng chuyền trong ngày nghỉ trên phòng tuyến Sông Cầu, 1979.jpg',title:'Thi đấu bóng chuyền trong ngày nghỉ trên phòng tuyến Sông Cầu',year:'',root:td32Root});
    placeXepPhoto({center:trungDoanCenter,offset:left1979X+(activityW+activityGap)/2,y:activityY,w:activityW,h:activityH,file:'Phút nghỉ ngơi giải lao của CBSV khoa Lịch sử trên phòng tuyến sông Cầu.jpg',year:'',root:td32Root});
    placeZone1GroupOutline({center:trungDoanCenter,offset:left1979X,y:activityY,w:column1979W,h:activityH});

    // Cột phải: ba cụm độc lập nhưng thẳng trên cùng một trục dọc.
    const ceremonyGap=.06, ceremonyCellW=(column1979W-ceremonyGap)/2;
    placeXepBarePhoto({center:trungDoanCenter,offset:right1979X-(ceremonyCellW+ceremonyGap)/2,y:6.80-trungDoanBodyDrop,w:ceremonyCellW,h:1.05,file:'Lễ xuất phát Trung đoàn 32 đi xây dựng phòng tuyến Sông Cầu năm 1979 - 1.jpg',year:'',root:td32Root});
    placeXepBarePhoto({center:trungDoanCenter,offset:right1979X+(ceremonyCellW+ceremonyGap)/2,y:6.80-trungDoanBodyDrop,w:ceremonyCellW,h:1.05,file:'Lễ xuất phát Trung đoàn 32 đi xây dựng phòng tuyến Sông Cầu năm 1979 - 2.jpg',year:'',root:td32Root});
    placeXepSharedTitle({center:trungDoanCenter,offset:right1979X,y:6.065-trungDoanBodyDrop,w:column1979W,h:.42,year:'',text:'Lễ xuất phát Trung đoàn 32 đi xây dựng phòng tuyến Sông Cầu',interactive:false,maxFontSize:112});
    placeZone1GroupOutline({center:trungDoanCenter,offset:right1979X,y:6.59-trungDoanBodyDrop,w:column1979W,h:1.47});

    placeXepBarePhoto({center:trungDoanCenter,offset:right1979X,y:5.15-trungDoanBodyDrop,w:column1979W,h:1.22,file:'Lễ kết nạp đảng viên ngay trên phòng tuyến, 1979.jpg',year:'',root:td32Root});
    placeXepSharedTitle({center:trungDoanCenter,offset:right1979X,y:4.33-trungDoanBodyDrop,w:column1979W,h:.42,year:'',text:'Lễ kết nạp đảng viên ngay trên phòng tuyến',interactive:false,maxFontSize:126});
    placeZone1GroupOutline({center:trungDoanCenter,offset:right1979X,y:4.94-trungDoanBodyDrop,w:column1979W,h:1.64});

    const unitX=right1979X, unitW=column1979W, unitGap=0, unitCellW=unitW/2;
    const unitGroup=[
        {o:unitX-unitCellW/2,y:3.51,file:'Khoa Ngữ văn xuất quân trên phòng tuyến Sông Cầu, 5_1979.jpg'},
        {o:unitX+unitCellW/2,y:3.51,file:'Khoa Giáo dục Chính trị - đơn vị dẫn đầu Trung đoàn 32 ĐHSP Hà Nội I trên phòng tuyến về năng suất lao động và phá đá.jpg'},
        {o:unitX-unitCellW/2,y:2.61,file:'Đại đội khoa Hoá lao động trên phòng tuyến.jpg'},
        {o:unitX+unitCellW/2,y:2.61,file:'CBSV sẵn sàng tinh thần tình nguyện lên đường chiến đấu bảo vệ Tổ quốc khi chiến tranh Biên giới xảy ra, 1979.jpg'}
    ];
    unitGroup.forEach(item=>placeXepBarePhoto({center:trungDoanCenter,offset:item.o,y:item.y-trungDoanBodyDrop,w:unitCellW,h:.90,file:item.file,year:'',root:td32Root}));
    placeXepSharedTitle({center:trungDoanCenter,offset:unitX,y:1.95-trungDoanBodyDrop,w:unitW,h:.42,year:'',text:'Cán bộ sinh viên sẵn sàng tình nguyện',interactive:false,maxFontSize:132});
    placeZone1GroupOutline({center:trungDoanCenter,offset:unitX,y:2.85-trungDoanBodyDrop,w:unitW,h:2.22});

    // Khu Ba sẵn sàng: infographic -> cụm ảnh 1 liền khối -> cụm ảnh 2 theo bốn hàng.
    const newBaRoot = base + 'Khu vực Ba Sẵn Sàng/';
    const baGroup1 = newBaRoot + 'Ba Sẵn Sàng cụm ảnh 1/';
    const baGroup2 = newBaRoot + 'Ba Sẵn Sàng cụm ảnh 2/THANH NIÊN MIỀN BẮC HƯỞNG ỨNG PHONG TRÀO BA SẴN SÀNG/';
    const placeBaPhoto = (center, distance, y, w, h, item) => {
        const p = pointAtDistance(center, distance);
        createWallPhotoTile({x:p.x,z:p.z,y,rotY:faceCoreRotY(p.angle),w,h,curveRadius:outer,imageUrl:item.image,title:item.title,year:item.year,content:item.content,source:item.source || 'Tư liệu phong trào Ba sẵn sàng',accent:0x0092df,backingColor:0x006ea8,zoneName:Z.name,displayMode:'photo-caption'});
    };
    const placeBaText = (center, distance, y, w, h, item) => {
        const p = pointAtDistance(center, distance);
        createZone1TealTextPanel({x:p.x,z:p.z,y,rotY:faceCoreRotY(p.angle),curveRadius:outer,w,h,rawText:item.rawText,alignToImage:item.alignToImage,label:item.label,source:item.source,links:sourceLinks,zoneName:Z.name,maxFontSize:item.maxFontSize,interactive:false});
    };

    // Giữ infographic Ba sẵn sàng cố định tại fraction .86. Hai tâm cụm ảnh
    // được suy ra từ bề rộng thực để khoảng trống mép–mép luôn đúng 0.50,
    // kể cả khi bán kính/cung tường được hiệu chỉnh về sau.
    const baInfoCenter = .86;
    const baInfoW = 7.5 * 943 / 2000;
    const baSectionGap = .50;
    const baStaggerW = 4.30;
    const baVerticalW = 2.60;
    const group1Center = baInfoCenter
        - (baInfoW / 2 + baSectionGap + baStaggerW / 2) / zoneArcLength;
    const leftW = 2.05, rightW = 2.25, baInnerGap=0;
    const leftOffset = -(rightW + baInnerGap) / 2;
    const rightOffset = (leftW + baInnerGap) / 2;
    // Mép trên khối so le bám đúng cao độ chuẩn 8.30 của infographic.
    // Tọa độ gốc 7.03 + nửa chiều cao 1.30 = 7.68 nên cần nâng .62.
    const baStaggerLift = .62;
    placeBaPhoto(group1Center,leftOffset,7.03+baStaggerLift,leftW,1.30,{title:'Bí thư Đoàn trường phát biểu tuyên thệ',image:baGroup1+'Ba Sẵn Sàng 1/Bí thư Đoàn trường phát biểu tuyên thệ.jpg',content:'Bí thư Đoàn trường phát biểu tuyên thệ'});
    placeBaText(group1Center,rightOffset,7.03+baStaggerLift,rightW,1.30,{alignToImage:'left',label:'Ba Sẵn Sàng 1 · Text.md',rawText:"Đầu năm 1964, Ban Chấp hành Đoàn Trường phát động phong trào 'Tam bất kỳ'... Được sự đồng ý của lãnh đạo Nhà trường và Đoàn cấp trên, ngày 30/4/1964, Ban Chấp hành Đoàn Trường Đại học Sư phạm Hà Nội đã tổ chức Lễ phát động phong trào 'Ba sẵn sàng' tại Nghĩa trang Mai Dịch."});
    placeBaText(group1Center,leftOffset,4.93+baStaggerLift,leftW,2.90,{alignToImage:'right',label:'Ba Sẵn Sàng 2 · Text.md',rawText:'Với tinh thần "Sẵn sàng chiến đấu, sẵn sàng nhập ngũ đánh thắng đế quốc Mĩ xâm lược; Sẵn sàng hi sinh bảo vệ miền Bắc xã hội chủ nghĩa, giải phóng miền Nam thống nhất Tổ quốc; Sẵn sàng đi bất cứ nơi nào, làm bất cứ việc gì Đảng và nhân dân yêu cầu mà không đòi hỏi đãi ngộ!",phong trào đã thu hút hơn 5 triệu lượt thanh niên tham gia và nhanh chóng được Thành đoàn Hà Nội và Trung ương Đoàn nhân rộng thành phong trào cách mạng rộng lớn nhất của tuổi trẻ Việt Nam thời kỳ chống Mỹ.'});
    placeBaPhoto(group1Center,rightOffset,5.655+baStaggerLift,rightW,1.45,{title:'Bí thư Đảng uỷ Đỗ Đức Uyên trao cờ - giao nhiệm vụ cho Bí thư Đoàn trường Trịnh Ngọc Trình và Đoàn Thanh niên trong Lễ phát động phong trào “Ba sẵn sàng”, 30-04-1964',image:baGroup1+'Ba Sẵn Sàng 2/Bí thư Đảng uỷ Đỗ Đức Uyên trao cờ - giao nhiệm vụ cho Bí thư Đoàn trường Trịnh Ngọc Trình và Đoàn Thanh niên trong Lễ phát động phong trào _Ba sẵn sàng_, 30-04-1964.png',content:'Bí thư Đảng uỷ Đỗ Đức Uyên trao cờ - giao nhiệm vụ cho Bí thư Đoàn trường Trịnh Ngọc Trình và Đoàn Thanh niên trong Lễ phát động phong trào “Ba sẵn sàng”, 30-04-1964'});
    placeBaPhoto(group1Center,rightOffset,4.205+baStaggerLift,rightW,1.45,{title:'Đoàn viên, sinh viên hưởng ứng phong trào',image:baGroup1+'Ba Sẵn Sàng 2/Đoàn viên, sinh viên hưởng ứng phong trào.jpg',content:'Đoàn viên, sinh viên hưởng ứng phong trào'});
    placeBaPhoto(group1Center,leftOffset,2.83+baStaggerLift,leftW,1.30,{title:'Thanh niên Hà Nội tại lễ phát động phong trào Ba sẵn sàng',image:baGroup1+'Ba Sẵn Sàng 3/Thanh niên Hà Nội tại lễ phát động phong trào Ba sẵn sàng.jpg',content:'Thanh niên Hà Nội tại lễ phát động phong trào Ba sẵn sàng'});
    placeBaText(group1Center,rightOffset,2.83+baStaggerLift,rightW,1.30,{alignToImage:'left',label:'Ba Sẵn Sàng 3 · Text.md',rawText:'Từ ngọn lửa này, hàng vạn tri thức trẻ đã gạt niềm riêng, dũng cảm xông pha ra mặt trận, tạo nên sức mạnh xung kích to lớn góp phần hoàn toàn giải phóng miền Nam, thống nhất đất nước.'});
    placeZone1GroupOutline({center:group1Center,y:4.93+baStaggerLift,w:4.30,h:5.50});

    // Trận địa pháo thuộc khu Ba sẵn sàng: ảnh riêng, tiêu đề nằm dưới;
    // khi bấm ảnh modal vẫn hiển thị đúng ảnh gốc và tên tư liệu đầy đủ.
    const artilleryTitle='Một số hình ảnh ở trận địa pháo có sinh viên trường ĐHSPHN tham gia phục vụ chiến đấu tại cầu Tào, Hàm Rồng, Thanh Hoá, 15/8/1966';
    // Dịch cụm trận địa pháo cùng khối so le để giữ nguyên nhịp dọc nội bộ.
    const baMainLiftDelta = baStaggerLift - .36;
    placeXepBarePhoto({center:group1Center,y:1.56+baMainLiftDelta,w:4.35,h:.90,
        file:'Trận địa pháo có SV ĐHSP Hà Nội tham gia phục vụ chiến đấu tại cầu Tào, Hàm Rồng, Thanh Hoá, 15_8_1966, nguồn_ 60 Đại học Sư phạm Hà Nội qua hình ảnh.jpg',
        title:artilleryTitle,year:'1966',root:newBaRoot});
    placeXepSharedTitle({center:group1Center,y:.84+baMainLiftDelta,w:4.35,h:.40,year:'1966',text:artilleryTitle});
    placeZone1GroupOutline({center:group1Center,y:1.31+baMainLiftDelta,w:4.35,h:1.42});

    // Tách khối bốn hàng khỏi cụm so le kế bên; khoảng cách được tính theo
    // cung tường để hai khối không còn chạm/chen nhau khi nhìn phối cảnh.
    const group2Center = group1Center
        - (baStaggerW / 2 + baSectionGap + baVerticalW / 2) / zoneArcLength;
    // Bốn bảng ảnh–chú thích xếp thành một cột theo trình tự thời gian.
    const group2CardW = baVerticalW, group2CardH = 1.78;
    // Viền cột cũ có mép trên 8.175; nâng .125 để trùng cao độ 8.30.
    const baVerticalLift = xepInfoTop - (4.42 + 7.51 / 2);
    const baRows = [
        {y:7.15,text:'Những năm 1964-1965, lớp trẻ thủ đô sẵn sàng “xẻ dọc Trường Sơn đi cứu nước”',image:baGroup2+'Những năm 1964-1965, lớp trẻ thủ đô sẵn sàng “xẻ dọc Trường Sơn đi cứu nước”.jpg',captionRatio:.25,captionFontSize:126},
        {y:5.33,text:'Lễ xuất phát của Đoàn Thanh niên xung phong Hà Nội lên đường chống Mỹ, cứu nước, tổ chức ở Nhà hát lớn Hà Nội ngày 11-7-1969',image:baGroup2+'Lễ xuất phát của Đoàn Thanh niên xung phong Hà Nội lên đường chống Mỹ, cứu nước, tổ chức ở Nhà hát lớn Hà Nội ngày 11-7-1969.jpg',captionRatio:.31,captionFontSize:108},
        {y:3.51,text:'Thanh niên miền Bắc sôi nổi hưởng ứng phong trào Ba sẵn sàng (1969)',image:baGroup2+'Thanh niên miền Bắc sôi nổi hưởng ứng phong trào Ba sẵn sàng (1969).jpg',captionRatio:.27,captionFontSize:132},
        {y:1.69,text:'Từ mảnh đất thiêng Thăng Long - Đông Đô - Hà Nội, phong trào “Ba sẵn sàng” nhanh chóng lan rộng ra cả nước và trở thành cao trào cách mạng của tuổi trẻ',image:baGroup2+'Từ mảnh đất thiêng Thăng Long - Đông Đô - Hà Nội, phong trào “Ba sẵn sàng” nhanh chóng lan rộng ra cả nước và trở thành cao trào cách mạng của tuổi trẻ.jpg',captionRatio:.35,captionFontSize:106}
    ];
    baRows.forEach(row=>{
        const p = pointAtDistance(group2Center, 0);
        createZone1CaptionedPhotoCard({x:p.x,z:p.z,y:row.y+baVerticalLift,rotY:faceCoreRotY(p.angle),curveRadius:outer,
            w:group2CardW,h:group2CardH,title:row.text,content:row.text,imageUrl:row.image,
            source:'Tư liệu phong trào Ba sẵn sàng',zoneName:Z.name,
            captionRatio:row.captionRatio,captionFontSize:row.captionFontSize});
    });
    placeZone1GroupOutline({center:group2Center,y:4.42+baVerticalLift,w:group2CardW,h:7.51});

    const portraitRoot=base+'Ảnh một số gương mặt cán bộ, sinh viên tiêu biểu tham gia phong trào/';
    const portraits=[
        {folder:'1',role:'Bí thư Đoàn trường',name:'TRỊNH NGỌC TRÌNH',full:'Bí thư Đoàn trường Trịnh Ngọc Trình phát biểu tuyên thệ trong buổi lễ phát động phong trào "Ba Sẵn Sàng".jpg'},
        {folder:'2',role:'Đồng chí · Bí thư Đoàn trường',name:'TRẦN QUANG NHIẾP',thumb:'Ảnh chân dung.jpg',full:'Đồng chí Bí thư Đoàn trường Trần Quang Nhiếp phát biểu tại lễ xuất phát đội 146.jpg'},
        {folder:'3',role:'Chiến sĩ trẻ',name:'HỒ QUANG DIỆU',thumb:'Chân dung.jpg',full:'Chiễn sĩ trẻ Hồ Quang Diệu (thứ 3 từ trái sang) sinh viên khoa Văn, thăm C2 - đơn vị có nhiều cán bộ, sinh viên trường ĐHSP Hà Nội, 1970.jpg'},
        {folder:'4',role:'Bí thư LCĐ Khoa Hoá',name:'TÔN THỊ TĨNH',full:'Chị Tôn Thị Tĩnh - Bí thư LCĐ khoa Hoá.jpg'},
        {folder:'5',role:'Liệt sĩ',name:'ĐẶNG XUÂN RƯƠNG',full:'Liệt sĩ Đặng Xuân Rương - Phó Bí thư Đoàn trường ĐHSP Hà Nội - hy sinh cuối năm 1970 khi đang cùng sư đoàn 308 tiến đánh vào Khe Sanh.jpg'},
        {folder:'6',role:'Liệt sĩ',name:'VŨ ĐÌNH VĂN',full:'Liệt sỹ Vũ Đình Văn - sinh viên năm thứ hai khoa Văn - nhập ngữ năm 1971, hy sinh cuối năm 1972 tại Vân Đình.jpg'}
    ];
    const innerArcLength=Math.abs(Z.a1-Z.a0)*inner;
    const portraitColumns=[.72,.50,.28];
    const portraitRows=[6.00,3.50];
    // Ảnh và ô tên ghép thành một thẻ liền: ô tên hẹp nhưng cao bằng ảnh.
    const portraitW=1.30,portraitH=1.92,nameW=.82,nameH=portraitH,portraitNameGap=0;
    const nameTravelOffset=(portraitW/2+portraitNameGap+nameW/2)/innerArcLength;
    portraits.forEach((item,index)=>{
        const imageFraction=portraitColumns[Math.floor(index/2)];
        const rowY=portraitRows[index%2];
        const imageP=zonePoint(Z,imageFraction,inner);
        const nameP=zonePoint(Z,imageFraction-nameTravelOffset,inner);
        const folderRoot=portraitRoot+item.folder+'/';
        const fullImage=folderRoot+item.full;
        const wallImage=folderRoot+(item.thumb||item.full);
        const fullCaption=cleanXepCaption(item.full);
        createWallPhotoTile({x:imageP.x,z:imageP.z,y:rowY,rotY:faceCoreRotY(imageP.angle)+Math.PI,
            w:portraitW,h:portraitH,curveRadius:-inner,imageUrl:wallImage,modalImageUrl:fullImage,
            title:fullCaption,content:fullCaption,source:'Tư liệu gương mặt cán bộ, sinh viên tiêu biểu',
            accent:0x0092df,backingColor:0x006ea8,zoneName:Z.name,displayMode:'photo-caption'});
        createPortraitNamePanel({x:nameP.x,z:nameP.z,y:rowY,rotY:faceCoreRotY(nameP.angle)+Math.PI,
            role:item.role,name:item.name,curveRadius:-inner,w:nameW,h:nameH});
    });
}

function buildZone1_YeuNuoc() {
    if (USE_ZONE1_EDITORIAL_V2) { buildZone1EditorialV2(); return; }
    const Z = getZoneById(1); 
    const content = getZoneContent(1);

    // Đặt loa ở trung tâm Cụm 1 lơ lửng trên không trung (Y = WALL_H/2)
    const pCenter = zonePoint(Z, 0.5, MID_R);
    createZone3DAudio(Z.audio, new THREE.Vector3(pCenter.x, WALL_H/2, pCenter.z), Z.id);

    const titleP = zonePoint(Z, 0.5, WALL_MOUNT_R - 0.08);
    createReferenceTitle({
        x: titleP.x, z: titleP.z, y: 9.35, rotY: faceCoreRotY(titleP.angle),
        text: content.heading, color: RED, curveRadius: WALL_MOUNT_R - 0.08, 
        bgColor: '#8f1f18', textColor: '#fff4cf', w: 7.5, h: .72
    });

    content.sections.forEach((section, sectionIndex) => {
        const infoP = zonePoint(Z, Math.min(section.fraction, 0.87), WALL_MOUNT_R - .08);
        createReferenceTitle({
            x: infoP.x, z: infoP.z, y: 8.35, rotY: faceCoreRotY(infoP.angle),
            text: section.title, color: RED, curveRadius: WALL_MOUNT_R - .08,
            bgColor: sectionIndex === 0 ? '#7b201b' : '#485139', textColor: '#fff5dc', w: 6.0, h: .62
        });
        createWallPicture({
            x: infoP.x, z: infoP.z, y: 4.7, rotY: faceCoreRotY(infoP.angle),
            w: 2.35, h: 5.0, accent: RED, title: section.title, year: section.period,
            subtitle: 'Infographic', zoneName: Z.name, content: section.content,
            curveRadius: WALL_MOUNT_R - .08, imageUrl: section.infographic
        });

        section.photos.forEach(photo => {
            const photoP = zonePoint(Z, Math.min(photo.fraction, 0.87), WALL_MOUNT_R - .06);
            createWallPicture({
                x: photoP.x, z: photoP.z, y: 3.75, rotY: faceCoreRotY(photoP.angle),
                w: 1.65, h: 2.35, accent: RED, title: photo.title, year: photo.year,
                zoneName: Z.name, content: photo.content,
                curveRadius: WALL_MOUNT_R - .06, imageUrl: photo.imageUrl
            });
        });
    });

    const transitionP = zonePoint(Z, .53, WALL_MOUNT_R - .12);
    createReferenceTitle({
        x: transitionP.x, z: transitionP.z, y: 6.0, rotY: faceCoreRotY(transitionP.angle),
        text: '1964  →  1966  ·  TỪ HIỆU TRIỆU ĐẾN HÀNH ĐỘNG', color: GOLD,
        curveRadius: WALL_MOUNT_R - .12, bgColor: '#342d24', textColor: '#f5d58b', w: 6.2, h: .68
    });

}

function createZone3TimelineSegment(zone, start, end, y0, y1 = y0) {
    const radius = WALL_MOUNT_R - .16;
    const material = new THREE.MeshStandardMaterial({
        color: 0x0092df, emissive: 0x005baa, emissiveIntensity: .34,
        roughness: .28, metalness: .42
    });
    const steps = Math.max(2, Math.ceil(Math.abs(end - start) * 54));
    for (let index = 0; index < steps; index++) {
        const t0 = index / steps;
        const t1 = (index + 1) / steps;
        const f0 = THREE.MathUtils.lerp(start, end, t0);
        const f1 = THREE.MathUtils.lerp(start, end, t1);
        const p0 = zonePoint(zone, f0, radius);
        const p1 = zonePoint(zone, f1, radius);
        const yy0 = THREE.MathUtils.lerp(y0, y1, t0);
        const yy1 = THREE.MathUtils.lerp(y0, y1, t1);
        const mid = new THREE.Vector3((p0.x + p1.x) / 2, (yy0 + yy1) / 2, (p0.z + p1.z) / 2);
        const length = Math.hypot(p1.x - p0.x, yy1 - yy0, p1.z - p0.z) * 1.04;
        const segment = new THREE.Mesh(new THREE.BoxGeometry(length, .075, .065), material);
        segment.position.copy(mid);
        segment.rotation.y = faceCoreRotY((p0.angle + p1.angle) / 2);
        segment.rotation.z = -Math.atan2(yy1 - yy0, Math.hypot(p1.x - p0.x, p1.z - p0.z));
        scene.add(segment);
    }
}

function createZone3TimelineNode(zone, fraction, y, label) {
    const radius = WALL_MOUNT_R - .19;
    const point = zonePoint(zone, fraction, radius);
    const dot = new THREE.Mesh(
        new THREE.SphereGeometry(.13, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0xffcf62, emissive: 0x7b4a00, emissiveIntensity: .28, roughness: .25, metalness: .7 })
    );
    dot.position.set(point.x, y, point.z);
    scene.add(dot);
    createReferenceTitle({
        x: point.x, z: point.z, y: y - .38, rotY: faceCoreRotY(point.angle),
        text: label, color: BLUE, curveRadius: radius,
        bgColor: '#0092df', textColor: '#ffffff', fontSize: 31, w: 1.45, h: .34
    });
}

function createZone3TimelineConnector(zone, fraction, fromY, toY) {
    const radius = WALL_MOUNT_R - .18;
    const point = zonePoint(zone, fraction, radius);
    const connector = new THREE.Mesh(
        new THREE.BoxGeometry(.045, Math.abs(toY - fromY), .045),
        new THREE.MeshStandardMaterial({ color: 0xd6b46a, roughness: .32, metalness: .58 })
    );
    connector.position.set(point.x, (fromY + toY) / 2, point.z);
    connector.rotation.y = faceCoreRotY(point.angle);
    scene.add(connector);
}

function createZone3SourceCard({
    zone, item, fraction, y, width, height, radius, zoneName,
    faceInnerWall = false, captionHeight = .72, captionFontSize = 20
}) {
    const point = zonePoint(zone, fraction, radius);
    const rotation = faceCoreRotY(point.angle) + (faceInnerWall ? Math.PI : 0);
    const galleryItems = [item.image, ...(item.gallery || [])].map(imageUrl => ({
        imageUrl, title: item.title, content: item.content || '', year: item.year || item.period || ''
    }));
    const timeLabel = item.year || item.period || '';
    const wallCaption = [timeLabel, item.title].filter(Boolean).join(' · ');
    createWallPhotoTile({
        x: point.x, z: point.z, y, rotY: rotation,
        w: width, h: height, curveRadius: faceInnerWall ? -radius : radius,
        imageUrl: item.image, title: item.title, year: item.year || item.period,
        content: item.content || '', source: item.source, accent: BLUE,
        zoneName, gallery: item.gallery || [], galleryItems,
        displayMode: 'photo-caption', enableHoverBorder: true,
        permanentBorder: false, preserveAspect: true
    });
    const captionY = y - height / 2 - captionHeight / 2 - .10;
    createReferenceTitle({
        x: point.x, z: point.z, y: captionY, rotY: rotation,
        text: wallCaption, color: BLUE, curveRadius: faceInnerWall ? -radius : radius,
        bgColor: '#0092df', textColor: '#ffffff',
        fontSize: captionFontSize, w: width + .14, h: captionHeight
    });
}

function buildZone3_NCKH() {
    const Z = getZoneById(3);
    const content = getZoneContent(3);

    // Đặt loa ở trung tâm Cụm 3
    const pCenter = zonePoint(Z, 0.5, MID_R);
    createZone3DAudio(Z.audio, new THREE.Vector3(pCenter.x, WALL_H/2, pCenter.z), Z.id);

    const titleP = zonePoint(Z, 0.5, WALL_MOUNT_R - 0.08);
    createReferenceTitle({ 
        x: titleP.x, z: titleP.z, y: 8.75, rotY: faceCoreRotY(titleP.angle), 
        text: content.heading, color: BLUE, curveRadius: WALL_MOUNT_R - 0.08,
        bgColor: '#006ea8', textColor: '#ffffff', w: 9.4, h: .82
    });

    // Bản LTR phản chiếu fraction khi đặt vật thể: mốc cũ xuất hiện bên trái
    // và các mốc thời gian tăng dần về phía phải theo chiều tham quan mới.
    ZONE3_TIMELINE.forEach(segment => {
        if (segment.kind === 'transition') createZone3TimelineSegment(Z, segment.start, segment.end, segment.y0, segment.y1);
        else createZone3TimelineSegment(Z, segment.start, segment.end, segment.y);
    });
    createZone3TimelineNode(Z, .93, 1.55, '1951');
    createZone3TimelineNode(Z, .52, 1.55, '2011');
    createZone3TimelineNode(Z, .41, 6.25, '2022');
    createZone3TimelineNode(Z, .07, 6.25, '2026');

    const peopleTitle = zonePoint(Z, .74, WALL_MOUNT_R - .1);
    createReferenceTitle({
        x: peopleTitle.x, z: peopleTitle.z, y: 8.0, rotY: faceCoreRotY(peopleTitle.angle),
        text: 'KHU VỰC 1: CÁC NHÂN VẬT TIÊU BIỂU TRONG NGHIÊN CỨU KHOA HỌC',
        color: BLUE, curveRadius: WALL_MOUNT_R - .1, bgColor: '#0092df', textColor: '#ffffff',
        fontSize: 28, w: 8.2, h: .55
    });
    const peopleFractions = [.91, .82, .73, .64, .55];
    ZONE3_PEOPLE.forEach((item, index) => {
        const row = index % 2;
        const fraction = peopleFractions[Math.floor(index / 2)];
        const y = row === 0 ? 6.55 : 3.65;
        createZone3SourceCard({ zone: Z, item, fraction, y, width: 1.58, height: 1.72,
            radius: WALL_MOUNT_R - .1, zoneName: `${Z.name} · Khu vực 1`,
            captionHeight: .72, captionFontSize: 20 });
        if (row === 1) createZone3TimelineConnector(Z, fraction, 1.61, y - 1.26);
    });

    const activityTitle = zonePoint(Z, .24, WALL_MOUNT_R - .1);
    createReferenceTitle({
        x: activityTitle.x, z: activityTitle.z, y: 7.65, rotY: faceCoreRotY(activityTitle.angle),
        text: 'KHU VỰC 2: HÌNH ẢNH VỀ CÁC HOẠT ĐỘNG NGHIÊN CỨU KHOA HỌC CỦA CÁN BỘ VÀ SINH VIÊN',
        color: BLUE, curveRadius: WALL_MOUNT_R - .1, bgColor: '#0092df', textColor: '#ffffff',
        fontSize: 25, w: 7.4, h: .55
    });
    const activityFractions = [.39, .31, .23, .15, .075];
    ZONE3_ACTIVITIES.forEach((item, index) => {
        const row = index % 2;
        const fraction = activityFractions[Math.floor(index / 2)];
        const y = row === 0 ? 4.88 : 2.27;
        createZone3SourceCard({ zone: Z, item, fraction, y, width: 1.42, height: 1.18,
            radius: WALL_MOUNT_R - .1, zoneName: `${Z.name} · Khu vực 2`,
            captionHeight: .9, captionFontSize: 18 });
        if (row === 0) createZone3TimelineConnector(Z, fraction, 6.19, y + .98);
    });

    const innerDisplayR = R_CORE + WALL_THICK / 2 + .12;
    const innerTitle = zonePoint(Z, .5, innerDisplayR);
    createReferenceTitle({
        x: innerTitle.x, z: innerTitle.z, y: 8.65, rotY: faceCoreRotY(innerTitle.angle) + Math.PI,
        text: 'KHU VỰC 3: THÀNH TÍCH TIÊU BIỂU TRONG NHỮNG NĂM GẦN ĐÂY',
        color: BLUE, curveRadius: -innerDisplayR, bgColor: '#0092df', textColor: '#ffffff',
        fontSize: 27, w: 6.9, h: .58
    });
    const achievementFractions = [.88, .70, .51, .32, .14];
    ZONE3_ACHIEVEMENTS.forEach((item, index) => {
        const row = index % 2;
        const fraction = achievementFractions[Math.floor(index / 2)];
        const y = row === 0 ? 6.65 : 3.42;
        createZone3SourceCard({ zone: Z, item, fraction, y, width: 1.48, height: 1.48,
            radius: innerDisplayR, zoneName: `${Z.name} · Khu vực 3`, faceInnerWall: true,
            captionHeight: .9, captionFontSize: 18 });
    });
}

function buildZone2_TinhNguyenVaSuPham() {
    const Z = getZoneById(2);
    const content = getZoneContent(2);
    
    // Đặt loa ở trung tâm Cụm 2
    const pCenter = zonePoint(Z, 0.5, MID_R);
    createZone3DAudio(Z.audio, new THREE.Vector3(pCenter.x, WALL_H/2, pCenter.z), Z.id);

    const titleP = zonePoint(Z, 0.5, WALL_MOUNT_R - 0.08);
    createReferenceTitle({ 
        x: titleP.x, z: titleP.z, y: 8.5, rotY: faceCoreRotY(titleP.angle), 
        text: content.heading, color: GREEN, curveRadius: WALL_MOUNT_R - 0.08,
        bgColor: ZONE2_CONTENT_BLUE, textColor: '#ffffff', w: 9.0, h: 1.2
    });

    const innerWallSurfaceR = R_CORE + WALL_THICK / 2;
    const innerDisplayR = innerWallSurfaceR + 0.16;

    // Bản đồ nhiệt chuyển sang mặt ngoài của tường lõi, hướng ra vành tham quan.
    const heatmapTitleP = zonePoint(Z, 0.5, innerDisplayR);
    createReferenceTitle({
        x: heatmapTitleP.x, z: heatmapTitleP.z, y: 8.15,
        rotY: faceCoreRotY(heatmapTitleP.angle) + Math.PI,
        text: 'SƯ PHẠM ĐI VÀ YÊU', color: GREEN,
        curveRadius: -innerDisplayR,
        bgColor: ZONE2_CONTENT_BLUE, textColor: '#ffffff', w: 6.8, h: 0.72
    });

    const mapDisplayR = innerWallSurfaceR + 0.025;
    const mapP = zonePoint(Z, 0.75, mapDisplayR);
    createHeatmapPanel(mapP, Z, { faceInnerWall: true, radius: mapDisplayR });

    // Dịch TV về gần bản đồ nhưng vẫn giữ khe thoáng để hai khối không chạm nhau.
    const tvP = zonePoint(Z, 0.30, innerDisplayR);
    createHeatmapTV(tvP, Z, { faceInnerWall: true, radius: innerDisplayR });

    // Hai khung sáng thu gọn; bảng tên nằm giữa nẹp trên của từng khu.
    const lightFrame = {
        zone: Z, radius: WALL_MOUNT_R - 0.055, bottom: 0.72, top: 7.02,
        showGlass: false, railColor: 0xffcf62, emissiveIntensity: 1.15, railWidth: 0.048
    };
    createCurvedGlassZoneFrame({ ...lightFrame, start: 0.070, end: 0.470 });
    createCurvedGlassZoneFrame({ ...lightFrame, start: 0.530, end: 0.930 });
    createZone2LightFrameLabel(Z, 0.27, content.loveHeading, 3.45);
    createZone2LightFrameLabel(Z, 0.73, content.panoramaHeading, 3.20);

    // Bức tường yêu thương chuyển sang nửa đầu của tường ngoài.
    createEventStoryWall({
        zone: Z,
        events: content.loveEvents,
        documents: ZONE2_PHOTO_ONLY ? [] : content.loveDocuments,
        historicalCards: ZONE2_PHOTO_ONLY ? [] : content.loveHistoricalCards,
        documentIndexes: [1],
        radius: WALL_MOUNT_R,
        // Fraction được phản chiếu ở bản LTR: nội dung đầu tiên nằm bên trái.
        adaptiveColumns: true,
        columnRange: [0.125, 0.420],
        zoneName: 'Cụm 2 · Bức tường Trao yêu thương',
        accent: 0xb21f35,
        faceInnerWall: false,
        columnRhythm: [
            { topDrop: 0.26, bottomLift: 0.06, widthScale: 0.94 },
            { topDrop: 0.00, bottomLift: 0.22, widthScale: 1.05 },
            { topDrop: 0.18, bottomLift: 0.00, widthScale: 0.97 },
            { topDrop: 0.34, bottomLift: 0.14, widthScale: 1.06 },
            { topDrop: 0.08, bottomLift: 0.27, widthScale: 0.95 },
            { topDrop: 0.24, bottomLift: 0.08, widthScale: 1.02 }
        ],
        top: 6.55,
        bottom: 1.02
    });

    // Mặt tường ngoài: masonry biến thiên theo lượng ảnh thực tế;
    // mỗi cụm là một khối chữ nhật kín và các mốc tăng dần từ trái sang phải.
    createEventStoryWall({
        zone: Z,
        events: content.panoramaEvents,
        documents: ZONE2_PHOTO_ONLY ? [] : content.panoramaDocuments,
        historicalCards: ZONE2_PHOTO_ONLY ? [] : content.panoramaHistoricalCards,
        documentIndexes: [1, 5],
        radius: WALL_MOUNT_R,
        // Fraction được phản chiếu: mốc cũ ở bên trái, mốc mới phát triển sang phải.
        adaptiveColumns: true,
        columnRange: [0.585, 0.880],
        zoneName: Z.name,
        accent: GREEN,
        faceInnerWall: false,
        columnRhythm: [
            { topDrop: 0.04, bottomLift: 0.24, widthScale: 1.02 },
            { topDrop: 0.20, bottomLift: 0.06, widthScale: 0.94 },
            { topDrop: 0.08, bottomLift: 0.18, widthScale: 1.05 },
            { topDrop: 0.29, bottomLift: 0.00, widthScale: 0.95 },
            { topDrop: 0.13, bottomLift: 0.16, widthScale: 1.01 },
            { topDrop: 0.25, bottomLift: 0.07, widthScale: 0.98 }
        ],
        top: 6.55,
        bottom: 1.02
    });

}

function createZone2LightFrameLabel(zone, fraction, text, width) {
    // Đẩy bảng tên ra trước nẹp một lớp nhỏ để tránh bị tường/nẹp che hoặc z-fighting.
    const radius = WALL_MOUNT_R - 0.095;
    const point = zonePoint(zone, fraction, radius);
    createReferenceTitle({
        x: point.x, z: point.z, y: 7.02,
        rotY: faceCoreRotY(point.angle), text, color: GOLD,
        curveRadius: radius, bgColor: ZONE2_CONTENT_BLUE, textColor: '#ffffff',
        fontSize: 34, w: width, h: 0.43
    });
}

function createCurvedGlassZoneFrame({
    zone, radius, start, end, bottom, top,
    showGlass = true, glassColor = 0xdfeaff, opacity = 0.09,
    railColor = 0xd6b46a, railWidth = 0.075, emissiveIntensity = 0.08
}) {
    const center = (start + end) / 2;
    const point = zonePoint(zone, center, radius);
    const angularSpan = Math.abs(zone.a1 - zone.a0) * (end - start);
    const width = angularSpan * radius;
    const height = top - bottom;
    const group = new THREE.Group();
    group.position.set(point.x, bottom + height / 2, point.z);
    group.rotation.y = faceCoreRotY(point.angle);

    const glassGeometry = new THREE.PlaneGeometry(width, height, 64, 1);
    glassGeometry.translate(0, 0, -0.028);
    bendGeometry(glassGeometry, radius);
    const glass = new THREE.Mesh(glassGeometry, new THREE.MeshPhysicalMaterial({
        color: glassColor, roughness: 0.08, metalness: 0,
        transparent: true, opacity, transmission: showGlass ? 0.20 : 0,
        clearcoat: 0.72, clearcoatRoughness: 0.18,
        depthWrite: false, side: THREE.DoubleSide
    }));
    glass.renderOrder = -2;
    if (showGlass) group.add(glass);

    const railMaterial = new THREE.MeshStandardMaterial({
        color: railColor, roughness: 0.38, metalness: 0.48,
        emissive: railColor, emissiveIntensity,
        side: THREE.DoubleSide
    });
    [-height / 2, height / 2].forEach(y => {
        const railGeometry = new THREE.PlaneGeometry(width + 0.08, railWidth, 64, 1);
        railGeometry.translate(0, y, 0.012);
        bendGeometry(railGeometry, radius);
        group.add(new THREE.Mesh(railGeometry, railMaterial));
    });

    [start, end].forEach(fraction => {
        const edgePoint = zonePoint(zone, fraction, radius - 0.01);
        const rail = new THREE.Mesh(new THREE.PlaneGeometry(railWidth, height), railMaterial);
        rail.position.set(edgePoint.x, bottom + height / 2, edgePoint.z);
        rail.rotation.y = faceCoreRotY(edgePoint.angle);
        scene.add(rail);
    });

    scene.add(group);
}

function eventVisualClusters(events, maxPhotos = 6) {
    return events.flatMap(eventItem => {
        const chunks = [];
        for (let index = 0; index < eventItem.photos.length; index += maxPhotos) {
            const part = Math.floor(index / maxPhotos);
            chunks.push({
                eventId: eventItem.id,
                photos: eventItem.photos.slice(index, index + maxPhotos),
                title: eventItem.title,
                meta: eventItem.year || '',
                description: eventItem.description
            });
        }
        return chunks;
    });
}

function createEventStoryWall(cfg) {
    const clusters = eventVisualClusters(cfg.events);
    const modules = clusters.map(cluster => ({ type: 'photos', ...cluster }));
    (cfg.historicalCards || []).forEach(card => {
        let index = modules.length;
        if (card.placement === 'start') index = 0;
        else if (card.beforeEvent) {
            const eventIndex = modules.findIndex(item => item.eventId === card.beforeEvent);
            if (eventIndex >= 0) index = eventIndex;
        }
        modules.splice(index, 0, { type: 'historical', card });
    });
    (cfg.documents || []).forEach((documentItem, index) => {
        modules.splice(cfg.documentIndexes?.[index] ?? modules.length, 0, { type: 'document', documentItem });
    });
    if (cfg.adaptiveColumns) {
        const columnCount = THREE.MathUtils.clamp(Math.round(Math.sqrt(modules.length * 1.5)), 4, 6);
        const [rangeMin, rangeMax] = cfg.columnRange;
        cfg.columnCenters = Array.from({ length: columnCount }, (_, index) =>
            rangeMax - (rangeMax - rangeMin) * index / Math.max(1, columnCount - 1)
        );
        const arcSpan = Math.abs(cfg.zone.a1 - cfg.zone.a0) * cfg.radius * (rangeMax - rangeMin);
        const centerSpacing = arcSpan / Math.max(1, columnCount - 1);
        // Tâm cột sít hơn nhưng ảnh vẫn gần chạm nhau theo chiều ngang.
        cfg.groupWidth = THREE.MathUtils.clamp(centerSpacing * 0.97, 1.9, 2.65);
    }
    createMixedMasonryStoryWall({ ...cfg, modules });
}

function storyModuleWeight(moduleItem) {
    if (moduleItem.type === 'document') return 1.25;
    if (moduleItem.type === 'historical') return 1.35;
    const count = moduleItem.photos.length;
    if (count <= 1) return 1.0;
    if (count <= 3) return 1.25;
    if (count <= 5) return 1.55;
    return 1.85;
}

// Chia tuần tự các mô-đun vào cột theo tổng lượng nội dung, vẫn giữ nguyên
// trình tự sự kiện nhưng tránh cột 2 cụm quá thưa và cột 5 cụm quá chật.
function partitionStoryModules(modules, columnCount) {
    const columns = [];
    let cursor = 0;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const columnsLeft = columnCount - columnIndex;
        const itemsLeft = modules.length - cursor;
        if (columnsLeft === 1) {
            columns.push(modules.slice(cursor));
            break;
        }

        const remaining = modules.slice(cursor);
        const target = remaining.reduce((sum, item) => sum + storyModuleWeight(item), 0) / columnsLeft;
        const maxItems = itemsLeft - (columnsLeft - 1) * 2;
        const column = [];
        let weight = 0;
        while (column.length < Math.max(2, maxItems)) {
            const next = modules[cursor];
            if (!next) break;
            const nextWeight = storyModuleWeight(next);
            const canStop = column.length >= 2;
            const wouldImprove = Math.abs(target - (weight + nextWeight)) <= Math.abs(target - weight);
            if (canStop && !wouldImprove) break;
            column.push(next);
            weight += nextWeight;
            cursor += 1;
            if (modules.length - cursor === (columnsLeft - 1) * 2) break;
        }
        columns.push(column);
    }
    return columns;
}

function storyModuleNaturalHeight(moduleItem, width) {
    if (moduleItem.type === 'document') return 1.42;
    if (moduleItem.type === 'historical') return 1.52;
    return storyCaptionHeight(moduleItem.title) + naturalPhotoLayoutHeight(moduleItem.photos, width);
}

// Chia tuần tự nhưng cân bằng theo chiều cao thật của ảnh. Vì điểm cắt không
// phụ thuộc năm, nội dung năm sau có thể tiếp tục lấp cột của năm trước.
function partitionStoryModulesByHeight(modules, columnCount, width) {
    const columns = [];
    let cursor = 0;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const columnsLeft = columnCount - columnIndex;
        if (columnsLeft === 1) {
            columns.push(modules.slice(cursor));
            break;
        }
        const remaining = modules.slice(cursor);
        const target = remaining.reduce((sum, item) => sum + storyModuleNaturalHeight(item, width), 0) / columnsLeft;
        const maxItems = remaining.length - (columnsLeft - 1) * 2;
        const column = [];
        let used = 0;
        while (column.length < Math.max(2, maxItems)) {
            const next = modules[cursor];
            if (!next) break;
            const nextHeight = storyModuleNaturalHeight(next, width) + (column.length ? 0.07 : 0);
            if (column.length >= 2 && Math.abs(target - used) < Math.abs(target - used - nextHeight)) break;
            column.push(next);
            cursor += 1;
            used += nextHeight;
            if (column.length >= maxItems) break;
        }
        columns.push(column);
    }
    return columns;
}

function createDocumentCard({ zone, documentItem, radius, center, y, w, h, zoneName }) {
        const point = zonePoint(zone, center, radius - 0.015);
        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 960;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = ZONE2_CONTENT_BLUE;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#d6b46a';
        ctx.lineWidth = 18;
        ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
        ctx.fillStyle = '#d6b46a';
        ctx.font = `800 76px ${UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('PDF', canvas.width / 2, 170);
        ctx.fillStyle = '#fff8e8';
        ctx.font = `800 43px ${UI_FONT}`;
        wrapText(ctx, documentItem.title, canvas.width / 2, 315, 590, 58);
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 32px ${UI_FONT}`;
        ctx.fillText(`${documentItem.pageCount} TRANG`, canvas.width / 2, 710);
        ctx.fillStyle = '#d6b46a';
        ctx.font = `700 30px ${UI_FONT}`;
        ctx.fillText('BẤM ĐỂ ĐỌC TOÀN BỘ', canvas.width / 2, 830);

        const texture = createSRGBCanvasTexture(canvas);
        const geometry = new THREE.PlaneGeometry(w, h, 12, 1);
        bendGeometry(geometry, radius);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            map: texture, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide
        }));
        const borderGeometry = new THREE.EdgesGeometry(geometry, 20);
        borderGeometry.translate(0, 0, 0.012);
        const hoverBorder = new THREE.LineSegments(borderGeometry, new THREE.LineBasicMaterial({
            color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, toneMapped: false
        }));
        hoverBorder.renderOrder = 7;
        mesh.add(hoverBorder);
        mesh.position.set(point.x, y, point.z);
        mesh.rotation.y = faceCoreRotY(point.angle);
        mesh.userData = {
            type: 'pdf-document', title: documentItem.title, zoneName,
            pdfUrl: documentItem.pdfUrl, pageCount: documentItem.pageCount,
            hoverBorder
        };
        interactiveObjects.push(mesh);
        scene.add(mesh);
}

function drawWrappedTop(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
        } else line = candidate;
    });
    if (line) lines.push(line);
    const visible = lines.slice(0, maxLines);
    if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,;:]?$/, '')}…`;
    visible.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight, maxWidth));
    return visible.length;
}

function createHistoricalStoryCard({ zone, card, radius, center, y, w, h, zoneName }) {
    const point = zonePoint(zone, center, radius - 0.02);
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
    background.addColorStop(0, '#fffefe');
    background.addColorStop(1, '#eaf4ff');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f5daa';
    ctx.font = `italic 900 38px ${UI_FONT}`;
    ctx.fillText('DẤU MỐC LỊCH SỬ', 70, 62);
    ctx.fillStyle = '#a46f22';
    ctx.fillRect(70, 122, canvas.width - 140, 4);
    ctx.fillStyle = '#141793';
    ctx.font = `900 58px ${UI_FONT}`;
    const titleLines = drawWrappedTop(ctx, card.title, 70, 166, canvas.width - 140, 67, 3);
    const periodY = 166 + titleLines * 67 + 18;
    ctx.fillStyle = '#a46f22';
    ctx.font = `800 38px ${UI_FONT}`;
    ctx.fillText(card.period || '', 70, periodY);
    ctx.fillStyle = '#10263a';
    ctx.font = `650 39px ${UI_FONT}`;
    drawWrappedTop(ctx, card.summary, 70, periodY + 70, canvas.width - 140, 53, 5);
    ctx.fillStyle = '#9a744f';
    ctx.font = `700 27px ${UI_FONT}`;
    ctx.fillText('BẤM ĐỂ ĐỌC NỘI DUNG', 70, canvas.height - 72);

    const makeLayer = (layerW, layerH, z, material) => {
        const geometry = new THREE.PlaneGeometry(layerW, layerH, 16, 1);
        bendGeometry(geometry, radius);
        geometry.translate(0, 0, z);
        return new THREE.Mesh(geometry, material);
    };
    const group = new THREE.Group();
    group.position.set(point.x, y, point.z);
    group.rotation.y = faceCoreRotY(point.angle);
    group.add(makeLayer(w + 0.15, h + 0.15, 0, new THREE.MeshStandardMaterial({
        color: 0x9a744f, roughness: 0.68, metalness: 0.04, side: THREE.DoubleSide
    })));
    group.add(makeLayer(w + 0.07, h + 0.07, 0.012, new THREE.MeshStandardMaterial({
        color: 0xc6a25c, roughness: 0.30, metalness: 0.58, side: THREE.DoubleSide
    })));
    const face = makeLayer(w, h, 0.024, new THREE.MeshStandardMaterial({
        map: createSRGBCanvasTexture(canvas), roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide
    }));
    const hoverBorder = new THREE.LineSegments(
        new THREE.EdgesGeometry(face.geometry, 20),
        new THREE.LineBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
    );
    hoverBorder.position.z = 0.012;
    face.add(hoverBorder);
    face.userData = {
        type: 'artifact', title: card.title, year: card.period, zoneName,
        content: card.content, source: card.source, color: 0xc6a25c, hoverBorder
    };
    interactiveObjects.push(face);
    group.add(face);
    scene.add(group);
}

function storyCaptionHeight(title) {
    return String(title || '').length > 30 ? 0.31 : 0.24;
}

function createMixedMasonryStoryWall({
    zone, modules, radius, columnCenters,
    zoneName, accent, faceInnerWall, groupWidth, columnRhythm = [], top, bottom
}) {
    // Nhịp cụm sít hơn; caption thấp để ảnh giữ phần lớn diện tích trưng bày.
    const clusterGap = 0.07;
    const zoneArcLength = Math.abs(zone.a1 - zone.a0) * radius;
    const columns = partitionStoryModulesByHeight(modules, columnCenters.length, groupWidth);

    columns.forEach((columnModules, columnIndex) => {
        const rhythm = columnRhythm[columnIndex] || {};
        const columnTop = top - (rhythm.topDrop || 0);
        const columnBottom = bottom + (rhythm.bottomLift || 0);
        const columnWidth = groupWidth * (rhythm.widthScale || 1);
        const clusterCount = columnModules.length;
        const usableHeight = columnTop - columnBottom - clusterGap * (clusterCount - 1);
        const naturalHeights = columnModules.map(item => storyModuleNaturalHeight(item, columnWidth));
        const naturalTotal = naturalHeights.reduce((sum, value) => sum + value, 0);
        const fitScale = Math.min(1, usableHeight / naturalTotal);
        const heights = naturalHeights.map(value => value * fitScale);
        // Các cụm dùng đúng chiều cao ảnh thực, bám từ mép trên xuống và xếp
        // sát nhau. Phần dư chỉ còn ở chân cột, không xen kẽ giữa các cụm.
        let cursorTop = columnTop;

        columnModules.forEach((moduleItem, row) => {
            const clusterHeight = heights[row];
            const clusterTop = cursorTop;
            const clusterBottom = clusterTop - clusterHeight;
            cursorTop = clusterBottom - clusterGap;

            if (moduleItem.type === 'document') {
                const cardH = Math.min(clusterHeight * 0.90, 1.52);
                const cardW = Math.min(columnWidth * 0.82, cardH * 0.74);
                createDocumentCard({
                    zone, documentItem: moduleItem.documentItem, radius,
                    center: columnCenters[columnIndex], y: clusterBottom + clusterHeight / 2,
                    w: cardW, h: cardH, zoneName
                });
                return;
            }

            if (moduleItem.type === 'historical') {
                const cardH = Math.min(clusterHeight * 0.92, 1.62);
                const cardW = Math.min(columnWidth * 0.90, 2.05);
                createHistoricalStoryCard({
                    zone, card: moduleItem.card, radius,
                    center: columnCenters[columnIndex], y: clusterBottom + clusterHeight / 2,
                    w: cardW, h: cardH, zoneName
                });
                return;
            }

            const captionHeight = storyCaptionHeight(moduleItem.title);
            const photoBottom = clusterBottom + captionHeight;
            const photoHeight = clusterHeight - captionHeight;
            const slots = rectangularPhotoSlots(moduleItem.photos, columnWidth, photoHeight);
            const photoLeft = Math.min(...slots.map(slot => slot.x - slot.w / 2));
            const photoRight = Math.max(...slots.map(slot => slot.x + slot.w / 2));
            const photoContentWidth = photoRight - photoLeft;
            const photoContentCenter = (photoLeft + photoRight) / 2;
            const galleryItems = moduleItem.photos.map(item => ({
                imageUrl: item.imageUrl,
                title: item.title,
                content: item.title,
                year: item.year
            }));
            moduleItem.photos.forEach((item, index) => {
                const slot = slots[index];
                const point = zonePoint(zone, columnCenters[columnIndex] + slot.x / zoneArcLength, radius);
                createWallPhotoTile({
                    x: point.x, z: point.z, y: photoBottom + slot.y + slot.h / 2,
                    rotY: faceCoreRotY(point.angle) + (faceInnerWall ? Math.PI : 0),
                    w: slot.w, h: slot.h, accent, title: item.title, year: item.year,
                    zoneName, content: item.content, source: item.source,
                    curveRadius: faceInnerWall ? -radius : radius, imageUrl: item.imageUrl,
                    preserveAspect: true,
                    galleryItems, galleryIndex: index
                });
            });
            const labelPoint = zonePoint(
                zone,
                columnCenters[columnIndex] + photoContentCenter / zoneArcLength,
                radius
            );
            createStoryCaption({
                x: labelPoint.x, z: labelPoint.z, y: clusterBottom + captionHeight / 2,
                rotY: faceCoreRotY(labelPoint.angle) + (faceInnerWall ? Math.PI : 0),
                title: moduleItem.title, meta: moduleItem.meta, description: moduleItem.description,
                zoneName,
                bgColor: ZONE2_CONTENT_BLUE, w: photoContentWidth, h: captionHeight,
                curveRadius: faceInnerWall ? -radius : radius
            });
        });
    });
}

function createMasonryStoryWall({
    zone, photos, radius, columnCenters, clustersPerColumn, photosPerCluster,
    titles, metas = [], descriptions, zoneName, accent, faceInnerWall, groupWidth, top, bottom
}) {
    const clusterGap = 0.28;
    const captionHeight = 0.62;
    const zoneArcLength = Math.abs(zone.a1 - zone.a0) * radius;
    let photoIndex = 0;
    let clusterIndex = 0;

    clustersPerColumn.forEach((clusterCount, columnIndex) => {
        const usableHeight = top - bottom - clusterGap * (clusterCount - 1);
        const clusterHeight = usableHeight / clusterCount;

        for (let row = 0; row < clusterCount; row += 1) {
            const groupSize = photosPerCluster[clusterIndex];
            const groupPhotos = photos.slice(photoIndex, photoIndex + groupSize);
            const clusterTop = top - row * (clusterHeight + clusterGap);
            const clusterBottom = clusterTop - clusterHeight;
            const photoBottom = clusterBottom + captionHeight;
            const photoHeight = clusterHeight - captionHeight;
            const slots = rectangularPhotoSlots(groupPhotos, groupWidth, photoHeight);

            groupPhotos.forEach((item, index) => {
                const slot = slots[index];
                const point = zonePoint(
                    zone,
                    columnCenters[columnIndex] + slot.x / zoneArcLength,
                    radius
                );
                createWallPhotoTile({
                    x: point.x, z: point.z,
                    y: photoBottom + slot.y + slot.h / 2,
                    rotY: faceCoreRotY(point.angle) + (faceInnerWall ? Math.PI : 0),
                    w: slot.w, h: slot.h,
                    accent, title: item.title, year: item.year,
                    zoneName, content: item.content, source: item.source,
                    curveRadius: faceInnerWall ? -radius : radius,
                    imageUrl: item.imageUrl,
                    preserveAspect: true
                });
            });

            const labelPoint = zonePoint(zone, columnCenters[columnIndex], radius);
            createStoryCaption({
                x: labelPoint.x, z: labelPoint.z,
                y: clusterBottom + captionHeight / 2,
                rotY: faceCoreRotY(labelPoint.angle) + (faceInnerWall ? Math.PI : 0),
                title: titles[clusterIndex], meta: metas[clusterIndex], description: descriptions[clusterIndex],
                zoneName,
                bgColor: faceInnerWall ? '#8f1f2b' : '#087b70',
                w: groupWidth, h: captionHeight,
                curveRadius: faceInnerWall ? -radius : radius
            });

            photoIndex += groupSize;
            clusterIndex += 1;
        }
    });

    if (photoIndex !== photos.length) {
        console.warn(`[Cụm ảnh] Đã bố trí ${photoIndex}/${photos.length} ảnh.`);
    }
}

function choosePhotoRows(photos) {
    const ratios = photos.map(photo => THREE.MathUtils.clamp(photo.aspectRatio || 1.5, 0.42, 3.4));
    if (!ratios.length) return { ratios, rows: [], naturalHeights: [], naturalTotal: 0 };

    // Sinh các cách ngắt hàng liên tiếp. Chọn hàng có tổng tỉ lệ gần 2.65 để
    // tạo nhịp ảnh đủ lớn, ổn định và không phụ thuộc chiều cao ô cấp sẵn.
    const partitions = [];
    const buildPartitions = (remaining, rows = []) => {
        if (!remaining) {
            partitions.push(rows);
            return;
        }
        for (let size = 1; size <= Math.min(3, remaining); size += 1) {
            buildPartitions(remaining - size, [...rows, size]);
        }
    };
    buildPartitions(ratios.length);

    let best;
    partitions.forEach(rows => {
        let cursor = 0;
        const rowRatios = rows.map(size => {
            const ratioTotal = ratios.slice(cursor, cursor + size).reduce((sum, ratio) => sum + ratio, 0);
            cursor += size;
            return ratioTotal;
        });
        const singletonPenalty = rows.filter(size => size === 1).length * 0.32;
        const score = rowRatios.reduce((sum, ratio) => sum + Math.abs(ratio - 2.65), 0) + singletonPenalty;
        if (!best || score < best.score) best = { rows, rowRatios, score };
    });
    return { ratios, rows: best.rows, rowRatios: best.rowRatios };
}

function naturalPhotoLayoutHeight(photos, width) {
    const layout = choosePhotoRows(photos);
    return layout.rowRatios.reduce((sum, ratio) => sum + width / ratio, 0);
}

function rectangularPhotoSlots(photos, width, height) {
    const layout = choosePhotoRows(photos);
    const { ratios, rows } = layout;
    if (!ratios.length) return [];
    const naturalHeights = layout.rowRatios.map(ratio => width / ratio);
    const naturalTotal = naturalHeights.reduce((sum, value) => sum + value, 0);

    // Chỉ thu nhỏ đồng đều nếu tổng chiều cao vượt vùng dành cho cụm. Không
    // phóng quá giới hạn ngang của cột và không thay đổi tỉ lệ từng ảnh.
    const scale = Math.min(1, height / naturalTotal);
    const usedWidth = width * scale;
    const slots = [];
    let y = 0;
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const rowSize = rows[rowIndex];
        const rowStart = rows.slice(0, rowIndex).reduce((sum, size) => sum + size, 0);
        const rowHeight = naturalHeights[rowIndex] * scale;
        let x = -usedWidth / 2;
        for (let offset = 0; offset < rowSize; offset += 1) {
            const ratio = ratios[rowStart + offset];
            const photoWidth = rowHeight * ratio;
            slots[rowStart + offset] = {
                x: x + photoWidth / 2,
                y,
                w: photoWidth,
                h: rowHeight
            };
            x += photoWidth;
        }
        y += rowHeight;
    }
    return slots;
}

const STORY_COLLAGE_LAYOUTS = Object.freeze({
    wide: Object.freeze([
        { x: -1.0, y: 5.45, w: 1.12, h: 1.72 },
        { x:  0.0, y: 5.78, w: 1.02, h: 1.04 },
        { x:  1.0, y: 5.62, w: 1.16, h: 1.34 },
        { x:  0.0, y: 4.65, w: 1.04, h: 1.10 },
        { x:  1.0, y: 4.34, w: 1.15, h: 1.12 },
        { x: -1.0, y: 3.86, w: 1.12, h: 1.26 },
        { x:  0.0, y: 3.48, w: 1.04, h: 1.10 },
        { x:  1.0, y: 3.15, w: 1.16, h: 1.12 }
    ]),
    tower: Object.freeze([
        { x: -0.62, y: 5.30, w: 1.34, h: 2.34 },
        { x:  0.68, y: 5.88, w: 1.08, h: 1.06 },
        { x:  0.68, y: 4.73, w: 1.08, h: 1.12 },
        { x: -0.48, y: 3.55, w: 1.12, h: 1.04 },
        { x:  0.62, y: 3.48, w: 1.32, h: 1.18 }
    ]),
    stair: Object.freeze([
        { x: -0.92, y: 5.78, w: 1.08, h: 1.16 },
        { x:  0.16, y: 5.42, w: 1.34, h: 1.82 },
        { x:  1.12, y: 5.76, w: 0.96, h: 1.08 },
        { x: -0.92, y: 4.50, w: 1.08, h: 1.22 },
        { x:  1.12, y: 4.55, w: 0.96, h: 1.22 },
        { x: -0.42, y: 3.27, w: 1.38, h: 1.12 },
        { x:  0.92, y: 3.18, w: 1.18, h: 1.30 }
    ]),
    ribbon: Object.freeze([
        { x: -1.08, y: 5.35, w: 1.08, h: 1.10 },
        { x:  0.00, y: 5.68, w: 1.18, h: 1.72 },
        { x:  1.08, y: 5.30, w: 1.06, h: 1.04 },
        { x: -0.62, y: 4.08, w: 1.42, h: 1.14 },
        { x:  0.78, y: 3.95, w: 1.28, h: 1.34 }
    ])
});

function createStoryPhotoClusters({
    zone, photos, radius, centers, groupSizes, titles, descriptions,
    zoneName, accent, faceInnerWall, spread, photoScale, profiles
}) {
    let photoIndex = 0;
    groupSizes.forEach((groupSize, groupIndex) => {
        const center = centers[groupIndex];
        const profile = profiles[groupIndex];
        const groupPhotos = photos.slice(photoIndex, photoIndex + groupSize);
        photoIndex += groupSize;

        groupPhotos.forEach((item, index) => {
            const layout = STORY_COLLAGE_LAYOUTS[profile.layout];
            const slot = layout?.[index];
            if (!slot) {
                console.warn(`[Cụm ảnh] Bỏ qua ảnh ${index + 1}: bố cục "${profile.layout}" chỉ có ${layout?.length || 0} vị trí.`);
                return;
            }
            const slotX = profile.mirror ? -slot.x : slot.x;
            const point = zonePoint(zone, center + slotX * spread * profile.spread, radius);
            createWallPhotoTile({
                x: point.x, z: point.z, y: slot.y + profile.y,
                rotY: faceCoreRotY(point.angle) + (faceInnerWall ? Math.PI : 0),
                w: slot.w * photoScale * profile.scale,
                h: slot.h * profile.scale,
                accent, title: item.title, year: item.year,
                zoneName, content: item.content, curveRadius: radius,
                imageUrl: item.imageUrl
            });
        });

        const labelPoint = zonePoint(zone, center, radius + (faceInnerWall ? 0.01 : -0.01));
        createStoryCaption({
            x: labelPoint.x, z: labelPoint.z, y: profile.captionY,
            rotY: faceCoreRotY(labelPoint.angle) + (faceInnerWall ? Math.PI : 0),
            title: titles[groupIndex], description: descriptions[groupIndex],
            zoneName,
            bgColor: faceInnerWall ? '#8f1f2b' : '#087b70',
            w: 2.25 * photoScale * profile.scale,
            h: 0.62, curveRadius: radius
        });
    });
}

function createStoryCaption(cfg) {
    if (ZONE1_RAISED_TEXT_DEMO && cfg.zoneName?.startsWith('Cụm 1')) {
        return createZone1RaisedText({
            ...cfg,
            text: cfg.title || '',
            meta: cfg.meta,
            textRole: cfg.textRole || 'photo-caption',
            align: 'left',
            fontWeight: 800,
            maxFontSize: cfg.maxFontSize || (cfg.h <= .26 ? 76 : 92),
            depth: .075
        });
    }
    const canvas = document.createElement('canvas');
    const compact = cfg.h <= 0.26;
    canvas.height = compact ? 116 : 180;
    // Giữ cùng tỉ lệ với mặt phẳng 3D để chữ không bị kéo ngang/dọc.
    canvas.width = Math.max(640, Math.min(3072, Math.round(canvas.height * cfg.w / cfg.h)));
    const ctx = canvas.getContext('2d');
    const textLeft = 48;
    const textMaxWidth = canvas.width - textLeft - 34;
    const useBlueWhite = USE_ZONE1_EDITORIAL_V2 || cfg.zoneName?.startsWith('Cụm 2');
    ctx.fillStyle = useBlueWhite ? ZONE2_CONTENT_BLUE : cfg.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = useBlueWhite ? ZONE1_BA_PALETTE.gold : '#d6b46a';
    ctx.fillRect(22, 10, 6, canvas.height - 20);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const title = cfg.title || '';
    const meta = String(cfg.meta || '').trim();
    const maxTitleLines = compact ? 2 : 3;
    const metaSize = compact ? 17 : 20;
    const metaGap = meta ? (compact ? 7 : 10) : 0;
    const verticalPadding = compact ? 16 : 20;
    // Font tỷ lệ theo chiều cao dải chú thích, thay vì cố định 21–24px.
    let titleSize = compact ? 29 : 40;
    let titleLines = [];
    const buildTitleLines = () => {
        ctx.font = `800 ${titleSize}px ${UI_FONT}`;
        const words = title.split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        words.forEach((word) => {
            const candidate = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(candidate).width > textMaxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        });
        if (line) lines.push(line);
        return lines;
    };
    titleLines = buildTitleLines();
    const titleBlockFits = () => {
        const lineHeight = titleSize * 1.12;
        const totalHeight = titleLines.length * lineHeight + metaGap + (meta ? metaSize : 0);
        return titleLines.length <= maxTitleLines && totalHeight <= canvas.height - verticalPadding * 2;
    };
    while (!titleBlockFits() && titleSize > 24) {
        titleSize -= 2;
        titleLines = buildTitleLines();
    }
    if (titleLines.length > maxTitleLines) {
        const visibleLines = titleLines.slice(0, maxTitleLines);
        visibleLines[maxTitleLines - 1] = `${titleLines.slice(maxTitleLines - 1).join(' ').slice(0, 68).trim()}…`;
        titleLines = visibleLines;
    }

    const lineHeight = titleSize * 1.12;
    const contentHeight = titleLines.length * lineHeight + metaGap + (meta ? metaSize : 0);
    const titleTop = Math.max(verticalPadding, (canvas.height - contentHeight) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${titleSize}px ${UI_FONT}`;
    titleLines.forEach((line, index) => ctx.fillText(line, textLeft, titleTop + index * lineHeight, textMaxWidth));

    if (meta) {
        const yearTop = titleTop + titleLines.length * lineHeight + metaGap;
        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        ctx.font = `700 ${metaSize}px ${UI_FONT}`;
        ctx.fillText(meta, textLeft, yearTop, textMaxWidth);
    }

    const texture = createSRGBCanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(cfg.w, cfg.h, 20, 1);
    if (cfg.curveRadius) bendGeometry(geometry, cfg.curveRadius);
    const panel = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        map: texture, roughness: 0.72, metalness: 0.02
    }));
    panel.position.set(cfg.x, cfg.y, cfg.z);
    panel.rotation.y = cfg.rotY;
    createLayeredRaisedSurface({
        geometry, texture, position: cfg, rotationY: cfg.rotY,
        tint: 0x8ebbd1, depth: .09, layers: 6
    });
    scene.add(panel);
}

function createHeatmapPanel(p, zone, { faceInnerWall = false, radius = WALL_MOUNT_R } = {}) {
    const curveRadius = faceInnerWall ? -radius : radius;
    const mapRoot = new THREE.Group();
    mapRoot.position.set(p.x, 4.55, p.z);
    mapRoot.rotation.y = faceCoreRotY(p.angle) + (faceInnerWall ? Math.PI : 0);
    scene.add(mapRoot);

    vietnamMapState = {
        root: mapRoot,
        curveRadius,
        zone,
        features: [],
        activeRegion: null,
        overviewContent: new THREE.Group(),
        regionContent: null,
        overviewMeshes: [],
        regionMeshes: [],
        provinceMeshes: [],
        regionClosing: false,
        layout: { overviewX: 0, overviewScale: 1, regionScale: 0, regionOpacity: 0 }
    };
    mapRoot.add(vietnamMapState.overviewContent);

    const fetchGeoJSON = url => fetch(url).then(response => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.json();
    });
    Promise.all([
        fetchGeoJSON(VIETNAM_MAP_GEOJSON),
        fetchGeoJSON(VIETNAM_ARCHIPELAGO_GEOJSON).catch(error => {
            console.warn('Không tải được lớp GIS Hoàng Sa - Trường Sa, dùng dữ liệu bản đồ mặc định:', error);
            return null;
        })
    ])
        .then(([data, archipelagoData]) => {
            vietnamMapState.features = mergeVietnamArchipelagoGeometry(data.features || [], archipelagoData?.features || []);
            buildVietnamMapView();
            const previewParams = new URLSearchParams(window.location.search);
            const previewProvince = previewParams.get('activityPreview');
            const previewFeature = previewProvince
                ? vietnamMapState.features.find(feature => feature.properties._slug === previewProvince)
                : null;
            const previewRegion = previewFeature?.properties._region || previewParams.get('mapRegion');
            if (VIETNAM_REGION_META[previewRegion]) {
                focusVietnamRegion(previewRegion);
                const previewMesh = vietnamMapState.regionMeshes.find(mesh => mesh.userData.slug === previewProvince);
                if (previewMesh?.userData.isInteractive) handleVietnamMapSelection(previewMesh.userData);
            } else {
                prepareHeatmapOverviewSlides();
                resumeHeatmapOverviewSlideshow(true);
            }
        })
        .catch(error => {
            console.error('Không tải được GeoJSON bản đồ Việt Nam 34 tỉnh:', error);
            updateHeatmapTV('BẢN ĐỒ TẠM THỜI GIÁN ĐOẠN', 'Nội dung bản đồ hiện chưa khả dụng. Vui lòng thử lại sau.', '#8f1f2b');
        });
}

function mergeVietnamArchipelagoGeometry(features, sourceFeatures) {
    const sourceByProvince = {
        'Đà Nẵng': sourceFeatures.find(feature => /^Hoang Sa\b/i.test(feature.properties?.Note || '')),
        'Khánh Hòa': sourceFeatures.find(feature => /^Truong Sa\b/i.test(feature.properties?.Note || ''))
    };
    return features.map(feature => {
        const province = feature.properties.TinhThanh;
        const sourceFeature = sourceByProvince[province];
        if (!sourceFeature) return feature;
        // Bỏ polygon xa bờ đã gộp sẵn trong bộ 34 tỉnh, rồi thay bằng feature
        // Hoàng Sa/Trường Sa có tên và nguồn hình học riêng trong bộ GIS gốc.
        const mainlandPolygons = vietnamGeometryPolygons(feature.geometry).filter(polygon => {
            const ring = polygon[0] || [];
            if (!ring.length) return false;
            const averageLongitude = ring.reduce((sum, [longitude]) => sum + longitude, 0) / ring.length;
            return averageLongitude < 110.3;
        });
        const archipelagoPolygons = vietnamGeometryPolygons(sourceFeature.geometry);
        return {
            ...feature,
            properties: {
                ...feature.properties,
                _archipelagoStartIndex: mainlandPolygons.length,
                _archipelagoSource: sourceFeature.properties.Note
            },
            geometry: { type: 'MultiPolygon', coordinates: [...mainlandPolygons, ...archipelagoPolygons] }
        };
    });
}

function vietnamGeometryPolygons(geometry) {
    return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function walkVietnamCoordinates(node, output) {
    if (Array.isArray(node) && typeof node[0] === 'number') output.push(node);
    else if (Array.isArray(node)) node.forEach(child => walkVietnamCoordinates(child, output));
}

function vietnamProjection(features) {
    const coordinates = [];
    features.forEach(feature => walkVietnamCoordinates(feature.geometry.coordinates, coordinates));
    const mainland = coordinates.filter(([longitude]) => longitude < 110.5);
    const source = mainland.length ? mainland : coordinates;
    const bounds = source.reduce((result, [longitude, latitude]) => ({
        minX: Math.min(result.minX, longitude), maxX: Math.max(result.maxX, longitude),
        minY: Math.min(result.minY, latitude), maxY: Math.max(result.maxY, latitude)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const centerLongitude = (bounds.minX + bounds.maxX) / 2;
    const centerLatitude = (bounds.minY + bounds.maxY) / 2;
    const longitudeScale = Math.cos(centerLatitude * Math.PI / 180);
    const sourceWidth = (bounds.maxX - bounds.minX) * longitudeScale;
    const sourceHeight = bounds.maxY - bounds.minY;
    const scale = Math.min(VIETNAM_MAP_SIZE.width / sourceWidth, VIETNAM_MAP_SIZE.height / sourceHeight);
    return ([longitude, latitude]) => [
        (longitude - centerLongitude) * longitudeScale * scale,
        (latitude - centerLatitude) * scale
    ];
}

function createVietnamShape(rings, project) {
    const makePath = (ring, PathType) => {
        const path = new PathType();
        ring.forEach((coordinate, index) => {
            const [x, y] = project(coordinate);
            if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
        });
        path.closePath();
        return path;
    };
    const shape = makePath(rings[0], THREE.Shape);
    rings.slice(1).forEach(ring => shape.holes.push(makePath(ring, THREE.Path)));
    return shape;
}

function projectVietnamOffshore([longitude, latitude], province, mainlandProject) {
    // Giữ nguyên vĩ độ theo phép chiếu địa lý của bản đồ. Chỉ nén kinh độ để
    // Hoàng Sa và Trường Sa lọt trên mảng tường mà vẫn nằm đúng trục bắc-nam.
    const inset = VIETNAM_ARCHIPELAGO_INSETS[province] || VIETNAM_ARCHIPELAGO_INSETS['Khánh Hòa'];
    const { source, target } = inset;
    const u = THREE.MathUtils.clamp((longitude - source.minX) / (source.maxX - source.minX), 0, 1);
    const [, geographicY] = mainlandProject([longitude, latitude]);
    return [
        THREE.MathUtils.lerp(target.minX, target.maxX, u),
        THREE.MathUtils.clamp(geographicY, -VIETNAM_MAP_SIZE.height / 2 + 0.06, VIETNAM_MAP_SIZE.height / 2 - 0.06)
    ];
}

function disposeVietnamMapLayer(group, meshes = []) {
    if (!group || !vietnamMapState) return;
    meshes.forEach(mesh => {
        const index = interactiveObjects.indexOf(mesh);
        if (index >= 0) interactiveObjects.splice(index, 1);
    });
    group.traverse(object => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose();
    });
    vietnamMapState.root.remove(group);
}

function setVietnamMapLayerOpacity(group, opacity) {
    if (!group) return;
    group.visible = opacity > 0.002;
    group.traverse(object => {
        if (!object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
            const opacityScale = material.userData.layerOpacityScale ?? 1;
            material.transparent = opacity < 0.999 || opacityScale < 0.999;
            material.opacity = opacity * opacityScale;
        });
    });
}

function addVietnamOverviewCapitalStar(parent, project) {
    // Ký hiệu Thủ đô chỉ thuộc bản đồ Việt Nam tổng quan. Dựng trực tiếp theo
    // phép chiếu của lớp overview để ngôi sao đi cùng bản đồ khi thu nhỏ/dịch trái.
    const [centerX, centerY] = project([105.8342, 21.0278]);
    const outerRadius = .19;
    const innerRadius = outerRadius * .43;
    const shape = new THREE.Shape();
    for (let index = 0; index < 10; index++) {
        const angle = Math.PI / 2 + index * Math.PI / 5;
        const radius = index % 2 === 0 ? outerRadius : innerRadius;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: .045, bevelEnabled: false, steps: 1, curveSegments: 1
    });
    geometry.translate(0, 0, NORTHERN_MAP_WALL_CLEARANCE + VIETNAM_MAP_RELIEF_DEPTH + .055);
    bendGeometry(geometry, vietnamMapState.curveRadius);
    const star = new THREE.Mesh(geometry, [
        new THREE.MeshBasicMaterial({ color: VIETNAM_CAPITAL_GOLD, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0xb97900, roughness: .42, metalness: .18, side: THREE.DoubleSide })
    ]);
    star.name = 'HanoiCapitalStar';
    star.renderOrder = 6;
    // Không để hình sao trở thành một mục raycast riêng. Nó được gắn vào mesh
    // Hà Nội nên sẽ cùng nổi lên khi hover mà vẫn chuyển click về lớp tỉnh bên dưới.
    star.raycast = () => {};
    parent.add(star);
}

function buildVietnamMapLayer(activeRegion = null, mapRole = 'overview') {
    const visibleFeatures = activeRegion
        ? vietnamMapState.features.filter(feature => feature.properties._region === activeRegion)
        : vietnamMapState.features;
    const project = vietnamProjection(visibleFeatures);
    const group = new THREE.Group();
    const meshes = [];
    vietnamMapState.root.add(group);

    visibleFeatures.forEach((feature, index) => {
        const province = feature.properties.TinhThanh;
        const provinceHasActivities = Boolean(PROVINCE_ACTIVITIES[feature.properties._slug]?.length);
        const regionHasActivities = vietnamMapState.features.some(item =>
            item.properties._region === feature.properties._region
            && PROVINCE_ACTIVITIES[item.properties._slug]?.length
        );
        const isInteractive = activeRegion ? provinceHasActivities : regionHasActivities;
        const shapes = vietnamGeometryPolygons(feature.geometry)
            .map((polygon, polygonIndex) => ({ polygon, polygonIndex }))
            .filter(({ polygon }) => polygon[0]?.length >= 4)
            .map(({ polygon, polygonIndex }) => {
                const averageLongitude = polygon[0].reduce((sum, [longitude]) => sum + longitude, 0) / polygon[0].length;
                const archipelagoStartIndex = feature.properties._archipelagoStartIndex;
                const isOffshore = Number.isInteger(archipelagoStartIndex)
                    ? polygonIndex >= archipelagoStartIndex
                    : VIETNAM_ARCHIPELAGO_INSETS[province] && averageLongitude >= 110.3;
                const polygonProject = isOffshore
                    ? coordinate => projectVietnamOffshore(coordinate, province, project)
                    : project;
                return createVietnamShape(polygon, polygonProject);
            });
        if (!shapes.length) return;
        const geometry = new THREE.ExtrudeGeometry(shapes, {
            depth: VIETNAM_MAP_RELIEF_DEPTH,
            bevelEnabled: false,
            steps: 1,
            curveSegments: 1
        });
        geometry.translate(0, 0, NORTHERN_MAP_WALL_CLEARANCE + 0.025);
        // Tạo cạnh khi bản đồ còn phẳng. Nếu tạo sau khi uốn, các tam giác nội
        // bộ trở thành những mặt hơi lệch nhau và EdgesGeometry sẽ vẽ vết chéo.
        const outlineGeometry = new THREE.EdgesGeometry(geometry, 22);
        bendGeometry(geometry, vietnamMapState.curveRadius);
        bendGeometry(outlineGeometry, vietnamMapState.curveRadius);
        const region = feature.properties._region;
        const baseColor = mapRole === 'overview'
            ? VIETNAM_OVERVIEW_RED
            : !isInteractive
                ? 0x8d9298
                : VIETNAM_PROVINCE_PALETTE[index % VIETNAM_PROVINCE_PALETTE.length];
        // Mặt màu không nhận shading để phép chia tam giác của ExtrudeGeometry
        // không hiện thành các mảng sáng/tối khi nhìn xiên trên tường cong.
        const topMaterial = new THREE.MeshBasicMaterial({
            color: baseColor,
            side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1
        });
        const sideMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(baseColor).multiplyScalar(0.58),
            roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, [topMaterial, sideMaterial]);
        mesh.userData = {
            type: 'vietnam-province',
            title: activeRegion ? feature.properties.TinhThanh : VIETNAM_REGION_META[region].name,
            province: feature.properties.TinhThanh,
            slug: feature.properties._slug,
            region,
            baseColor,
            topMaterial,
            targetLift: 0,
            isInteractive,
            mapRole,
            zoneName: vietnamMapState.zone.name
        };
        // Chỉ bản đồ chi tiết miền có ranh giới tỉnh. Overview giữ các mesh tỉnh
        // riêng để raycast chọn miền nhưng nhìn như một khối Việt Nam liền màu.
        if (mapRole === 'region') {
            const outline = new THREE.LineSegments(
                outlineGeometry,
                new THREE.LineBasicMaterial({
                    color: VIETNAM_REGION_BORDER,
                    transparent: true,
                    opacity: 0.96,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            outline.material.userData.layerOpacityScale = 0.96;
            outline.material.depthTest = true;
            outline.renderOrder = 3;
            mesh.userData.outline = outline;
            mesh.add(outline);
        } else {
            outlineGeometry.dispose();
        }
        group.add(mesh);
        meshes.push(mesh);
        if (isInteractive) interactiveObjects.push(mesh);
    });
    if (mapRole === 'overview') {
        const hanoiMesh = meshes.find(mesh => mesh.userData.slug === 'ha-noi');
        addVietnamOverviewCapitalStar(hanoiMesh || group, project);
    }
    return { group, meshes };
}

function buildVietnamMapView() {
    if (!vietnamMapState?.features.length) return;
    disposeVietnamMapLayer(vietnamMapState.overviewContent, vietnamMapState.overviewMeshes);
    disposeVietnamMapLayer(vietnamMapState.regionContent, vietnamMapState.regionMeshes);
    const overview = buildVietnamMapLayer(null, 'overview');
    vietnamMapState.overviewContent = overview.group;
    vietnamMapState.overviewMeshes = overview.meshes;
    vietnamMapState.regionContent = null;
    vietnamMapState.regionMeshes = [];
    vietnamMapState.provinceMeshes = overview.meshes;
    vietnamMapState.layout = { overviewX: 0, overviewScale: 1, regionScale: 0, regionOpacity: 0 };
}

function updateVietnamMapHover(object) {
    if (!vietnamMapState) return;
    framePolicy.invalidate(12);
    const isProvince = object?.userData.type === 'vietnam-province' && object.userData.isInteractive;
    const hoveredRegion = isProvince ? object.userData.region : null;
    const hoveredProvince = isProvince ? object : null;
    vietnamMapState.provinceMeshes.forEach(mesh => {
        const isOverviewReturn = vietnamMapState.activeRegion
            && hoveredProvince?.userData.mapRole === 'overview'
            && mesh.userData.mapRole === 'overview';
        const isSelectedProvince = vietnamMapState.activeRegion
            && mesh.userData.mapRole === 'region'
            && mesh.userData.slug === activeProvinceSelection?.slug;
        const highlighted = mesh.userData.isInteractive && (isOverviewReturn
            || (!vietnamMapState.activeRegion && hoveredRegion && mesh.userData.region === hoveredRegion)
            || (vietnamMapState.activeRegion && mesh === hoveredProvince && mesh.userData.mapRole === 'region')
            || isSelectedProvince);
        mesh.userData.targetLift = highlighted
            ? (mesh.userData.mapRole === 'region' ? 0.18 : 0.14)
            : 0;
        mesh.userData.topMaterial.color.set(mesh.userData.baseColor);
        if (highlighted) {
            if (mesh.userData.mapRole === 'overview') mesh.userData.topMaterial.color.setHex(VIETNAM_OVERVIEW_HOVER_RED);
            else mesh.userData.topMaterial.color.lerp(new THREE.Color(0xf2bf3b), 0.42);
        }
        if (mesh.userData.outline) {
            mesh.userData.outline.material.color.set(highlighted ? 0xffcc45 : VIETNAM_REGION_BORDER);
            mesh.userData.outline.material.userData.layerOpacityScale = highlighted
                ? 1
                : (mesh.userData.mapRole === 'region' ? 0.96 : 0.28);
        }
    });
}

function updateVietnamMapLift(delta) {
    if (!vietnamMapState) return;
    // Nội suy theo thời gian để hiệu ứng không phụ thuộc FPS và không giật khi
    // con trỏ đi nhanh qua ranh giới giữa các tỉnh.
    const blend = 1 - Math.exp(-13 * delta);
    vietnamMapState.provinceMeshes.forEach(mesh => {
        const target = mesh.userData.targetLift || 0;
        mesh.position.z += (target - mesh.position.z) * blend;
        if (Math.abs(target - mesh.position.z) < 0.0005) mesh.position.z = target;
    });
}

function updateVietnamMapLayout(delta) {
    if (!vietnamMapState?.overviewContent) return;
    const blend = 1 - Math.exp(-7.5 * delta);
    const layout = vietnamMapState.layout;
    const hasRegion = Boolean(vietnamMapState.activeRegion) && !vietnamMapState.regionClosing;
    const overviewTargetX = hasRegion ? -2.15 : 0;
    const overviewTargetScale = hasRegion ? 0.23 : 1;
    // 1.02 là mức lớn nhất còn vừa chiều cao tường, không chạm tiêu đề và
    // vẫn chừa một khe rõ ràng với bản đồ Việt Nam thu nhỏ ở bên trái.
    const regionTargetScale = hasRegion ? 1.02 : 0.03;
    const regionTargetOpacity = hasRegion ? 1 : 0;

    layout.overviewX += (overviewTargetX - layout.overviewX) * blend;
    layout.overviewScale += (overviewTargetScale - layout.overviewScale) * blend;
    layout.regionScale += (regionTargetScale - layout.regionScale) * blend;
    layout.regionOpacity += (regionTargetOpacity - layout.regionOpacity) * blend;
    vietnamMapState.overviewContent.position.x = layout.overviewX;
    vietnamMapState.overviewContent.scale.setScalar(layout.overviewScale);

    if (vietnamMapState.regionContent) {
        vietnamMapState.regionContent.position.x = 0.78;
        vietnamMapState.regionContent.scale.setScalar(layout.regionScale);
        setVietnamMapLayerOpacity(vietnamMapState.regionContent, layout.regionOpacity);
        if (vietnamMapState.regionClosing && layout.regionOpacity < 0.015) {
            disposeVietnamMapLayer(vietnamMapState.regionContent, vietnamMapState.regionMeshes);
            vietnamMapState.regionContent = null;
            vietnamMapState.regionMeshes = [];
            vietnamMapState.provinceMeshes = vietnamMapState.overviewMeshes;
            vietnamMapState.regionClosing = false;
        }
    }
}

function handleVietnamMapSelection(data) {
    if (!data.isInteractive) return;
    if (data.mapRole === 'overview' && vietnamMapState.activeRegion) {
        focusVietnamRegion(null);
        return;
    }
    if (data.mapRole === 'overview') {
        focusVietnamRegion(data.region);
        return;
    }
    const activities = PROVINCE_ACTIVITIES[data.slug] || [];
    activeProvinceSelection = { slug: data.slug, province: data.province, activities, index: 0 };
    provinceActivityCursor.set(data.slug, 0);
    heatmapCurrentImageIndex = 0;
    renderSelectedProvinceActivity();
    scheduleHeatmapAutoAdvance(performance.now());
    updateVietnamMapHover(hoveredObject);
}

function renderSelectedProvinceActivity() {
    if (!activeProvinceSelection?.activities.length) return;
    const { slug, province, activities, index } = activeProvinceSelection;
    const activity = activities[index];
    renderHeatmapActivity(activity, {
        province,
        position: `${index + 1}/${activities.length}`
    });
    provinceActivityCursor.set(slug, index);
    updateHeatmapTVNavigation();
}

function navigateProvinceActivity(direction) {
    if (!activeProvinceSelection || direction === 0) return;
    const nextIndex = activeProvinceSelection.index + direction;
    if (nextIndex < 0 || nextIndex >= activeProvinceSelection.activities.length) return;
    activeProvinceSelection.index = nextIndex;
    heatmapCurrentImageIndex = 0;
    heatmapManualPauseUntil = performance.now() + HEATMAP_MANUAL_PAUSE_MS;
    renderSelectedProvinceActivity();
    scheduleHeatmapAutoAdvance(heatmapManualPauseUntil);
}

function prepareHeatmapOverviewSlides() {
    const provinceNames = new Map((vietnamMapState?.features || []).map(feature => [
        feature.properties._slug,
        feature.properties.TinhThanh
    ]));
    heatmapOverviewSlides = Object.entries(PROVINCE_ACTIVITIES).flatMap(([slug, activities]) =>
        activities.map(activity => ({
            ...activity,
            slug,
            province: provinceNames.get(slug) || slug.replaceAll('-', ' ')
        }))
    );
    if (heatmapOverviewIndex >= heatmapOverviewSlides.length) heatmapOverviewIndex = 0;
}

function pauseHeatmapOverviewSlideshow() {
    heatmapOverviewNextAt = 0;
}

function renderHeatmapOverviewSlide() {
    if (!heatmapOverviewSlides.length) return;
    const slide = heatmapOverviewSlides[heatmapOverviewIndex];
    renderHeatmapActivity(slide, {
        province: slide.province,
        position: `${heatmapOverviewIndex + 1}/${heatmapOverviewSlides.length}`
    });
}

function getDisplayedHeatmapActivity() {
    if (activeProvinceSelection?.activities.length) {
        return activeProvinceSelection.activities[activeProvinceSelection.index];
    }
    return heatmapOverviewSlides[heatmapOverviewIndex] || null;
}

function getHeatmapMedia(activity) {
    return Array.isArray(activity?.media) ? activity.media : [];
}

function renderHeatmapActivity(activity, extra = {}) {
    if (!activity) return;
    const mediaItems = getHeatmapMedia(activity);
    heatmapCurrentImageIndex = Math.min(heatmapCurrentImageIndex, Math.max(0, mediaItems.length - 1));
    const currentMedia = mediaItems[heatmapCurrentImageIndex];
    heatmapDisplayedActivity = activity;
    updateHeatmapTV(activity.title, activity.summary, '#0092df', {
        ...extra,
        place: activity.place,
        date: activity.date,
        image: currentMedia?.src,
        imagePosition: mediaItems.length > 1 ? `${heatmapCurrentImageIndex + 1}/${mediaItems.length}` : '',
        hasPreviousImage: heatmapCurrentImageIndex > 0,
        hasNextImage: heatmapCurrentImageIndex < mediaItems.length - 1,
        type: activity.type
    });
}

function heatmapAutoDelay(activity = getDisplayedHeatmapActivity()) {
    const count = getHeatmapMedia(activity).length;
    if (count <= 1) return HEATMAP_SINGLE_ACTIVITY_MS;
    if (heatmapCurrentImageIndex === 0) return HEATMAP_FIRST_IMAGE_MS;
    return HEATMAP_NEXT_IMAGE_MS + (heatmapCurrentImageIndex === count - 1 ? HEATMAP_LAST_IMAGE_EXTRA_MS : 0);
}

function scheduleHeatmapAutoAdvance(fromTime = performance.now()) {
    if (!getDisplayedHeatmapActivity()) return;
    heatmapOverviewNextAt = Math.max(fromTime, heatmapManualPauseUntil) + heatmapAutoDelay();
}

function navigateHeatmapImage(direction, manual = true) {
    const activity = getDisplayedHeatmapActivity();
    const mediaItems = getHeatmapMedia(activity);
    const next = heatmapCurrentImageIndex + direction;
    if (!activity || next < 0 || next >= mediaItems.length) return;
    heatmapCurrentImageIndex = next;
    if (manual) heatmapManualPauseUntil = performance.now() + HEATMAP_MANUAL_PAUSE_MS;
    if (activeProvinceSelection) renderSelectedProvinceActivity(); else renderHeatmapOverviewSlide();
    scheduleHeatmapAutoAdvance(manual ? heatmapManualPauseUntil : performance.now());
}

function openHeatmapActivityModal() {
    const activity = getDisplayedHeatmapActivity();
    if (!activity) return;
    pauseHeatmapOverviewSlideshow();
    const mediaItems = getHeatmapMedia(activity);
    const currentMedia = mediaItems[heatmapCurrentImageIndex];
    showInfoPanel({
        type: 'artifact',
        displayMode: mediaItems.length ? 'photo-caption' : undefined,
        zoneName: 'SƯ PHẠM ĐI VÀ YÊU', code: '', color: 0x0092df,
        title: currentMedia?.title || activity.title,
        content: currentMedia?.title || activity.fullText || activity.summary,
        year: [activity.place, activity.date].filter(Boolean).join(' · '),
        imageUrl: currentMedia?.src,
        galleryIndex: heatmapCurrentImageIndex,
        galleryItems: mediaItems.map(item => ({
            imageUrl: item.src, title: item.title || activity.title,
            content: item.title || activity.title,
            year: [activity.place, activity.date].filter(Boolean).join(' · ')
        }))
    });
}

function handleHeatmapTVClick(uv) {
    const mediaCount = getHeatmapMedia(getDisplayedHeatmapActivity()).length;
    if (uv && mediaCount > 1) {
        const canvasX = uv.x * heatmapTVCanvas.width;
        const canvasY = (1 - uv.y) * heatmapTVCanvas.height;
        if (canvasY >= 612 && canvasY <= 676 && canvasX >= 54 && canvasX <= 178) {
            navigateHeatmapImage(-1);
            return;
        }
        if (canvasY >= 612 && canvasY <= 676 && canvasX >= 390 && canvasX <= 514) {
            navigateHeatmapImage(1);
            return;
        }
    }
    openHeatmapActivityModal();
}

function resumeHeatmapOverviewSlideshow(immediate = false) {
    if (!heatmapOverviewSlides.length) prepareHeatmapOverviewSlides();
    if (!heatmapOverviewSlides.length || activeProvinceSelection) return;
    if (immediate) {
        heatmapCurrentImageIndex = 0;
        renderHeatmapOverviewSlide();
    }
    scheduleHeatmapAutoAdvance(performance.now());
}

function updateHeatmapOverviewSlideshow(timeMs) {
    if (!heatmapOverviewNextAt || !heatmapOverviewSlides.length) return;
    const infoOpen = document.getElementById('info-overlay')?.style.display === 'flex';
    const guideOpen = document.getElementById('guide-overlay')?.style.display === 'flex';
    if (isDocumentOpen || infoOpen || guideOpen || document.hidden) return;
    if (timeMs < heatmapOverviewNextAt) return;
    const activity = getDisplayedHeatmapActivity();
    const mediaItems = getHeatmapMedia(activity);
    if (heatmapCurrentImageIndex < mediaItems.length - 1) {
        navigateHeatmapImage(1, false);
        return;
    }
    heatmapCurrentImageIndex = 0;
    if (activeProvinceSelection?.activities.length) {
        activeProvinceSelection.index = (activeProvinceSelection.index + 1) % activeProvinceSelection.activities.length;
        renderSelectedProvinceActivity();
    } else {
        heatmapOverviewIndex = (heatmapOverviewIndex + 1) % heatmapOverviewSlides.length;
        renderHeatmapOverviewSlide();
    }
    scheduleHeatmapAutoAdvance(timeMs);
}

function focusVietnamRegion(region) {
    if (!vietnamMapState) return;
    framePolicy.invalidate(36);
    if (region) {
        const hasActivities = vietnamMapState.features.some(feature =>
            feature.properties._region === region
            && PROVINCE_ACTIVITIES[feature.properties._slug]?.length
        );
        if (!hasActivities) return;
        activeProvinceSelection = null;
        updateHeatmapTVNavigation();
        disposeVietnamMapLayer(vietnamMapState.regionContent, vietnamMapState.regionMeshes);
        vietnamMapState.activeRegion = region;
        vietnamMapState.regionClosing = false;
        const detail = buildVietnamMapLayer(region, 'region');
        vietnamMapState.regionContent = detail.group;
        vietnamMapState.regionMeshes = detail.meshes;
        vietnamMapState.provinceMeshes = [...vietnamMapState.overviewMeshes, ...detail.meshes];
        vietnamMapState.layout.regionScale = 0.03;
        vietnamMapState.layout.regionOpacity = 0;
        detail.group.position.x = 0.78;
        detail.group.scale.setScalar(0.03);
        setVietnamMapLayerOpacity(detail.group, 0);
        const count = vietnamMapState.features.filter(feature => feature.properties._region === region).length;
        updateHeatmapTV(VIETNAM_REGION_META[region].name, `${count} tỉnh/thành · Chọn một tỉnh để xem hoạt động.`, '#8f1f2b');
        resumeHeatmapOverviewSlideshow(false);
    } else {
        activeProvinceSelection = null;
        updateHeatmapTVNavigation();
        vietnamMapState.activeRegion = null;
        vietnamMapState.regionClosing = Boolean(vietnamMapState.regionContent);
        vietnamMapState.regionMeshes.forEach(mesh => {
            const index = interactiveObjects.indexOf(mesh);
            if (index >= 0) interactiveObjects.splice(index, 1);
        });
        resumeHeatmapOverviewSlideshow(true);
    }
}

function createHeatmapNavTexture(symbol) {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = 'rgba(0,55,92,.35)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 126px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, canvas.width / 2, canvas.height / 2 - 7);
    return createSRGBCanvasTexture(canvas);
}

function updateHeatmapTVNavigation() {
    const count = activeProvinceSelection?.activities.length || 0;
    const index = activeProvinceSelection?.index || 0;
    heatmapTVNavButtons.forEach(button => {
        const disabled = count <= 1
            || (button.userData.direction < 0 && index === 0)
            || (button.userData.direction > 0 && index === count - 1);
        button.visible = count > 1;
        button.userData.disabled = disabled;
        button.material.color.setHex(disabled ? 0x7895a6 : 0x0092df);
        button.material.emissive.setHex(disabled ? 0x263c49 : 0x005b8c);
        button.material.emissiveIntensity = disabled ? 0.10 : 0.34;
        button.userData.arrowMaterial.opacity = disabled ? 0.42 : 1;
        button.userData.outlineMaterial.opacity = disabled ? 0.30 : 0.92;
        button.userData.glowMaterial.opacity = disabled ? 0.02 : 0.09;
    });
}

function createHeatmapTV(p, zone, { faceInnerWall = false, radius = WALL_MOUNT_R } = {}) {
    heatmapTVCanvas = document.createElement('canvas'); heatmapTVCanvas.width = 1280; heatmapTVCanvas.height = 720;
    heatmapTVCtx = heatmapTVCanvas.getContext('2d');
    heatmapTVTex = createSRGBCanvasTexture(heatmapTVCanvas); heatmapTVTex.anisotropy = 4;

    // Tăng diện tích hiển thị lên khoảng 2,56 lần nhưng vẫn chừa biên an toàn
    // với bản đồ và ranh giới cụm trên mặt tường cong.
    const w = 6.8, h = 3.8;
    const curveRadius = faceInnerWall ? -radius : radius;
    const geo = new THREE.PlaneGeometry(w, h, 32, 1); bendGeometry(geo, curveRadius);
    heatmapTVMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: heatmapTVTex, emissive: 0xffffff, emissiveMap: heatmapTVTex, emissiveIntensity: 0.5 }));
    heatmapTVMesh.position.set(p.x, 4.5, p.z);
    heatmapTVMesh.rotation.y = faceCoreRotY(p.angle) + (faceInnerWall ? Math.PI : 0);
    heatmapTVMesh.userData = { type: 'heatmap-tv', title: 'Mở nội dung hoạt động' };
    scene.add(heatmapTVMesh);
    interactiveObjects.push(heatmapTVMesh);

    heatmapTVNavButtons = [-1, 1].map(direction => {
        // Nút nổi nằm ngoài mép TV, không phủ lên vùng ảnh và chữ.
        const buttonX = direction * (w / 2 + 0.55);
        const buttonRadius = 0.42;
        // Đĩa tròn có chiều sâu thật, đặt song song với mặt TV cong.
        const buttonGeometry = new THREE.CylinderGeometry(buttonRadius, buttonRadius, 0.14, 48, 1, false);
        buttonGeometry.rotateX(Math.PI / 2);
        buttonGeometry.translate(buttonX, 0, 0.16);
        const outlineGeometry = new THREE.EdgesGeometry(buttonGeometry, 20);
        bendGeometry(buttonGeometry, curveRadius);
        bendGeometry(outlineGeometry, curveRadius);
        const button = new THREE.Mesh(buttonGeometry, new THREE.MeshStandardMaterial({
            color: 0x0092df,
            roughness: 0.26,
            metalness: 0.18,
            emissive: 0x005b8c,
            emissiveIntensity: 0.34,
            side: THREE.DoubleSide
        }));

        const outlineMaterial = new THREE.LineBasicMaterial({
            color: 0xcceeff, transparent: true, opacity: 0.92,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        outline.renderOrder = 10;
        button.add(outline);

        const glowGeometry = new THREE.CircleGeometry(buttonRadius + 0.16, 48);
        glowGeometry.translate(buttonX, 0, 0.25);
        bendGeometry(glowGeometry, curveRadius);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0092df, transparent: true, opacity: 0.09,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.renderOrder = 8;
        button.add(glow);

        const arrowGeometry = new THREE.PlaneGeometry(0.42, 0.62, 4, 1);
        arrowGeometry.translate(buttonX, 0, 0.27);
        bendGeometry(arrowGeometry, curveRadius);
        const arrowMaterial = new THREE.MeshBasicMaterial({
            map: createHeatmapNavTexture(direction < 0 ? '‹' : '›'),
            transparent: true, opacity: 1, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.renderOrder = 11;
        button.add(arrow);
        button.renderOrder = 9;
        button.visible = false;
        button.userData = {
            type: 'heatmap-tv-nav', direction,
            title: direction < 0 ? 'Hoạt động trước' : 'Hoạt động tiếp theo',
            disabled: true,
            arrowMaterial, outlineMaterial, glowMaterial
        };
        heatmapTVMesh.add(button);
        interactiveObjects.push(button);
        return button;
    });

    const fGeo = new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.11, 32, 1, 1);
    fGeo.translate(0, 0, -0.06);
    const frameOutlineGeometry = new THREE.EdgesGeometry(fGeo, 24);
    bendGeometry(fGeo, curveRadius);
    bendGeometry(frameOutlineGeometry, curveRadius);
    const frame = new THREE.Mesh(fGeo, new THREE.MeshPhysicalMaterial({
        color: 0x13d9ee, transparent: true, opacity: 0.16, transmission: 0.58,
        roughness: 0.09, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08,
        emissive: 0x00c9e2, emissiveIntensity: 0.26, depthWrite: false
    }));
    frame.position.copy(heatmapTVMesh.position); frame.rotation.copy(heatmapTVMesh.rotation); scene.add(frame);
    const frameOutline = new THREE.LineSegments(frameOutlineGeometry, new THREE.LineBasicMaterial({
        color: 0x69efff, transparent: true, opacity: 0.72,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    frameOutline.position.copy(frame.position);
    frameOutline.rotation.copy(frame.rotation);
    frameOutline.renderOrder = 7;
    scene.add(frameOutline);

    updateHeatmapTV('MÀN HÌNH TƯƠNG TÁC', 'Hãy chọn một khu vực trên bản đồ để xem các hoạt động tại địa phương.', '#009688');
    updateHeatmapTVNavigation();
}

function drawCanvasImageCover(ctx, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.videoWidth || image.width;
    const imageHeight = image.naturalHeight || image.videoHeight || image.height;
    if (!imageWidth || !imageHeight) return;
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (imageWidth - sourceWidth) / 2;
    const sourceY = (imageHeight - sourceHeight) / 2;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawCanvasImageContain(ctx, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.videoWidth || image.width;
    const imageHeight = image.naturalHeight || image.videoHeight || image.height;
    if (!imageWidth || !imageHeight) return;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const targetWidth = imageWidth * scale;
    const targetHeight = imageHeight * scale;
    ctx.drawImage(image, x + (width - targetWidth) / 2, y + (height - targetHeight) / 2, targetWidth, targetHeight);
}

function updateHeatmapTV(title, content, colorHex, details = {}) {
    const ctx = heatmapTVCtx; const c = heatmapTVCanvas;
    if (!ctx || !c || !heatmapTVTex) return;
    framePolicy.invalidate(4);
    const renderToken = ++heatmapTVRenderToken;
    const hasImage = Boolean(details.image);
    const headerHeight = 122;
    const cardTop = 150;
    const cardBottom = 682;
    const cardHeight = cardBottom - cardTop;
    const imageCard = { x: 38, y: cardTop, w: 492, h: cardHeight };
    const imageDrawHeight = details.imagePosition ? 436 : 500;
    const textCard = hasImage
        ? { x: 554, y: cardTop, w: 688, h: cardHeight }
        : { x: 38, y: cardTop, w: 1204, h: cardHeight };
    const textX = textCard.x + 28;
    const textWidth = textCard.w - 56;

    // Cùng ngôn ngữ với popup Cụm 2: nền xanh pastel, thẻ trắng góc vuông,
    // tiêu đề xanh nhận diện và chữ xanh đậm dễ đọc.
    ctx.fillStyle = '#dfeffc'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0092df'; ctx.fillRect(0, 0, c.width, headerHeight);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 46px ' + UI_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title.toUpperCase(), 48, headerHeight / 2, 1184);

    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.fillRect(textCard.x, textCard.y, textCard.w, textCard.h);
    ctx.strokeStyle = '#7fc3ff'; ctx.lineWidth = 3;
    ctx.strokeRect(textCard.x, textCard.y, textCard.w, textCard.h);

    if (hasImage) {
        ctx.fillStyle = 'rgba(255,255,255,.96)';
        ctx.fillRect(imageCard.x, imageCard.y, imageCard.w, imageCard.h);
        ctx.strokeStyle = '#7fc3ff'; ctx.lineWidth = 3;
        ctx.strokeRect(imageCard.x, imageCard.y, imageCard.w, imageCard.h);
        ctx.fillStyle = '#eaf4fd'; ctx.fillRect(54, 166, 460, imageDrawHeight);
        ctx.fillStyle = '#47708f'; ctx.font = '700 24px ' + UI_FONT; ctx.textAlign = 'center';
        ctx.fillText('ĐANG TẢI ẢNH…', 284, 384);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (details.province || details.position) {
        const provinceLabel = details.province?.toUpperCase() || '';
        const positionLabel = details.position ? `HOẠT ĐỘNG ${details.position}` : '';
        ctx.font = '800 25px ' + UI_FONT;
        const provinceW = provinceLabel ? Math.min(ctx.measureText(provinceLabel).width + 32, textWidth * .64) : 0;
        if (provinceLabel) {
            ctx.fillStyle = '#a1d2fd'; ctx.fillRect(textX, 178, provinceW, 44);
            ctx.fillStyle = '#123d65'; ctx.fillText(provinceLabel, textX + 16, 187, provinceW - 32);
        }
        if (positionLabel) {
            ctx.font = '800 22px ' + UI_FONT;
            const positionW = Math.min(ctx.measureText(positionLabel).width + 28, textWidth - provinceW - 12);
            const positionX = textX + provinceW + (provinceW ? 12 : 0);
            ctx.fillStyle = '#0092df'; ctx.fillRect(positionX, 178, positionW, 44);
            ctx.fillStyle = '#ffffff'; ctx.fillText(positionLabel, positionX + 14, 189, positionW - 28);
        }
    }
    let metaY = details.province || details.position ? 242 : 184;
    if (details.place) {
        ctx.fillStyle = '#174f82'; ctx.font = '800 24px ' + UI_FONT;
        const placeLines = drawWrappedTop(ctx, `ĐỊA ĐIỂM: ${details.place}`, textX, metaY, textWidth, 33, 2);
        metaY += placeLines * 33 + 8;
    }
    if (details.date) {
        ctx.fillStyle = '#47708f'; ctx.font = '700 23px ' + UI_FONT;
        ctx.fillText(`THỜI GIAN: ${details.date}`, textX, metaY, textWidth);
        metaY += 41;
    }
    const contentY = Math.max(metaY + 8, details.province || details.position ? 286 : 218);
    ctx.fillStyle = '#17314a'; ctx.font = (hasImage ? '500 27px ' : '500 31px ') + UI_FONT;
    drawWrappedTop(ctx, content, textX, contentY, textWidth, hasImage ? 38 : 44, hasImage ? 7 : 8);

    if (hasImage && details.imagePosition) {
        ctx.fillStyle = '#d8efff'; ctx.fillRect(54, 612, 460, 54);
        ctx.font = '900 22px ' + UI_FONT; ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = details.hasPreviousImage ? '#0092df' : '#9bb8c9';
        ctx.fillRect(54, 612, 124, 54);
        ctx.fillStyle = '#ffffff'; ctx.fillText('‹', 116, 638);
        ctx.fillStyle = '#174f82'; ctx.fillText(`ẢNH ${details.imagePosition}`, 284, 638);
        ctx.fillStyle = details.hasNextImage ? '#0092df' : '#9bb8c9';
        ctx.fillRect(390, 612, 124, 54);
        ctx.fillStyle = '#ffffff'; ctx.fillText('›', 452, 638);
    }

    const publicSource = publicSourceLabel(details.source);
    const footerText = publicSource ? `NGUỒN: ${publicSource}` : '';
    if (footerText) {
        ctx.fillStyle = '#eaf4fd'; ctx.fillRect(textX, 610, textWidth, 48);
        ctx.fillStyle = '#47708f'; ctx.font = '700 19px ' + UI_FONT; ctx.textAlign = 'left';
        ctx.textBaseline = 'middle'; ctx.fillText(footerText, textX + 14, 634, textWidth - 28);
    }
    heatmapTVTex.needsUpdate = true;

    if (hasImage) {
        const image = new Image();
        image.onload = () => {
            if (renderToken !== heatmapTVRenderToken) return;
            ctx.fillStyle = '#eaf4fd'; ctx.fillRect(54, 166, 460, imageDrawHeight);
            drawCanvasImageContain(ctx, image, 54, 166, 460, imageDrawHeight);
            ctx.strokeStyle = '#7fc3ff'; ctx.lineWidth = 3; ctx.strokeRect(54, 166, 460, imageDrawHeight);
            heatmapTVTex.needsUpdate = true;
        };
        image.onerror = () => {
            if (renderToken !== heatmapTVRenderToken) return;
            ctx.fillStyle = '#eaf4fd'; ctx.fillRect(54, 166, 460, imageDrawHeight);
            ctx.fillStyle = '#b42332'; ctx.font = '700 24px ' + UI_FONT; ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; ctx.fillText('KHÔNG TẢI ĐƯỢC ẢNH', 284, 384);
            heatmapTVTex.needsUpdate = true;
        };
        image.src = details.image;
    }
}

function checkMapHotspotClick(uvX, uvY) {
    const hotspot = getProvinceAtUV(uvX, uvY);
    if (hotspot) {
        selectProvince(hotspot);
        return;
    }

    // Dùng các giá trị này để hiệu chỉnh chính xác hotspot theo vị trí bạn chỉ.
    console.info(`[Northern map] UV: ${uvX.toFixed(4)}, ${uvY.toFixed(4)}`);
    elZoneFlash.style.boxShadow = `inset 0 0 260px 60px #f4b223`;
    elZoneFlash.style.opacity = '0.5';
    setTimeout(() => { elZoneFlash.style.opacity = '0'; }, 300);
}

function getProvinceAtUV(uvX, uvY) {
    const hitX = (uvX - 0.5) * NORTHERN_MAP_SIZE.width;
    const hitY = (uvY - 0.5) * NORTHERN_MAP_SIZE.height;
    const radiusSquared = PROVINCE_HOTSPOT_RADIUS ** 2;

    return NORTHERN_MAP_HOTSPOTS.find((province) => {
        const center = getPolygonCenter(province.polygon);
        const dotX = (center.x + province.markerOffset[0] - 0.5) * NORTHERN_MAP_SIZE.width;
        const dotY = (center.y + province.markerOffset[1] - 0.5) * NORTHERN_MAP_SIZE.height;
        return (hitX - dotX) ** 2 + (hitY - dotY) ** 2 <= radiusSquared;
    }) || null;
}

let lastZoneId = null;
const baseFogColor = new THREE.Color(ARCHITECTURE_COLORS.ceiling);
const targetFogColor = new THREE.Color(ARCHITECTURE_COLORS.ceiling);
let zoneFlashTimer = null;

function updateZoneBanner(zone) {
    if (zone.id !== lastZoneId) {
        const isFirstLoad = lastZoneId === null; const oldZoneId = lastZoneId; lastZoneId = zone.id;
        if (started && elProvinceSelector) {
            elProvinceSelector.style.display = (SHOW_PROVINCE_SELECTOR && zone.id === 2) ? 'block' : 'none';
        }
        elZoneBanner.textContent = zone.id === 0 ? 'Sảnh trung tâm' : zone.name;
        const hex = '#' + zone.color.toString(16).padStart(6, '0');
        elZoneBanner.style.color = hex; elZoneBanner.style.borderColor = hex;
        targetFogColor.copy(baseFogColor).lerp(new THREE.Color(zone.color), zone.id === 0 ? 0 : 0.12);
        
        if (!isFirstLoad) {
            elZoneFlash.style.boxShadow = `inset 0 0 260px 60px ${hex}`; elZoneFlash.style.opacity = '0.5';
            clearTimeout(zoneFlashTimer); zoneFlashTimer = setTimeout(() => { elZoneFlash.style.opacity = '0'; }, 550);
        }
        
        // Phương án lai: quyết định restart-từ-đầu hay phát-tiếp tuỳ thời gian đã rời zone
        handleZoneMusicTransition(oldZoneId, zone.id);

        // Cách ly cứng âm thanh theo zone: chỉ mở đúng 1 bài của zone hiện tại,
        // mọi zone khác (kể cả khi đứng ở id 0 - Sảnh trung tâm) đều bị tắt.
        // Đồng thời áp dụng masterVolume/mute hiện tại của người dùng.
        recalcAudioTargets();

        // Điều khiển giao diện Loa phát nhạc
        if (zone.id === 0) {
            elNowPlaying.classList.remove('show');
            setTimeout(() => { if (lastZoneId === 0) elNowPlaying.style.display = 'none'; }, 500);
        } else {
            elNowPlaying.style.display = 'flex';
            void elNowPlaying.offsetWidth; // Bắt buộc trình duyệt render lại để chạy animation mượt
            elNowPlaying.classList.add('show');
            elTrackName.textContent = zone.track;
            elTrackName.style.color = hex;
        }
    }
    scene.fog.color.lerp(targetFogColor, 0.06);
}

function onWindowResize() {
    resizeRenderer(renderer, camera);
    framePolicy.invalidate(3);
}

function animate() {
    if (!webglContextAvailable) return;
    const time = performance.now();
    const door = topicDoorState.door;
    const doorAnimating = Boolean(topicDoorState.transition) || Boolean(
        door && Math.abs((door.openProgress || 0) - (door.targetOpenProgress || 0)) > .002
    );
    const audioFading = positionalAudios.some(entry => entry.sound.buffer
        && Math.abs(entry.sound.getVolume() - entry.targetVolume) > .002);
    const activeMotion = isDragging || moveForward || moveBackward || moveLeft || moveRight
        || velocity.lengthSq() > .0004 || doorAnimating || audioFading;
    if (!framePolicy.shouldRun(time, activeMotion)) return;
    const delta = Math.min(0.1, (time - prevTime) / 1000); prevTime = time;
    for (const fn of effectUpdaters) fn(time / 1000, delta);
    updateVietnamMapLift(delta);
    updateVietnamMapLayout(delta);
    updateHeatmapOverviewSlideshow(time);
    updateTopicDoorOpening(topicDoorState, delta);
    const doorTransitionActive = updateTopicDoorTransition(topicDoorState, camera, delta, elFade);

    if (started && !doorTransitionActive && !isInteractionModalOpen()) {
        const oldX = camera.position.x, oldZ = camera.position.z;
        velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta;
        const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const moveVec = new THREE.Vector3();
        if (moveForward) moveVec.add(forward); if (moveBackward) moveVec.sub(forward);
        if (moveRight) moveVec.add(right); if (moveLeft) moveVec.sub(right);
        if (moveVec.lengthSq() > 0) moveVec.normalize();
        velocity.x += moveVec.x * 42.0 * delta; velocity.z += moveVec.z * 42.0 * delta;
        
        const res = resolveMovement(oldX, oldZ, oldX + velocity.x * delta, oldZ + velocity.z * delta);
        camera.position.x = res.x;
        camera.position.z = res.z;
        camera.position.y = EYE_Y;
        tryStartTopicDoorTransition(topicDoorState, camera);
        
        const r = Math.hypot(camera.position.x, camera.position.z);
        let cz = { id: 0, color: GOLD, name: 'Sảnh trung tâm' };
        if (r > R_CORE + 0.1 || camera.position.z < -R_CORE) {
            const a = normalizeAngle(Math.atan2(camera.position.z, camera.position.x));
            if (camera.position.z < -R_CORE && Math.abs(camera.position.x) < 3.5) {
                cz = { id: 0, color: GOLD, name: 'Lối vào' };
            } else if (r < R_CORE + 4.4) {
                // Đứng sát trụ giữa: nhận diện khu Bí thư Đảng ủy độc lập với góc.
                cz = getZoneById(3);
            } else {
                // Kiểm tra góc `a` (đã chuẩn hóa về [0, 2π)) so với a0/a1 THÔ của từng zone
                // theo CẢ 2 cách biểu diễn: chính nó, và trừ thêm 2π (đưa về dải âm).
                // Cách này xử lý đúng cả zone quét qua điểm gốc 0°/360° (như Cụm 3: -90°→30°)
                // mà không cần đụng tới a0/a1 thô đang dùng để dựng hình học tường/sàn.
                cz = ZONES.filter(z => z.surface === 'outer').find(z => {
                    const inRange = (ang) => ang >= z.a0 && ang < z.a1;
                    return inRange(a) || inRange(a - Math.PI * 2);
                }) || cz;
            }
        }
        updateJourneyProgress(cz.id);
        updateZoneBanner(cz);

        // Fade âm lượng từng loa về đúng targetVolume (0 hoặc baseVolume) mỗi khung hình,
        // đây là bước thực thi "cách ly cứng": zone không đứng trong sẽ luôn tiến về volume 0.
        const AUDIO_FADE_SPEED = 3.5; // càng lớn chuyển càng nhanh (giây^-1)
        positionalAudios.forEach(entry => {
            if (!entry.sound.buffer) return;
            const cur = entry.sound.getVolume();
            if (Math.abs(cur - entry.targetVolume) > 0.002) {
                entry.sound.setVolume(cur + (entry.targetVolume - cur) * Math.min(1, delta * AUDIO_FADE_SPEED));
            }
        });
    }
    renderer.render(scene, camera);
}

window.onload = async function () {
    if (!WebGL.isWebGL2Available()) {
        const startBtn = document.getElementById('btn-start');
        startBtn.disabled = true;
        startBtn.textContent = 'Thiết bị không hỗ trợ WebGL 2';
        document.getElementById('blocker').appendChild(WebGL.getWebGL2ErrorMessage());
        return;
    }

    // Canvas texture ghi kiểu chữ ngay khi khởi tạo; chờ Roboto sẵn sàng
    // để tất cả bảng 3D dùng đúng font ngay trong lần render đầu tiên.
    if (USE_ZONE1_EDITORIAL_V2 && document.fonts?.ready) await document.fonts.ready;

    console.info(`[Chủ đề 5 · ver 2.5] Three.js r${THREE.REVISION}`);
    init();
    window.getTopic3SceneAudit = () => collectSceneAudit(
        scene, interactiveObjects, renderer, getTextureLoadAudit()
    );

    // Góc quan sát tĩnh phục vụ kiểm tra kiến trúc trần, không kích hoạt audio/video.
    const ceilingPreview = new URLSearchParams(window.location.search).get('ceilingPreview');
    if (ceilingPreview !== null) {
        document.getElementById('blocker').style.display = 'none';
        const zoneMatch = /^zone([1-3])$/.exec(ceilingPreview);
        if (zoneMatch) {
            const zone = ZONES.find(item => item.id === Number(zoneMatch[1]));
            const previewRadius = (R_CORE + R_OUTER) / 2;
            camera.position.set(Math.cos(zone.mid) * previewRadius, EYE_Y, Math.sin(zone.mid) * previewRadius);
            yaw = faceCoreRotY(zone.mid);
        } else {
            camera.position.set(0, EYE_Y, 0);
            yaw = 0;
        }
        pitch = 0.92;
        applyCameraRotation();
    }

    // Góc kiểm tra tĩnh cho bức tường trưng bày, dùng khi duyệt bố cục/nội dung.
    const contentPreview = new URLSearchParams(window.location.search).get('contentPreview');
    const contentMatch = /^(zone|overview|inner|love|boundary|panorama)([1-3])$/.exec(contentPreview || '');
    if (contentMatch) {
        document.getElementById('blocker').style.display = 'none';
        const zone = ZONES.find(item => item.id === Number(contentMatch[2]));
        const viewingInnerWall = contentMatch[1] === 'inner';
        const requestedPreviewFraction = Number.parseFloat(new URLSearchParams(window.location.search).get('previewFraction'));
        const previewFraction = Number.isFinite(requestedPreviewFraction) ? THREE.MathUtils.clamp(requestedPreviewFraction, 0, 1)
            : contentMatch[1] === 'love' ? 0.24
            : contentMatch[1] === 'boundary' ? 0.50
            : contentMatch[1] === 'panorama' ? 0.76
            : 0.50;
        const previewAngle = zone.a0 + (zone.a1 - zone.a0) * previewFraction;
        const previewRadius = viewingInnerWall ? R_CORE + 5.4
            : contentMatch[1] === 'overview' ? R_CORE + 2.8
            : R_CORE + 5.0;
        camera.position.set(Math.cos(previewAngle) * previewRadius, 4.15, Math.sin(previewAngle) * previewRadius);
        yaw = faceCoreRotY(previewAngle) + (viewingInnerWall ? Math.PI : 0);
        pitch = 0;
        applyCameraRotation();
    }

    // Góc kiểm tra khoảng nối mở giữa Cụm 1 và Cụm 3 sau khi bỏ hành lang.
    if (new URLSearchParams(window.location.search).has('gapPreview')) {
        document.getElementById('blocker').style.display = 'none';
        camera.position.set(0, EYE_Y, -13.2);
        yaw = 0;
        pitch = 0;
        applyCameraRotation();
    }

    // Góc kiểm tra bảng lời dẫn ngay từ hướng cửa vào.
    if (new URLSearchParams(window.location.search).has('introPreview')) {
        document.getElementById('blocker').style.display = 'none';
        camera.position.set(SPAWN_POS.x, EYE_Y, SPAWN_POS.z);
        yaw = Math.PI;
        pitch = 0;
        applyCameraRotation();
    }

    // Góc kiểm tra riêng hoạt ảnh hai cánh cửa, không kích hoạt chuyển trang.
    if (new URLSearchParams(window.location.search).has('doorPreview')) {
        document.getElementById('blocker').style.display = 'none';
        camera.position.set(0, EYE_Y, -13.2);
        yaw = 0;
        pitch = 0;
        applyCameraRotation();
        openTopicDoor(topicDoorState);
    }

    // Mở trực tiếp một thẻ lịch sử để duyệt kiểu chữ và giao diện đọc nội dung.
    if (new URLSearchParams(window.location.search).get('infoPreview') === 'history') {
        document.getElementById('blocker').style.display = 'none';
        const card = getZoneContent(2).panoramaHistoricalCards[0];
        showInfoPanel({
            type: 'artifact', title: card.title, year: card.period,
            zoneName: 'Cụm 2 · Dấu chân tình nguyện', content: card.content,
            source: card.source, color: 0xc6a25c
        });
    }

    // Mở trực tiếp modal Cụm 3 để đối chiếu với đúng hai mẫu đang dùng ở
    // Cụm 1/Cụm 2: ảnh đơn ở trên–nội dung ở dưới và bộ ảnh có điều hướng.
    const infoPreview = new URLSearchParams(window.location.search).get('infoPreview');
    if (infoPreview === 'zone3-single' || infoPreview === 'zone3-gallery') {
        document.getElementById('blocker').style.display = 'none';
        const collection = infoPreview === 'zone3-gallery'
            ? [...ZONE3_PEOPLE, ...ZONE3_ACTIVITIES, ...ZONE3_ACHIEVEMENTS]
            : ZONE3_ACTIVITIES;
        const item = infoPreview === 'zone3-gallery'
            ? collection.find(entry => entry.gallery?.length)
            : collection[0];
        const galleryItems = [item.image, ...(item.gallery || [])].map(imageUrl => ({
            imageUrl, title: item.title, content: item.content || '', year: item.year || item.period || ''
        }));
        showInfoPanel({
            type: 'artifact', displayMode: 'photo-caption', color: BLUE,
            title: item.title, year: item.year || item.period,
            zoneName: `${getZoneById(3).name} · Kiểm tra modal`,
            content: item.content || '', source: item.source,
            imageUrl: item.image, galleryItems
        });
    }

    renderer.setAnimationLoop(animate);
    framePolicy.invalidate(4);
    if (new URLSearchParams(window.location.search).has('audit')) {
        setTimeout(() => {
            const audit = window.getTopic3SceneAudit();
            window.__CD3_AUDIT__ = audit;
            console.info('[Chủ đề 3 · Scene audit]', audit);
        }, 3500);
    }
}
