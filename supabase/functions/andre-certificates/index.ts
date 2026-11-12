// Course certificates: student-owned issuance and staff-only template management
const BASE=Deno.env.get("SUPABASE_URL")||"https://gnfyidajbectlppsekzj.supabase.co";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const RESEND=Deno.env.get("RESEND_API_KEY")||"";
const ORIGINS=new Set(["https://manage.andreerving.com","https://app.andreerving.com"]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const val=(v:unknown,n=250)=>String(v??"").trim().slice(0,n);
const escape=(v:unknown)=>String(v??"").replace(/[&<>"']/g,k=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k]||k));
function reply(v:unknown,status=200,origin=""){return new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"Authorization,Content-Type,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}})}
async function db(table:string,query="",method="GET",body?:unknown,extra:Record<string,string>={}):Promise<any>{
 const response=await fetch(BASE+"/rest/v1/"+table+query,{method,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json",...(method!=="GET"?{Prefer:"return=representation"}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok){const details=await response.text();console.error("Certificate database",table,response.status,details.slice(0,400));throw Error("Certificate database request failed")}
 return response.status===204?[]:response.json()
}
async function auth(req:Request){const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)throw Error("Sign in is required");
 const r=await fetch(BASE+"/auth/v1/user",{headers:{apikey:SERVICE,Authorization:"Bearer "+token}});
 if(!r.ok)throw Error("Your session is invalid. Sign in again");
 const u=await r.json();if(!UUID.test(u?.id))throw Error("Sign in is required");return u;
}
async function staff(u:any){
 const rows=await db("admin_profiles","?select=role,active&id=eq."+u.id+"&limit=1");
 if(!rows[0]?.active||!["admin","manager","editor"].includes(rows[0]?.role))throw Error("Management authorization required");
}
async function listStudent(userId:string){
 const certs=await db("course_certificates","?select=*&user_id=eq."+userId+"&revoked_at=is.null&order=issued_at.desc&limit=300");
 const enrollments=await db("course_enrollments","?select=course_id,status,completed_at&user_id=eq."+userId+"&order=enrolled_at.desc&limit=300");
 const enabled=await db("courses","?select=id,title,certificate_enabled&certificate_enabled=eq.true&status=eq.published&limit=300");
 const existing=new Set(certs.map((c:any)=>c.course_id));
 return {certificates:certs,eligibleCourses:enrollments.filter((e:any)=>enabled.some((c:any)=>c.id===e.course_id)&&!existing.has(e.course_id)).map((e:any)=>({courseId:e.course_id,title:enabled.find((c:any)=>c.id===e.course_id)?.title}))};
}
async function listAdmin(){
 const [templates,certificates,courses,enrollments,customers]=await Promise.all([
  db("course_certificate_templates","?select=*&order=updated_at.desc&limit=500"),
  db("course_certificates","?select=*&order=issued_at.desc&limit=1000"),
  db("courses","?select=id,title,status,certificate_enabled&order=title.asc&limit=500"),
  db("course_enrollments","?select=user_id,course_id,status,completed_at&order=enrolled_at.desc&limit=2000"),
  db("customer_profiles","?select=id,full_name,email&order=full_name.asc&limit=2000")
 ]);
 return {templates,certificates,courses,enrollments,customers};
}
async function saveTemplate(d:any,u:any){
 const courseId=val(d.courseId,45);if(!UUID.test(courseId))throw Error("Choose a course");
 const rows=await db("courses","?select=id&id=eq."+courseId+"&limit=1");if(!rows.length)throw Error("Course not found");
 const payload={heading:val(d.heading,110)||"CERTIFICATE OF COMPLETION",subtitle:val(d.subtitle,190)||"This certificate is proudly presented to",
 completion_text:val(d.completionText,300)||"In recognition of successfully completing the requirements of",
 instructor_name:val(d.instructorName,100),instructor_title:val(d.instructorTitle,80)||"Instructor",
 accent_color:val(d.accentColor,7),updated_at:new Date().toISOString(),updated_by:u.id};
 if(!payload.instructor_name)throw Error("Enter the instructor name for the signature");
 if(!/^#[a-f0-9]{6}$/i.test(payload.accent_color))throw Error("Choose a valid certificate accent color");
 const saved=await db("course_certificate_templates","?on_conflict=course_id","POST",{course_id:courseId,...payload},{Prefer:"resolution=merge-duplicates,return=representation"});
 return {template:saved[0]};
}
async function issue(userId:string,courseId:string,staffId:string|null){
 if(!UUID.test(userId)||!UUID.test(courseId))throw Error("Select a valid student and course");
 if(!staffId){
   const revoked=await db("course_certificates","?select=id&user_id=eq."+userId+"&course_id=eq."+courseId+"&revoked_at=not.is.null&limit=1");
   if(revoked.length)throw Error("This certificate was revoked by management. Contact support through the website for review.");
 }
 const issued=await db("rpc/issue_course_completion_certificate","","POST",{p_user_id:userId,p_course_id:courseId,p_issued_by:staffId});
 const certificate=issued[0];
 if(!certificate)throw Error("The certificate was not issued");
 const delivery=await notifyCompletion(certificate);
 return {certificate,delivery};
}
async function notifyCompletion(cert:any){
 if(cert.email_sent_at)return {status:"already_sent"};
 if(!RESEND)return {status:"unavailable",note:"Email sending is not configured. Certificate remains available in the student portal."};
 // Claim the delivery to avoid duplicate notifications for simultaneous requests.
 const cutoff=new Date(Date.now()-10*60*1000).toISOString();
 const claim=await db("course_certificates","?id=eq."+cert.id+"&email_sent_at=is.null&revoked_at=is.null&or=(email_claimed_at.is.null,email_claimed_at.lt."+cutoff+")","PATCH",{email_claimed_at:new Date().toISOString()});
 if(!claim.length)return {status:"already_processing"};
 try{
  const people=await db("customer_profiles","?select=email&id=eq."+cert.user_id+"&limit=1");
  const to=val(people[0]?.email,254);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error("Student email address unavailable");
  const portal="https://app.andreerving.com/#/certificates";
  const logo="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo2.png";
  const html='<!doctype html><html><body style="margin:0;background:#f0f4f8;font-family:Arial,sans-serif;color:#133354"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:30px 12px"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff"><tr><td style="padding:27px;background:#10243f;border-bottom:5px solid #d39a28"><img src="'+logo+'" width="235" alt="Andre Erving" style="height:auto;max-width:100%"></td></tr><tr><td style="padding:35px"><p style="font-size:12px;letter-spacing:2px;color:#b98120;font-weight:bold">COURSE COMPLETED</p><h1 style="font-size:28px;color:#123454">Congratulations, '+escape(cert.student_name)+'!</h1><p style="font-size:16px;line-height:1.8">You successfully completed <strong>'+escape(cert.course_title)+'</strong>. Your personalized certificate of completion is now available in your student portal.</p><p style="font-size:13px;color:#637c96">Certificate number: <strong>'+escape(cert.certificate_number)+'</strong></p><p style="margin:32px 0"><a href="'+portal+'" style="display:inline-block;background:#d19b2b;color:#112b48;text-decoration:none;border-radius:8px;padding:16px 25px;font-weight:bold">View My Certificate</a></p><p style="font-size:13px;line-height:1.7;color:#647b92">Sign in to your student portal to view, print, or download your certificate.</p></td></tr><tr><td style="background:#f4f7fb;border-top:1px solid #dce5ef;padding:23px;font-size:12px;color:#5a728b;line-height:1.7">Andre Erving · Growth, Strategy &amp; Education<br><a href="https://andreerving.com/contact.html">Contact us</a></td></tr></table></td></tr></table></body></html>';
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+RESEND,"Content-Type":"application/json","Idempotency-Key":"course-certificate-"+cert.id},body:JSON.stringify({from:"Andre Erving <support@andreerving.com>",to:[to],subject:"Congratulations! Your "+cert.course_title+" certificate is ready",html})});
  const result=await sent.json().catch(()=>({}));
  if(!sent.ok||!result.id)throw Error("Provider did not accept completion email");
  await db("course_certificates","?id=eq."+cert.id,"PATCH",{email_sent_at:new Date().toISOString(),email_error:null,email_claimed_at:null});
  return {status:"sent"};
 }catch(e){
  const message=val(e instanceof Error?e.message:e,350);
  await db("course_certificates","?id=eq."+cert.id,"PATCH",{email_error:message,email_claimed_at:null});
  return {status:"failed",note:"Certificate issued, but the completion email could not be delivered."};
 }
}
async function revoke(d:any,u:any){
 const id=val(d.id,45);if(!UUID.test(id))throw Error("Invalid certificate");
 const rows=await db("course_certificates","?id=eq."+id+"&revoked_at=is.null","PATCH",{revoked_at:new Date().toISOString(),revoked_by:u.id});
 if(!rows.length)throw Error("Certificate already deleted or not found");
 return {revoked:true,number:rows[0].certificate_number};
}
async function automaticCompletionNotification(req:Request){
 const supplied=req.headers.get("x-ae-certificate-key")||"";
 if(!supplied||supplied.length>200)return {error:"Unauthorized certificate notification",status:403};
 const rows=await db("rpc/certificate_notification_key","","POST",{});
 const secret=typeof rows==="string"?rows:rows?.key||"";
 const x=new TextEncoder().encode(supplied),y=new TextEncoder().encode(secret);
 if(!secret||x.length!==y.length)return {error:"Unauthorized certificate notification",status:403};
 let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
 if(difference!==0)return {error:"Unauthorized certificate notification",status:403};
 const input=await req.json();
 const id=val(input?.certificateId,45);
 if(!UUID.test(id))return {error:"Invalid certificate number",status:400};
 const certificate=(await db("course_certificates","?select=*&id=eq."+id+"&revoked_at=is.null&limit=1"))[0];
 if(!certificate)return {error:"Certificate not found",status:404};
 return {response:await notifyCompletion(certificate),status:200};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return reply({},200,origin);
 if(req.method!=="POST")return reply({error:"Unsupported method"},405,origin);
 if(!SERVICE)return reply({error:"Certificate service unavailable"},503,origin);
 try{
  const url=new URL(req.url);
  if(url.searchParams.has("completion_notification")){
    const response=await automaticCompletionNotification(req);
    return reply(response.response||{error:response.error},response.status,origin);
  }
  if(!ORIGINS.has(origin))return reply({error:"Invalid origin"},403,origin);
  const u=await auth(req),d=await req.json(),action=val(d.action,55);
  if(action==="my_certificates")return reply(await listStudent(u.id),200,origin);
  if(action==="issue_mine")return reply(await issue(u.id,val(d.courseId,45),null),200,origin);
  await staff(u);
  if(action==="management_list")return reply(await listAdmin(),200,origin);
  if(action==="save_template")return reply(await saveTemplate(d,u),200,origin);
  if(action==="issue_certificate")return reply(await issue(val(d.userId,45),val(d.courseId,45),u.id),200,origin);
  if(action==="delete_certificate")return reply(await revoke(d,u),200,origin);
  if(action==="resend_completion_email"){
    const cert=(await db("course_certificates","?select=*&id=eq."+val(d.id,45)+"&revoked_at=is.null&limit=1"))[0];
    if(!cert)throw Error("Certificate not found");return reply(await notifyCompletion(cert),200,origin);
  }
  return reply({error:"Unknown certificate action"},400,origin);
 }catch(e){
  const message=val(e instanceof Error?e.message:e,420);
  console.error("Certificate operation",message);
  return reply({error:message},/management authorization|sign in|session/i.test(message)?403:400,origin)
 }
});