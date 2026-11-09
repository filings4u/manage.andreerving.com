import {createClient} from "npm:@supabase/supabase-js@2.113.0";
import {CommunicationIdentityClient} from "npm:@azure/communication-identity@1.3.1";
const origins=new Set(["https://manage.andreerving.com","https://app.andreerving.com","http://localhost:3000","http://127.0.0.1:3000"]);
const env=(key:string)=>Deno.env.get(key)?.trim()||"";
const clean=(x:any,max=250)=>String(x??"").trim().slice(0,max);
const uuid=(x:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||""));
const err=(e:any)=>e?.message||String(e);
const microsoftGuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const microsoftDomain=/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
function checkMicrosoftSecrets(){
 const names=["MICROSOFT_TENANT_ID","MICROSOFT_CLIENT_ID","MICROSOFT_CLIENT_SECRET","MICROSOFT_TEAMS_ORGANIZER_USER_ID"];
 const missing=names.filter(name=>!env(name));
 if(missing.length)throw new Error("Missing Microsoft Teams secrets: "+missing.join(", "));
 const tenant=env("MICROSOFT_TENANT_ID");
 if(!microsoftGuid.test(tenant)&&!microsoftDomain.test(tenant))
  throw new Error("MICROSOFT_TENANT_ID must be your Microsoft Entra Directory (tenant) ID (a GUID with hyphens), or a verified tenant domain such as example.onmicrosoft.com. The current value is not a valid tenant identifier.");
 if(!microsoftGuid.test(env("MICROSOFT_CLIENT_ID")))
  throw new Error("MICROSOFT_CLIENT_ID must be the Microsoft Entra application's Application (client) ID in GUID format, not a secret value.");
 const organizer=env("MICROSOFT_TEAMS_ORGANIZER_USER_ID");
 if(!microsoftGuid.test(organizer)&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizer)){
  const kind=/^[a-f0-9]{64}$/i.test(organizer)?"a 64-character hexadecimal value (likely a secret or hash, not a Microsoft user ID)":/^[a-f0-9]{32}$/i.test(organizer)?"a 32-character hexadecimal value without GUID separators":/^https?:\/\//i.test(organizer)?"a URL":/^['"].*['"]$/.test(organizer)?"a quoted value (remove the quotation marks)":"a value that is neither a GUID nor a user principal name";
  throw new Error("MICROSOFT_TEAMS_ORGANIZER_USER_ID is configured, but contains "+kind+". Replace its value with the organizer's Microsoft Entra user Object ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or Microsoft 365 sign-in address (user@company.com). Do not use a Teams meeting ID, app secret, or secret ID.");
 }
 return names;
}
async function teams(s:any){
 const tenant=env("MICROSOFT_TENANT_ID"),id=env("MICROSOFT_CLIENT_ID"),secret=env("MICROSOFT_CLIENT_SECRET"),organizer=env("MICROSOFT_TEAMS_ORGANIZER_USER_ID");
 checkMicrosoftSecrets();
 const t=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(tenant)+"/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:id,client_secret:secret,grant_type:"client_credentials",scope:"https://graph.microsoft.com/.default"})});
 const j=await t.json();if(!t.ok||!j.access_token)throw new Error(j.error_description||"Microsoft token request failed");
 const base="https://graph.microsoft.com/v1.0/users/"+encodeURIComponent(organizer)+"/onlineMeetings";
 const isExisting=!!s.meeting_id;
 const r=await fetch(isExisting?base+"/"+encodeURIComponent(s.meeting_id):base,{method:isExisting?"PATCH":"POST",headers:{Authorization:"Bearer "+j.access_token,"Content-Type":"application/json"},body:JSON.stringify({subject:s.title,startDateTime:s.start_at,endDateTime:s.end_at})});
 const m=r.status===204?{}:await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(m?.error?.message||"Microsoft Graph meeting request failed ("+r.status+")");
 return {id:m.id||s.meeting_id,url:m.joinWebUrl||s.meeting_url};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":origins.has(origin)?origin:"https://app.andreerving.com","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
 const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 try{
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return reply({error:"Authentication required"},401);
 const db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
 const {data:ud,error:ae}=await db.auth.getUser(token);if(ae||!ud.user)return reply({error:"Invalid login"},401);
 const user=ud.user;
 const {data:staff}=await db.from("admin_profiles").select("id,role,active").eq("id",user.id).maybeSingle();
 const isStaff=!!staff?.active&&["admin","manager","editor"].includes(staff.role);
 const body=await req.json().catch(()=>({}));const action=clean(body.action,30);
 const management=new Set(["config_status","verify_teams","staff_list","create","update","schedule","cancel","attendees","mark_attendance","delete"]);
 if(management.has(action)&&!isStaff)return reply({error:"Management access required"},403);
 const dbError=(r:any)=>{if(r.error)throw r.error;return r.data};
 const sessionId=clean(body.session_id,50);
 const selectSession=async()=>{if(!uuid(sessionId))throw new Error("Valid session ID required");const a=dbError(await db.from("live_training_sessions").select("*").eq("id",sessionId).maybeSingle());if(!a)throw new Error("Session not found");return a};
 if(action==="config_status"){return reply({success:true,teams_configured:["MICROSOFT_TENANT_ID","MICROSOFT_CLIENT_ID","MICROSOFT_CLIENT_SECRET","MICROSOFT_TEAMS_ORGANIZER_USER_ID"].every(key=>!!env(key)),missing_secret_names:["MICROSOFT_TENANT_ID","MICROSOFT_CLIENT_ID","MICROSOFT_CLIENT_SECRET","MICROSOFT_TEAMS_ORGANIZER_USER_ID"].filter(key=>!env(key)),embedded_meeting_configured:!!(env("AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING")||env("ACS_CONNECTION_STRING"))})}
 if(action==="verify_teams"){
  checkMicrosoftSecrets();
  const t=await fetch("https://login.microsoftonline.com/"+encodeURIComponent(env("MICROSOFT_TENANT_ID"))+"/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env("MICROSOFT_CLIENT_ID"),client_secret:env("MICROSOFT_CLIENT_SECRET"),grant_type:"client_credentials",scope:"https://graph.microsoft.com/.default"})});
  const j=await t.json();
  if(!t.ok||!j.access_token)throw new Error(j.error_description||"Microsoft Graph authentication failed");
  let roles:string[]=[];
  try{
    const segment=String(j.access_token).split(".")[1];
    const decoded=JSON.parse(atob(segment.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(segment.length/4)*4,"=")));
    roles=Array.isArray(decoded.roles)?decoded.roles.filter((v:any)=>typeof v==="string"):[];
  }catch{
    return reply({success:false,error:"Microsoft login succeeded, but application permissions could not be inspected. Verify Microsoft Graph application permission OnlineMeetings.ReadWrite.All is granted with admin consent.",authentication_ok:true,permission_check:"unavailable"},409);
  }
  const canCreate=roles.includes("OnlineMeetings.ReadWrite.All");
  if(!canCreate)return reply({
    success:false,authentication_ok:true,online_meetings_permission:false,
    error:"Microsoft authentication succeeded, but the app token does not have OnlineMeetings.ReadWrite.All. In Microsoft Entra > App registrations > API permissions, add Microsoft Graph APPLICATION permission OnlineMeetings.ReadWrite.All, then Grant admin consent. An application access policy for the Teams organizer is also needed to create meetings."
  },409);
  return reply({success:true,configured:true,authentication_ok:true,organizer_name:"Configured Teams organizer",online_meetings_permission:true,embedded_meeting_configured:!!(env("AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING")||env("ACS_CONNECTION_STRING")),note:"Teams creation permission verified. Embedded in-portal calling additionally requires an Azure Communication Services connection string."});
 }
 if(action==="staff_list"){
  const courses=dbError(await db.from("courses").select("id,title,status").order("title").limit(500));
  const sessions=dbError(await db.from("live_training_sessions").select("*").order("start_at",{ascending:false}).limit(500));
  const attendees=dbError(await db.from("live_training_attendees").select("session_id,user_id,status,registered_at").limit(5000));
  return reply({success:true,courses,sessions,attendees});
 }
 if(action==="create"){
  if(!uuid(body.course_id))throw new Error("Select a course");
  const start=new Date(body.start_at),end=new Date(body.end_at);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw new Error("Enter valid start and end dates.");if(start<=new Date())throw new Error("The session start must be in the future.");if(end<=start)throw new Error("The end time must be after the start time.");if(end.getTime()-start.getTime()>8*3600000)throw new Error("The selected session lasts longer than 8 hours. End it within 8 hours of the start, or create separate sessions for each training day.");
  const {data:course,error:ce}=await db.from("courses").select("id,title").eq("id",body.course_id).maybeSingle();if(ce||!course)throw new Error("Course not found");
  const row={course_id:course.id,title:clean(body.title,160)||course.title+" — Live Training",description:clean(body.description,2500),start_at:start.toISOString(),end_at:end.toISOString(),timezone:clean(body.timezone,80)||"America/Chicago",capacity:Math.max(1,Math.min(1000,Math.trunc(Number(body.capacity)||30))),status:"draft",host_name:clean(body.host_name,120)||"Andre Erving Training",created_by:user.id};
  return reply({success:true,session:dbError(await db.from("live_training_sessions").insert(row).select("*").single())});
 }
 if(action==="update"){
  const session=await selectSession();if(session.status==="cancelled"||session.status==="completed")throw new Error("Completed or cancelled sessions cannot be edited");
  const start=new Date(body.start_at),end=new Date(body.end_at);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw new Error("Enter valid start and end dates.");if(start<=new Date())throw new Error("The session start must be in the future.");if(end<=start)throw new Error("The end time must be after the start time.");if(end.getTime()-start.getTime()>8*3600000)throw new Error("The selected session lasts longer than 8 hours. End it within 8 hours of the start, or create separate sessions for each training day.");
  const row={title:clean(body.title,160),description:clean(body.description,2500),start_at:start.toISOString(),end_at:end.toISOString(),timezone:clean(body.timezone,80)||"America/Chicago",capacity:Math.max(1,Math.min(1000,Math.trunc(Number(body.capacity)||30))),host_name:clean(body.host_name,120)||"Andre Erving Training",updated_at:new Date().toISOString()};
  if(session.status==="scheduled"&&session.meeting_id){const meeting=await teams({...session,...row});row["meeting_id"]=meeting.id;row["meeting_url"]=meeting.url}
  return reply({success:true,session:dbError(await db.from("live_training_sessions").update(row).eq("id",session.id).select("*").single())});
 }
 if(action==="schedule"){
  const session=await selectSession();if(session.status==="cancelled"||session.status==="completed")throw new Error("This session cannot be scheduled");
  if(new Date(session.start_at)<=new Date())throw new Error("Start date must be in the future");
  let meeting;try{meeting=await teams(session)}catch(e){await db.from("live_training_sessions").update({teams_error:err(e)}).eq("id",session.id);throw e}
  const row={meeting_provider:"microsoft_teams",meeting_id:meeting.id,meeting_url:meeting.url,teams_error:null,status:"scheduled",updated_at:new Date().toISOString()};
  return reply({success:true,session:dbError(await db.from("live_training_sessions").update(row).eq("id",session.id).select("*").single())});
 }
 if(action==="cancel"){
  const session=await selectSession();
  return reply({success:true,session:dbError(await db.from("live_training_sessions").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",session.id).select("*").single())});
 }
 if(action==="attendees"){
  const session=await selectSession();const attendees=dbError(await db.from("live_training_attendees").select("*").eq("session_id",session.id).order("registered_at"));
  const ids=attendees.map((x:any)=>x.user_id);const profiles=ids.length?dbError(await db.from("customer_profiles").select("id,full_name,email").in("id",ids)):[];
  return reply({success:true,attendees:attendees.map((a:any)=>({...a,name:profiles.find((p:any)=>p.id===a.user_id)?.full_name||"",email:profiles.find((p:any)=>p.id===a.user_id)?.email||""}))});
 }
 if(action==="mark_attendance"){
  await selectSession();if(!uuid(body.user_id)||!["attended","no_show","registered","cancelled"].includes(body.status))throw new Error("Invalid attendance status");
  const a=dbError(await db.from("live_training_attendees").update({status:body.status,updated_at:new Date().toISOString()}).eq("session_id",sessionId).eq("user_id",body.user_id).select("id"));
  if(!a?.length)throw new Error("Registration not found");return reply({success:true});
 }
 if(action==="student_list"){
  const enrollments=dbError(await db.from("course_enrollments").select("course_id,status,expires_at").eq("user_id",user.id).in("status",["active","completed"]));
  const active=enrollments.filter((x:any)=>!x.expires_at||new Date(x.expires_at)>new Date()).map((x:any)=>x.course_id);
  if(!active.length)return reply({success:true,sessions:[]});
  const sessions=dbError(await db.from("live_training_sessions").select("id,course_id,title,description,start_at,end_at,timezone,capacity,host_name,status").in("course_id",active).eq("status","scheduled").gte("end_at",new Date().toISOString()).order("start_at",{ascending:true}).limit(250));
  const ids=sessions.map((x:any)=>x.id);
  const registrations=ids.length?dbError(await db.from("live_training_attendees").select("session_id,status").eq("user_id",user.id).in("session_id",ids)):[];
  const counts=ids.length?dbError(await db.from("live_training_attendees").select("session_id,status").in("session_id",ids).in("status",["registered","attended"])):[];
  const titles=dbError(await db.from("courses").select("id,title").in("id",active));
  return reply({success:true,sessions:sessions.map((s:any)=>({...s,course_title:titles.find((x:any)=>x.id===s.course_id)?.title||"Course",registered:registrations.find((r:any)=>r.session_id===s.id)?.status==="registered",registered_count:counts.filter((x:any)=>x.session_id===s.id).length}))});
 }
 if(action==="register"||action==="unregister"){
  if(!uuid(sessionId))throw new Error("Valid session required");
  // The service-role client has no auth.uid() claim. Execute the registration
  // RPC as the verified learner so its SECURITY DEFINER checks their identity.
  const anonKey=env("SUPABASE_ANON_KEY");
  if(!anonKey)throw new Error("Registration auth configuration is unavailable.");
  const learnerDb=createClient(env("SUPABASE_URL"),anonKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  const rpc=dbError(await learnerDb.rpc("live_training_registration",{p_session:sessionId,p_cancel:action==="unregister"}));
  return reply({success:true,status:rpc});
 }
 if(action==="embedded_token"){
  const s=await selectSession();
  if(s.status!=="scheduled"||!s.meeting_url)return reply({error:"The meeting has not been scheduled yet."},409);
  if(!isStaff){
    const a=dbError(await db.from("live_training_attendees").select("status").eq("session_id",s.id).eq("user_id",user.id).maybeSingle());
    if(!["registered","attended"].includes(a?.status))return reply({error:"Register for this session before joining."},403);
    const enrollment=dbError(await db.from("course_enrollments").select("id,status,expires_at").eq("course_id",s.course_id).eq("user_id",user.id).in("status",["active","completed"]).limit(1));
    if(!enrollment.length||enrollment.every((e:any)=>e.expires_at&&new Date(e.expires_at)<=new Date()))return reply({error:"Active course access is required to join this meeting."},403);
  }
  const now=Date.now(),start=new Date(s.start_at).getTime(),end=new Date(s.end_at).getTime();
  if(now<start-30*60000||now>end+60*60000)return reply({error:"The meeting room opens 30 minutes before class and closes one hour afterward.",join_available_at:new Date(start-30*60000).toISOString()},403);
  const connection=env("AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING")||env("ACS_CONNECTION_STRING");
  if(!connection)return reply({error:"Embedded meetings need Azure Communication Services. Add AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING to the Andre Erving Supabase Edge Function secrets. Your Microsoft Teams credentials alone do not enable embedded video."},409);
  // Validate format without revealing secret values in error messages or logs.
  const parts=connection.split(";").map(x=>x.trim()).filter(Boolean);
  const entries=new Map(parts.map(part=>{const i=part.indexOf("=");return i<0?["", ""]:[part.slice(0,i).trim().toLowerCase(),part.slice(i+1).trim()]}));
  const endpoint=entries.get("endpoint")||"",accessKey=entries.get("accesskey")||"";
  if(!/^https:\/\/[a-z0-9.-]+\.communication\.azure\.com\/?$/i.test(endpoint)||!accessKey||parts.length!==2){
    return reply({error:"The Azure Communication Services secret has the wrong format. In Azure Portal > Communication Services > Keys, copy the complete Primary connection string (Endpoint=https://...communication.azure.com;AccessKey=...), and paste it as AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING in Supabase. Do not use only the Access Key or a Microsoft Teams client secret."},409);
  }
  let issued;
  try{
   const identity=new CommunicationIdentityClient(connection);
   issued=await identity.createUserAndToken(["voip"],{tokenExpiresInMinutes:60});
  }catch(e){
   // Do not log the SDK error: malformed credentials can be reflected verbatim.
   console.error("ACS token issuance unsuccessful; no credential details logged");
   return reply({error:"The Azure Communication Services connection string has the correct structure, but Azure rejected the token request. Verify that the connection string was copied from the Azure Communication Services resource's Keys page and its access key is current."},503);
  }
  return reply({success:true,session_id:s.id,title:s.title,starts_at:s.start_at,ends_at:s.end_at,meeting_link:s.meeting_url,acs:{user_id:issued.user.communicationUserId,token:issued.token,expires_at:issued.expiresOn?.toISOString?.()||null},display_name:clean(user.user_metadata?.full_name||user.email?.split("@")[0]||"Student",120)});
 }
 if(action==="join"){
  const s=await selectSession();if(s.status!=="scheduled"||!s.meeting_url)throw new Error("Session meeting is unavailable");
  if(!isStaff){
   const a=dbError(await db.from("live_training_attendees").select("status").eq("session_id",s.id).eq("user_id",user.id).maybeSingle());
   if(a?.status!=="registered"&&a?.status!=="attended")return reply({error:"Register for this session first"},403);
  }
  const now=Date.now(),start=new Date(s.start_at).getTime(),end=new Date(s.end_at).getTime();
  if(now<start-30*60000||now>end+60*60000)return reply({error:"Join opens 30 minutes before the session and closes 60 minutes afterward"},403);
  return reply({success:true,url:s.meeting_url,title:s.title});
 }
 return reply({error:"Unsupported action"},400);
 }catch(e){console.error("andre-live-training",err(e));return reply({error:err(e)},400)}
});