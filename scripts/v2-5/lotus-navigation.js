import * as THREE from 'three';

export function addLotusSeparator(scene, radius, angle, bendGeometry) {
    // Cánh sen vector theo bố cục đối xứng của mẫu, không mang nền caro JPEG.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 270"><g fill="#d3b36d" stroke="#092678" stroke-width="5" stroke-linejoin="round">
    <path d="M180 236Q80 252 20 186Q84 175 180 236M180 236Q280 252 340 186Q276 175 180 236"/>
    <path d="M174 231Q54 222 30 125Q127 144 174 231M186 231Q306 222 330 125Q233 144 186 231"/>
    <path d="M173 227Q77 182 78 64Q157 109 173 227M187 227Q283 182 282 64Q203 109 187 227"/>
    <path d="M180 234Q94 157 180 16Q266 157 180 234"/>
    <path d="M176 236Q82 229 68 123Q145 147 176 236M184 236Q278 229 292 123Q215 147 184 236"/>
    <path d="M180 238Q127 190 180 100Q233 190 180 238"/>
    </g></svg>`;
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=810;
    const context=canvas.getContext('2d');context.scale(3,3);
    context.fillStyle='#d3b36d';context.strokeStyle='#092678';context.lineWidth=5;
    context.lineJoin='round';
    for(const match of svg.matchAll(/<path d="([^"]+)"/g)){
        const path=new Path2D(match[1]);context.fill(path);context.stroke(path);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(2.5, 1.88, 32, 1);
    bendGeometry(geometry, -radius);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        map: texture, transparent: true, alphaTest: .08, roughness: .65,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    mesh.position.set(Math.cos(angle)*radius, 3.45, Math.sin(angle)*radius);
    mesh.rotation.y = -angle + Math.PI/2;
    mesh.name = 'lotus-between-last-and-first-profile';
    scene.add(mesh);
}

export function addFloorDirection(scene) {
    const shape = new THREE.Shape();
    // Cung đồng tâm với phòng; góc tăng ở cửa đưa mũi tên về trái màn hình.
    // Dịch tâm cung 0,06 rad (~1,57 m) về bên trái theo góc nhìn từ cửa.
    const radius = 26.2;
    const center = -Math.PI / 2 + .06;
    const start = center - .125;
    const headBase = center + .095;
    const shaftHalfWidth = .15;
    const headHalfWidth = .58;
    const point = (r, angle) => [Math.cos(angle) * r, Math.sin(angle) * r];
    shape.moveTo(...point(radius - shaftHalfWidth, start));
    shape.absarc(0, 0, radius - shaftHalfWidth, start, headBase, false);
    shape.lineTo(...point(radius - headHalfWidth, headBase));
    const [baseX, baseZ] = point(radius, headBase);
    shape.lineTo(baseX - Math.sin(headBase) * .95, baseZ + Math.cos(headBase) * .95);
    shape.lineTo(...point(radius + headHalfWidth, headBase));
    shape.lineTo(...point(radius + shaftHalfWidth, headBase));
    shape.absarc(0, 0, radius + shaftHalfWidth, headBase, start, true);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 32);
    geometry.rotateX(Math.PI/2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xb58a43, side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1
    }));
    mesh.position.set(0, .045, 0);
    mesh.name = 'entrance-reversed-floor-arrow';
    scene.add(mesh);
}

export function createRoomMinimap({rCore, rOuter, boundaries}) {
    const panel = document.createElement('aside');
    panel.className = 'topic5-map-panel';
    panel.setAttribute('aria-label','Bản đồ định vị phòng Chủ đề 5');
    panel.innerHTML = `<div class="topic5-map"><svg viewBox="-38 -43 76 94" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sơ đồ phòng với vị trí và hướng nhìn của bạn">
    <defs>
    <path id="topic5-map-party-arc" d="M-12,21.94 A25,25 0 0 1 -12,-21.94"/>
    <path id="topic5-map-principal-arc" d="M12,-21.94 A25,25 0 0 1 12,21.94"/>
    </defs>
    <g transform="scale(-1,-1)"><circle r="${rOuter}" fill="#f6e8c9" stroke="#c49a45" stroke-width="1"/>
    <circle r="${rCore}" fill="#125995" stroke="#d6b86f" stroke-width=".8"/>
    ${boundaries.map(a=>`<path d="M${Math.cos(a)*(rOuter-1.2)},${Math.sin(a)*(rOuter-1.2)} L${Math.cos(a)*rOuter},${Math.sin(a)*rOuter}" stroke="#f4b223" stroke-width="1"/>`).join('')}
    <path d="M-2.5,-${rOuter}h5" stroke="#fff" stroke-width="1.4"/>
    <g id="topic5-map-player"><path d="M0,-3.4 L-1.8,0 L1.8,0Z" fill="#fff"/><circle r="1.5" fill="#b71f32" stroke="#fff" stroke-width=".5"/></g></g>
    <g font-family="Arial,sans-serif" font-size="3.4" font-weight="700" text-anchor="middle">
    <text fill="#fff4d6" dominant-baseline="middle"><tspan x="0" y="-5">Bí thư</tspan><tspan x="0" y="0">Đoàn trường</tspan><tspan x="0" y="5">qua các thời kỳ</tspan></text>
    <text fill="#174f82"><textPath href="#topic5-map-party-arc" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">Bí thư Đảng ủy Nhà trường qua các thời kỳ</textPath></text>
    <text fill="#174f82"><textPath href="#topic5-map-principal-arc" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">Hiệu trưởng Nhà trường qua các thời kỳ</textPath></text>
    <text fill="#f8fafc" font-size="4" y="42">Cửa vào</text></g>
    <path d="M-12,26 Q0,32 12,26 M8,25 L12,26 L10,30" transform="scale(-1,1)" fill="none" stroke="#f4b223" stroke-width=".8"/>
    </svg></div>`;
    document.body.appendChild(panel);
    const marker = panel.querySelector('#topic5-map-player');
    let last = '';
    return camera => {
        const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
        const rotation = Math.atan2(direction.x, -direction.z)*180/Math.PI;
        const transform = `translate(${camera.position.x.toFixed(2)} ${camera.position.z.toFixed(2)}) rotate(${rotation.toFixed(1)})`;
        if (last !== transform) { marker.setAttribute('transform',transform); last=transform; }
    };
}
