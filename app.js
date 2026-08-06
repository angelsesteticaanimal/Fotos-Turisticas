const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const cameraInput=$('cameraInput'),galleryInput=$('galleryInput');
const zoomEl=$('zoom'),zoomValueEl=$('zoomValue'),brightnessEl=$('brightness'),contrastEl=$('contrast'),shadowEl=$('shadow');
const frames=[
  {name:'Praia do Forte 3D Suave',subtitle:'Modelo elegante',bg:'praia-do-forte-3d-bg.png',front:'praia-do-forte-3d-suave-front.png',thumb:'praia-do-forte-3d-suave-thumb.png',box:[128,228,898,994]},
  {name:'Praia do Forte 3D Destaque',subtitle:'Modelo impactante',bg:'praia-do-forte-3d-bg.png',front:'praia-do-forte-3d-bold-front.png',thumb:'praia-do-forte-3d-bold-thumb.png',box:[140,221,873,983]}
];
let frameIndex=0,bgImg=new Image(),frontImg=new Image();
let photo=null,processed=null,processedBase=null,alphaBounds=null;
let scale=1,offsetX=0,offsetY=0,rotation=0,mode='normal';
let dragging=false,lastX=0,lastY=0,pickingColor=false,refineEnabled=false,painting=false,onlineProcessing=false;
let processKey='',manualEdited=false;
const work=document.createElement('canvas'),wctx=work.getContext('2d',{willReadFrequently:true});
const tempCanvas=document.createElement('canvas'),tctx=tempCanvas.getContext('2d',{willReadFrequently:true});

