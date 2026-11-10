async function readVideoDuration(file){
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file),video=document.createElement("video");
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);video.removeAttribute("src");video.load();URL.revokeObjectURL(url);resolve(value)};
    const timer=setTimeout(()=>finish(0),7000);
    video.preload="metadata";video.onloadedmetadata=()=>finish(Number.isFinite(video.duration)&&video.duration>0?Math.ceil(video.duration):0);
    video.onerror=()=>finish(0);video.src=url;
  });
}
import {createLessonStudio} from './lms-lesson-studio.js?v=unsaved-20261107';

/* Andre Erving LMS studio. Auth and authorization are supplied by the management app;
   Supabase RLS is the server-side enforcement for every operation. */
export function createLMS({db,root,notify,safe,isCurrent}){
  const s={courses:[],modules:[],lessons:[],enrollments:[],customers:[],publications:[],courseId:null,tab:"overview",term:"",categoryFilter:"",busy:false,editor:null,nextEditRoute:null,collapsed:new Set(),drag:null,reordering:false,previewLessonId:null,progressCache:new Map(),progressPending:new Set()};
  const esc=safe;
  const fmt=v=>v?new Date(v).toLocaleDateString():"—";
  const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
  const titleSlug=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
  const by=id=>root.querySelector("#"+id);
  const all=(sel)=>[...root.querySelectorAll(sel)];
  function warn(e){notify(e?.message||String(e),true)}
  async function list(table,cols="*",order="sort_order"){
    const batch=500,items=[];
    for(let offset=0;offset<20000;offset+=batch){
      let q=db.from(table).select(cols);
      if(order)q=q.order(order,{ascending:order==="created_at"?false:true});
      if(order!=="id"&&table!=="course_publications")q=q.order("id",{ascending:true});
      const r=await q.range(offset,offset+batch-1);
      if(r.error)throw r.error;
      items.push(...(r.data||[]));
      if((r.data||[]).length<batch)return items;
    }
    throw Error("LMS catalog exceeds the current 20,000-record safety limit. Narrow or paginate the query.");
  }
  async function refresh(){try{
    const [a,b,c,d,e,pubs]=await Promise.all([
      list("courses"),list("course_modules"),list("course_lessons"),
      list("course_enrollments","id,user_id,course_id,status,enrolled_at,expires_at","enrolled_at"),
      list("customer_profiles","id,email,full_name","email"),
      list("course_publications","course_id,published_at,revision,has_unpublished_changes","course_id")
    ]);
    if(!isCurrent())return;
    Object.assign(s,{courses:a,modules:b,lessons:c,enrollments:d,customers:e,publications:pubs});
    if(s.courseId&&!a.some(x=>x.id===s.courseId)){s.courseId=null;s.tab="overview"}
    s.progressCache.clear();
    render();
  }catch(e){if(isCurrent())root.innerHTML='<div class="notice error">Unable to load LMS data: '+esc(e.message)+'</div>';}}
  const current=()=>s.courses.find(x=>x.id===s.courseId);
  const publishedState=()=>s.publications.find(p=>p.course_id===s.courseId);
  const related=(key)=>s[key].filter(x=>x.course_id===s.courseId);
  const escAttr=esc;
  const sectionHeader=(head,sub)=>'<div class="lms-heading"><div><div class="eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</div><h1>'+esc(head)+'</h1><p class="muted">'+esc(sub)+'</p></div></div>';
  const empty=(text)=>'<div class="lms-empty">'+esc(text)+'</div>';
  function render(){
    if(!isCurrent())return;
    if(s.editor){if(s.editor.isVisualLesson)return;renderEditor();return}if(!s.courseId)renderLibrary();else renderStudio();
  }
  function renderLibrary(){
    const matching=s.courses.filter(c=>(!s.categoryFilter||c.category===s.categoryFilter)&&(c.title+" "+c.category+" "+c.status).toLowerCase().includes(s.term.toLowerCase()));
    const categories=[...new Set(s.courses.map(c=>c.category||"Uncategorized"))].sort();
    const published=s.courses.filter(c=>c.status==="published").length;
    root.innerHTML=sectionHeader("Courses & programs","Build and manage the learning experience, from course details to individual lessons.")+
      '<div class="lms-banner"><div><span class="eyebrow">COURSE MANAGEMENT</span><h2>Your training catalog</h2><p>Design curriculum, manage participants, and control how courses appear in the student portal.</p></div><button class="btn lms-create" id="lms-new">+ Create course</button></div>'+
      '<div class="lms-stats"><div><span>Total courses</span><strong>'+s.courses.length+'</strong></div><div><span>Published</span><strong>'+published+'</strong></div><div><span>Drafts</span><strong>'+s.courses.filter(c=>c.status==="draft").length+'</strong></div><div><span>Enrollments</span><strong>'+s.enrollments.length+'</strong></div></div>'+
      '<section class="panel lms-library"><div class="lms-library-top"><div><h2>All courses</h2><p class="muted">Select any course to edit its overview, curriculum, students and settings.</p></div><div class="lms-catalog-filters"><label>Category<select id="lms-category-filter"><option value="">All categories</option>'+categories.map(c=>'<option value="'+escAttr(c)+'" '+(s.categoryFilter===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label><label>Search<input id="lms-search" type="search" aria-label="Search courses" placeholder="Search courses…" value="'+escAttr(s.term)+'"></label></div></div>'+
      '<div class="lms-card-grid">'+matching.map(c=>{
        const modules=s.modules.filter(m=>m.course_id===c.id).length,lessons=s.lessons.filter(l=>l.course_id===c.id).length,students=s.enrollments.filter(e=>e.course_id===c.id&&e.status==="active").length;
        const image=c.featured_image_url&&/^https:\/\//i.test(c.featured_image_url)?'<img src="'+escAttr(c.featured_image_url)+'" alt="" loading="lazy">':'<div class="lms-cover-placeholder">AE<span>LEARNING</span></div>';
        return '<article class="lms-course-card"><div class="lms-cover">'+image+'</div><div class="lms-course-body"><div class="lms-card-meta"><span class="pill '+esc(c.status)+'">'+esc(c.status)+'</span><span>'+esc(c.category||"Course")+'</span></div><h3>'+esc(c.title)+'</h3><p>'+esc(c.short_description||"Build and deliver your program.")+'</p><div class="lms-card-details"><span>'+modules+' sections</span><span>'+lessons+' lessons</span><span>'+students+' students</span><span>'+(c.access_days?esc(c.access_days)+" days access":"Lifetime access")+'</span></div><div class="lms-course-bottom"><strong>'+money(c.price)+'</strong><button class="btn secondary" data-open-course="'+escAttr(c.id)+'">Manage course →</button></div></div></article>';
      }).join('')+'</div>'+(matching.length?'':empty("No courses match your search."))+'</section>';
    by("lms-new").onclick=()=>openCourseForm();
    by("lms-category-filter").onchange=e=>{s.categoryFilter=e.target.value;renderLibrary()};
    by("lms-search").oninput=e=>{s.term=e.target.value;const pos=e.target.selectionStart;renderLibrary();const n=by("lms-search");n.focus();n.setSelectionRange(pos,pos)};
    all("[data-open-course]").forEach(b=>b.onclick=()=>{s.courseId=b.dataset.openCourse;s.tab="curriculum";openRoute("course/"+s.courseId+"/curriculum");render()});
  }
  function renderStudio(){
    const c=current();if(!c)return renderLibrary();
    if(s.tab==="preview"){
      location.assign("training-preview.html?course="+encodeURIComponent(c.id)+"&preview=admin"+(s.previewLessonId?"&lesson="+encodeURIComponent(s.previewLessonId):""));
      return;
    }
    const modules=related("modules"),lessons=related("lessons"),enrollments=related("enrollments");
    const displayTabs=[["overview","Overview"],["curriculum","Content"],["documents","Document Library"],["students","Participants"],["settings","Settings"]];
    root.innerHTML='<div class="lms-builder-breadcrumb"><button type="button" id="lms-back">‹ &nbsp; Courses & Programs</button><span> / '+esc(c.title)+'</span></div>'+
      '<div class="lms-builder-top"><div class="lms-builder-identity"><span class="lms-builder-book" aria-hidden="true">▤</span><div><div class="lms-builder-title"><h1>'+esc(c.title)+'</h1><span class="lms-course-kind">Course</span></div><div class="lms-builder-sub">'+esc(c.category||"Learning program")+' <span>·</span> <span class="lms-status-text">'+esc(c.status)+'</span></div></div></div>'+
      '<div class="lms-builder-actions"><button type="button" class="lms-white-action" id="lms-preview">◉ &nbsp; Preview</button><button type="button" class="lms-white-action" id="lms-invite">♙ &nbsp; Invite Participants</button><div class="lms-add-container"><button type="button" class="lms-gold-action" id="lms-add-menu" aria-haspopup="true" aria-expanded="false">＋ &nbsp; Add <svg class="ae-add-chevron" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button><div class="lms-add-dropdown" id="lms-add-dropdown" hidden><span class="lms-menu-heading">SECTION</span><button type="button" data-add-kind="section">▣ &nbsp; Add section</button><span class="lms-menu-heading">LESSONS</span><button type="button" data-add-kind="text">▤ &nbsp; Article</button><button type="button" data-add-kind="video">▷ &nbsp; Video</button><button type="button" data-add-kind="quiz">☷ &nbsp; Quiz</button><button type="button" data-add-kind="download">↓ &nbsp; Download</button></div></div></div></div>'+
      '<nav class="lms-builder-tabs" role="tablist" aria-label="Course management">'+displayTabs.map(([id,label])=>'<button type="button" role="tab" aria-selected="'+(s.tab===id)+'" class="'+(s.tab===id?'active':'')+'" data-tab="'+id+'">'+label+'</button>').join('')+'</nav>'+
      '<div id="lms-tab-body"></div>';
    by("lms-back").onclick=()=>{s.courseId=null;openRoute("courses");render()};
    by("lms-preview").onclick=()=>{location.assign("training-preview.html?course="+encodeURIComponent(s.courseId)+"&preview=admin")};
    by("lms-invite").onclick=()=>{sessionStorage.setItem("ae_order_course_context",JSON.stringify({courseId:s.courseId}));history.replaceState(null,"","#/admin/orders");location.reload()};
    const addButton=by("lms-add-menu"),drop=by("lms-add-dropdown");
    addButton.onclick=()=>{drop.hidden=!drop.hidden;addButton.setAttribute("aria-expanded",String(!drop.hidden))};
    drop.querySelectorAll("[data-add-kind]").forEach(b=>b.onclick=()=>{drop.hidden=true;quickAdd(b.dataset.addKind)});
    all("[data-tab]").forEach(b=>b.onclick=()=>{s.tab=b.dataset.tab;openRoute("course/"+s.courseId+"/"+s.tab);render()});
    const body=by("lms-tab-body");
    if(s.tab==="overview")body.innerHTML=renderOverview(c,modules,lessons,enrollments);
    if(s.tab==="curriculum")body.innerHTML=renderCurriculum(modules,lessons);
    if(s.tab==="documents"){body.innerHTML=renderDocumentsShell();void loadDocumentLibrary()}
    if(s.tab==="students"){body.innerHTML=renderStudents(enrollments);if(!s.progressCache.has(s.courseId))void loadCourseProgress(s.courseId)}
    if(s.tab==="settings")body.innerHTML=renderSettings(c,enrollments);
    if(s.tab==="preview")body.innerHTML=renderPreview(c,modules,lessons);
    wireTab();
    if(s.tab==="preview")void hydratePreviewMedia();
  }
  const safePreviewHtml=value=>{
    const doc=new DOMParser().parseFromString(String(value||""),"text/html");
    const allow=new Set(["P","BR","STRONG","B","EM","I","U","H2","H3","H4","UL","OL","LI","BLOCKQUOTE","FIGURE","A"]);
    const blocked=new Set(["SCRIPT","STYLE","IFRAME","SVG","OBJECT","FORM","IMG","AUDIO","VIDEO","SOURCE"]);
    const clean=node=>{for(const child of [...node.childNodes]){
      if(child.nodeType===3)continue;
      if(child.nodeType!==1){child.remove();continue}
      if(!allow.has(child.tagName)){
        if(blocked.has(child.tagName)){child.remove();continue}
        while(child.firstChild)node.insertBefore(child.firstChild,child);child.remove();clean(node);continue;
      }
      if(child.tagName==="FIGURE"){
        const type=child.getAttribute("data-ae-media"),path=child.getAttribute("data-ae-path")||"",label=child.getAttribute("data-ae-label")||"";
        if(!["image","audio"].includes(type)||!/^[-a-zA-Z0-9_./:]+$/.test(path)||path.includes("..")||!(path.startsWith(s.courseId+"/")||path.startsWith("r2:"+s.courseId+"/lesson-media/"))){child.remove();continue}
        for(const attr of [...child.attributes])child.removeAttribute(attr.name);
        child.setAttribute("data-ae-media",type);child.setAttribute("data-ae-path",path);child.setAttribute("data-ae-label",label.slice(0,160));child.className="ae-media-block";
        child.textContent="Loading media…";continue;
      }
      if(child.tagName==="A"){
        const href=child.getAttribute("href")||"";for(const attr of [...child.attributes])child.removeAttribute(attr.name);
        try{const u=new URL(href);if(["https:","mailto:"].includes(u.protocol)){child.href=u.href;child.rel="noopener noreferrer";child.target="_blank"}}catch{}
      }else for(const attr of [...child.attributes])child.removeAttribute(attr.name);
      clean(child);
    }};
    clean(doc.body);return doc.body.innerHTML;
  };
  async function hydratePreviewMedia(){
    const figures=all(".ae-preview-stage-body figure[data-ae-media][data-ae-path]");
    await Promise.all(figures.map(async fig=>{
      const path=fig.dataset.aePath,type=fig.dataset.aeMedia,label=fig.dataset.aeLabel||"Lesson media";
      try{
        const signedUrl=await signedLessonMedia(s.courseId,path);
        if(!fig.isConnected)return;
        const media=document.createElement(type==="audio"?"audio":"img");media.src=signedUrl;
        if(type==="audio"){media.controls=true;media.preload="metadata"}else{media.loading="lazy";media.alt=label}
        const caption=document.createElement("figcaption");caption.textContent=label;fig.replaceChildren(media,caption);
      }catch{if(fig.isConnected)fig.textContent="Unable to display "+label+". Check storage permissions."}
    }));
  }
  function renderPreview(c,modules,lessons){
    const ordered=[...modules].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const items=ordered.flatMap(m=>lessons.filter(l=>l.module_id===m.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
    const selected=items.find(l=>l.id===s.previewLessonId)||items[0];
    s.previewLessonId=selected?.id||null;
    const selectedIndex=items.findIndex(l=>l.id===s.previewLessonId);
    const questions=(()=>{if(!selected||!String(selected.content_html).startsWith("AE_QUIZ_V1:"))return [];try{const parsed=JSON.parse(selected.content_html.slice(11));return Array.isArray(parsed.questions)?parsed.questions:[]}catch{return []}})();
    const content=selected?.lesson_type==="quiz"?
      (questions.length?'<h2>Knowledge check</h2>'+questions.map((q,i)=>'<div class="ae-preview-question"><h3>'+(i+1)+'. '+esc(q.prompt)+'</h3>'+q.options.map((option,j)=>'<div class="ae-preview-option">'+String.fromCharCode(65+j)+'. '+esc(option)+'</div>').join('')+'</div>').join(''):'<p>No quiz questions have been added yet.</p>'):
      selected?.lesson_type==="video"?'<div class="ae-preview-video"><span>▶</span><strong>Video lesson</strong><p>'+ (selected.video_url?"Cloudflare Stream playback is configured separately.":"Upload a video to add playback.")+'</p></div>'+safePreviewHtml(selected.content_html):
      selected?.lesson_type==="download"?'<div class="ae-preview-resource"><strong>Downloadable resource</strong><p>'+esc(selected.resource_url?.startsWith("lmsfile:")?"Private uploaded resource":selected.resource_url?"External resource": "No resource attached")+'</p></div>'+safePreviewHtml(selected.content_html):
      selected?safePreviewHtml(selected.content_html)||'<p>Use Edit lesson to add your article content.</p>':'<p>Add a lesson to begin previewing the course.</p>';
    return '<div class="ae-preview-shell"><aside class="ae-preview-outline"><div class="ae-preview-outline-header"><span class="eyebrow">INSTRUCTOR PREVIEW</span><h2>Course outline</h2><p>'+items.length+' lessons · '+ordered.length+' sections</p></div>'+
      ordered.map(m=>'<section class="ae-preview-outline-section"><h3>'+esc(m.title)+'</h3>'+items.filter(l=>l.module_id===m.id).map(l=>'<button type="button" class="ae-preview-select '+(selected?.id===l.id?'active':'')+'" data-preview-lesson="'+esc(l.id)+'"><span>'+typeSymbol(l.lesson_type)+'</span>'+esc(l.title)+'</button>').join('')+'</section>').join('')+
      '</aside><main class="ae-preview-stage"><div class="ae-preview-stage-head"><div><span class="eyebrow">STUDENT LESSON VIEW · INSTRUCTOR PREVIEW</span><h1>'+esc(selected?.title||"No lessons yet")+'</h1><p>'+esc(ordered.find(m=>m.id===selected?.module_id)?.title||c.title)+' · '+typeLabel(selected?.lesson_type)+'</p></div><button type="button" class="lms-white-action" id="lms-preview-back">Back to builder</button></div>'+
      '<article class="ae-preview-stage-body">'+content+'</article><div class="ae-preview-stage-foot"><button type="button" class="lms-white-action" id="ae-preview-prev" '+(selectedIndex<=0?'disabled':'')+'>← Previous lesson</button><span>'+(items.length?selectedIndex+1:0)+' of '+items.length+'</span><button type="button" class="lms-gold-action" id="ae-preview-next" '+(selectedIndex>=items.length-1?'disabled':'')+'>Next lesson →</button></div></main></div>';
  }
  const typeLabel=kind=>({text:"Article",video:"Video",quiz:"Quiz",download:"Download"})[kind]||"Lesson";
  const typeSymbol=kind=>({text:"▤",video:"▷",quiz:"☷",download:"↓"})[kind]||"▤";
  function renderOverview(c,modules,lessons,enrollments){
    const active=enrollments.filter(e=>e.status==="active").length;
    const steps=[
      {name:"Course details",text:"Title, category and description",done:true},
      {name:"Build curriculum",text:"Organize sections for your program",done:modules.length>0},
      {name:"Create lessons",text:"Add multimedia lessons and quizzes",done:lessons.length>0},
      {name:"Publish your course",text:"Make your course available to students",done:c.status==="published"}
    ];
    return '<div class="ae-course-summary-hero"><div><span class="ae-editor-eyebrow">COURSE AT A GLANCE</span><h2>'+esc(c.title)+'</h2><p>'+esc(c.short_description||"Add a short description that introduces your students to this course.")+'</p><div class="ae-course-summary-meta"><span>'+esc(c.category||"Course")+'</span><span class="pill '+esc(c.status)+'">'+esc(c.status)+'</span></div></div><button type="button" class="btn" data-edit-course>Edit course details →</button></div>'+
      '<div class="lms-stats ae-overview-metrics"><div><span>Course price</span><strong>'+money(c.price)+'</strong></div><div><span>Sections</span><strong>'+modules.length+'</strong></div><div><span>Lessons</span><strong>'+lessons.length+'</strong></div><div><span>Active participants</span><strong>'+active+'</strong></div></div>'+
      '<div class="lms-course-benefits"><span class="ae-benefit-icon">◷</span><div><strong>Access duration</strong><span>'+(c.access_days?esc(c.access_days)+' days':'Lifetime access')+'</span></div></div><div class="lms-two-col ae-course-operations"><section class="panel"><div class="lms-panel-head"><div><span class="ae-editor-eyebrow">PROGRAM INFORMATION</span><h2>Course details</h2></div><button class="btn secondary" data-edit-course>Edit details</button></div><dl class="lms-facts"><div><dt>Course title</dt><dd>'+esc(c.title)+'</dd></div><div><dt>Category</dt><dd>'+esc(c.category||"—")+'</dd></div><div><dt>Short description</dt><dd>'+esc(c.short_description||"Not added")+'</dd></div><div><dt>URL slug</dt><dd>'+esc(c.slug)+'</dd></div><div><dt>Access duration</dt><dd>'+(c.access_days?esc(c.access_days)+" days":"No limit")+'</dd></div></dl></section>'+
      '<section class="panel ae-progress-checklist"><span class="ae-editor-eyebrow">COURSE READINESS</span><h2>Prepare your course</h2><p class="muted">Follow these milestones to get your program ready for learners.</p><div class="ae-readiness-meter"><div style="width:'+Math.round(steps.filter(x=>x.done).length/steps.length*100)+'%"></div></div><div class="ae-readiness-steps">'+steps.map(x=>'<div class="ae-readiness-step '+(x.done?'complete':'')+'"><span class="ae-readiness-icon">'+(x.done?'✓':'○')+'</span><div><strong>'+x.name+'</strong><small>'+x.text+'</small></div></div>').join('')+'</div><button class="btn" data-go-tab="curriculum">Open curriculum →</button></section></div>';
  }

  /* Course Document Library: private Supabase Storage, course-scoped resources.
     A file becomes student-visible only when attached to a download lesson and
     the course revision is published. Storage RLS enforces staff/student access. */
  const documentBucket="andreerving-lms-resources";
  const documentExt={pdf:"application/pdf",doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",txt:"text/plain",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg"};
  const fileLabel=name=>String(name||"").replace(/^[a-f0-9]{8}-[a-f0-9-]{27,}_/i,"");
  const documentPath=(name)=>s.courseId+"/library/"+name;
  const resourceAttached=(path)=>related("lessons").some(l=>l.resource_url===path);
  function renderDocumentsShell(){
    return '<section class="lms-builder-panel ae-doc-library"><div class="lms-content-heading"><div><h2>Document Library</h2><p>Upload PDF, Word, Excel and other learning resources. Attach them to a course section when ready. Files remain private.</p></div></div>'+
      '<div class="ae-doc-toolbar">'+
      '<label class="ae-doc-search-label"><span>Search documents</span><input id="ae-doc-search" type="search" placeholder="Search uploaded documents"></label>'+
      '<label class="lms-gold-action ae-doc-upload-button">＋ Upload Documents<input id="ae-doc-upload" type="file" multiple accept=".pdf,.doc,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg" hidden></label>'+
      '<button type="button" class="lms-white-action ae-doc-refresh" id="ae-doc-refresh">Refresh</button></div>'+
      '<p id="ae-doc-status" class="muted" role="status">Loading course documents…</p><div id="ae-doc-list"></div></section>';
  }
  async function loadDocumentLibrary(){
    if(s.tab!=="documents"||!s.courseId)return;
    const courseId=s.courseId,status=by("ae-doc-status"),body=by("ae-doc-list");if(!body)return;
    const storage=db.storage.from(documentBucket);
    async function reload(){
      if(status)status.textContent="Loading course documents…";
      const {data,error}=await storage.list(courseId+"/library",{limit:1000,sortBy:{column:"name",order:"asc"}});
      if(error){if(status)status.textContent="Unable to read library: "+error.message;return}
      const files=(data||[]).filter(f=>f.name&&!f.name.startsWith(".")&&f.id);
      if(status)status.textContent=files.length+" uploaded document"+(files.length===1?"":"s")+" · PDF, Word, Excel and supported course resources · max 20 MB each";
      function draw(term=""){
        if(s.courseId!==courseId||s.tab!=="documents"||!by("ae-doc-list"))return;
        const matching=files.filter(f=>fileLabel(f.name).toLowerCase().includes(term.toLowerCase()));
        const modules=related("modules").slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
        body.innerHTML=matching.length?'<div class="ae-doc-items">'+matching.map(f=>{
          const path=documentPath(f.name),attached=resourceAttached(path);
          return '<div class="ae-doc-item">'+
            '<div class="ae-doc-file"><strong>'+esc(fileLabel(f.name))+'</strong><div class="ae-doc-file-meta">'+esc((f.name.split(".").pop()||"").toUpperCase())+' · '+((f.metadata?.size||0)/1048576).toFixed(2)+' MB'+(attached?' · Attached to lesson':' · In library')+'</div></div>'+
            '<button type="button" class="lms-white-action ae-doc-action" data-doc-preview="'+escAttr(f.name)+'">Download</button>'+
            '<label class="ae-doc-module">Course section<select data-doc-module="'+escAttr(f.name)+'"><option value="">Choose section</option>'+modules.map(m=>'<option value="'+escAttr(m.id)+'">'+esc(m.title)+'</option>').join("")+'</select></label>'+
            '<button type="button" class="lms-gold-action ae-doc-action" data-doc-attach="'+escAttr(f.name)+'">Attach</button>'+
            '<button type="button" class="lms-white-action ae-doc-action ae-doc-delete" data-doc-delete="'+escAttr(f.name)+'" '+(attached?'disabled title="Remove the lesson attachment before deleting"':'')+'>Delete</button></div>';
        }).join("")+'</div>':'<div class="lms-empty">No documents found. Upload a file to get started.</div>';
        body.querySelectorAll("[data-doc-preview]").forEach(b=>b.onclick=async()=>{
          b.disabled=true;try{const path=courseId+"/library/"+b.dataset.docPreview;const {data,error}=await storage.createSignedUrl(path,120);if(error||!data?.signedUrl)throw error||Error("Could not create download link");const a=document.createElement("a");a.href=data.signedUrl;a.target="_blank";a.rel="noopener";a.download=fileLabel(b.dataset.docPreview);document.body.append(a);a.click();a.remove()}catch(error){warn(error)}finally{b.disabled=false}
        });
        body.querySelectorAll("[data-doc-attach]").forEach(b=>b.onclick=async()=>{
          const filename=b.dataset.docAttach,select=body.querySelector('[data-doc-module="'+CSS.escape(filename)+'"]'),moduleId=select?.value;
          if(!moduleId)return notify("Choose a course section before attaching the document.",true);
          const path=courseId+"/library/"+filename;
          if(related("lessons").some(l=>l.module_id===moduleId&&l.resource_url===path))return notify("This document is already attached to that section.",true);
          b.disabled=true;
          try{
            const others=related("lessons").filter(l=>l.module_id===moduleId);
            const {error}=await db.from("course_lessons").insert({course_id:courseId,module_id:moduleId,title:fileLabel(filename).replace(/\.[^.]+$/,""),lesson_type:"download",resource_url:path,allow_download:true,is_preview:false,sort_order:Math.max(0,...others.map(l=>Number(l.sort_order)||0))+10});
            if(error)throw error;
            notify("Document attached as a download lesson. Publish course changes to make it visible to students.");
            await refresh();
          }catch(error){warn(error);b.disabled=false}
        });
        body.querySelectorAll("[data-doc-delete]").forEach(b=>b.onclick=async()=>{
          const filename=b.dataset.docDelete,path=courseId+"/library/"+filename;
          if(resourceAttached(path))return notify("Remove the lesson attachment first.",true);
          if(!confirm("Permanently delete "+fileLabel(filename)+" from this course library?"))return;
          b.disabled=true;const {error}=await storage.remove([path]);
          if(error){warn(error);b.disabled=false;return}notify("Document deleted");await reload();
        });
      }
      draw(by("ae-doc-search")?.value||"");
      by("ae-doc-search").oninput=e=>draw(e.target.value);
    }
    by("ae-doc-upload").onchange=async e=>{
      const chosen=[...(e.target.files||[])];e.target.value="";if(!chosen.length)return;
      const uploader=by("ae-doc-upload");uploader.disabled=true;
      let done=0;
      for(const file of chosen){
        const extension=(file.name.split(".").pop()||"").toLowerCase();
        if(!documentExt[extension]||file.size===0||file.size>20*1048576){notify("Unsupported or oversized document: "+file.name,true);continue}
        if(status)status.textContent="Uploading "+(++done)+" of "+chosen.length+": "+file.name;
        const filename=crypto.randomUUID()+"_"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,130);
        const {error}=await storage.upload(courseId+"/library/"+filename,file,{cacheControl:"3600",upsert:false,contentType:documentExt[extension]});
        if(error)notify("Upload failed: "+file.name+" — "+error.message,true);
        else notify("Uploaded "+file.name);
      }
      uploader.disabled=false;await reload();
    };
    by("ae-doc-refresh").onclick=reload;
    await reload();
  }

  function renderCurriculum(modules,lessons){
    const ordered=[...modules].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    return '<section class="lms-builder-panel" id="lms-content-builder"><div class="lms-content-heading"><div><h2>Content</h2><p>Manage chapters here, or open the full visual LMS lesson editor to create and edit multimedia lessons.</p></div><div class="lms-content-actions"><button type="button" class="lms-gold-action" id="lms-open-visual-editor">✎ &nbsp; Open Visual LMS Editor</button><button type="button" class="lms-outline-add" id="lms-add-module">＋ Add section</button></div></div>'+
      '<div class="lms-section-stack" id="lms-section-stack">'+(ordered.length?ordered.map((m,i)=>{
        const own=lessons.filter(l=>l.module_id===m.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
        const folded=s.collapsed?.has(m.id);
        return '<article class="lms-builder-section" data-module="'+esc(m.id)+'" data-drop-module="'+esc(m.id)+'">'+
          '<header class="lms-builder-section-header"><span draggable="true" class="lms-drag-handle" data-drag-module="'+esc(m.id)+'" tabindex="0" title="Drag section to reorder" aria-label="Drag section">⠿</span>'+
          '<button type="button" class="lms-collapse" data-toggle-module="'+esc(m.id)+'" aria-expanded="'+(!folded)+'">'+'<svg class="ae-ui-chevron '+(folded?'is-collapsed':'')+'" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>'+
          '<button type="button" class="lms-section-name" data-edit-module="'+esc(m.id)+'">'+esc(m.title)+'</button>'+
          '<span class="lms-lesson-count">'+own.length+' '+(own.length===1?'lesson':'lessons')+'</span>'+
          '<span class="lms-inline-spacer"></span><button type="button" class="lms-dots" data-toggle-section-menu="'+esc(m.id)+'" aria-label="Section options">···</button>'+
          '<div class="lms-section-popover" data-section-menu="'+esc(m.id)+'" hidden><button type="button" data-edit-module="'+esc(m.id)+'">Edit section</button><button type="button" data-duplicate-module="'+esc(m.id)+'">Duplicate section</button><button type="button" data-delete-module="'+esc(m.id)+'">Delete section</button></div>'+
          '<button type="button" class="lms-collapse-end" data-toggle-module="'+esc(m.id)+'" title="Expand or collapse">'+'<svg class="ae-ui-chevron '+(folded?'is-collapsed':'')+'" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button></header>'+
          '<div class="lms-builder-section-content" '+(folded?'hidden':'')+'><div class="lms-lesson-dropzone" data-lessons-for="'+esc(m.id)+'">'+
          (own.map(l=>'<div class="lms-step" data-lesson="'+esc(l.id)+'" data-drop-lesson="'+esc(l.id)+'" data-in-module="'+esc(m.id)+'">'+
            '<span class="lms-lesson-drag lms-drag-handle" draggable="true" data-drag-lesson="'+esc(l.id)+'" tabindex="0" title="Drag to reorder or move to another section" aria-label="Drag lesson">⠿</span>'+
            '<span class="lms-step-type-icon" aria-hidden="true">'+typeSymbol(l.lesson_type)+'</span>'+
            '<button type="button" class="lms-step-name" data-edit-lesson="'+esc(l.id)+'">'+esc(l.title)+'</button>'+
            '<span class="lms-type-badge '+esc(l.lesson_type)+'">'+typeLabel(l.lesson_type)+'</span>'+
            '<div class="lms-step-actions"><button type="button" title="Move to another section" aria-label="Move lesson to another section" data-move-lesson-to="'+esc(l.id)+'">Move</button><button type="button" title="Edit lesson" aria-label="Edit lesson" data-edit-lesson="'+esc(l.id)+'">✎</button><button type="button" title="Duplicate lesson" aria-label="Duplicate lesson" data-duplicate-lesson="'+esc(l.id)+'">▣</button><button type="button" class="lms-delete-action" title="Delete lesson" aria-label="Delete lesson" data-delete-lesson="'+esc(l.id)+'">♜</button></div></div>').join('')||'<div class="lms-drop-empty">Drop a lesson here, or add your first step.</div>')+
          '</div><div class="lms-section-foot"><button type="button" data-add-step="'+esc(m.id)+'">＋ &nbsp; Add Step</button><span class="lms-foot-divider"></span><button type="button" data-import-step="'+esc(m.id)+'">↓ &nbsp; Import Step</button></div></div></article>';
      }).join(''):'<div class="lms-drop-empty lms-blank-curriculum">No sections yet. Create your first section to start building the course.</div>')+'</div></section>';
  }
  async function loadCourseProgress(courseId){
    if(s.progressPending.has(courseId)||s.progressCache.has(courseId))return;
    s.progressPending.add(courseId);
    const results=[];
    let failure=null;
    for(let offset=0;offset<50000;offset+=500){
      const {data,error}=await db.from("lesson_progress").select("id,user_id,lesson_id,completed,completed_at").eq("course_id",courseId).order("id").range(offset,offset+499);
      if(error){failure=error;break}
      results.push(...(data||[]));
      if(!data||data.length<500)break;
    }
    s.progressPending.delete(courseId);
    if(failure){warn(failure);return}
    s.progressCache.set(courseId,results);
    if(s.courseId===courseId&&s.tab==="students"&&isCurrent())render();
  }
  function renderStudents(enrollments){
    const rows=s.progressCache.get(s.courseId);
    const total=related("lessons").length;
    const finished=rows?enrollments.filter(en=>total>0&&rows.filter(p=>p.user_id===en.user_id&&p.completed).length>=total).length:null;
    const active=enrollments.filter(e=>e.status==="active").length;
    return '<section class="panel lms-students-panel"><div class="lms-panel-head"><div><h2>Participants & learning progress</h2><p class="muted">Track lessons completed and manage access to this course.</p></div><button class="btn" id="lms-enroll">+ Create course order</button></div>'+
      '<div class="lms-participant-stats"><div><span>Total participants</span><strong>'+enrollments.length+'</strong></div><div><span>Active access</span><strong>'+active+'</strong></div><div><span>Finished every lesson</span><strong>'+(finished===null?"—":finished)+'</strong></div></div>'+
      (enrollments.length?'<div class="tablewrap"><table><thead><tr><th>Student</th><th>Joined</th><th>Learning progress</th><th>Access</th><th>Expires</th><th>Action</th></tr></thead><tbody>'+
      enrollments.map(en=>{
        const person=s.customers.find(x=>x.id===en.user_id),completed=rows?.filter(p=>p.user_id===en.user_id&&p.completed).length||0;
        const percent=total?Math.min(100,Math.round(completed/total*100)):0;
        return '<tr><td><strong>'+esc(person?.full_name||person?.email||en.user_id)+'</strong><div class="muted">'+esc(person?.email||"")+'</div></td><td>'+fmt(en.enrolled_at)+'</td><td>'+(!rows?'<span class="muted">Loading progress…</span>':'<div class="lms-student-progress"><div class="lms-student-progress-label">'+completed+' / '+total+' lessons <strong>'+percent+'%</strong></div><div class="lms-student-meter"><span style="width:'+percent+'%"></span></div></div>')+'</td><td><span class="pill '+esc(en.status)+'">'+(en.status==="cancelled"?"Access revoked":esc(en.status))+'</span></td><td>'+fmt(en.expires_at)+'</td><td><div class="ae-enrollment-controls"><button class="btn secondary" data-enrollment="'+esc(en.id)+'">Manage</button><button class="btn '+(en.status==="cancelled"?"ae-grant-access":"ae-revoke-access")+'" data-access-toggle="'+esc(en.id)+'" data-access-action="'+(en.status==="cancelled"?"restore":"revoke")+'">'+(en.status==="cancelled"?"Grant access":"Revoke access")+'</button></div></td></tr>';
      }).join('')+'</tbody></table></div>':empty("No students are enrolled in this course yet."))+'</section>';
  }
  function renderSettings(c,enrollments){
    return '<div class="ae-settings-intro"><div><span class="ae-editor-eyebrow">COURSE CONFIGURATION</span><h2>Manage your course settings</h2><p>Control visibility, edit enrollment rules and maintain your published program.</p></div><button type="button" class="btn secondary" data-edit-course>Edit course details →</button></div>'+
      '<div class="lms-two-col ae-settings-layout"><section class="panel ae-settings-publish"><span class="ae-editor-eyebrow">VISIBILITY & PUBLISHING</span><h2>Publication status</h2><p class="muted">All editing stays in draft until you explicitly publish a new revision. Enrolled students continue seeing the previous published content.</p><div class="lms-status-row"><span>Current status</span><span class="pill '+esc(c.status)+'">'+esc(c.status)+'</span></div><p class="notice" role="status">'+(publishedState()?.has_unpublished_changes?'Unpublished changes waiting for approval.':'Student content matches the published revision.')+' Revision '+(publishedState()?.revision||0)+'.</p><div class="ae-settings-facts"><div><strong>Course URL</strong><span>'+esc(c.slug)+'</span></div><div><strong>Student access</strong><span>'+(c.access_days?esc(c.access_days)+" days":"Unlimited")+'</span></div></div><div class="row-actions">'+'<button class="btn" data-status="published">'+(c.status==="published"?"Publish changes":"Publish course")+'</button>'+(c.status==="published"?'<button class="btn secondary" data-status="draft">Unpublish course</button>':'')+'<button class="btn secondary" data-edit-course>Edit settings</button></div></section>'+
      '<section class="panel ae-settings-danger"><span class="ae-editor-eyebrow">LIFECYCLE MANAGEMENT</span><h2>Archive or delete</h2><p class="muted">Archiving removes this course from publication without deleting student history. Permanent deletion removes the course and curriculum.</p><div class="ae-settings-warning">Permanent deletion is blocked when enrollments exist. Check student access before making destructive changes.</div><div class="row-actions"><button class="btn secondary" data-status="archived">Archive course</button><button class="btn danger" id="lms-delete-course" '+(enrollments.length?'disabled title="Remove enrollments before deleting"':'')+'>Permanently delete</button></div>'+(enrollments.length?'<p class="notice">'+enrollments.length+' enrollment record(s) prevent deletion.</p>':'')+'</section></div>';
  }
  function wireTab(){
    all("[data-edit-course]").forEach(b=>b.onclick=()=>openCourseForm(current()));
    all("[data-go-tab]").forEach(b=>b.onclick=()=>{s.tab=b.dataset.goTab;openRoute("course/"+s.courseId+"/"+s.tab);render()});
    by("lms-open-visual-editor")?.addEventListener("click",()=>{
      const existing=related("lessons").slice().sort((x,y)=>(x.sort_order||0)-(y.sort_order||0))[0];
      if(existing)return openLessonForm(existing);
      const first=related("modules").slice().sort((x,y)=>(x.sort_order||0)-(y.sort_order||0))[0];
      if(first)return openLessonForm(null,first.id);
      notify("Add a chapter to begin creating lessons.");addSectionInline();
    });
    by("lms-add-module")?.addEventListener("click",()=>addSectionInline());
    all("[data-edit-module]").forEach(b=>b.onclick=()=>editSectionInline(b.dataset.editModule));
    all("[data-edit-lesson]").forEach(b=>b.onclick=()=>openLessonForm(s.lessons.find(l=>l.id===b.dataset.editLesson)));
    all("[data-delete-module]").forEach(b=>b.onclick=()=>deleteRecord("course_modules",b.dataset.deleteModule));
    all("[data-delete-lesson]").forEach(b=>b.onclick=()=>deleteRecord("course_lessons",b.dataset.deleteLesson));
    all("[data-duplicate-module]").forEach(b=>b.onclick=()=>duplicateSection(b.dataset.duplicateModule));
    all("[data-duplicate-lesson]").forEach(b=>b.onclick=()=>duplicateLesson(b.dataset.duplicateLesson));
    all("[data-move-lesson-to]").forEach(b=>b.onclick=()=>moveLessonToSection(b.dataset.moveLessonTo));
    all("[data-toggle-module]").forEach(b=>b.onclick=()=>{const id=b.dataset.toggleModule;if(s.collapsed.has(id))s.collapsed.delete(id);else s.collapsed.add(id);render()});
    all("[data-toggle-section-menu]").forEach(b=>b.onclick=()=>{const el=root.querySelector('[data-section-menu="'+b.dataset.toggleSectionMenu+'"]');if(el)el.hidden=!el.hidden});
    all("[data-add-step]").forEach(b=>b.onclick=()=>chooseLessonKind(b.dataset.addStep));
    all("[data-import-step]").forEach(b=>b.onclick=()=>importStep(b.dataset.importStep));
    by("lms-preview-back")?.addEventListener("click",()=>{s.tab="curriculum";openRoute("course/"+s.courseId+"/curriculum");render()});
    all("[data-preview-lesson]").forEach(b=>b.onclick=()=>{s.previewLessonId=b.dataset.previewLesson;render()});
    const previewList=related("modules").sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).flatMap(m=>related("lessons").filter(l=>l.module_id===m.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
    const previewIx=previewList.findIndex(l=>l.id===s.previewLessonId);
    by("ae-preview-prev")?.addEventListener("click",()=>{if(previewIx>0){s.previewLessonId=previewList[previewIx-1].id;render()}});
    by("ae-preview-next")?.addEventListener("click",()=>{if(previewIx>=0&&previewIx<previewList.length-1){s.previewLessonId=previewList[previewIx+1].id;render()}});

    by("lms-enroll")?.addEventListener("click",()=>{
      sessionStorage.setItem("ae_enrollment_return",JSON.stringify({courseId:s.courseId}));
      history.replaceState(null,"","#/admin/customer_profiles");location.reload();
    });
    all("[data-enrollment]").forEach(b=>b.onclick=()=>openEnrollment(s.enrollments.find(e=>e.id===b.dataset.enrollment)));
    all("[data-access-toggle]").forEach(b=>b.onclick=async()=>{
      const en=s.enrollments.find(e=>e.id===b.dataset.accessToggle);if(!en)return;
      const restoring=b.dataset.accessAction==="restore";
      if(!await brandedConfirm(restoring?"Grant access again":"Revoke course access",
        (restoring?"Restore access for ":"Revoke access for ")+(s.customers.find(p=>p.id===en.user_id)?.full_name||"this participant")+"? Their account, purchase history and course progress will remain intact."))return;
      const changes={status:restoring?"active":"cancelled"};
      if(restoring){const days=Number(current()?.access_days);changes.expires_at=Number.isFinite(days)&&days>0?new Date(Date.now()+days*86400000).toISOString():null}
      const result=await db.from("course_enrollments").update(changes).eq("id",en.id).eq("course_id",s.courseId).select("id").single();
      if(result.error)return warn(result.error);
      notify(restoring?"Course access granted again":"Course access revoked; records preserved");
      await refresh();
    });
    all("[data-status]").forEach(b=>b.onclick=()=>changeStatus(b.dataset.status));
    by("lms-delete-course")?.addEventListener("click",()=>deleteRecord("courses",s.courseId));
    wireDragAndDrop();
    decorateControls();
  }
  function decorateControls(){
    const paths={
      grip:'<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
      chevronDown:'<path d="m6 9 6 6 6-6"/>',
      chevronUp:'<path d="m6 15 6-6 6 6"/>',
      more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
      edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
      trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
      article:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
      video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-3v10l-4-3"/>',
      quiz:'<path d="M9 11l3 3L22 4M3 5h3M3 12h3M3 19h18"/>',
      download:'<path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4"/>'
    };
    const svg=name=>'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
    all('[data-drag-module],[data-drag-lesson]').forEach(n=>{n.innerHTML=svg('grip');n.setAttribute('aria-label','Drag to reorder')});
    all('[data-toggle-module]').forEach(n=>{n.innerHTML=svg(s.collapsed.has(n.dataset.toggleModule)?'chevronDown':'chevronUp')});
    all('[data-toggle-section-menu]').forEach(n=>n.innerHTML=svg('more'));
    all('[data-edit-lesson]').filter(n=>!n.classList.contains('lms-step-name')).forEach(n=>n.innerHTML=svg('edit'));
    all('[data-duplicate-lesson]').forEach(n=>n.innerHTML=svg('copy'));
    all('[data-delete-lesson]').forEach(n=>n.innerHTML=svg('trash'));
    all('.lms-step-type-icon').forEach(n=>{
      const type=n.closest('[data-lesson]')?.querySelector('.lms-type-badge')?.textContent?.trim()?.toLowerCase();
      n.innerHTML=svg({article:'article',video:'video',quiz:'quiz',download:'download'}[type]||'article');
    });
  }
  function addSectionInline(){
    s.tab="curriculum";openRoute("course/"+s.courseId+"/curriculum");render();
    const stack=by("lms-section-stack");if(!stack)return;
    const form=document.createElement("form");form.className="ae-inline-section";
    form.innerHTML='<span class="eyebrow">NEW SECTION</span><input name="title" placeholder="Section name, for example: Getting Started" maxlength="160" required><textarea name="description" placeholder="Optional section description"></textarea><div><button type="submit" class="btn">Create section</button><button type="button" class="btn secondary" data-cancel>Cancel</button></div><p role="alert" class="notice error hidden"></p>';
    stack.prepend(form);form.querySelector('[name="title"]').focus();
    form.querySelector("[data-cancel]").onclick=()=>form.remove();
    form.onsubmit=async ev=>{
      ev.preventDefault();const title=String(new FormData(form).get("title")||"").trim();
      if(!title)return;
      const btn=form.querySelector('[type="submit"]');btn.disabled=true;
      const row={course_id:s.courseId,title,description:String(new FormData(form).get("description")||"").trim(),sort_order:related("modules").reduce((m,x)=>Math.max(m,Number(x.sort_order)||0),0)+100};
      const {error}=await db.from("course_modules").insert(row);
      if(error){form.querySelector('[role="alert"]').textContent=error.message;form.querySelector('[role="alert"]').classList.remove("hidden");btn.disabled=false;return}
      notify("Course section added");await refresh();
    };
  }
  function editSectionInline(id){
    const item=s.modules.find(m=>m.id===id),header=root.querySelector('[data-module="'+id+'"] .lms-builder-section-header');
    if(!item||!header)return;
    const old=header.querySelector('[data-edit-module]');if(!old)return;
    const form=document.createElement("form");form.className="ae-inline-section ae-inline-section-small";
    form.innerHTML='<input name="title" aria-label="Section name" maxlength="160" required><button type="submit" class="btn">Save</button><button type="button" class="btn secondary" data-cancel>Cancel</button>';
    form.querySelector("input").value=item.title;
    old.replaceWith(form);form.querySelector("input").focus();form.querySelector("input").select();
    form.querySelector("[data-cancel]").onclick=()=>{form.replaceWith(old)};
    form.querySelector("input").onkeydown=ev=>{if(ev.key==="Escape"){ev.preventDefault();form.replaceWith(old)}};
    form.onsubmit=async ev=>{
      ev.preventDefault();const title=form.querySelector("input").value.trim();if(!title)return;
      const {error}=await db.from("course_modules").update({title}).eq("id",id).eq("course_id",s.courseId);
      if(error)return notify(error.message,true);
      notify("Section renamed");await refresh();
    };
  }
  function quickAdd(kind,moduleId=null){
    if(kind==="section")return addSectionInline();
    if(!related("modules").length){notify("Create a section before adding lessons.",true);return addSectionInline()}
    const target=moduleId||related("modules").sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))[0].id;
    openLessonForm(null,target,kind);
  }
  function chooseLessonKind(moduleId){
    const menu='<div class="lms-choose-grid">'+[["text","▤","Article"],["video","▷","Video"],["quiz","☷","Quiz"],["download","↓","Download"]].map(([type,symbol,label])=>'<button type="button" data-choice="'+type+'"><span>'+symbol+'</span>'+label+'</button>').join('')+'</div>';
    const frame=document.createElement("div");frame.className="lms-confirm-backdrop";
    frame.innerHTML='<section class="lms-confirm lms-picker" role="dialog" aria-modal="true" aria-label="Choose lesson type"><div class="lms-confirm-brand">AE <span>ADD A LESSON</span></div><h2>What would you like to create?</h2>'+menu+'<div class="lms-confirm-actions"><button class="btn secondary" data-cancel>Cancel</button></div></section>';
    document.body.append(frame);
    frame.querySelector("[data-cancel]").onclick=()=>frame.remove();
    frame.querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>{const kind=b.dataset.choice;frame.remove();quickAdd(kind,moduleId)});
  }
  function importStep(moduleId){
    const options=s.lessons.filter(l=>l.course_id===s.courseId);
    if(!options.length)return notify("Create a lesson first, then import a copy into another section.",true);
    const chooser=document.createElement("div");chooser.className="lms-confirm-backdrop";
    chooser.innerHTML='<section class="lms-confirm" role="dialog" aria-modal="true" aria-label="Import existing lesson"><div class="lms-confirm-brand">AE <span>IMPORT LESSON</span></div><h2>Choose a lesson to copy</h2><label class="field">Lesson<select id="lms-import-choice">'+options.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.title)+'</option>').join('')+'</select></label><div class="lms-confirm-actions"><button class="btn secondary" id="lms-import-no">Cancel</button><button class="btn" id="lms-import-yes">Import a copy</button></div></section>';
    document.body.append(chooser);chooser.querySelector("#lms-import-no").onclick=()=>chooser.remove();
    chooser.querySelector("#lms-import-yes").onclick=async()=>{const id=chooser.querySelector("#lms-import-choice").value;chooser.remove();await duplicateLesson(id,moduleId)};
  }
  function moveLessonToSection(id){
    const lesson=s.lessons.find(x=>x.id===id),sections=related("modules");
    if(!lesson||sections.length<2)return notify("Add another section before moving lessons.",true);
    const overlay=document.createElement("div");overlay.className="lms-confirm-backdrop";
    overlay.innerHTML='<section class="lms-confirm" role="dialog" aria-modal="true" aria-label="Move lesson"><div class="lms-confirm-brand">AE <span>CURRICULUM BUILDER</span></div><h2>Move lesson</h2><p>Move '+esc(lesson.title)+' to a different course section.</p><label class="field">Destination section<select id="lms-move-target">'+sections.map(m=>'<option value="'+esc(m.id)+'" '+(m.id===lesson.module_id?'selected':'')+'>'+esc(m.title)+'</option>').join('')+'</select></label><div class="lms-confirm-actions"><button type="button" class="btn secondary" data-dismiss>Cancel</button><button type="button" class="btn" data-commit-move>Move lesson</button></div></section>';
    document.body.append(overlay);
    overlay.querySelector("[data-dismiss]").onclick=()=>overlay.remove();
    overlay.querySelector("[data-commit-move]").onclick=async()=>{
      const target=overlay.querySelector("#lms-move-target").value;
      if(target===lesson.module_id){overlay.remove();return}
      const next=related("lessons").filter(l=>l.module_id===target).reduce((max,l)=>Math.max(max,Number(l.sort_order)||0),0)+100;
      const button=overlay.querySelector("[data-commit-move]");button.disabled=true;
      const {data,error}=await db.from("course_lessons").update({module_id:target,sort_order:next}).eq("id",id).eq("course_id",s.courseId).select("id");
      if(error||!data?.length){button.disabled=false;return warn(error||Error("Move not permitted"))}
      overlay.remove();notify("Lesson moved to section");await refresh();
    };
  }
  async function duplicateLesson(id,toModule=null){
    const l=s.lessons.find(x=>x.id===id);if(!l)return;
    const target=toModule||l.module_id;
    const {id:_id,created_at:_a,updated_at:_b,...data}=l;
    const next=related("lessons").filter(x=>x.module_id===target).reduce((max,x)=>Math.max(max,Number(x.sort_order)||0),0)+10;
    const r=await db.from("course_lessons").insert({...data,module_id:target,title:l.title+" (copy)",sort_order:next}).select("id").single();
    if(r.error)return warn(r.error);notify("Lesson duplicated");await refresh();
  }
  async function duplicateSection(id){
    const m=s.modules.find(x=>x.id===id);if(!m)return;
    const next=related("modules").reduce((max,x)=>Math.max(max,Number(x.sort_order)||0),0)+10;
    const r=await db.from("course_modules").insert({course_id:s.courseId,title:m.title+" (copy)",description:m.description,sort_order:next}).select("id").single();
    if(r.error)return warn(r.error);
    for(const l of related("lessons").filter(x=>x.module_id===id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))){
      const {id:_id,created_at:_a,updated_at:_b,...data}=l;
      const result=await db.from("course_lessons").insert({...data,module_id:r.data.id,title:l.title});
      if(result.error){warn(result.error);await refresh();return}
    }
    notify("Section and lessons duplicated");await refresh();
  }
  async function persistOrder(table,orderedIds,extra=null){
    if(s.reordering)return;
    s.reordering=true;
    try {
      for(let i=0;i<orderedIds.length;i++){
        const data={sort_order:(i+1)*100};
        if(extra)data.module_id=extra;
        const r=await db.from(table).update(data).eq("id",orderedIds[i]).select("id");
        if(r.error||!r.data?.length)throw new Error(r.error?.message||"Reordering was not permitted");
      }
      notify("Curriculum order saved");
    }catch(e){warn(e)}
    finally{s.reordering=false;await refresh()}
  }
  function wireDragAndDrop(){
    const holder=by("lms-section-stack");if(!holder)return;
    holder.querySelectorAll('[data-drag-module],[data-drag-lesson]').forEach(handle=>{
      handle.addEventListener("dragstart",event=>{
        const id=handle.dataset.dragModule||handle.dataset.dragLesson;
        const kind=handle.dataset.dragModule?"module":"lesson";
        s.drag={kind,id};
        event.dataTransfer.effectAllowed="move";
        event.dataTransfer.setData("text/plain",kind+":"+id);
        handle.closest(".lms-builder-section,.lms-step")?.classList.add("lms-dragging");
      });
      handle.addEventListener("dragend",()=>{holder.querySelectorAll(".lms-drag-over,.lms-dragging").forEach(el=>el.classList.remove("lms-drag-over","lms-dragging"));s.drag=null});
      handle.addEventListener("keydown",event=>{
        if(!["ArrowUp","ArrowDown"].includes(event.key))return;
        event.preventDefault();
        const dir=event.key==="ArrowUp"?-1:1;
        move(handle.dataset.dragModule?"course_modules":"course_lessons",handle.dataset.dragModule||handle.dataset.dragLesson,dir);
      });
    });
    const dragover=e=>{
      if(!s.drag)return;
      const module=e.target.closest("[data-module]"),step=e.target.closest("[data-lesson]");
      if(s.drag.kind==="module"&&!module)return;
      if(s.drag.kind==="lesson"&&!module)return;
      e.preventDefault();e.dataTransfer.dropEffect="move";
      holder.querySelectorAll(".lms-drag-over").forEach(el=>el.classList.remove("lms-drag-over"));
      (s.drag.kind==="module"?module:(step||module.querySelector("[data-lessons-for]")))?.classList.add("lms-drag-over");
    };
    holder.addEventListener("dragover",dragover);
    holder.addEventListener("drop",async e=>{
      if(!s.drag)return;
      const drag={...s.drag},module=e.target.closest("[data-module]"),step=e.target.closest("[data-lesson]");
      if(!module)return;e.preventDefault();
      if(drag.kind==="module"){
        const ids=[...holder.querySelectorAll("[data-module]")].map(el=>el.dataset.module).filter(id=>id!==drag.id);
        const index=ids.indexOf(module.dataset.module);
        if(index<0)return;const rect=module.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2;
        ids.splice(index+(after?1:0),0,drag.id);
        await persistOrder("course_modules",ids);
      }else{
        const targetModule=module.dataset.module,ordered=[...module.querySelectorAll("[data-lesson]")].map(el=>el.dataset.lesson).filter(id=>id!==drag.id);
        let position=ordered.length;
        if(step){const at=ordered.indexOf(step.dataset.lesson);if(at>=0)position=at+(e.clientY>step.getBoundingClientRect().top+step.getBoundingClientRect().height/2?1:0)}
        ordered.splice(position,0,drag.id);
        await persistOrder("course_lessons",ordered,targetModule);
      }
    });
  }
  function route(){
    const parts=(location.hash||"").replace(/^#\/?/,"").split("/");
    if(parts[0]!=="lms")return;
    if(parts[1]==="course"&&s.courses.some(x=>x.id===parts[2])){s.courseId=parts[2];s.tab=["overview","curriculum","documents","students","settings","preview"].includes(parts[3])?parts[3]:"curriculum"}
    else if(parts[1]==="edit"){
      const type=parts[2],id=parts[3],parent=parts[4];
      if(type==="course"){const record=s.courses.find(x=>x.id===id);s.courseId=record?.id||null;openCourseForm(record||null)}
      else if(type==="module"){const record=s.modules.find(x=>x.id===id);s.courseId=record?.course_id||parent||null;if(s.courses.some(x=>x.id===s.courseId))openModuleForm(record||null)}
      else if(type==="lesson"){const record=s.lessons.find(x=>x.id===id);s.courseId=record?.course_id||parent||null;if(s.courses.some(x=>x.id===s.courseId))openLessonForm(record||null,parts[5]||null)}
      else if(type==="enrollment"){const record=s.enrollments.find(x=>x.id===id);s.courseId=record?.course_id||parent||null;if(s.courses.some(x=>x.id===s.courseId))openEnrollment(record||null)}
    }
    else {s.courseId=null;s.tab="overview"}
  }
  function openRoute(part){
    const value="#/lms/"+part;
    if(location.hash!==value)history.pushState(null,"",value);
    root.closest(".main")?.scrollTo({top:0,behavior:"instant"});
  }
  function renderEditor(){
    if(!s.editor)return render();
    const e=s.editor;
    const isCourse=s.nextEditRoute?.startsWith("course/")===true;
    root.innerHTML='<div class="ae-editor-workspace '+(isCourse?'ae-course-workspace':'ae-compact-workspace')+'">'+
      '<div class="ae-editor-topline"><button id="lms-editor-back" type="button" class="ae-editor-back">← Courses & Programs</button><span class="ae-editor-toptrail">/ '+esc(isCourse?'Course setup':'Management')+'</span></div>'+
      '<div class="ae-editor-hero"><div><span class="ae-editor-eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</span><h1>'+esc(isCourse?(e.title==="Create new course"?"Create a course":e.title):e.title)+'</h1><p>'+(isCourse?'Build your course in a few organized steps. Save it as a draft, then add lessons and publish when ready.':'Update this part of your learning program without leaving the management workspace.')+'</p></div><span class="ae-editor-state">● &nbsp; '+(e.title.toLowerCase().includes("create")?'New':'Editing')+'</span></div>'+
      '<div class="ae-editor-body"><aside class="ae-editor-guide" id="ae-editor-guide"></aside><section class="ae-editor-formcard"><form id="lms-form"><div class="form-grid" id="ae-original-fields">'+e.markup+'</div><div class="ae-editor-footer"><span class="ae-editor-save-note" id="ae-editor-step-note">Changes are saved only when you select Save</span><div class="ae-editor-footer-buttons"><button class="btn secondary" type="button" id="ae-prev-step" hidden>← Previous</button><button class="btn" type="button" id="ae-next-step" hidden>Continue →</button><button class="btn ae-editor-submit" id="ae-final-save" type="submit">'+(isCourse?'Save course':'Save changes')+'</button><button class="btn secondary" type="button" id="lms-cancel">Cancel</button></div></div><p class="notice error hidden" id="lms-form-error" role="alert"></p></form></section></div></div>';
    const close=async()=>{if(!await window.AEUnsaved?.confirm())return;window.AEUnsaved?.clear();s.editor=null;openRoute(s.courseId?"course/"+s.courseId+"/"+s.tab:"courses");render()};
    by("lms-editor-back").onclick=close;by("lms-cancel").onclick=close;
    const form=by("lms-form");
    const source=by("ae-original-fields");
    const groupNames=isCourse?[
      {name:"Essentials",summary:"Name, category and introduction",fields:["title","slug","category","short_description"],icon:"01"},
      {name:"Course content",summary:"Description and cover image",fields:["description","featured_image_url"],icon:"02"},
      {name:"Pricing & access",summary:"Price, checkout and access rules",fields:["price","compare_at_price","purchase_url","access_days"],icon:"03"},
      {name:"Publish settings",summary:"Visibility, certificates and sorting",fields:["status","sort_order","certificate_enabled"],icon:"04"}
    ]:[
      {name:"Details",summary:"Complete the required information",fields:[],icon:"01"}
    ];
    const fields=[...source.querySelectorAll(".field")];
    const sections=groupNames.map((group,i)=>{
      const node=document.createElement("section");node.className="ae-form-step";
      node.dataset.step=String(i);
      node.innerHTML='<div class="ae-form-section-heading"><span class="ae-form-section-number">'+group.icon+'</span><div><h2>'+group.name+'</h2><p>'+group.summary+'</p></div></div><div class="ae-form-step-fields form-grid"></div>';
      const grid=node.querySelector(".ae-form-step-fields");
      const members=isCourse?group.fields.map(name=>fields.find(el=>el.querySelector('[name="'+name+'"]'))).filter(Boolean):fields;
      for(const member of members)grid.append(member);
      return node;
    });
    if(!isCourse){
      // Other LMS editors may wrap content in a grid; preserve controls and listeners.
      const leftovers=[...source.querySelectorAll("input,select,textarea")].filter(el=>!sections.some(g=>g.contains(el)));
      if(leftovers.length)throw new Error("Unable to organize all editor fields.");
    }
    if(isCourse){
      // Verify that every database field survives the visual regrouping.
      const originalNames=fields.flatMap(label=>[...label.querySelectorAll("[name]")].map(input=>input.name));
      const assignedNames=sections.flatMap(step=>[...step.querySelectorAll("[name]")].map(input=>input.name));
      if(originalNames.length!==assignedNames.length||originalNames.some(name=>!assignedNames.includes(name)))
        throw Error("Course field grouping is incomplete; no changes have been saved.");
    }
    source.replaceWith(...sections);
    if(isCourse){
      const guide=by("ae-editor-guide");
      guide.innerHTML='<div class="ae-editor-guide-title"><span class="ae-guide-label">YOUR WORKFLOW</span><h3>Course setup</h3><p>Four simple steps to prepare your learning program.</p></div><nav aria-label="Course setup steps" class="ae-guide-steps">'+groupNames.map((g,i)=>'<button type="button" class="ae-guide-step" data-guide-step="'+i+'"><span class="ae-guide-index">'+g.icon+'</span><span><strong>'+g.name+'</strong><small>'+g.summary+'</small></span><span class="ae-guide-check">✓</span></button>').join("")+'</nav><div class="ae-guide-help"><strong>Before you publish</strong><p>Create your course as a draft, add chapters and lessons, and preview the student experience.</p></div>';
      const preview=document.createElement("div");preview.className="ae-course-live-preview";
      preview.innerHTML='<span class="ae-guide-label">LIVE COURSE CARD</span><div class="ae-course-live-cover" id="ae-live-cover"><span>AE</span><small>LEARNING</small></div><span class="ae-course-live-pill" id="ae-live-status">Draft</span><h3 id="ae-live-name">Your course title</h3><p id="ae-live-summary">A short overview of your course appears here.</p><div class="ae-live-price" id="ae-live-price">$0.00</div>';
      guide.append(preview);
      let step=0,furthest=0;
      const updatePreview=()=>{
        by("ae-live-name").textContent=form.elements.namedItem("title")?.value.trim()||"Your course title";
        by("ae-live-summary").textContent=form.elements.namedItem("short_description")?.value.trim()||"A short overview of your course appears here.";
        const price=Number(form.elements.namedItem("price")?.value)||0;
        by("ae-live-price").textContent=price===0?"Free":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(price);
        const state=form.elements.namedItem("status")?.value||"draft";by("ae-live-status").textContent=state[0].toUpperCase()+state.slice(1);
        const image=form.elements.namedItem("featured_image_url")?.value.trim();
        const cover=by("ae-live-cover");cover.style.backgroundImage=image&&/^https:\/\//i.test(image)?'linear-gradient(#0f253b55,#0f253b55),url("'+image.replaceAll('"','%22')+'")':"";
      };
      const showStep=n=>{
        step=n;furthest=Math.max(furthest,n);
        sections.forEach((node,i)=>{node.hidden=i!==n;node.classList.toggle("current",i===n)});
        root.querySelectorAll("[data-guide-step]").forEach((button,i)=>{
          button.classList.toggle("active",i===n);button.classList.toggle("completed",i<n);
          button.setAttribute("aria-current",i===n?"step":"false");
        });
        by("ae-prev-step").hidden=n===0;
        by("ae-next-step").hidden=n===sections.length-1;
        by("ae-final-save").hidden=n!==sections.length-1;
        by("ae-editor-step-note").textContent="Step "+(n+1)+" of "+sections.length+" · "+groupNames[n].name;
        root.closest(".main")?.scrollTo({top:0,behavior:"smooth"});
      };
      const checkStep=n=>{
        const controls=[...sections[n].querySelectorAll("input,textarea,select")];
        for(const control of controls){
          if(!control.checkValidity()){
            showStep(n);control.reportValidity();control.focus();return false;
          }
        }return true;
      };
      by("ae-next-step").onclick=()=>{if(checkStep(step))showStep(step+1)};
      by("ae-prev-step").onclick=()=>showStep(step-1);
      root.querySelectorAll("[data-guide-step]").forEach(button=>button.onclick=()=>{
        const n=Number(button.dataset.guideStep);
        if(n<=step||n<=furthest){showStep(n);return}
        for(let i=step;i<n;i++)if(!checkStep(i))return;
        showStep(n);
      });
      form.noValidate=true;
      form.addEventListener("input",updatePreview);form.addEventListener("change",updatePreview);
      updatePreview();showStep(0);
      form.dataset.courseWizard="true";
      form.validateSteps=()=>{
        for(let i=0;i<sections.length;i++)if(!checkStep(i))return false;
        return true;
      };
    }else{
      by("ae-editor-guide").innerHTML='<div class="ae-editor-guide-title"><span class="ae-guide-label">EDITOR</span><h3>Keep it organized</h3><p>Update details here, then save changes when you are ready.</p></div><div class="ae-guide-help"><strong>Connected to Supabase</strong><p>Your changes are applied to the original records. Nothing is published or changed until you save.</p></div>';
      by("ae-next-step").hidden=true;by("ae-final-save").hidden=false;
    }
    form.onsubmit=async ev=>{
      ev.preventDefault();if(s.busy)return;
      if(isCourse&&!form.validateSteps())return;
      const submit=by("ae-final-save");s.busy=true;submit.disabled=true;
      try{await e.onSubmit(new FormData(form),form);window.AEUnsaved?.clean();s.editor=null;openRoute(s.courseId?"course/"+s.courseId+"/"+s.tab:"courses");await refresh()}
      catch(err){const n=by("lms-form-error");n.textContent=err.message||String(err);n.classList.remove("hidden");submit.disabled=false}
      finally{s.busy=false}
    };
    if(isCourse){
      const field=form.elements.namedItem("featured_image_url"),wrapper=field?.closest(".field");
      if(wrapper){
        const picker=document.createElement("div");picker.className="ae-course-cover-upload";
        picker.innerHTML='<div class="ae-cover-preview" role="img" aria-label="Course cover image preview"></div><div class="ae-cover-upload-actions"><label class="btn secondary ae-cover-picker">Upload cover image<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label><small>JPG, PNG or WebP · maximum 8 MB. Save the course to apply.</small><span class="ae-cover-upload-feedback" role="status" aria-live="polite"></span></div>';
        wrapper.append(picker);
        const preview=picker.querySelector(".ae-cover-preview"),fileInput=picker.querySelector('input[type="file"]'),feedback=picker.querySelector(".ae-cover-upload-feedback");
        const updateCover=()=>{const url=field.value.trim();preview.style.backgroundImage=/^https:\/\//i.test(url)?'url("'+url.replaceAll('"','%22')+'")':"";preview.classList.toggle("empty",!url)};
        field.addEventListener("input",updateCover);updateCover();
        fileInput.addEventListener("change",async()=>{
          const file=fileInput.files?.[0];if(!file)return;
          if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){feedback.textContent="Select a JPG, PNG or WebP image under 8 MB.";fileInput.value="";return}
          fileInput.disabled=true;feedback.textContent="Uploading your image…";
          try{
            const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[file.type],path="courses/covers/"+crypto.randomUUID()+"."+ext;
            const result=await db.storage.from("Andre Erving Public").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
            if(result.error)throw result.error;
            const url=db.storage.from("Andre Erving Public").getPublicUrl(path).data.publicUrl;
            if(!url)throw Error("Unable to create image URL.");
            field.value=url;field.dispatchEvent(new Event("input",{bubbles:true}));field.dispatchEvent(new Event("change",{bubbles:true}));
            feedback.textContent="Image uploaded. Save your course to apply it.";updateCover();
          }catch(error){feedback.textContent=error.message||"Upload failed."}
          finally{fileInput.disabled=false;fileInput.value=""}
        });
      }
    }
    window.AEUnsaved?.watch(form,{title:isCourse?'course':'course settings',save:async()=>{
      if(!form.isConnected||!form.reportValidity())return false;
      form.requestSubmit();
      for(let i=0;i<100;i++){
        await new Promise(resolve=>setTimeout(resolve,125));
        if(!window.AEUnsaved?.isDirty())return true;
        if(!form.isConnected)return true;
        if(!root.querySelector('#lms-form-error')?.classList.contains('hidden'))return false;
      }
      return false;
    }});
    return form;
  }
  function modal(title,markup,onSubmit){
    s.editor={title,markup,onSubmit};
    openRoute("edit/"+(s.nextEditRoute||"course/new"));
    renderEditor();
    return root.querySelector("#lms-form");
  }
  function brandedConfirm(title,message,needsDelete=false){
    return new Promise(resolve=>{
      const overlay=document.createElement("div");
      overlay.className="lms-confirm-backdrop";overlay.setAttribute("role","presentation");
      overlay.innerHTML='<section class="lms-confirm" role="alertdialog" aria-modal="true" aria-labelledby="lms-confirm-title" aria-describedby="lms-confirm-description"><div class="lms-confirm-brand">AE <span>ANDRE ERVING MANAGEMENT</span></div><h2 id="lms-confirm-title">'+esc(title)+'</h2><p id="lms-confirm-description">'+esc(message)+'</p>'+(needsDelete?'<label class="field">Type DELETE to continue<input id="lms-confirm-word" autocomplete="off" placeholder="DELETE"></label>':'')+'<div class="lms-confirm-actions"><button class="btn secondary" type="button" id="lms-no">Cancel</button><button class="btn '+(needsDelete?'danger':'')+'" type="button" id="lms-yes" '+(needsDelete?'disabled':'')+'>'+ (needsDelete?'Delete permanently':'Continue')+'</button></div></section>';
      document.body.append(overlay);
      const finish=v=>{document.removeEventListener("keydown",onKey);overlay.remove();resolve(v)};
      const onKey=event=>{if(event.key==="Escape")finish(false)};
      document.addEventListener("keydown",onKey);
      overlay.querySelector("#lms-no").onclick=()=>finish(false);
      overlay.querySelector("#lms-yes").onclick=()=>finish(true);
      if(needsDelete)overlay.querySelector("#lms-confirm-word").oninput=event=>{overlay.querySelector("#lms-yes").disabled=event.target.value!=="DELETE"};
      overlay.querySelector("#lms-no").focus();
    });
  }
  const input=(label,name,val="",type="text",extra="")=>'<label class="field">'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+escAttr(val??"")+'" '+extra+'></label>';
  const textarea=(label,name,val="")=>'<label class="field wide">'+esc(label)+'<textarea name="'+name+'">'+esc(val??"")+'</textarea></label>';
  const select=(label,name,options,value)=>'<label class="field">'+esc(label)+'<select name="'+name+'">'+options.map(([v,t])=>'<option value="'+esc(v)+'" '+(value===v?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
  async function save(table,data,id){
    let q=id?db.from(table).update(data).eq("id",id):db.from(table).insert(data);
    const r=await q.select("id").single();if(r.error)throw r.error;return r.data;
  }
  function openCourseForm(c=null){
    s.nextEditRoute="course/"+(c?.id||"new");
    const fields='<div class="form-grid">'+input("Course title","title",c?.title||"","text","required maxlength=160")+input("URL slug","slug",c?.slug||"","text","required pattern=\"[a-z0-9]+(-[a-z0-9]+)*\"")+textarea("Short description","short_description",c?.short_description)+textarea("Full course description","description",c?.description)+input("Category","category",c?.category||"Business")+input("Cover image HTTPS URL","featured_image_url",c?.featured_image_url||"","url")+input("Price (USD)","price",c?.price??0,"number",'min=0 step=".01" required')+input("Compare-at price (USD)","compare_at_price",c?.compare_at_price??"","number",'min=0 step=".01"')+input("Access duration (days, blank for unlimited)","access_days",c?.access_days??"","number",'min=1 step=1')+input("Purchase URL","purchase_url",c?.purchase_url||"","url")+select("Publication status","status",[["draft","Draft"],["published","Published"],["archived","Archived"]],c?.status||"draft")+input("Display order","sort_order",c?.sort_order??0,"number",'step=1')+'<label class="field"><input name="certificate_enabled" type="checkbox" '+(c?.certificate_enabled!==false?'checked':'')+'> Certificate eligible</label></div>';
    const d=modal(c?"Edit course":"Create new course",fields,async fd=>{
      const data={title:String(fd.get("title")||"").trim(),slug:String(fd.get("slug")||"").trim(),short_description:String(fd.get("short_description")||"").trim(),description:String(fd.get("description")||"").trim(),category:String(fd.get("category")||"").trim(),featured_image_url:String(fd.get("featured_image_url")||"").trim()||null,price:Number(fd.get("price")),compare_at_price:fd.get("compare_at_price")===""?null:Number(fd.get("compare_at_price")),access_days:fd.get("access_days")===""?null:Number(fd.get("access_days")),purchase_url:String(fd.get("purchase_url")||"").trim()||null,status:String(fd.get("status")),sort_order:Number(fd.get("sort_order")||0),certificate_enabled:fd.has("certificate_enabled")};
      if(!data.title||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)||!Number.isFinite(data.price)||data.price<0)throw Error("Enter a valid title, lowercase URL slug and nonnegative price.");
      if(data.status==="published"&&c?.status!=="published")throw Error("Create the course as a draft and add its curriculum before publishing in Settings.");
      const v=await save("courses",data,c?.id);s.courseId=v.id;s.tab="overview";notify(c?"Course updated":"Course created");
    });
    const name=d.querySelector('[name="title"]'),slug=d.querySelector('[name="slug"]');let typed=!!c;
    slug.addEventListener("input",()=>typed=true);
    name.addEventListener("input",()=>{if(!typed)slug.value=titleSlug(name.value)});
  }
  function openModuleForm(m=null){
    const course=current();if(!course)return;
    s.nextEditRoute="module/"+(m?.id||"new")+"/"+course.id;
    modal(m?"Edit section":"Add course section",'<div class="form-grid">'+input("Section name","title",m?.title||"","text","required maxlength=160")+textarea("Description","description",m?.description||"")+'</div>',async fd=>{
      const title=String(fd.get("title")||"").trim();if(!title)throw Error("Section name is required");
      await save("course_modules",{course_id:course.id,title,description:String(fd.get("description")||"").trim(),sort_order:m?.sort_order??(related("modules").length+1)*10},m?.id);notify(m?"Section updated":"Section created");
    });
  }
  // Authenticated Cloudflare Worker gateway. R2 bucket credentials never enter the browser.
  const r2Gateway="https://andre-lms-media.aerving1.workers.dev";
  const r2Fetch=async(endpoint,courseId,payload)=>{
    const {data:{session},error}=await db.auth.getSession();
    if(error||!session?.access_token)throw Error("Sign in to upload or open lesson media.");
    const upload=endpoint==="upload";
    const headers={"Authorization":"Bearer "+session.access_token};
    if(upload){
      headers["Content-Type"]=payload.type;
      headers["X-AE-Course-Id"]=courseId;
    }else headers["Content-Type"]="application/json";
    const response=await fetch(r2Gateway+"/"+endpoint,{
      method:"POST",headers,body:upload?payload:JSON.stringify({courseId,path:payload})
    });
    if(!response.ok){
      const result=await response.json().catch(()=>null);
      throw Error(result?.error||"Cloudflare R2 request failed ("+response.status+").");
    }
    return upload?response.json():response.blob();
  };
  const mediaObjectURLs=new Map();
  const signedLessonMedia=async(courseId,path)=>{
    if(path.startsWith("r2:")){
      if(mediaObjectURLs.has(path))return mediaObjectURLs.get(path);
      const blob=await r2Fetch("read",courseId,path);
      const url=URL.createObjectURL(blob);
      mediaObjectURLs.set(path,url);
      return url;
    }
    if(!path.startsWith(courseId+"/")||path.includes(".."))throw Error("Invalid course media path.");
    const {data,error}=await db.storage.from("andreerving-lms-resources").createSignedUrl(path,3600);
    if(error||!data?.signedUrl)throw Error("Could not access lesson media: "+(error?.message||"Unknown error"));
    return data.signedUrl;
  };
  async function chooseLibraryVideo(){
    const {data,error}=await db.from("course_video_library").select("id,title,category,description,status,stream_uid,duration_seconds,course_id,module_id,lesson_id,topic").eq("status","ready").order("category").order("title").limit(1000);
    if(error){notify("Unable to load Video Library: "+error.message,true);return null}
    const videos=data||[];
    return new Promise(resolve=>{
      const backdrop=document.createElement("div");backdrop.className="vl-backdrop";
      const dialog=document.createElement("section");dialog.className="vl-modal vl-picker";dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-label","Choose a library video");
      dialog.innerHTML='<div class="vl-modal-title"><h2>Choose from Video Library</h2><button type="button" class="vl-close" aria-label="Close">×</button></div><p>Use an existing recording without uploading another copy.</p><div class="vl-toolbar vl-filters"><label>Search videos<input type="search" id="vl-pick-search" placeholder="Search videos…"></label><label>Source<select id="vl-pick-source"><option value="relevant">Current course and shared</option><option value="all">All courses (reuse)</option></select></label><label>Module<select id="vl-pick-module"><option value="">All modules</option></select></label><label>Media type<select id="vl-pick-category"><option value="">All categories</option></select></label></div><div id="vl-pick-list" class="vl-pick-list" role="list"></div><div class="vl-modal-actions"><button type="button" class="btn secondary" id="vl-pick-cancel">Cancel</button></div>';
      backdrop.append(dialog);document.body.append(backdrop);
      const categories=[...new Set(videos.map(v=>v.category))].sort();
      const category=dialog.querySelector("#vl-pick-category");for(const value of categories){const o=document.createElement("option");o.value=value;o.textContent=value;category.append(o)}
      const search=dialog.querySelector("#vl-pick-search"),list=dialog.querySelector("#vl-pick-list");
      const source=dialog.querySelector("#vl-pick-source"),moduleSelect=dialog.querySelector("#vl-pick-module");
      for(const mod of s.modules.filter(m=>m.course_id===s.courseId)){const option=document.createElement("option");option.value=mod.id;option.textContent=mod.title;moduleSelect.append(option)}
      const end=chosen=>{document.removeEventListener("keydown",key);backdrop.remove();resolve(chosen)};
      const key=e=>{if(e.key==="Escape")end(null)};
      const show=()=>{
        const matches=videos.filter(v=>(source.value==="all"||!v.course_id||v.course_id===s.courseId)&&(!moduleSelect.value||v.module_id===moduleSelect.value)&&(!category.value||v.category===category.value)&&[v.title,v.category,v.description,v.topic].join(" ").toLowerCase().includes(search.value.toLowerCase()));
        list.replaceChildren();
        if(!matches.length){const p=document.createElement("p");p.className="vl-empty";p.textContent="No ready videos found. Upload a video to Video Library and check its processing status first.";list.append(p)}
        matches.forEach(video=>{
          const row=document.createElement("button");row.type="button";row.className="vl-pick-row";
          const heading=document.createElement("strong");heading.textContent=video.title;
          const meta=document.createElement("small");meta.textContent=(s.courses.find(c=>c.id===video.course_id)?.title||"Shared media")+" · "+(s.modules.find(m=>m.id===video.module_id)?.title||"No module")+" · "+video.category+" · "+Math.round(Number(video.duration_seconds)||0)+" seconds";
          row.append(heading,meta);row.onclick=()=>end(video);list.append(row);
        });
      };
      search.oninput=show;category.onchange=show;moduleSelect.onchange=show;source.onchange=show;
      dialog.querySelector(".vl-close").onclick=()=>end(null);
      dialog.querySelector("#vl-pick-cancel").onclick=()=>end(null);
      backdrop.onclick=e=>{if(e.target===backdrop)end(null)};
      document.addEventListener("keydown",key);show();search.focus();
    });
  }
  function openLessonForm(lesson=null,moduleId=null,initialKind="text"){
    const course=current();if(!course)return;
    const modules=related("modules");if(!modules.length)return notify("Create a course section first.",true);
    s.nextEditRoute="lesson/"+(lesson?.id||"new")+"/"+course.id+"/"+(moduleId||modules[0].id);
    s.editor={title:"Lesson studio",isVisualLesson:true};
    openRoute("edit/"+s.nextEditRoute);
    const parentModule=lesson?.module_id||moduleId||modules[0].id;
    createLessonStudio({
      root,course,modules,lessons:related("lessons"),moduleId:parentModule,lesson:lesson?{...lesson,module_id:parentModule}:null,kind:initialKind,escape:esc,notify,
      onOpenLesson:(id)=>openLessonForm(s.lessons.find(l=>l.id===id)),
      onAddChapter:()=>{s.editor=null;s.tab="curriculum";openRoute("course/"+course.id+"/curriculum");render();openModuleForm()},
      onAddLesson:(target)=>openLessonForm(null,target),
      onPublish:async()=>{try{await publishRevision(course);await refresh()}catch(error){notify(error.message||String(error),true)}},

      onCancel:()=>{s.editor=null;openRoute("course/"+course.id+"/curriculum");s.tab="curriculum";render()},
      onLibrarySelect:chooseLibraryVideo,
      onUpload:async(file,onProgress)=>{
        const {data,error}=await db.functions.invoke("andre-stream",{body:{
          mode:"init-upload",courseId:course.id,fileSize:file.size,fileName:file.name,durationSeconds:await readVideoDuration(file)
        }});
        if(error||!data?.success||!data?.uploadURL||!data?.uid){let reason=data?.error||"";if(error?.context?.json){try{const details=await error.context.json();reason=details?.error||reason}catch{}}throw Error(reason||error?.message||"Unable to initialize Cloudflare upload. Check Stream credentials.")}
        const url=new URL(data.uploadURL);
        if(url.protocol!=="https:"||!["upload.videodelivery.net","upload.cloudflarestream.com"].includes(url.hostname))throw Error("Untrusted Cloudflare Stream upload destination");
        await new Promise((resolve,reject)=>{
          const xhr=new XMLHttpRequest();
          xhr.open("POST",data.uploadURL);
          xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100))};
          xhr.onerror=()=>reject(Error("Video upload interrupted. Please retry."));
          xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error("Cloudflare video upload failed ("+xhr.status+")"));
          const formData=new FormData();formData.append("file",file,file.name);xhr.send(formData);
        });
        onProgress(100);
        return data.uid;
      },
      onMediaURL:async(path)=>signedLessonMedia(course.id,path),
      onMediaUpload:async(file,type)=>{
        const mime=type==="image"?{
          "image/png":"png","image/jpeg":"jpg","image/webp":"webp"
        }:{"audio/mpeg":"mp3","audio/mp4":"m4a","audio/x-m4a":"m4a","audio/wav":"wav","audio/x-wav":"wav","audio/wave":"wav","audio/ogg":"ogg"};
        const ext=file.name.split(".").pop()?.toLowerCase();
        const canonical=type==="image"?{"jpeg":"jpg","jpg":"jpg","png":"png","webp":"webp"}:{"mp3":"mp3","m4a":"m4a","wav":"wav","ogg":"ogg"};
        if(!canonical[ext]||!file.size||file.size>(type==="image"?10:50)*1048576||
          (file.type&&mime[file.type]!==canonical[ext]))throw Error("Unsupported "+type+" type or file size.");
        const contentType=type==="image"?{"jpg":"image/jpeg","png":"image/png","webp":"image/webp"}[canonical[ext]]:{"mp3":"audio/mpeg","m4a":"audio/mp4","wav":"audio/wav","ogg":"audio/ogg"}[canonical[ext]];
        const verifiedFile=file.type===contentType?file:new File([file],file.name,{type:contentType});
        const result=await r2Fetch("upload",course.id,verifiedFile);
        if(!result?.path?.startsWith("r2:"+course.id+"/lesson-media/"))
          throw Error("Cloudflare R2 returned an invalid media reference.");
        return result.path;
      },
      onResourceUpload:async(file)=>{
        const allowedTypes=new Set(["application/pdf","image/png","image/jpeg","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
        if(!allowedTypes.has(file.type)||file.size>20*1024*1024||!file.size)throw Error("Choose an accepted course resource under 20 MB.");
        const result=await r2Fetch("upload",course.id,file);
        if(!result?.path?.startsWith("r2:"+course.id+"/lesson-media/"))
          throw Error("Cloudflare R2 returned an invalid resource reference.");
        return result.path;
      },
      onSave:async(payload)=>{
        const data={...payload,sort_order:lesson?.sort_order??((related("lessons").filter(l=>l.module_id===payload.module_id).length+1)*10)};
        const q=lesson?db.from("course_lessons").update(data).eq("id",lesson.id):db.from("course_lessons").insert(data);
        const result=await q.select("id").single();
        if(result.error)throw result.error;
        window.AEUnsaved?.clean();s.editor=null;s.tab="curriculum";openRoute("course/"+course.id+"/curriculum");
        notify(lesson?"Lesson updated":"Lesson created");
        await refresh();
      }
    });
    const select=root.querySelector("#ae-module");if(select)select.value=parentModule;
  }
  function openEnrollment(record=null){
    if(record?.id){
      const msg=record.order_id
        ?"Course access is managed through its completed order. Renewals require a new order."
        :"This participant does not have a qualifying order. Create an order before granting access.";
      notify(msg,true);
    }
    sessionStorage.setItem("ae_order_course_context",JSON.stringify({courseId:s.courseId,userId:record?.user_id||null}));
    history.replaceState(null,"","#/admin/orders");
    location.reload();
  }

  async function publishRevision(c){
    const {data,error}=await db.rpc("publish_course_revision",{p_course_id:c.id});
    if(error)throw error;
    const published=data?.[0];
    notify("Published revision "+(published?.revision||"new")+". Students will now see the approved course content.");
  }
  async function changeStatus(status){
    const c=current();if(!c)return;
    if(status==="published"){
      if(!related("modules").length||!related("lessons").length)return notify("Add course modules and lessons before publishing.",true);
      if(!await brandedConfirm("Publish changes","Publish all saved changes to "+c.title+"? Students will see the new revision."))return;
      try{await publishRevision(c);await refresh()}catch(error){warn(error)}return;
    }
    const r=await db.from("courses").update({status}).eq("id",c.id);if(r.error)return warn(r.error);notify("Course status updated");await refresh();
  }
  async function deleteRecord(table,id){
    if(!id)return;
    const c=current(),labels={courses:c?.title,course_modules:s.modules.find(x=>x.id===id)?.title,course_lessons:s.lessons.find(x=>x.id===id)?.title};
    const label=labels[table]||"record";
    if(table==="courses"&&s.enrollments.some(e=>e.course_id===id))return notify("This course has enrollment history. Archive it instead of deleting.",true);
    if(table==="course_modules"&&s.enrollments.some(e=>e.course_id===s.courseId))return notify("This course has enrolled students. Delete sections only after preserving their progress records.",true);
    if(table==="course_lessons"&&s.enrollments.some(e=>e.course_id===s.courseId))return notify("This course has enrolled students. Edit or archive the course instead.",true);
    if(!await brandedConfirm("Delete "+label,'This cannot be undone and may remove related curriculum content.',true))return;
    const r=await db.from(table).delete().eq("id",id).select("id");if(r.error)return warn(r.error);
    if(!r.data?.length)return notify("Nothing was deleted. Check your permissions.",true);
    if(table==="courses"){s.courseId=null;s.tab="overview"}
    notify("Deleted "+label);await refresh();
  }
  async function move(table,id,dir){
    const item=table==="course_modules"?s.modules.find(m=>m.id===id):s.lessons.find(l=>l.id===id);
    if(!item)return;
    const siblings=(table==="course_modules"?related("modules"):related("lessons").filter(l=>l.module_id===item.module_id)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const ix=siblings.findIndex(x=>x.id===id),other=siblings[ix+dir];if(!other)return;
    const old=siblings.map((x,i)=>({id:x.id,sort_order:(i+1)*10}));
    const newOrder=[...siblings];[newOrder[ix],newOrder[ix+dir]]=[newOrder[ix+dir],newOrder[ix]];
    for(let i=0;i<newOrder.length;i++){const r=await db.from(table).update({sort_order:(i+1)*10}).eq("id",newOrder[i].id);if(r.error){warn(r.error);return}}
    await refresh();
  }
  return {start:async()=>{await refresh();route();render()}};
}
