const ENDPOINT="https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-email-marketing";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate=v=>v?new Date(v).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
const statuses={active:"Active",inactive:"Non active"};
const nav=[["campaigns","Campaigns"],["create","Email creator"],["contacts","All contacts"],["import","Import contacts"],["delivery","Delivery insights"]];
export function createEmailMarketing({db,root,notify,isCurrent}){
 let data={contacts:[],campaigns:[],deliveries:[]},page="campaigns",activeCampaign=null,activeContact=null,mode="visual",filter="",importRows=[],busy=false;
 const notice=(text,error=false)=>{const e=root.querySelector("#em-status");if(e){e.textContent=text;e.classList.toggle("error",error)}else notify(text,error)};
 async function api(action,payload={}){
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw Error("Sign in to management again");
  const r=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...payload})});
  const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||"Email marketing service unavailable");return x;
 }
 async function fetchData(){const r=await api("overview");data={contacts:r.contacts||[],campaigns:r.campaigns||[],deliveries:r.deliveries||[]}}
 function head(title,desc,action=""){
  return '<div class="em-head"><div><span class="em-eyebrow">ANDRE ERVING / EMAIL MARKETING</span><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p></div>'+action+'</div>';
 }
 function frame(body){return '<div class="em-shell"><nav class="em-tabs" aria-label="Email Marketing">'+nav.map(([k,l])=>'<button type="button" data-em-tab="'+k+'" class="'+(page===k?'current':'')+'">'+l+'</button>').join("")+'</nav>'+body+'<p id="em-status" role="status" aria-live="polite" class="em-notice"></p></div>'}
 function stats(){const active=data.contacts.filter(c=>c.status==="active"&&c.consent_at&&!c.unsubscribed_at&&!c.suppression_reason).length;return '<div class="em-stats">'+[
  ["Total contacts",data.contacts.length],["Sendable contacts",active],["Campaigns",data.campaigns.length],["Tracked deliveries",data.deliveries.length]
 ].map(([label,value])=>'<section class="em-stat"><span>'+label+'</span><strong>'+Number(value).toLocaleString()+'</strong></section>').join("")+'</div>'}
 function campaigns(){
  return head("Email campaigns","Create, design, preview and manage branded campaigns.",'<button class="em-primary" data-em-new>Create campaign</button>')+stats()+
  '<section class="em-card"><div class="em-card-heading"><h2>Campaign library</h2><p>Open any campaign to view its content and delivery results.</p></div><div class="em-table"><table><thead><tr><th>Campaign</th><th>Subject</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>'+
  (data.campaigns.map(c=>'<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.subject)+'</td><td><span class="em-chip">'+esc(c.status)+'</span></td><td>'+fmtDate(c.updated_at)+'</td><td><div class="em-actions"><button data-em-view="'+c.id+'">View</button>'+(c.status==="draft"?'<button data-em-edit="'+c.id+'">Edit</button>':'')+'<button data-em-report="'+c.id+'">Delivery</button></div></td></tr>').join("")||'<tr><td colspan="5">No campaigns yet. Create your first email with the Email Creator.</td></tr>')+
  '</tbody></table></div></section>';
 }
 function contacts(){
  const visible=data.contacts.filter(c=>[c.first_name,c.last_name,c.email,c.phone].some(t=>String(t||"").toLowerCase().includes(filter.toLowerCase())));
  return head("Email marketing contacts","A separate marketing list, independent of Customer CRM.",'<button class="em-primary" data-em-add>Add contact</button>')+stats()+
  '<section class="em-card"><div class="em-card-heading"><h2>All contacts</h2><input type="search" id="em-search" placeholder="Search name, email or phone" value="'+esc(filter)+'" aria-label="Search contacts"></div><div class="em-table"><table><thead><tr><th>First name</th><th>Last name</th><th>Email</th><th>Phone</th><th>Active / Non active</th><th>Actions</th></tr></thead><tbody>'+
  (visible.map(c=>'<tr><td>'+esc(c.first_name)+'</td><td>'+esc(c.last_name)+'</td><td>'+esc(c.email)+'</td><td>'+esc(c.phone||"—")+'</td><td><span class="em-chip '+(c.status==="active"?"em-active":"")+'">'+esc(statuses[c.status]||c.status)+(c.unsubscribed_at?' · Unsubscribed':c.suppression_reason?' · Suppressed':'')+'</span></td><td><div class="em-actions"><button data-em-contact="'+c.id+'">View</button><button data-em-status="'+c.id+'" data-status="'+(c.status==="active"?"inactive":"active")+'" '+(c.unsubscribed_at||c.suppression_reason?'disabled title="This contact is suppressed"':'')+'>'+(c.status==="active"?"Deactivate":"Activate")+'</button></div></td></tr>').join("")||'<tr><td colspan="6">No contacts found.</td></tr>')+'</tbody></table></div></section>';
 }
 function contactDetail(c=null){
  return head(c?"View marketing contact":"Add marketing contact","Manage contact information and consent. This does not modify Customer CRM.")+
  '<button class="em-secondary" data-em-tab="contacts">← All contacts</button><section class="em-card"><form id="em-contact-form" class="em-form"><div class="em-form-grid">'+
  '<label>First name<input name="firstName" maxlength="100" value="'+esc(c?.first_name||"")+'"></label>'+
  '<label>Last name<input name="lastName" maxlength="100" value="'+esc(c?.last_name||"")+'"></label>'+
  '<label>Email address<input type="email" name="email" required maxlength="254" value="'+esc(c?.email||"")+'"></label>'+
  '<label>Phone<input name="phone" type="tel" maxlength="40" value="'+esc(c?.phone||"")+'"></label>'+
  '<label>Status<select name="status"><option value="inactive" '+(c?.status!=="active"?"selected":"")+'>Non active</option><option value="active" '+(c?.status==="active"?"selected":"")+'>Active</option></select></label></div>'+
  '<label class="em-check"><input name="consent" type="checkbox" '+(c?.consent_at?"checked":"")+'><span>I confirm this contact explicitly opted in to receive marketing emails.</span></label>'+
  '<label>Consent source (required for new active contacts)<input name="consentSource" placeholder="e.g. Newsletter signup, date and source" maxlength="200" value="'+esc(c?.consent_source||"")+'"></label>'+
  (c?.unsubscribed_at?'<p class="em-warning">This contact unsubscribed. They cannot be reactivated by an import or ordinary status edit.</p>':'')+
  '<div class="em-actions"><button class="em-primary" type="submit">Save contact</button><button type="button" class="em-secondary" data-em-tab="contacts">Cancel</button></div></form></section>';
 }
 function editor(){
  const c=activeCampaign||{};
  return head(c.id?"Edit email campaign":"Create email campaign","A full writing workspace with formatting, images, links, HTML and live preview.",'<button class="em-secondary" data-em-view="'+(c.id||"")+'" '+(!c.id?'disabled':'')+'>View campaign</button>')+
  '<div class="em-editor-grid"><section class="em-card em-compose"><div class="em-card-heading"><h2>Campaign details</h2><span class="em-chip">'+esc(c.status||"Draft")+'</span></div>'+
  '<form id="em-campaign-form" class="em-form">'+
  '<label>Campaign name<input name="name" required maxlength="200" value="'+esc(c.name||"")+'" placeholder="November course announcement"></label>'+
  '<label>Subject line<input name="subject" required maxlength="250" value="'+esc(c.subject||"")+'" placeholder="A new resource from Andre Erving"></label>'+
  '<label>Preview text<input name="previewText" maxlength="240" value="'+esc(c.preview_text||"")+'" placeholder="A short line visible in the inbox"></label>'+
  '<label>From name<input name="senderName" maxlength="120" value="'+esc(c.sender_name||"Andre Erving")+'"></label>'+
  '<div class="em-card-heading"><h2>Email content</h2><div class="em-actions"><button type="button" id="em-visual" class="em-secondary">Visual</button><button type="button" id="em-html-mode" class="em-secondary">HTML</button></div></div>'+
  '<div class="em-toolbar" role="toolbar" aria-label="Text formatting">'+[
    ["bold","Bold","B"],["italic","Italic","I"],["underline","Underline","U"],["formatBlock","Heading","H2"],["insertUnorderedList","Bulleted list","☷"],["insertOrderedList","Numbered list","1."],["justifyCenter","Center","☰"]
  ].map(([cmd,title,label])=>'<button type="button" data-em-format="'+cmd+'" title="'+title+'">'+label+'</button>').join("")+
  '<button type="button" id="em-link" title="Add link">Link</button><button type="button" id="em-image" title="Add hosted image">Image</button><button type="button" id="em-divider" title="Add divider">Line</button><button type="button" id="em-personalize" title="Insert first name">First name</button></div>'+
  '<div class="em-editor" id="em-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Email body">'+(c.body_html||"<h2>Your headline</h2><p>Write your message here.</p>")+'</div>'+
  '<textarea id="em-source" aria-label="Edit HTML source" rows="16" hidden></textarea>'+
  '<div class="em-editor-actions"><button type="button" class="em-secondary" id="em-preview">Preview</button><button type="submit" class="em-primary">Save draft</button><button type="button" class="em-send" id="em-send" '+(!c.id?'disabled title="Save first"':'')+'>Send campaign</button></div></form></section>'+
  '<aside class="em-card em-preview-card"><div class="em-card-heading"><h2>Live email preview</h2><span>640px width</span></div><iframe id="em-iframe" sandbox="" title="Email preview"></iframe><p class="em-muted">Delivered emails include a branded header and unsubscribe link. This preview shows your message content.</p></aside></div>';
 }
 function importScreen(){
  return head("Import email contacts","Paste a list or upload a CSV file. Imports are separate from Customer CRM.")+
  '<section class="em-card em-import"><div class="em-card-heading"><h2>Paste or upload contacts</h2><p>CSV column names: first_name, last_name, email, phone, status. Also accepts first name and last name.</p></div>'+
  '<label class="em-file-label">Upload CSV file<input id="em-csv" type="file" accept=".csv,text/csv"></label>'+
  '<label>Paste emails or CSV data<textarea id="em-paste" rows="9" placeholder="first_name,last_name,email,phone,status&#10;Alex,Smith,alex@example.com,,inactive&#10;or one email address per line"></textarea></label>'+
  '<div class="em-actions"><button id="em-parse" class="em-secondary">Review import</button><span id="em-import-count"></span></div>'+
  '<label class="em-check"><input type="checkbox" id="em-consent"><span>I have documented express permission to market to contacts marked Active in this import.</span></label>'+
  '<label>Permission source<input id="em-consent-source" placeholder="Signup form, date, import source"></label>'+
  '<p class="em-warning">Imported addresses without verifiable consent remain Non active. Unsubscribed or suppressed addresses will not be reactivated.</p>'+
  '<div id="em-import-review"></div><button id="em-import-submit" class="em-primary" disabled>Import reviewed contacts</button></section>';
 }
 function delivery(){
  const rows=data.deliveries.filter(d=>!activeCampaign||d.campaign_id===activeCampaign.id);
  const name=id=>data.contacts.find(c=>c.id===id);
  const counts={sent:rows.filter(x=>["sent","delivered","opened","clicked"].includes(x.status)).length,delivered:rows.filter(x=>!!x.delivered_at).length,opened:rows.filter(x=>!!x.opened_at).length,clicked:rows.filter(x=>!!x.clicked_at).length,bounced:rows.filter(x=>!!x.bounced_at).length,spam:rows.filter(x=>!!x.complained_at).length};
  return head("Delivery insights","Follow email delivery, opens, clicks, spam complaints and bounced messages.")+
  '<div class="em-stats">'+Object.entries(counts).map(([k,v])=>'<section class="em-stat"><span>'+esc(k==="spam"?"Spam complaints":k[0].toUpperCase()+k.slice(1))+'</span><strong>'+v+'</strong></section>').join("")+'</div>'+
  '<section class="em-card"><div class="em-card-heading"><h2>Recipient activity</h2><select id="em-delivery-filter"><option value="">All campaigns</option>'+data.campaigns.map(c=>'<option value="'+c.id+'" '+(activeCampaign?.id===c.id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></div>'+
  '<div class="em-table"><table><thead><tr><th>Campaign</th><th>Recipient</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Bounced</th><th>Spam</th></tr></thead><tbody>'+
  (rows.map(d=>'<tr><td>'+esc(data.campaigns.find(c=>c.id===d.campaign_id)?.name||"—")+'</td><td>'+esc(name(d.contact_id)?.email||"—")+'</td><td><span class="em-chip">'+esc(d.status)+'</span></td><td>'+fmtDate(d.sent_at)+'</td><td>'+fmtDate(d.delivered_at)+'</td><td>'+fmtDate(d.opened_at)+'</td><td>'+fmtDate(d.clicked_at)+'</td><td>'+fmtDate(d.bounced_at)+'</td><td>'+fmtDate(d.complained_at)+'</td></tr>').join("")||'<tr><td colspan="9">No recipient delivery records yet.</td></tr>')+'</tbody></table></div>'+
  '<p class="em-muted">Open and click measurements require provider tracking and verified webhook integration. A blank metric means no event has been received, not necessarily that nobody opened or clicked.</p></section>';
 }
 function campaignView(c){
  const count=data.deliveries.filter(d=>d.campaign_id===c.id).length;
  return head("View campaign","Read the full email before editing or reviewing delivery activity.")+
  '<div class="em-actions"><button class="em-secondary" data-em-tab="campaigns">← Campaigns</button>'+(c.status==="draft"?'<button class="em-primary" data-em-edit="'+c.id+'">Edit campaign</button>':'')+'<button class="em-secondary" data-em-report="'+c.id+'">View delivery</button></div>'+
  '<section class="em-card"><div class="em-card-heading"><h2>'+esc(c.name)+'</h2><span class="em-chip">'+esc(c.status)+'</span></div><p><strong>Subject:</strong> '+esc(c.subject)+'</p><p><strong>Preview text:</strong> '+esc(c.preview_text)+'</p><p><strong>Recipients recorded:</strong> '+count+'</p><iframe class="em-view-frame" id="em-view-frame" sandbox="" title="View campaign content"></iframe></section>';
 }
 function draw(){
  if(!isCurrent())return;
  let body=page==="campaigns"?campaigns():page==="contacts"?contacts():page==="contact-detail"?contactDetail(activeContact):page==="import"?importScreen():page==="create"?editor():page==="delivery"?delivery():page==="campaign-view"&&activeCampaign?campaignView(activeCampaign):campaigns();
  root.innerHTML=frame(body);
  root.querySelectorAll("[data-em-tab]").forEach(b=>b.onclick=()=>{page=b.dataset.emTab;activeContact=null;if(page!=="delivery")activeCampaign=null;draw()});
  root.querySelectorAll("[data-em-new]").forEach(b=>b.onclick=()=>{activeCampaign=null;page="create";draw()});
  root.querySelectorAll("[data-em-edit]").forEach(b=>b.onclick=()=>{activeCampaign=data.campaigns.find(c=>c.id===b.dataset.emEdit);mode="visual";page="create";draw()});
  root.querySelectorAll("[data-em-view]").forEach(b=>b.onclick=()=>{const c=data.campaigns.find(x=>x.id===b.dataset.emView);if(c){activeCampaign=c;page="campaign-view";draw()}});
  root.querySelectorAll("[data-em-report]").forEach(b=>b.onclick=()=>{activeCampaign=data.campaigns.find(c=>c.id===b.dataset.emReport);page="delivery";draw()});
  root.querySelectorAll("[data-em-add]").forEach(b=>b.onclick=()=>{activeContact=null;page="contact-detail";draw()});
  root.querySelectorAll("[data-em-contact]").forEach(b=>b.onclick=()=>{activeContact=data.contacts.find(c=>c.id===b.dataset.emContact);page="contact-detail";draw()});
  root.querySelectorAll("[data-em-status]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api("contact_status",{id:b.dataset.emStatus,status:b.dataset.status});await refresh();notice("Contact status updated")}catch(e){notice(e.message,true);b.disabled=false}});
  const search=root.querySelector("#em-search");
  if(search)search.oninput=()=>{filter=search.value;const pos=search.selectionStart;draw();const next=root.querySelector("#em-search");next.focus();next.setSelectionRange(pos,pos)};
  const cf=root.querySelector("#em-contact-form");if(cf)cf.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(cf));const button=cf.querySelector('[type="submit"]');button.disabled=true;try{await api("save_contact",{...v,consent:cf.elements.consent.checked});await fetchData();page="contacts";draw();notice("Contact saved")}catch(err){notice(err.message,true);button.disabled=false}};
  const editorElement=root.querySelector("#em-body"),source=root.querySelector("#em-source"),form=root.querySelector("#em-campaign-form");
  if(editorElement&&form){
   const getHTML=()=>mode==="html"?source.value:editorElement.innerHTML;
   const refreshPreview=()=>{const iframe=root.querySelector("#em-iframe");if(iframe)iframe.srcdoc='<style>body{font:15px/1.65 Arial,sans-serif;padding:20px;color:#153451}img{max-width:100%;height:auto}a{color:#184d83}</style>'+getHTML()};
   refreshPreview();editorElement.addEventListener("input",refreshPreview);source.addEventListener("input",refreshPreview);
   root.querySelector("#em-html-mode").onclick=()=>{if(mode==="visual")source.value=editorElement.innerHTML;mode="html";editorElement.hidden=true;source.hidden=false;refreshPreview()};
   root.querySelector("#em-visual").onclick=()=>{if(mode==="html")editorElement.innerHTML=source.value;mode="visual";editorElement.hidden=false;source.hidden=true;refreshPreview()};
   root.querySelectorAll("[data-em-format]").forEach(b=>b.onclick=()=>{editorElement.focus();document.execCommand(b.dataset.emFormat,false,b.dataset.emFormat==="formatBlock"?"h2":undefined);refreshPreview()});
   root.querySelector("#em-link").onclick=()=>{const url=root.querySelector("#em-link-value");url?.closest(".em-inline-input")?.remove();const box=document.createElement("div");box.className="em-inline-input";box.innerHTML='<label>Link URL <input id="em-link-value" type="url" placeholder="https://..."></label><button type="button" id="em-link-insert">Insert link</button>';editorElement.before(box);box.querySelector("#em-link-insert").onclick=()=>{const href=box.querySelector("input").value;if(/^https:\/\//i.test(href)){editorElement.focus();document.execCommand("createLink",false,href);refreshPreview()}else notice("Use an https:// link",true);box.remove()}};
   root.querySelector("#em-image").onclick=()=>{const box=document.createElement("div");box.className="em-inline-input";box.innerHTML='<label>Hosted image URL <input type="url" placeholder="https://..."></label><button type="button">Insert image</button>';editorElement.before(box);box.querySelector("button").onclick=()=>{const url=box.querySelector("input").value;if(/^https:\/\//i.test(url)){editorElement.focus();document.execCommand("insertImage",false,url);refreshPreview()}else notice("Use an https:// image URL",true);box.remove()}};
   root.querySelector("#em-divider").onclick=()=>{editorElement.focus();document.execCommand("insertHorizontalRule");refreshPreview()};
   root.querySelector("#em-personalize").onclick=()=>{editorElement.focus();document.execCommand("insertText",false,"{{first_name}}");refreshPreview()};
   root.querySelector("#em-preview").onclick=()=>{refreshPreview();root.querySelector("#em-iframe")?.scrollIntoView({behavior:"smooth",block:"center"})};
   form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type="submit"]');b.disabled=true;try{const d=Object.fromEntries(new FormData(form));const saved=await api("save_campaign",{...d,id:activeCampaign?.id,html:getHTML()});activeCampaign=saved;await fetchData();notice("Draft saved. Use View to review the entire campaign before sending.");draw();notice("Draft saved")}catch(err){notice(err.message,true)}finally{b.disabled=false}};
   root.querySelector("#em-send").onclick=()=>{const current=activeCampaign;if(!current?.id){notice("Save draft first",true);return}const dialog=document.createElement("div");dialog.className="em-modal";dialog.innerHTML='<section role="dialog" aria-modal="true" aria-label="Send campaign"><h2>Send this campaign?</h2><p>This will send to active contacts with recorded consent only. Each email includes an unsubscribe link. Confirm the draft is final before sending.</p><div class="em-actions"><button type="button" id="em-confirm-send" class="em-primary">Send up to 25 recipients</button><button type="button" id="em-cancel-send" class="em-secondary">Cancel</button></div><p id="em-modal-status" role="status"></p></section>';root.append(dialog);dialog.querySelector("#em-cancel-send").onclick=()=>dialog.remove();dialog.querySelector("#em-confirm-send").onclick=async e=>{e.target.disabled=true;try{const res=await api("send_campaign",{id:current.id});await fetchData();page="delivery";activeCampaign=data.campaigns.find(c=>c.id===current.id);dialog.remove();draw();notice("Sent: "+res.sent+". Failed: "+res.failed+". Remaining eligible: "+res.remaining)}catch(err){dialog.querySelector("#em-modal-status").textContent=err.message;e.target.disabled=false}}};
  }
  const view=root.querySelector("#em-view-frame");if(view&&activeCampaign)view.srcdoc='<style>body{font:15px/1.65 Arial,sans-serif;padding:25px;color:#123153}img{max-width:100%}</style>'+activeCampaign.body_html;
  const deliveryFilter=root.querySelector("#em-delivery-filter");if(deliveryFilter)deliveryFilter.onchange=()=>{activeCampaign=data.campaigns.find(c=>c.id===deliveryFilter.value)||null;draw()};
  const paste=root.querySelector("#em-paste"),csv=root.querySelector("#em-csv");
  if(csv)csv.onchange=async()=>{const file=csv.files?.[0];if(!file)return;if(file.size>4_000_000){notice("CSV must be under 4 MB",true);return}paste.value=await file.text();notice("CSV loaded. Select Review import.")};
  const parse=root.querySelector("#em-parse");if(parse)parse.onclick=()=>{
   try{const lines=parseCSV(paste.value);if(!lines.length)throw Error("Paste email addresses or upload a CSV first");
    const headers=lines[0].map(x=>x.toLowerCase().trim().replace(/\s+/g,"_"));const hasHeader=headers.includes("email")||headers.includes("email_address");
    const records=hasHeader?lines.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||""]))):lines.map(row=>({email:row[0]||""}));
    importRows=records.filter(r=>r.email||r.email_address).map(r=>({firstName:r.first_name||r.firstname||"",lastName:r.last_name||r.lastname||"",email:r.email||r.email_address,phone:r.phone||"",status:String(r.status||"inactive").toLowerCase()==="active"?"active":"inactive"}));
    if(importRows.length>300)throw Error("Import a maximum of 300 contacts per batch");
    root.querySelector("#em-import-review").innerHTML='<h3>Review '+importRows.length+' contacts</h3><p>'+importRows.filter(r=>r.status==="active").length+' marked Active (requires recorded consent). The rest will remain Non active.</p><div class="em-import-preview">'+importRows.slice(0,10).map(r=>'<p>'+esc(r.firstName+' '+r.lastName+' · '+r.email+' · '+r.status)+'</p>').join("")+'</div>';
    root.querySelector("#em-import-count").textContent=importRows.length+" rows parsed";root.querySelector("#em-import-submit").disabled=!importRows.length;
   }catch(err){notice(err.message,true)}};
  const submit=root.querySelector("#em-import-submit");if(submit)submit.onclick=async()=>{submit.disabled=true;try{const r=await api("import_contacts",{rows:importRows,consent:root.querySelector("#em-consent").checked,consentSource:root.querySelector("#em-consent-source").value});await fetchData();page="contacts";draw();notice("Imported "+r.created+" new, updated "+r.updated+", skipped "+r.skipped+(r.errors?.length?". "+r.errors.join("; "):""))}catch(err){notice(err.message,true);submit.disabled=false}};
 }
 function parseCSV(text){const out=[];let cells=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if(c===","&&!quoted){cells.push(cell.trim());cell=""}else if((c==="\n"||c==="\r")&&!quoted){cells.push(cell.trim());if(cells.some(Boolean))out.push(cells);cells=[];cell="";if(c==="\r"&&text[i+1]==="\n")i++}else cell+=c}cells.push(cell.trim());if(cells.some(Boolean))out.push(cells);return out}
 async function refresh(){await fetchData();draw()}
 async function start(){root.innerHTML='<section class="em-card"><h2>Loading Email Marketing…</h2></section>';try{await fetchData();if(!isCurrent())return;draw()}catch(e){root.innerHTML='<section class="em-card"><h2>Email Marketing unavailable</h2><p>'+esc(e.message)+'</p><button id="em-retry" class="em-primary">Retry</button></section>';root.querySelector("#em-retry").onclick=start}}
 return {start};
}