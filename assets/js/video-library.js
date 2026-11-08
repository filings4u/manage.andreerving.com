/* Shared video library: Cloudflare Stream holds media once; lessons store cfstream:uid references. */
export function createVideoLibrary({db,root,notify,safe,isCurrent}){
 const CATEGORIES=["Shipper Prospecting","Freight Markets & Load Boards","Carrier Vetting","Quoting & Negotiation","Booking & Dispatch","Tracking & Operations","Documents & Billing","Compliance & Safety","Final Practicum","Other"];
 let records=[],term="",filter="",busy=false;
 const $=s=>root.querySelector(s);
 const all=s=>[...root.querySelectorAll(s)];
 const clean=v=>String(v||"").trim();
 const statusLabel=s=>s==="ready"?"Ready":s==="error"?"Processing error":"Processing";
 const categorySelect=(selected="",id="video-category")=>'<select id="'+id+'">'+[...new Set([...CATEGORIES,...records.map(x=>x.category),selected])].filter(Boolean).map(x=>'<option value="'+safe(x)+'" '+(x===selected?'selected':'')+'>'+safe(x)+'</option>').join('')+'</select>';
 async function load(){
   const r=await db.from("course_video_library").select("*").order("created_at",{ascending:false}).limit(1000);
   if(r.error)throw r.error;records=r.data||[];render();
 }
 function render(){
   if(!isCurrent())return;
   const shown=records.filter(v=>(!filter||v.category===filter)&&[v.title,v.category,v.description,v.original_filename].join(" ").toLowerCase().includes(term.toLowerCase()));
   const categories=[...new Set([...CATEGORIES,...records.map(v=>v.category)])].sort();
   root.innerHTML='<div class="vl-page"><div class="vl-heading"><div><span class="vl-eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</span><h1>Video Library</h1><p>Upload once, organize by category, then use the same video across multiple course lessons.</p></div><button type="button" class="btn" id="vl-add">+ Upload video</button></div>'+
    '<div class="vl-stats"><div><span>Library videos</span><strong>'+records.length+'</strong></div><div><span>Ready</span><strong>'+records.filter(v=>v.status==="ready").length+'</strong></div><div><span>Categories in use</span><strong>'+new Set(records.map(v=>v.category)).size+'</strong></div></div>'+
    '<section class="vl-panel"><div class="vl-toolbar"><label>Search videos<input type="search" id="vl-search" placeholder="Search by title, description or filename…" value="'+safe(term)+'"></label><label>Category<select id="vl-filter"><option value="">All categories</option>'+categories.map(c=>'<option value="'+safe(c)+'" '+(filter===c?'selected':'')+'>'+safe(c)+'</option>').join('')+'</select></label></div>'+
    '<div class="vl-grid">'+shown.map(v=>'<article class="vl-card" data-card="'+safe(v.id)+'"><div class="vl-card-top"><span class="vl-category">'+safe(v.category)+'</span><span class="vl-status '+safe(v.status)+'">'+statusLabel(v.status)+'</span></div><h3>'+safe(v.title)+'</h3><p>'+safe(v.description||"No description added.")+'</p><small>'+Math.round(Number(v.duration_seconds)||0)+' seconds · '+safe(v.original_filename||"Cloudflare Stream")+'</small><div class="vl-actions"><button type="button" data-edit="'+safe(v.id)+'">Edit details</button><button type="button" data-check="'+safe(v.id)+'">Check status</button><button type="button" data-delete="'+safe(v.id)+'" class="vl-danger">Remove</button></div></article>').join('')+'</div>'+(shown.length?'':'<p class="vl-empty">No videos match. Upload a video to build your library.</p>')+'</section><div id="vl-modal-root"></div></div>';
   $("#vl-add").onclick=()=>showUpload();
   $("#vl-search").oninput=e=>{term=e.target.value;filter=$("#vl-filter").value;render();const input=$("#vl-search");input.focus();input.setSelectionRange(term.length,term.length)};
   $("#vl-filter").onchange=e=>{filter=e.target.value;render()};
   all("[data-edit]").forEach(b=>b.onclick=()=>showEdit(records.find(v=>v.id===b.dataset.edit)));
   all("[data-check]").forEach(b=>b.onclick=()=>check(records.find(v=>v.id===b.dataset.check)));
   all("[data-delete]").forEach(b=>b.onclick=()=>remove(records.find(v=>v.id===b.dataset.delete)));
 }
 function modal(title,content){
   const host=$("#vl-modal-root");host.innerHTML='<div class="vl-backdrop"><section class="vl-modal" role="dialog" aria-modal="true" aria-label="'+safe(title)+'"><div class="vl-modal-title"><h2>'+safe(title)+'</h2><button type="button" class="vl-close" aria-label="Close dialog">×</button></div>'+content+'</section></div>';
   const close=()=>host.replaceChildren();host.querySelector(".vl-close").onclick=close;host.querySelector(".vl-backdrop").onclick=e=>{if(e.target.classList.contains("vl-backdrop")&&!busy)close()};
   return {host,close};
 }
 function showUpload(){
   const {host,close}=modal("Add video to library",'<form id="vl-upload-form"><label>Video title<input name="title" maxlength="200" required placeholder="E.g., How to Search a Load Board"></label><label>Category'+categorySelect(CATEGORIES[0],"vl-new-category")+'</label><label>Description<textarea name="description" rows="3" maxlength="4000" placeholder="What does this video teach?"></textarea></label><label>Choose an MP4, MOV or WebM file<input type="file" name="file" required accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"></label><p class="vl-help">Upload limit: 200 MB per video. For larger recordings, prepare smaller lesson clips first.</p><progress id="vl-progress" max="100" value="0" hidden></progress><p id="vl-upload-state" role="status" aria-live="polite"></p><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-cancel">Cancel</button><button type="submit" class="btn" id="vl-submit">Upload to library</button></div></form>');
   host.querySelector("#vl-cancel").onclick=close;
   host.querySelector("#vl-upload-form").onsubmit=async e=>{
     e.preventDefault();if(busy)return;
     const fd=new FormData(e.target),file=fd.get("file"),title=clean(fd.get("title")),category=host.querySelector("#vl-new-category").value;
     if(!(file instanceof File)||!file.size||file.size>200*1048576){notify("Select a video under 200 MB.",true);return}
     busy=true;host.querySelector("#vl-submit").disabled=true;host.querySelector("#vl-cancel").disabled=true;
     const report=t=>host.querySelector("#vl-upload-state").textContent=t;
     let uid="";
     try{
       report("Preparing secure upload…");
       const {data,error}=await db.functions.invoke("andre-stream",{body:{mode:"init-library-upload",fileSize:file.size,fileName:file.name}});
       if(error||!data?.success||!data.uid||!data.uploadURL)throw Error(data?.error||error?.message||"Could not initialize upload");
       uid=data.uid;
       const uploadURL=new URL(data.uploadURL);
       if(uploadURL.protocol!=="https:"||!["upload.videodelivery.net","upload.cloudflarestream.com"].includes(uploadURL.hostname))throw Error("Invalid upload destination");
       const progress=host.querySelector("#vl-progress");progress.hidden=false;
       await new Promise((resolve,reject)=>{
         const xhr=new XMLHttpRequest();xhr.open("POST",uploadURL.href);
         xhr.upload.onprogress=event=>{if(event.lengthComputable){progress.value=Math.round(event.loaded/event.total*100);report("Uploading: "+progress.value+"%")}};
         xhr.onerror=()=>reject(Error("Network error during upload"));
         xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error("Cloudflare upload failed ("+xhr.status+")"));
         const body=new FormData();body.append("file",file,file.name);xhr.send(body);
       });
       report("Upload complete. Recording library metadata…");
       const {error:saveError}=await db.from("course_video_library").insert({stream_uid:uid,title,category,description:clean(fd.get("description")),original_filename:file.name,status:"processing"});
       if(saveError)throw Error(saveError.message+" — Cloudflare video identifier: "+uid);
       notify("Video uploaded. Cloudflare is processing playback.");busy=false;close();await load();
     }catch(err){report(err.message||String(err));notify(err.message||String(err),true)}
     finally{busy=false;const b=host.querySelector("#vl-submit");if(b)b.disabled=false;const cancel=host.querySelector("#vl-cancel");if(cancel)cancel.disabled=false}
   };
 }
 function showEdit(video){
   if(!video)return;
   const {host,close}=modal("Edit video details",'<form id="vl-edit-form"><label>Title<input name="title" maxlength="200" required value="'+safe(video.title)+'"></label><label>Category'+categorySelect(video.category,"vl-edit-category")+'</label><label>Description<textarea name="description" maxlength="4000" rows="4">'+safe(video.description)+'</textarea></label><p class="vl-help">Editing metadata does not re-upload the video and does not change any existing lesson references.</p><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-cancel">Cancel</button><button type="submit" class="btn">Save changes</button></div></form>');
   host.querySelector("#vl-cancel").onclick=close;
   host.querySelector("form").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await db.from("course_video_library").update({title:clean(fd.get("title")),category:host.querySelector("#vl-edit-category").value,description:clean(fd.get("description")),updated_at:new Date().toISOString()}).eq("id",video.id);if(error)return notify(error.message,true);close();notify("Video details updated.");await load()};
 }
 async function check(video){
   if(!video)return;
   try{
     const {data,error}=await db.functions.invoke("andre-stream",{body:{mode:"status",uid:video.stream_uid}});
     if(error||!data?.success)throw Error(data?.error||error?.message||"Status unavailable");
     const status=data.ready?"ready":data.status==="error"?"error":"processing";
     const {error:saveError}=await db.from("course_video_library").update({status,duration_seconds:Number(data.duration)||0,updated_at:new Date().toISOString()}).eq("id",video.id);
     if(saveError)throw saveError;notify(data.ready?"Video is ready to attach.":"Video is still processing.");await load();
   }catch(e){notify(e.message||String(e),true)}
 }
 async function remove(video){
   if(!video)return;
   const {data:uses,error:useError}=await db.from("course_lessons").select("id").eq("video_url","cfstream:"+video.stream_uid).limit(1);
   if(useError)return notify(useError.message,true);
   if(uses?.length)return notify("This video is attached to a lesson. Detach it before removing its library record.",true);
   const yes=await new Promise(resolve=>{const m=modal("Remove video from library",'<p>Remove “'+safe(video.title)+'” from the library? This does not delete the Cloudflare recording.</p><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-no">Cancel</button><button type="button" class="btn" id="vl-yes">Remove library record</button></div>');m.host.querySelector("#vl-no").onclick=()=>{m.close();resolve(false)};m.host.querySelector("#vl-yes").onclick=()=>{m.close();resolve(true)}});if(!yes)return;
   const {error}=await db.from("course_video_library").delete().eq("id",video.id);if(error)return notify(error.message,true);notify("Library record removed. Cloudflare media remains available.");await load();
 }
 return {start:async()=>{try{await load()}catch(e){root.innerHTML='<p class="notice error">Unable to load video library: '+safe(e.message)+'</p>'}}};
}