function invalidate(){processKey='';manualEdited=false;processedBase=null;alphaBounds=null;}
function cloneCanvas(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return c;}
function sourceToCanvas(src){if(src instanceof HTMLCanvasElement)return cloneCanvas(src);const c=document.createElement('canvas');c.width=src.width||src.naturalWidth;c.height=src.height||src.naturalHeight;c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c;}
function setProcessedCanvas(c){processed=c;processedBase=cloneCanvas(c);manualEdited=false;const d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;alphaBounds=findBounds(d,c.width,c.height);}
function loadFrame(i){frameIndex=i;bgImg=new Image();frontImg=new Image();let n=0;const done=()=>{if(++n===2){if(photo)fitPhoto();draw()}};bgImg.onload=done;frontImg.onload=done;bgImg.src=frames[i].bg;frontImg.src=frames[i].front;document.querySelectorAll('.frame-card').forEach((e,j)=>e.classList.toggle('active',i===j));}
function buildFrames(){const box=$('frames');frames.forEach((f,i)=>{const b=document.createElement('button');b.className='frame-card';b.innerHTML=`<img src="${f.thumb}" alt="${f.name}"><span>${f.name}</span><small>${f.subtitle}</small>`;b.onclick=()=>loadFrame(i);box.appendChild(b);});}
function targetSize(){const [x1,y1,x2,y2]=frames[frameIndex].box;return [x2-x1,y2-y1];}
function baseScale(contain=false){if(!photo)return 1;const [w,h]=targetSize();return (contain?Math.min:Math.max)(w/photo.width,h/photo.height);}
function updateZoomLabel(){if(zoomValueEl)zoomValueEl.textContent=Math.round((+zoomEl.value)*100)+'%';}
function setZoom(value){zoomEl.value=Math.max(+zoomEl.min,Math.min(+zoomEl.max,value));updateZoomLabel();draw();}
function fitPhoto(){if(!photo)return;scale=baseScale(mode==='normal'&&$('normalFit').value==='contain');zoomEl.value=1;updateZoomLabel();offsetX=offsetY=0;rotation=0;draw();}
function restorePhoto(){if(!photo)return;mode='normal';refineEnabled=false;setModeUI();invalidate();processed=photo;fitPhoto();}
function currentKey(){return [mode,$('chromaColor').value,$('tolerance').value,$('softness').value,$('spill').value,$('edgeOnly').checked,photo?.src,$('subjectMode').value,$('onlineQuality').value].join('|');}
function smoothstep(edge0,edge1,x){const t=Math.max(0,Math.min(1,(x-edge0)/(edge1-edge0||1)));return t*t*(3-2*t);} 
function hexRGB(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function colorDistance(r,g,b,c){const dr=r-c[0],dg=g-c[1],db=b-c[2];return Math.sqrt(dr*dr+dg*dg+db*db);}
function floodBackground(data,w,h,key,tol){const bg=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;const push=p=>{if(bg[p])return;const i=p*4;if(colorDistance(data[i],data[i+1],data[i+2],key)<=tol){bg[p]=1;q[tail++]=p;}};for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}for(let y=1;y<h-1;y++){push(y*w);push(y*w+w-1)}while(head<tail){const p=q[head++],x=p%w,y=(p/w)|0;if(x>0)push(p-1);if(x<w-1)push(p+1);if(y>0)push(p-w);if(y<h-1)push(p+w);}return bg;}
function blurAlpha(alpha,w,h,blurPx){if(blurPx<=0)return Uint8ClampedArray.from(alpha);tempCanvas.width=w;tempCanvas.height=h;const id=tctx.createImageData(w,h);for(let p=0,i=0;p<alpha.length;p++,i+=4){id.data[i]=id.data[i+1]=id.data[i+2]=255;id.data[i+3]=alpha[p];}tctx.putImageData(id,0,0);const c=document.createElement('canvas');c.width=w;c.height=h;const cg=c.getContext('2d');cg.filter=`blur(${blurPx}px)`;cg.drawImage(tempCanvas,0,0);const data=cg.getImageData(0,0,w,h).data;const out=new Uint8ClampedArray(w*h);for(let p=0,i=3;p<out.length;p++,i+=4)out[p]=data[i];return out;}
function erodeAlpha(alpha,w,h,passes=1){let arr=Uint8ClampedArray.from(alpha);for(let pass=0;pass<passes;pass++){const out=Uint8ClampedArray.from(arr);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(arr[p]===0){out[p]=0;continue;}let min=255;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const v=arr[(y+dy)*w+(x+dx)];if(v<min)min=v;}out[p]=min;}arr=out;}return arr;}
function findBounds(data,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(data[(y*w+x)*4+3]>18){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}return maxX<0?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};}
function computeImagePoint(canvasX,canvasY){if(!processed)return null;const [x1,y1,x2,y2]=frames[frameIndex].box;const cx=(x1+x2)/2+offsetX,cy=(y1+y2)/2+offsetY;const s=scale*+zoomEl.value;let dx=canvasX-cx,dy=canvasY-cy;const rad=-rotation*Math.PI/180;const rx=dx*Math.cos(rad)-dy*Math.sin(rad),ry=dx*Math.sin(rad)+dy*Math.cos(rad);const ix=rx/s+processed.width/2,iy=ry/s+processed.height/2;return {x:ix,y:iy};}
function recomputeBounds(){if(!(processed instanceof HTMLCanvasElement))return;const d=processed.getContext('2d',{willReadFrequently:true}).getImageData(0,0,processed.width,processed.height).data;alphaBounds=findBounds(d,processed.width,processed.height);}
function paintRefineAt(canvasX,canvasY){if(!refineEnabled||mode==='normal'||!(processed instanceof HTMLCanvasElement)||!processedBase)return;const pt=computeImagePoint(canvasX,canvasY);if(!pt)return;const rad=+$('brushSize').value/2;const strength=+$('brushStrength').value/100;const x0=Math.max(0,Math.floor(pt.x-rad-1)),y0=Math.max(0,Math.floor(pt.y-rad-1));const x1=Math.min(processed.width,Math.ceil(pt.x+rad+1)),y1=Math.min(processed.height,Math.ceil(pt.y+rad+1));if(x1<=x0||y1<=y0)return;const pw=x1-x0,ph=y1-y0;const pctx=processed.getContext('2d',{willReadFrequently:true});const patch=pctx.getImageData(x0,y0,pw,ph);const base=processedBase.getContext('2d',{willReadFrequently:true}).getImageData(x0,y0,pw,ph);const modeBrush=$('brushMode').value;for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){const gx=x0+x,gy=y0+y;const dist=Math.hypot(gx-pt.x,gy-pt.y);if(dist>rad)continue;const feather=1-Math.min(1,dist/rad);const i=(y*pw+x)*4;if(modeBrush==='erase'){patch.data[i+3]=Math.max(0,patch.data[i+3]-255*strength*feather);}else{for(let k=0;k<4;k++)patch.data[i+k]=patch.data[i+k]*(1-feather*strength)+base.data[i+k]*(feather*strength);} }
pctx.putImageData(patch,x0,y0);manualEdited=true;recomputeBounds();draw();}
function drawContactShadow(x1,y1,x2,y2){if(mode==='normal'||!$('contactShadow').checked||!alphaBounds||!processed)return;const s=scale*+zoomEl.value;const cx=(x1+x2)/2+offsetX + (alphaBounds.x+alphaBounds.w/2 - processed.width/2)*s;const cy=(y1+y2)/2+offsetY + (alphaBounds.y+alphaBounds.h - processed.height/2)*s;const w=Math.max(26,alphaBounds.w*s*0.22),h=Math.max(10,alphaBounds.w*s*0.06);ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();ctx.translate(cx,cy+6);ctx.scale(1,0.42);ctx.filter='blur(10px)';ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,0,w,h,0,0,Math.PI*2);ctx.fill();ctx.restore();ctx.filter='none';}
function drawAlternativeBackground(x1,y1,x2,y2){const m=$('backgroundMode').value;if(mode==='normal'||m==='scene')return;ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();if(m==='blur'&&photo){ctx.filter='blur(22px) brightness(82%)';const s=Math.max((x2-x1)/photo.width,(y2-y1)/photo.height)*1.18;ctx.drawImage(photo,(x1+x2)/2-photo.width*s/2,(y1+y2)/2-photo.height*s/2,photo.width*s,photo.height*s);ctx.filter='none';}else if(m==='white'){ctx.fillStyle='#fff';ctx.fillRect(x1,y1,x2-x1,y2-y1);}ctx.restore();}
function drawSandBlend(x1,y1,x2,y2){if(mode==='normal'||!$('sandBlend').checked)return;const h=y2-y1,w=x2-x1;const top=y2-h*0.20;ctx.save();ctx.beginPath();ctx.rect(x1,top,w,y2-top);ctx.clip();const g=ctx.createLinearGradient(0,top,0,y2);g.addColorStop(0,'rgba(237,214,176,0)');g.addColorStop(.45,'rgba(232,208,169,.16)');g.addColorStop(.78,'rgba(227,200,160,.50)');g.addColorStop(1,'rgba(222,194,154,.86)');ctx.fillStyle=g;ctx.fillRect(x1,top,w,y2-top);ctx.globalAlpha=.18;for(let i=0;i<180;i++){const rx=x1+((i*37)%w),ry=top+((i*91)%(y2-top));const r=(i%3)+1;ctx.fillStyle=i%5===0?'#f8e3bc':'#cfa870';ctx.beginPath();ctx.arc(rx,ry,r,0,Math.PI*2);ctx.fill();}ctx.restore();ctx.globalAlpha=1;}
function processNormal(){processed=photo;processedBase=null;alphaBounds=null;}
function decontaminate(imgData,alpha,w,h){const d=imgData.data;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x,a=alpha[p];if(a>0&&a<220){const i=p*4;let rr=0,gg=0,bb=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q=(y+dy)*w+(x+dx);if(alpha[q]>230){const j=q*4;rr+=d[j];gg+=d[j+1];bb+=d[j+2];n++;}}if(n){const t=(220-a)/220*0.45;d[i]=d[i]*(1-t)+(rr/n)*t;d[i+1]=d[i+1]*(1-t)+(gg/n)*t;d[i+2]=d[i+2]*(1-t)+(bb/n)*t;}}}}
function processChroma(){const key=currentKey();if(key===processKey&&processed&&processed!==photo)return;const max=1050,ratio=Math.min(1,max/Math.max(photo.width,photo.height));work.width=Math.max(1,Math.round(photo.width*ratio));work.height=Math.max(1,Math.round(photo.height*ratio));wctx.clearRect(0,0,work.width,work.height);wctx.drawImage(photo,0,0,work.width,work.height);const im=wctx.getImageData(0,0,work.width,work.height),d=im.data,w=work.width,h=work.height;const keyColor=hexRGB($('chromaColor').value),tol=+$('tolerance').value,soft=+$('softness').value;let bg=$('edgeOnly').checked?floodBackground(d,w,h,keyColor,tol+soft*.35):null;let alpha=new Uint8ClampedArray(w*h);for(let p=0,i=0;p<alpha.length;p++,i+=4){const dd=colorDistance(d[i],d[i+1],d[i+2],keyColor);let a=255;if(bg){if(bg[p])a=dd<=tol?0:255*smoothstep(tol,tol+soft+1,dd);}else{a=dd<=tol?0:dd<tol+soft?255*smoothstep(tol,tol+soft+1,dd):255;}alpha[p]=a;}alpha=erodeAlpha(alpha,w,h,1);alpha=blurAlpha(alpha,w,h,1.2+soft/45);const spill=+$('spill').value/100;for(let p=0,i=0;p<alpha.length;p++,i+=4){d[i+3]=Math.min(d[i+3],alpha[p]);if(d[i+3]>0&&spill>0){const dominance=d[i+1]-Math.max(d[i],d[i+2]);if(dominance>8){const sub=dominance*spill;d[i+1]=Math.max(0,d[i+1]-sub);d[i]=Math.min(255,d[i]+sub*.20);d[i+2]=Math.min(255,d[i+2]+sub*.20);}}}decontaminate(im,alpha,w,h);wctx.putImageData(im,0,0);setProcessedCanvas(cloneCanvas(work));processKey=key;}
function processPhoto(){if(!photo){processed=null;return;}if(mode==='normal'){processNormal();return;}if(manualEdited&&processed&&processKey===currentKey())return;if(mode==='chroma'){processChroma();}}
function autoFitPerson(){if(!photo)return;if(mode==='normal'){fitPhoto();return;}processPhoto();if(!alphaBounds)return;const [tw,th]=targetSize();const desiredH=th*.88;scale=desiredH/alphaBounds.h;const cx=alphaBounds.x+alphaBounds.w/2,cy=alphaBounds.y+alphaBounds.h/2;offsetX=(processed.width/2-cx)*scale;offsetY=(processed.height/2-cy)*scale+th*.04;zoomEl.value=1;updateZoomLabel();rotation=0;draw();}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(bgImg.complete&&bgImg.naturalWidth)ctx.drawImage(bgImg,0,0,canvas.width,canvas.height);const [x1,y1,x2,y2]=frames[frameIndex].box;drawAlternativeBackground(x1,y1,x2,y2);if(photo){processPhoto();drawContactShadow(x1,y1,x2,y2);ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();ctx.filter=`brightness(${brightnessEl.value}%) contrast(${contrastEl.value}%)`;ctx.shadowColor='rgba(0,0,0,.36)';ctx.shadowBlur=mode==='normal'?0:+shadowEl.value;ctx.shadowOffsetY=mode==='normal'?0:+shadowEl.value*.30;ctx.translate((x1+x2)/2+offsetX,(y1+y2)/2+offsetY);ctx.rotate(rotation*Math.PI/180);const s=scale*+zoomEl.value;const pw=processed?.width||photo.width,ph=processed?.height||photo.height;ctx.drawImage(processed||photo,-pw*s/2,-ph*s/2,pw*s,ph*s);ctx.restore();ctx.filter='none';drawSandBlend(x1,y1,x2,y2);}if(frontImg.complete&&frontImg.naturalWidth)ctx.drawImage(frontImg,0,0,canvas.width,canvas.height);canvas.classList.toggle('refine-active',refineEnabled);}
function loadFile(file){if(!file)return;const url=URL.createObjectURL(file),img=new Image();img.onload=async()=>{try{const maxSide=2048,ratio=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));if(ratio<1){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*ratio));c.height=Math.max(1,Math.round(img.naturalHeight*ratio));c.getContext('2d',{alpha:false}).drawImage(img,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.92));const reducedUrl=URL.createObjectURL(blob);const reduced=new Image();reduced.onload=()=>{photo=reduced;processed=reduced;processedBase=null;alphaBounds=null;invalidate();fitPhoto();URL.revokeObjectURL(reducedUrl);};reduced.src=reducedUrl;}else{photo=img;processed=img;processedBase=null;alphaBounds=null;invalidate();fitPhoto();}}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);alert('Não foi possível abrir esta foto.');};img.src=url;}
function setModeUI(){document.querySelectorAll('#modeButtons button').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));$('normalPanel').hidden=mode!=='normal';$('chromaPanel').hidden=mode!=='chroma';$('onlinePanel').hidden=mode!=='online';$('backgroundPanel').hidden=mode==='normal';$('shadowLabel').hidden=mode==='normal';$('autoFitBtn').hidden=mode==='normal';$('refineToggleBtn').hidden=mode==='normal';$('refinePanel').hidden=!refineEnabled||mode==='normal';$('hint').textContent=refineEnabled?'Refino manual ativo: toque e arraste para corrigir o recorte.':(mode==='online'&&processed===photo?'Escolha a foto e toque em Recortar pelo meu servidor.':'Arraste a '+(mode==='normal'?'foto':'pessoa')+' com um dedo. Use o zoom para ajustar.');}

