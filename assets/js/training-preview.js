import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const db=createClient('https://gnfyidajbectlppsekzj.supabase.co','sb_publishable_DGt4HrHAwWyMt-0Xtzlfog_F18RnOyf');
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),courseId=params.get('course');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const adminPreview=true;
const uid=v=>/^[0-9a-f-]{36}$/i.test(v||'');
const type=t=>({text:'Article',video:'Video',download:'Download',quiz:'Quiz'}[t]||'Lesson');
let user=null,modules=[],lessons=[],progress=[],position=0,working=false;
const done=id=>!!progress.find(p=>p.lesson_id===id&&p.completed);
function message(text){$('player-status').hidden=false;$('player-status').textContent=text}
function safeHTML(input){
 const doc=new DOMParser().parseFromString(String(input||''),'text/html'),allow=new Set(['P','BR','STRONG','B','EM','I','U','H2','H3','H4','UL','OL','LI','BLOCKQUOTE','A']);
 const clean=node=>{for(const child of [...node.childNodes]){if(child.nodeType===3)continue;if(child.nodeType!==1){child.remove();continue}
 if(!allow.has(child.tagName)){
   if(child.tagName==='FIGURE'){
     const kind=child.getAttribute('data-ae-media'),path=child.getAttribute('data-ae-path')||'',label=child.getAttribute('data-ae-label')||'Lesson media';
     if(!['audio','image'].includes(kind)||path.includes('..')||!/^[a-z0-9:/._-]+$/i.test(path)||
       !(path.startsWith(courseId+'/')||path.startsWith('r2:'+courseId+'/lesson-media/'))){child.remove();continue}
     for(const attr of [...child.attributes])child.removeAttribute(attr.name);
     child.className='ae-media-block';
     child.dataset.aeMedia=kind;child.dataset.aePath=path;child.dataset.aeLabel=label.slice(0,160);
     child.textContent='Loading '+label.slice(0,160)+'…';continue;
   }
   if(['SCRIPT','STYLE','SVG','IFRAME','OBJECT','IMG','FORM','VIDEO','AUDIO','SOURCE'].includes(child.tagName)){child.remove();continue}while(child.firstChild)node.insertBefore(child.firstChild,child);child.remove();clean(node);continue
 }
 const href=child.tagName==='A'?child.getAttribute('href'):null;for(const a of [...child.attributes])child.removeAttribute(a.name);
 if(href&&/^https:\/\//i.test(href)){child.setAttribute('href',href);child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer')}clean(child)}};
 clean(doc.body);return doc.body.innerHTML;
}
const r2Gateway="https://andre-lms-media.aerving1.workers.dev";
const playerMediaURLs=new Set();
async function getR2Media(ref){
 const {data:{session}}=await db.auth.getSession();
 if(!session?.access_token)throw Error("Sign in to view private media");
 const response=await fetch(r2Gateway+"/read",{method:"POST",
   headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
   body:JSON.stringify({courseId,path:ref})});
 if(!response.ok)throw Error("Unable to authorize private media");
 const objectURL=URL.createObjectURL(await response.blob());
 playerMediaURLs.add(objectURL);return objectURL;
}
async function hydrateLessonMedia(){
 const figures=[...$('lesson-body').querySelectorAll('figure[data-ae-media][data-ae-path]')];
 await Promise.all(figures.map(async figure=>{
  const path=figure.dataset.aePath,kind=figure.dataset.aeMedia,label=figure.dataset.aeLabel||'Lesson media';
  try{
   let src;
   if(path.startsWith("r2:"))src=await getR2Media(path);
   else {
    const {data,error}=await db.storage.from("andreerving-lms-resources").createSignedUrl(path,600);
    if(error||!data?.signedUrl)throw Error("Media unavailable");
    src=data.signedUrl;
   }
   if(!figure.isConnected)return;
   const media=document.createElement(kind==='audio'?'audio':'img');
   media.src=src;
   if(kind==='audio'){media.controls=true;media.preload='metadata';media.setAttribute('controlsList','nodownload noplaybackrate');media.addEventListener('contextmenu',event=>event.preventDefault())}
   else {media.alt=label;media.loading='lazy'}
   const caption=document.createElement('figcaption');caption.textContent=label;
   figure.replaceChildren(media,caption);
  }catch{if(figure.isConnected)figure.textContent="Unable to open "+label+". Please contact support."}
 }));
}
function clearPlayerMedia(){
 for(const url of playerMediaURLs)URL.revokeObjectURL(url);
 playerMediaURLs.clear();
}
function quizQuestions(value){try{if(!String(value||'').startsWith('AE_QUIZ_V1:'))return [];const data=JSON.parse(value.slice(11));return Array.isArray(data.questions)?data.questions:[]}catch{return []}}
function renderOutline(){
 const completed=lessons.filter(l=>done(l.id)).length,pct=lessons.length?Math.round(completed/lessons.length*100):0;
 $('course-progress-label').textContent=adminPreview?'Administrator preview':pct+'% complete';$('course-progress-bar').style.width=adminPreview?'0%':pct+'%';$('outline-progress').textContent=adminPreview?'Learner view · no progress is recorded':completed+' of '+lessons.length+' lessons completed';
 $('modules').innerHTML=modules.map(m=>'<section class="ae-outline-section"><h3>'+esc(m.title)+'</h3>'+lessons.map((l,i)=>l.module_id===m.id?'<button type="button" data-lesson-index="'+i+'" class="ae-outline-step '+(i===position?'active ':'')+(done(l.id)?'completed':'')+'" '+(i===position?'aria-current="step"':'')+'><span class="ae-step-state">'+(done(l.id)?'✓':i+1)+'</span><span class="ae-step-copy"><strong>'+esc(l.title)+'</strong><small>'+type(l.lesson_type)+(l.duration_minutes?' · '+l.duration_minutes+' min':'')+'</small></span></button>':'').join('')+'</section>').join('');
 $('modules').querySelectorAll('[data-lesson-index]').forEach(b=>b.onclick=()=>showLesson(Number(b.dataset.lessonIndex)));
 const view=$('lesson-view');
 let completion=$('ae-course-completion');
 if(view&&!completion){completion=document.createElement('div');completion.id='ae-course-completion';completion.className='ae-course-completion';view.querySelector('.ae-player-footer')?.before(completion)}
 if(completion){
   const finished=!adminPreview&&lessons.length>0&&completed===lessons.length;
   completion.hidden=!finished;
   completion.textContent=finished?'Congratulations! You have completed every lesson in this course. Your progress has been saved.':'';
 }

}
function renderQuiz(lesson){
 const qs=quizQuestions(lesson.content_html);
 if(!qs.length){$('lesson-body').innerHTML='<p class="ae-lesson-empty">Quiz questions have not been configured.</p>';$('lesson-complete').disabled=true;return}
 $('lesson-complete').disabled=!done(lesson.id);
 $('lesson-body').innerHTML='<h2>Knowledge check</h2><p>Select the correct answer for each question.</p><form id="quiz-form">'+qs.map((q,i)=>'<fieldset class="ae-quiz-question"><legend><strong>'+(i+1)+'. '+esc(q.prompt)+'</strong></legend>'+q.options.map((opt,j)=>'<label class="ae-quiz-option"><input type="radio" required name="question-'+i+'" value="'+j+'">'+esc(opt)+'</label>').join('')+'</fieldset>').join('')+'<button type="submit" class="ae-quiz-submit">Check answers</button><p class="ae-quiz-feedback" role="status" id="quiz-feedback"></p></form>';
 $('quiz-form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),correct=qs.filter((q,i)=>Number(fd.get('question-'+i))===Number(q.answer)).length,pass=correct===qs.length;
 $('quiz-feedback').textContent=correct+' of '+qs.length+' correct. '+(pass?'Well done! Mark this lesson complete.':'Review your answers and try again.');
 $('quiz-feedback').style.color=pass?'#237955':'#9c6b2d';$('lesson-complete').disabled=!pass&&!done(lesson.id)};
}
async function streamPlayback(lesson){
 const host=$('lesson-media');host.innerHTML='<div class="ae-media-loading">Loading secure Cloudflare Stream video…</div>';
 const {data,error}=await db.functions.invoke('andre-stream',{body:{mode:'playback',lessonId:lesson.id}});
 if(lessons[position]?.id!==lesson.id)return;
 if(error||!data?.success||!data?.token){host.innerHTML='<div class="ae-media-loading">Secure playback is unavailable. Please contact support.</div>';return}
 const iframe=document.createElement('iframe');iframe.src='https://iframe.videodelivery.net/'+encodeURIComponent(data.token);
 iframe.title=lesson.title;iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';iframe.allowFullscreen=true;iframe.referrerPolicy='no-referrer';host.replaceChildren(iframe);
}
async function renderDownload(lesson){
  const body=$("lesson-body");
  body.innerHTML="<h2>Course resource</h2>"+(safeHTML(lesson.content_html)||"")+"<p class='ae-lesson-empty'>Preparing your download…</p>";
  const ref=String(lesson.resource_url||"");
  if(lesson.allow_download!==true){body.innerHTML="<h2>Course resource</h2>"+(safeHTML(lesson.content_html)||"")+"<p class='ae-lesson-empty'>Downloads are disabled by the instructor.</p>";return}
  let href="";
  if(ref.startsWith("lmsfile:")){
    const path=ref.slice("lmsfile:".length);
    if(!path.startsWith(courseId+"/")){body.innerHTML="<p class='ae-lesson-empty'>This resource is unavailable for this course.</p>";return}
    const {data,error}=await db.storage.from("andreerving-lms-resources").createSignedUrl(path,120);
    if(lessons[position]?.id!==lesson.id)return;
    if(error||!data?.signedUrl){body.insertAdjacentHTML("beforeend","<p class='ae-lesson-empty'>Unable to authorize this download. Please refresh or contact support.</p>");return}
    href=data.signedUrl;
  }else if(ref.startsWith("r2:")){
    if(!ref.startsWith("r2:"+courseId+"/lesson-media/"))return;
    try{href=await getR2Media(ref)}catch{body.insertAdjacentHTML("beforeend","<p class='ae-lesson-empty'>Unable to authorize this download.</p>");return}
  }else if(/^https:\/\//i.test(ref)){href=ref}
  if(!href){body.insertAdjacentHTML("beforeend","<p class='ae-lesson-empty'>No downloadable resource has been attached yet.</p>");return}
  body.querySelector(".ae-lesson-empty")?.remove();
  const a=document.createElement("a");
  a.className="ae-lesson-download";
  a.href=href;
  a.target="_blank";
  a.rel="noopener noreferrer";
  a.textContent="↓ Open course resource";
  body.append(a);
}
async function showLesson(index){
 if(index<0||index>=lessons.length)return;
 clearPlayerMedia();position=index;const lesson=lessons[index];
 $('lesson-view').hidden=false;$('player-status').hidden=true;
 $('lesson-title').textContent=lesson.title;$('lesson-overline').textContent='LESSON '+(index+1)+' OF '+lessons.length+' · '+type(lesson.lesson_type).toUpperCase();
 $('lesson-subtitle').textContent=(modules.find(m=>m.id===lesson.module_id)?.title||'Course')+' · '+(lesson.duration_minutes||0)+' min';
 $('lesson-media').innerHTML='';$('lesson-body').innerHTML='';
 $('lesson-prev').disabled=index===0;$('lesson-next').disabled=index===lessons.length-1;
 $('lesson-complete').hidden=adminPreview;
 $('lesson-complete').disabled=adminPreview||done(lesson.id);$('lesson-complete').textContent=done(lesson.id)?'✓ Completed':'Mark complete ✓';
 if(lesson.lesson_type==='quiz')renderQuiz(lesson);
 else if(lesson.lesson_type==='download'){await renderDownload(lesson)}else $('lesson-body').innerHTML=safeHTML(lesson.content_html)||'<p class="ae-lesson-empty">Content for this lesson is being prepared.</p>';
 if(lesson.lesson_type==='text')void hydrateLessonMedia();
 if(lesson.lesson_type==='video'){
   if(/^cfstream:[a-f0-9]{32}$/i.test(lesson.video_url||''))await streamPlayback(lesson);
   else if(lesson.video_url&&/^https:\/\//i.test(lesson.video_url))$('lesson-media').innerHTML='<div class="ae-media-loading"><a href="'+esc(lesson.video_url)+'" target="_blank" rel="noopener noreferrer">Open legacy video ↗</a></div>';
   else $('lesson-media').innerHTML='<div class="ae-media-loading">Video has not been uploaded yet.</div>';
 }
 const url=new URL(location.href);url.searchParams.set('lesson',lesson.id);history.replaceState(null,'',url);
 renderOutline();
}
async function complete(){
 if(adminPreview)return;
 const lesson=lessons[position];if(!lesson||done(lesson.id)||working)return;working=true;$('lesson-complete').disabled=true;
 try{
   const prior=progress.find(p=>p.lesson_id===lesson.id),value={completed:true,completed_at:new Date().toISOString()};
   const q=prior?db.from('lesson_progress').update(value).eq('id',prior.id).select('id,lesson_id,completed'):
   db.from('lesson_progress').insert({...value,user_id:user.id,course_id:courseId,lesson_id:lesson.id}).select('id,lesson_id,completed');
   const {data,error}=await q;if(error||!data?.length)throw error||new Error('Saving progress was not permitted');
   if(prior)prior.completed=true;else progress.push(data[0]);$('lesson-complete').textContent='✓ Completed';renderOutline();
 }catch(e){message('Unable to save progress: '+e.message);$('lesson-complete').disabled=false}finally{working=false}
}
async function init(){
 const auth=await db.auth.getUser();user=auth.data.user;
 if(!user){message('Sign in through your customer portal to view this course.');return}
 if(!uid(courseId)){message('Choose a course from My Courses to start learning.');return}
 if(adminPreview){
   const {data:staff,error}=await db.from('admin_profiles').select('active,role').eq('id',user.id).maybeSingle();
   if(error||!staff?.active||!['admin','manager','editor'].includes(staff.role)){
     message('Only authorized administrators can open the student preview.');return
   }
 }else{
   const {data:enroll,error:enrollErr}=await db.from('course_enrollments').select('status,expires_at').eq('user_id',user.id).eq('course_id',courseId).in('status',['active','completed']).maybeSingle();
   if(enrollErr||!enroll){message('This course is not assigned to your account.');return}
   if(enroll.expires_at&&new Date(enroll.expires_at)<new Date()){message('Your course access has expired.');return}
 }
 const res=await Promise.all([
 db.from('courses').select('title').eq('id',courseId).single(),
 db.from('course_modules').select('id,title,description,sort_order').eq('course_id',courseId).order('sort_order'),
 db.from('course_lessons').select('id,module_id,title,lesson_type,content_html,video_url,resource_url,allow_download,duration_minutes,sort_order').eq('course_id',courseId).order('sort_order'),
 adminPreview?Promise.resolve({data:[],error:null}):db.from('lesson_progress').select('id,lesson_id,completed').eq('course_id',courseId).eq('user_id',user.id)
 ]);
 if(res.some(x=>x.error)){message('Unable to load this course. Please refresh.');return}
 $('course-title').textContent=res[0].data.title;modules=res[1].data||[];const rows=res[2].data||[];progress=res[3].data||[];
 lessons=modules.flatMap(m=>rows.filter(l=>l.module_id===m.id));
 // Return directly to the administrator lesson editor rather than a generic catalog.
 const requestedLesson=rows.find(l=>l.id===params.get("lesson"));
 const backRoute=requestedLesson
  ?"#/lms/edit/lesson/"+encodeURIComponent(requestedLesson.id)+"/"+encodeURIComponent(courseId)+"/"+encodeURIComponent(requestedLesson.module_id)
  :"#/lms/course/"+encodeURIComponent(courseId)+"/curriculum";
 document.querySelectorAll(".ae-player-back,.ae-player-exit").forEach(link=>{
   link.href="./"+backRoute;
 });
 if(!lessons.length){message('No lessons have been added to this course yet.');renderOutline();return}
 $('lesson-prev').onclick=()=>showLesson(position-1);$('lesson-next').onclick=()=>showLesson(position+1);$('lesson-complete').onclick=complete;
 const desired=params.get('lesson'),start=Math.max(0,lessons.findIndex(l=>l.id===desired));await showLesson(start);
}
init().catch(e=>message('Unable to load the course player: '+e.message));
