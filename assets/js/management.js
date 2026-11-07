import {createLMS} from './lms.js?v=enrollment-final-20261107m';
import {createManagementOperations} from './management-operations.js?v=customer-return-20261107g';
import {createBlogStudio,cleanBlogHTML} from './blog-studio.js?v=unsaved-20261107';
import {createPodcastStudio} from './podcast-studio.js?v=upload-unsaved-20261107';
import {createUnsavedGuard} from './unsaved-guard.js?v=20261107';
import{createClient}from'https://esm.sh/@supabase/supabase-js@2.58.0';
const db=createClient('https://gnfyidajbectlppsekzj.supabase.co','sb_publishable_DGt4HrHAwWyMt-0Xtzlfog_F18RnOyf');
const unsaved=createUnsavedGuard();window.AEUnsaved=unsaved;
const app=document.querySelector('#app'),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configs={
course_extensions:{title:'Course extensions',subtitle:'Manage 30-day access extension pricing',cols:['course_id','amount','enabled'],label:'course_id'},
podcast_episodes:{title:'Podcast episodes',subtitle:'Manage The Andre Erving Show',cols:['title','status','published_at'],label:'title'},
blog_posts:{title:'Blog posts',subtitle:'Create, edit and publish articles',fields:{title:'text',slug:'text',excerpt:'textarea',body_html:'textarea',cover_image_url:'url',author_name:'text',status:['draft','published','archived'],published_at:'datetime-local',source_url:'url',migration_status:['native','pending_import','imported','verified']},cols:['title','status','updated_at'],label:'title'},
site_pages:{title:'Website pages',subtitle:'Edit main website content and search settings',fields:{title:'text',slug:'text',body_html:'textarea',status:['draft','published','archived'],seo_title:'text',seo_description:'textarea',seo_keywords:'text',canonical_url:'url',social_title:'text',social_description:'textarea',social_image_url:'url',featured_image_url:'url',seo_indexable:'checkbox'},cols:['title','slug','status'],label:'title'},
courses:{title:'Courses',subtitle:'Build and publish your training catalog',fields:{title:'text',slug:'text',short_description:'textarea',description:'textarea',category:'text',featured_image_url:'url',price:'number',compare_at_price:'number',purchase_url:'url',access_days:'number',certificate_enabled:'checkbox',status:['draft','published','archived'],sort_order:'number'},cols:['title','category','price','status'],label:'title'},
course_modules:{title:'Course modules',subtitle:'Organize modules within a course',fields:{course_id:'course',title:'text',description:'textarea',sort_order:'number'},cols:['title','course_id','sort_order'],label:'title'},
course_lessons:{title:'Lessons',subtitle:'Create content inside course modules',fields:{course_id:'course',module_id:'module',title:'text',lesson_type:['text','video','download','quiz'],content_html:'textarea',video_url:'url',resource_url:'url',duration_minutes:'number',sort_order:'number',is_preview:'checkbox'},cols:['title','lesson_type','duration_minutes'],label:'title'},
site_prices:{title:'Website prices',subtitle:'Update pricing used on the website',fields:{price_key:'text',label:'text',section:'text',amount:'number',currency:'text',active:'checkbox'},cols:['label','section','amount','active'],label:'label'},
orders:{title:'Orders',subtitle:'Read-only order records',cols:['order_number','customer_email','status','total','created_at'],label:'order_number'},
customer_profiles:{title:'Customers',subtitle:'Read-only customer directory',cols:['full_name','email','created_at'],label:'email'},
course_enrollments:{title:'Enrollments',subtitle:'Read-only course access records',cols:['user_id','course_id','status','enrolled_at'],label:'id'},
website_inquiries:{title:'Inquiries',subtitle:'Read-only messages from site visitors',cols:['name','email','interest','created_at'],label:'name'},
newsletter_signups:{title:'Newsletter',subtitle:'Newsletter subscription records',cols:['email','consent','created_at'],label:'email'},
customer_documents:{title:'Documents',subtitle:'Upload private documents to customers',cols:['title','user_id','document_type','created_at'],label:'title'},
ebook_documents:{title:'eBook library',subtitle:'Upload downloadable eBooks linked to website offerings',cols:['title','offering_id','file_name','updated_at'],label:'title'},
support_tickets:{title:'Support inbox',subtitle:'Respond to student and customer support requests',cols:['subject','category','status','created_at'],label:'subject'},
};
let user=null,section='overview',rows=[],editing=null,search='',listPage=1,lookups={courses:[],modules:[]},busy=false,adminOps=null,realtimeChannel=null;
const navGroups=[
{name:'Website',items:[['blog_posts','Blog & articles','✎'],['podcast_episodes','Podcasts','♫'],['site_pages','CMS pages','▤'],['site_prices','Pricing','$'],['ebook_documents','eBook documents','▣'],['course_extensions','Course extensions','◷'],['website_inquiries','Inquiries','✉'],['newsletter_signups','Newsletter','◎']]},
{name:'Customer portal',items:[['customer_profiles','Customer CRM','♙'],['orders','Orders & invites','▥'],['course_enrollments','Enrollments','✓'],['customer_documents','Private files','▢'],['support_tickets','Support inbox','✉']]},
{name:'Learning management',items:[['courses','Courses & programs','◈']]}
];
function menuButton([key,label,icon]){return '<a class="nav-btn" href="'+(key==="courses"?"#/lms/courses":"#/admin/"+encodeURIComponent(key))+'" data-section="'+key+'"><span class="ae-nav-icon" aria-hidden="true">'+icon+'</span><span class="ae-nav-text">'+safe(label)+'</span></a>';}
const toast=(message,error=false)=>{document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className='toast ae-toast'+(error?' ae-toast-error':'');d.setAttribute('role','status');d.innerHTML='<div class="ae-toast-icon">AE</div><div><strong>'+ (error?'Action needs attention':'Andre Erving Management')+'</strong><p></p></div><button type="button" aria-label="Dismiss notification">×</button>';d.querySelector('p').textContent=String(message);d.querySelector('button').onclick=()=>d.remove();document.body.append(d);setTimeout(()=>d.remove(),5000)};
function brandedConfirm(title,message,{destructive=false,confirmText="Continue"}={}){
return new Promise(resolve=>{const node=document.createElement('div');node.className='ae-confirm-backdrop';node.innerHTML='<section class="ae-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="ae-confirm-title"><div class="ae-confirm-brand">AE <span>ANDRE ERVING MANAGEMENT</span></div><h2 id="ae-confirm-title"></h2><p class="ae-confirm-message"></p><div class="ae-confirm-actions"><button class="btn secondary" data-no>Cancel</button><button class="btn '+(destructive?'danger':'')+'" data-yes></button></div></section>';node.querySelector('h2').textContent=title;node.querySelector('.ae-confirm-message').textContent=message;node.querySelector('[data-yes]').textContent=confirmText;document.body.append(node);const done=value=>{document.removeEventListener('keydown',keyHandler);node.remove();resolve(value)};const keyHandler=e=>{if(e.key==='Escape')done(false)};document.addEventListener('keydown',keyHandler);node.querySelector('[data-no]').onclick=()=>done(false);node.querySelector('[data-yes]').onclick=()=>done(true);node.querySelector('[data-no]').focus()});
}
function connectManagementUpdates(){
 if(realtimeChannel){db.removeChannel(realtimeChannel);realtimeChannel=null}
 if(!user)return;
 let queued=false;
 const refresh=()=>{
  if(queued||!user||!['orders','course_enrollments','support_tickets'].includes(section))return;
  if(document.querySelector('#workspace form:focus-within'))return;
  queued=true;
  setTimeout(async()=>{
   queued=false;
   if(!user||document.querySelector('#workspace form:focus-within'))return;
   try{
    if(section==='orders')await adminOps?.ordersPage();
    else if(section==='course_enrollments')await adminOps?.enrollments();
    else if(section==='support_tickets')await supportWorkspace();
   }catch(e){console.warn('Management realtime refresh error',e)}
  },350);
 };
 realtimeChannel=db.channel('andre-operations-'+user.id)
 .on('postgres_changes',{event:'*',schema:'public',table:'orders'},refresh)
 .on('postgres_changes',{event:'*',schema:'public',table:'course_enrollments'},refresh)
 .on('postgres_changes',{event:'*',schema:'public',table:'support_tickets'},refresh)
 .subscribe();
}
async function authenticate(){const {data,error}=await db.auth.getUser();user=error?null:data.user;if(user){const a=await db.from('admin_profiles').select('active,role').eq('id',user.id).maybeSingle();if(a.error||!a.data?.active){user=null;renderLogin('This account is not authorized to access management. Sign out or use an authorized staff account.',true);return}}if(!user){renderLogin();return}renderShell();connectManagementUpdates();const match=location.hash.match(/^#\/admin\/([a-z_]+)/);const target=match&&configs[match[1]]?match[1]:location.hash.startsWith('#/lms/')?'courses':'overview';await navigate(target,{fromHistory:true})}
function renderLogin(message='',authenticated=false){app.innerHTML='<main class="login-bg"><div class="login-box"><img class="ae-management-login-logo" src="assets/img/logo.png" alt="Andre Erving Growth Strategy Education"><p class="eyebrow">ANDRE ERVING MANAGEMENT</p><h1>Staff sign in</h1><p class="muted">Your operations, publishing and training workspace.</p>'+(message?'<p class="notice error">'+safe(message)+'</p>':'')+(authenticated?'<button class="btn secondary" id="logout">Sign out</button>':'<form id="login"><label>Email address<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Sign in securely</button><div class="ae-management-login-links"><a href="https://app.andreerving.com/forgot.html">Forgot your password?</a><a href="https://app.andreerving.com/reset.html">Reset password</a></div></form>')+'</div></main>';document.querySelector('#logout')?.addEventListener('click',logout);document.querySelector('#login')?.addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;const {error}=await db.auth.signInWithPassword({email:e.target.email.value,password:e.target.password.value});b.disabled=false;if(error)toast('Sign-in failed: '+error.message,true);else await authenticate()})}
function renderShell(){const navMarkup='<div class="nav-primary">'+menuButton(['overview','Overview','◫'])+'</div>'+navGroups.map((group,i)=>'<details class="nav-group" data-group="'+i+'" '+(i===0?'open':'')+'><summary>'+safe(group.name)+'</summary><div class="nav-items">'+group.items.map(menuButton).join('')+'</div></details>').join('');app.innerHTML='<div class="shell"><aside class="sidebar"><div class="brand"><img class="ae-management-sidebar-logo" src="assets/img/logo2.png" alt="Andre Erving Growth Strategy Education"><span class="ae-management-brand-label">MANAGEMENT</span></div><nav class="nav" aria-label="Management navigation">'+navMarkup+'</nav><div class="side-bottom">'+safe(user.email)+'</div></aside><div class="main"><header class="topbar"><div><strong>Operations command center</strong><div class="small">Main website + customer portal</div></div><nav class="top-actions" aria-label="Quick navigation"><a class="btn secondary" href="https://andreerving.com/" target="_blank" rel="noopener noreferrer">Website ↗</a><a class="btn secondary" href="https://app.andreerving.com/" target="_blank" rel="noopener noreferrer">Customer portal ↗</a><button class="btn secondary" id="logout" type="button">Sign out</button></nav></header><main class="workspace" id="workspace"></main></div></div>';document.querySelectorAll('[data-section]').forEach(b=>b.onclick=e=>{e.preventDefault();navigate(b.dataset.section)});document.querySelectorAll('.nav-group').forEach(group=>group.addEventListener('toggle',()=>{if(group.open)document.querySelectorAll('.nav-group').forEach(other=>{if(other!==group)other.open=false})}));document.querySelector('#logout').onclick=logout}
async function logout(){if(!await unsaved.confirm())return;unsaved.clear();if(realtimeChannel){await db.removeChannel(realtimeChannel);realtimeChannel=null}adminOps?.stop();await db.auth.signOut();user=null;renderLogin()}
async function navigate(k,{fromHistory=false}={}){
const previous=unsaved.currentURL();if(!await unsaved.confirm()){if(fromHistory)history.pushState(null,'',previous);return false}unsaved.clear();
section=k;editing=null;search='';
if(!fromHistory){const url=k==='courses'?'#/lms/courses':'#/admin/'+encodeURIComponent(k);if(location.hash!==url)history.pushState(null,'',url)}
const parent=document.querySelector('[data-section="'+k+'"]')?.closest('.nav-group');
if(parent){document.querySelectorAll('.nav-group').forEach(group=>{if(group!==parent)group.open=false});parent.open=true}
document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===k));
const w=document.querySelector('#workspace');if(!w)return;
if(!adminOps)adminOps=createManagementOperations({db,root:w,notify:toast,head,isCurrent:name=>section===name,navigateTo:name=>navigate(name)});
w.classList.toggle('ae-ebook-workspace',k==='ebook_documents');
w.classList.toggle('ae-operations-workspace',['customer_profiles','orders','course_enrollments','course_extensions'].includes(k));
w.closest('.main')?.scrollTo({top:0,behavior:'instant'});
w.innerHTML='<p class="muted">Loading…</p>';
if(k==='courses'||k==='course_modules'||k==='course_lessons'){section='courses';const studio=createLMS({db,root:w,notify:toast,safe,isCurrent:()=>section==='courses'});return studio.start()}
if(k==='overview')return overview();
if(k==='podcast_episodes'){
 const studio=createPodcastStudio({db,root:w,notify:toast,isCurrent:name=>section===name});return studio.start();
}
if(k==='blog_posts'){
 const studio=createBlogStudio({db,root:w,notify:toast,isCurrent:name=>section===name,onExit:()=>navigate('blog_posts')});
 const match=location.hash.match(/^#\/admin\/blog_posts\/edit\/([a-f0-9-]{36})$/i);
 if(match){return db.from('blog_posts').select('*').eq('id',match[1]).maybeSingle().then(({data,error})=>{if(section==='blog_posts'){if(data)studio.open(data);else{toast(error?.message||'Article unavailable',true);studio.list()}}})}
 return studio.list();
}
if(k==='customer_profiles')return adminOps.customers();
if(k==='orders')return adminOps.ordersPage();
if(k==='course_enrollments')return adminOps.enrollments();
if(k==='course_extensions')return adminOps.extensionSettings();
if(k==='ebook_documents')return ebookWorkspace();

if(k==='support_tickets')return supportWorkspace();
await loadTable();
const editorMatch=location.hash.match(/^#\/admin\/([a-z_]+)\/(new|edit)(?:\/([a-f0-9-]+))?$/i);
if(fromHistory&&editorMatch&&editorMatch[1]===k&&configs[k]?.fields){
if(editorMatch[2]==='new')await openEditor();
else{const match=rows.find(r=>r.id===editorMatch[3]);if(match)await openEditor(match);}
}
}
function head(title,subtitle,action=''){return '<div class="head"><div><div class="eyebrow">ANDRE ERVING / MANAGEMENT</div><h1>'+safe(title)+'</h1><div class="muted">'+safe(subtitle)+'</div></div>'+action+'</div>'}
async function count(table){const {count,error}=await db.from(table).select('*',{count:'exact',head:true});return error?'—':count??0}
async function overview(){
const result=await Promise.allSettled(['courses','blog_posts','customer_profiles','orders','course_enrollments','customer_documents'].map(count));
if(section!=='overview')return;
const vals=result.map(x=>x.status==='fulfilled'?x.value:'—');
const stats=[['Courses',vals[0]],['Blog posts',vals[1]],['Customers',vals[2]],['Orders',vals[3]]];
const destinations=[
{title:'Main website',url:'https://andreerving.com',repo:'https://github.com/filings4u/andreerving',description:'Content, public pricing, posts and customer inquiries.',actions:[['blog_posts','Manage blog'],['site_pages','CMS pages'],['site_prices','Pricing'],['website_inquiries','Inquiries']]},
{title:'Customer portal',url:'https://app.andreerving.com/',repo:'https://github.com/filings4u/app.andreerving.com',description:'Customer accounts, purchases, learning access and private documents.',actions:[['customer_profiles','Customers'],['orders','Orders'],['course_enrollments','Enrollments'],['customer_documents','Documents']]}
];
const cards=destinations.map(d=>'<section class="panel destination"><div class="destination-head"><div><div class="eyebrow">CONNECTED WORKSPACE</div><h2>'+safe(d.title)+'</h2><p class="muted">'+safe(d.description)+'</p></div><a class="external-link" target="_blank" rel="noopener noreferrer" href="'+safe(d.url)+'">Open site ↗</a></div><div class="destination-actions">'+d.actions.map(([id,t])=>'<button data-jump="'+id+'">'+safe(t)+' <span>→</span></button>').join('')+'</div><a class="repo-link" target="_blank" rel="noopener noreferrer" href="'+safe(d.repo)+'">View repository ↗</a></section>').join('');
const w=document.querySelector('#workspace');if(!w)return;
w.innerHTML=head('Workspace overview','Your main website and customer portal, in one operational view.')+
'<div class="workspace-intro"><div><div class="eyebrow">ANDRE ERVING · MANAGEMENT</div><h2>Manage your entire experience.</h2><p>Publish content, manage learning, and review customer operations from one place.</p></div><span class="system-pill">Supabase CMS connected</span></div>'+
'<div class="stats">'+stats.map(([label,value])=>'<div class="stat"><label>'+safe(label)+'</label><strong>'+safe(value)+'</strong><small>Records visible to staff</small></div>').join('')+'</div>'+
'<div class="destination-grid">'+cards+'</div>'+
'<section class="panel"><h2>Operations snapshot</h2><div class="activity-grid"><div><strong>'+safe(vals[4])+'</strong><span>Inquiries</span></div><div><strong>'+safe(vals[5])+'</strong><span>Enrollments</span></div><div><strong>'+safe(vals[6])+'</strong><span>Documents</span></div></div></section>';
w.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>navigate(b.dataset.jump));
}
function format(v){if(v==null)return '—';if(typeof v==='boolean')return v?'Yes':'No';if(typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v))return new Date(v).toLocaleDateString();return safe(v)}
async function loadTable(){const c=configs[section];
 if(section==='website_inquiries'||section==='newsletter_signups'){
  const current=section;
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.access_token){toast('Your management session expired. Please sign in again.',true);return}
  try{
   const response=await fetch('https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-management-operations',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({action:section==='website_inquiries'?'list_website_inquiries':'list_newsletter_signups'})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||'Unable to load protected records');
   if(section!==current)return;
   rows=result.items||[];drawTable();
  }catch(err){if(section===current)document.querySelector('#workspace').innerHTML=head(c.title,c.subtitle)+'<p class="notice error">'+safe(err.message)+'</p>'}
  return;
 }
 const q=await db.from(section).select('*').limit(200);if(section!==Object.keys(configs).find(x=>x===section))return;if(q.error){document.querySelector('#workspace').innerHTML=head(c.title,c.subtitle)+'<p class="notice error">Unable to load records: '+safe(q.error.message)+'</p>';return}rows=q.data||[];drawTable()}
