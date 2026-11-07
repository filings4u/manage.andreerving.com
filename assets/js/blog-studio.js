// Andre Erving Blog Studio, connected to published blog_posts records in Supabase.
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slugify=s=>String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
const humanDate=d=>d?new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Not published";
const allowedTags=new Set(["P","BR","H2","H3","H4","STRONG","B","EM","I","U","S","UL","OL","LI","BLOCKQUOTE","A","IMG","HR","DIV","SPAN","FIGURE","FIGCAPTION","PRE","CODE","TABLE","TBODY","THEAD","TR","TD","TH","IFRAME","FONT","SUP","SUB"]);
const safeURL=(s,images=false)=>{if(!String(s||"").trim())return null;try{const u=new URL(s,location.origin);return (["https:","http:"].includes(u.protocol)||!images&&u.protocol==="mailto:")?u.href:null}catch{return null}};
const safeStyle=value=>{
 const allowed={
  color:v=>/^#[0-9a-f]{3,8}$/i.test(v)||/^rgba?\([0-9., %]+\)$/i.test(v),
  "background-color":v=>/^#[0-9a-f]{3,8}$/i.test(v)||/^rgba?\([0-9., %]+\)$/i.test(v),
  "font-family":v=>/^(Arial|Georgia|Verdana|Tahoma|Times New Roman|Courier New|Helvetica|serif|sans-serif|monospace)(, ?(serif|sans-serif|monospace))?$/i.test(v),
  "font-size":v=>/^(1[0-9]|2[0-9]|3[0-6])px$/.test(v),
  "line-height":v=>/^(1|1\.[0-9]|2|2\.[0-5])$/.test(v),
  "margin-bottom":v=>/^(0|[0-9]|[1-6][0-9])px$/.test(v),
  "text-align":v=>/^(left|center|right|justify)$/.test(v),
  "text-decoration":v=>/^(underline|line-through|none)$/.test(v)
 };
 return String(value||"").split(";").map(part=>part.trim()).filter(Boolean).map(part=>{const index=part.indexOf(":");if(index===-1)return "";const key=part.slice(0,index).trim().toLowerCase(),val=part.slice(index+1).trim();return allowed[key]?.(val)?key+":"+val:""}).filter(Boolean).join(";");
};
const safeVideoURL=value=>{try{const u=new URL(String(value));if(u.protocol!=="https:")return null;if(["www.youtube-nocookie.com","www.youtube.com"].includes(u.hostname)&&/^\/embed\/[a-zA-Z0-9_-]{11}$/.test(u.pathname))return "https://www.youtube-nocookie.com"+u.pathname;if(u.hostname==="player.vimeo.com"&&/^\/video\/\d+$/.test(u.pathname))return u.origin+u.pathname;return null}catch{return null}};
export function cleanBlogHTML(input){
 const parsed=new DOMParser().parseFromString("<div>"+String(input||"")+"</div>","text/html");
 const holder=parsed.body.firstElementChild;
 // Preserve safe URLs and image descriptions before stripping other attributes.
 function walk(node){
  for(const child of [...node.childNodes]){
   if(child.nodeType===8){child.remove();continue}
   if(child.nodeType===3)continue;
   if(child.nodeType!==1){child.remove();continue}
   if(!allowedTags.has(child.tagName)){child.replaceWith(...[...child.childNodes]);walk(node);continue}
   const url=child.getAttribute(child.tagName==="IMG"?"src":"href");
   const alt=child.getAttribute("alt"),iframeSrc=child.getAttribute("src"),style=child.getAttribute("style"),fontColor=child.getAttribute("color"),fontFace=child.getAttribute("face"),fontSize=child.getAttribute("size");
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
function stripDuplicateCover(html,cover){
 if(!cover)return html;
 const parsed=new DOMParser().parseFromString("<div>"+String(html||"")+"</div>","text/html");
 const main=parsed.body.firstElementChild;
 const fingerprint=value=>{try{const u=new URL(value,location.origin);return u.hostname.toLowerCase()+decodeURIComponent(u.pathname).toLowerCase()}catch{return ""}};
 const target=fingerprint(cover);if(!target)return html;
 for(const img of [...main.querySelectorAll("img")]){
  if(fingerprint(img.getAttribute("src"))!==target)continue;
  const parent=img.closest("figure");
  if(parent&&parent.querySelectorAll("img").length===1)parent.remove();
  else img.remove();
 }
 return main.innerHTML;
}
export function createBlogStudio({db,root,notify,isCurrent,onExit}){
 let selected=null,posts=[],draftTimer=null,dirty=false,editor=null,saveBusy=false,preview=false,savedRange=null;
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
  overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="import-title" class="blog-studio-dialog"><button type="button" class="blog-studio-close" aria-label="Close">×</button><p class="blog-studio-eyebrow">IMPORT</p><h2 id="import-title">Import articles from Wix</h2><p>The 20 previously discovered posts have already been created as draft records. Their original article bodies have not been retrieved.</p><p>For each article, open its record, paste the original Wix content into the editor, and save. Posts are never published automatically.</p><div class="blog-studio-auto-import"><h3>Import from original article URLs</h3><p>Try the original Wix addresses already linked to these 20 drafts. The importer only fills empty drafts and never publishes automatically.</p><button type="button" id="blog-import-originals" class="btn">Import original Wix articles</button><p class="blog-studio-import-progress" id="blog-auto-status" role="status" aria-live="polite"></p></div><p>Alternatively, import a Wix CSV export below if the original pages are unavailable.</p><label>Wix CSV file<input id="blog-csv" type="file" accept=".csv,text/csv"></label><div id="blog-import-status" role="status"></div><button id="blog-csv-import" class="btn">Import CSV as drafts</button></section>';
  document.body.append(overlay);
  overlay.querySelector(".blog-studio-close").onclick=()=>overlay.remove();
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};

  // Import a single Wix article directly from its URL without creating a placeholder first.
  const urlPanel=document.createElement("div");
  urlPanel.className="blog-studio-url-import";
  urlPanel.innerHTML='<h3>Import an article from a link</h3><p>Paste the address of an individual post from your previous Wix blog. The article will be saved as a draft for review.</p><form id="blog-import-url-form"><label for="blog-original-url">Original blog article URL</label><div class="blog-import-url-row"><input id="blog-original-url" type="url" inputmode="url" placeholder="https://roselandcompanies.wixsite.com/my-site-21/post/..." required><button class="btn" type="submit">Import article</button></div><p role="status" aria-live="polite" id="blog-original-url-status"></p></form>';
  overlay.querySelector(".blog-studio-auto-import").before(urlPanel);
  const urlForm=urlPanel.querySelector("#blog-import-url-form");
  urlForm.addEventListener("submit",async event=>{
   event.preventDefault();
   const input=urlForm.querySelector("#blog-original-url"),status=urlForm.querySelector("#blog-original-url-status"),button=urlForm.querySelector("button");
   let url;
   try{
    url=new URL(input.value.trim());
    if(url.protocol!=="https:"||!["roselandcompanies.wixsite.com","andreerving.com","www.andreerving.com"].includes(url.hostname.toLowerCase())||!url.pathname.includes("/post/"))throw Error("Please paste an individual article link from your original Wix blog.");
   }catch{status.textContent="Please paste an individual article link, not the main blog page.";status.dataset.error="true";return}
   status.textContent="Fetching original article and saving a draft…";status.dataset.error="false";button.disabled=true;
   try{
    const {data:{session},error}=await db.auth.getSession();
    if(error||!session?.access_token)throw Error("Sign in again before importing articles.");
    const response=await fetch("https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-blog-import",{
     method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
     body:JSON.stringify({url:url.href})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.status==="failed")throw Error(result.error||"The article could not be imported.");
    status.textContent=result.message||"Import complete.";
    if(result.status==="imported"&&result.id){
     notify("Article imported as a draft. Review it before publishing.");
     overlay.remove();
     const record=await db.from("blog_posts").select("*").eq("id",result.id).single();
     if(record.error)throw record.error;
     open(record.data);
    }
   }catch(error){
    status.textContent=error.message||"Unable to import this article.";
    status.dataset.error="true";
   }finally{button.disabled=false}
  });
  overlay.querySelector("#blog-import-originals").onclick=async()=>{
   const button=overlay.querySelector("#blog-import-originals");
   const progress=overlay.querySelector("#blog-auto-status");
   const pending=posts.filter(p=>p.migration_status==="pending_import"&&!p.body_html?.trim()&&p.source_url);
   if(!pending.length){progress.textContent="No pending source URLs remain.";return}
   button.disabled=true;
   let imported=0,unavailable=0,skipped=0;
   try{
    const {data:{session},error}=await db.auth.getSession();
    if(error||!session?.access_token)throw Error("Sign in again before importing articles.");
    for(let i=0;i<pending.length;i++){
     if(!document.body.contains(overlay))break;
     progress.textContent="Checking original article "+(i+1)+" of "+pending.length+": "+pending[i].title;
     try{
      const response=await fetch("https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-blog-import",{
       method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
       body:JSON.stringify({id:pending[i].id})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.error||"Import request unavailable");
      if(result.status==="imported")imported++;
      else if(result.status==="skipped")skipped++;
      else unavailable++;
     }catch(error){unavailable++;console.warn("Original article import unavailable",pending[i].title,error)}
    }
    progress.textContent="Import finished: "+imported+" drafts received content, "+skipped+" skipped and "+unavailable+" originals unavailable. Review imported articles before publishing.";
    notify(imported?imported+" original articles imported as drafts":"Original content could not be imported automatically. Use Wix CSV export.");
    // Keep this result visible; the listing can be refreshed after closing the dialog.
    overlay.querySelector(".blog-studio-close").onclick=()=>{overlay.remove();list()};
   }catch(error){progress.textContent=error.message||"Import failed"}finally{button.disabled=false}
  };
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
  selected=post;preview=false;dirty=false;savedRange=null;
  const p=post||{},isImported=p.migration_status==="pending_import";
  root.innerHTML='<div class="blog-studio-editor">'+
  '<div class="blog-studio-editor-top"><button type="button" id="blog-back">← All posts</button><span class="blog-studio-save-indicator" id="blog-save-indicator">Not saved</span><div class="blog-studio-editor-actions"><button type="button" id="blog-preview" class="btn secondary">Preview</button><button type="button" id="blog-save" class="btn secondary">Save changes</button><button type="button" id="blog-publish" class="btn">Publish article</button></div></div>'+
  '<form id="blog-form" novalidate><div class="blog-studio-edit-layout"><aside class="blog-editor-guide" aria-label="Article setup steps"><div class="blog-editor-guide-heading"><span class="ae-editor-eyebrow">ARTICLE WORKSPACE</span><h2>Build your article</h2><p>Complete each section, then preview and publish.</p></div><nav class="blog-editor-guide-links" aria-label="Article sections"><a href="#blog-writing" class="active"><span>01</span><strong>Write article</strong></a><a href="#blog-summary"><span>02</span><strong>Summary</strong></a><a href="#blog-publishing"><span>03</span><strong>Publishing</strong></a><a href="#blog-image-section"><span>04</span><strong>Cover image</strong></a><a href="#blog-search-settings"><span>05</span><strong>Search settings</strong></a></nav><div class="blog-editor-guide-tip"><strong>Publishing checklist</strong><p>Add the article body and summary. Review your images and link before publishing.</p></div></aside><div class="blog-editor-body"><main class="blog-studio-main">'+
  '<p class="blog-studio-eyebrow">BLOG / ARTICLE EDITOR</p>'+
  '<input class="blog-title-field" id="blog-title" name="title" aria-label="Article title" placeholder="Add your article title" maxlength="240" value="'+E(p.title||"")+'" required>'+
  '<div class="blog-subline"><span id="blog-word-count">0 words</span><span id="blog-reading-time">0 min read</span><span>'+E(post?"Editing article":"New article")+'</span></div>'+
  '<section class="blog-edit-card" id="blog-writing"><div class="blog-editor-label"><strong>Article content</strong><span>Write, format, and add images below.</span></div><div class="blog-toolbar" role="toolbar" aria-label="Article formatting">'+
  '<select id="blog-block" aria-label="Text style"><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select>'+
  '<button type="button" data-cmd="bold" title="Bold"><strong>B</strong></button><button type="button" data-cmd="italic" title="Italic"><em>I</em></button>'+
  '<button type="button" data-cmd="underline" title="Underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList" title="Bulleted list">☷</button>'+
  '<button type="button" data-cmd="insertOrderedList" title="Numbered list">≡</button>'+
  '<button type="button" data-action="link" title="Insert link">Link</button><button type="button" data-action="image" title="Insert image">Image</button>'+
  '<select id="blog-font" aria-label="Font family"><option value="">Font family</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option><option value="Courier New">Courier New</option></select>'+
  '<select id="blog-size" aria-label="Font size"><option value="">Text size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Extra large</option><option value="6">Display</option></select>'+
  '<label class="blog-toolbar-color" title="Text color">Text <input type="color" id="blog-text-color" value="#18385a" aria-label="Text color"></label>'+
  '<label class="blog-toolbar-color" title="Highlight color">Highlight <input type="color" id="blog-highlight-color" value="#fff0bc" aria-label="Highlight color"></label>'+
  '<select id="blog-line-spacing" aria-label="Line spacing"><option value="">Line spacing</option><option value="1.2">Tight</option><option value="1.5">Normal</option><option value="1.75">Comfortable</option><option value="2">Wide</option></select>'+
  '<select id="blog-paragraph-spacing" aria-label="Paragraph spacing"><option value="">Paragraph spacing</option><option value="0">None</option><option value="8">Compact</option><option value="16">Normal</option><option value="24">Spacious</option><option value="36">Extra</option></select>'+
  '<button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button><button type="button" data-cmd="justifyLeft" title="Align left">Left</button><button type="button" data-cmd="justifyCenter" title="Center text">Center</button><button type="button" data-cmd="justifyRight" title="Align right">Right</button>'+
  '<button type="button" data-cmd="indent" title="Increase indent">Indent +</button><button type="button" data-cmd="outdent" title="Decrease indent">Indent −</button>'+
  '<button type="button" data-cmd="removeFormat" title="Clear formatting">Clear</button>'+
  '<button type="button" data-action="video" title="Embed YouTube or Vimeo video">Video</button><button type="button" data-action="table" title="Insert table">Table</button>'+
  '<button type="button" data-action="divider" title="Horizontal divider">Divider</button>'+
  '<button type="button" data-cmd="undo" title="Undo">↶</button><button type="button" data-cmd="redo" title="Redo">↷</button></div>'+
  '<div id="blog-content" class="blog-rich-editor" contenteditable="true" role="textbox" aria-label="Article content" aria-multiline="true" data-placeholder="Start writing your article here...">'+(p.body_html?stripDuplicateCover(cleanBlogHTML(p.body_html),p.cover_image_url):"")+'</div></section>'+
  '<section class="blog-edit-card blog-excerpt" id="blog-summary"><h2>Article summary</h2><label for="blog-excerpt">A short introduction shown on the blog homepage</label><textarea id="blog-excerpt" name="excerpt" rows="3" maxlength="520">'+E(p.excerpt||"")+'</textarea></section>'+
  '</main><div class="blog-studio-settings"><section class="blog-settings-panel" id="blog-publishing"><h2>Publish settings</h2><label>Status<select id="blog-status"><option value="draft" '+(p.status!=="published"?"selected":"")+'>Draft</option><option value="published" '+(p.status==="published"?"selected":"")+'>Published</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Archived</option></select></label>'+
  '<label>Author<input id="blog-author" value="'+E(p.author_name||"Andre Erving")+'"></label>'+
  '<label>Category<input id="blog-category" value="'+E(p.category||"Insights")+'" maxlength="90"></label>'+
  '<label>Tags (comma separated)<input id="blog-tags" value="'+E((p.tags||[]).join(", "))+'" maxlength="350"></label>'+
  '<label>Publish date<input id="blog-date" type="datetime-local" value="'+E(p.published_at?new Date(p.published_at).toISOString().slice(0,16):"")+'"></label></section>'+
  '<section class="blog-settings-panel" id="blog-image-section"><h2>Cover image</h2><div class="blog-cover-preview">'+(p.cover_image_url?'<img src="'+E(p.cover_image_url)+'" alt="Article cover">':'<span>No cover image yet</span>')+'</div><label>Cover image URL<input id="blog-cover" type="url" value="'+E(p.cover_image_url||"")+'" placeholder="https://..."></label><label class="blog-file-upload">Upload image<input type="file" id="blog-cover-upload" accept="image/png,image/jpeg,image/webp"></label></section>'+
  '<section class="blog-settings-panel" id="blog-search-settings"><h2>Search engine optimization</h2><p class="blog-seo-help">Set how this article is described to search engines. Search engines control their own snippets and indexing decisions.</p>'+
  '<label>Article URL slug<input id="blog-slug" value="'+E(p.slug||"")+'" required></label>'+
  '<label>SEO title<input id="blog-seo-title" value="'+E(p.seo_title||"")+'" maxlength="85" placeholder="Article headline for Google and Bing"></label>'+
  '<label>SEO description<textarea id="blog-seo-description" rows="4" maxlength="500" minlength="160" placeholder="A complete description of at least 160 characters for published posts.">'+E(p.seo_description||"")+'</textarea><span id="blog-seo-count" class="blog-seo-count" role="status">0 / 160 characters minimum</span></label>'+
  '<label>Focus search phrase<input id="blog-seo-focus" value="'+E(p.seo_focus_keyword||"")+'" maxlength="140" placeholder="e.g. Finding shippers for freight brokers"></label>'+
  '<label>Social sharing title<input id="blog-og-title" value="'+E(p.seo_og_title||"")+'" maxlength="120" placeholder="Defaults to SEO title"></label>'+
  '<label>Social sharing description<textarea id="blog-og-description" maxlength="500" rows="3" placeholder="Defaults to SEO description">'+E(p.seo_og_description||"")+'</textarea></label>'+
  '<label>Social sharing image URL<input id="blog-og-image" type="url" value="'+E(p.seo_og_image_url||"")+'" placeholder="https://..."></label>'+
  '<label>Cover image description for accessibility<input id="blog-image-alt" maxlength="220" value="'+E(p.seo_image_alt||"")+'" placeholder="Describe what is visible in the cover image"></label>'+
  '<label class="blog-index-setting"><input type="checkbox" id="blog-indexable" '+(p.seo_indexable===false?"":"checked")+'> Allow search engines to index this published article</label>'+
  '<div class="blog-search-preview"><small>Search result preview</small><strong id="blog-search-preview-title">'+E(p.seo_title||p.title||"Article headline")+'</strong><span id="blog-search-preview-link">andreerving.com/blog-post.html?slug='+E(p.slug||"new-article")+'</span><p id="blog-search-preview-description">'+E(p.seo_description||p.excerpt||"Write a detailed description for search results.")+'</p></div>'+
  '<p class="blog-studio-livepath">Article URL: andreerving.com/blog-post.html?slug=<span id="blog-slug-display">'+E(p.slug||"new-article")+'</span></p></section>'+
  (p.source_url?'<section class="blog-settings-panel"><h2>Original article</h2><a href="'+E(p.source_url)+'" target="_blank" rel="noopener noreferrer">View original post ↗</a>'+(isImported?'<p class="blog-import-warning">The original text has not been imported. Add the article content before publishing.</p>':'')+'</section>':'')+
  '</div></div></div><p role="alert" id="blog-error" class="blog-error" hidden></p></form></div>';
  qa(".blog-editor-guide-links a").forEach(link=>{
   link.addEventListener("click",event=>{
    event.preventDefault();
    const destination=q(link.getAttribute("href"));
    if(!destination)return;
    qa(".blog-editor-guide-links a").forEach(item=>item.classList.toggle("active",item===link));
    destination.scrollIntoView({behavior:"smooth",block:"start"});
    if(link.getAttribute("href")==="#blog-writing")editor.focus({preventScroll:true});
   });
  });
  const scrollHost=root.closest(".main")||document.querySelector(".main")||document.scrollingElement;
  const sections=["blog-writing","blog-summary","blog-publishing","blog-image-section","blog-search-settings"];
  let pendingFrame=false;
  const updateActiveSection=()=>{
   pendingFrame=false;
   if(!root.contains(q("#blog-writing")))return;
   const threshold=185;
   let current=sections[0];
   for(const id of sections){const node=q("#"+id);if(node&&node.getBoundingClientRect().top<=threshold)current=id}
   qa(".blog-editor-guide-links a").forEach(a=>{
    const isActive=a.getAttribute("href")==="#"+current;
    a.classList.toggle("active",isActive);
    if(isActive)a.setAttribute("aria-current","location");else a.removeAttribute("aria-current");
   });
  };
  const onScroll=()=>{if(!pendingFrame){pendingFrame=true;requestAnimationFrame(updateActiveSection)}};
  scrollHost.addEventListener("scroll",onScroll,{passive:true});
  window.addEventListener("resize",onScroll,{passive:true});
  onScroll();
  editor=q("#blog-content");
  q("#blog-form").addEventListener("submit",event=>{event.preventDefault();save("draft")});
  updateStats();
  const mark=()=>{dirty=true;q("#blog-save-indicator").textContent="Unsaved changes";updateStats()};
  qa("#blog-form input,#blog-form textarea,#blog-form select").forEach(el=>el.addEventListener("input",mark));
  editor.addEventListener("input",mark);
  const rememberSelection=()=>{const sel=window.getSelection();if(sel?.rangeCount&&editor.contains(sel.anchorNode))savedRange=sel.getRangeAt(0).cloneRange()};
  editor.addEventListener("mouseup",rememberSelection);
  editor.addEventListener("keyup",rememberSelection);
  editor.addEventListener("focus",rememberSelection);
  q("#blog-title").addEventListener("input",()=>{if(!post&&!q("#blog-slug").dataset.manual){q("#blog-slug").value=slugify(q("#blog-title").value);q("#blog-slug-display").textContent=q("#blog-slug").value||"new-article"}});
  q("#blog-slug").addEventListener("input",()=>{q("#blog-slug").dataset.manual="true";q("#blog-slug-display").textContent=slugify(q("#blog-slug").value)});
  const updateSEO=()=>{
   const description=q("#blog-seo-description").value.trim(),length=description.length;
   const counter=q("#blog-seo-count");
   counter.textContent=length+" characters. "+(length<160?"At least 160 required for publishing.":"Meets your minimum description length.");
   counter.classList.toggle("short",length<160);
   q("#blog-search-preview-title").textContent=q("#blog-seo-title").value.trim()||q("#blog-title").value.trim()||"Article headline";
   q("#blog-search-preview-description").textContent=description||q("#blog-excerpt").value.trim()||"Write a detailed description for search results.";
   q("#blog-search-preview-link").textContent="andreerving.com/blog-post.html?slug="+slugify(q("#blog-slug").value||q("#blog-title").value);
  };
  ["#blog-seo-description","#blog-seo-title","#blog-title","#blog-excerpt","#blog-slug"].forEach(selector=>q(selector).addEventListener("input",updateSEO));
  updateSEO();
  q("#blog-cover").onchange=()=>{q(".blog-cover-preview").innerHTML=q("#blog-cover").value?'<img src="'+E(q("#blog-cover").value)+'" alt="Article cover">':'No cover image yet'};
  q("#blog-back").onclick=()=>{if(dirty){errorText("You have unsaved changes. Save this draft before leaving.");return}onExit()};
  q("#blog-save").onclick=()=>save(q("#blog-status").value==="archived"?"archived":q("#blog-status").value==="published"?"published":"draft");
  q("#blog-publish").onclick=()=>save("published");
  q("#blog-status").onchange=()=>{q("#blog-publish").textContent=q("#blog-status").value==="published"?"Update published article":"Publish article"};
  q("#blog-preview").onclick=()=>previewPost();
  q("#blog-block").onchange=()=>format("formatBlock",q("#blog-block").value);
  q("#blog-font").onchange=()=>{if(q("#blog-font").value)format("fontName",q("#blog-font").value);q("#blog-font").value=""};
  q("#blog-size").onchange=()=>{if(q("#blog-size").value)format("fontSize",q("#blog-size").value);q("#blog-size").value=""};
  q("#blog-text-color").oninput=()=>format("foreColor",q("#blog-text-color").value);
  q("#blog-highlight-color").oninput=()=>format("hiliteColor",q("#blog-highlight-color").value);
  const spacing=(name,value)=>{
   if(!value)return;restoreSelection();
   const sel=window.getSelection(),anchor=sel?.anchorNode;
   const node=anchor?.nodeType===1?anchor:anchor?.parentElement;
   const block=node?.closest("p,h2,h3,h4,blockquote,div,li");
   if(!block||!editor.contains(block))return errorText("Place the cursor inside a paragraph before changing spacing.");
   block.style[name]=value;dirty=true;updateStats();q("#blog-save-indicator").textContent="Unsaved changes";
  };
  q("#blog-line-spacing").onchange=()=>{spacing("lineHeight",q("#blog-line-spacing").value);q("#blog-line-spacing").value=""};
  q("#blog-paragraph-spacing").onchange=()=>{spacing("marginBottom",q("#blog-paragraph-spacing").value+"px");q("#blog-paragraph-spacing").value=""};
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
 function restoreSelection(){
  editor.focus();
  if(savedRange&&editor.contains(savedRange.commonAncestorContainer)){
   const selection=window.getSelection();selection.removeAllRanges();selection.addRange(savedRange);
  }
 }
 function format(cmd,value){
  restoreSelection();
  const success=document.execCommand(cmd,false,value||null);
  if(!success&&cmd==="insertHorizontalRule")document.execCommand("insertHTML",false,"<hr>");
  const indicator=q("#blog-save-indicator");if(indicator)indicator.textContent="Unsaved changes";
  dirty=true;updateStats();
  const selection=window.getSelection();if(selection?.rangeCount)savedRange=selection.getRangeAt(0).cloneRange();
 }
 function insert(action){
  restoreSelection();
  if(action==="divider")return format("insertHorizontalRule");
  if(action==="table")return format("insertHTML",'<table><tbody><tr><th>Heading</th><th>Heading</th></tr><tr><td>Content</td><td>Content</td></tr></tbody></table><p></p>');
  if(action==="video"){
   const address=prompt("Paste a YouTube or Vimeo video URL:");
   if(!address)return;
   let url;try{
    const u=new URL(address);
    if(u.hostname==="youtu.be")url="https://www.youtube-nocookie.com/embed/"+u.pathname.slice(1);
    else if(["youtube.com","www.youtube.com","m.youtube.com"].includes(u.hostname)){
     const id=u.pathname==="/watch"?u.searchParams.get("v"):u.pathname.split("/").pop();
     url="https://www.youtube-nocookie.com/embed/"+id;
    }else if(["vimeo.com","www.vimeo.com"].includes(u.hostname))url="https://player.vimeo.com/video/"+u.pathname.slice(1);
    else url=address;
   }catch{return errorText("Enter a valid video URL.")}
   const safe=safeVideoURL(url);if(!safe)return errorText("Use a public YouTube or Vimeo video link.");
   format("insertHTML",'<div class="blog-video"><iframe src="'+E(safe)+'" title="Embedded article video" loading="lazy" allowfullscreen></iframe></div><p></p>');return;
  }
  if(action==="link"){const address=prompt("Enter an HTTPS URL:");if(!address)return;const href=safeURL(address);if(!href)return errorText("Choose a valid web URL.");format("createLink",href)}
  if(action==="image"){
   const insertionRange=savedRange?.cloneRange();
   const input=document.createElement("input");input.type="file";input.accept="image/png,image/jpeg,image/webp";
   input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;const url=await uploadImage(file);savedRange=insertionRange;restoreSelection();format("insertHTML",'<figure><img src="'+E(url)+'" alt="Blog image"></figure>');notify("Image added to article")}catch(err){errorText(err.message)}};
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
  const title=q("#blog-title").value.trim(),slug=slugify(q("#blog-slug").value||title),html=stripDuplicateCover(cleanBlogHTML(editor.innerHTML),q("#blog-cover").value),plain=new DOMParser().parseFromString(html,"text/html").body.textContent.trim();
  if(!title||!slug)throw Error("Article title and URL slug are required.");
  if(status==="published"&&plain.length<80)throw Error("Add the complete article content before publishing. At least 80 characters are required.");
  if(status==="published"&& !q("#blog-excerpt").value.trim())throw Error("Add an article summary before publishing.");
  if(status==="published"&&q("#blog-seo-description").value.trim().length<160)throw Error("Write an SEO description of at least 160 characters before publishing.");
  if(status==="published"&&q("#blog-seo-description").value.trim().length>500)throw Error("SEO description must be 500 characters or fewer.");
  const date=q("#blog-date").value;
  return {title,slug,excerpt:q("#blog-excerpt").value.trim(),body_html:html,author_name:q("#blog-author").value.trim()||"Andre Erving",category:q("#blog-category").value.trim()||"Insights",tags:q("#blog-tags").value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,20),seo_title:q("#blog-seo-title").value.trim()||null,seo_description:q("#blog-seo-description").value.trim()||null,seo_focus_keyword:q("#blog-seo-focus").value.trim()||null,seo_og_title:q("#blog-og-title").value.trim()||null,seo_og_description:q("#blog-og-description").value.trim()||null,seo_og_image_url:safeURL(q("#blog-og-image").value.trim(),true)||null,seo_image_alt:q("#blog-image-alt").value.trim()||null,seo_indexable:q("#blog-indexable").checked,cover_image_url:safeURL(q("#blog-cover").value.trim(),true)||null,status,published_at:date?new Date(date).toISOString():status==="published"?(selected?.published_at||new Date().toISOString()):(selected?.published_at||null),migration_status:plain?"verified":selected?.migration_status==="pending_import"?"pending_import":"native"};
 }
 async function save(status){
  if(saveBusy)return;saveBusy=true;
  const buttons=qa("#blog-save,#blog-publish");buttons.forEach(b=>b.disabled=true);
  const indicator=q("#blog-save-indicator");if(indicator)indicator.textContent=status==="published"?"Publishing…":"Saving…";
  q("#blog-error").hidden=true;
  try{
   const data=payload(status);
   const out=selected?await db.from("blog_posts").update(data).eq("id",selected.id).select().single():await db.from("blog_posts").insert(data).select().single();
   if(out.error)throw out.error;
   selected=out.data;dirty=false;q("#blog-save-indicator").textContent=status==="published"?"Published successfully":"All changes saved";
   notify(status==="published"?"Article published to andreerving.com":"Draft saved");
   q("#blog-status").value=status;
   history.replaceState(null,"","#/admin/blog_posts/edit/"+selected.id);
  }catch(error){if(indicator)indicator.textContent="Save failed";errorText(error.message||"Unable to save article")}finally{saveBusy=false;buttons.forEach(b=>b.disabled=false)}
 }
 function previewPost(){
  const content=stripDuplicateCover(cleanBlogHTML(editor.innerHTML),q("#blog-cover").value),title=q("#blog-title").value||"Untitled article",cover=safeURL(q("#blog-cover").value,true);
  const overlay=document.createElement("div");overlay.className="blog-studio-overlay blog-preview-overlay";
  overlay.innerHTML='<div class="blog-preview-dialog"><div class="blog-preview-top"><strong>Article preview</strong><button type="button" aria-label="Close preview">×</button></div><article class="blog-preview-article">'+(cover?'<img class="blog-preview-cover" src="'+E(cover)+'" alt="Article cover">':'')+'<p class="blog-studio-eyebrow">'+E(q("#blog-category").value)+'</p><h1>'+E(title)+'</h1><p class="blog-preview-meta">By '+E(q("#blog-author").value||"Andre Erving")+'</p><div class="blog-preview-copy">'+content+'</div></article></div>';
  document.body.append(overlay);overlay.querySelector("button").onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
 }
 return {list,open};
}
