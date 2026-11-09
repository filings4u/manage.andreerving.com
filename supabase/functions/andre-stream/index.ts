// Andre Erving secure Cloudflare Stream bridge.
// Required Supabase Edge Function secrets:
// CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN.
// Videos are private in Cloudflare Stream; signed playback tokens only for enrolled students.
import { createClient } from "npm:@supabase/supabase-js@2";
const cors=(origin:string|null)=>({
 "Access-Control-Allow-Origin": origin&&allowedOrigins.includes(origin)?origin:allowedOrigins[0],
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"
});
const allowedOrigins=["https://filings4u.github.io","https://manage.andreerving.com","https://app.andreerving.com"];
const json=(data:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json"}});
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const VIDEO=/^[a-f0-9]{32}$/i;
const MAX=200*1024*1024;
Deno.serve(async(request:Request)=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(request.method!=="POST")return json({success:false,error:"Method not allowed"},405,origin);
 if(origin&&!allowedOrigins.includes(origin))return json({success:false,error:"Origin not allowed"},403,origin);
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return json({success:false,error:"Sign-in required"},401,origin);
 const base=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!base||!anon)return json({success:false,error:"Authentication unavailable"},503,origin);
 const supabase=createClient(base,anon,{global:{headers:{Authorization:"Bearer "+token}}});
 const {data:auth,error:authError}=await supabase.auth.getUser(token);
 if(authError||!auth.user)return json({success:false,error:"Invalid session"},401,origin);
 let payload:Record<string,unknown>;
 try{payload=await request.json()}catch{return json({success:false,error:"Invalid request"},400,origin)}
 const mode=String(payload.mode||"");
 const account=Deno.env.get("CLOUDFLARE_ACCOUNT_ID")||"5f9936b3afd85ef4cfac320acf4b1554";
 const apiKey=Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN")||"";
 if(!account||!apiKey){const missing=[!account?"CLOUDFLARE_ACCOUNT_ID":null,!apiKey?"CLOUDFLARE_STREAM_API_TOKEN":null].filter(Boolean);return json({success:false,error:"Cloudflare Stream is not configured. Missing secret(s): "+missing.join(", "),missing},503,origin)}
 const api=async(path:string,method="GET",body?:unknown)=>{
   const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/stream/"+path,{
     method,headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
     body:body===undefined?undefined:JSON.stringify(body)
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok||!result?.success)throw new Error("Cloudflare Stream request failed: "+(result?.errors?.[0]?.message||response.status));
   return result.result;
 };
 const staff=async()=>{
   const {data,error}=await supabase.from("admin_profiles").select("active,role").eq("id",auth.user!.id).maybeSingle();
   return !error&&data?.active===true&&["admin","manager","editor"].includes(data.role);
 };
 try{
  if(mode==="health"){
    if(!await staff())return json({success:false,error:"Staff access required"},403,origin);
    await api("","GET");
    return json({success:true,connected:true,message:"Cloudflare Stream authentication succeeded"},200,origin);
  }
  if(mode==="init-upload"||mode==="init-library-upload"){
    if(!await staff())return json({success:false,error:"Staff access required"},403,origin);
    const courseId=String(payload.courseId||""),fileSize=Number(payload.fileSize),fileName=String(payload.fileName||"");
    if((mode==="init-upload"&&!ID.test(courseId))||!Number.isFinite(fileSize)||fileSize<=0||fileSize>MAX||fileName.length>255)return json({success:false,error:"Invalid upload. Maximum size is 200 MB."},400,origin);
    if(mode==="init-upload"){
      const {data:course}=await supabase.from("courses").select("id").eq("id",courseId).maybeSingle();
      if(!course)return json({success:false,error:"Course not found"},404,origin);
    }
    const data=await api("direct_upload","POST",{
      maxDurationSeconds:36000,creator:auth.user!.id,requireSignedURLs:true,
      expiry:new Date(Date.now()+60*60*1000).toISOString(),
      meta:{name:fileName.slice(0,180),course_id:mode==="init-upload"?courseId:"",app:"andreerving-lms-library"},
      allowedOrigins:["filings4u.github.io","manage.andreerving.com","app.andreerving.com"]
    });
    if(!VIDEO.test(data.uid||"")||!/^https:\/\//.test(data.uploadURL||""))throw new Error("Cloudflare returned an invalid upload response");
    return json({success:true,uid:data.uid,uploadURL:data.uploadURL,maxBytes:MAX},200,origin);
  }
  if(mode==="status"){
    if(!await staff())return json({success:false,error:"Staff access required"},403,origin);
    const uid=String(payload.uid||"");if(!VIDEO.test(uid))return json({success:false,error:"Invalid video identifier"},400,origin);
    const data=await api(encodeURIComponent(uid));
    return json({success:true,ready:data.readyToStream===true,status:data.status?.state||"processing",duration:data.duration||0},200,origin);
  }
  if(mode==="playback"){
    const lessonId=String(payload.lessonId||"");
    if(!ID.test(lessonId))return json({success:false,error:"Invalid lesson"},400,origin);
    const {data:adminAccess}=await supabase.from("admin_profiles").select("id,role").eq("id",auth.user!.id).eq("active",true).maybeSingle();
    const isStaff=!!adminAccess&&["admin","manager","editor"].includes(adminAccess.role);
    const lessonTable=isStaff?"course_lessons":"published_course_lessons";
    const {data:lesson,error:lessonError}=await supabase.from(lessonTable).select("id,course_id,video_url,lesson_type").eq("id",lessonId).maybeSingle();
    if(lessonError||!lesson||lesson.lesson_type!=="video")return json({success:false,error:"Published video lesson not available"},404,origin);
    const match=String(lesson.video_url||"").match(/^cfstream:([a-f0-9]{32})$/i);
    if(!match)return json({success:false,error:"No Cloudflare video assigned"},404,origin);
    if(!isStaff){
      const {data:enrollment}=await supabase.from("course_enrollments").select("status,expires_at").eq("course_id",lesson.course_id).eq("user_id",auth.user!.id).in("status",["active","completed"]).maybeSingle();
      if(!enrollment||(enrollment.expires_at&&new Date(enrollment.expires_at).getTime()<=Date.now()))return json({success:false,error:"You are not enrolled in this course"},403,origin);
    }
    const data=await api(encodeURIComponent(match[1])+"/token","POST",{});
    if(!data?.token)return json({success:false,error:"Could not authorize video"},502,origin);
    return json({success:true,uid:match[1],token:data.token},200,origin);
  }
  return json({success:false,error:"Unknown action"},400,origin);
 }catch(error){return json({success:false,error:error instanceof Error?error.message:"Stream service unavailable"},502,origin)}
});
