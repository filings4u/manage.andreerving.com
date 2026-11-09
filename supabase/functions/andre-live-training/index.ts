import {createClient} from "npm:@supabase/supabase-js@2.113.0";
const origins=new Set(["https://manage.andreerving.com","https://app.andreerving.com","http://localhost:3000","http://127.0.0.1:3000"]);
const env=(key:string)=>Deno.env.get(key)?.trim()||"";
const clean=(x:any,max=250)=>String(x??"").trim().slice(0,max);
const uuid=(x:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||""));
const err=(e:any)=>e?.message||String(e);
async function teams(s:any){
 const tenant=env("MICROSOFT_TENANT_ID"),id=env("MICROSOFT_CLIENT_ID"),secret=env("MICROSOFT_CLIENT_SECRET"),organizer=env("MICROSOFT_TEAMS_ORGANIZER_USER_ID");
 if(!tenant||!id||!secret||!organizer)throw new Error("Microsoft Teams credentials are not configured in Andre Erving Supabase Edge Function secrets.");
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
 const management=new Set(["staff_list","create","update","schedule","cancel","attendees","mark_attendance","delete"]);
 if(management.has(action)&&!isStaff)return reply({error:"Management access required"},403);
 const dbError=(r:any)=>{if(r.error)throw r.error;return r.data};
 const sessionId=clean(body.session_id,50);
 const selectSession=async()=>{if(!uuid(sessionId))throw new Error("Valid session ID required");const a=dbError(await db.from("live_training_sessions").select("*").eq("id",sessionId).maybeSingle());if(!a)throw new Error("Session not found");return a};
 if(action==="staff_list"){
  const courses=dbError(await db.from("courses").select("id,title,status").order("title").limit(500));
  const sessions=dbError(await db.from("live_training_sessions").select("*").order("start_at",{ascending:false}).limit(500));
  const attendees=dbError(await db.from("live_training_attendees").select("session_id,user_id,status,registered_at").limit(5000));
  return reply({success:true,courses,sessions,attendees});
 }
 if(action==="create"){
  if(!uuid(body.course_id))throw new Error("Select a course");
  const start=new Date(body.start_at),end=new Date(body.end_at);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start<=new Date()||end<=start||end.getTime()-start.getTime()>8*3600000)throw new Error("Enter a future start and end time, up to 8 hours");
  const {data:course,error:ce}=await db.from("courses").select("id,title").eq("id",body.course_id).maybeSingle();if(ce||!course)throw new Error("Course not found");
  const row={course_id:course.id,title:clean(body.title,160)||course.title+" — Live Training",description:clean(body.description,2500),start_at:start.toISOString(),end_at:end.toISOString(),timezone:clean(body.timezone,80)||"America/Chicago",capacity:Math.max(1,Math.min(1000,Math.trunc(Number(body.capacity)||30))),status:"draft",host_name:clean(body.host_name,120)||"Andre Erving Training",created_by:user.id};
  return reply({success:true,session:dbError(await db.from("live_training_sessions").insert(row).select("*").single())});
 }
 if(action==="update"){
  const session=await selectSession();if(session.status==="cancelled"||session.status==="completed")throw new Error("Completed or cancelled sessions cannot be edited");
  const start=new Date(body.start_at),end=new Date(body.end_at);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start<=new Date()||end<=start||end.getTime()-start.getTime()>8*3600000)throw new Error("Invalid future session times");
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
  await selectSession();if(!uuid(body.user_id)||!["attended","no_show","registered"].includes(body.status))throw new Error("Invalid attendance status");
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
  const rpc=dbError(await db.rpc("live_training_registration",{p_session:sessionId,p_cancel:action==="unregister"}));
  return reply({success:true,status:rpc});
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