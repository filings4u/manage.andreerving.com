/* Andre Erving learning studio - full-page visual lesson authoring */
export function createLessonStudio({root,course,modules,lesson=null,lessons=[],moduleId=null,kind="text",escape,notify,onSave,onCancel,onOpenLesson,onAddChapter,onAddLesson,onPublish,onUpload,onResourceUpload,onMediaUpload,onMediaURL}){
 const e=escape,$=id=>root.querySelector("#"+id),mode=lesson?.lesson_type||kind;
 const initial={kind:mode,content:String(lesson?.content_html||""),video:String(lesson?.video_url||""),resource:String(lesson?.resource_url||"")};
 let active=initial.kind,questions=[];
 const quizPrefix="AE_QUIZ_V1:";
 if(initial.content.startsWith(quizPrefix)){try{questions=JSON.parse(initial.content.slice(quizPrefix.length)).questions||[]}catch{}}
 if(!questions.length)questions=[{prompt:"",options:["","","",""],answer:0}];
 const icon={text:"▤",video:"▷",quiz:"☷",download:"↓"};
 const label={text:"Article",video:"Video",quiz:"Quiz",download:"Download"};

 const selectedModule=lesson?.module_id||moduleId||modules[0]?.id;
 const selectedModuleName=modules.find(m=>m.id===selectedModule)?.title||"Course section";
 const curriculum=modules.map(m=>{
   const nested=lessons.filter(l=>l.module_id===m.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
   return '<details class="ae-studio-chapter" '+(m.id===selectedModule?'open':'')+'><summary><span>'+e(m.title)+'<span class="ae-studio-chapter-count">'+nested.length+' lesson'+(nested.length===1?'':'s')+'</span></span></summary><div class="ae-studio-chapter-list">'+nested.map(l=>'<button class="ae-studio-lesson-link '+(l.id===lesson?.id?'active':'')+'" type="button" data-studio-lesson="'+e(l.id)+'" title="'+e(l.title)+'"><span class="ae-studio-grip" aria-hidden="true">⠿</span><span class="ae-studio-small-doc">▤</span><span>'+e(l.title)+'</span></button>').join('')+'</div></details>';
 }).join('');
 const layout='<div class="ae-studio-page"><header class="ae-studio-head"><div class="ae-studio-breadcrumb"><button type="button" id="ae-studio-back">‹ &nbsp; Courses &amp; Programs</button><span>/</span>'+e(course.title)+'<span>/</span>'+e(selectedModuleName)+'<span>/</span> Lesson Editor</div><div class="ae-studio-heading"><div class="ae-studio-title-line"><span class="ae-studio-docicon" aria-hidden="true">▤</span><div class="ae-studio-title-stack"><h1 id="ae-studio-head-title">'+e(lesson?.title||'New lesson')+' <span class="ae-studio-draft">'+(lesson?'Editing':'Draft')+'</span></h1><p>'+e(course.title)+' &nbsp; · &nbsp; '+e(selectedModuleName)+'</p></div></div><div><div class="ae-studio-actions"><button type="button" class="btn" id="ae-top-preview">◉ &nbsp; Preview</button><button type="button" class="btn" id="ae-studio-save">▣ &nbsp; Save lesson</button><button type="button" class="btn ae-studio-publish" id="ae-studio-publish">↑ &nbsp; Publish course</button></div><div class="ae-studio-statusline" id="ae-studio-status" role="status" aria-live="polite">Ready to edit</div></div></div></header>'+
 '<div class="ae-studio-grid"><aside class="ae-studio-card ae-studio-curriculum" aria-label="Course curriculum"><div class="ae-studio-panehead"><h2>Course Curriculum</h2><p>Browse chapters and edit lessons.</p></div><div class="ae-studio-chapters">'+curriculum+'</div><div class="ae-studio-sidebar-actions"><button type="button" id="ae-add-chapter">+ Add Chapter</button><button type="button" id="ae-add-lesson">+ Add Lesson</button></div></aside>'+
 '<main class="ae-studio-main"><section class="ae-studio-card ae-studio-editor-card"><div class="ae-studio-editor-heading"><h2>Lesson content</h2><span>Rich multimedia editor</span></div><input class="ae-studio-title" id="ae-title" aria-label="Lesson title" maxlength="200" value="'+e(lesson?.title||'')+'" placeholder="Give this lesson a title"><div id="ae-studio-content" class="ae-studio-content-shell"></div><div class="ae-studio-add-blocks"><strong>+ Add Content</strong><div class="ae-studio-types">'+[['text','▤','Article'],['image','▧','Image'],['audio','♫','Audio'],['video','▷','Video'],['quiz','☷','Quiz'],['download','↓','Download']].map(([k,symbol,title])=>'<button type="button" class="'+(k===active?'active':'')+'" data-content-action="'+k+'"><span>'+symbol+'</span> '+title+'</button>').join('')+'</div><p class="ae-studio-field-help">Text, images and audio live together in an Article. Video, Quiz and Download select a lesson type.</p></div></section></main>'+
 '<aside class="ae-studio-sidebar"><section class="ae-studio-card"><div class="ae-studio-panehead"><h3>Lesson Settings</h3><p>Configure how this lesson appears.</p></div><div class="ae-studio-sidebar-content"><button type="button" class="ae-studio-preview-card" id="ae-open-preview"><span class="glyph">▣</span><span><strong>Student Preview</strong><small>See this lesson before saving</small></span><span aria-hidden="true">›</span></button><label>Lesson Type<div class="ae-studio-readonly" id="ae-studio-current-type">'+e(label[active])+'</div></label><label>Course visibility<div class="ae-studio-readonly">'+e(course.status==='published'?'Published course':'Course is '+(course.status||'draft'))+'</div></label><label class="ae-studio-toggle">Allow lesson preview <input type="checkbox" id="ae-preview" '+(lesson?.is_preview?'checked':'')+'></label><label>Estimated duration (minutes)<input type="number" id="ae-duration" min="0" max="10000" value="'+e(lesson?.duration_minutes||0)+'"></label><label>Completion rules<div class="ae-studio-readonly">Managed in the learner experience</div></label><label>Lesson URL<div class="ae-studio-readonly" id="ae-studio-slug">'+e(String(lesson?.title||'new-lesson').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))+'</div></label><label>Section assignment<select id="ae-module">'+modules.map(m=>'<option value="'+e(m.id)+'" '+(m.id===selectedModule?'selected':'')+'>'+e(m.title)+'</option>').join('')+'</select></label></div><div class="ae-studio-panefoot">Changes save to the existing course and lesson records in Supabase.</div></section></aside></div></div>';
 root.innerHTML=layout;
 const safeHtml=v=>{
  const parsed=new DOMParser().parseFromString(String(v||""),"text/html");
  const allowed=new Set(["P","BR","H2","H3","H4","B","STRONG","I","EM","U","UL","OL","LI","BLOCKQUOTE","A","FIGURE","FIGCAPTION"]);
  const blocked=new Set(["SCRIPT","STYLE","SVG","IFRAME","OBJECT","IMG","AUDIO","VIDEO","SOURCE","FORM","INPUT","BUTTON"]);
  function clean(node){for(const child of [...node.childNodes]){
   if(child.nodeType===3)continue;
   if(child.nodeType!==1){child.remove();continue}
   if(!allowed.has(child.tagName)){if(blocked.has(child.tagName)){child.remove();continue}while(child.firstChild)node.insertBefore(child.firstChild,child);child.remove();clean(node);continue}
   if(child.tagName==="FIGURE"){
    const type=child.getAttribute("data-ae-media"),path=child.getAttribute("data-ae-path")||"";
    if(!["audio","image"].includes(type)||!/^[-a-zA-Z0-9_./:]+$/.test(path)||path.includes("..")||!(path.startsWith(course.id+"/")||path.startsWith("r2:"+course.id+"/lesson-media/"))){child.remove();continue}
    const label=child.getAttribute("data-ae-label")||"";
    child.replaceChildren();for(const attr of [...child.attributes])child.removeAttribute(attr.name);
    child.setAttribute("data-ae-media",type);child.setAttribute("data-ae-path",path);child.setAttribute("data-ae-label",label.slice(0,160));
    child.className="ae-media-block";child.contentEditable="false";
    child.textContent=(type==="audio"?"♫ Audio: ":"▧ Image: ")+label.slice(0,160);continue;
   }
   if(child.tagName==="A"){
    const href=child.getAttribute("href")||"";for(const attr of [...child.attributes])child.removeAttribute(attr.name);
    try{const url=new URL(href);if(["https:","mailto:"].includes(url.protocol)){child.setAttribute("href",url.href);child.setAttribute("rel","noopener noreferrer");child.setAttribute("target","_blank")}}catch{}
   }else for(const attr of [...child.attributes])child.removeAttribute(attr.name);
   clean(child);
  }}
  clean(parsed.body);return parsed.body.innerHTML;
 };
 const hydrateMedia=async(container)=>{
  const figures=[...container.querySelectorAll("figure[data-ae-media][data-ae-path]")];
  await Promise.all(figures.map(async figure=>{
   const type=figure.dataset.aeMedia,path=figure.dataset.aePath,label=figure.dataset.aeLabel||"Lesson media";
   figure.className="ae-media-block";figure.contentEditable="false";figure.textContent="Loading "+label+"…";
   try{const url=await onMediaURL(path);if(!figure.isConnected)return;
    const el=document.createElement(type==="audio"?"audio":"img");el.src=url;
    if(type==="audio"){el.controls=true;el.preload="metadata"}else{el.alt=label;el.loading="lazy"}
    figure.replaceChildren(el);const cap=document.createElement("figcaption");cap.textContent=label;figure.append(cap);
   }catch{figure.textContent="Unable to load "+label+". Check storage access."}
  }));
 };
 let article=active==="text"?safeHtml(initial.content):"",notes=active==="video"||active==="download"?safeHtml(initial.content):"";
 let uploadedUID=/^cfstream:[0-9a-f]{32}$/i.test(initial.video)?initial.video.slice(9):null;
 let file=null,resourceFile=null,resourceName="",blobURL=null,mediaBusy=false;
 const changed=()=>{$("ae-studio-status").textContent="Unsaved changes"};
 const clearURL=()=>{if(blobURL){URL.revokeObjectURL(blobURL);blobURL=null}};
 const capture=()=>{
  if(active==="text"&&$("ae-rich"))article=safeHtml($("ae-rich").innerHTML);
  if(["video","download"].includes(active)&&$("ae-notes"))notes=safeHtml($("ae-notes").innerHTML);
  if(active==="download"){const next=$("ae-resource")?.value;if(next)initial.resource=next;}
  if(active==="quiz")readQuiz();
 };
 function renderQuiz(){
  $("ae-studio-content").innerHTML='<section class="ae-studio-card"><div class="ae-studio-card-head"><div><span class="eyebrow">KNOWLEDGE CHECK</span><h2>Quiz questions</h2><p>Create multiple-choice questions and choose the correct answer for each one.</p></div><span class="ae-studio-count">'+questions.length+' questions</span></div><div id="ae-questions">'+questions.map((q,i)=>'<div class="ae-question" data-index="'+i+'"><div class="ae-question-heading"><strong>Question '+(i+1)+'</strong><button type="button" data-remove="'+i+'" aria-label="Delete question">Remove</button></div><input class="ae-question-prompt" data-prompt="'+i+'" maxlength="500" placeholder="Type your question" value="'+e(q.prompt)+'">'+q.options.map((opt,j)=>'<label class="ae-answer-row"><input type="radio" name="correct-'+i+'" value="'+j+'" '+(q.answer===j?"checked":"")+'><span>'+String.fromCharCode(65+j)+'</span><input data-answer="'+i+'" data-option="'+j+'" value="'+e(opt)+'" maxlength="250" placeholder="Answer option"></label>').join("")+'<small>Select the correct answer using the radio button.</small></div>').join("")+'</div><button type="button" id="ae-add-question" class="ae-add-block">+ Add another question</button></section>';
  $("ae-questions").addEventListener("input",changed);
  $("ae-add-question").onclick=()=>{readQuiz();questions.push({prompt:"",options:["","","",""],answer:0});renderQuiz();changed()};
  root.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{readQuiz();if(questions.length===1)return notify("Add another question before removing the last one.",true);questions.splice(Number(b.dataset.remove),1);renderQuiz();changed()});
 }
 function readQuiz(){
  questions.forEach((q,i)=>{const p=root.querySelector('[data-prompt="'+i+'"]');if(!p)return;q.prompt=p.value;
   root.querySelectorAll('[data-answer="'+i+'"]').forEach(x=>q.options[Number(x.dataset.option)]=x.value);
   const answer=root.querySelector('input[name="correct-'+i+'"]:checked');if(answer)q.answer=Number(answer.value)});
 }
 function render(){
  root.querySelectorAll("[data-kind]").forEach(btn=>btn.classList.toggle("active",btn.dataset.kind===active));
  if($("ae-studio-current-type"))$("ae-studio-current-type").textContent=label[active];
  // Remove a previous article toolbar when moving to non-article lesson types.
  if(active!=="text")root.querySelector(".ae-studio-editor-card > .ae-formatbar")?.remove();
  if(active==="text"){
   $("ae-studio-content").innerHTML='<section class="ae-studio-card"><span class="eyebrow">ARTICLE EDITOR</span><h2>Lesson content</h2><div class="ae-formatbar" role="toolbar"><button data-format="formatBlock" data-value="h2" type="button">H2</button><button data-format="formatBlock" data-value="h3" type="button">H3</button><button data-format="bold" type="button"><strong>B</strong></button><button data-format="italic" type="button"><em>I</em></button><button data-format="insertUnorderedList" type="button">• List</button><button data-format="insertOrderedList" type="button">1. List</button><button data-format="formatBlock" data-value="blockquote" type="button">Quote</button><span class="ae-toolbar-separator"></span><button type="button" id="ae-insert-image">▧ Add image</button><button type="button" id="ae-insert-audio">♫ Add audio</button><button type="button" id="ae-insert-link">↗ Link</button></div><div class="ae-lesson-help">Build a complete lesson with paragraphs, images and playable audio. Place your cursor where the media belongs.</div><input type="file" id="ae-image-file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden><input type="file" id="ae-audio-file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.wav,.ogg" hidden><div id="ae-rich" class="ae-rich" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Start writing your lesson...">'+article+'</div></section>';
   // Keep formatting controls in the persistent canvas header, above the lesson title.
   root.querySelector(".ae-studio-editor-card > .ae-formatbar")?.remove();
   const activeToolbar=$("ae-studio-content").querySelector(".ae-formatbar");
   if(activeToolbar)$("ae-title").before(activeToolbar);
   $("ae-rich").addEventListener("input",changed);
   root.querySelectorAll("[data-format]").forEach(b=>b.onclick=()=>{$("ae-rich").focus();document.execCommand(b.dataset.format,false,b.dataset.value||null);changed()});
   void hydrateMedia($("ae-rich"));
   let lastRange=null;
   $("ae-rich").addEventListener("mouseup",()=>{const sel=window.getSelection();if(sel.rangeCount&&$("ae-rich").contains(sel.anchorNode))lastRange=sel.getRangeAt(0).cloneRange()});
   $("ae-rich").addEventListener("keyup",()=>{const sel=window.getSelection();if(sel.rangeCount&&$("ae-rich").contains(sel.anchorNode))lastRange=sel.getRangeAt(0).cloneRange()});
   const insertFigure=(type,path,label)=>{
    const el=document.createElement("figure");el.className="ae-media-block";el.dataset.aeMedia=type;el.dataset.aePath=path;el.dataset.aeLabel=label;el.contentEditable="false";
    const sel=window.getSelection();if(lastRange&&$("ae-rich").contains(lastRange.commonAncestorContainer)){sel.removeAllRanges();sel.addRange(lastRange)}else{$("ae-rich").focus();sel.selectAllChildren($("ae-rich"));sel.collapseToEnd()}
    const range=sel.getRangeAt(0);range.deleteContents();range.insertNode(el);
    const para=document.createElement("p");para.append(document.createElement("br"));el.after(para);
    range.setStart(para,0);range.collapse(true);sel.removeAllRanges();sel.addRange(range);
    lastRange=null;changed();void hydrateMedia($("ae-rich"));
   };
   const upload=async(type,selected)=>{
    if(!selected||mediaBusy)return;
    const accepted=type==="image"?/\.(png|jpe?g|webp)$/i:/\.(mp3|m4a|wav|ogg)$/i;
    const max=type==="image"?10:50;
    if(!accepted.test(selected.name)||selected.size===0||selected.size>max*1048576)return notify("Choose a "+type+" file under "+max+" MB.",true);
    mediaBusy=true;$("ae-insert-image").disabled=$("ae-insert-audio").disabled=true;
    $("ae-studio-status").textContent="Uploading "+type+"…";
    try{const path=await onMediaUpload(selected,type);insertFigure(type,path,selected.name);$("ae-studio-status").textContent="Media uploaded · Save your lesson"}
    catch(err){notify(err.message||String(err),true);$("ae-studio-status").textContent="Upload failed"}
    finally{mediaBusy=false;$("ae-insert-image").disabled=$("ae-insert-audio").disabled=false}
   };
   $("ae-insert-image").onclick=()=>$("ae-image-file").click();
   $("ae-insert-audio").onclick=()=>$("ae-audio-file").click();
   $("ae-image-file").onchange=ev=>{void upload("image",ev.target.files?.[0]);ev.target.value=""};
   $("ae-audio-file").onchange=ev=>{void upload("audio",ev.target.files?.[0]);ev.target.value=""};
   $("ae-insert-link").onclick=()=>{const value=prompt("Enter an HTTPS URL");if(!value)return;try{const url=new URL(value);if(url.protocol!=="https:")throw Error();$("ae-rich").focus();document.execCommand("createLink",false,url.href);changed()}catch{notify("Use a valid HTTPS link.",true)}};

  }else if(active==="video"){
   $("ae-studio-content").innerHTML='<section class="ae-studio-card"><span class="eyebrow">CLOUDFLARE STREAM</span><h2>Upload your video</h2><p>Upload a video file from your computer. Cloudflare Stream handles encoding and delivery to students.</p><label class="ae-upload-drop" id="ae-drop"><span class="ae-upload-glyph">↑</span><strong>Choose video file or drop it here</strong><small>MP4, WebM or MOV · Maximum 200 MB</small><input type="file" id="ae-video-file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"></label><div id="ae-video-name">'+(uploadedUID?"Cloudflare Stream video already attached":"No video selected")+'</div><progress id="ae-upload-progress" max="100" value="0" hidden></progress><div class="ae-video-sample" id="ae-video-sample"></div></section><section class="ae-studio-card"><h2>Instructor notes</h2><div id="ae-notes" class="ae-rich ae-rich-short" contenteditable="true" role="textbox" data-placeholder="Add a lesson summary or transcript notes...">'+notes+'</div></section>';
   const input=$("ae-video-file"),drop=$("ae-drop");
   const setFile=f=>{if(!f)return;if(!["video/mp4","video/webm","video/quicktime"].includes(f.type)&&!/\.(mp4|webm|mov)$/i.test(f.name))return notify("Please select an MP4, WebM or MOV video.",true);if(f.size>200*1024*1024)return notify("The video must be smaller than 200 MB.",true);file=f;uploadedUID=null;clearURL();blobURL=URL.createObjectURL(file);$("ae-video-name").textContent=file.name+" · "+(file.size/1048576).toFixed(1)+" MB";$("ae-video-sample").innerHTML='<video controls preload="metadata" src="'+blobURL+'"></video>';changed()};
   input.onchange=()=>setFile(input.files?.[0]);
   drop.addEventListener("dragover",ev=>{ev.preventDefault();drop.classList.add("hover")});
   drop.addEventListener("dragleave",()=>drop.classList.remove("hover"));
   drop.addEventListener("drop",ev=>{ev.preventDefault();drop.classList.remove("hover");setFile(ev.dataTransfer?.files?.[0])});
   $("ae-notes").addEventListener("input",changed);
  }else if(active==="download"){
   $("ae-studio-content").innerHTML='<section class="ae-studio-card"><span class="eyebrow">DOWNLOAD RESOURCE</span><h2>Attach a course resource</h2><p>Upload a PDF, worksheet, guide, or checklist. Files are private and only accessible to authorized staff and enrolled students.</p><label class="ae-upload-drop"><span class="ae-upload-glyph">↓</span><strong>Choose a resource file</strong><small>PDF, Word, PowerPoint, Excel, TXT, PNG, JPG · 20 MB maximum</small><input id="ae-resource-file" type="file" accept=".pdf,.doc,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg"></label><div id="ae-resource-name" class="ae-resource-name">'+e(resourceName||(initial.resource.startsWith("lmsfile:")||initial.resource.startsWith("r2:")?"Uploaded course resource attached":initial.resource?"External resource attached":"No file selected"))+'</div><details class="ae-resource-advanced"><summary>Use an external HTTPS resource instead</summary><label class="ae-media-label">Resource URL<input type="url" id="ae-resource" value="'+e(initial.resource.startsWith("lmsfile:")||initial.resource.startsWith("r2:")?"":initial.resource)+'" placeholder="https://..."></label></details></section><section class="ae-studio-card"><h2>Student instructions</h2><div id="ae-notes" contenteditable="true" class="ae-rich ae-rich-short" role="textbox" data-placeholder="Explain this download...">'+notes+'</div></section>';
   $("ae-resource-file").addEventListener("change",ev=>{const selected=ev.target.files?.[0];if(!selected)return;const allowed=["application/pdf","text/plain","image/png","image/jpeg","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"];if(!allowed.includes(selected.type)||selected.size>20*1024*1024){ev.target.value="";return notify("Choose an accepted resource smaller than 20 MB.",true)}resourceFile=selected;resourceName=selected.name;$("ae-resource-name").textContent=selected.name+" · "+(selected.size/1048576).toFixed(1)+" MB";changed()});$("ae-resource").addEventListener("input",ev=>{if(ev.target.value){resourceFile=null;resourceName="";$("ae-resource-name").textContent="External resource selected"}changed()});$("ae-notes").addEventListener("input",changed);
  }else renderQuiz();
 }
 root.querySelectorAll("[data-content-action]").forEach(b=>b.onclick=()=>{
  const action=b.dataset.contentAction;
  if(["audio","image"].includes(action)){
   if(active!=="text"){capture();clearURL();active="text";render();changed()}
   $("ae-insert-"+action)?.click();return;
  }
  if(action===active)return;
  capture();clearURL();active=action;render();changed();
 });
 const exitStudio=()=>{if($("ae-studio-status").textContent==="Unsaved changes"&&!confirm("Discard unsaved lesson changes?"))return;clearURL();onCancel()};
 $("ae-studio-back").onclick=exitStudio;
 $("ae-add-chapter").onclick=()=>{if($("ae-studio-status").textContent==="Unsaved changes"&&!confirm("Discard unsaved lesson changes?"))return;clearURL();onAddChapter?.()};
 $("ae-add-lesson").onclick=()=>{if($("ae-studio-status").textContent==="Unsaved changes"&&!confirm("Discard unsaved lesson changes?"))return;clearURL();onAddLesson?.($("ae-module").value)};
 root.querySelectorAll("[data-studio-lesson]").forEach(btn=>btn.onclick=()=>{if(btn.dataset.studioLesson===lesson?.id)return;if($("ae-studio-status").textContent==="Unsaved changes"&&!confirm("Discard unsaved lesson changes?"))return;clearURL();onOpenLesson?.(btn.dataset.studioLesson)});
 $("ae-top-preview").onclick=()=>$("ae-open-preview").click();
 $("ae-studio-publish").onclick=()=>{if(!confirm("Publish this course? Save the lesson first to keep your latest changes."))return;onPublish?.()};

 $("ae-title").addEventListener("input",()=>{changed();const title=$("ae-title").value.trim()||"New lesson";$("ae-studio-head-title").firstChild.textContent=title+" ";$("ae-studio-slug").textContent=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")});

 $("ae-duration").addEventListener("input",changed);
 $("ae-preview").addEventListener("change",changed);
 $("ae-open-preview").onclick=()=>{capture();if(active==="quiz"){notify("Quiz preview is available in the student player after saving.");return}
   const body=active==="text"?safeHtml(article):active==="video"?(blobURL?'<video controls src="'+blobURL+'"></video>':"<p>Video will appear after Cloudflare is configured.</p>"):active==="download"?'<p>Attached resource: '+e(resourceName||initial.resource||"No resource selected")+'</p>'+notes:notes;
   const layer=document.createElement("div");layer.className="lms-confirm-backdrop";layer.innerHTML='<section class="ae-studio-preview" role="dialog" aria-modal="true"><div class="ae-studio-card-head"><h2>'+e($("ae-title").value||"Untitled lesson")+'</h2><button type="button" class="btn secondary" id="close-studio-preview">Close</button></div><div class="ae-preview-content">'+body+'</div></section>';document.body.append(layer);void hydrateMedia(layer);layer.querySelector("#close-studio-preview").onclick=()=>layer.remove()};
 $("ae-studio-save").onclick=async()=>{capture();const title=$("ae-title").value.trim();if(!title)return notify("Enter a lesson title.",true);
   if(mediaBusy)return notify("Finish uploading media before saving.",true);
   if(active==="quiz"&&questions.some(q=>!q.prompt.trim()||q.options.some(v=>!v.trim())))return notify("Complete each quiz question and answer before saving.",true);
   const validURL=v=>{if(!v)return null;try{const u=new URL(v);if(u.protocol!=="https:")throw Error();return u.href}catch{throw new Error("Resource URL must use HTTPS.")}};
   const button=$("ae-studio-save");button.disabled=true;$("ae-studio-status").textContent="Saving...";
   try{
     let videoURL=active==="video"?(uploadedUID?"cfstream:"+uploadedUID:initial.video):null;
     if(active==="video"&&file){
       const progress=$("ae-upload-progress");progress.hidden=false;
       uploadedUID=await onUpload(file,n=>{progress.value=n;$("ae-studio-status").textContent="Uploading video: "+n+"%"});
       videoURL="cfstream:"+uploadedUID;file=null;
     }
     let resourceURL=active==="download"?(initial.resource.startsWith("lmsfile:")||initial.resource.startsWith("r2:")?initial.resource:validURL(initial.resource)):null;
     if(active==="download"&&resourceFile){$("ae-studio-status").textContent="Uploading resource...";resourceURL=await onResourceUpload(resourceFile);resourceFile=null;initial.resource=resourceURL}
     const payload={title,course_id:course.id,module_id:$("ae-module").value,lesson_type:active,
       content_html:active==="quiz"?quizPrefix+JSON.stringify({version:1,questions}):active==="text"?article:notes,
       video_url:videoURL,resource_url:resourceURL,
       duration_minutes:Number($("ae-duration").value)||0,is_preview:$("ae-preview").checked};
     await onSave(payload);clearURL();if($("ae-studio-status"))$("ae-studio-status").textContent="Saved";
   }catch(ex){if($("ae-studio-status"))$("ae-studio-status").textContent="Could not save";notify(ex.message||String(ex),true)}
   finally{if(button.isConnected)button.disabled=false}
 };
 render();
}
