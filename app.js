const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const cameraInput=$('cameraInput'),galleryInput=$('galleryInput');
const zoomEl=$('zoom'),brightnessEl=$('brightness'),contrastEl=$('contrast'),shadowEl=$('shadow');
const frames=[
 {name:'Praia do Forte 3D Suave',subtitle:'Modelo elegante',bg:'praia-do-forte-3d-bg.png',front:'praia-do-forte-3d-suave-front.png',thumb:'praia-do-forte-3d-suave-thumb.png',box:[128,228,898,994]},
 {name:'Praia do Forte 3D Destaque',subtitle:'Modelo impactante',bg:'praia-do-forte-3d-bg.png',front:'praia-do-forte-3d-bold-front.png',thumb:'praia-do-forte-3d-bold-thumb.png',box:[140,221,873,983]}
];
let frameIndex=0,bgImg=new Image(),frontImg=new Image(),photo=null,processed=null,alphaBounds=null;
let scale=1,offsetX=0,offsetY=0,rotation=0,mode='normal',dragging=false,lastX=0,lastY=0,pickingColor=false,processKey='';
let selfieSegmenter=null,aiProcessing=false,aiToken=0;
const work=document.createElement('canvas'),wctx=work.getContext('2d',{willReadFrequently:true});
const maskCanvas=document.createElement('canvas'),mctx=maskCanvas.getContext('2d',{willReadFrequently:true});

