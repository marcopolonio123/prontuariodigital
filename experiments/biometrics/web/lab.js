'use strict';
const $=id=>document.getElementById(id);
let token='',imageB64='',imageWidth=0,imageHeight=0,stream=null,subjects=[],working=false,cameraGeneration=0;
const message=text=>{$('message').textContent=text};
async function api(path,method='GET',body,extra={}){
  if(!token)throw Error('Conecte-se ao laboratório.');
  const response=await fetch('/api/v1'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const value=await response.json();
  if(!response.ok)throw Error(value.error||value.detail||'Não foi possível concluir o teste.');
  return value;
}
async function run(action){if(working)return;working=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);message('Processando…');try{await action()}catch(error){message(error.message)}finally{working=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
function stopCamera(){cameraGeneration++;if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;$('video').srcObject=null;$('camera').hidden=true}
function clearCapture(){imageB64='';imageWidth=imageHeight=0;$('original').removeAttribute('src');$('processed').removeAttribute('src');$('preview-section').hidden=true;$('processed-section').hidden=true;$('capture-consent').checked=false;$('file').value=''}
async function showImage(data){
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Imagem inválida.'));image.src=data});
  if(image.naturalWidth*image.naturalHeight>4000000||Math.min(image.naturalWidth,image.naturalHeight)<160)throw Error('Use imagem de até 4 megapixels e pelo menos 160 pixels por lado.');
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);
  const encoded=canvas.toDataURL('image/jpeg',.94);if(encoded.length>2670000)throw Error('A imagem ultrapassa 2 MB. Use menor resolução.');
  imageB64=encoded.split(',')[1];imageWidth=canvas.width;imageHeight=canvas.height;$('original').src=encoded;$('preview-section').hidden=false;$('processed-section').hidden=true;$('crop-x').value=$('crop-y').value=0;$('crop-w').value=imageWidth;$('crop-h').value=imageHeight;$('image-size').textContent=imageWidth+' × '+imageHeight+' pixels';
}
function payload(){
  if(!imageB64)throw Error('Capture ou escolha uma imagem.');if(!$('capture-consent').checked)throw Error('Confirme a participação voluntária desta captura.');
  const method=$('method').value;
  return {method,imageB64,consent:true,source:method==='face'?'camera':$('source').value,finger:method==='face'?null:$('finger').value,dpi:method==='finger'&&$('source').value==='scanner'?Number($('dpi').value)||null:null,widthMm:method==='finger'&&$('source').value==='camera_calibrated'?Number($('width-mm').value)||null:null,processing:method==='face'?'original':$('processing').value,polarity:method==='face'?'original':$('polarity').value};
}
async function refresh(){
  subjects=(await api('/subjects')).items;
  for(const id of ['subject','expected']){const previous=$(id).value;$(id).replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=id==='expected'?'Pessoa fora da base':'Escolha o voluntário';$(id).append(empty);for(const subject of subjects){const option=document.createElement('option');option.value=subject.id;option.textContent=subject.alias;$(id).append(option)}$(id).value=subjects.some(s=>s.id===previous)?previous:''}
  $('volunteers').replaceChildren();
  for(const subject of subjects){const row=document.createElement('div'),label=document.createElement('span'),remove=document.createElement('button');label.textContent=subject.alias+' · rosto: '+subject.face_samples+' · digital: '+subject.finger_samples+' · expira '+new Date(subject.expires_at*1000).toLocaleString();remove.textContent='Revogar e excluir';remove.className='danger';remove.type='button';remove.onclick=()=>{if(confirm('Excluir todas as amostras e ensaios associados a '+subject.alias+'?'))void run(async()=>{await api('/subjects/'+subject.id,'DELETE');await refresh();message('Participação revogada e amostras excluídas.')})};row.append(label,remove);$('volunteers').append(row)}
  $('metrics').textContent=JSON.stringify(await api('/metrics'),null,2);
}
$('connect').onclick=()=>void run(async()=>{token=$('token').value;$('token').value='';const status=await api('/status');$('consent-text').textContent=status.consentText;$('retention').textContent='Retenção máxima: '+status.retentionHours+' horas. Motores: '+status.fingerEngine+' e '+status.faceEngine+'. Limiares experimentais, não validados.';$('workspace').hidden=false;$('login').hidden=true;await refresh();message('Laboratório conectado. Nenhum dado da produção foi carregado.')});
$('disconnect').onclick=()=>{stopCamera();clearCapture();token='';subjects=[];$('volunteers').replaceChildren();$('result').textContent=$('metrics').textContent='';$('workspace').hidden=true;$('login').hidden=false;message('Sessão encerrada.')};
$('volunteer-form').onsubmit=event=>{event.preventDefault();void run(async()=>{const result=await api('/subjects','POST',{alias:$('alias').value,consent:$('volunteer-consent').checked,consentVersion:'mydoctor-lab-v1'});await refresh();$('subject').value=result.id;$('volunteer-consent').checked=false;message('Voluntário cadastrado. Capture amostras independentes.')})};
function updateMethod(){stopCamera();clearCapture();const finger=$('method').value==='finger';$('finger-fields').hidden=!finger;$('guide').classList.toggle('finger',finger);$('preview-processing').hidden=!finger;$('camera-guide').textContent=finger?'Enquadre a região da digital com a câmera traseira. Após capturar, recorte e informe a escala física medida.':'Enquadre apenas um rosto. Boa iluminação, sem filtro.'}
$('method').onchange=updateMethod;
$('source').onchange=()=>{$('width-field').hidden=$('source').value!=='camera_calibrated';$('dpi-field').hidden=$('source').value!=='scanner'};
$('open-camera').onclick=()=>void run(async()=>{stopCamera();const generation=cameraGeneration;if(!navigator.mediaDevices?.getUserMedia)throw Error('Câmera exige localhost ou HTTPS e permissão do navegador.');const opened=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:$('method').value==='finger'?'environment':'user'},width:{ideal:1600},height:{ideal:1200}}});if(generation!==cameraGeneration){opened.getTracks().forEach(track=>track.stop());return}stream=opened;$('video').srcObject=stream;$('camera').hidden=false;await $('video').play();message('Câmera aberta. Ajuste foco e iluminação antes de capturar.')});
$('close-camera').onclick=stopCamera;
$('capture').onclick=()=>void run(async()=>{const video=$('video');if(video.readyState<2)throw Error('Aguarde a câmera.');const ratio=Math.min(1,1600/video.videoWidth,1200/video.videoHeight);const canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);await showImage(canvas.toDataURL('image/jpeg',.94));stopCamera();message('Captura local pronta. Nada foi enviado ou comparado ainda.')});
$('file').onchange=()=>void run(async()=>{const file=$('file').files[0];if(!file)return;if(!['image/jpeg','image/png'].includes(file.type)||file.size>2000000)throw Error('Escolha JPEG ou PNG de até 2 MB.');const url=URL.createObjectURL(file);try{await showImage(url)}finally{URL.revokeObjectURL(url)}message('Imagem selecionada localmente. Nada foi enviado ainda.')});
$('crop').onclick=()=>void run(async()=>{if(!imageB64)throw Error('Selecione uma imagem.');const [x,y,w,h]=['crop-x','crop-y','crop-w','crop-h'].map(id=>Number($(id).value));if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<160||h<160||x+w>imageWidth||y+h>imageHeight)throw Error('Recorte fora dos limites ou menor que 160 pixels.');const image=$('original'),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);await showImage(canvas.toDataURL('image/jpeg',.94));message('Recorte aplicado. Para digital, atualize a largura física correspondente.')});
$('preview-processing').onclick=()=>void run(async()=>{const result=await api('/preview','POST',payload());$('processed').src='data:image/png;base64,'+result.imageB64;$('processed-section').hidden=false;message('Prévia preparada. Nenhuma amostra foi cadastrada ou comparada.')});
$('discard').onclick=()=>{clearCapture();message('Captura local descartada.')};
$('enroll').onclick=()=>void run(async()=>{const id=$('subject').value;if(!id)throw Error('Escolha o voluntário.');const result=await api('/subjects/'+id+'/samples','POST',payload());$('result').textContent=JSON.stringify(result,null,2);clearCapture();await refresh();message('Amostra cadastrada. Faça outra captura independente para completar a referência.')});
$('identify').onclick=()=>void run(async()=>{const groundTruthKnown=$('ground-truth').checked;const result=await api('/trials','POST',{...payload(),groundTruthKnown,expectedSubjectId:groundTruthKnown?$('expected').value||null:null});$('result').textContent=JSON.stringify(result,null,2);await refresh();message('Ensaio concluído. Resultado experimental; nenhuma identidade foi confirmada e nenhum familiar foi avisado.')});
$('refresh-metrics').onclick=()=>void run(async()=>{await refresh();message('Métricas atualizadas.')});
$('clear').onclick=()=>{if(confirm('Excluir todos os voluntários, amostras e ensaios deste laboratório?'))void run(async()=>{await api('/lab','DELETE',undefined,{'X-Confirm-Clear':'DELETE-LAB'});clearCapture();await refresh();message('Dados do laboratório excluídos.')})};
window.addEventListener('pagehide',()=>{stopCamera();clearCapture();token=''});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera()});updateMethod();
