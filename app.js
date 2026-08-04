const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
const cameraInput=document.getElementById('cameraInput');
const galleryInput=document.getElementById('galleryInput');
const zoomEl=document.getElementById('zoom');
const brightnessEl=document.getElementById('brightness');
const contrastEl=document.getElementById('contrast');

const frames=[
 {name:'Praia do Forte',file:'assets/frames/praia-do-forte.png',thumb:'assets/frames/praia-do-forte-original.png',box:[196,202,905,962]},
 {name:'Ilha do Japonês',file:'assets/frames/ilha-do-japones.png',thumb:'assets/frames/ilha-do-japones-original.png',box:[210,205,909,974]},
 {name:'Pontal do Atalaia',file:'assets/frames/pontal-do-atalaia.png',thumb:'assets/frames/pontal-do-atalaia-original.png',box:[210,202,889,978]},
 {name:'Praia das Conchas',file:'assets/frames/praia-das-conchas.png',thumb:'assets/frames/praia-das-conchas-original.png',box:[190,198,905,954]},
 {name:'Canal do Itajuru',file:'assets/frames/canal-itajuru.png',thumb:'assets/frames/canal-itajuru-original.png',box:[190,198,905,968]},
 {name:'Forte São Mateus',file:'assets/frames/forte-sao-mateus.png',thumb:'assets/frames/forte-sao-mateus-original.png',box:[200,200,905,965]},
 {name:'Praia do Peró',file:'assets/frames/praia-do-pero.png',thumb:'assets/frames/praia-do-pero-original.png',box:[205,200,905,951]}
];
let frameIndex=0, frameImg=new Image(), photo=null;
let scale=1, offsetX=0, offsetY=0, rotation=0;
let dragging=false,lastX=0,lastY=0,pinchStart=0,pinchScale=1;

function loadFrame(i){frameIndex=i;frameImg=new Image();frameImg.onload=draw;frameImg.src=frames[i].file;document.querySelectorAll('.frame-card').forEach((e,j)=>e.classList.toggle('active',i===j));}
function buildFrames(){const box=document.getElementById('frames');frames.forEach((f,i)=>{const d=document.createElement('button');d.className='frame-card';d.innerHTML=`<img src="${f.thumb}" alt="${f.name}"><span>${f.name}</span>`;d.onclick=()=>loadFrame(i);box.appendChild(d);});}
function coverScale(){if(!photo)return 1;const [x1,y1,x2,y2]=frames[frameIndex].box;return Math.max((x2-x1)/photo.width,(y2-y1)/photo.height);}
function fitPhoto(){if(!photo)return;scale=coverScale();zoomEl.value=1;offsetX=0;offsetY=0;rotation=0;draw();}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(photo){const [x1,y1,x2,y2]=frames[frameIndex].box;ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();ctx.filter=`brightness(${brightnessEl.value}%) contrast(${contrastEl.value}%)`;ctx.translate((x1+x2)/2+offsetX,(y1+y2)/2+offsetY);ctx.rotate(rotation*Math.PI/180);const s=scale*Number(zoomEl.value);ctx.drawImage(photo,-photo.width*s/2,-photo.height*s/2,photo.width*s,photo.height*s);ctx.restore();ctx.filter='none';}if(frameImg.complete)ctx.drawImage(frameImg,0,0,canvas.width,canvas.height);}
function loadFile(file){if(!file)return;const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{photo=img;fitPhoto();URL.revokeObjectURL(url)};img.src=url;}
cameraInput.onchange=e=>loadFile(e.target.files[0]);galleryInput.onchange=e=>loadFile(e.target.files[0]);
zoomEl.oninput=brightnessEl.oninput=contrastEl.oninput=draw;
document.getElementById('fitBtn').onclick=fitPhoto;
document.getElementById('rotateBtn').onclick=()=>{rotation=(rotation+90)%360;draw()};
document.getElementById('resetBtn').onclick=()=>{photo=null;scale=1;offsetX=offsetY=rotation=0;zoomEl.value=1;brightnessEl.value=contrastEl.value=100;draw()};

canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.offsetX;lastY=e.offsetY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!dragging||!photo)return;const sx=canvas.width/canvas.clientWidth,sy=canvas.height/canvas.clientHeight;offsetX+=(e.offsetX-lastX)*sx;offsetY+=(e.offsetY-lastY)*sy;lastX=e.offsetX;lastY=e.offsetY;draw()});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomEl.value=Math.min(4,Math.max(.4,Number(zoomEl.value)+(e.deltaY<0?.05:-.05)));draw()},{passive:false});

async function makeBlob(){return await new Promise(r=>canvas.toBlob(r,'image/jpeg',.95));}
document.getElementById('saveBtn').onclick=async()=>{const blob=await makeBlob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);const n=String(Date.now()).slice(-6);a.download=`foto-turismo-${n}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
document.getElementById('shareBtn').onclick=async()=>{const blob=await makeBlob();const file=new File([blob],'foto-turismo.jpg',{type:'image/jpeg'});if(navigator.canShare?.({files:[file]})){await navigator.share({title:'Foto Turismo',text:'Minha foto turística',files:[file]});}else{alert('O compartilhamento direto não é suportado neste navegador. Use Salvar foto.')}};

let deferredPrompt;const installBtn=document.getElementById('installBtn');window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});installBtn.onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true};
if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js');
buildFrames();loadFrame(0);draw();