cameraInput.onchange=e=>loadFile(e.target.files[0]);galleryInput.onchange=e=>loadFile(e.target.files[0]);
zoomEl.oninput=()=>{updateZoomLabel();draw();};[brightnessEl,contrastEl,shadowEl].forEach(e=>e.oninput=draw);
$('zoomOutBtn').onclick=()=>setZoom(+zoomEl.value-0.15);
$('zoomInBtn').onclick=()=>setZoom(+zoomEl.value+0.15);
$('zoomResetBtn').onclick=()=>setZoom(1);
$('fitBtn').onclick=fitPhoto;$('autoFitBtn').onclick=()=>autoFitPerson();$('restoreBtn').onclick=restorePhoto;$('rotateBtn').onclick=()=>{rotation=(rotation+90)%360;draw()};$('resetBtn').onclick=()=>{photo=null;processed=null;processedBase=null;alphaBounds=null;scale=1;offsetX=offsetY=rotation=0;zoomEl.value=1;updateZoomLabel();brightnessEl.value=contrastEl.value=100;invalidate();refineEnabled=false;setModeUI();draw();};
$('normalFit').onchange=fitPhoto;['tolerance','softness','spill'].forEach(id=>$(id).oninput=()=>{invalidate();if(mode!=='normal'&&photo){processed=photo;alphaBounds=null;draw();}});$('edgeOnly').onchange=()=>{invalidate();draw()};$('backgroundMode').onchange=draw;$('sandBlend').onchange=draw;$('contactShadow').onchange=draw;$('chromaColor').oninput=()=>{invalidate();draw()};
$('refineToggleBtn').onclick=()=>{if(mode==='normal'){alert('Ative Meu servidor IA ou Chroma key para refinar o recorte.');return;}refineEnabled=!refineEnabled;if(refineEnabled){processPhoto();}setModeUI();draw();};
$('modeButtons').onclick=e=>{const b=e.target.closest('button[data-mode]');if(!b)return;mode=b.dataset.mode;refineEnabled=false;invalidate();setModeUI();if(photo){if(mode==='normal')fitPhoto();else {processed=photo;processedBase=null;alphaBounds=null;draw();}}else draw();};
$('pickColorBtn').onclick=()=>{pickingColor=true;$('pickColorBtn').textContent='Toque na cor do fundo';};
let activePointers=new Map(),pinchStartDistance=0,pinchStartZoom=1;
function pointerCanvasPosition(e){const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};}
function pinchDistance(){const pts=[...activePointers.values()];return pts.length<2?0:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);}
canvas.addEventListener('pointerdown',e=>{const pos=pointerCanvasPosition(e);activePointers.set(e.pointerId,pos);if(activePointers.size===2){pinchStartDistance=pinchDistance();pinchStartZoom=+zoomEl.value;dragging=false;painting=false;}const cx=pos.x,cy=pos.y;if(pickingColor&&photo){const px=ctx.getImageData(Math.round(cx),Math.round(cy),1,1).data;$('chromaColor').value='#'+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,'0')).join('');pickingColor=false;$('pickColorBtn').textContent='🎯 Tocar na cor do fundo';invalidate();autoFitPerson();return;}if(refineEnabled&&mode!=='normal'){painting=true;paintRefineAt(cx,cy);}else{dragging=true;lastX=e.offsetX;lastY=e.offsetY;}canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!photo)return;const pos=pointerCanvasPosition(e);if(activePointers.has(e.pointerId))activePointers.set(e.pointerId,pos);if(activePointers.size===2&&pinchStartDistance>0){const ratio=pinchDistance()/pinchStartDistance;setZoom(pinchStartZoom*ratio);return;}const cx=pos.x,cy=pos.y;if(painting&&refineEnabled){paintRefineAt(cx,cy);return;}if(!dragging)return;const sx=canvas.width/canvas.clientWidth,sy=canvas.height/canvas.clientHeight;offsetX+=(e.offsetX-lastX)*sx;offsetY+=(e.offsetY-lastY)*sy;lastX=e.offsetX;lastY=e.offsetY;draw();});
function endPointer(e){activePointers.delete(e.pointerId);if(activePointers.size<2){pinchStartDistance=0;pinchStartZoom=+zoomEl.value;}dragging=false;painting=false;}canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);