function drawTable(){
 const c=configs[section],query=search.toLowerCase();
 const filtered=rows.filter(r=>Object.values(r).some(v=>String(v??'').toLowerCase().includes(query)));
 const pageCount=Math.max(1,Math.ceil(filtered.length/10));listPage=Math.max(1,Math.min(listPage,pageCount));const visible=filtered.slice((listPage-1)*10,listPage*10);
 const editable=!!c.fields;
 const total=rows.length;
 const stateCount=rows.filter(r=>r.status==='published'||r.status==='active'||r.active===true).length;
 const stateTitle=rows.some(r=>r.status==='published')?'Published':rows.some(r=>r.status==='active'||r.active===true)?'Active':'Records with activity';
 const highlights='<div class="ae-list-summary"><div class="ae-list-metric"><span>All records</span><strong>'+total+'</strong></div>'+
  '<div class="ae-list-metric"><span>Showing</span><strong>'+filtered.length+'</strong></div>'+
  (stateCount?'<div class="ae-list-metric"><span>'+stateTitle+'</span><strong>'+stateCount+'</strong></div>':'')+
  '<div class="ae-list-summary-copy"><strong>'+safe(c.title)+' workspace</strong><span>Search, review, and '+(editable?'edit':'inspect')+' your connected records.</span></div></div>';
 const emptyLabel=total?'No records match your search.':'Nothing here yet. '+(editable?'Create your first record to get started.':'Records will appear when available.');
 document.querySelector('#workspace').innerHTML=head(c.title,c.subtitle,editable?'<button class="btn" id="create">+ Create new</button>':'')+
 highlights+'<section class="panel ae-records-panel"><div class="ae-panel-heading"><div><span class="ae-editor-eyebrow">MANAGE CONTENT</span><h2>All '+safe(c.title.toLowerCase())+'</h2><p>Open a record to view or edit its details.</p></div></div>'+
 '<div class="toolbar ae-record-toolbar"><input id="search" type="search" aria-label="Search records" placeholder="Search '+safe(c.title.toLowerCase())+'…" value="'+safe(search)+'"><span class="muted">'+filtered.length+' of '+total+' records</span></div>'+
 '<div class="tablewrap"><table><thead><tr>'+c.cols.map(k=>'<th>'+safe(k.replaceAll('_',' '))+'</th>').join('')+(editable?'<th>Action</th>':'')+'</tr></thead>'+
 '<tbody>'+visible.map(r=>'<tr>'+c.cols.map(k=>'<td>'+(k==='status'?'<span class="pill '+safe(r[k])+'">'+safe(r[k])+'</span>':format(r[k]))+'</td>').join('')+
 (editable?'<td class="row-actions"><button type="button" data-edit="'+safe(r.id)+'">Open editor →</button></td>':'')+'</tr>').join('')+'</tbody></table></div>'+
 (filtered.length?'':'<div class="ae-list-empty"><span aria-hidden="true">▤</span><strong>'+safe(emptyLabel)+'</strong>'+(search?'<button type="button" id="clear-record-search">Clear search</button>':'')+'</div>')+'<nav class="ae-pagination" aria-label="Record pages"><button type="button" id="records-prev" '+(listPage===1?'disabled':'')+'>Previous</button><span>Page '+listPage+' of '+pageCount+'</span><button type="button" id="records-next" '+(listPage===pageCount?'disabled':'')+'>Next</button></nav></section>'+
 (section==='customer_documents'?documentUploader():'');
 document.querySelector('#create')?.addEventListener('click',()=>openEditor());
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(rows.find(r=>r.id===b.dataset.edit)));
 const input=document.querySelector('#search');
 input.oninput=()=>{search=input.value;listPage=1;drawTable();const el=document.querySelector('#search');el.focus();el.setSelectionRange(search.length,search.length)};
 document.querySelector('#clear-record-search')?.addEventListener('click',()=>{search='';drawTable();document.querySelector('#search')?.focus()});
 document.querySelector('#records-prev')?.addEventListener('click',()=>{listPage--;drawTable()});document.querySelector('#records-next')?.addEventListener('click',()=>{listPage++;drawTable()});
 setupUploader();
}
function documentUploader(){return '<section class="panel"><h2>Upload a private customer document</h2><p class="muted">Customer files are stored privately and linked to an existing customer account.</p><form id="upload" class="form-grid"><label class="field">Customer UUID<input name="user_id" required pattern="[a-fA-F0-9-]{36}"></label><label class="field">Document title<input name="title" required></label><label class="field wide">Choose file (20 MB max)<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" required></label><button class="btn" type="submit">Upload document</button></form></section>'}
function setupUploader(){document.querySelector('#upload')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,fd=new FormData(f),file=fd.get('file'),uid=String(fd.get('user_id')||''),title=String(fd.get('title')||'').trim();if(!file||file.size>20*1024*1024)return toast('Please select a file under 20 MB.',true);const ext=file.name.split('.').pop().toLowerCase();if(!['pdf','png','jpg','jpeg','txt','docx'].includes(ext))return toast('Unsupported file type.',true);const key=uid+'/'+crypto.randomUUID()+'.'+ext;const up=await db.storage.from('andreerving-customer-documents').upload(key,file,{upsert:false});if(up.error)return toast(up.error.message,true);const rec=await db.from('customer_documents').insert({user_id:uid,title,file_url:key,document_type:ext});if(rec.error)return toast('File stored but record failed: '+rec.error.message,true);toast('Document uploaded');await loadTable()})}
async function openEditor(row=null){
editing=row;const area=section,c=configs[area];if(!c?.fields)return;
if(Object.values(c.fields).some(type=>type==='course'||type==='module')){
const [a,b]=await Promise.all([db.from('courses').select('id,title').order('title'),db.from('course_modules').select('id,title,course_id').order('sort_order')]);
lookups.courses=a.data||[];lookups.modules=b.data||[];
}
const w=document.querySelector('#workspace');if(!w||section!==area)return;
if(row){
 const exists=await db.from(area).select('id').eq('id',row.id).maybeSingle();
 if(exists.error){toast('Unable to open this record: '+exists.error.message,true);return}
 if(!exists.data){toast('This record was deleted. Refreshing the price list.',true);await loadTable();return}
}
history.pushState(null,'','#/admin/'+encodeURIComponent(area)+'/'+(row?'edit/'+encodeURIComponent(row.id):'new'));
const entries=Object.entries(c.fields),isPageEditor=area==='site_pages',seoNames=new Set(['seo_title','seo_description','seo_keywords','canonical_url','social_title','social_description','social_image_url','featured_image_url','seo_indexable']),longEntries=entries.filter(([name,type])=>type==='textarea'&&(!isPageEditor||name==='body_html')),coreEntries=entries.filter(([name,type])=>type!=='textarea'&&(!isPageEditor||!seoNames.has(name))),seoEntries=isPageEditor?entries.filter(([name])=>seoNames.has(name)):[];
const headingTitle=(row?'Edit ':'Create ')+c.title.replace(/s$/,'');
const seoSection=isPageEditor?'<section class="ae-form-step current ae-page-seo" id="ae-editor-seo"><div class="ae-form-section-heading"><span class="ae-form-section-number">03</span><div><h2>Search and social sharing</h2><p>Control search listings, social previews, and the image used when this page is shared.</p></div></div><div class="ae-form-step-fields form-grid">'+seoEntries.map(([name,type])=>field(name,type,row)).join('')+'</div></section>':'';
w.innerHTML='<div class="ae-editor-workspace ae-admin-editor"><div class="ae-editor-topline"><a class="ae-editor-back" id="editor-back" href="#/admin/'+encodeURIComponent(area)+'">← '+safe(c.title)+'</a><span class="ae-editor-toptrail">/ '+safe(row?'Edit':'Create')+'</span></div>'+
'<div class="ae-editor-hero"><div><span class="ae-editor-eyebrow">ANDRE ERVING / CONTENT MANAGEMENT</span><h1>'+safe(headingTitle)+'</h1><p>'+safe(c.subtitle)+' · Organize your work in a focused editor.</p></div><span class="ae-editor-state">● &nbsp; '+(row?'Editing':'New')+'</span></div>'+
'<div class="ae-editor-body"><aside class="ae-editor-guide"><div class="ae-editor-guide-title"><span class="ae-guide-label">WORKSPACE</span><h3>'+safe(c.title)+'</h3><p>Keep your content organized and ready to publish.</p></div><nav class="ae-guide-steps" aria-label="Editor sections"><a class="ae-guide-step active" href="#ae-basic-fields"><span class="ae-guide-index">01</span><span><strong>Details & settings</strong><small>Title, status and metadata</small></span></a>'+(longEntries.length?'<a class="ae-guide-step" href="#ae-editor-writing"><span class="ae-guide-index">02</span><span><strong>Content</strong><small>Your description and main content</small></span></a>':'')+(isPageEditor?'<a class="ae-guide-step" href="#ae-editor-seo"><span class="ae-guide-index">03</span><span><strong>SEO & social</strong><small>Search metadata and sharing images</small></span></a>':'')+'</nav><div class="ae-guide-help"><strong>Connected workspace</strong><p>Changes remain in the editor until you save them. Your existing records and permissions are preserved.</p></div></aside>'+
'<section class="ae-editor-formcard"><form id="record-form"><section class="ae-form-step current" id="ae-basic-fields"><div class="ae-form-section-heading"><span class="ae-form-section-number">01</span><div><h2>Details & settings</h2><p>Enter the essential information for this record.</p></div></div><div class="ae-form-step-fields form-grid">'+coreEntries.map(([name,type])=>field(name,type,row)).join('')+'</div></section>'+
(longEntries.length?'<section class="ae-form-step current ae-editor-writing-section" id="ae-editor-writing"><div class="ae-form-section-heading"><span class="ae-form-section-number">02</span><div><h2>Content</h2><p>Compose the main content in a spacious writing area.</p></div></div><div class="ae-form-step-fields form-grid">'+longEntries.map(([name,type])=>field(name,type,row)).join('')+'</div></section>':'')+
seoSection+'<div class="ae-editor-footer"><span class="ae-editor-save-note">Changes are saved when you select Save changes</span><div class="ae-editor-footer-buttons"><button class="btn ae-editor-submit" type="submit">Save changes</button><a class="btn secondary" id="editor-cancel" href="#/admin/'+encodeURIComponent(area)+'">Cancel</a></div></div><p id="form-error" class="notice error hidden" role="alert"></p></form></section></div></div>';
w.querySelector('#editor-back').onclick=w.querySelector('#editor-cancel').onclick=e=>{e.preventDefault();navigate(area)};
const course=w.querySelector('[name=course_id]');if(course)course.onchange=()=>updateModuleSelect(w,course.value);
w.querySelector('form').onsubmit=save;
 if(area==='site_pages')setupPageVisualEditor(w,row);
 const editForm=w.querySelector('#record-form');if(editForm)unsaved.watch(editForm,{title:area==='site_pages'?'website page':'management record',save:async()=>{if(!editForm.isConnected)return false;editForm.requestSubmit();for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,150));if(!editForm.isConnected)return true;if(!document.querySelector('#form-error')?.classList.contains('hidden'))return false}return false}});
}
function setupPageVisualEditor(w,row){
 const form=w.querySelector('#record-form'),raw=form.elements.namedItem('body_html');
 const original=document.createElement('div');original.innerHTML=row?.body_html||'';
 const hero=original.querySelector('[data-cms-target="hero"] p');
 const body=original.querySelector('[data-cms-target="body"]');
 const prose=body?.innerHTML||[...original.childNodes].filter(n=>n.nodeType!==1||!n.matches?.('[data-cms-target="hero"]')).map(n=>n.outerHTML||n.textContent).join('');
 const panel=document.createElement('div');panel.className='ae-page-visual';
 panel.innerHTML='<div class="ae-page-visual-label"><strong>Page introduction</strong><span>Edit the message shown below the main page heading.</span></div><div id="ae-page-hero" class="ae-page-editable" role="textbox" aria-label="Page introduction" contenteditable="true" data-placeholder="Enter the introduction…">'+cleanBlogHTML(hero?.innerHTML||'')+'</div><div class="ae-page-visual-label"><strong>Page content</strong><span>Write and format your website content below.</span></div><div class="ae-page-toolbar"><button type="button" data-command="bold">Bold</button><button type="button" data-command="italic">Italic</button><button type="button" data-command="formatBlock" data-arg="h2">Heading</button><button type="button" data-command="insertUnorderedList">List</button><button type="button" id="ae-add-page-photo">Add photo</button><input id="ae-page-photo" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><div id="ae-page-content" class="ae-page-editable ae-page-body" role="textbox" aria-label="Page content" contenteditable="true" data-placeholder="Add page content…">'+cleanBlogHTML(prose)+'</div>';
 raw.closest('label').hidden=true;raw.closest('label').classList.add('ae-page-html-hidden');raw.closest('label').insertAdjacentElement('beforebegin',panel);
 const h=panel.querySelector('#ae-page-hero'),b=panel.querySelector('#ae-page-content');
 const sync=()=>{const intro=cleanBlogHTML(h.innerHTML).trim(),copy=cleanBlogHTML(b.innerHTML).trim();raw.value=(intro?'<div data-cms-target="hero"><p>'+intro+'</p></div>':'')+(copy?'<div data-cms-target="body">'+copy+'</div>':'')};
 h.oninput=sync;b.oninput=sync;
 panel.querySelectorAll('[data-command]').forEach(btn=>btn.onclick=()=>{b.focus();document.execCommand(btn.dataset.command,false,btn.dataset.arg||null);sync()});
 const upload=async file=>{
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG, or WebP image under 10 MB');
  const key='cms/'+crypto.randomUUID()+'.'+file.type.split('/')[1].replace('jpeg','jpg');
  const {error}=await db.storage.from('Andre Erving Public').upload(key,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  return db.storage.from('Andre Erving Public').getPublicUrl(key).data.publicUrl;
 };
 panel.querySelector('#ae-add-page-photo').onclick=()=>panel.querySelector('#ae-page-photo').click();
 panel.querySelector('#ae-page-photo').onchange=async e=>{try{const url=await upload(e.target.files[0]);b.focus();document.execCommand('insertImage',false,url);sync();toast('Page image uploaded')}catch(err){toast(err.message,true)}};
 for(const name of ['social_image_url','featured_image_url']){
  const input=form.elements.namedItem(name);if(!input)continue;
  const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.className='ae-image-picker';
  const button=document.createElement('button');button.type='button';button.className='btn secondary';button.textContent='Upload image';
  input.insertAdjacentElement('afterend',picker);picker.insertAdjacentElement('afterend',button);
  button.onclick=()=>picker.click();picker.onchange=async()=>{try{input.value=await upload(picker.files[0]);toast('Image uploaded')}catch(err){toast(err.message,true)}};
 }
 const seo=document.createElement('div');seo.className='ae-page-serp-preview';seo.innerHTML='<small>Google search preview</small><strong></strong><span></span><p></p>';
 const description=form.elements.namedItem('seo_description');description?.closest('label')?.insertAdjacentElement('afterend',seo);
 const update=()=>{seo.querySelector('strong').textContent=form.elements.namedItem('seo_title')?.value||form.elements.namedItem('title')?.value||'Website page';seo.querySelector('span').textContent='andreerving.com/'+(form.elements.namedItem('slug')?.value||'')+'.html';seo.querySelector('p').textContent=description?.value||'Add a description for search results.'};
 form.querySelectorAll('[name=seo_title],[name=seo_description],[name=title],[name=slug]').forEach(input=>input.addEventListener('input',update));update();
}
function field(name,type,row){const value=row?.[name],names={body_html:'Website content',seo_title:'Search title',seo_description:'Search description',seo_keywords:'Focus keywords',canonical_url:'Canonical page URL',social_title:'Social sharing title',social_description:'Social sharing description',social_image_url:'Social sharing image',featured_image_url:'Featured page image',seo_indexable:'Allow search indexing'},label=safe(names[name]||name.replaceAll('_',' ')),wide=['textarea','course','module'].includes(type)?' wide':'',input=Array.isArray(type)?'<select name="'+name+'">'+type.map(v=>'<option value="'+safe(v)+'" '+(value===v?'selected':'')+'>'+safe(v.replaceAll('_',' '))+'</option>').join('')+'</select>':type==='course'?'<select name="'+name+'" required>'+lookups.courses.map(v=>'<option value="'+safe(v.id)+'" '+(value===v.id?'selected':'')+'>'+safe(v.title)+'</option>').join('')+'</select>':type==='module'?'<select name="'+name+'" required>'+lookups.modules.filter(m=>m.course_id===(row?.course_id||lookups.courses[0]?.id)).map(v=>'<option value="'+safe(v.id)+'" '+(value===v.id?'selected':'')+'>'+safe(v.title)+'</option>').join('')+'</select>':type==='textarea'?'<textarea name="'+name+'">'+safe(value)+'</textarea>':type==='checkbox'?'<input type="checkbox" name="'+name+'" '+(value?'checked':'')+'>':'<input name="'+name+'" type="'+type+'" '+(['title','slug','price_key','label'].includes(name)?'required':'')+' value="'+safe(type==='datetime-local'&&value?String(value).slice(0,16):value??'')+'">';return '<label class="field'+wide+'">'+label+input+'</label>'}
function updateModuleSelect(modal,courseId){const old=modal.querySelector('[name=module_id]');if(!old)return;old.innerHTML=lookups.modules.filter(x=>x.course_id===courseId).map(x=>'<option value="'+safe(x.id)+'">'+safe(x.title)+'</option>').join('')}
async function save(e){e.preventDefault();if(busy)return;const form=e.target,c=configs[section],data={};for(const [name,type]of Object.entries(c.fields)){const input=form.elements.namedItem(name);let value=type==='checkbox'?input.checked:input.value.trim();if(type==='number')value=value===''?null:Number(value);if(type==='datetime-local')value=value?new Date(value).toISOString():null;if(['url','datetime-local'].includes(type)&&value==='')value=null;data[name]=value}
if(data.slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug))return formError('Use lowercase letters, numbers and hyphens in the slug.');
if(section==='blog_posts'&&data.status==='published'&&(!data.body_html?.trim()||data.migration_status==='pending_import'))return formError('A published article must have content and cannot be pending import.');
if(section==='blog_posts'&&data.status==='published'&&!data.published_at)data.published_at=new Date().toISOString();
if(section==='course_lessons'&&!data.module_id)return formError('Create a module in this course before adding lessons.');
busy=true;
let result;
try{
 result=editing
  ?await db.from(section).update(data).eq('id',editing.id).select('id').maybeSingle()
  :await db.from(section).insert(data).select('id').maybeSingle();
}finally{busy=false}
if(result.error)return formError(result.error.message);
if(!result.data?.id){
 if(editing){
  const check=await db.from(section).select('id').eq('id',editing.id).maybeSingle();
  if(check.error)return formError(check.error.message);
  if(!check.data){toast('This record no longer exists. The list has been refreshed.',true);history.replaceState(null,'','#/admin/'+encodeURIComponent(section));await loadTable();return}
 }
 return formError('No record was saved. Check your permissions and try again.');
}
unsaved.clean();toast(editing?'Record updated':'Record created');
history.replaceState(null,'','#/admin/'+encodeURIComponent(section));
await loadTable()}
function formError(message){const p=document.querySelector('#form-error');p.textContent=message;p.classList.remove('hidden')}