function invalidate(){processKey='';}
function loadFrame(i){frameIndex=i;bgImg=new Image();frontImg=new Image();let n=0;const done=()=>{if(++n===2){if(photo)fitPhoto();draw()}};bgImg.onload=done;frontImg.onload=done;bgImg.onerror=()=>{$('hint').textContent='Fundo não encontrado. Confirme se os arquivos PNG estão na página principal do GitHub.';};frontImg.onerror=()=>{$('hint').textContent='Moldura não encontrada. Confirme se os arquivos PNG estão na página principal do GitHub.';};const v='?v=241';bgImg.src=frames[i].bg+v;frontImg.src=frames[i].front+v;document.querySelectorAll('.frame-card').forEach((e,j)=>e.classList.toggle('active',i===j));}
function buildFrames(){const box=$('frames');frames.forEach((f,i)=>{const b=document.createElement('button');b.className='frame-card';b.innerHTML=`<img src="${f.thumb}" alt="${f.name}"><span>${f.name}</span><small>${f.subtitle}</small>`;b.onclick=()=>loadFrame(i);box.appendChild(b)});}
function targetSize(){const [x1,y1,x2,y2]=frames[frameIndex].box;return [x2-x1,y2-y1];}
function baseScale(contain=false){if(!photo)return 1;const [w,h]=targetSize();return (contain?Math.min:Math.max)(w/photo.width,h/photo.height);}
function fitPhoto(){if(!photo)return;scale=baseScale(mode==='normal'&&$('normalFit').value==='contain');zoomEl.value=1;offsetX=offsetY=0;rotation=0;draw();}
function restorePhoto(){if(!photo)return;mode='normal';setModeUI();invalidate();fitPhoto();}
function hexRGB(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function colorDistance(r,g,b,c){const dr=r-c[0],dg=g-c[1],db=b-c[2];return Math.sqrt(dr*dr+dg*dg+db*db);}
function floodBackground(data,w,h,key,tol){const bg=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;const push=p=>{if(bg[p])return;const i=p*4;if(colorDistance(data[i],data[i+1],data[i+2],key)<=tol){bg[p]=1;q[tail++]=p;}};for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}for(let y=1;y<h-1;y++){push(y*w);push(y*w+w-1)}while(head<tail){const p=q[head++],x=p%w,y=(p/w)|0;if(x>0)push(p-1);if(x<w-1)push(p+1);if(y>0)push(p-w);if(y<h-1)push(p+w);}return bg;}
function blurMask(mask,w,h,radius){if(radius<=0)return mask;maskCanvas.width=w;maskCanvas.height=h;const id=mctx.createImageData(w,h);for(let p=0,i=0;p<mask.length;p++,i+=4){id.data[i]=id.data[i+1]=id.data[i+2]=255;id.data[i+3]=mask[p];}mctx.putImageData(id,0,0);const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;const t=tmp.getContext('2d');t.filter=`blur(${Math.max(1,radius/5)}px)`;t.drawImage(maskCanvas,0,0);return t.getImageData(0,0,w,h).data.filter((_,i)=>i%4===3);}
function findBounds(data,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(data[(y*w+x)*4+3]>18){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}return maxX<0?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};}
function currentProcessKey(){return [mode,$('chromaColor').value,$('tolerance').value,$('softness').value,$('spill').value,$('edgeOnly').checked,photo?.src].join('|');}
async function ensureSelfieSegmenter(){
 if(selfieSegmenter)return selfieSegmenter;
 if(typeof SelfieSegmentation==='undefined')throw new Error('Modelo não carregado');
 selfieSegmenter=new SelfieSegmentation({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`});
 selfieSegmenter.setOptions({modelSelection:1,selfieMode:false});
 return selfieSegmenter;
}
async function runAISegmentation(force=false){
 if(!photo||mode!=='auto'||aiProcessing)return;
 const keyNow=currentProcessKey();
 if(!force&&keyNow===processKey&&processed&&processed!==photo)return;
 aiProcessing=true;const token=++aiToken;$('hint').textContent='Analisando a pessoa…';
 try{
  const seg=await ensureSelfieSegmenter();
  const max=512,ratio=Math.min(1,max/Math.max(photo.width,photo.height));
  const src=document.createElement('canvas');src.width=Math.max(1,Math.round(photo.width*ratio));src.height=Math.max(1,Math.round(photo.height*ratio));
  const sc=src.getContext('2d',{alpha:true});sc.drawImage(photo,0,0,src.width,src.height);
  const result=await new Promise((resolve,reject)=>{
   let settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('tempo esgotado'));}},15000);
   seg.onResults(r=>{if(!settled){settled=true;clearTimeout(timer);resolve(r);}});
   Promise.resolve(seg.send({image:src})).catch(err=>{if(!settled){settled=true;clearTimeout(timer);reject(err);}});
  });
  if(token!==aiToken||mode!=='auto')return;
  const out=document.createElement('canvas');out.width=src.width;out.height=src.height;const og=out.getContext('2d',{alpha:true,willReadFrequently:true});
  og.drawImage(src,0,0);og.globalCompositeOperation='destination-in';og.filter='blur(0.8px)';og.drawImage(result.segmentationMask,0,0,out.width,out.height);og.filter='none';og.globalCompositeOperation='source-over';
  const data=og.getImageData(0,0,out.width,out.height);
  for(let i=3;i<data.data.length;i+=4){const a=data.data[i];data.data[i]=a<8?0:(a>244?255:a);}
  og.putImageData(data,0,0);processed=out;alphaBounds=findBounds(data.data,out.width,out.height);processKey=keyNow;$('hint').textContent='Recorte concluído. Arraste a pessoa ou use “Ajustar pessoa”.';autoFitPerson(true);
 }catch(err){console.error(err);processed=photo;alphaBounds=null;$('hint').textContent='Não foi possível concluir o recorte. Tente novamente ou use Chroma key.';draw();}
 finally{aiProcessing=false;}
}
function processPhoto(){
 if(!photo||mode==='normal'){processed=photo;alphaBounds=null;return;}
 if(mode==='auto'){const keyNow=currentProcessKey();if(keyNow!==processKey||!processed||processed===photo)runAISegmentation();return;}
 const keyNow=currentProcessKey();if(keyNow===processKey&&processed)return;processKey=keyNow;
 const max=1050,ratio=Math.min(1,max/Math.max(photo.width,photo.height));work.width=Math.max(1,Math.round(photo.width*ratio));work.height=Math.max(1,Math.round(photo.height*ratio));
 wctx.clearRect(0,0,work.width,work.height);wctx.drawImage(photo,0,0,work.width,work.height);const im=wctx.getImageData(0,0,work.width,work.height),d=im.data,w=work.width,h=work.height;
 const key=hexRGB($('chromaColor').value),tol=+$('tolerance').value,soft=+$('softness').value;let bg=$('edgeOnly').checked?floodBackground(d,w,h,key,tol+soft*.35):null;let mask=new Uint8Array(w*h);
 for(let p=0,i=0;p<mask.length;p++,i+=4){const dd=colorDistance(d[i],d[i+1],d[i+2],key);let a=255;if(bg){if(bg[p])a=dd<=tol?0:Math.min(255,255*(dd-tol)/Math.max(1,soft));}else{a=dd<=tol?0:dd<tol+soft?255*(dd-tol)/Math.max(1,soft):255;}mask[p]=a;}
 if(soft>0){const blurred=blurMask(mask,w,h,soft);if(blurred.length===mask.length)mask=Uint8Array.from(blurred);}const spill=+$('spill').value/100;
 for(let p=0,i=0;p<mask.length;p++,i+=4){d[i+3]=Math.min(d[i+3],mask[p]);if(d[i+3]>0&&spill>0){const dominance=d[i+1]-Math.max(d[i],d[i+2]);if(dominance>8){const sub=dominance*spill;d[i+1]=Math.max(0,d[i+1]-sub);d[i]=Math.min(255,d[i]+sub*.2);d[i+2]=Math.min(255,d[i+2]+sub*.2);}}}
 wctx.putImageData(im,0,0);processed=work;alphaBounds=findBounds(d,w,h);
}
function autoFitPerson(fromAI=false){if(!photo||mode==='normal'){fitPhoto();return;}processPhoto();if(mode==='auto'&&!fromAI){runAISegmentation();return;}if(!alphaBounds)return;const [tw,th]=targetSize();const desiredH=th*.9;scale=desiredH/alphaBounds.h;const centerX=alphaBounds.x+alphaBounds.w/2,centerY=alphaBounds.y+alphaBounds.h/2;offsetX=(processed.width/2-centerX)*scale;offsetY=(processed.height/2-centerY)*scale+th*.03;zoomEl.value=1;rotation=0;draw();}
function drawAltBackground(x1,y1,x2,y2){const m=$('backgroundMode').value,w=x2-x1,h=y2-y1;if(mode==='normal'||m==='scene')return;ctx.save();ctx.beginPath();ctx.rect(x1,y1,w,h);ctx.clip();if(m==='blur'&&photo){ctx.filter='blur(22px) brightness(82%)';const s=Math.max(w/photo.width,h/photo.height)*1.18;ctx.drawImage(photo,(x1+x2)/2-photo.width*s/2,(y1+y2)/2-photo.height*s/2,photo.width*s,photo.height*s);ctx.filter='none';}else if(m==='white'){ctx.fillStyle='#fff';ctx.fillRect(x1,y1,w,h);}ctx.restore();}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(bgImg.complete)ctx.drawImage(bgImg,0,0,canvas.width,canvas.height);const [x1,y1,x2,y2]=frames[frameIndex].box;drawAltBackground(x1,y1,x2,y2);if(photo){processPhoto();ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();ctx.filter=`brightness(${brightnessEl.value}%) contrast(${contrastEl.value}%)`;ctx.shadowColor='rgba(0,0,0,.42)';ctx.shadowBlur=mode==='normal'?0:+shadowEl.value;ctx.shadowOffsetY=mode==='normal'?0:+shadowEl.value*.32;ctx.translate((x1+x2)/2+offsetX,(y1+y2)/2+offsetY);ctx.rotate(rotation*Math.PI/180);const s=scale*+zoomEl.value;const pw=processed.width||photo.width,ph=processed.height||photo.height;ctx.drawImage(processed,-pw*s/2,-ph*s/2,pw*s,ph*s);ctx.restore();ctx.filter='none';}if(frontImg.complete)ctx.drawImage(frontImg,0,0,canvas.width,canvas.height);}
function loadFile(file){if(!file)return;const url=URL.createObjectURL(file),img=new Image();img.onload=async()=>{try{const maxSide=2048,ratio=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));if(ratio<1){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*ratio));c.height=Math.max(1,Math.round(img.naturalHeight*ratio));c.getContext('2d',{alpha:false}).drawImage(img,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.92));const reducedUrl=URL.createObjectURL(blob);const reduced=new Image();reduced.onload=()=>{photo=reduced;processed=reduced;alphaBounds=null;aiToken++;invalidate();fitPhoto();URL.revokeObjectURL(reducedUrl);};reduced.src=reducedUrl;}else{photo=img;processed=img;alphaBounds=null;aiToken++;invalidate();fitPhoto();}}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);alert('Não foi possível abrir esta foto.');};img.src=url;}
cameraInput.onchange=e=>loadFile(e.target.files[0]);galleryInput.onchange=e=>loadFile(e.target.files[0]);
[zoomEl,brightnessEl,contrastEl,shadowEl].forEach(e=>e.oninput=draw);[$('tolerance'),$('softness'),$('spill')].forEach(e=>e.oninput=()=>{invalidate();draw()});$('edgeOnly').onchange=()=>{invalidate();draw()};$('backgroundMode').onchange=draw;$('chromaColor').oninput=()=>{invalidate();draw()};$('normalFit').onchange=fitPhoto;$('autoSensitivity').onchange=()=>{invalidate();processed=photo;alphaBounds=null;runAISegmentation(true)};$('autoSoftness').onchange=()=>{invalidate();processed=photo;alphaBounds=null;runAISegmentation(true)};
$('fitBtn').onclick=fitPhoto;$('autoFitBtn').onclick=autoFitPerson;$('restoreBtn').onclick=restorePhoto;$('rotateBtn').onclick=()=>{rotation=(rotation+90)%360;draw()};$('recalcAutoBtn').onclick=()=>{invalidate();processed=photo;alphaBounds=null;runAISegmentation(true)};$('resetBtn').onclick=()=>{photo=null;processed=null;alphaBounds=null;scale=1;offsetX=offsetY=rotation=0;zoomEl.value=1;brightnessEl.value=contrastEl.value=100;invalidate();draw()};
function setModeUI(){document.querySelectorAll('#modeButtons button').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));$('normalPanel').hidden=mode!=='normal';$('chromaPanel').hidden=mode!=='chroma';$('autoPanel').hidden=mode!=='auto';$('backgroundPanel').hidden=mode==='normal';$('shadowLabel').hidden=mode==='normal';$('autoFitBtn').hidden=mode==='normal';$('hint').textContent=mode==='normal'?'Arraste a foto com um dedo. Use o zoom para ajustar.':'Arraste a pessoa com um dedo. Use “Ajustar pessoa” para centralizar.';}
$('modeButtons').onclick=e=>{const b=e.target.closest('button[data-mode]');if(!b)return;mode=b.dataset.mode;invalidate();aiToken++;setModeUI();if(photo){if(mode==='normal')fitPhoto();else if(mode==='auto'){processed=photo;alphaBounds=null;draw();runAISegmentation(true);}else autoFitPerson();}else draw();};
$('pickColorBtn').onclick=()=>{pickingColor=true;$('pickColorBtn').textContent='Toque na cor do fundo na imagem';};
canvas.addEventListener('pointerdown',e=>{if(pickingColor&&photo){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;const px=ctx.getImageData(Math.round(x),Math.round(y),1,1).data;$('chromaColor').value='#'+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,'0')).join('');pickingColor=false;$('pickColorBtn').textContent='🎯 Tocar na cor do fundo';invalidate();autoFitPerson();return;}dragging=true;lastX=e.offsetX;lastY=e.offsetY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging||!photo)return;const sx=canvas.width/canvas.clientWidth,sy=canvas.height/canvas.clientHeight;offsetX+=(e.offsetX-lastX)*sx;offsetY+=(e.offsetY-lastY)*sy;lastX=e.offsetX;lastY=e.offsetY;draw();});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
async function makeBlob(){return new Promise(r=>canvas.toBlob(r,'image/jpeg',.96));}
$('saveBtn').onclick=async()=>{const blob=await makeBlob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`foto-turismo-v241-${String(Date.now()).slice(-6)}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('shareBtn').onclick=async()=>{const blob=await makeBlob(),file=new File([blob],'foto-turismo-v241.jpg',{type:'image/jpeg'});if(navigator.canShare?.({files:[file]}))await navigator.share({title:'Foto Turismo',text:'Minha foto turística',files:[file]});else alert('Use o botão Salvar foto neste navegador.');};
let deferredPrompt;const installBtn=$('installBtn');window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});installBtn.onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true;};
if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js');buildFrames();setModeUI();loadFrame(0);draw();
