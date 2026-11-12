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
  const locked=!!c?.unsubscribed_at||!!c?.suppression_reason;
  return head(c?"Marketing contact profile":"Add marketing contact",c?"Review the contact record and manage marketing subscription status.":"Add someone to your separate email marketing list. This does not modify Customer CRM.")+
  '<div class="em-contact-back"><button type="button" class="em-secondary" data-em-tab="contacts">← Back to all contacts</button></div>'+
  '<section class="em-card em-contact-card"><div class="em-contact-heading"><div><span class="em-contact-kicker">CONTACT DETAILS</span><h2>'+(c?'Edit contact information':'New marketing contact')+'</h2><p>Keep contact information accurate. Marketing delivery requires confirmed consent.</p></div>'+(c?'<span class="em-chip '+(c.status==='active'?'em-active':'')+'">'+esc(c.status==='active'?'Active':'Non active')+'</span>':'')+'</div>'+
  '<form id="em-contact-form" class="em-contact-form"><div class="em-form-grid">'+
  '<label>First name<input name="firstName" maxlength="100" autocomplete="given-name" value="'+esc(c?.first_name||"")+'" placeholder="First name"></label>'+
  '<label>Last name<input name="lastName" maxlength="100" autocomplete="family-name" value="'+esc(c?.last_name||"")+'" placeholder="Last name"></label>'+
  '<label>Email address <span class="em-required">*</span><input type="email" name="email" required maxlength="254" autocomplete="email" value="'+esc(c?.email||"")+'" placeholder="name@example.com"></label>'+
  '<label>Phone<input name="phone" type="tel" maxlength="40" autocomplete="tel" value="'+esc(c?.phone||"")+'" placeholder="(555) 123-4567"></label></div>'+
  '<div class="em-contact-consent"><div class="em-contact-section-title"><h3>Subscription & consent</h3><p>Only contacts with confirmed permission can receive marketing campaigns.</p></div>'+
  '<div class="em-form-grid em-contact-consent-grid"><label>Status<select name="status" '+(locked?'disabled':'')+'><option value="inactive" '+(c?.status!=="active"?"selected":"")+'>Non active</option><option value="active" '+(c?.status==="active"?"selected":"")+'>Active</option></select></label>'+
  '<label>Consent source<input name="consentSource" maxlength="200" value="'+esc(c?.consent_source||"")+'" placeholder="e.g. Newsletter signup form, date"></label></div>'+
  '<label class="em-contact-consent-check"><input name="consent" type="checkbox" '+(c?.consent_at?'checked ':'')+(locked?'disabled ':'')+'><span>I confirm this contact explicitly opted in to receive Andre Erving marketing emails.</span></label>'+
  (locked?'<p class="em-warning">This contact is unsubscribed or suppressed. They cannot be reactivated through this form.</p>':'<p class="em-contact-hint">Active contacts must have confirmed permission and a documented consent source. Otherwise, select Non active.</p>')+
  '</div><div class="em-contact-footer"><button class="em-primary" type="submit">Save contact</button><button type="button" class="em-secondary" data-em-tab="contacts">Cancel</button></div></form></section>';
 }
 function editor(){
 const c=activeCampaign||{};
 const saved=!!c.id;
 const logo="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo2.png";
 const templates=[["announcement","Announcement","News and updates"],["course","Course promotion","Highlight a course"],["newsletter","Newsletter","Editorial update"],["invitation","Invitation","Upcoming event"],["blank","Start blank","Design from scratch"]];
 const blocks=[["heading","Heading","H"],["paragraph","Text","¶"],["image","Image","▣"],["button","Button","↗"],["columns","2 columns","▥"],["divider","Divider","—"],["spacer","Spacer","↕"],["list","List","☷"]];
 return head(saved?"Edit campaign":"Create campaign","Build a branded, responsive email with templates, content blocks, formatting and a live preview.",'<div class="em-actions"><button class="em-secondary" data-em-tab="campaigns">All campaigns</button>'+(saved?'<button class="em-secondary" data-em-view="'+c.id+'">View saved email</button>':'')+'</div>')+
 '<div class="em-campaign-steps"><span class="em-step-current">1 · Design</span><span>2 · Review</span><span>3 · Send</span></div>'+
 '<form id="em-campaign-form" class="em-builder-form">'+
 '<section class="em-card em-campaign-settings"><div class="em-card-heading"><div><h2>Campaign setup</h2><p>Set the details your recipients will see in their inbox.</p></div><span class="em-chip">'+esc(c.status||"Draft")+'</span></div>'+
 '<div class="em-campaign-settings-grid"><label>Campaign name <span class="em-required">*</span><input name="name" required maxlength="200" value="'+esc(c.name||"")+'" placeholder="November training announcement"></label>'+
 '<label>Email subject <span class="em-required">*</span><input name="subject" required maxlength="250" value="'+esc(c.subject||"")+'" placeholder="A new opportunity from Andre Erving"></label>'+
 '<label>Inbox preview text<input name="previewText" maxlength="240" value="'+esc(c.preview_text||"")+'" placeholder="This short summary appears after the subject"></label>'+
 '<label>Sender name<input name="senderName" maxlength="120" value="'+esc(c.sender_name||"Andre Erving")+'"></label></div>'+
 '<div class="em-sender-row"><span>Sending address: <strong>support@andreerving.com</strong></span><span>Audience: <strong>'+data.contacts.filter(x=>x.status==="active"&&x.consent_at&&!x.unsubscribed_at&&!x.suppression_reason).length+' opted-in contacts</strong></span></div></section>'+
 '<section class="em-builder-workspace"><aside class="em-card em-builder-tools"><h2>Design tools</h2><p class="em-muted">Choose a template or add sections to your campaign.</p>'+
 '<div class="em-tool-group"><h3>Templates</h3><div class="em-template-list">'+templates.map(([key,label,caption])=>'<button type="button" class="em-template-option" data-em-template="'+key+'"><span class="em-template-thumb"><span></span><span></span><span></span></span><span><strong>'+label+'</strong><small>'+caption+'</small></span></button>').join("")+'</div></div>'+
 '<div class="em-tool-group"><h3>Content blocks</h3><div class="em-block-palette">'+blocks.map(([key,label,icon])=>'<button type="button" data-em-block="'+key+'"><span aria-hidden="true">'+icon+'</span>'+label+'</button>').join("")+'</div></div>'+
 '<div class="em-tool-group"><h3>Theme</h3><label>Background color<input id="em-theme-background" type="color" value="#ffffff"></label><label>Text color<input id="em-theme-text" type="color" value="#173754"></label><label>Accent color<input id="em-theme-accent" type="color" value="#cf992b"></label></div></aside>'+
 '<section class="em-card em-builder-stage"><div class="em-builder-stage-head"><div><h2>Email design</h2><p>Click a section to edit it; use the controls to reorder or remove it.</p></div><div class="em-actions"><button type="button" id="em-visual" class="em-secondary">Design</button><button type="button" id="em-html-mode" class="em-secondary">HTML</button></div></div>'+
 '<div class="em-toolbar" role="toolbar" aria-label="Selected text formatting">'+[
 ["bold","Bold","B"],["italic","Italic","I"],["underline","Underline","U"],["formatBlock","Heading","H2"],["insertUnorderedList","Bullets","☷"],["insertOrderedList","Numbers","1."],["justifyCenter","Center","☰"]
 ].map(([cmd,title,label])=>'<button type="button" data-em-format="'+cmd+'" title="'+title+'">'+label+'</button>').join("")+
 '<button type="button" id="em-link">Link</button><button type="button" id="em-image">Image URL</button><button type="button" id="em-personalize">First name</button></div>'+
 '<div class="em-design-surface"><div class="em-brand-bar"><img src="'+logo+'" alt="Andre Erving logo"><span>BRANDED EMAIL</span></div>'+
 '<div class="em-builder-content" id="em-body" contenteditable="true" role="textbox" aria-label="Campaign email content" aria-multiline="true">'+(c.body_html||'<section class="em-email-block" style="padding:24px 24px 14px"><h1 style="font-size:30px;line-height:1.25;margin:0;color:#173754">Your campaign headline</h1><p style="font-size:16px;line-height:1.7;color:#516b84">Start writing your message here. Add sections or choose a template to build your email.</p></section>')+'</div>'+
 '<div class="em-canvas-footer">Andre Erving · Growth, Strategy &amp; Education<br><u>Unsubscribe from marketing emails</u></div></div>'+
 '<textarea id="em-source" class="em-html-source" aria-label="Edit email HTML source" rows="18" hidden></textarea>'+
 '<div id="em-block-controls" class="em-selected-controls" hidden><span>Selected section</span><button type="button" data-em-move="up">Move up ↑</button><button type="button" data-em-move="down">Move down ↓</button><button type="button" id="em-remove-block">Remove section</button></div>'+
 '</section><aside class="em-card em-builder-preview"><div class="em-card-heading"><div><h2>Preview</h2><p>See the complete branded message.</p></div></div><div class="em-preview-modes"><button type="button" class="current" data-em-device="desktop">Desktop</button><button type="button" data-em-device="mobile">Mobile</button></div>'+
 '<div class="em-preview-viewport"><iframe id="em-iframe" sandbox="" title="Full branded campaign preview"></iframe></div>'+
 '<p class="em-muted">Preview includes the official logo, branded header and mandatory unsubscribe footer. Recipient names are personalized when sent.</p></aside></section>'+
 '<div class="em-campaign-footer"><div><strong>Save your work before sending.</strong><p>Marketing emails only go to eligible contacts who have recorded consent.</p></div><div class="em-actions"><button type="button" class="em-secondary" id="em-preview">Refresh preview</button><button type="submit" class="em-primary">Save draft</button><button type="button" class="em-send" id="em-send" '+(!saved?'disabled title="Save the draft first"':'')+'>Review & send</button></div></div></form>';
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
   const logo="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo2.png";
   let selected=null,device="desktop";
   const block=(inside,css="padding:22px 24px;")=>'<section class="em-email-block" style="'+css+'">'+inside+'</section>';
   const templates={
    announcement:()=>block('<p style="color:#b17b1b;font-size:12px;font-weight:bold">ANNOUNCEMENT</p><h1 style="font-size:32px;color:#123252;margin:6px 0">Something new is coming</h1><p style="font-size:16px;color:#506982;line-height:1.7">Hello {{first_name}}, we have exciting news to share with you.</p>')+block('<p style="line-height:1.7;color:#506982">Explain the update, what it means, and how your readers can benefit.</p>')+block('<p><a href="https://andreerving.com/" style="background:#cf992b;color:#102b48;padding:14px 24px;border-radius:7px;text-decoration:none;font-weight:bold;display:inline-block">Discover more →</a></p>'),
    course:()=>block('<p style="color:#a97721;font-size:12px;font-weight:bold">LEARNING OPPORTUNITY</p><h1 style="font-size:30px;color:#123252">Build your next skill</h1><p style="color:#506982;line-height:1.7">Hello {{first_name}}, explore practical training designed to help you grow.</p>')+block('<h2 style="color:#123252">What you will learn</h2><ul style="color:#506982;line-height:1.9"><li>First learning outcome</li><li>Second learning outcome</li><li>Third learning outcome</li></ul>')+block('<p><a href="https://andreerving.com/courses.html" style="background:#cf992b;color:#102b48;padding:14px 24px;border-radius:7px;text-decoration:none;font-weight:bold;display:inline-block">Explore courses →</a></p>'),
    newsletter:()=>block('<p style="color:#a97721;font-size:12px;font-weight:bold">THE ANDRE ERVING NEWSLETTER</p><h1 style="font-size:31px;color:#123252">This month’s insights</h1><p style="color:#506982;line-height:1.7">Hello {{first_name}}, here are the latest ideas and resources to help you move forward.</p>')+block('<h2 style="color:#123252">Featured story</h2><p style="color:#506982;line-height:1.7">Introduce your featured article or announcement here.</p>')+block('<h2 style="color:#123252">Worth exploring</h2><ul><li>Resource or tip one</li><li>Resource or tip two</li></ul>'),
    invitation:()=>block('<p style="color:#a97721;font-size:12px;font-weight:bold">YOU’RE INVITED</p><h1 style="font-size:31px;color:#123252">Join us for an upcoming event</h1><p style="color:#506982;line-height:1.7">Hello {{first_name}}, we would love to have you join us.</p>')+block('<h2 style="color:#123252">Event details</h2><p style="line-height:1.8;color:#506982">Date: Add event date<br>Time: Add event time<br>Location: Add event details</p>')+block('<p><a href="https://andreerving.com/" style="background:#cf992b;color:#102b48;padding:14px 24px;border-radius:7px;text-decoration:none;font-weight:bold;display:inline-block">Reserve your place →</a></p>'),
    blank:()=>block('<h1 style="font-size:30px;color:#123252">Your headline</h1><p style="line-height:1.7;color:#506982">Write your email here.</p>')
   };
   const newBlock={
    heading:()=>block('<h2 style="font-size:26px;color:#123252;margin:0">Add your heading</h2>'),
    paragraph:()=>block('<p style="font-size:16px;line-height:1.7;color:#506982;margin:0">Write your message here.</p>'),
    image:()=>block('<img src="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo.png" alt="Image — replace its URL" style="display:block;max-width:100%;height:auto;margin:auto">'),
    button:()=>block('<p style="text-align:center"><a href="https://andreerving.com/" style="display:inline-block;background:#cf992b;padding:15px 25px;border-radius:8px;color:#112b49;font-weight:bold;text-decoration:none">Add button text →</a></p>'),
    columns:()=>block('<table role="presentation" width="100%" style="border-collapse:collapse"><tr><td width="50%" valign="top" style="padding:12px;background:#f4f7fb"><h3 style="color:#123252">Column one</h3><p style="color:#506982">Add text here.</p></td><td width="50%" valign="top" style="padding:12px;background:#edf3fa"><h3 style="color:#123252">Column two</h3><p style="color:#506982">Add text here.</p></td></tr></table>'),
    divider:()=>block('<hr style="border:0;border-top:1px solid #dce5ee;margin:8px 0">',"padding:6px 24px;"),
    spacer:()=>block('<div style="height:30px" aria-hidden="true"></div>',"padding:0 24px;"),
    list:()=>block('<ul style="font-size:16px;line-height:1.9;color:#506982"><li>First point</li><li>Second point</li><li>Third point</li></ul>')
   };
   const getHTML=()=>mode==="html"?source.value:editorElement.innerHTML;
   const brandedPreview=body=>{
    const content=String(body).replace(/\{\{\s*first_name\s*\}\}/gi,"Alex");
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef3f9;font-family:Arial,sans-serif;color:#123252"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f9"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:white;border-collapse:collapse"><tr><td style="background:#10243f;border-bottom:5px solid #d09b2d;padding:26px"><img src="'+logo+'" alt="Andre Erving" width="250" style="max-width:100%;height:auto"></td></tr><tr><td style="padding:12px 12px 20px;font-size:15px;line-height:1.6">'+content+'</td></tr><tr><td style="background:#f5f8fc;border-top:1px solid #dce7f1;padding:22px;font-size:12px;line-height:1.7;color:#58718b">Andre Erving · Growth, Strategy &amp; Education<br>Marketing communication · <u>Unsubscribe</u><br>support@andreerving.com</td></tr></table></td></tr></table></body></html>';
   };
   const refreshPreview=()=>{const frame=root.querySelector("#em-iframe");if(frame)frame.srcdoc=brandedPreview(getHTML())};
   const setSelected=node=>{
    if(selected)selected.classList.remove("em-block-selected");
    selected=node?.closest?.(".em-email-block")||null;
    if(selected)selected.classList.add("em-block-selected");
    const controls=root.querySelector("#em-block-controls");controls.hidden=!selected||mode==="html";
   };
   const addBlock=(html)=>{
    if(mode==="html"){source.value+="\n"+html;refreshPreview();return}
    editorElement.insertAdjacentHTML("beforeend",html);
    setSelected(editorElement.lastElementChild);
    editorElement.lastElementChild?.scrollIntoView({block:"nearest",behavior:"smooth"});
    refreshPreview();
   };
   const updateTheme=()=>{
    const bg=root.querySelector("#em-theme-background").value,fg=root.querySelector("#em-theme-text").value,accent=root.querySelector("#em-theme-accent").value;
    editorElement.style.background=bg;editorElement.style.color=fg;
    root.querySelector(".em-design-surface").style.background=bg;
    editorElement.querySelectorAll("a").forEach(a=>{if(a.getAttribute("style")?.includes("background"))a.style.backgroundColor=accent});
    refreshPreview()
   };
   editorElement.addEventListener("click",event=>setSelected(event.target));
   editorElement.addEventListener("input",refreshPreview);
   source.addEventListener("input",refreshPreview);
   root.querySelectorAll("[data-em-template]").forEach(b=>b.onclick=()=>{
    const next=templates[b.dataset.emTemplate]?.();if(next===undefined)return;
    if(editorElement.textContent.trim().length>10){
     const dialog=document.createElement("div");dialog.className="em-modal";
     dialog.innerHTML='<section role="dialog" aria-modal="true" aria-label="Replace email design"><h2>Use this template?</h2><p>Applying a template will replace the current email body. Save your existing draft if you need to keep it.</p><div class="em-actions"><button type="button" class="em-primary" id="em-apply-template">Apply template</button><button type="button" class="em-secondary" id="em-cancel-template">Cancel</button></div></section>';
     root.append(dialog);
     dialog.querySelector("#em-cancel-template").onclick=()=>dialog.remove();
     dialog.querySelector("#em-apply-template").onclick=()=>{editorElement.innerHTML=next;source.value=next;setSelected(null);refreshPreview();dialog.remove()};
    }else{editorElement.innerHTML=next;source.value=next;setSelected(null);refreshPreview()}
   });
   root.querySelectorAll("[data-em-block]").forEach(b=>b.onclick=()=>addBlock(newBlock[b.dataset.emBlock]?.()||""));
   root.querySelectorAll("[data-em-move]").forEach(b=>b.onclick=()=>{
    if(!selected)return;
    const target=b.dataset.emMove==="up"?selected.previousElementSibling:selected.nextElementSibling;
    if(!target)return;
    if(b.dataset.emMove==="up")target.before(selected);else target.after(selected);
    refreshPreview();
   });
   root.querySelector("#em-remove-block").onclick=()=>{selected?.remove();setSelected(null);refreshPreview()};
   root.querySelector("#em-html-mode").onclick=()=>{if(mode!=="html"){source.value=editorElement.innerHTML;mode="html";editorElement.closest(".em-design-surface").hidden=true;source.hidden=false;setSelected(null);refreshPreview()}};
   root.querySelector("#em-visual").onclick=()=>{if(mode==="html"){editorElement.innerHTML=source.value;mode="visual";editorElement.closest(".em-design-surface").hidden=false;source.hidden=true;refreshPreview()}};
   root.querySelectorAll("[data-em-format]").forEach(b=>b.onclick=()=>{if(mode==="html"){notice("Switch to Design mode to format selected text.",true);return}editorElement.focus();document.execCommand(b.dataset.emFormat,false,b.dataset.emFormat==="formatBlock"?"h2":undefined);refreshPreview()});
   const addURL=(kind)=>{
    const existing=root.querySelector(".em-inline-input");existing?.remove();
    const box=document.createElement("div");box.className="em-inline-input";
    box.innerHTML='<label>'+ (kind==="image"?"Image URL":"Link URL") +'<input type="url" placeholder="https://..." required></label><button type="button">Insert</button><button type="button" data-cancel="1">Cancel</button>';
    root.querySelector(".em-toolbar").after(box);
    box.querySelector("[data-cancel]").onclick=()=>box.remove();
    box.querySelector("button:not([data-cancel])").onclick=()=>{
     const url=box.querySelector("input").value.trim();
     if(!/^https:\/\/[^\s<>"]+$/i.test(url)){notice("Enter a valid https:// URL",true);return}
     if(kind==="image")addBlock(block('<img alt="Campaign image" src="'+esc(url)+'" style="display:block;max-width:100%;height:auto;margin:auto">'));
     else if(selected){selected.insertAdjacentHTML("beforeend",'<p><a href="'+esc(url)+'">'+esc(url)+'</a></p>');refreshPreview()}
     else addBlock(block('<p><a href="'+esc(url)+'">'+esc(url)+'</a></p>'));
     box.remove()
    }
   };
   root.querySelector("#em-link").onclick=()=>addURL("link");
   root.querySelector("#em-image").onclick=()=>addURL("image");
   root.querySelector("#em-personalize").onclick=()=>{if(mode==="html"){source.value+='{{first_name}}';refreshPreview()}else if(selected){selected.insertAdjacentText("beforeend"," {{first_name}}");refreshPreview()}else addBlock(block('<p>Hello {{first_name}},</p>'))};
   ["em-theme-background","em-theme-text","em-theme-accent"].forEach(id=>root.querySelector("#"+id).oninput=updateTheme);
   root.querySelectorAll("[data-em-device]").forEach(b=>b.onclick=()=>{
    device=b.dataset.emDevice;
    root.querySelectorAll("[data-em-device]").forEach(x=>x.classList.toggle("current",x===b));
    root.querySelector(".em-preview-viewport").classList.toggle("em-mobile",device==="mobile");
   });
   root.querySelector("#em-preview").onclick=()=>{refreshPreview();root.querySelector(".em-builder-preview").scrollIntoView({behavior:"smooth",block:"start"})};
   refreshPreview();
   form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{const values=Object.fromEntries(new FormData(form));const saved=await api("save_campaign",{...values,id:activeCampaign?.id,html:getHTML()});activeCampaign=saved;await fetchData();draw();notice("Campaign draft saved. Review it before sending.")}
    catch(err){notice(err.message,true);button.disabled=false}
   };
   root.querySelector("#em-send").onclick=()=>{
    if(!activeCampaign?.id){notice("Save the campaign draft first.",true);return}
    if(getHTML()!==activeCampaign.body_html){notice("You have unsaved changes. Save draft before sending.",true);return}
    const dialog=document.createElement("div");dialog.className="em-modal";
    dialog.innerHTML='<section role="dialog" aria-modal="true" aria-label="Confirm campaign send"><h2>Review your campaign before sending</h2><p><strong>Subject:</strong> '+esc(activeCampaign.subject)+'</p><p><strong>Sender:</strong> '+esc(activeCampaign.sender_name)+' &lt;support@andreerving.com&gt;</p><p><strong>Eligible audience:</strong> '+data.contacts.filter(c=>c.status==="active"&&c.consent_at&&!c.unsubscribed_at&&!c.suppression_reason).length+' contacts</p><p>Campaign sending is limited to 25 recipients per batch. Each recipient gets a branded unsubscribe link. This action sends real emails.</p><div class="em-actions"><button id="em-confirm-send" class="em-primary" type="button">Confirm send</button><button id="em-cancel-send" class="em-secondary" type="button">Cancel</button></div><p id="em-modal-status" role="status"></p></section>';
    root.append(dialog);dialog.querySelector("#em-cancel-send").onclick=()=>dialog.remove();
    dialog.querySelector("#em-confirm-send").onclick=async event=>{
     event.currentTarget.disabled=true;
     try{const sent=await api("send_campaign",{id:activeCampaign.id});await fetchData();page="delivery";activeCampaign=data.campaigns.find(c=>c.id===activeCampaign.id);dialog.remove();draw();notice("Sent: "+sent.sent+". Failed: "+sent.failed+". Remaining eligible: "+sent.remaining)}
     catch(err){dialog.querySelector("#em-modal-status").textContent=err.message;event.currentTarget.disabled=false}
    };
   };
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