async function photoToBlob(){
  if(!photo)throw new Error('Escolha ou fotografe uma imagem primeiro.');
  const maxSide=2200,ratio=Math.min(1,maxSide/Math.max(photo.width,photo.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(photo.width*ratio));c.height=Math.max(1,Math.round(photo.height*ratio));
  c.getContext('2d',{alpha:false}).drawImage(photo,0,0,c.width,c.height);
  return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar a foto.')),'image/jpeg',.94));
}
function normalizeUrl(url){url=(url||'').trim();if(!url)return '';return url.replace(/\/+$/,'');}
async function runOnlineRemoval(){
  if(onlineProcessing)return;
  const baseUrl=normalizeUrl($('serverUrl').value);
  const token=$('serverToken').value.trim();
  if(!baseUrl){$('onlineStatus').textContent='Informe o endereço do servidor.';return;}
  if(!token){$('onlineStatus').textContent='Cole a chave de acesso do servidor.';return;}
  if(!photo){$('onlineStatus').textContent='Fotografe ou escolha uma foto primeiro.';return;}
  localStorage.setItem('fotoTurismoServerUrl',baseUrl);
  localStorage.setItem('fotoTurismoServerToken',token);
  localStorage.setItem('fotoTurismoSubjectMode',$('subjectMode').value);
  localStorage.setItem('fotoTurismoServerQuality',$('onlineQuality').value);
  localStorage.setItem('fotoTurismoSaveFinal',$('saveFinalToServer').checked?'1':'0');
  onlineProcessing=true;$('onlineRemoveBtn').disabled=true;$('onlineStatus').textContent='Enviando a foto para o seu servidor de IA…';$('hint').textContent='Aguarde: o servidor está recortando a pessoa.';
  try{
    const blob=await photoToBlob();
    const form=new FormData();
    form.append('image',blob,'foto.jpg');
    form.append('subject_mode',$('subjectMode').value);
    form.append('quality',$('onlineQuality').value);
    const response=await fetch(baseUrl+'/remove-background',{method:'POST',headers:{'X-API-Key':token},body:form});
    if(!response.ok){let detail='';try{detail=await response.text();}catch{}throw new Error(`Erro ${response.status}${detail?': '+detail.slice(0,180):''}`);}
    const usedModel=response.headers.get('X-Model-Used')||'não informado'; const usedQuality=response.headers.get('X-Quality-Used')||'não informada';
    const resultBlob=await response.blob();
    if(!resultBlob.type.startsWith('image/'))throw new Error('O servidor não retornou uma imagem válida.');
    const url=URL.createObjectURL(resultBlob);const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('O PNG retornado pelo servidor não abriu.'));img.src=url;});
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d',{alpha:true}).drawImage(img,0,0);URL.revokeObjectURL(url);
    setProcessedCanvas(c);processKey=currentKey();mode='online';refineEnabled=false;setModeUI();autoFitPerson();$('onlineStatus').textContent=`Recorte concluído. Modelo usado: ${usedModel}. Qualidade: ${usedQuality}.`;$('hint').textContent='Recorte concluído. Ajuste a pessoa e salve a montagem.';
  }catch(err){console.error(err);$('onlineStatus').textContent='Não foi possível recortar: '+err.message;$('hint').textContent='Falha no recorte no servidor. Confira a URL, a chave e a internet.';}
  finally{onlineProcessing=false;$('onlineRemoveBtn').disabled=false;draw();}
}
async function uploadFinalToServer(blob){
  const baseUrl=normalizeUrl($('serverUrl').value); const token=$('serverToken').value.trim();
  if(!baseUrl || !token || !$('saveFinalToServer').checked)return;
  const form=new FormData();
  form.append('image',blob,'foto-final.jpg');
  form.append('frame_name',frames[frameIndex].name);
  form.append('source_mode',mode);
  form.append('notes','Montagem final do Foto Turismo');
  try{
    const res=await fetch(baseUrl+'/save-final',{method:'POST',headers:{'X-API-Key':token},body:form});
    if(res.ok){const data=await res.json().catch(()=>null); if(data?.message){$('onlineStatus').textContent=data.message;}}
  }catch(err){console.warn('Falha ao enviar a final ao servidor',err);}
}
async function makeBlob(){return new Promise(r=>canvas.toBlob(r,'image/jpeg',.96));}
$('saveBtn').onclick=async()=>{const blob=await makeBlob(); await uploadFinalToServer(blob); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`foto-turismo-v32-${String(Date.now()).slice(-6)}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('shareBtn').onclick=async()=>{const blob=await makeBlob(); await uploadFinalToServer(blob); const file=new File([blob],'foto-turismo-v32.jpg',{type:'image/jpeg'});if(navigator.canShare?.({files:[file]}))await navigator.share({title:'Foto Turismo',text:'Minha foto turística',files:[file]});else alert('Use o botão Salvar foto neste navegador.');};
let deferredPrompt;const installBtn=$('installBtn');window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});installBtn.onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true;};

$('onlineRemoveBtn').onclick=runOnlineRemoval;
$('serverUrl').value=localStorage.getItem('fotoTurismoServerUrl')||'';
$('serverToken').value=localStorage.getItem('fotoTurismoServerToken')||'';
$('subjectMode').value=localStorage.getItem('fotoTurismoSubjectMode')||'auto';
$('onlineQuality').value=localStorage.getItem('fotoTurismoServerQuality')||'premium';
$('saveFinalToServer').checked=(localStorage.getItem('fotoTurismoSaveFinal')||'1')==='1';
$('serverUrl').onchange=()=>$('serverUrl').value=normalizeUrl($('serverUrl').value);
$('serverToken').onchange=()=>localStorage.setItem('fotoTurismoServerToken',$('serverToken').value.trim());
$('saveFinalToServer').onchange=()=>localStorage.setItem('fotoTurismoSaveFinal',$('saveFinalToServer').checked?'1':'0');

if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js');
buildFrames();setModeUI();loadFrame(0);updateZoomLabel();draw();
