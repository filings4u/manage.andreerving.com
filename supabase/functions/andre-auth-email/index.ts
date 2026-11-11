// Secure password recovery; Supabase generates one-time recovery tokens, Resend delivers branded email.
const B=Deno.env.get("SUPABASE_URL")||"https://gnfyidajbectlppsekzj.supabase.co";
const S=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const RESEND=Deno.env.get("RESEND_API_KEY")||"";
const O=new Set(["https://app.andreerving.com","https://manage.andreerving.com","https://andreerving.com","https://www.andreerving.com"]);
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const brand="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo.png";
function response(body:unknown,status:number,origin:string){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",...(O.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"content-type,apikey,authorization","Access-Control-Allow-Methods":"POST,OPTIONS"}})}
function html(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}
async function sha(s:string){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,"0")).join("")}
const serviceHeaders=()=>({apikey:S,Authorization:"Bearer "+S,"Content-Type":"application/json"});
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS")return response({},200,origin);
 if(request.method!=="POST"||!O.has(origin))return response({error:"Not available"},403,origin);
 if(!S||!RESEND)return response({error:"Email delivery is not configured. Please contact support."},503,origin);
 let input:any;try{input=await request.json()}catch{return response({error:"Invalid request"},400,origin)}
 const address=String(input.email||"").trim().toLowerCase();
 if(address.length>254||!emailRe.test(address))return response({error:"Enter a valid email address."},400,origin);
 const generic={message:"If this email belongs to an account, password reset instructions will arrive shortly."};
 const requester=(request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").trim();
 try{
  const [eHash,rHash]=await Promise.all([sha(address),sha(requester)]);
  const allowance=await fetch(B+"/rest/v1/rpc/reserve_auth_email_delivery",{method:"POST",headers:serviceHeaders(),body:JSON.stringify({p_email_hash:eHash,p_requester_hash:rHash})});
  if(!allowance.ok)throw Error("Cannot check email delivery limits");
  if(await allowance.json()!==true)return response(generic,200,origin);
  // Supabase generates a secure, one-time recovery token without sending a second unbranded email.
  const generated=await fetch(B+"/auth/v1/admin/generate_link",{method:"POST",headers:serviceHeaders(),
   body:JSON.stringify({type:"recovery",email:address})});
  if(!generated.ok){
   // Unknown accounts and other GoTrue failures must not reveal account existence.
   console.warn("Recovery link generation failed",generated.status);
   return response(generic,200,origin);
  }
  const data=await generated.json();
  const token=String(data.properties?.hashed_token||data.hashed_token||"");
  if(!/^[a-zA-Z0-9_-]{12,300}$/.test(token))throw Error("Supabase did not provide a recovery token");
  const target=new URL(["https://andreerving.com","https://www.andreerving.com"].includes(origin)?"https://andreerving.com/affiliate-portal/reset.html":"https://app.andreerving.com/reset.html");
  target.searchParams.set("token_hash",token);target.searchParams.set("type","recovery");
  const emailBody='<!doctype html><html><body style="margin:0;padding:35px 15px;background:#eef3f9;font-family:Arial,sans-serif;color:#102844"><table role="presentation" style="max-width:580px;width:100%;margin:auto;border-collapse:collapse;background:white;border-radius:12px"><tr><td style="padding:28px 34px;border-bottom:4px solid #d19b2c"><img src="'+brand+'" alt="Andre Erving Growth Strategy Education" width="340" style="max-width:100%;height:auto"></td></tr><tr><td style="padding:30px 34px"><h1 style="font-size:25px;color:#112d4b">Reset your password</h1><p style="font-size:15px;line-height:1.7">We received a request to reset the password for your Andre Erving account.</p><p style="margin:24px 0"><a style="display:inline-block;border-radius:8px;padding:14px 22px;background:#1f4ca5;color:white;text-decoration:none;font-weight:bold" href="'+html(target.toString())+'">Reset your password</a></p><p style="font-size:13px;color:#60748d;line-height:1.7">If you did not request a reset, you can ignore this email. Your password will remain unchanged.</p><p style="font-size:13px;color:#60748d">Need help? Contact support@andreerving.com.</p></td></tr></table></body></html>';
  const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+RESEND,"Content-Type":"application/json"},
   body:JSON.stringify({from:"Andre Erving <support@andreerving.com>",to:[address],subject:"Reset your Andre Erving account password",html:emailBody})});
  if(!mail.ok){console.error("Resend recovery delivery failed",mail.status);throw Error("Could not deliver password reset instructions. Please try again later.");}
  return response(generic,200,origin);
 }catch(error){console.error("Password recovery delivery error",String(error));return response({error:"Password reset emails are temporarily unavailable. Please try again later."},503,origin)}
});