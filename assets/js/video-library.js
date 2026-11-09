/* Shared video library: Cloudflare Stream holds media once; lessons store cfstream:uid references. */
export function createVideoLibrary({db,root,notify,safe,isCurrent}){
 const CATEGORIES=["Software Walkthrough","Practical Demonstration","Case Study","Lecture","Compliance Training","Assessment","Reference","Other"];
 let records=[],courses=[],modules=[],lessons=[],term="",filter="",courseFilter="",moduleFilter="",page=0,busy=false;
 const $=s=>root.querySelector(s);
 const all=s=>[...root.querySelectorAll(s)];
 const clean=v=>String(v||"").trim();
 const statusLabel=s=>s==="ready"?"Ready":s==="error"?"Processing error":"Processing";
 const courseName=id=>courses.find(c=>c.id===id)?.title||"Shared media";
 const moduleName=id=>modules.find(m=>m.id===id)?.title||"No module";
 const lessonName=id=>lessons.find(l=>l.id===id)?.title||"No lesson";
 const catalogOptions=(items,selected,blank)=>'<option value="">'+safe(blank)+'</option>'+items.map(x=>'<option value="'+safe(x.id)+'" '+(x.id===selected?'selected':'')+'>'+safe(x.title)+'</option>').join('');
 const groupedCourseOptions=(selected,blank)=>{
   const groups=[...new Set(courses.map(c=>c.category||"Uncategorized"))].sort();
   return '<option value="">'+safe(blank)+'</option>'+groups.map(group=>
     '<optgroup label="'+safe(group)+'">'+courses.filter(c=>(c.category||"Uncategorized")===group).map(c=>
       '<option value="'+safe(c.id)+'" '+(selected===c.id?'selected':'')+'>'+safe(c.title)+'</option>'
     ).join('')+'</optgroup>'
   ).join('');
 };
 const taxonomyFields=(prefix,video={})=>'<div class="vl-taxonomy"><label>Course'+
   '<select id="'+prefix+'-course">'+groupedCourseOptions(video.course_id,"Shared / choose later")+'</select></label>'+
   '<label>Module / section<select id="'+prefix+'-module"></select></label>'+
   '<label>Lesson (optional)<select id="'+prefix+'-lesson"></select></label>'+
   '<label>Topic / keywords<input id="'+prefix+'-topic" maxlength="180" placeholder="E.g., Load board search" value="'+safe(video.topic||"")+'"></label></div>'+
   '<p class="vl-help">Organizing by lesson does not publish or attach a video to the course. Use the lesson editor to add it when ready.</p>';
 function bindTaxonomy(host,prefix,video={}){
   const course=host.querySelector("#"+prefix+"-course"),mod=host.querySelector("#"+prefix+"-module"),lesson=host.querySelector("#"+prefix+"-lesson");
   const fillLessons=selected=>{
     const choices=lessons.filter(l=>l.module_id===mod.value);
     lesson.innerHTML=catalogOptions(choices,selected,"No lesson / organize at module level");
     lesson.disabled=!mod.value||!choices.length;
   };
   const fillModules=(selected="",selectedLesson="")=>{
     const choices=modules.filter(m=>m.course_id===course.value);
     mod.innerHTML=catalogOptions(choices,selected,"No module / organize at course level");
     mod.disabled=!course.value||!choices.length;
     fillLessons(selectedLesson);
   };
   course.onchange=()=>fillModules();
   mod.onchange=()=>fillLessons();
   fillModules(video.module_id||"",video.lesson_id||"");
 }
 const taxonomyValue=(host,prefix)=>({
   course_id:host.querySelector("#"+prefix+"-course").value||null,
   module_id:host.querySelector("#"+prefix+"-module").value||null,
   lesson_id:host.querySelector("#"+prefix+"-lesson").value||null,
   topic:clean(host.querySelector("#"+prefix+"-topic").value)
 });
 const catalogTree=()=>{
   const categories=[...new Set(courses.map(c=>c.category||"Uncategorized"))].sort();
   return '<section class="vl-panel vl-course-explorer"><div class="vl-explorer-head"><h2>Browse course library</h2><button type="button" data-browse-all>All videos</button></div>'+
     categories.map(category=>'<details class="vl-course-group" open><summary>'+safe(category)+' <small>'+courses.filter(c=>(c.category||"Uncategorized")===category).length+' courses</small></summary><div class="vl-course-group-items">'+
       courses.filter(c=>(c.category||"Uncategorized")===category).map(course=>{
         const courseModules=modules.filter(m=>m.course_id===course.id);
         const count=records.filter(v=>v.course_id===course.id).length;
         return '<div class="vl-course-tree-entry"><button type="button" data-browse-course="'+safe(course.id)+'" class="'+(courseFilter===course.id?'active':'')+'">'+safe(course.title)+' <small>'+count+' videos</small></button>'+
           (courseModules.length?'<div class="vl-course-tree-modules">'+courseModules.map(mod=>
             '<button type="button" data-browse-module="'+safe(mod.id)+'" data-parent-course="'+safe(course.id)+'" class="'+(moduleFilter===mod.id?'active':'')+'">'+safe(mod.title)+' <small>'+records.filter(v=>v.module_id===mod.id).length+'</small></button>'
           ).join('')+'</div>':'<p class="vl-course-tree-empty">No modules yet — create them in the course editor</p>')+'</div>'
       }).join('')+'</div></details>').join('')+'</section>';
 };
 const categorySelect=(selected="",id="video-category")=>'<select id="'+id+'">'+[...new Set([...CATEGORIES,...records.map(x=>x.category),selected])].filter(Boolean).map(x=>'<option value="'+safe(x)+'" '+(x===selected?'selected':'')+'>'+safe(x)+'</option>').join('')+'</select>';
 async function load(){
   const fetchPages=async(table,cols,order,limit=20000)=>{
     const items=[],batch=500;
     for(let offset=0;offset<limit;offset+=batch){
       const r=await db.from(table).select(cols).order(order,{ascending:order!=="created_at"}).order("id").range(offset,offset+batch-1);
       if(r.error)throw r.error;items.push(...(r.data||[]));
       if((r.data||[]).length<batch)return items;
     }
     throw Error("Video Library reached the 20,000-record safety limit. Use archival pagination.");
   };
   [records,courses,modules,lessons]=await Promise.all([
     fetchPages("course_video_library","*","created_at"),
     fetchPages("courses","id,title,category,status","title"),
     fetchPages("course_modules","id,course_id,title,sort_order","sort_order"),
     fetchPages("course_lessons","id,course_id,module_id,title,sort_order","sort_order")
   ]);
   render();
 }
 function render(){
   if(!isCurrent())return;
   const shown=records.filter(v=>(!filter||v.category===filter)&&(!courseFilter||v.course_id===courseFilter)&&(!moduleFilter||v.module_id===moduleFilter)&&[v.title,v.category,v.topic,v.description,v.original_filename,courseName(v.course_id),moduleName(v.module_id),lessonName(v.lesson_id)].join(" ").toLowerCase().includes(term.toLowerCase()));
   const categories=[...new Set([...CATEGORIES,...records.map(v=>v.category)])].sort();
   const pageSize=24,totalPages=Math.max(1,Math.ceil(shown.length/pageSize));
   page=Math.min(page,totalPages-1);
   const pageItems=shown.slice(page*pageSize,(page+1)*pageSize);
   root.innerHTML='<div class="vl-page"><div class="vl-heading"><div><span class="vl-eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</span><h1>Video Library</h1><p>Upload once, organize by category, then use the same video across multiple course lessons.</p></div><button type="button" class="btn" id="vl-add">+ Upload video</button></div>'+
    '<div class="vl-stats"><div><span>Library videos</span><strong>'+records.length+'</strong></div><div><span>Ready</span><strong>'+records.filter(v=>v.status==="ready").length+'</strong></div><div><span>Courses</span><strong>'+courses.length+'</strong></div><div><span>Modules</span><strong>'+modules.length+'</strong></div></div>'+
    catalogTree()+'<section class="vl-panel"><div class="vl-toolbar vl-filters"><label>Search videos<input type="search" id="vl-search" placeholder="Search title, topic, module, filename…" value="'+safe(term)+'"></label>'+
    '<label>Course<select id="vl-course-filter">'+groupedCourseOptions(courseFilter,"All courses / shared")+'</select></label>'+
    '<label>Module<select id="vl-module-filter">'+catalogOptions(modules.filter(m=>m.course_id===courseFilter),moduleFilter,"All modules")+'</select></label>'+
    '<label>Media type<select id="vl-filter"><option value="">All types</option>'+categories.map(c=>'<option value="'+safe(c)+'" '+(filter===c?'selected':'')+'>'+safe(c)+'</option>').join('')+'</select></label></div>'+
    '<div class="vl-grid">'+pageItems.map(v=>'<article class="vl-card" data-card="'+safe(v.id)+'"><div class="vl-card-top"><span class="vl-category">'+safe(v.category)+'</span><span class="vl-status '+safe(v.status)+'">'+statusLabel(v.status)+'</span></div><p class="vl-path">'+safe(courses.find(c=>c.id===v.course_id)?.category||"Shared")+' / '+safe(courseName(v.course_id))+' / '+safe(v.module_id?moduleName(v.module_id):"Unassigned module")+(v.lesson_id?' / '+safe(lessonName(v.lesson_id)):'')+'</p><h3>'+safe(v.title)+'</h3><p>'+safe(v.description||"No description added.")+'</p>'+(v.topic?'<p class="vl-topic">Topic: '+safe(v.topic)+'</p>':'')+'<small>'+Math.round(Number(v.duration_seconds)||0)+' seconds · '+safe(v.original_filename||"Cloudflare Stream")+'</small><div class="vl-actions"><button type="button" data-edit="'+safe(v.id)+'">Edit details</button><button type="button" data-check="'+safe(v.id)+'">Check status</button><button type="button" data-detach="'+safe(v.id)+'">Course attachments</button><button type="button" data-delete="'+safe(v.id)+'" class="vl-danger">Remove</button></div></article>').join('')+'</div>'+(shown.length?'':'<p class="vl-empty">No videos match. Upload a video to build your library.</p>')+'<div class="vl-pagination"><span>Showing '+(shown.length?page*pageSize+1:0)+'–'+Math.min((page+1)*pageSize,shown.length)+' of '+shown.length+' videos</span><div><button type="button" id="vl-prev" '+(page===0?'disabled':'')+'>Previous</button><span>Page '+(page+1)+' of '+totalPages+'</span><button type="button" id="vl-next" '+(page+1>=totalPages?'disabled':'')+'>Next</button></div></div></section><div id="vl-modal-root"></div></div>';
   $("#vl-add").onclick=()=>showUpload();
   $("#vl-prev").onclick=()=>{page=Math.max(0,page-1);render()};
   $("#vl-next").onclick=()=>{page=Math.min(totalPages-1,page+1);render()};
   all("[data-browse-course]").forEach(b=>b.onclick=()=>{courseFilter=b.dataset.browseCourse;moduleFilter="";page=0;render()});
   all("[data-browse-module]").forEach(b=>b.onclick=()=>{courseFilter=b.dataset.parentCourse;moduleFilter=b.dataset.browseModule;page=0;render()});
   all("[data-browse-all]").forEach(b=>b.onclick=()=>{courseFilter="";moduleFilter="";filter="";term="";page=0;render()});
   $("#vl-search").oninput=e=>{term=e.target.value;page=0;render();const input=$("#vl-search");input.focus();input.setSelectionRange(term.length,term.length)};
   $("#vl-filter").onchange=e=>{filter=e.target.value;page=0;render()};
   $("#vl-course-filter").onchange=e=>{courseFilter=e.target.value;moduleFilter="";page=0;render()};
   $("#vl-module-filter").onchange=e=>{moduleFilter=e.target.value;page=0;render()};
   $("#vl-module-filter").disabled=!courseFilter;
   all("[data-edit]").forEach(b=>b.onclick=()=>showEdit(records.find(v=>v.id===b.dataset.edit)));
   all("[data-check]").forEach(b=>b.onclick=()=>check(records.find(v=>v.id===b.dataset.check)));
   all("[data-detach]").forEach(b=>b.onclick=()=>detach(records.find(v=>v.id===b.dataset.detach)));
   all("[data-delete]").forEach(b=>b.onclick=()=>remove(records.find(v=>v.id===b.dataset.delete)));
 }
 function modal(title,content){
   const host=$("#vl-modal-root");host.innerHTML='<div class="vl-backdrop"><section class="vl-modal" role="dialog" aria-modal="true" aria-label="'+safe(title)+'"><div class="vl-modal-title"><h2>'+safe(title)+'</h2><button type="button" class="vl-close" aria-label="Close dialog">×</button></div>'+content+'</section></div>';
   const close=()=>host.replaceChildren();host.querySelector(".vl-close").onclick=close;host.querySelector(".vl-backdrop").onclick=e=>{if(e.target.classList.contains("vl-backdrop")&&!busy)close()};
   return {host,close};
 }
 function showUpload(){
   const {host,close}=modal("Add video to library",'<form id="vl-upload-form"><label>Video title<input name="title" maxlength="200" required placeholder="E.g., How to Search a Load Board"></label><label>Media type'+categorySelect("Software Walkthrough","vl-new-category")+'</label>'+taxonomyFields("vl-new")+'<label>Custom media type (optional)<input name="new_category" maxlength="100" placeholder="Create another category"></label><label>Description<textarea name="description" rows="3" maxlength="4000" placeholder="What does this video teach?"></textarea></label><label>Choose an MP4, MOV or WebM file<input type="file" name="file" required accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"></label><p class="vl-help">Upload limit: 200 MB per video. For larger recordings, prepare smaller lesson clips first.</p><progress id="vl-progress" max="100" value="0" hidden></progress><p id="vl-upload-state" role="status" aria-live="polite"></p><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-cancel">Cancel</button><button type="submit" class="btn" id="vl-submit">Upload to library</button></div></form>');
   host.querySelector("#vl-cancel").onclick=close;
   bindTaxonomy(host,"vl-new");
   host.querySelector("#vl-upload-form").onsubmit=async e=>{
     e.preventDefault();if(busy)return;
     const fd=new FormData(e.target),file=fd.get("file"),title=clean(fd.get("title")),category=clean(fd.get("new_category"))||host.querySelector("#vl-new-category").value,taxonomy=taxonomyValue(host,"vl-new");
     if(!(file instanceof File)||!file.size||file.size>200*1048576){notify("Select a video under 200 MB.",true);return}
     busy=true;host.querySelector("#vl-submit").disabled=true;host.querySelector("#vl-cancel").disabled=true;
     const report=t=>host.querySelector("#vl-upload-state").textContent=t;
     let uid="";
     try{
       report("Preparing secure upload…");
       const {data,error}=await db.functions.invoke("andre-stream",{body:{mode:"init-library-upload",fileSize:file.size,fileName:file.name}});
       if(error||!data?.success||!data.uid||!data.uploadURL){
         let details=data||null;
         if(error?.context?.json){try{details=await error.context.json()}catch{}}
         const message=details?.error||error?.message||"Could not initialize upload";
         throw Error(message==="Edge Function returned a non-2xx status code"?"The video service is unavailable. Verify CLOUDFLARE_STREAM_API_TOKEN in the Andre Erving Supabase project.":message);
       }
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
       const {error:saveError}=await db.from("course_video_library").insert({stream_uid:uid,title,category,description:clean(fd.get("description")),original_filename:file.name,status:"processing",...taxonomy});
       if(saveError)throw Error(saveError.message+" — Cloudflare video identifier: "+uid);
       notify("Video uploaded. Cloudflare is processing playback.");busy=false;close();await load();
     }catch(err){report(err.message||String(err));notify(err.message||String(err),true)}
     finally{busy=false;const b=host.querySelector("#vl-submit");if(b)b.disabled=false;const cancel=host.querySelector("#vl-cancel");if(cancel)cancel.disabled=false}
   };
 }
 function showEdit(video){
   if(!video)return;
   const {host,close}=modal("Edit video details",'<form id="vl-edit-form"><label>Title<input name="title" maxlength="200" required value="'+safe(video.title)+'"></label><label>Media type'+categorySelect(video.category,"vl-edit-category")+'</label>'+taxonomyFields("vl-edit",video)+'<label>Custom media type (optional)<input name="new_category" maxlength="100" placeholder="Move this video to a new category"></label><label>Description<textarea name="description" maxlength="4000" rows="4">'+safe(video.description)+'</textarea></label><p class="vl-help">Editing metadata does not re-upload the video and does not change any existing lesson references.</p><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-cancel">Cancel</button><button type="submit" class="btn">Save changes</button></div></form>');
   host.querySelector("#vl-cancel").onclick=close;
   bindTaxonomy(host,"vl-edit",video);
   host.querySelector("form").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await db.from("course_video_library").update({title:clean(fd.get("title")),category:clean(fd.get("new_category"))||host.querySelector("#vl-edit-category").value,description:clean(fd.get("description")),...taxonomyValue(host,"vl-edit"),updated_at:new Date().toISOString()}).eq("id",video.id);if(error)return notify(error.message,true);close();notify("Video details updated.");await load()};
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
 async function detach(video){
   if(!video)return;
   const ref="cfstream:"+video.stream_uid;
   const {data:lessons,error}=await db.from("course_lessons").select("id,title,course_id,lesson_type,content_html,video_url").eq("video_url",ref).limit(100);
   if(error)return notify(error.message,true);
   if(!lessons?.length)return notify("This video is not attached to any course lessons.");
   const courseIds=[...new Set(lessons.map(x=>x.course_id))];
   const {data:courses,error:courseError}=await db.from("courses").select("id,title").in("id",courseIds);
   if(courseError)return notify(courseError.message,true);
   const names=new Map((courses||[]).map(x=>[x.id,x.title]));
   const {host,close}=modal("Manage course attachments",
     '<p class="vl-help">Detach a video from a specific lesson. The lesson is kept as a written article, and existing student progress is preserved. You can delete an unwanted lesson separately in the course editor.</p>'+
     '<div class="vl-pick-list">'+lessons.map(l=>
       '<div class="vl-attachment"><div><strong>'+safe(l.title)+'</strong><small>'+safe(names.get(l.course_id)||"Course")+'</small></div><button type="button" class="btn secondary" data-detach-lesson="'+safe(l.id)+'">Detach video</button></div>'
     ).join('')+'</div><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-done">Done</button></div>');
   host.querySelector("#vl-done").onclick=close;
   host.querySelectorAll("[data-detach-lesson]").forEach(button=>button.onclick=async()=>{
     const lesson=lessons.find(x=>x.id===button.dataset.detachLesson);
     if(!lesson)return;
     button.disabled=true;
     try{
       const fallback="<p>This video has been detached. Your instructor will update the written lesson content.</p>";
       const content=String(lesson.content_html||"").trim()||fallback;
       const {data:changed,error:saveError}=await db.from("course_lessons")
         .update({lesson_type:"text",video_url:null,content_html:content,updated_at:new Date().toISOString()})
         .eq("id",lesson.id).eq("video_url",ref).select("id");
       if(saveError)throw saveError;
       if(!changed?.length)throw Error("The lesson was changed elsewhere. Refresh the library and try again.");
       button.closest(".vl-attachment")?.remove();
       notify("Video detached from "+lesson.title+". The written lesson and student progress remain.");
       if(!host.querySelector("[data-detach-lesson]")){close();await load()}
     }catch(e){notify(e.message||String(e),true);button.disabled=false}
   });
 }
 async function remove(video){
   if(!video)return;
   const {data:uses,error:useError}=await db.from("course_lessons").select("id").eq("video_url","cfstream:"+video.stream_uid).limit(1);
   if(useError)return notify(useError.message,true);
   if(uses?.length){notify("This video is still used in a course. Choose which lesson to detach it from first.",true);return detach(video)}
   const yes=await new Promise(resolve=>{const m=modal("Remove video from library",'<p>Remove “'+safe(video.title)+'” from the library? This does not delete the Cloudflare recording.</p><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-no">Cancel</button><button type="button" class="btn" id="vl-yes">Remove library record</button></div>');m.host.querySelector("#vl-no").onclick=()=>{m.close();resolve(false)};m.host.querySelector("#vl-yes").onclick=()=>{m.close();resolve(true)}});if(!yes)return;
   const {error}=await db.from("course_video_library").delete().eq("id",video.id);if(error)return notify(error.message,true);notify("Library record removed. Cloudflare media remains available.");await load();
 }
 return {start:async()=>{try{await load()}catch(e){root.innerHTML='<p class="notice error">Unable to load video library: '+safe(e.message)+'</p>'}}};
}
