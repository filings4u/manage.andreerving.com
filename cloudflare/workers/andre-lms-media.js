// Andre Erving private administrator media gateway.
// Requires Cloudflare R2 binding "LMS_MEDIA"; credentials never reach the browser.
const SUPABASE_URL = "https://gnfyidajbectlppsekzj.supabase.co";
const SUPABASE_KEY = "sb_publishable_DGt4HrHAwWyMt-0Xtzlfog_F18RnOyf";
const origins = new Set(["https://filings4u.github.io","https://manage.andreerving.com","https://app.andreerving.com"]);
const types = {
  "audio/mpeg":["mp3",50], "audio/mp4":["m4a",50],"audio/x-m4a":["m4a",50],
  "audio/wav":["wav",50],"audio/x-wav":["wav",50],"audio/ogg":["ogg",50],
  "image/jpeg":["jpg",10],"image/png":["png",10],"image/webp":["webp",10],
  "application/pdf":["pdf",20],"text/plain":["txt",20],
  "application/msword":["doc",20],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":["docx",20],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":["xlsx",20],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":["pptx",20]
};
const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
const validUuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const fail=(message,status=400)=>json({error:message},status);
export default {
 async fetch(req,env) {
  const origin=req.headers.get("Origin")||"";
  if(origin&&!origins.has(origin))return fail("Origin not permitted",403);
  const cors={"Access-Control-Allow-Origin":origin||"https://filings4u.github.io","Vary":"Origin","Access-Control-Allow-Headers":"authorization,content-type,x-ae-course-id","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Max-Age":"3600"};
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"Not found"},404,cors);
  const pathname=new URL(req.url).pathname;
  if(pathname!=="/upload"&&pathname!=="/read")return json({error:"Not found"},404,cors);
  const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return json({error:"Sign in required"},401,cors);
  try{
   // Auth API verifies the signed JWT. Admin profile is read with the user's
   // own token and Supabase RLS (not a privileged service-role key).
   const userResponse=await fetch(SUPABASE_URL+"/auth/v1/user",{
      headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+token}});
   if(!userResponse.ok)return json({error:"Session expired or invalid"},401,cors);
   const user=await userResponse.json();
   if(!validUuid(user.id))return json({error:"Invalid identity"},401,cors);
   const staffResponse=await fetch(SUPABASE_URL+"/rest/v1/admin_profiles?id=eq."+encodeURIComponent(user.id)+"&select=id,active",{
      headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+token}});
   if(!staffResponse.ok)return json({error:"Staff access check unavailable"},403,cors);
   const profiles=await staffResponse.json();
   const isStaff=Array.isArray(profiles)&&profiles.some(p=>p.id===user.id&&p.active===true);
   if(pathname==="/upload"&&!isStaff)
     return json({error:"Active administrator account required"},403,cors);
   let courseId, mime, bytes, path;
   if(pathname==="/upload"){
     courseId=req.headers.get("x-ae-course-id")||"";
     mime=(req.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
     const spec=types[mime];
     bytes=Number(req.headers.get("content-length"));
     if(!validUuid(courseId)||!spec||!Number.isSafeInteger(bytes)||bytes<=0||bytes>spec[1]*1048576)
       return json({error:"Unsupported file type or file size"},400,cors);
   }else{
     const body=await req.json().catch(()=>null);
     path=String(body?.path||"");
     courseId=String(body?.courseId||"");
     if(!validUuid(courseId)||!path.startsWith("r2:"+courseId+"/lesson-media/")||
        path.includes("..")||path.length>350||!/^[a-z0-9:/._-]+$/i.test(path))
        return json({error:"Invalid media path"},400,cors);
   }
   const courseResponse=await fetch(SUPABASE_URL+"/rest/v1/courses?id=eq."+encodeURIComponent(courseId)+"&select=id",{
     headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+token}});
   if(!courseResponse.ok||!(await courseResponse.json()).length)
     return json({error:"Course not accessible"},403,cors);
   if(!isStaff){
     // Enrolled learners may only read media belonging to their own active course.
     const enrollment=await fetch(SUPABASE_URL+"/rest/v1/course_enrollments?user_id=eq."+encodeURIComponent(user.id)+"&course_id=eq."+encodeURIComponent(courseId)+"&status=in.(active,completed)&select=id,expires_at",{
       headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+token}
     });
     if(!enrollment.ok)return json({error:"Unable to verify course enrollment"},403,cors);
     const ent=await enrollment.json();
     if(!Array.isArray(ent)||!ent.some(row=>!row.expires_at||new Date(row.expires_at)>new Date()))
       return json({error:"This lesson requires an active enrollment"},403,cors);
   }
   if(pathname==="/upload"){
     const spec=types[mime];
     if(!req.body)return json({error:"File required"},400,cors);
     const key=courseId+"/lesson-media/"+crypto.randomUUID()+"."+spec[0];
     await env.LMS_MEDIA.put(key,req.body,{httpMetadata:{contentType:mime}});
     return json({path:"r2:"+key},200,cors);
   }
   const object=await env.LMS_MEDIA.get(path.slice(3));
   if(!object)return json({error:"Media not found"},404,cors);
   const headers=new Headers(cors);
   object.writeHttpMetadata(headers);
   headers.set("content-type",object.httpMetadata?.contentType||"application/octet-stream");
   headers.set("cache-control","private, no-store");
   return new Response(object.body,{status:200,headers});
  }catch(err){
   console.error("LMS R2 media worker error",err);
   return json({error:"Media service failed"},500,cors);
  }
 }
};