async function ebookWorkspace(){
 const w=document.querySelector('#workspace');
 const [catalog,docs]=await Promise.all([
   db.from('site_prices').select('price_key,label,amount').eq('section','Resources').like('price_key','offering.ebook-%').order('label'),
   db.from('ebook_documents').select('*').order('title')
 ]);
 if(section!=='ebook_documents')return;
 if(catalog.error||docs.error){w.innerHTML=head('eBook documents','Private downloadable files')+'<p class="notice error">'+safe(catalog.error?.message||docs.error?.message)+'</p>';return}
 const items=catalog.data||[],existing=new Map((docs.data||[]).map(d=>[d.offering_id,d]));
 w.innerHTML=head('eBook document library','Upload PDF and EPUB files for verified customer downloads.')+
 '<section class="panel ae-ebook-upload-panel"><div class="ae-ebook-panel-heading"><span class="ae-ebook-section-label">DOCUMENT UPLOAD</span><h2>Upload an eBook</h2></div><p class="muted">Select the matching website title. The file will be private and accessible only after a verified order.</p>'+
 '<form id="ebook-upload" class="form-grid ae-ebook-form"><label class="field wide">eBook<select name="offering_id" required><option value="">Choose an eBook</option>'+items.map(p=>'<option value="'+safe(p.price_key.slice(9))+'">'+safe(p.label)+' — '+(Number(p.amount)===0?'Free':'USD '+Number(p.amount).toFixed(2))+'</option>').join('')+'</select></label>'+
 '<div class="field wide"><label for="ae-ebook-file">PDF or EPUB, maximum 50 MB</label><div class="ae-file-chooser"><input id="ae-ebook-file" name="file" type="file" accept=".pdf,.epub" required><label class="ae-file-trigger" for="ae-ebook-file">Choose PDF or EPUB</label><span class="ae-file-name" id="ae-ebook-filename">No document selected</span></div></div><div class="ae-ebook-form-footer"><p id="ebook-upload-message" role="status" class="muted"></p><button class="btn ae-ebook-submit" type="submit">Upload eBook</button></div></form></section>'+
 '<section class="panel ae-ebook-list-panel"><div class="ae-ebook-list-heading"><div><span class="ae-ebook-section-label">EBOOK LIBRARY</span><h2>Uploaded documents</h2></div><span class="ae-ebook-count">'+(docs.data||[]).length+' of '+items.length+' uploaded</span></div><div class="tablewrap"><table><thead><tr><th>eBook</th><th>Price</th><th>File</th><th>Updated</th><th>Actions</th></tr></thead><tbody>'+
 items.map(p=>{const id=p.price_key.slice(9),d=existing.get(id);return '<tr><td>'+safe(p.label)+'</td><td>'+(Number(p.amount)===0?'Free':'USD '+Number(p.amount).toFixed(2))+'</td><td>'+(d?safe(d.file_name):'<span class="muted">Not uploaded</span>')+'</td><td>'+(d?format(d.updated_at):'—')+'</td><td>'+(d?'<div class="ae-ebook-actions"><button class="btn secondary ae-ebook-preview" type="button" data-ebook-preview="'+safe(id)+'">Preview</button><button class="btn secondary ae-ebook-remove" type="button" data-ebook-remove="'+safe(id)+'">Remove</button></div>':'—')+'</td></tr>'}).join('')+'</tbody></table></div></section>';
 const ebookFileInput=w.querySelector('#ae-ebook-file');
 ebookFileInput?.addEventListener('change',()=>{
  const file=ebookFileInput.files?.[0];
  w.querySelector('#ae-ebook-filename').textContent=file?file.name:'No document selected';
 });
 const form=w.querySelector('#ebook-upload');
 form.onsubmit=async event=>{
  event.preventDefault();
  const submit=form.querySelector('button[type=submit]'),message=w.querySelector('#ebook-upload-message');
  const offering=form.elements.namedItem('offering_id').value,file=form.elements.namedItem('file').files?.[0];
  const ext=file?.name?.split('.').pop()?.toLowerCase();
  if(!items.some(x=>x.price_key==='offering.'+offering)||!file||file.size===0||file.size>52428800||!['pdf','epub'].includes(ext))return toast('Choose an eBook and a PDF or EPUB under 50 MB.',true);
  const path=offering+'/'+crypto.randomUUID()+'.'+ext;
  submit.disabled=true;message.textContent='Uploading the eBook…';
  try{
   const upload=await db.storage.from('ebook-files').upload(path,file,{upsert:false,contentType:ext==='pdf'?'application/pdf':'application/epub+zip'});
   if(upload.error)throw Error(upload.error.message);
   const entry={offering_id:offering,title:items.find(x=>x.price_key==='offering.'+offering).label,storage_path:path,file_name:file.name,uploaded_by:user.id,updated_at:new Date().toISOString()};
   const record=await db.from('ebook_documents').upsert(entry,{onConflict:'offering_id'});
   if(record.error){await db.storage.from('ebook-files').remove([path]);throw Error(record.error.message)}
   const former=existing.get(offering);
   if(former?.storage_path)await db.storage.from('ebook-files').remove([former.storage_path]);
   toast('eBook uploaded and linked to the selected title.');await ebookWorkspace();
  }catch(err){message.textContent=err.message;toast(err.message,true)}
  finally{submit.disabled=false}
 };
 w.querySelectorAll('[data-ebook-preview]').forEach(button=>button.onclick=async()=>{
  const doc=existing.get(button.dataset.ebookPreview);
  const result=await db.storage.from('ebook-files').createSignedUrl(doc.storage_path,90);
  if(result.error)return toast(result.error.message,true);
  window.open(result.data.signedUrl,'_blank','noopener,noreferrer');
 });
 w.querySelectorAll('[data-ebook-remove]').forEach(button=>button.onclick=async()=>{
  const doc=existing.get(button.dataset.ebookRemove);
  const approved=await brandedConfirm('Remove eBook file','Remove the current eBook PDF or EPUB? Purchases and records will not be deleted.',{destructive:true,confirmText:'Remove'});
  if(!approved)return;
  const removed=await db.from('ebook_documents').delete().eq('id',doc.id);
  if(removed.error)return toast(removed.error.message,true);
  const file=await db.storage.from('ebook-files').remove([doc.storage_path]);
  if(file.error)toast('Record removed, but file cleanup failed: '+file.error.message,true);
  else toast('eBook file removed.');
  await ebookWorkspace();
 });
}

