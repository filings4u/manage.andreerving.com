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
     const credit=kind==='image'?(child.getAttribute('data-ae-credit')||'').trim().slice(0,240):'';
     if(!['audio','image'].includes(kind)||path.includes('..')||!/^[a-z0-9:/._-]+$/i.test(path)||
       !(path.startsWith(courseId+'/')||path.startsWith('r2:'+courseId+'/lesson-media/'))){child.remove();continue}
     for(const attr of [...child.attributes])child.removeAttribute(attr.name);
     child.className='ae-media-block';
     child.dataset.aeMedia=kind;child.dataset.aePath=path;child.dataset.aeLabel=label.slice(0,160);
     if(credit)child.dataset.aeCredit=credit;
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
   figure.replaceChildren(media);
   const captionText=kind==='image'?(figure.dataset.aeCredit||'').trim():label;
   if(captionText){const caption=document.createElement('figcaption');caption.textContent=kind==='image'?'Image credit: '+captionText:captionText;figure.append(caption)}
  }catch{if(figure.isConnected)figure.textContent="Unable to open "+label+". Please contact support."}
 }));
}
function clearPlayerMedia(){
 for(const url of playerMediaURLs)URL.revokeObjectURL(url);
 playerMediaURLs.clear();
}
function quizQuestions(value){try{if(!String(value||'').startsWith('AE_QUIZ_V1:'))return [];const data=JSON.parse(value.slice(11));return Array.isArray(data.questions)?data.questions:[]}catch{return []}}
const collapsedModules=new Set();
function renderOutline(){
 const completed=lessons.filter(l=>done(l.id)).length,pct=lessons.length?Math.round(completed/lessons.length*100):0;
 $('course-progress-label').textContent=adminPreview?'Administrator preview':pct+'% complete';
 $('course-progress-bar').style.width=adminPreview?'0%':pct+'%';
 $('outline-progress').textContent=adminPreview?'Learner view · progress is not recorded':completed+' of '+lessons.length+' lessons completed';
 $('rc-sidebar-course').textContent=$('course-title').textContent;
 $('rc-sidebar-count').textContent=modules.length+' Modules · '+lessons.length+' Lessons';
 $('rc-sidebar-progress').style.width=adminPreview?'0%':pct+'%';
 $('rc-sidebar-percent').textContent=adminPreview?'Administrator preview':pct+'% complete';
 $('rc-lesson-progress-bar').style.width=adminPreview?'0%':pct+'%';
 $('rc-lesson-progress-text').textContent=adminPreview?'Preview mode — no progress recorded':pct+'% complete · '+completed+' of '+lessons.length+' lessons';
 $('modules').innerHTML=modules.map((m,mi)=>{
   const indices=lessons.map((l,i)=>l.module_id===m.id?i:-1).filter(i=>i>=0);
   const current=indices.includes(position);
   const collapsed=collapsedModules.has(m.id);
   return '<section class="ae-outline-section"><button type="button" class="rc-module-toggle" data-module-toggle="'+esc(m.id)+'" aria-expanded="'+(!collapsed)+'"><span class="rc-module-index">'+String(mi+1).padStart(2,'0')+'</span><span class="rc-module-name">'+esc(m.title)+'<small style="display:block;font-weight:400;color:#b6cae0">'+indices.filter(i=>done(lessons[i].id)).length+'/'+indices.length+' lessons</small></span><span class="rc-module-caret">'+(collapsed?'⌄':'⌃')+'</span></button><div class="rc-module-lessons" '+(collapsed?'hidden':'')+'>'+indices.map((i)=>{
     const l=lessons[i],completed=done(l.id);
     return '<button type="button" data-lesson-index="'+i+'" class="ae-outline-step '+(i===position?'active ':'')+(completed?'completed':'')+'" '+(i===position?'aria-current="step"':'')+'><span class="ae-step-state">'+(completed?'✓':(l.lesson_type==='quiz'?'?':String((l.sort_order||0)/10)))+'</span><span class="ae-step-copy"><strong>'+esc(l.title)+'</strong><small>'+type(l.lesson_type)+(l.duration_minutes?' · '+l.duration_minutes+' min':'')+'</small></span></button>';
   }).join('')+'</div></section>';
 }).join('');
 $('modules').querySelectorAll('[data-lesson-index]').forEach(b=>b.onclick=()=>showLesson(Number(b.dataset.lessonIndex)));
 $('modules').querySelectorAll('[data-module-toggle]').forEach(b=>b.onclick=()=>{const id=b.dataset.moduleToggle;if(collapsedModules.has(id))collapsedModules.delete(id);else collapsedModules.add(id);renderOutline()});
 const view=$('lesson-view');let completion=$('ae-course-completion');
 if(view&&!completion){completion=document.createElement('div');completion.id='ae-course-completion';completion.className='ae-course-completion';view.querySelector('.ae-player-footer')?.before(completion)}
 if(completion){const finished=!adminPreview&&lessons.length>0&&completed===lessons.length;completion.hidden=!finished;completion.textContent=finished?'Congratulations! You have completed every lesson in this course. Your progress has been saved.':''}
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
 const body=$("lesson-body"),ref=String(lesson.resource_url||"");
 body.innerHTML="<h2>Course resource</h2>"+(safeHTML(lesson.content_html)||"");
 if(!ref){body.insertAdjacentHTML("beforeend","<p class='ae-lesson-empty'>No resource attached.</p>");return}
 if(lesson.allow_download!==true){
  body.insertAdjacentHTML("beforeend","<p class='ae-lesson-empty'>Downloads are disabled by your instructor.</p>");return;
 }
 const button=document.createElement("button");button.type="button";button.className="ae-lesson-download";
 button.textContent="↓ Download course document";body.append(button);
 button.onclick=async()=>{
  button.disabled=true;button.textContent="Preparing download…";
  try{
   if(ref.startsWith("r2:")){
    const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)throw Error("Session expired");
    const response=await fetch(r2Gateway+"/download",{method:"POST",
      headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
      body:JSON.stringify({courseId,lessonId:lesson.id,path:ref})});
    if(!response.ok)throw Error("Download not authorized");
    const url=URL.createObjectURL(await response.blob());
    const link=document.createElement("a");link.href=url;link.download="course-resource";document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
   }else if(ref.startsWith("lmsfile:")){
    const filePath=ref.slice(8);if(!filePath.startsWith(courseId+"/")||filePath.includes(".."))throw Error("Invalid file");
    const {data,error}=await db.storage.from("andreerving-lms-resources").createSignedUrl(filePath,60,{download:true});
    if(error||!data?.signedUrl)throw Error("Download unavailable");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
   }else if(/^https:\/\//i.test(ref)){window.open(ref,"_blank","noopener,noreferrer")}
   else throw Error("Invalid resource reference");
  }catch(error){message(error?.message||"Unable to download the document")}
  finally{if(button.isConnected){button.disabled=false;button.textContent="↓ Download course document"}}
 };
}
function setClassroomTab(tab){
 const found=['guide','audio','transcript','takeaways','resources'].includes(tab)?tab:'guide';
 document.querySelectorAll('[data-rc-tab]').forEach(b=>{const active=b.dataset.rcTab===found;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
 document.querySelectorAll('[data-rc-pane]').forEach(p=>p.hidden=p.dataset.rcPane!==found);
}
function lessonText(lesson){
 const doc=new DOMParser().parseFromString(lesson.content_html||'','text/html');
 doc.querySelectorAll('figure,script,style').forEach(n=>n.remove());
 return doc.body.innerHTML;
}
function lessonFigures(lesson){
 const doc=new DOMParser().parseFromString(lesson.content_html||'','text/html');
 return [...doc.querySelectorAll('figure[data-ae-media][data-ae-path]')].map(f=>({kind:f.getAttribute('data-ae-media'),path:f.getAttribute('data-ae-path'),label:f.getAttribute('data-ae-label')||'Course media'}));
}
function addAudioPlayer(host,url){
 host.replaceChildren();
 const player=document.createElement('audio');player.controls=true;player.preload='metadata';player.src=url;player.className='rc-audio-player';player.setAttribute('controlsList','nodownload noplaybackrate');player.addEventListener('contextmenu',e=>e.preventDefault());host.append(player);
}
async function enhanceClassroom(lesson){
 const currentId=lesson.id,media=lessonFigures(lesson),image=media.find(f=>f.kind==='image'),audio=media.find(f=>f.kind==='audio');
 const module=modules.find(m=>m.id===lesson.module_id);
 const intro=lessonText(lesson);
 const parsed=new DOMParser().parseFromString(intro,'text/html');
 const paragraphs=[...parsed.querySelectorAll('p')].map(p=>p.textContent.trim()).filter(Boolean);
 const headings=[...parsed.querySelectorAll('h2,h3')].map(e=>e.textContent.trim()).filter(Boolean);
 $('rc-breadcrumb').textContent=($('course-title').textContent||'Course')+'  ›  '+(module?.title||'Module')+'  ›  '+lesson.title;
 $('lesson-description').textContent=lesson.lesson_type==='quiz'?'Test your knowledge of this module.':(paragraphs[0]||module?.description||'');
 $('rc-transcript-pane').innerHTML='<h2>Written lesson text</h2>'+safeHTML(intro);
 $('rc-takeaways-pane').innerHTML='<h2>Key takeaways</h2><ul class="rc-learning-points">'+(headings.length?headings.slice(0,5):['Lesson overview','Practical application','Knowledge check']).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
 const resources=lesson.resource_url&&lesson.allow_download?'<p>Your instructor has attached a downloadable resource to this lesson. Open the Resources section of the lesson guide to access it.</p>':'<p>No downloadable files are attached to this lesson. Use the written lesson and practice assignment as your study resources.</p>';
 const extra=module?.title?.includes('Compliance')?'<p><a href="https://www.fmcsa.dot.gov/registration/broker-registration" target="_blank" rel="noopener noreferrer">FMCSA Broker Registration — official reference ↗</a></p>':'';
 $('rc-resources-pane').innerHTML='<h2>Lesson resources</h2>'+resources+extra;
 $('rc-resource-list').innerHTML='<button type="button" class="rc-resource-row" data-rc-resource="guide">▤ &nbsp; Written lesson guide →</button>'+ (audio?'<button type="button" class="rc-resource-row" data-rc-resource="audio">♫ &nbsp; Audio narration →</button>':'') +(lesson.resource_url&&lesson.allow_download?'<button type="button" class="rc-resource-row" data-rc-resource="resources">↓ &nbsp; Instructor resource →</button>':'');
 $('rc-resource-list').querySelectorAll('[data-rc-resource]').forEach(b=>b.onclick=()=>{setClassroomTab(b.dataset.rcResource);$('rc-tab-nav').scrollIntoView({behavior:'smooth',block:'start'})});
 $('rc-audio-pane').innerHTML='<h2>Listen to this lesson</h2><p>Audio narration of the lesson overview and example.</p><div id="rc-audio-tab-slot"></div>';
 const railAudio=$('rc-audio-slot');railAudio.innerHTML='<p class="rc-muted">No audio is attached to this lesson.</p>';
 const next=lessons[position+1];
 $('rc-next-lesson').textContent=next?next.title+' →':'Course completed';
 $('rc-next-lesson').disabled=!next;
 const quiz=lessons.find(l=>l.module_id===lesson.module_id&&l.lesson_type==='quiz');
 $('rc-quiz-description').textContent=quiz?'Answer '+quizQuestions(quiz.content_html).length+' questions in this module knowledge check.':'No module quiz is assigned.';
 $('rc-start-quiz').disabled=!quiz;
 $('rc-start-quiz').textContent=quiz&&quiz.id===lesson.id?'Current knowledge check':'Go to Module Quiz';
 $('rc-start-quiz').onclick=()=>{if(quiz)showLesson(lessons.findIndex(l=>l.id===quiz.id))};
 $('rc-next-lesson').onclick=()=>{if(next)showLesson(position+1)};
 if(lesson.lesson_type==='quiz'){$('rc-tab-nav').hidden=true;$('lesson-media').innerHTML='';setClassroomTab('guide');return}
 $('rc-tab-nav').hidden=false;setClassroomTab('guide');
 if(image){
   try{
     const url=image.path.startsWith('r2:')?await getR2Media(image.path):(await db.storage.from('andreerving-lms-resources').createSignedUrl(image.path,600)).data?.signedUrl;
     if(lessons[position]?.id!==currentId||!url)return;
     const img=document.createElement('img');img.className='rc-visual';img.src=url;img.alt=lesson.title+' educational illustration';
     if(lesson.lesson_type!=='video')$('lesson-media').replaceChildren(img);
   }catch(e){if(lessons[position]?.id===currentId&&lesson.lesson_type!=='video')$('lesson-media').innerHTML=''}
 }
 if(audio){
   try{
     const url=audio.path.startsWith('r2:')?await getR2Media(audio.path):(await db.storage.from('andreerving-lms-resources').createSignedUrl(audio.path,600)).data?.signedUrl;
     if(lessons[position]?.id!==currentId||!url)return;
     addAudioPlayer($('rc-audio-slot'),url);
     addAudioPlayer($('rc-audio-tab-slot'),url);
   }catch(e){if(lessons[position]?.id===currentId)railAudio.textContent='Audio is temporarily unavailable.'}
 }
}
async function showLesson(index){
 if(index<0||index>=lessons.length)return;
 clearPlayerMedia();position=index;const lesson=lessons[index];modules.forEach(m=>collapsedModules.add(m.id));collapsedModules.delete(lesson.module_id);
 $('lesson-view').hidden=false;$('player-status').hidden=true;
 $('lesson-title').textContent=lesson.title;$('lesson-overline').textContent='LESSON '+(index+1)+' OF '+lessons.length+' · '+type(lesson.lesson_type).toUpperCase();
 $('lesson-subtitle').textContent=(modules.find(m=>m.id===lesson.module_id)?.title||'Course')+' · '+(lesson.duration_minutes||0)+' min';
 $('lesson-media').innerHTML='';$('lesson-body').innerHTML='';
 $('lesson-prev').disabled=index===0;$('lesson-next').disabled=index===lessons.length-1;
 $('lesson-complete').hidden=adminPreview;
 $('lesson-complete').disabled=adminPreview||done(lesson.id);$('lesson-complete').textContent=done(lesson.id)?'✓ Completed':'Mark complete ✓';
 if(lesson.lesson_type==='quiz')renderQuiz(lesson);
 else if(lesson.lesson_type==='download'){await renderDownload(lesson)}else $('lesson-body').innerHTML=safeHTML(lesson.content_html)||'<p class="ae-lesson-empty">Lesson materials are unavailable.</p>';
 if(lesson.lesson_type==='text')void enhanceClassroom(lesson); else if(lesson.lesson_type==='quiz')void enhanceClassroom(lesson); else void enhanceClassroom(lesson);
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
 $('lesson-prev').onclick=()=>showLesson(position-1);$('lesson-next').onclick=()=>showLesson(position+1);$('lesson-complete').onclick=complete;document.querySelectorAll('[data-rc-tab]').forEach(b=>b.onclick=()=>setClassroomTab(b.dataset.rcTab));document.querySelectorAll('.rc-global-nav a[href="#rc-resources-pane"]').forEach(a=>a.onclick=e=>{e.preventDefault();setClassroomTab('resources');$('rc-tab-nav').scrollIntoView({behavior:'smooth',block:'start'})});
 const desired=params.get('lesson'),start=Math.max(0,lessons.findIndex(l=>l.id===desired));await showLesson(start);
}
init().catch(e=>message('Unable to load the course player: '+e.message));
