// Adapted from the Screenings4U LMS browser calling workflow.
// Mounted only inside Andre Erving's authenticated student portal.
import {CallClient,LocalVideoStream,VideoStreamRenderer} from "https://cdn.jsdelivr.net/npm/@azure/communication-calling@1.46.1/+esm";
import {AzureCommunicationTokenCredential} from "https://cdn.jsdelivr.net/npm/@azure/communication-common@2.5.0/+esm";

export function createEmbeddedMeeting({root,api,sessionId,escapeHTML,onExit}){
 let destroyed=false, callClient=null,deviceManager=null,callAgent=null,call=null,localVideo=null,localRenderer=null,localView=null,cameraOn=false,micMuted=true,started=false;
 const remoteRenderers=new Map(),subscriptions=new Set();
 const $=id=>root.querySelector('#'+id);
 const message=(text,error=false)=>{const node=$('ae-room-message');if(!node)return;node.textContent=text;node.hidden=!text;node.classList.toggle('error',error)};
 const display=()=>{const el=$('ae-room-camera');if(el)el.textContent=cameraOn?'Turn camera off':'Turn camera on';const mic=$('ae-room-mic');if(mic)mic.textContent=micMuted?'Unmute microphone':'Mute microphone'};
 function subscribeRemote(participant){
   if(destroyed)return;
   const onStreams=e=>{for(const s of e.added||[])void showRemote(participant,s);for(const s of e.removed||[])removeRemote(participant,s)};
   participant.on?.('videoStreamsUpdated',onStreams);
   subscriptions.add(()=>participant.off?.('videoStreamsUpdated',onStreams));
   for(const stream of participant.videoStreams||[])void showRemote(participant,stream);
 }
 const streamKey=(p,s)=>String(p.identifier?.communicationUserId||p.identifier?.microsoftTeamsUserId||p.displayName||'guest')+':'+s.id;
 async function showRemote(participant,stream){
   if(destroyed)return;
   const key=streamKey(participant,stream);
   if(remoteRenderers.has(key))return;
   const onAvailability=()=>{if(stream.isAvailable)void showRemote(participant,stream);else removeRemote(participant,stream)};
   if(!stream.isAvailable){stream.on?.('isAvailableChanged',onAvailability);subscriptions.add(()=>stream.off?.('isAvailableChanged',onAvailability));return}
   let renderer;
   try{
     renderer=new VideoStreamRenderer(stream);const view=await renderer.createView({scalingMode:'Crop'});
     if(destroyed){renderer.dispose();return}
     const tile=document.createElement('div');tile.className='ae-room-remote-tile';
     tile.appendChild(view.target);
     const name=document.createElement('span');name.className='ae-room-person';name.textContent=participant.displayName||'Participant';tile.appendChild(name);
     $('ae-room-gallery')?.appendChild(tile);
     $('ae-room-empty')?.setAttribute('hidden','');
     remoteRenderers.set(key,{renderer,tile});
     stream.on?.('isAvailableChanged',onAvailability);subscriptions.add(()=>stream.off?.('isAvailableChanged',onAvailability));
   }catch(e){renderer?.dispose();console.warn('Remote stream unavailable',e)}
 }
 function removeRemote(p,s){
   const key=streamKey(p,s),v=remoteRenderers.get(key);
   if(!v)return;
   v.renderer.dispose();v.tile.remove();remoteRenderers.delete(key);
   if(!remoteRenderers.size){const e=$('ae-room-empty');if(e)e.hidden=false}
 }
 async function cameraPreview(){
   if(!localVideo)return;
   const stage=$('ae-room-preview');if(!stage)return;
   localRenderer?.dispose();localRenderer=new VideoStreamRenderer(localVideo);
   const view=await localRenderer.createView({scalingMode:'Crop'});localView=view;
   if(destroyed){localRenderer.dispose();return}
   stage.replaceChildren(view.target);
 }
 async function setCamera(enabled){
  try{
    if(!deviceManager){deviceManager=await callClient.getDeviceManager();await deviceManager.askDevicePermission({audio:true,video:true})}
    if(enabled){
      const cameras=await deviceManager.getCameras();
      if(!cameras.length)throw Error('No camera found on this device.');
      if(!localVideo)localVideo=new LocalVideoStream(cameras[0]);
      if(call&&call.state!=='Disconnected')await call.startVideo(localVideo);
      else await cameraPreview();
      cameraOn=true;
    }else{
      if(call&&localVideo&&call.localVideoStreams?.length)await call.stopVideo(localVideo);
      localRenderer?.dispose();localRenderer=null;localView=null;cameraOn=false;
      const stage=$('ae-room-preview');if(stage)stage.innerHTML='<div class="ae-room-camera-off">Camera is off</div>';
    }
    display();
  }catch(e){message(e.message||'Camera access failed.',true)}
 }
 async function setMic(){
   try{
     if(call){if(call.isMuted)await call.unmute();else await call.mute();micMuted=!!call.isMuted}
     else micMuted=!micMuted;
     display();
   }catch(e){message(e.message||'Microphone could not be updated.',true)}
 }
 function stateChanged(){
   if(!call||destroyed)return;
   const v=call.state;
   const title=$('ae-room-status');
   if(title)title.textContent=v==='InLobby'?'Waiting for instructor':v==='Connected'?'Connected to live training':v==='Disconnected'?'Meeting ended':'Connecting to meeting…';
   const lobby=$('ae-room-lobby'),meeting=$('ae-room-connected');
   if(lobby)lobby.hidden=v!=='InLobby';
   if(meeting)meeting.hidden=v!=='Connected';
   if(v==='Disconnected')message('You have left or the meeting has ended.');
 }
 async function enter(){
  const button=$('ae-room-enter');if(!button||started)return;
  button.disabled=true;button.textContent='Connecting to classroom…';
  try{
    const data=await api('embedded_token',{session_id:sessionId});
    if(destroyed)return;
    if(!data?.acs?.token||!data.meeting_link)throw Error('Embedded meeting credentials were not returned.');
    const credential=new AzureCommunicationTokenCredential(data.acs.token);
    callAgent=await callClient.createCallAgent(credential,{displayName:data.display_name||'Student'});
    if(destroyed)return;
    call=callAgent.join({meetingLink:data.meeting_link},{audioOptions:{muted:micMuted},videoOptions:cameraOn&&localVideo?{localVideoStreams:[localVideo]}:undefined});
    started=true;
    const onState=()=>stateChanged(),onParticipants=e=>{for(const p of e.added||[])subscribeRemote(p);for(const p of e.removed||[])for(const stream of p.videoStreams||[])removeRemote(p,stream)};
    call.on('stateChanged',onState);call.on('remoteParticipantsUpdated',onParticipants);
    subscriptions.add(()=>call?.off('stateChanged',onState));subscriptions.add(()=>call?.off('remoteParticipantsUpdated',onParticipants));
    for(const participant of call.remoteParticipants||[])subscribeRemote(participant);
    const pre=$('ae-room-prejoin'),live=$('ae-room-in-call');
    if(pre)pre.hidden=true;if(live)live.hidden=false;
    stateChanged();
  }catch(e){started=false;message(e.message||'Could not join the embedded classroom.',true);button.disabled=false;button.textContent='Enter Waiting Room'}
 }
 async function dispose(){
   if(destroyed)return;destroyed=true;
   try{await call?.hangUp()}catch{}
   for(const end of subscriptions)try{end()}catch{}
   for(const v of remoteRenderers.values()){try{v.renderer.dispose()}catch{}v.tile.remove()}
   remoteRenderers.clear();
   try{localRenderer?.dispose()}catch{}
   try{callAgent?.dispose()}catch{}
   call=null;
 }
 const exit=async()=>{await dispose();onExit()};
 root.innerHTML='<div class="ae-room-shell">'+
 '<div class="ae-room-heading"><div><span class="eyebrow">ANDRE ERVING / LIVE CLASSROOM</span><h1>Live Training Room</h1><p id="ae-room-status">Prepare your camera and microphone before entering.</p></div><button type="button" class="action secondary" id="ae-room-back">← Back to Live Sessions</button></div>'+
 '<p id="ae-room-message" class="ae-room-message" role="alert" hidden></p>'+
 '<section class="ae-room-prejoin" id="ae-room-prejoin"><div class="ae-room-preview" id="ae-room-preview"><div class="ae-room-camera-off">Camera is off</div></div><div class="ae-room-prejoin-details"><span class="eyebrow">DEVICE CHECK</span><h2>Ready to join?</h2><p>This meeting takes place inside your student portal. Choose your camera and microphone settings before entering the waiting room.</p><div class="ae-room-controls"><button class="action secondary" id="ae-room-camera" type="button">Turn camera on</button><button class="action secondary" id="ae-room-mic" type="button">Unmute microphone</button></div><button class="action" id="ae-room-enter" type="button">Enter Waiting Room</button><p class="ae-room-note">Your instructor may need to admit you into the meeting.</p></div></section>'+
 '<section class="ae-room-in-call" id="ae-room-in-call" hidden><div class="ae-room-lobby" id="ae-room-lobby" hidden><h2>Waiting for your instructor</h2><p>You are connected to the waiting room. Your instructor will admit you when the class begins.</p></div><div id="ae-room-connected" hidden><div class="ae-room-gallery" id="ae-room-gallery"><p class="ae-room-empty" id="ae-room-empty">Connected. Video from participants will appear here.</p></div></div><div class="ae-room-call-controls"><button id="ae-room-mic-live" class="action secondary" type="button">Unmute microphone</button><button id="ae-room-camera-live" class="action secondary" type="button">Turn camera on</button><button id="ae-room-leave" class="action" type="button">Leave Meeting</button></div></section></div>';
 callClient=new CallClient();
 $('ae-room-back').onclick=exit;
 $('ae-room-camera').onclick=()=>void setCamera(!cameraOn);
 $('ae-room-mic').onclick=()=>void setMic();
 $('ae-room-enter').onclick=()=>void enter();
 $('ae-room-leave').onclick=exit;
 $('ae-room-mic-live').onclick=async()=>{await setMic();$('ae-room-mic-live').textContent=micMuted?'Unmute microphone':'Mute microphone'};
 $('ae-room-camera-live').onclick=async()=>{await setCamera(!cameraOn);$('ae-room-camera-live').textContent=cameraOn?'Turn camera off':'Turn camera on'};
 return {dispose};
}
