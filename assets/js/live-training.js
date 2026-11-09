export function createLiveTrainingManagement({db,root,notify,isCurrent}){
 const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let sessions=[],courses=[],attendees=[],filter="",selected=null,loading=false;
 const api=async(action,values={})=>{
  const {data,error}=await db.functions.invoke("andre-live-training",{body:{action,...values}});
  if(error){let detail=null;try{detail=await error.context?.json()}catch{}throw Error(detail?.error||error.message)}
  if(data?.error)throw Error(data.error);return data;
 };
 const date=x=>new Date(x).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
 const toLocal=x=>{const d=new Date(x);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 const timeValue=s=>s?toLocal(s):"";
 async function load(){
  if(loading)return;loading=true;
  try{const x=await api("staff_list");sessions=x.sessions||[];courses=x.courses||[];attendees=x.attendees||[];render()}catch(e){notify(e.message,true);root.innerHTML='<div class="panel">Unable to load live training sessions. '+safe(e.message)+'</div>'}
  finally{loading=false}
 }
 function editor(s=null){
  selected=s;
  const defaults={title:"Freight Broker Training — Live Session",description:"Live instructor-led Freight Broker Training session, questions and practical exercises.",timezone:"America/Chicago",capacity:30,host_name:"Andre Erving Training"};
  s={...defaults,...s};
  const courseId=s.course_id||courses.find(c=>c.title==="Freight Broker Training")?.id||courses[0]?.id||"";
  const layer=document.createElement("div");layer.className="lt-backdrop";
  layer.innerHTML='<section class="lt-dialog" role="dialog" aria-modal="true" aria-label="'+(s.id?"Edit":"Create")+' live session"><header><h2>'+(s.id?"Edit":"Create")+' live session</h2><button type="button" id="lt-close" aria-label="Close">×</button></header><p class="lt-muted">Create a draft first. Use Schedule & Create Teams afterward to release the session to enrolled students.</p><form id="lt-form"><label>Course<select name="course_id" '+(s.id?"disabled":"")+'>'+courses.map(c=>'<option value="'+safe(c.id)+'" '+(c.id===courseId?"selected":"")+'>'+safe(c.title)+'</option>').join("")+'</select></label><label>Session title<input name="title" required maxlength="160" value="'+safe(s.title)+'"></label><label>Description<textarea name="description" rows="3">'+safe(s.description)+'</textarea></label><div class="lt-form-grid"><label>Start date & time<input name="start_at" type="datetime-local" required value="'+safe(timeValue(s.start_at))+'"></label><label>End date & time<input name="end_at" type="datetime-local" required value="'+safe(timeValue(s.end_at))+'"></label><label>Timezone (display)<select name="timezone">'+["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"].map(t=>'<option value="'+t+'" '+(s.timezone===t?"selected":"")+'>'+t+'</option>').join("")+'</select></label><label>Seats<input name="capacity" type="number" min="1" max="1000" required value="'+safe(s.capacity)+'"></label></div><label>Host name<input name="host_name" maxlength="120" value="'+safe(s.host_name)+'"></label><div id="lt-form-error" class="lt-error" role="alert"></div><footer><button class="btn secondary" type="button" id="lt-cancel">Cancel</button><button class="btn" type="submit">Save '+(s.id?"changes":"draft")+'</button></footer></form></section>';
  document.body.append(layer);
  const close=()=>layer.remove();
  layer.querySelector("#lt-close").onclick=close;layer.querySelector("#lt-cancel").onclick=close;
  layer.onclick=e=>{if(e.target===layer)close()};
  layer.querySelector("#lt-form").onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,values=Object.fromEntries(new FormData(form));
   if(!s.id)values.course_id=courseId;
   const start=new Date(values.start_at),end=new Date(values.end_at);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start){layer.querySelector("#lt-form-error").textContent="Enter valid start and end times";return}
   values.start_at=start.toISOString();values.end_at=end.toISOString();values.capacity=Number(values.capacity);
   const submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try{await api(s.id?"update":"create",s.id?{session_id:s.id,...values}:values);close();notify(s.id?"Session updated.":"Draft session saved.");await load()}
   catch(e){layer.querySelector("#lt-form-error").textContent=e.message}finally{submit.disabled=false}
  };
 }
 async function manageAttendees(s){
  try{
   const {attendees:items}=await api("attendees",{session_id:s.id});
   const layer=document.createElement("div");layer.className="lt-backdrop";
   layer.innerHTML='<section class="lt-dialog" role="dialog" aria-modal="true" aria-label="Session attendees"><header><h2>Session attendees</h2><button id="lt-close" type="button" aria-label="Close">×</button></header><p class="lt-muted">'+safe(s.title)+' · '+items.length+' registrations</p><div class="lt-attendee-list">'+(items.length?items.map(a=>'<div class="lt-attendee"><div><strong>'+safe(a.name||a.email||a.user_id)+'</strong><small>'+safe(a.email||"")+'</small></div><select data-user="'+safe(a.user_id)+'"><option value="registered" '+(a.status==="registered"?"selected":"")+'>Registered</option><option value="attended" '+(a.status==="attended"?"selected":"")+'>Attended</option><option value="no_show" '+(a.status==="no_show"?"selected":"")+'>No-show</option><option value="cancelled" '+(a.status==="cancelled"?"selected":"")+'>Cancelled</option></select></div>').join(""):'<p>No registrations yet.</p>')+'</div><footer><button class="btn secondary" id="lt-done" type="button">Close</button></footer></section>';
   document.body.append(layer);const close=()=>layer.remove();layer.querySelector("#lt-close").onclick=close;layer.querySelector("#lt-done").onclick=close;
   layer.querySelectorAll("[data-user]").forEach(select=>select.onchange=async()=>{
    try{await api("mark_attendance",{session_id:s.id,user_id:select.dataset.user,status:select.value});notify("Attendance updated.");await load()}catch(e){notify(e.message,true)}
   });
  }catch(e){notify(e.message,true)}
 }
 function render(){
  if(!isCurrent())return;
  const matching=sessions.filter(s=>!filter||s.course_id===filter);
  const next=sessions.filter(s=>s.status==="scheduled"&&new Date(s.start_at)>new Date()).length;
  root.innerHTML='<div class="lt-page"><header class="lt-top"><div><span class="lt-eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</span><h1>Live Training Sessions</h1><p>Schedule instructor-led Microsoft Teams sessions, manage registrations, and track attendance across your courses.</p></div><button type="button" class="btn" id="lt-new">+ New live session</button></header>'+
   '<div class="lt-stats"><div><small>All sessions</small><strong>'+sessions.length+'</strong></div><div><small>Upcoming</small><strong>'+next+'</strong></div><div><small>Drafts</small><strong>'+sessions.filter(s=>s.status==="draft").length+'</strong></div><div><small>Registrations</small><strong>'+attendees.filter(a=>a.status==="registered").length+'</strong></div></div>'+
   '<div class="lt-panel"><div class="lt-panel-head"><h2>Scheduled training</h2><label>Course<select id="lt-filter"><option value="">All courses</option>'+courses.map(c=>'<option value="'+safe(c.id)+'" '+(filter===c.id?"selected":"")+'>'+safe(c.title)+'</option>').join("")+'</select></label></div>'+
   '<div class="lt-grid">'+(matching.length?matching.map(s=>{
     const count=attendees.filter(a=>a.session_id===s.id&&a.status==="registered").length;
     return '<article class="lt-session"><div class="lt-row"><span class="lt-pill '+safe(s.status)+'">'+safe(s.status)+'</span><small>'+safe(courses.find(c=>c.id===s.course_id)?.title||"Course")+'</small></div><h3>'+safe(s.title)+'</h3><p>'+safe(s.description||"No description")+'</p><div class="lt-meta"><span>◷ '+safe(date(s.start_at))+' – '+safe(new Date(s.end_at).toLocaleTimeString(undefined,{timeStyle:"short"}))+'</span><span>Participants: '+count+' / '+s.capacity+'</span><span>Host: '+safe(s.host_name)+'</span></div>'+(s.teams_error?'<p class="lt-error">Teams setup: '+safe(s.teams_error)+'</p>':'')+
     '<div class="lt-actions"><button data-edit="'+safe(s.id)+'">Edit</button>'+(s.status==="draft"?'<button class="lt-primary" data-schedule="'+safe(s.id)+'">Schedule & Create Teams</button>':'')+(s.status==="scheduled"?'<button data-sync="'+safe(s.id)+'">Sync Teams</button>':'')+'<button data-attendees="'+safe(s.id)+'">Attendees</button>'+(s.status==="scheduled"?'<button data-join="'+safe(s.id)+'">Join</button>':'')+(["draft","scheduled"].includes(s.status)?'<button class="lt-danger" data-cancel="'+safe(s.id)+'">Cancel session</button>':'')+'</div></article>'
   }).join(""):'<p class="lt-empty">No live sessions yet. Create a draft to start scheduling Freight Broker Training.</p>')+'</div></div></div>';
  root.querySelector("#lt-new").onclick=()=>editor();
  root.querySelector("#lt-filter").onchange=e=>{filter=e.target.value;render()};
  const on=(selector,fn)=>root.querySelectorAll(selector).forEach(b=>b.onclick=()=>fn(sessions.find(s=>s.id===b.dataset[selector.slice(6,-1)]),b));
  root.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editor(sessions.find(s=>s.id===b.dataset.edit)));
  root.querySelectorAll("[data-attendees]").forEach(b=>b.onclick=()=>manageAttendees(sessions.find(s=>s.id===b.dataset.attendees)));
  root.querySelectorAll("[data-schedule],[data-sync]").forEach(b=>b.onclick=async()=>{
   const id=b.dataset.schedule||b.dataset.sync;b.disabled=true;
   try{await api("schedule",{session_id:id});notify("Microsoft Teams meeting is ready. Students can now register.");await load()}catch(e){notify(e.message,true)}finally{b.disabled=false}
  });
  root.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=async()=>{if(!confirm("Cancel this live session? Registered students will lose access to its join link."))return;try{await api("cancel",{session_id:b.dataset.cancel});notify("Live session cancelled.");await load()}catch(e){notify(e.message,true)}});
  root.querySelectorAll("[data-join]").forEach(b=>b.onclick=async()=>{try{const a=await api("join",{session_id:b.dataset.join});window.open(a.url,"_blank","noopener,noreferrer")}catch(e){notify(e.message,true)}});
 }
 return {start:load};
}