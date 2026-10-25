// Gallery kính hai bên sảnh vào Chủ đề 5.
// Mỗi bên hoàn toàn độc lập; không dựng placeholder khi chưa có ảnh thật.
// Khi bổ sung tư liệu, chỉ cần truyền { side, src, title } từ cd5_ver_2_2.html.

function ensureGalleryModal(){
  let wrap=document.getElementById('entrance-gallery-modal');
  if(wrap)return wrap;

  const style=document.createElement('style');
  style.textContent=`
    #entrance-gallery-modal{position:fixed;inset:0;z-index:2300;display:grid;place-items:center;padding:clamp(16px,3vw,42px);background:rgba(0,0,0,.82);opacity:0;pointer-events:none;transition:opacity .25s ease;backdrop-filter:blur(8px)}
    #entrance-gallery-modal.open{opacity:1;pointer-events:auto}
    .entrance-gallery-dialog{position:relative;display:grid;gap:12px;justify-items:center;max-width:min(94vw,1420px);max-height:92vh;padding:10px;border:1px solid rgba(212,175,55,.45);border-radius:4px;background:rgba(8,8,14,.92);box-shadow:0 24px 70px rgba(0,0,0,.55)}
    #entrance-gallery-image{display:block;max-width:100%;max-height:80vh;object-fit:contain;background:#fff}
    #entrance-gallery-caption{max-width:min(94vw,1120px);color:rgba(255,255,255,.86);font:700 .82rem/1.55 RobotoLocal,Arial,sans-serif;text-align:center}
    #entrance-gallery-close{position:absolute;top:-13px;right:-13px;width:36px;height:36px;border:1px solid rgba(212,175,55,.55);border-radius:50%;background:#15130e;color:#d4af37;cursor:pointer;font:600 24px/1 Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.42)}
    @media(max-width:700px){#entrance-gallery-close{top:8px;right:8px}#entrance-gallery-image{max-height:76vh}}
  `;
  document.head.appendChild(style);

  wrap=document.createElement('div');
  wrap.id='entrance-gallery-modal';
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML=`<div class="entrance-gallery-dialog" role="dialog" aria-modal="true" aria-label="Xem ảnh lớn"><button id="entrance-gallery-close" type="button" aria-label="Đóng ảnh lớn">&times;</button><img id="entrance-gallery-image" alt=""><div id="entrance-gallery-caption"></div></div>`;
  document.body.appendChild(wrap);

  const close=()=>{
    wrap.classList.remove('open');
    wrap.setAttribute('aria-hidden','true');
    const image=wrap.querySelector('#entrance-gallery-image');
    image.removeAttribute('src');
    image.alt='';
  };
  wrap.querySelector('#entrance-gallery-close').addEventListener('click',close);
  wrap.addEventListener('click',event=>{if(event.target===wrap)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&wrap.classList.contains('open'))close();});
  wrap.closeGallery=close;
  return wrap;
}

function openGallery(src,title){
  if(!src)return;
  const wrap=ensureGalleryModal();
  const image=wrap.querySelector('#entrance-gallery-image');
  image.src=encodeURI(src);
  image.alt=title||'Ảnh trưng bày';
  wrap.querySelector('#entrance-gallery-caption').textContent=title||'';
  wrap.classList.add('open');
  wrap.setAttribute('aria-hidden','false');
}

function addBox(THREE,parent,size,position,material){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function buildDisplay({THREE,scene,interactables,display,index}){
  if(!display?.src)return null;
  const isLeft=display.side==='left';
  const group=new THREE.Group();
  group.position.set(isLeft?-14.7:14.7,4.05,48.5);
  group.rotation.y=isLeft?Math.PI/2:-Math.PI/2;

  const maxWidth=13.2;
  const maxHeight=5.7;
  const frameMaterial=new THREE.MeshStandardMaterial({color:0x2a2722,roughness:.34,metalness:.72});
  const glassMaterial=new THREE.MeshPhysicalMaterial({color:0xeaf6fa,transparent:true,opacity:.13,roughness:.12,metalness:.08,clearcoat:1,clearcoatRoughness:.08,depthWrite:false,side:THREE.DoubleSide});
  const imageMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,side:THREE.DoubleSide});

  const imageMesh=new THREE.Mesh(new THREE.PlaneGeometry(maxWidth,maxHeight),imageMaterial);
  imageMesh.position.z=.035;
  imageMesh.renderOrder=5;
  group.add(imageMesh);

  const glass=new THREE.Mesh(new THREE.PlaneGeometry(maxWidth,maxHeight),glassMaterial);
  glass.position.z=.065;
  glass.renderOrder=6;
  group.add(glass);

  const edge=.09;
  addBox(THREE,group,[maxWidth+edge*2,edge,.11],[0,maxHeight/2+edge/2,.08],frameMaterial);
  addBox(THREE,group,[maxWidth+edge*2,edge,.11],[0,-maxHeight/2-edge/2,.08],frameMaterial);
  addBox(THREE,group,[edge,maxHeight,.11],[-maxWidth/2-edge/2,0,.08],frameMaterial);
  addBox(THREE,group,[edge,maxHeight,.11],[maxWidth/2+edge/2,0,.08],frameMaterial);
  [-maxWidth/4,0,maxWidth/4].forEach(x=>addBox(THREE,group,[.055,maxHeight,.09],[x,0,.075],frameMaterial));

  const hit=new THREE.Mesh(new THREE.PlaneGeometry(maxWidth,maxHeight),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
  hit.position.z=.1;
  hit.userData={isInteractive:true,type:'entrance-gallery',label:display.title||`Ảnh sảnh ${index+1}`,openGallery:()=>openGallery(display.src,display.title)};
  group.add(hit);
  interactables.push(hit);
  scene.add(group);

  new THREE.TextureLoader().load(encodeURI(display.src),texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;
    const source=texture.image||{};
    const aspect=(source.naturalWidth||source.width||1)/(source.naturalHeight||source.height||1);
    const frameAspect=maxWidth/maxHeight;
    const width=aspect>=frameAspect?maxWidth:maxHeight*aspect;
    const height=aspect>=frameAspect?maxWidth/aspect:maxHeight;
    imageMesh.geometry.dispose();
    imageMesh.geometry=new THREE.PlaneGeometry(width,height);
    imageMaterial.map=texture;
    imageMaterial.needsUpdate=true;
  },undefined,error=>console.error('Không tải được ảnh gallery sảnh:',display.src,error));
  return group;
}

export function createEntranceGlassGallery({THREE,scene,interactables,displays=[]}){
  return displays.map((display,index)=>buildDisplay({THREE,scene,interactables,display,index})).filter(Boolean);
}
