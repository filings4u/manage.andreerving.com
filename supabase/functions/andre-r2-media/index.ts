// Andre Erving LMS private R2 media signing endpoint.
// R2 credentials are supplied only as Supabase Edge Function secrets.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { S3Client, GetObjectCommand, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.901.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.901.0";

const allowed = new Map([
  ["audio/mpeg",{ext:"mp3",max:100*1024*1024}],
  ["audio/mp4",{ext:"m4a",max:100*1024*1024}],
  ["audio/x-m4a",{ext:"m4a",max:100*1024*1024}],
  ["audio/wav",{ext:"wav",max:100*1024*1024}],
  ["audio/x-wav",{ext:"wav",max:100*1024*1024}],
  ["audio/ogg",{ext:"ogg",max:100*1024*1024}],
  ["image/jpeg",{ext:"jpg",max:15*1024*1024}],
  ["image/png",{ext:"png",max:15*1024*1024}],
  ["image/webp",{ext:"webp",max:15*1024*1024}],
  ["application/pdf",{ext:"pdf",max:50*1024*1024}],
  ["text/plain",{ext:"txt",max:20*1024*1024}],
  ["application/msword",{ext:"doc",max:50*1024*1024}],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document",{ext:"docx",max:50*1024*1024}],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",{ext:"xlsx",max:50*1024*1024}],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation",{ext:"pptx",max:50*1024*1024}]
]);
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...corsHeaders,"content-type":"application/json","cache-control":"no-store"}
});
const requireEnv=(key:string)=>{const value=Deno.env.get(key);if(!value)throw new Error("R2_NOT_CONFIGURED");return value;};
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  if(req.method!=="POST")return respond({error:"Method not allowed"},405);
  const token=(req.headers.get("authorization")||"").match(/^Bearer (.+)$/i)?.[1];
  if(!token)return respond({error:"Authentication required"},401);
  try{
    const client=createClient(requireEnv("SUPABASE_URL"),requireEnv("SUPABASE_ANON_KEY"),{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:{user},error:authError}=await client.auth.getUser(token);
    if(authError||!user)return respond({error:"Invalid session"},401);
    // Only staff may request editor media URLs. Customer playback gets a separate
    // enrollment-aware integration when the customer portal is developed.
    const db=createClient(requireEnv("SUPABASE_URL"),requireEnv("SUPABASE_SERVICE_ROLE_KEY"),{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:staff,error:staffError}=await db.from("admin_profiles").select("active").eq("id",user.id).maybeSingle();
    if(staffError||!staff?.active)return respond({error:"Staff access required"},403);

    let payload:Record<string,unknown>;
    try{payload=await req.json()}catch{return respond({error:"Invalid JSON"},400)}
    const action=payload.action;
    const courseId=String(payload.courseId||"");
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(courseId))return respond({error:"Invalid course"},400);
    const {data:course,error:courseError}=await db.from("courses").select("id").eq("id",courseId).maybeSingle();
    if(courseError||!course)return respond({error:"Course not found"},404);

    // Explicitly fail closed when R2 secrets are not configured.
    const endpoint="https://"+requireEnv("R2_ACCOUNT_ID")+".r2.cloudflarestorage.com";
    const bucket=requireEnv("R2_BUCKET_NAME");
    const s3=new S3Client({
      endpoint,region:"auto",forcePathStyle:true,
      credentials:{accessKeyId:requireEnv("R2_ACCESS_KEY_ID"),secretAccessKey:requireEnv("R2_SECRET_ACCESS_KEY")}
    });
    if(action==="upload"){
      const mime=String(payload.mime||"").toLowerCase(),size=Number(payload.size);
      const rule=allowed.get(mime);
      if(!rule||!Number.isSafeInteger(size)||size<=0||size>rule.max)
        return respond({error:"Unsupported file type or size"},400);
      const key=courseId+"/lesson-media/"+crypto.randomUUID()+"."+rule.ext;
      const url=await getSignedUrl(s3,new PutObjectCommand({
        Bucket:bucket,Key:key,ContentType:mime
      }),{expiresIn:300});
      return respond({url,path:"r2:"+key,contentType:mime,expiresIn:300});
    }
    if(action==="read"){
      const path=String(payload.path||"");
      if(!path.startsWith("r2:"+courseId+"/lesson-media/")||
        path.length>350||path.includes("..")||!/^[a-zA-Z0-9_./:-]+$/.test(path))
        return respond({error:"Invalid media path"},400);
      const key=path.slice(3);
      const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:900});
      return respond({url,expiresIn:900});
    }
    return respond({error:"Unknown action"},400);
  }catch(error){
    if(error instanceof Error&&error.message==="R2_NOT_CONFIGURED")
      return respond({error:"Cloudflare R2 is not configured yet. Set R2 secrets in Supabase.",code:"R2_NOT_CONFIGURED"},503);
    console.error("R2 signing error",error);
    return respond({error:"Unable to authorize R2 media operation"},500);
  }
});
