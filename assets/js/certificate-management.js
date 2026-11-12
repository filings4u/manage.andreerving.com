import {certificateMarkup,certificateEscape as esc,downloadCertificate} from "./certificate-renderer.js?v=20261112";
const ENDPOINT="https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-certificates";
const uuid=/^[a-f0-9-]{36}$/i;
const defaults={heading:"CERTIFICATE OF COMPLETION",subtitle:"This certificate is proudly presented to",completion_text:"In recognition of successfully completing the requirements of",instructor_name:"Andre Erving",instructor_title:"Instructor",accent_color:"#D39A28"};
const niceDate=v=>v?new Date(v).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
export function createCertificateManagement({db,root,notify,isCurrent,confirmAction}){
 let payload={templates:[],certificates:[],courses:[],enrollments:[],customers:[]},page="templates",selectedCourse="",selectedCertificate=null,busy=false;
 async function api(action,args={}){
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw Error("Sign in to management");
  const response=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...args})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||"Certificate service unavailable");return data;
 }
 const courseName=id=>payload.courses.find(c=>c.id===id)?.title||"Course";
 const customerName=id=>payload.customers.find(c=>c.id===id)?.full_name||"Student";
 const caption=(title,sub)=>'<div class="ae-cert-mgmt-head"><div><span class="ae-mini-eyebrow">ANDRE ERVING / CERTIFICATE MANAGEMENT</span><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div><button type="button" class="ae-cert-button" id="ae-cert-refresh">Refresh</button></div>';
 const tabs=()=>'<nav class="ae-cert-tabs">'+[["templates","Course templates"],["issue","Issue certificate"],["issued","Issued certificates"]].map(([key,title])=>'<button type="button" class="ae-cert-button '+(page===key?"active":"")+'" data-cert-tab="'+key+'">'+title+'</button>').join("")+'</nav>';
 const template=()=>payload.templates.find(t=>t.course_id===selectedCourse)||defaults;
 function templates(){
  const item=template(),c=payload.courses.find(x=>x.id===selectedCourse);
  return caption("Course certificate editor","Create a unique certificate design and instructor signature for each course.")+
   '<section class="ae-cert-mgmt-card"><div class="ae-cert-mgmt-row"><label>Choose course<select id="ae-cert-course">'+payload.courses.map(c=>'<option value="'+c.id+'" '+(c.id===selectedCourse?"selected":"")+'>'+esc(c.title)+'</option>').join("")+'</select></label><span class="ae-cert-mgmt-state">'+(c?.certificate_enabled?"Certificate enabled":"Certificate not enabled")+'</span></div></section>'+
   '<div class="ae-cert-mgmt-editor"><section class="ae-cert-mgmt-card"><h2>Edit certificate</h2><p class="muted">This template applies to future certificates. Previously issued certificates retain their original wording and signature.</p>'+
   '<form id="ae-cert-template-form" class="ae-cert-mgmt-form">'+
   [['heading',"Certificate heading"],["subtitle","Presentation message"],["completion_text","Completion statement"],["instructor_name","Instructor signature name"],["instructor_title","Instructor title"]].map(([key,label])=>'<label>'+label+'<input name="'+key+'" value="'+esc(item[key]||defaults[key])+'" maxlength="'+(key==="completion_text"?300:190)+'" required></label>').join("")+
   '<label>Accent color<input type="color" name="accent_color" value="'+esc(item.accent_color||defaults.accent_color)+'"></label>'+
   '<p class="muted">The instructor name will be shown in a cursive signature style on the student certificate.</p>'+
   '<div class="ae-cert-controls"><button type="submit" class="ae-cert-button primary">Save certificate template</button></div></form></section>'+
   '<section class="ae-cert-mgmt-card ae-cert-preview-card"><h2>Student certificate preview</h2><p class="muted">This is the same certificate design the student will see.</p><div id="ae-cert-template-preview">'+certificateMarkup({...item,course_title:courseName(selectedCourse),student_name:"Student Full Name"},true)+'</div><div class="ae-cert-controls"><button class="ae-cert-button" id="ae-cert-template-print" type="button">Download sample PDF</button></div></section></div>';
 }
 function issue(){
  const options=payload.enrollments.filter((e,i,a)=>["active","completed"].includes(e.status)&&a.findIndex(x=>x.user_id===e.user_id&&x.course_id===e.course_id)===i&&payload.courses.some(c=>c.id===e.course_id&&c.certificate_enabled&&c.status==="published"));
  return caption("Create and issue certificate","A certificate can only be issued after every published lesson and quiz has been completed.")+
   '<section class="ae-cert-mgmt-card"><h2>Select an enrolled student</h2><form class="ae-cert-mgmt-form" id="ae-cert-issue-form">'+
   '<label>Student and course<select name="choice" required><option value="">Select an enrollment</option>'+options.map(e=>'<option value="'+e.user_id+'|'+e.course_id+'">'+esc(customerName(e.user_id))+' — '+esc(courseName(e.course_id))+'</option>').join("")+'</select></label>'+
   '<p class="muted">Each certificate receives a unique, permanent tracking number. Issuing the same completed course again will return its existing active certificate instead of creating a duplicate.</p>'+
   '<div class="ae-cert-controls"><button type="submit" class="ae-cert-button primary">Verify completion & issue certificate</button></div></form></section>';
 }
 function issued(){
  const items=payload.certificates.slice().sort((a,b)=>new Date(b.issued_at)-new Date(a.issued_at));
  return caption("Issued certificates","View the exact student certificate, download a PDF, or revoke a certificate.")+
   '<div class="ae-cert-mgmt-stats">'+[["Total issued",items.filter(c=>!c.revoked_at).length],["Revoked",items.filter(c=>!!c.revoked_at).length],["Course templates",payload.templates.length]].map(([label,value])=>'<section><span>'+esc(label)+'</span><strong>'+value+'</strong></section>').join("")+'</div>'+
   '<section class="ae-cert-mgmt-card"><div class="tablewrap"><table><thead><tr><th>Certificate number</th><th>Student</th><th>Course</th><th>Issued</th><th>Status</th><th>Completion email</th><th>Actions</th></tr></thead><tbody>'+
   (items.map(c=>'<tr><td><strong>'+esc(c.certificate_number)+'</strong></td><td>'+esc(c.student_name)+'</td><td>'+esc(c.course_title)+'</td><td>'+niceDate(c.issued_at)+'</td><td>'+ (c.revoked_at?"Revoked":"Issued")+'</td><td>'+(c.email_sent_at?'Sent':c.email_error?'Needs attention':'Pending')+'</td><td><div class="ae-cert-controls"><button class="ae-cert-button" type="button" data-cert-view="'+c.id+'">View</button>'+(!c.revoked_at&&!c.email_sent_at?'<button class="ae-cert-button" type="button" data-cert-email="'+c.id+'">Send email</button>':'')+(!c.revoked_at?'<button class="ae-cert-button" type="button" data-cert-delete="'+c.id+'">Delete</button>':'')+'</div></td></tr>').join("")||'<tr><td colspan="7">No certificates have been issued yet.</td></tr>')+'</tbody></table></div></section>';
 }
 function view(){
  const c=selectedCertificate;
  if(!c)return issued();
  return caption("Certificate "+c.certificate_number,"Management view — exact same design as the student portal.")+
   '<div class="ae-cert-controls"><button type="button" class="ae-cert-button" data-cert-tab="issued">← All certificates</button><button type="button" class="ae-cert-button primary" id="ae-cert-download">Download PDF</button></div>'+
   '<div class="ae-cert-mgmt-view">'+certificateMarkup(c)+'</div>'+
   '<p class="muted">Tracking number: '+esc(c.certificate_number)+' · Issued: '+niceDate(c.issued_at)+(c.revoked_at?" · REVOKED":"")+'</p>';
 }
 async function refresh(){payload=await api("management_list");if(!selectedCourse||!payload.courses.some(c=>c.id===selectedCourse))selectedCourse=payload.courses[0]?.id||"";draw()}
 function draw(){
  if(!isCurrent())return;
  root.innerHTML='<div class="ae-cert-mgmt">'+tabs()+(page==="templates"?templates():page==="issue"?issue():page==="view"?view():issued())+'<p id="ae-cert-status" role="status" aria-live="polite"></p></div>';
  root.querySelectorAll("[data-cert-tab]").forEach(b=>b.onclick=()=>{page=b.dataset.certTab;draw()});
  root.querySelector("#ae-cert-refresh")?.addEventListener("click",async()=>{try{await refresh();notice("Certificates refreshed")}catch(e){notice(e.message,true)}});
  const notice=(message,error=false)=>{const el=root.querySelector("#ae-cert-status");if(el){el.textContent=message;el.classList.toggle("error",error)}else notify(message,error)};
  const select=root.querySelector("#ae-cert-course");
  if(select)select.onchange=()=>{selectedCourse=select.value;draw()};
  const form=root.querySelector("#ae-cert-template-form");
  if(form){
    const preview=()=>{const fields=Object.fromEntries(new FormData(form));root.querySelector("#ae-cert-template-preview").innerHTML=certificateMarkup({...template(),...fields,course_title:courseName(selectedCourse),student_name:"Student Full Name"},true)};
    form.addEventListener("input",preview);
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector("button[type=submit]");button.disabled=true;
      try{const fields=Object.fromEntries(new FormData(form));await api("save_template",{courseId:selectedCourse,heading:fields.heading,subtitle:fields.subtitle,completionText:fields.completion_text,instructorName:fields.instructor_name,instructorTitle:fields.instructor_title,accentColor:fields.accent_color});await refresh();notice("Certificate template saved")}
      catch(error){notice(error.message,true);button.disabled=false}
    };
    root.querySelector("#ae-cert-template-print").onclick=async e=>{e.currentTarget.disabled=true;try{await downloadCertificate(root.querySelector("#ae-cert-template-preview .ae-certificate"),"Certificate-Template-"+courseName(selectedCourse));notice("Sample PDF downloaded")}catch(error){notice(error.message,true)}finally{e.currentTarget.disabled=false}};
  }
  const issueForm=root.querySelector("#ae-cert-issue-form");
  if(issueForm)issueForm.onsubmit=async e=>{e.preventDefault();const [userId,courseId]=issueForm.elements.choice.value.split("|");const btn=issueForm.querySelector("button[type=submit]");btn.disabled=true;
    try{const res=await api("issue_certificate",{userId,courseId});await refresh();selectedCertificate=payload.certificates.find(c=>c.id===res.certificate.id)||res.certificate;page="view";draw();notice("Certificate "+res.certificate.certificate_number+" issued. Email: "+res.delivery.status)}
    catch(error){notice(error.message,true);btn.disabled=false}
  };
  root.querySelectorAll("[data-cert-view]").forEach(b=>b.onclick=()=>{selectedCertificate=payload.certificates.find(c=>c.id===b.dataset.certView);page="view";draw()});
  root.querySelectorAll("[data-cert-email]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;try{
      const res=await api("resend_completion_email",{id:b.dataset.certEmail});
      await refresh();notice("Completion email status: "+res.status+(res.note?" · "+res.note:""))
    }catch(error){notice(error.message,true);b.disabled=false}
  });
  root.querySelectorAll("[data-cert-delete]").forEach(b=>b.onclick=async()=>{const item=payload.certificates.find(c=>c.id===b.dataset.certDelete);if(!item)return;const ok=await confirmAction("Delete certificate","Revoke certificate "+item.certificate_number+"? The tracking number will remain in the audit trail.",{destructive:true,confirmText:"Revoke certificate"});if(!ok)return;
    try{await api("delete_certificate",{id:item.id});await refresh();notice("Certificate revoked")}catch(error){notice(error.message,true)}
  });
  const download=root.querySelector("#ae-cert-download");if(download)download.onclick=async()=>{download.disabled=true;try{await downloadCertificate(root.querySelector(".ae-cert-mgmt-view .ae-certificate"),selectedCertificate.certificate_number);notice("PDF downloaded")}catch(error){notice(error.message,true)}finally{download.disabled=false}};
 }
 async function start(){root.innerHTML='<p class="muted">Loading certificates…</p>';try{await refresh()}catch(e){root.innerHTML='<p class="notice error">Unable to load certificates: '+esc(e.message)+'</p><button class="ae-cert-button" id="ae-cert-retry">Retry</button>';root.querySelector("#ae-cert-retry").onclick=start}}
 return {start};
}