async function enrollmentsWorkspace(){
const w=document.querySelector('#workspace');
const [customers,courses,enrollments]=await Promise.all([
db.from('customer_profiles').select('id,email,full_name').order('email').limit(250),
db.from('courses').select('id,title,status').order('title').limit(250),
db.from('course_enrollments').select('id,user_id,course_id,status,enrolled_at,expires_at').order('enrolled_at',{ascending:false}).limit(250)
]);
if(section!=='course_enrollments')return;
const errors=[customers,courses,enrollments].filter(x=>x.error).map(x=>x.error.message);
if(errors.length){w.innerHTML=head('Enrollments','Manage customer access')+'<p class="notice error">'+safe(errors.join('; '))+'</p>';return}
const people=customers.data||[],catalog=courses.data||[],items=enrollments.data||[];
const activeCount=items.filter(x=>x.status==='active').length;
w.innerHTML=head('Enrollments','Grant, review or revoke student access to real courses')+
'<div class="ae-operations-intro"><div><span class="ae-editor-eyebrow">LEARNING ACCESS</span><h2>Student enrollment center</h2><p>Assign courses, manage active access, and follow training participation from one workspace.</p></div><div class="ae-operations-stats"><div><strong>'+items.length+'</strong><span>Total enrollments</span></div><div><strong>'+activeCount+'</strong><span>Active learners</span></div></div></div>'+
'<div class="ae-enrollment-grid"><div class="panel ae-operation-form"><div class="ae-panel-heading"><span class="ae-editor-eyebrow">ACCESS MANAGEMENT</span><h2>Grant course access</h2><p>Select a customer and their learning program to create enrollment.</p></div><form id="enroll-form" class="form-grid"><label class="field">Customer<select name="user_id" required><option value="">Choose customer</option>'+people.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.full_name||x.email)+' ('+safe(x.email)+')</option>').join('')+'</select></label><label class="field">Course<select name="course_id" required><option value="">Choose course</option>'+catalog.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.title)+' · '+safe(x.status)+'</option>').join('')+'</select></label><label class="field">Access ends (optional)<input type="date" name="expires_at"></label><div class="form-actions"><button class="btn" type="submit">Grant course access</button></div></form><p class="muted ae-enrollment-note">This grants training access only. It does not create an order or charge the customer.</p></div>'+
'<div class="panel ae-operation-records"><div class="ae-panel-heading"><span class="ae-editor-eyebrow">ENROLLMENT RECORDS</span><h2>Current enrollments</h2><p>Review student access and take action on a specific enrollment.</p></div><div class="tablewrap"><table><thead><tr><th>Customer</th><th>Course</th><th>Status</th><th>Enrolled</th><th>Action</th></tr></thead><tbody>'+items.map(e=>'<tr><td>'+safe(people.find(p=>p.id===e.user_id)?.email||e.user_id)+'</td><td>'+safe(catalog.find(x=>x.id===e.course_id)?.title||e.course_id)+'</td><td><span class="pill '+safe(e.status)+'">'+safe(e.status)+'</span></td><td>'+format(e.enrolled_at)+'</td><td>'+(e.status==='active'?'<button class="btn secondary" data-revoke="'+safe(e.id)+'">Revoke</button>':e.status==='cancelled'?'<button class="btn secondary" data-restore="'+safe(e.id)+'">Restore</button>':'—')+'</td></tr>').join('')+'</tbody></table></div>'+(items.length?'':'<p class="empty">No enrollments yet.</p>')+'</div></div>';
w.querySelector('#enroll-form').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.target),uid=String(fd.get('user_id')||''),cid=String(fd.get('course_id')||'');if(!people.some(p=>p.id===uid)||!catalog.some(x=>x.id===cid))return toast('Choose an existing customer and course.',true);const duplicate=items.find(x=>x.user_id===uid&&x.course_id===cid);if(duplicate)return toast('This customer already has a course record. Restore cancelled access or edit the existing enrollment.',true);const expires=String(fd.get('expires_at')||'');const body={user_id:uid,course_id:cid,status:'active',expires_at:expires?new Date(expires+'T23:59:59Z').toISOString():null};const r=await db.from('course_enrollments').insert(body);if(r.error)return toast('Enrollment failed: '+r.error.message,true);toast('Course access granted');await enrollmentsWorkspace()};
w.querySelectorAll('[data-revoke],[data-restore]').forEach(b=>b.onclick=async()=>{const restore=b.hasAttribute('data-restore');const id=b.dataset.revoke||b.dataset.restore;if(!restore&&!await brandedConfirm('Revoke course access','This student will lose access to the course.',{destructive:true,confirmText:'Revoke access'}))return;const r=await db.from('course_enrollments').update({status:restore?'active':'cancelled'}).eq('id',id);if(r.error)return toast(r.error.message,true);toast(restore?'Access restored':'Access revoked');await enrollmentsWorkspace()});
}
async function supportWorkspace(selected=null){
const w=document.querySelector('#workspace');
const {data:tickets,error}=await db.from('support_tickets').select('id,user_id,subject,category,status,priority,created_at').order('created_at',{ascending:false}).limit(250);
if(section!=='support_tickets')return;
if(error){w.innerHTML=head('Support inbox','Customer support')+'<p class="notice error">'+safe(error.message)+'</p>';return}
const list=tickets||[],focus=list.find(t=>t.id===selected)||list[0];
w.innerHTML=head('Support inbox','Manage student and customer questions from one place')+
'<div class="ae-support-intro"><div><span class="ae-editor-eyebrow">CUSTOMER SUCCESS</span><h2>Conversations & requests</h2><p>Review incoming messages, respond to students, and resolve support requests.</p></div><div class="ae-support-counters"><div><strong>'+list.length+'</strong><span>All tickets</span></div><div><strong>'+list.filter(t=>t.status==='open'||t.status==='in_progress').length+'</strong><span>Needs attention</span></div></div></div>'+
'<div class="support-grid ae-support-workspace"><section class="panel"><h2>Tickets ('+list.length+')</h2>'+(list.length?list.map(t=>'<button class="support-ticket '+(focus?.id===t.id?'selected':'')+'" data-ticket="'+safe(t.id)+'"><strong>'+safe(t.subject)+'</strong><small>'+safe(t.category)+' · '+safe(t.status.replace('_',' '))+' · '+format(t.created_at)+'</small></button>').join(''):'<p class="empty">No support tickets yet.</p>')+'</section>'+
'<section class="panel">'+(focus?'<div class="support-header"><div><h2>'+safe(focus.subject)+'</h2><p class="muted">Customer ID: '+safe(focus.user_id)+'</p></div><label class="field">Status<select id="ticket-status">'+['open','in_progress','resolved','closed'].map(s=>'<option value="'+s+'" '+(s===focus.status?'selected':'')+'>'+s.replace('_',' ')+'</option>').join('')+'</select></label></div><div class="support-messages" id="support-messages">Loading conversation…</div><form id="support-reply"><label class="field">Reply<textarea name="message" required maxlength="10000" placeholder="Reply to the student"></textarea></label><button class="btn" type="submit">Send reply</button></form>':'<h2>Choose a support request</h2><p class="muted">Messages will appear here.</p>')+'</section></div>';
w.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>supportWorkspace(b.dataset.ticket));
if(!focus)return;
const messages=w.querySelector('#support-messages');
const {data:thread,error:threadError}=await db.from('support_messages').select('message,sender_id,created_at').eq('ticket_id',focus.id).order('created_at');
if(section!=='support_tickets')return;
messages.innerHTML=threadError?'<p class="notice error">'+safe(threadError.message)+'</p>':(thread||[]).map(m=>'<div class="support-message '+(m.sender_id===user.id?'staff':'')+'"><p>'+safe(m.message)+'</p><small>'+ (m.sender_id===user.id?'You':'Customer')+' · '+format(m.created_at)+'</small></div>').join('')||'<p class="muted">No messages yet.</p>';
w.querySelector('#ticket-status').onchange=async e=>{const r=await db.from('support_tickets').update({status:e.target.value,updated_at:new Date().toISOString()}).eq('id',focus.id);if(r.error)return toast(r.error.message,true);toast('Ticket updated');supportWorkspace(focus.id)};
w.querySelector('#support-reply').onsubmit=async e=>{e.preventDefault();const message=String(new FormData(e.target).get('message')||'').trim();if(!message)return;const r=await db.from('support_messages').insert({ticket_id:focus.id,sender_id:user.id,message});if(r.error)return toast('Reply failed: '+r.error.message,true);toast('Reply sent');supportWorkspace(focus.id)};
}
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')renderLogin()});window.addEventListener('popstate',()=>{if(!user||!/^#\/(?:admin|lms)\//.test(location.hash))return;const m=location.hash.match(/^#\/admin\/([a-z_]+)/);if(m&&configs[m[1]])navigate(m[1],{fromHistory:true});else if(location.hash.startsWith('#/lms/'))navigate('courses',{fromHistory:true});else navigate('overview',{fromHistory:true})});
authenticate().catch(e=>renderLogin(e.message));
