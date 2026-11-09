export function createLiveTrainingManagement({db,root,notify,isCurrent}){
 const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let sessions=[],courses=[],attendees=[],filter="",selected=null,loading=false;
 const api=async(action,values={})=>{
  const {data,error}=await db.functions.invoke("andre-live-training",{body:{action,...values}});
  if(error){let detail=null;try{detail=await error.context?.json()}catch{}throw Error(detail?.error||error.message)}
  if(data?.error)throw Error(data.error);return data;
 };
 const confirmAction=(title,description,confirmLabel="Confirm",danger=false)=>new Promise(resolve=>{
  const layer=document.createElement("div");layer.className="lt-backdrop";
  layer.innerHTML='<section class="lt-dialog" role="dialog" aria-modal="true" aria-labelledby="lt-confirm-title" aria-describedby="lt-confirm-description"><header><h2 id="lt-confirm-title">'+safe(title)+'</h2><button id="lt-confirm-x" type="button" aria-label="Close">×</button></header><p id="lt-confirm-description" style="padding:16px 24px;line-height:1.65">'+safe(description)+'</p><footer><button id="lt-confirm-no" type="button" class="btn secondary">Go Back</button><button id="lt-confirm-yes" type="button" class="'+(danger?'lt-danger':'lt-primary')+'">'+safe(confirmLabel)+'</button></footer></section>';
  const prior=document.activeElement;
  const done=answer=>{layer.remove();document.removeEventListener("keydown",keys);prior?.focus?.();resolve(answer)};
  const keys=e=>{if(e.key==="Escape"){e.preventDefault();done(false)}};
  layer.querySelector("#lt-confirm-no").onclick=()=>done(false);
  layer.querySelector("#lt-confirm-x").onclick=()=>done(false);
  layer.querySelector("#lt-confirm-yes").onclick=()=>done(true);
  layer.addEventListener("click",e=>{if(e.target===layer)done(false)});
  document.addEventListener("keydown",keys);
  document.body.appendChild(layer);
  layer.querySelector("#lt-confirm-no").focus();
 });
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
  const defaults={title:"Freight Broker Training — Live Session",description:"Live instructor-led Freight Broker Training session, questions and practical exercises.",timezone:"America/Chicago",capacity:30,host_name:"Andre Erving Training",meeting_url:"https://teams.microsoft.com/meet/2407922688544968?p=OZT6iByBC2oLTUI1A0"};
  s={...defaults,...s};
  const courseId=s.course_id||courses.find(c=>c.title==="Freight Broker Training")?.id||courses[0]?.id||"";
  const layer=document.createElement("div");layer.className="lt-backdrop";
  layer.innerHTML='<section class="lt-dialog" role="dialog" aria-modal="true" aria-label="'+(s.id?"Edit":"Create")+' live session"><header><h2>'+(s.id?"Edit":"Create")+' live session</h2><button type="button" id="lt-close" aria-label="Close">×</button></header><p class="lt-muted">Add your Teams meeting link, save the draft, then publish the session to enrolled students. No new Teams meeting is generated.</p><form id="lt-form"><label>Course<select name="course_id" '+(s.id?"disabled":"")+'>'+courses.map(c=>'<option value="'+safe(c.id)+'" '+(c.id===courseId?"selected":"")+'>'+safe(c.title)+'</option>').join("")+'</select></label><label>Session title<input name="title" required maxlength="160" value="'+safe(s.title)+'"></label><label>Description<textarea name="description" rows="3">'+safe(s.description)+'</textarea></label><div class="lt-form-grid"><label>Start date & time<input name="start_at" type="datetime-local" required value="'+safe(timeValue(s.start_at))+'"></label><label>End date & time<input name="end_at" type="datetime-local" required value="'+safe(timeValue(s.end_at))+'"></label><label>Timezone (display)<select name="timezone">'+["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"].map(t=>'<option value="'+t+'" '+(s.timezone===t?"selected":"")+'>'+t+'</option>').join("")+'</select></label><label>Seats<input name="capacity" type="number" min="1" max="1000" required value="'+safe(s.capacity)+'"></label></div><label>Host name<input name="host_name" maxlength="120" value="'+safe(s.host_name)+'"></label><label>Microsoft Teams meeting link<input name="meeting_url" type="url" required maxlength="2000" placeholder="https://teams.microsoft.com/meet/..." value="'+safe(s.meeting_url||defaults.meeting_url)+'"><small class="lt-muted">Use your manually created meeting link. Change this at any time to use a different meeting for this session.</small></label><div id="lt-form-error" class="lt-error" role="alert"></div><footer><button class="btn secondary" type="button" id="lt-cancel">Cancel</button><button class="btn" type="submit">Save '+(s.id?"changes":"draft")+'</button></footer></form></section>';
  document.body.append(layer);
  const close=()=>layer.remove();
  layer.querySelector("#lt-close").onclick=close;layer.querySelector("#lt-cancel").onclick=close;
  layer.onclick=e=>{if(e.target===layer)close()};
  const formNode=layer.querySelector("#lt-form");
  const startInput=formNode.elements.namedItem("start_at");
  const endInput=formNode.elements.namedItem("end_at");
  // Default to a 60-minute session. Keep an explicitly edited end time intact.
  if(!s.id&&!endInput.value){
   const initial=new Date(Date.now()+2*3600000);
   initial.setMinutes(0,0,0);
   startInput.value=toLocal(initial);
   endInput.value=toLocal(new Date(initial.getTime()+3600000));
  }
  let endEdited=!!s.id;
  endInput.addEventListener("input",()=>{endEdited=true});
  startInput.addEventListener("change",()=>{
   const next=new Date(startInput.value);
   if(!Number.isFinite(next.getTime()))return;
   const finish=new Date(endInput.value);
   if(!endEdited||!Number.isFinite(finish.getTime())||finish<=next){
    endInput.value=toLocal(new Date(next.getTime()+3600000));
    endEdited=false;
   }
  });
  layer.querySelector("#lt-form").onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,values=Object.fromEntries(new FormData(form));
   if(!s.id)values.course_id=courseId;
   const start=new Date(values.start_at),end=new Date(values.end_at);
   const validation=layer.querySelector("#lt-form-error");
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())){validation.textContent="Choose both a start date/time and an end date/time.";return}
   if(start<=new Date()){validation.textContent="The session must start in the future.";return}
   if(end<=start){validation.textContent="The end date/time must be after the start date/time.";return}
   if(end.getTime()-start.getTime()>8*3600000){validation.textContent="The selected session is longer than 8 hours. Choose an end time within 8 hours of the start, or create separate sessions for different days.";return}
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
   layer.innerHTML='<section class="lt-dialog" role="dialog" aria-modal="true" aria-label="Session attendees"><header><h2>Session attendees</h2><button id="lt-close" type="button" aria-label="Close">×</button></header><p class="lt-muted">'+safe(s.title)+' · '+items.length+' registrations</p>'+(s.status==="scheduled"?'<div style="padding:0 24px 14px"><button class="btn" id="lt-add-customer" type="button">+ Add Customer / Send Invitation</button></div>':"")+'<div class="lt-attendee-list">'+(items.length?items.map(a=>'<div class="lt-attendee"><div><strong>'+safe(a.name||a.email||a.user_id)+'</strong><small>'+safe(a.email||"")+'</small></div><select data-user="'+safe(a.user_id)+'"><option value="registered" '+(a.status==="registered"?"selected":"")+'>Registered</option><option value="attended" '+(a.status==="attended"?"selected":"")+'>Attended</option><option value="no_show" '+(a.status==="no_show"?"selected":"")+'>No-show</option><option value="cancelled" '+(a.status==="cancelled"?"selected":"")+'>Cancelled</option></select>'+(['registered','attended'].includes(a.status)?'<button class="lt-resend" type="button" data-resend="'+safe(a.user_id)+'">Send Confirmation</button>':'')+'</div>').join(""):'<p>No registrations yet.</p>')+'</div><footer><button class="btn secondary" id="lt-done" type="button">Close</button></footer></section>';
   document.body.append(layer);const close=()=>layer.remove();layer.querySelector("#lt-close").onclick=close;layer.querySelector("#lt-done").onclick=close;
   layer.querySelector("#lt-add-customer")?.addEventListener("click",()=>{
    const dialog=document.createElement("div");dialog.className="lt-backdrop";
    dialog.innerHTML='<section class="lt-dialog" role="dialog" aria-modal="true" aria-label="Add customer to meeting"><header><h2>Add Customer to Meeting</h2><button type="button" id="lt-add-close" aria-label="Close">×</button></header><div style="padding:20px 24px"><p class="lt-muted">Search existing customers. Only customers with access to this course can be invited.</p><label>Find customer<input type="search" id="lt-customer-search" placeholder="Search name or email" autocomplete="off"></label><div id="lt-customer-results" class="lt-attendee-list" style="max-height:300px;overflow:auto;margin-top:12px"></div><p id="lt-add-error" role="alert"></p></div><footer><button class="btn secondary" id="lt-add-done" type="button">Close</button></footer></section>';
    document.body.append(dialog);
    const close=()=>dialog.remove();
    dialog.querySelector("#lt-add-close").onclick=close;dialog.querySelector("#lt-add-done").onclick=close;
    const input=dialog.querySelector("#lt-customer-search"),results=dialog.querySelector("#lt-customer-results"),error=dialog.querySelector("#lt-add-error");
    let sequence=0,timer;
    input.oninput=()=>{
     clearTimeout(timer);const term=input.value.trim(),current=++sequence;
     if(term.length<2){results.textContent="Type at least 2 characters.";return}
     timer=setTimeout(async()=>{
      try{
       const data=await api("customer_search",{query:term});
       if(current!==sequence)return;
       results.innerHTML=(data.customers||[]).map(c=>'<div class="lt-attendee"><div><strong>'+safe(c.full_name||c.email)+'</strong><small>'+safe(c.email)+'</small></div><button type="button" data-add-user="'+safe(c.id)+'">Add & Send Invite</button></div>').join("")||'<p>No matching customers.</p>';
       results.querySelectorAll("[data-add-user]").forEach(button=>button.onclick=async()=>{
        button.disabled=true;error.textContent="";
        try{
         const added=await api("add_customer",{session_id:s.id,user_id:button.dataset.addUser});
         if(added.already_registered){notify(added.message);close();layer.remove();await manageAttendees(s);return}
         const sent=added.notifications?.student==="sent";
         notify(added.message,!sent);close();layer.remove();await load();await manageAttendees(s);
        }catch(e){error.textContent=e.message;button.disabled=false}
       });
      }catch(e){if(current===sequence)error.textContent=e.message}
     },250);
    };
    input.focus();
   });
   layer.querySelectorAll("[data-resend]").forEach(button=>button.onclick=async()=>{
    button.disabled=true;
    try{
     const response=await api("resend_confirmation",{session_id:s.id,user_id:button.dataset.resend});
     const statuses=response.notifications||{};
     notify(statuses.student==="sent"&&statuses.admin==="sent"?"Branded confirmation sent to the student and administrators.":"Confirmation attempted. Check Resend settings and recent delivery logs.",statuses.student!=="sent"||statuses.admin!=="sent");
    }catch(e){notify(e.message,true)}finally{button.disabled=false}
   });
   layer.querySelectorAll("[data-user]").forEach(select=>select.onchange=async()=>{
    try{await api("mark_attendance",{session_id:s.id,user_id:select.dataset.user,status:select.value});notify("Attendance updated.");await load()}catch(e){notify(e.message,true)}
   });
  }catch(e){notify(e.message,true)}
 }
 function render(){
  if(!isCurrent())return;
  const matching=sessions.filter(s=>!filter||s.course_id===filter);
  const next=sessions.filter(s=>s.status==="scheduled"&&new Date(s.start_at)>new Date()).length;
  root.innerHTML='<div class="lt-page"><header class="lt-top"><div><span class="lt-eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</span><h1>Live Training Sessions</h1><p>Manage training schedules, student registrations, branded email confirmations, and calendar invites.</p></div><div class="lt-header-actions"><button type="button" class="btn secondary" id="lt-test-email">Check Email Delivery</button><button type="button" class="btn" id="lt-new">+ New live session</button></div></header>'+
   '<div class="lt-stats"><div><small>All sessions</small><strong>'+sessions.length+'</strong></div><div><small>Upcoming</small><strong>'+next+'</strong></div><div><small>Drafts</small><strong>'+sessions.filter(s=>s.status==="draft").length+'</strong></div><div><small>Registrations</small><strong>'+attendees.filter(a=>a.status==="registered").length+'</strong></div></div>'+
   '<div class="lt-panel"><div class="lt-panel-head"><h2>Scheduled training</h2><label>Course<select id="lt-filter"><option value="">All courses</option>'+courses.map(c=>'<option value="'+safe(c.id)+'" '+(filter===c.id?"selected":"")+'>'+safe(c.title)+'</option>').join("")+'</select></label></div>'+
   '<div class="lt-grid">'+(matching.length?matching.map(s=>{
     const count=attendees.filter(a=>a.session_id===s.id&&a.status==="registered").length;
     return '<article class="lt-session"><div class="lt-row"><span class="lt-pill '+safe(s.status)+'">'+safe(s.status)+'</span><small>'+safe(courses.find(c=>c.id===s.course_id)?.title||"Course")+'</small></div><h3>'+safe(s.title)+'</h3><p>'+safe(s.description||"No description")+'</p><div class="lt-meta"><span>◷ '+safe(date(s.start_at))+' – '+safe(new Date(s.end_at).toLocaleTimeString(undefined,{timeStyle:"short"}))+'</span><span>Participants: '+count+' / '+s.capacity+'</span><span>Host: '+safe(s.host_name)+'</span></div>'+
     '<div class="lt-actions"><button data-edit="'+safe(s.id)+'">Edit Session / Meeting Link</button>'+(s.status==="draft"?'<button class="lt-primary" data-schedule="'+safe(s.id)+'">Publish Session</button>':'')+''+(s.status==="scheduled"?'<button data-calendar="'+safe(s.id)+'">'+"Add to Calendar"+'</button>':'')+'<button data-attendees="'+safe(s.id)+'">Attendees</button>'+(s.status==="scheduled"?'<button data-host="'+safe(s.id)+'">Start as Teams Host</button>':'')+(["draft","scheduled"].includes(s.status)?'<button class="lt-danger" data-cancel="'+safe(s.id)+'">Cancel session</button>':'')+'</div></article>'
   }).join(""):'<p class="lt-empty">No live sessions yet. Create a draft to start scheduling Freight Broker Training.</p>')+'</div></div></div>';
  root.querySelector("#lt-new").onclick=()=>editor();
  root.querySelector("#lt-test-email")?.addEventListener("click",async e=>{
   const button=e.currentTarget;button.disabled=true;
   try{const status=await api("delivery_status");notify(status.resend_configured?"Branded email provider is configured. Confirmations will be sent to active administrator addresses.":"RESEND_API_KEY is not configured in Andre Erving Supabase. Branded training emails cannot send.",!status.resend_configured)}
   catch(e){notify(e.message,true)}finally{button.disabled=false}
  });
  root.querySelector("#lt-filter").onchange=e=>{filter=e.target.value;render()};
  const on=(selector,fn)=>root.querySelectorAll(selector).forEach(b=>b.onclick=()=>fn(sessions.find(s=>s.id===b.dataset[selector.slice(6,-1)]),b));
  root.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editor(sessions.find(s=>s.id===b.dataset.edit)));
  root.querySelectorAll("[data-attendees]").forEach(b=>b.onclick=()=>manageAttendees(sessions.find(s=>s.id===b.dataset.attendees)));
  root.querySelectorAll("[data-schedule],[data-sync]").forEach(b=>b.onclick=async()=>{
   const id=b.dataset.schedule||b.dataset.sync;b.disabled=true;
   try{await api("schedule",{session_id:id});notify("Session published with its saved Microsoft Teams meeting link. No separate meeting was created.");await load()}catch(e){notify(e.message,true)}finally{b.disabled=false}
  });
  root.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=async()=>{if(!await confirmAction("Cancel live session?","Registered students will lose access to this meeting. This cannot be undone.","Cancel Session",true))return;try{await api("cancel",{session_id:b.dataset.cancel});notify("Live session cancelled.");await load()}catch(e){notify(e.message,true)}});
  root.querySelectorAll("[data-calendar]").forEach(button=>button.onclick=()=>{
   const s=sessions.find(x=>x.id===button.dataset.calendar);if(!s)return;
   const dt=x=>new Date(x).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
   const escI=x=>String(x||"").replace(/\\/g,"\\\\").replace(/[\r\n]+/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
   const body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Andre Erving//Live Training//EN","METHOD:PUBLISH","BEGIN:VEVENT","UID:"+s.id+"@andreerving.com","DTSTAMP:"+dt(new Date()),"DTSTART:"+dt(s.start_at),"DTEND:"+dt(s.end_at),"SUMMARY:"+escI(s.title),"DESCRIPTION:"+escI("Andre Erving training. Meeting: "+s.meeting_url),"URL:"+s.meeting_url,"LOCATION:Microsoft Teams","END:VEVENT","END:VCALENDAR"].join("\r\n");
   const blob=new Blob([body],{type:"text/calendar;charset=utf-8"});const url=URL.createObjectURL(blob);
   const link=document.createElement("a");link.href=url;link.download="Andre-Erving-Live-Training.ics";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   notify("Calendar invitation downloaded. Open the .ics file to add this session to Outlook or another calendar.");
  });
  root.querySelectorAll("[data-host]").forEach(button=>button.onclick=()=>{
   const s=sessions.find(x=>x.id===button.dataset.host);
   if(!s?.meeting_url)return notify("Save a Teams meeting link for this session.",true);
   const url=new URL(s.meeting_url);
   if(url.protocol!=="https:"||url.hostname!=="teams.microsoft.com")return notify("The saved Teams meeting link is invalid.",true);
   window.open(url.toString(),"_blank","noopener,noreferrer");
  });
 }
 return {start:load};
}