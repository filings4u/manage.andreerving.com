import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const supabase=createClient('https://gnfyidajbectlppsekzj.supabase.co','sb_publishable_DGt4HrHAwWyMt-0Xtzlfog_F18RnOyf');
const $=id=>document.getElementById(id),admin=true,status=$('status');
function say(x){status.textContent=x}
function el(tag,text){const node=document.createElement(tag);node.textContent=String(text??'');return node}
async function refresh(){const {data:{user}}=await supabase.auth.getUser();$('login').hidden=!!user;$('dashboard').hidden=!user;$('signout').hidden=!user;document.body.classList.remove('signed-in');if(!user)return;if(admin){const {data,error}=await supabase.from('admin_profiles').select('role,active').eq('id',user.id).single();if(error||!data?.active){$('dashboard').hidden=true;say('This account does not have management access.');return}document.body.classList.add('signed-in');say('Signed in as '+user.email);await showTable('blog_posts')}else{say('Signed in as '+user.email);await showCustomer()}}
$('login').addEventListener('submit',async e=>{e.preventDefault();const email=$('email').value.trim();const password=$('password').value;const {error}=await supabase.auth.signInWithPassword({email,password});say(error?'Sign in failed. Verify your credentials.':'Signed in.')});
$('signout').addEventListener('click',async()=>{await supabase.auth.signOut();location.reload()});
async function showCustomer(){for(const [table,target,cols] of [['orders','orders','order_number,status,total,created_at'],['course_enrollments','enrollments','id,course_id,status,enrolled_at'],['customer_documents','documents','id,title,description,file_url']]){const box=$(target);box.replaceChildren();const {data,error}=await supabase.from(table).select(cols).limit(100);if(error){box.textContent='Unable to load this section.';continue}if(!data?.length){box.textContent='No records yet.';continue}for(const row of data){const item=el('div',Object.values(row).filter(Boolean).join(' · '));item.className='item';if(table==='customer_documents' && row.file_url && !row.file_url.startsWith('http')){const download=el('button','Download securely');download.onclick=async()=>{const {data,error}=await supabase.storage.from('andreerving-customer-documents').createSignedUrl(row.file_url,60);if(error||!data?.signedUrl){say('Unable to generate a download link.');return}window.open(data.signedUrl,'_blank','noopener')};item.append(' ',download)}if(table==='course_enrollments' && row.course_id && row.status==='active'){const link=el('a','Open training');link.href='training.html?course='+encodeURIComponent(row.course_id);item.append(' ',link)}box.append(item)}}}
const layouts={
blog_posts:['slug','title','excerpt','body_html','cover_image_url','author_name','status','published_at','source_url','migration_status'],
site_pages:['slug','title','body_html','status'],
courses:['slug','title','short_description','description','category','featured_image_url','price','status','sort_order'],
course_modules:['course_id','title','description','sort_order'],
course_lessons:['course_id','module_id','title','lesson_type','content_html','video_url','resource_url','duration_minutes','sort_order','is_preview']
};let active='blog_posts',current=null;
async function showTable(table){if(!admin)return;active=table;current=null;const box=$('items');box.replaceChildren();const {data,error}=await supabase.from(table).select('*').limit(100);if(error){say(error.message);return}box.append(el('h2',table.replaceAll('_',' ')));if(!layouts[table]){for(const item of data||[]){const row=el('div',Object.entries(item).filter(([key])=>!['file_url','phone'].includes(key)).map(([key,value])=>key+': '+String(value??'')).join(' · '));row.className='item';box.append(row)}$('editor').replaceChildren();$('editor-title').textContent='Read-only records';return}const add=el('button','Create new');add.onclick=()=>renderEditor();box.append(add);for(const item of data||[]){const row=el('div',item.title||item.slug||item.id);row.className='item';const edit=el('button','Edit');edit.onclick=()=>renderEditor(item);row.append(' ',edit);box.append(row)}renderEditor()}
function renderEditor(item=null){current=item;const form=$('editor');form.replaceChildren();$('editor-title').textContent=(item?'Edit ':'Create ')+active.replaceAll('_',' ');for(const field of layouts[active]){const label=el('label',field.replaceAll('_',' '));if(['course_id','module_id'].includes(field)){const note=el('small','Use the UUID from the Courses or Modules tab.');label.append(note)}const input=document.createElement(['body_html','content_html','description','excerpt','short_description'].includes(field)?'textarea':'input');input.name=field;if(field==='status'||field==='lesson_type'||field==='migration_status'){const select=document.createElement('select');select.name=field;const choices=field==='status'?(active==='courses'?['draft','published','archived']:['draft','published','archived']):field==='lesson_type'?['text','video','download','quiz']:['native','pending_import','imported','verified'];for(const choice of choices){const opt=document.createElement('option');opt.value=choice;opt.textContent=choice.replaceAll('_',' ');select.append(opt)}select.value=item?.[field]||choices[0];label.append(select);form.append(label);continue}if(field==='is_preview')input.type='checkbox';else if(field==='price'||field==='sort_order'||field==='duration_minutes')input.type='number';else if(field==='published_at')input.type='datetime-local';else if(field==='cover_image_url'||field==='featured_image_url'||field==='video_url'||field==='resource_url'||field==='source_url')input.type='url';else if(input.tagName==='INPUT')input.type='text';if(item&&item[field]!=null){if(input.type==='checkbox')input.checked=!!item[field];else input.value=input.type==='datetime-local'?String(item[field]).slice(0,16):item[field]}label.append(input);form.append(label)}if(['course_modules','course_lessons'].includes(active))populateRelations(form,item);
const save=el('button','Save changes');save.type='submit';form.append(save);if(active==='blog_posts'||active==='site_pages'){const preview=el('button','Preview draft text');preview.type='button';preview.onclick=()=>{const body=form.querySelector('[name="body_html"]')?.value||'';const panel=$('draft-preview');if(panel){panel.textContent=body.replace(/<[^>]*>/g,'').slice(0,20000);panel.hidden=false}};form.append(preview)}}
$('editor')?.addEventListener('submit',async e=>{e.preventDefault();const data={};for(const input of e.currentTarget.elements){if(!input.name)continue;let v=input.type==='checkbox'?input.checked:input.value.trim();if(v===''&&['published_at','video_url','resource_url','cover_image_url','featured_image_url'].includes(input.name))v=null;if(v!==null&&['price','sort_order','duration_minutes'].includes(input.name))v=Number(v||0);data[input.name]=v}if(active==='blog_posts' && data.status==='published' && !String(data.body_html||'').trim()){say('Cannot publish an empty article. Import and review the full article first.');return;}
if((active==='blog_posts'||active==='site_pages')&&data.slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)){say('Use a lowercase URL slug with letters, numbers, and hyphens.');return}
if(['course_modules','course_lessons'].includes(active)&&(!/^[0-9a-f-]{36}$/i.test(data.course_id||'')||(active==='course_lessons'&&!/^[0-9a-f-]{36}$/i.test(data.module_id||'')))){say('Select a valid course and module identifier.');return}
if(active==='course_lessons'&&(!data.module_id||data.module_id==='')){say('Create a module for this course before adding lessons.');return}
if(active==='blog_posts'){
 if(data.status==='published'&&data.migration_status==='pending_import'){say('Import and verify the original article before publishing.');return}
 if(data.status==='published'&&!data.published_at)data.published_at=new Date().toISOString();
 if(data.published_at)data.published_at=new Date(data.published_at).toISOString();
}
const query=current?supabase.from(active).update(data).eq('id',current.id):supabase.from(active).insert(data);const {error}=await query;if(error){say(error.message);return}say('Saved.');await showTable(active)});
document.querySelectorAll('[data-table]').forEach(b=>b.addEventListener('click',()=>showTable(b.dataset.table)));supabase.auth.onAuthStateChange(()=>{setTimeout(refresh,0)});refresh();
const upload=document.getElementById('upload-document');
upload?.addEventListener('submit',async event=>{
 event.preventDefault();
 const fields=new FormData(upload);
 const userId=String(fields.get('user_id')||'').trim();
 const title=String(fields.get('title')||'').trim();
 const file=fields.get('document_file');
 if(!/^[a-f0-9-]{36}$/i.test(userId)||!title||!(file instanceof File)){say('Enter a valid customer ID, title, and file.');return}
 if(file.size>20971520){say('File exceeds 20 MB maximum.');return}
 const ext=file.name.split('.').pop()?.toLowerCase();
 if(!['pdf','png','jpg','jpeg','txt','docx'].includes(ext)){say('File type not allowed.');return}
 const key=userId+'/'+crypto.randomUUID()+'.'+ext;
 const {error:uploadError}=await supabase.storage.from('andreerving-customer-documents').upload(key,file,{upsert:false});
 if(uploadError){say('Upload failed: '+uploadError.message);return}
 const {error:recordError}=await supabase.from('customer_documents').insert({user_id:userId,title,file_url:key,document_type:ext});
 if(recordError){say('File uploaded, but its database record could not be saved. Contact an administrator.');return}
 upload.reset();say('Private document uploaded to the customer.');
});

async function populateRelations(form,item){
 const courseField=form.querySelector('[name="course_id"]');
 if(courseField){const {data}=await supabase.from('courses').select('id,title').order('title');if(data?.length){const select=document.createElement('select');select.name='course_id';for(const course of data){const option=document.createElement('option');option.value=course.id;option.textContent=course.title;select.append(option)}select.value=item?.course_id||data[0].id;courseField.replaceWith(select)}}
 const moduleField=form.querySelector('[name="module_id"]');
 if(moduleField){const fill=async()=>{const courseId=form.querySelector('[name="course_id"]')?.value;const {data}=await supabase.from('course_modules').select('id,title').eq('course_id',courseId).order('sort_order');const select=document.createElement('select');select.name='module_id';for(const module of data||[]){const option=document.createElement('option');option.value=module.id;option.textContent=module.title;select.append(option)}if(item?.module_id&&data?.some(m=>m.id===item.module_id))select.value=item.module_id;form.querySelector('[name="module_id"]')?.replaceWith(select)};await fill();form.querySelector('[name="course_id"]')?.addEventListener('change',fill)}
}
