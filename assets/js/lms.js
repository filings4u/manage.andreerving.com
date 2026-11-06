import {createLessonStudio} from './lms-lesson-studio.js?v=media-controls-20261105';

/* Andre Erving LMS studio. Auth and authorization are supplied by the management app;
   Supabase RLS is the server-side enforcement for every operation. */
export function createLMS({db,root,notify,safe,isCurrent}){
  const s={courses:[],modules:[],lessons:[],enrollments:[],customers:[],courseId:null,tab:"overview",term:"",busy:false,editor:null,nextEditRoute:null,collapsed:new Set(),drag:null,reordering:false,previewLessonId:null,progressCache:new Map(),progressPending:new Set()};
  const esc=safe;
  const fmt=v=>v?new Date(v).toLocaleDateString():"—";
  const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
  const titleSlug=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
  const by=id=>root.querySelector("#"+id);
  const all=(sel)=>[...root.querySelectorAll(sel)];
  function warn(e){notify(e?.message||String(e),true)}
  async function list(table,cols="*",order="sort_order"){
    let q=db.from(table).select(cols);
    if(order)q=q.order(order,{ascending:order==="created_at"?false:true});
    const r=await q.limit(500);if(r.error)throw r.error;return r.data||[];
  }
  async function refresh(){try{
    const [a,b,c,d,e]=await Promise.all([
      list("courses"),list("course_modules"),list("course_lessons"),
      list("course_enrollments","id,user_id,course_id,status,enrolled_at,expires_at","enrolled_at"),
      list("customer_profiles","id,email,full_name","email")
    ]);
    if(!isCurrent())return;
    Object.assign(s,{courses:a,modules:b,lessons:c,enrollments:d,customers:e});
    if(s.courseId&&!a.some(x=>x.id===s.courseId)){s.courseId=null;s.tab="overview"}
    s.progressCache.clear();
    render();
  }catch(e){if(isCurrent())root.innerHTML='<div class="notice error">Unable to load LMS data: '+esc(e.message)+'</div>';}}
  const current=()=>s.courses.find(x=>x.id===s.courseId);
  const related=(key)=>s[key].filter(x=>x.course_id===s.courseId);
  const escAttr=esc;
  const sectionHeader=(head,sub)=>'<div class="lms-heading"><div><div class="eyebrow">ANDRE ERVING / LEARNING MANAGEMENT</div><h1>'+esc(head)+'</h1><p class="muted">'+esc(sub)+'</p></div></div>';
  const empty=(text)=>'<div class="lms-empty">'+esc(text)+'</div>';
  function render(){
    if(!isCurrent())return;
    if(s.editor){if(s.editor.isVisualLesson)return;renderEditor();return}if(!s.courseId)renderLibrary();else renderStudio();
  }
  function renderLibrary(){
    const matching=s.courses.filter(c=>(c.title+" "+c.category+" "+c.status).toLowerCase().includes(s.term.toLowerCase()));
    const published=s.courses.filter(c=>c.status==="published").length;
    root.innerHTML=sectionHeader("Courses & programs","Build and manage the learning experience, from course details to individual lessons.")+
      '<div class="lms-banner"><div><span class="eyebrow">COURSE MANAGEMENT</span><h2>Your training catalog</h2><p>Design curriculum, manage participants, and control how courses appear in the student portal.</p></div><button class="btn lms-create" id="lms-new">+ Create course</button></div>'+
      '<div class="lms-stats"><div><span>Total courses</span><strong>'+s.courses.length+'</strong></div><div><span>Published</span><strong>'+published+'</strong></div><div><span>Drafts</span><strong>'+s.courses.filter(c=>c.status==="draft").length+'</strong></div><div><span>Enrollments</span><strong>'+s.enrollments.length+'</strong></div></div>'+
      '<section class="panel lms-library"><div class="lms-library-top"><div><h2>All courses</h2><p class="muted">Select any course to edit its overview, curriculum, students and settings.</p></div><input id="lms-search" type="search" aria-label="Search courses" placeholder="Search courses…" value="'+escAttr(s.term)+'"></div>'+
      '<div class="lms-card-grid">'+matching.map(c=>{
        const modules=s.modules.filter(m=>m.course_id===c.id).length,lessons=s.lessons.filter(l=>l.course_id===c.id).length,students=s.enrollments.filter(e=>e.course_id===c.id&&e.status==="active").length;
        const image=c.featured_image_url&&/^https:\/\//i.test(c.featured_image_url)?'<img src="'+escAttr(c.featured_image_url)+'" alt="" loading="lazy">':'<div class="lms-cover-placeholder">AE<span>LEARNING</span></div>';
        return '<article class="lms-course-card"><div class="lms-cover">'+image+'</div><div class="lms-course-body"><div class="lms-card-meta"><span class="pill '+esc(c.status)+'">'+esc(c.status)+'</span><span>'+esc(c.category||"Course")+'</span></div><h3>'+esc(c.title)+'</h3><p>'+esc(c.short_description||"Build and deliver your program.")+'</p><div class="lms-card-details"><span>'+modules+' sections</span><span>'+lessons+' lessons</span><span>'+students+' students</span></div><div class="lms-course-bottom"><strong>'+money(c.price)+'</strong><button class="btn secondary" data-open-course="'+escAttr(c.id)+'">Manage course →</button></div></div></article>';
      }).join('')+'</div>'+(matching.length?'':empty("No courses match your search."))+'</section>';
    by("lms-new").onclick=()=>openCourseForm();
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
    const displayTabs=[["overview","Overview"],["curriculum","Content"],["students","Participants"],["settings","Settings"]];
    root.innerHTML='<div class="lms-builder-breadcrumb"><button type="button" id="lms-back">‹ &nbsp; Courses & Programs</button><span> / '+esc(c.title)+'</span></div>'+
      '<div class="lms-builder-top"><div class="lms-builder-identity"><span class="lms-builder-book" aria-hidden="true">▤</span><div><div class="lms-builder-title"><h1>'+esc(c.title)+'</h1><span class="lms-course-kind">Course</span></div><div class="lms-builder-sub">'+esc(c.category||"Learning program")+' <span>·</span> <span class="lms-status-text">'+esc(c.status)+'</span></div></div></div>'+
      '<div class="lms-builder-actions"><button type="button" class="lms-white-action" id="lms-preview">◉ &nbsp; Preview</button><button type="button" class="lms-white-action" id="lms-invite">♙ &nbsp; Invite Participants</button><div class="lms-add-container"><button type="button" class="lms-gold-action" id="lms-add-menu" aria-haspopup="true" aria-expanded="false">＋ &nbsp; Add &nbsp;⌄</button><div class="lms-add-dropdown" id="lms-add-dropdown" hidden><span class="lms-menu-heading">SECTION</span><button type="button" data-add-kind="section">▣ &nbsp; Add section</button><span class="lms-menu-heading">LESSONS</span><button type="button" data-add-kind="text">▤ &nbsp; Article</button><button type="button" data-add-kind="video">▷ &nbsp; Video</button><button type="button" data-add-kind="quiz">☷ &nbsp; Quiz</button><button type="button" data-add-kind="download">↓ &nbsp; Download</button></div></div></div></div>'+
      '<nav class="lms-builder-tabs" role="tablist" aria-label="Course management">'+displayTabs.map(([id,label])=>'<button type="button" role="tab" aria-selected="'+(s.tab===id)+'" class="'+(s.tab===id?'active':'')+'" data-tab="'+id+'">'+label+'</button>').join('')+'</nav>'+
      '<div id="lms-tab-body"></div>';
    by("lms-back").onclick=()=>{s.courseId=null;openRoute("courses");render()};
    by("lms-preview").onclick=()=>{location.assign("training-preview.html?course="+encodeURIComponent(s.courseId)+"&preview=admin")};
    by("lms-invite").onclick=()=>{s.tab="students";openRoute("course/"+s.courseId+"/students");render();openEnrollment()};
    const addButton=by("lms-add-menu"),drop=by("lms-add-dropdown");
    addButton.onclick=()=>{drop.hidden=!drop.hidden;addButton.setAttribute("aria-expanded",String(!drop.hidden))};
    drop.querySelectorAll("[data-add-kind]").forEach(b=>b.onclick=()=>{drop.hidden=true;quickAdd(b.dataset.addKind)});
    all("[data-tab]").forEach(b=>b.onclick=()=>{s.tab=b.dataset.tab;openRoute("course/"+s.courseId+"/"+s.tab);render()});
    const body=by("lms-tab-body");
    if(s.tab==="overview")body.innerHTML=renderOverview(c,modules,lessons,enrollments);
    if(s.tab==="curriculum")body.innerHTML=renderCurriculum(modules,lessons);
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
    return '<div class="lms-stats"><div><span>Course price</span><strong>'+money(c.price)+'</strong></div><div><span>Sections</span><strong>'+modules.length+'</strong></div><div><span>Lessons</span><strong>'+lessons.length+'</strong></div><div><span>Active students</span><strong>'+enrollments.filter(e=>e.status==="active").length+'</strong></div></div>'+
      '<div class="lms-two-col"><section class="panel"><div class="lms-panel-head"><h2>Course overview</h2><button class="btn secondary" data-edit-course>Edit</button></div><dl class="lms-facts"><div><dt>Title</dt><dd>'+esc(c.title)+'</dd></div><div><dt>Category</dt><dd>'+esc(c.category||"—")+'</dd></div><div><dt>Short description</dt><dd>'+esc(c.short_description||"Not added")+'</dd></div><div><dt>URL slug</dt><dd>'+esc(c.slug)+'</dd></div><div><dt>Access duration</dt><dd>'+(c.access_days?esc(c.access_days)+" days":"No limit")+'</dd></div></dl></section>'+
      '<section class="panel"><h2>Prepare your course</h2><div class="lms-checklist"><p>✓ Basic course record created</p><p>'+ (modules.length?'✓':'○')+' Add sections/modules</p><p>'+(lessons.length?'✓':'○')+' Add lesson content</p><p>'+(c.status==="published"?'✓':'○')+' Publish course</p></div><button class="btn" data-go-tab="curriculum">Build curriculum →</button></section></div>';
  }
  function renderCurriculum(modules,lessons){
    const ordered=[...modules].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    return '<section class="lms-builder-panel" id="lms-content-builder"><div class="lms-content-heading"><div><h2>Content</h2><p>Manage chapters here, or open the full visual LMS lesson editor to create and edit multimedia lessons.</p></div><div class="lms-content-actions"><button type="button" class="lms-gold-action" id="lms-open-visual-editor">✎ &nbsp; Open Visual LMS Editor</button><button type="button" class="lms-outline-add" id="lms-add-module">＋ Add section</button></div></div>'+
      '<div class="lms-section-stack" id="lms-section-stack">'+(ordered.length?ordered.map((m,i)=>{
        const own=lessons.filter(l=>l.module_id===m.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
        const folded=s.collapsed?.has(m.id);
        return '<article class="lms-builder-section" data-module="'+esc(m.id)+'" data-drop-module="'+esc(m.id)+'">'+
          '<header class="lms-builder-section-header"><span draggable="true" class="lms-drag-handle" data-drag-module="'+esc(m.id)+'" tabindex="0" title="Drag section to reorder" aria-label="Drag section">⠿</span>'+
          '<button type="button" class="lms-collapse" data-toggle-module="'+esc(m.id)+'" aria-expanded="'+(!folded)+'">'+(folded?'›':'⌄')+'</button>'+
          '<button type="button" class="lms-section-name" data-edit-module="'+esc(m.id)+'">'+esc(m.title)+'</button>'+
          '<span class="lms-lesson-count">'+own.length+' '+(own.length===1?'lesson':'lessons')+'</span>'+
          '<span class="lms-inline-spacer"></span><button type="button" class="lms-dots" data-toggle-section-menu="'+esc(m.id)+'" aria-label="Section options">···</button>'+
          '<div class="lms-section-popover" data-section-menu="'+esc(m.id)+'" hidden><button type="button" data-edit-module="'+esc(m.id)+'">Edit section</button><button type="button" data-duplicate-module="'+esc(m.id)+'">Duplicate section</button><button type="button" data-delete-module="'+esc(m.id)+'">Delete section</button></div>'+
          '<button type="button" class="lms-collapse-end" data-toggle-module="'+esc(m.id)+'" title="Expand or collapse">'+(folded?'⌄':'⌃')+'</button></header>'+
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
    return '<section class="panel lms-students-panel"><div class="lms-panel-head"><div><h2>Participants & learning progress</h2><p class="muted">Track lessons completed and manage access to this course.</p></div><button class="btn" id="lms-enroll">+ Enroll student</button></div>'+
      '<div class="lms-participant-stats"><div><span>Total participants</span><strong>'+enrollments.length+'</strong></div><div><span>Active access</span><strong>'+active+'</strong></div><div><span>Finished every lesson</span><strong>'+(finished===null?"—":finished)+'</strong></div></div>'+
      (enrollments.length?'<div class="tablewrap"><table><thead><tr><th>Student</th><th>Joined</th><th>Learning progress</th><th>Access</th><th>Expires</th><th>Action</th></tr></thead><tbody>'+
      enrollments.map(en=>{
        const person=s.customers.find(x=>x.id===en.user_id),completed=rows?.filter(p=>p.user_id===en.user_id&&p.completed).length||0;
        const percent=total?Math.min(100,Math.round(completed/total*100)):0;
        return '<tr><td><strong>'+esc(person?.full_name||person?.email||en.user_id)+'</strong><div class="muted">'+esc(person?.email||"")+'</div></td><td>'+fmt(en.enrolled_at)+'</td><td>'+(!rows?'<span class="muted">Loading progress…</span>':'<div class="lms-student-progress"><div class="lms-student-progress-label">'+completed+' / '+total+' lessons <strong>'+percent+'%</strong></div><div class="lms-student-meter"><span style="width:'+percent+'%"></span></div></div>')+'</td><td><span class="pill '+esc(en.status)+'">'+esc(en.status)+'</span></td><td>'+fmt(en.expires_at)+'</td><td><button class="btn secondary" data-enrollment="'+esc(en.id)+'">Manage</button></td></tr>';
      }).join('')+'</tbody></table></div>':empty("No students are enrolled in this course yet."))+'</section>';
  }
  function renderSettings(c,enrollments){
    return '<div class="lms-two-col"><section class="panel"><h2>Publishing & visibility</h2><p class="muted">Draft courses remain out of the public catalog. Published courses may be displayed publicly.</p><div class="lms-status-row"><span>Current status</span><span class="pill '+esc(c.status)+'">'+esc(c.status)+'</span></div><div class="row-actions">'+(c.status!=="published"?'<button class="btn" data-status="published">Publish course</button>':'<button class="btn secondary" data-status="draft">Unpublish course</button>')+'<button class="btn secondary" data-edit-course>Edit course settings</button></div></section>'+
    '<section class="panel"><h2>Danger zone</h2><p class="muted">Archive removes the course from the public catalog without deleting student history. Permanent deletion removes the course and its curriculum. Courses with enrollments cannot be deleted here.</p><div class="row-actions"><button class="btn secondary" data-status="archived">Archive course</button><button class="btn danger" id="lms-delete-course" '+(enrollments.length?'disabled title="Remove enrollments before deleting"':'')+'>Permanently delete</button></div>'+(enrollments.length?'<p class="notice">Deletion disabled: '+enrollments.length+' enrollment record(s) exist.</p>':'')+'</section></div>';
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

    by("lms-enroll")?.addEventListener("click",()=>openEnrollment());
    all("[data-enrollment]").forEach(b=>b.onclick=()=>openEnrollment(s.enrollments.find(e=>e.id===b.dataset.enrollment)));
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
    if(parts[1]==="course"&&s.courses.some(x=>x.id===parts[2])){s.courseId=parts[2];s.tab=["overview","curriculum","students","settings","preview"].includes(parts[3])?parts[3]:"curriculum"}
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
    const close=()=>{s.editor=null;openRoute(s.courseId?"course/"+s.courseId+"/"+s.tab:"courses");render()};
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
      try{await e.onSubmit(new FormData(form),form);s.editor=null;openRoute(s.courseId?"course/"+s.courseId+"/"+s.tab:"courses");await refresh()}
      catch(err){const n=by("lms-form-error");n.textContent=err.message||String(err);n.classList.remove("hidden");submit.disabled=false}
      finally{s.busy=false}
    };
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
      onPublish:async()=>{try{
        const {error}=await db.from("courses").update({status:"published"}).eq("id",course.id);
        if(error)throw error;notify("Course published. Save any lesson changes separately.");await refresh();
      }catch(error){notify(error.message||String(error),true)}},

      onCancel:()=>{s.editor=null;openRoute("course/"+course.id+"/curriculum");s.tab="curriculum";render()},
      onUpload:async(file,onProgress)=>{
        const {data,error}=await db.functions.invoke("andre-stream",{body:{
          mode:"init-upload",courseId:course.id,fileSize:file.size,fileName:file.name
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
        s.editor=null;s.tab="curriculum";openRoute("course/"+course.id+"/curriculum");
        notify(lesson?"Lesson updated":"Lesson created");
        await refresh();
      }
    });
    const select=root.querySelector("#ae-module");if(select)select.value=parentModule;
  }
  function openEnrollment(record=null){
    const c=current();if(!c)return;
    s.nextEditRoute="enrollment/"+(record?.id||"new")+"/"+c.id;
    const fields='<div class="form-grid">'+(record?'<p class="field wide">Customer: '+esc(s.customers.find(x=>x.id===record.user_id)?.email||record.user_id)+'</p>':select("Select customer","user_id",[["","Choose a customer"],...s.customers.map(p=>[p.id,p.full_name?p.full_name+" ("+p.email+")":p.email])],""))+
      select("Access status","status",[["active","Active"],["completed","Completed"],["cancelled","Cancelled"],["expired","Expired"]],record?.status||"active")+
      input("Expiration date (optional)","expires_at",record?.expires_at?.slice(0,10)||"","date")+'</div><p class="muted">Enrolling a student grants access. It does not create a payment or purchase record.</p>';
    modal(record?"Manage enrollment":"Enroll student",fields,async fd=>{
      const status=String(fd.get("status")||"active"),expires=String(fd.get("expires_at")||"");
      const data={status,expires_at:expires?new Date(expires+"T23:59:59Z").toISOString():null};
      if(!record){data.user_id=String(fd.get("user_id")||"");data.course_id=c.id;if(!s.customers.some(p=>p.id===data.user_id))throw Error("Select a valid customer");if(s.enrollments.some(e=>e.course_id===c.id&&e.user_id===data.user_id))throw Error("Enrollment exists. Manage it using the existing student row.");}
      await save("course_enrollments",data,record?.id);notify(record?"Enrollment updated":"Student enrolled");
    });
  }
  async function changeStatus(status){
    const c=current();if(!c)return;
    if(status==="published"&&!related("modules").length)return notify("Add a section before publishing.",true);
    if(status==="published"&&!related("lessons").length)return notify("Add at least one lesson before publishing.",true);
    if(status==="published"&&!await brandedConfirm("Publish course","Publish "+c.title+"? The course will be available to the public catalog."))return;
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
