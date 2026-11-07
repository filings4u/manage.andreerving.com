// Andre Erving Blog Studio, connected to published blog_posts records in Supabase.
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slugify=s=>String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
const humanDate=d=>d?new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Not published";
const allowedTags=new Set(["P","BR","H2","H3","H4","STRONG","B","EM","I","U","S","UL","OL","LI","BLOCKQUOTE","A","IMG","HR","DIV","SPAN","FIGURE","FIGCAPTION","PRE","CODE","TABLE","TBODY","THEAD","TR","TD","TH"]);
const safeURL=(s,images=false)=>{try{const u=new URL(s,location.origin);return (["https:","http:"].includes(u.protocol)||!images&&u.protocol==="mailto:")?u.href:null}catch{return null}};
export function cleanBlogHTML(input){
 const parsed=new DOMParser().parseFromString("<div>"+String(input||"")+"</div>","text/html");
 const holder=parsed.body.firstElementChild;
 function clean(node){
  for(const child of [...node.childNodes]){
   if(child.nodeType===8){child.remove();continue}
   if(child.nodeType===3)continue;
   if(child.nodeType!==1){child.remove();continue}
   if(!allowedTags.has(child.tagName)){child.replaceWith(...[...child.childNodes]);continue}
   [...child.attributes].forEach(a=>child.removeAttribute(a.name));
   if(child.tagName==="IMG"){
    const src=safeURL(child.getAttribute("src")||"",true);
    if(!src){child.remove();continue}
    child.setAttribute("src",src);child.setAttribute("loading","lazy");
    child.setAttribute("alt",String(child.getAttribute("alt")||"").slice(0,200));
   }
   if(child.tagName==="A"){
    const href=safeURL(child.getAttribute("href")||"");
    if(href){child.setAttribute("href",href);child.setAttribute("rel","noopener noreferrer")}
   }
   clean(child);
  }
 }
 // Preserve safe URLs and image descriptions before stripping other attributes.
 function walk(node){
  for(const child of [...node.childNodes]){
   if(child.nodeType===8){child.remove();continue}
   if(child.nodeType===3)continue;
   if(child.nodeType!==1){child.remove();continue}
   if(!allowedTags.has(child.tagName)){child.replaceWith(...[...child.childNodes]);walk(node);continue}
   const url=child.getAttribute(child.tagName==="IMG"?"src":"href");
   const alt=child.getAttribute("alt");
   [...child.attributes].forEach(a=>child.removeAttribute(a.name));
   if(child.tagName==="IMG"){
    const u=safeURL(url||"",true);if(!u){child.remove();continue}
    child.setAttribute("src",u);child.setAttribute("alt",String(alt||"Blog image").slice(0,200));child.setAttribute("loading","lazy");
   }else if(child.tagName==="A"){
    const u=safeURL(url||"");
    if(u){child.setAttribute("href",u);child.setAttribute("rel","noopener noreferrer")}
   }
   walk(child);
  }
 }
 walk(holder);return holder.innerHTML;
}
export function createBlogStudio({db,root,notify,isCurrent,onExit}){
 let selected=null,posts=[],draftTimer=null,dirty=false,editor=null,saveBusy=false,preview=false;
 const active=()=>isCurrent("blog_posts");
 const q=selector=>root.querySelector(selector);
 const qa=selector=>[...root.querySelectorAll(selector)];
 function banner(title,subtitle){return '<header class="blog-studio-head"><div><p class="blog-studio-eyebrow">ANDRE ERVING / BLOG MANAGEMENT</p><h1>'+E(title)+'</h1><p>'+E(subtitle)+'</p></div><a class="blog-studio-view-link" href="https://andreerving.com/blog.html" target="_blank" rel="noopener noreferrer">View live blog ↗</a></header>'}
 async function list(){
  selected=null;preview=false;dirty=false;
  const response=await db.from("blog_posts").select("*").order("updated_at",{ascending:false}).limit(250);
  if(!active())return;
  if(response.error){root.innerHTML=banner("Blog Studio","Manage articles and publishing.")+'<p role="alert">'+E(response.error.message)+'</p>';return}
  posts=response.data||[];
  const published=posts.filter(x=>x.status==="published").length,importing=posts.filter(x=>x.migration_status==="pending_import").length;
  root.innerHTML=banner("Blog Studio","Write, import, organize and publish articles directly to andreerving.com.")+
    '<div class="blog-studio-overview"><div><span>All posts</span><strong>'+posts.length+'</strong></div><div><span>Published</span><strong>'+published+'</strong></div><div><span>Awaiting original content</span><strong>'+importing+'</strong></div></div>'+
    '<section class="blog-studio-list panel"><header class="blog-studio-list-head"><div><h2>Articles</h2><p>Drafts remain private until published.</p></div><div class="blog-studio-list-actions"><button id="blog-import-help" class="btn secondary">Import from Wix</button><button id="blog-new" class="btn">+ New article</button></div></header>'+
    '<div class="blog-studio-filters"><input type="search" id="blog-search" aria-label="Search blog articles" placeholder="Search articles..."><select id="blog-filter" aria-label="Filter by status"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option><option value="pending_import">Awaiting import</option><option value="archived">Archived</option></select></div>'+
    '<div id="blog-results"></div></section>';
  function draw(){
   const query=q("#blog-search").value.toLowerCase(),state=q("#blog-filter").value;
   const subset=posts.filter(p=>(p.title+" "+p.excerpt+" "+p.category).toLowerCase().includes(query)&&(state==="all"||p.status===state||state==="pending_import"&&p.migration_status==="pending_import"));
   q("#blog-results").innerHTML=subset.map(p=>'<button class="blog-studio-row" data-blog-id="'+E(p.id)+'"><span class="blog-studio-row-title">'+E(p.title)+'<small>'+E(p.category||"Insights")+' · Last updated '+humanDate(p.updated_at)+'</small></span><span class="blog-studio-status '+E(p.migration_status==="pending_import"?"pending":p.status)+'">'+E(p.migration_status==="pending_import"?"Awaiting import":p.status)+'</span><span class="blog-studio-row-arrow">Edit →</span></button>').join("")||'<p class="blog-studio-empty">No articles match your search.</p>';
   qa("[data-blog-id]").forEach(b=>b.onclick=()=>open(posts.find(p=>p.id===b.dataset.blogId)));
  }
  q("#blog-search").oninput=draw;q("#blog-filter").onchange=draw;draw();
  q("#blog-new").onclick=()=>open(null);
  q("#blog-import-help").onclick=()=>showImport();
 }
 function showImport(){
  const overlay=document.createElement("div");overlay.className="blog-studio-overlay";
  overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="import-title" class="blog-studio-dialog"><button type="button" class="blog-studio-close" aria-label="Close">×</button><p class="blog-studio-eyebrow">IMPORT</p><h2 id="import-title">Import articles from Wix</h2><p>The 20 previously discovered posts have already been created as draft records. Their original article bodies have not been retrieved.</p><p>For each article, open its record, paste the original Wix content into the editor, and save. Posts are never published automatically.</p><p>If you export Wix posts as a CSV, you can import titles, excerpts, content and published dates into matching existing posts without duplicates.</p><label>Wix CSV file<input id="blog-csv" type="file" accept=".csv,text/csv"></label><div id="blog-import-status" role="status"></div><button id="blog-csv-import" class="btn">Import CSV as drafts</button></section>';
  document.body.append(overlay);
  overlay.querySelector(".blog-studio-close").onclick=()=>overlay.remove();
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  overlay.querySelector("#blog-csv-import").onclick=async()=>{
   const file=overlay.querySelector("#blog-csv").files?.[0];if(!file)return overlay.querySelector("#blog-import-status").textContent="Select a CSV export.";
   if(file.size>4*1024*1024)return overlay.querySelector("#blog-import-status").textContent="CSV must be under 4 MB.";
   const button=overlay.querySelector("#blog-csv-import");button.disabled=true;
   try{
    const records=parseCSV(await file.text());let imported=0,skipped=0;
    for(const item of records.slice(0,300)){
     const keyMap=Object.fromEntries(Object.entries(item).map(([k,v])=>[k.toLowerCase().replace(/[\s_-]+/g,""),v]));
     const title=String(keyMap.title||keyMap.posttitle||"").trim().slice(0,240);
     if(!title){skipped++;continue}
     const slug=slugify(keyMap.slug||title);
     const body=cleanBlogHTML(keyMap.content||keyMap.body||keyMap.bodyhtml||keyMap.richcontent||"");
     const existing=posts.find(p=>p.slug===slug||p.title.trim().toLowerCase()===title.toLowerCase());
     const payload={title,slug,excerpt:String(keyMap.excerpt||keyMap.description||"").slice(0,520),body_html:body,author_name:String(keyMap.author||"Andre Erving").slice(0,120),status:"draft",migration_status:body?"imported":"pending_import"};
     if(existing){
      if(existing.body_html?.trim()){skipped++;continue}
      const r=await db.from("blog_posts").update({...payload,slug:existing.slug}).eq("id",existing.id);
      if(r.error)throw r.error;
     }else{
      const r=await db.from("blog_posts").insert(payload);
      if(r.error)throw r.error;
     }imported++;
    }
    overlay.querySelector("#blog-import-status").textContent=imported+" articles imported as drafts; "+skipped+" skipped. Review each post before publishing.";
    notify("Wix CSV import completed");
    await list();
   }catch(error){overlay.querySelector("#blog-import-status").textContent=error.message||"Import failed"}finally{button.disabled=false}
  };
 }
 function parseCSV(text){
  const rows=[];let row=[],value="",quoted=false;
  for(let i=0;i<text.length;i++){
   const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){value+='"';i++}else if(ch==='"'){quoted=false}else{value+=ch}}
   else if(ch==='"'){quoted=true}else if(ch===','){row.push(value);value=""}else if(ch==='\n'){row.push(value);rows.push(row);row=[];value=""}else if(ch!=='\r'){value+=ch}
  }if(value||row.length){row.push(value);rows.push(row)}
  if(!rows.length)return [];const headers=rows.shift().map(x=>x.trim());return rows.filter(x=>x.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||""])));
 }
 function open(post){
  selected=post;preview=false;dirty=false;
  const p=post||{},isImported=p.migration_status==="pending_import";
  root.innerHTML='<div class="blog-studio-editor">'+
  '<div class="blog-studio-editor-top"><button type="button" id="blog-back">← All posts</button><span class="blog-studio-save-indicator" id="blog-save-indicator">Not saved</span><div class="blog-studio-editor-actions"><button type="button" id="blog-preview" class="btn secondary">Preview</button><button type="button" id="blog-save" class="btn secondary">Save draft</button><button type="button" id="blog-publish" class="btn">Publish article</button></div></div>'+
  '<form id="blog-form" novalidate><div class="blog-studio-edit-layout"><main class="blog-studio-main">'+
  '<p class="blog-studio-eyebrow">ANDRE ERVING / CONTENT STUDIO</p>'+
  '<input class="blog-title-field" id="blog-title" name="title" aria-label="Article title" placeholder="Add your article title" maxlength="240" value="'+E(p.title||"")+'" required>'+
  '<div class="blog-subline"><span id="blog-word-count">0 words</span><span id="blog-reading-time">0 min read</span><span>'+E(post?"Editing article":"New article")+'</span></div>'+
  '<section class="blog-edit-card"><div class="blog-toolbar" role="toolbar" aria-label="Article formatting">'+
  '<select id="blog-block" aria-label="Text style"><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select>'+
  '<button type="button" data-cmd="bold" title="Bold"><strong>B</strong></button><button type="button" data-cmd="italic" title="Italic"><em>I</em></button>'+
  '<button type="button" data-cmd="underline" title="Underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList" title="Bulleted list">☷</button>'+
  '<button type="button" data-cmd="insertOrderedList" title="Numbered list">≡</button>'+
  '<button type="button" data-action="link" title="Insert link">Link</button><button type="button" data-action="image" title="Insert image">Image</button>'+
  '<button type="button" data-action="divider" title="Horizontal divider">Divider</button>'+
  '<button type="button" data-cmd="undo" title="Undo">↶</button><button type="button" data-cmd="redo" title="Redo">↷</button></div>'+
  '<div id="blog-content" class="blog-rich-editor" contenteditable="true" role="textbox" aria-label="Article content" aria-multiline="true" data-placeholder="Start writing your article here...">'+(p.body_html?cleanBlogHTML(p.body_html):"")+'</div></section>'+
  '<section class="blog-edit-card blog-excerpt"><h2>Article summary</h2><label for="blog-excerpt">A short introduction shown on the blog homepage</label><textarea id="blog-excerpt" name="excerpt" rows="3" maxlength="520">'+E(p.excerpt||"")+'</textarea></section>'+
  '</main><aside class="blog-studio-settings"><section class="blog-settings-panel"><h2>Publish settings</h2><label>Status<select id="blog-status"><option value="draft" '+(p.status!=="published"?"selected":"")+'>Draft</option><option value="published" '+(p.status==="published"?"selected":"")+'>Published</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Archived</option></select></label>'+
  '<label>Author<input id="blog-author" value="'+E(p.author_name||"Andre Erving")+'"></label>'+
  '<label>Category<input id="blog-category" value="'+E(p.category||"Insights")+'" maxlength="90"></label>'+
  '<label>Tags (comma separated)<input id="blog-tags" value="'+E((p.tags||[]).join(", "))+'" maxlength="350"></label>'+
  '<label>Publish date<input id="blog-date" type="datetime-local" value="'+E(p.published_at?new Date(p.published_at).toISOString().slice(0,16):"")+'"></label></section>'+
  '<section class="blog-settings-panel"><h2>Cover image</h2><div class="blog-cover-preview">'+(p.cover_image_url?'<img src="'+E(p.cover_image_url)+'" alt="Article cover">':'<span>No cover image yet</span>')+'</div><label>Cover image URL<input id="blog-cover" type="url" value="'+E(p.cover_image_url||"")+'" placeholder="https://..."></label><label class="blog-file-upload">Upload image<input type="file" id="blog-cover-upload" accept="image/png,image/jpeg,image/webp"></label></section>'+
  '<section class="blog-settings-panel"><h2>Search visibility</h2><label>Article URL slug<input id="blog-slug" value="'+E(p.slug||"")+'" required></label><label>SEO title<input id="blog-seo-title" value="'+E(p.seo_title||"")+'" maxlength="70"></label><label>SEO description<textarea id="blog-seo-description" rows="3" maxlength="165">'+E(p.seo_description||"")+'</textarea></label><p class="blog-studio-livepath">andreerving.com/blog-post.html?slug=<span id="blog-slug-display">'+E(p.slug||"new-article")+'</span></p></section>'+
  (p.source_url?'<section class="blog-settings-panel"><h2>Original article</h2><a href="'+E(p.source_url)+'" target="_blank" rel="noopener noreferrer">View original post ↗</a>'+(isImported?'<p class="blog-import-warning">The original text has not been imported. Add the article content before publishing.</p>':'')+'</section>':'')+
  '</aside></div><p role="alert" id="blog-error" class="blog-error" hidden></p></form></div>';
  editor=q("#blog-content");
  updateStats();
  const mark=()=>{dirty=true;q("#blog-save-indicator").textContent="Unsaved changes";updateStats()};
  qa("#blog-form input,#blog-form textarea,#blog-form select").forEach(el=>el.addEventListener("input",mark));
  editor.addEventListener("input",mark);
  q("#blog-title").addEventListener("input",()=>{if(!post&&!q("#blog-slug").dataset.manual){q("#blog-slug").value=slugify(q("#blog-title").value);q("#blog-slug-display").textContent=q("#blog-slug").value||"new-article"}});
  q("#blog-slug").addEventListener("input",()=>{q("#blog-slug").dataset.manual="true";q("#blog-slug-display").textContent=slugify(q("#blog-slug").value)});
  q("#blog-cover").onchange=()=>{q(".blog-cover-preview").innerHTML=q("#blog-cover").value?'<img src="'+E(q("#blog-cover").value)+'" alt="Article cover">':'No cover image yet'};
  q("#blog-back").onclick=()=>{if(dirty&&!confirm("Leave this article? Unsaved changes will be lost."))return;onExit()};
  q("#blog-save").onclick=()=>save("draft");
  q("#blog-publish").onclick=()=>save("published");
  q("#blog-preview").onclick=()=>previewPost();
  q("#blog-block").onchange=()=>format("formatBlock",q("#blog-block").value);
  qa("[data-cmd]").forEach(b=>b.addEventListener("mousedown",e=>e.preventDefault()));
  qa("[data-cmd]").forEach(b=>b.onclick=()=>format(b.dataset.cmd));
  qa("[data-action]").forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>insert(b.dataset.action)});
  q("#blog-cover-upload").onchange=async e=>{
   try{const file=e.target.files?.[0];if(!file)return;const url=await uploadImage(file);q("#blog-cover").value=url;q("#blog-cover").dispatchEvent(new Event("change"));mark();notify("Cover image uploaded")}catch(err){errorText(err.message)}
  };
  editor.addEventListener("paste",event=>{
   if(!event.clipboardData?.getData("text/html"))return;
   event.preventDefault();const html=cleanBlogHTML(event.clipboardData.getData("text/html"));
   editor.focus();document.execCommand("insertHTML",false,html);mark();
  });
 }
 function updateStats(){
  if(!editor)return;const words=editor.innerText.trim().split(/\s+/).filter(Boolean).length;
  const a=q("#blog-word-count"),b=q("#blog-reading-time");if(a)a.textContent=words+" words";if(b)b.textContent=Math.max(1,Math.ceil(words/225))+" min read";
 }
 function format(cmd,value){editor.focus();document.execCommand(cmd,false,value||null);dirty=true;updateStats()}
 function insert(action){
  editor.focus();
  if(action==="divider")return format("insertHorizontalRule");
  if(action==="link"){const address=prompt("Enter an HTTPS URL:");if(!address)return;const href=safeURL(address);if(!href)return errorText("Choose a valid web URL.");format("createLink",href)}
  if(action==="image"){
   const input=document.createElement("input");input.type="file";input.accept="image/png,image/jpeg,image/webp";
   input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;const url=await uploadImage(file);editor.focus();format("insertHTML",'<figure><img src="'+E(url)+'" alt="Blog image"></figure>');notify("Image added to article")}catch(err){errorText(err.message)}};
   input.click();
  }
 }
 async function uploadImage(file){
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>8*1024*1024)throw Error("Choose a JPG, PNG or WebP image under 8 MB.");
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const name="blog/"+crypto.randomUUID()+"."+ext;
  const {error}=await db.storage.from("Andre Erving Public").upload(name,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
  if(error)throw error;
  return db.storage.from("Andre Erving Public").getPublicUrl(name).data.publicUrl;
 }
 function errorText(text){const e=q("#blog-error");if(e){e.hidden=false;e.textContent=text}notify(text,true)}
 function payload(status){
  const title=q("#blog-title").value.trim(),slug=slugify(q("#blog-slug").value||title),html=cleanBlogHTML(editor.innerHTML),plain=new DOMParser().parseFromString(html,"text/html").body.textContent.trim();
  if(!title||!slug)throw Error("Article title and URL slug are required.");
  if(status==="published"&&plain.length<80)throw Error("Add the complete article content before publishing (at least 80 characters).");
  const date=q("#blog-date").value;
  return {title,slug,excerpt:q("#blog-excerpt").value.trim(),body_html:html,author_name:q("#blog-author").value.trim()||"Andre Erving",category:q("#blog-category").value.trim()||"Insights",tags:q("#blog-tags").value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,20),seo_title:q("#blog-seo-title").value.trim()||null,seo_description:q("#blog-seo-description").value.trim()||null,cover_image_url:safeURL(q("#blog-cover").value.trim(),true)||null,status,published_at:status==="published"?(date?new Date(date).toISOString():selected?.published_at||new Date().toISOString()):null,migration_status:plain?"verified":"pending_import"};
 }
 async function save(status){
  if(saveBusy)return;saveBusy=true;
  const buttons=qa("#blog-save,#blog-publish");buttons.forEach(b=>b.disabled=true);
  try{
   const data=payload(status);
   const out=selected?await db.from("blog_posts").update(data).eq("id",selected.id).select().single():await db.from("blog_posts").insert(data).select().single();
   if(out.error)throw out.error;
   selected=out.data;dirty=false;q("#blog-save-indicator").textContent="Saved just now";
   notify(status==="published"?"Article published to andreerving.com":"Draft saved");
   if(status==="published")q("#blog-status").value="published";
   history.replaceState(null,"","#/admin/blog_posts/edit/"+selected.id);
  }catch(error){errorText(error.message||"Unable to save article")}finally{saveBusy=false;buttons.forEach(b=>b.disabled=false)}
 }
 function previewPost(){
  const content=cleanBlogHTML(editor.innerHTML),title=q("#blog-title").value||"Untitled article",cover=safeURL(q("#blog-cover").value,true);
  const overlay=document.createElement("div");overlay.className="blog-studio-overlay blog-preview-overlay";
  overlay.innerHTML='<div class="blog-preview-dialog"><div class="blog-preview-top"><strong>Article preview</strong><button type="button" aria-label="Close preview">×</button></div><article class="blog-preview-article">'+(cover?'<img class="blog-preview-cover" src="'+E(cover)+'" alt="Article cover">':'')+'<p class="blog-studio-eyebrow">'+E(q("#blog-category").value)+'</p><h1>'+E(title)+'</h1><p class="blog-preview-meta">By '+E(q("#blog-author").value||"Andre Erving")+'</p><div class="blog-preview-copy">'+content+'</div></article></div>';
  document.body.append(overlay);overlay.querySelector("button").onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
 }
 return {list,open};
}
