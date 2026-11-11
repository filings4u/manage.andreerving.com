const B=Deno.env.get("SUPABASE_URL")||"https://gnfyidajbectlppsekzj.supabase.co";
const S=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ORIGINS=new Set(["https://andreerving.com","https://www.andreerving.com","https://app.andreerving.com","https://manage.andreerving.com"]);
const eMail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
function reply(data:unknown,status=200,origin=""){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}})}
const headers=()=>({apikey:S,Authorization:"Bearer "+S,"Content-Type":"application/json"});
async function db(table:string,params:string){const r=await fetch(B+"/rest/v1/"+table+params,{headers:headers()});if(!r.ok)throw Error("Affiliate data query failed");return await r.json()}
async function insert(table:string,body:unknown,upsert=false){const r=await fetch(B+"/rest/v1/"+table,{method:"POST",headers:{...headers(),Prefer:(upsert?"resolution=ignore-duplicates,":"")+"return=representation"},body:JSON.stringify(body)});if(!r.ok)throw Error("Affiliate record could not be saved ("+r.status+")");return await r.json()}
async function patch(table:string,filters:string,body:unknown){const r=await fetch(B+"/rest/v1/"+table+filters,{method:"PATCH",headers:{...headers(),Prefer:"return=representation"},body:JSON.stringify(body)});if(!r.ok)throw Error("Affiliate update failed");return await r.json()}
const clean=(v:unknown,n=150)=>String(v||"").trim().slice(0,n);
async function actor(req:Request){const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!jwt)return null;const r=await fetch(B+"/auth/v1/user",{headers:{apikey:S,Authorization:"Bearer "+jwt}});if(!r.ok)return null;const user=await r.json();return user?.id&&uuid.test(user.id)?user:null}
async function admin(req:Request){const u=await actor(req);if(!u)throw Error("Staff sign-in required");const p=(await db("admin_profiles","?select=active,role&id=eq."+u.id+"&limit=1"))[0];if(!p?.active||!["admin","manager"].includes(p.role))throw Error("Affiliate administration is restricted");return u}
async function me(req:Request){const u=await actor(req);if(!u)throw Error("Sign in to the customer portal");return u}
async function settings(){return (await db("affiliate_settings","?select=*&id=eq.true&limit=1"))[0]}
function email(value:unknown){return clean(value,254).toLowerCase()}
async function apply(data:any,req:Request){
 const u=await actor(req);
 const full_name=clean(data.fullName||u?.user_metadata?.full_name,150),address=email(u?.email||data.email),website=clean(data.website,250),promotion_plan=clean(data.promotionPlan,900);
 if(full_name.length<2||!eMail.test(address)||promotion_plan.length<15)throw Error("Enter your name, valid email, and promotion plan (15 characters minimum)");
 const found=(await db("affiliate_profiles","?select=id,status,code&email=eq."+encodeURIComponent(address)+"&limit=1"))[0];
 if(found)return {submitted:true,existing:true,status:found.status};
 const st=await settings();const code=crypto.randomUUID().replaceAll("-","").slice(0,12);
 await insert("affiliate_profiles",{user_id:u?.id||null,email:address,full_name,website,promotion_plan,code,status:"pending",commission_rate:st.default_commission_rate});
 return {submitted:true,status:"pending"};
}
async function track(data:any){
 const code=clean(data.code,18).toLowerCase();
 if(!/^[a-z0-9]{8,18}$/.test(code))throw Error("Invalid referral code");
 const profile=(await db("affiliate_profiles","?select=id,status&code=eq."+code+"&limit=1"))[0];
 if(!profile||profile.status!=="active")return {valid:false};
 const st=await settings();
 const path=clean(data.path,200).replace(/[^a-zA-Z0-9\/_.?=&-]/g,"");
 const created=(await insert("affiliate_clicks",{affiliate_id:profile.id,landing_path:path||"/",expires_at:new Date(Date.now()+st.attribution_days*86400000).toISOString()}))[0];
 return {valid:true,clickId:created.id,expiresAt:created.expires_at,code};
}
async function resolveClick(clickId:string){
 if(!uuid.test(clickId))return null;
 const clicks=await db("affiliate_clicks","?select=id,affiliate_id,expires_at&id=eq."+clickId+"&expires_at=gt."+new Date().toISOString()+"&limit=1");
 if(!clicks.length)return null;
 const affiliate=(await db("affiliate_profiles","?select=id,status,email,commission_rate&id=eq."+clicks[0].affiliate_id+"&limit=1"))[0];
 return affiliate?.status==="active"?{id:clicks[0].id,affiliate}:null;
}
async function recordConversion(data:any){
 const id=clean(data.paymentIntentId,120),gross=Number(data.amount),buyer=email(data.customerEmail);
 if(!/^pi_[A-Za-z0-9]+$/.test(id)||!Number.isFinite(gross)||gross<=0)throw Error("Invalid verified payment");
 const click=await resolveClick(clean(data.clickId,50));if(!click)return {recorded:false,reason:"Referral expired or inactive"};
 if(buyer&&buyer===email(click.affiliate.email))return {recorded:false,reason:"Self-referrals are excluded"};
 const existing=await db("affiliate_conversions","?select=payment_intent_id&payment_intent_id=eq."+encodeURIComponent(id)+"&limit=1");
 if(existing.length)return {recorded:false,reason:"Already recorded"};
 const st=await settings(),rate=Number(click.affiliate.commission_rate);
 const commission=Math.round(gross*rate)/100;
 await insert("affiliate_conversions",{payment_intent_id:id,affiliate_id:click.affiliate.id,click_id:click.id,customer_email:buyer||null,order_id:uuid.test(String(data.orderId||""))?data.orderId:null,gross_amount:gross,commission_rate:rate,commission_amount:commission,status:"pending",available_at:new Date(Date.now()+st.hold_days*86400000).toISOString()},true);
 return {recorded:true};
}
async function dashboard(req:Request){
 const u=await me(req);
 let p=(await db("affiliate_profiles","?select=*&user_id=eq."+u.id+"&limit=1"))[0];
 if(!p&&u.email)p=(await db("affiliate_profiles","?select=*&email=eq."+encodeURIComponent(email(u.email))+"&limit=1"))[0];
 if(!p)return {profile:null,settings:await settings(),clicks:0,conversions:[]};
 if(!p.user_id&&p.status==="active")await patch("affiliate_profiles","?id=eq."+p.id+"&user_id=is.null",{user_id:u.id});
 const [clicks,conversions,payouts,st]=await Promise.all([
  db("affiliate_clicks","?select=id&affiliate_id=eq."+p.id+"&limit=1000"),
  db("affiliate_conversions","?select=payment_intent_id,gross_amount,commission_amount,status,available_at,created_at&affiliate_id=eq."+p.id+"&order=created_at.desc&limit=100"),
  db("affiliate_payouts","?select=amount,status,created_at,paid_at&affiliate_id=eq."+p.id+"&order=created_at.desc&limit=50"),
  settings()]);
 return {profile:{name:p.full_name,email:p.email,code:p.status==="active"?p.code:null,status:p.status,commissionRate:p.commission_rate},settings:{attributionDays:st.attribution_days,holdDays:st.hold_days,minPayout:st.min_payout},clicks:clicks.length,conversions,payouts};
}
async function overview(req:Request){
 await admin(req);
 const [profiles,conversions,payouts,st]=await Promise.all([
  db("affiliate_profiles","?select=id,full_name,email,code,status,commission_rate,website,promotion_plan,created_at,approved_at&order=created_at.desc&limit=500"),
  db("affiliate_conversions","?select=payment_intent_id,affiliate_id,gross_amount,commission_amount,status,available_at,created_at&order=created_at.desc&limit=500"),
  db("affiliate_payouts","?select=id,affiliate_id,amount,status,notes,stripe_transfer_id,created_at,paid_at&order=created_at.desc&limit=250"),
  settings()]);
 return {profiles,conversions,payouts,settings:st};
}
async function approval(data:any,req:Request){
 await admin(req);
 const id=clean(data.id,50),status=clean(data.status,20);
 if(!uuid.test(id)||!["active","rejected","suspended"].includes(status))throw Error("Invalid affiliate status");
 const old=(await db("affiliate_profiles","?select=id,email,full_name,status& id=eq.".replace(" & ","&")+id+"&limit=1"))[0];
 if(!old)throw Error("Affiliate not found");
 const updated=await patch("affiliate_profiles","?id=eq."+id,{status,approved_at:status==="active"?new Date().toISOString():null,updated_at:new Date().toISOString()});
 // Approved applicants without a portal account are invited via Resend; never send credentials.
 if(status==="active"&&old.status!=="active"){
  const resend=Deno.env.get("RESEND_API_KEY")||"";
  if(resend){
   const generate=await fetch(B+"/auth/v1/admin/generate_link",{method:"POST",headers:headers(),body:JSON.stringify({type:"magiclink",email:old.email,redirect_to:"https://app.andreerving.com/"})});
   if(generate.ok){
    const body=await generate.json(),userId=String(body.user?.id||"");
    if(uuid.test(userId)){await patch("affiliate_profiles","?id=eq."+id,{user_id:userId});const found=await db("customer_profiles","?select=id&id=eq."+userId+"&limit=1");if(!found.length)await insert("customer_profiles",{id:userId,email:old.email,full_name:old.full_name})}
    const token=String(body.properties?.hashed_token||"");
    if(/^[A-Za-z0-9_-]{12,300}$/.test(token)){
     const link="https://app.andreerving.com/invite.html?token_hash="+encodeURIComponent(token)+"&type=magiclink";
     const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from:"Andre Erving <support@andreerving.com>",to:[old.email],subject:"Your Andre Erving affiliate application is approved",html:'<div style="font:16px Arial;color:#112c49;max-width:600px;margin:auto;padding:30px"><img alt="Andre Erving" width="300" src="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo.png"><h1>Welcome to the affiliate program</h1><p>Your affiliate application has been approved. Sign in to your account to get your unique links and monitor referrals.</p><p><a style="display:inline-block;background:#1e4a86;color:white;padding:15px 22px;text-decoration:none;border-radius:8px" href="'+link+'">Activate your affiliate account</a></p><p>Need assistance? support@andreerving.com</p></div>'})});
     if(!mail.ok)console.error("Affiliate approval invite was not delivered",mail.status);
    }
   }else console.error("Affiliate invitation link generation failed",generate.status);
  }
 }
 return {updated:updated.length===1};
}
async function commissionAction(data:any,req:Request){
 await admin(req);
 const id=clean(data.paymentIntentId,120),status=clean(data.status,16);
 if(!/^pi_[A-Za-z0-9]+$/.test(id)||!["approved","rejected","reversed"].includes(status))throw Error("Invalid commission action");
 const c=(await db("affiliate_conversions","?select=status,available_at&payment_intent_id=eq."+id+"&limit=1"))[0];
 if(!c||c.status==="paid")throw Error("Paid commission cannot be changed");
 if(status==="approved"&&(c.status!=="pending"||Date.parse(c.available_at)>Date.now()))throw Error("Commission is not yet eligible for approval");
 const result=await patch("affiliate_conversions","?payment_intent_id=eq."+encodeURIComponent(id)+"&status=eq."+c.status,{status,updated_at:new Date().toISOString()});
 return {updated:result.length===1};
}
async function updateSettings(data:any,req:Request){
 await admin(req);
 const rate=Number(data.commissionRate),days=Number(data.attributionDays),hold=Number(data.holdDays),minimum=Number(data.minPayout);
 if(!Number.isFinite(rate)||rate<0||rate>50||!Number.isInteger(days)||days<1||days>90||!Number.isInteger(hold)||hold<0||hold>180||!Number.isFinite(minimum)||minimum<0)throw Error("Invalid affiliate settings");
 await patch("affiliate_settings","?id=eq.true",{default_commission_rate:rate,attribution_days:days,hold_days:hold,min_payout:minimum,updated_at:new Date().toISOString()});
 return {updated:true};
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return reply({},200,origin);
 if(req.method!=="POST"||!ORIGINS.has(origin))return reply({error:"Not available"},403,origin);
 if(!S)return reply({error:"Affiliate service unavailable"},503,origin);
 try{
  const input=await req.json(),action=String(input.action||"");
  if(action==="apply")return reply(await apply(input,req),200,origin);
  if(action==="track")return reply(await track(input),200,origin);
  if(action==="dashboard")return reply(await dashboard(req),200,origin);
  if(action==="admin_overview")return reply(await overview(req),200,origin);
  if(action==="admin_approval")return reply(await approval(input,req),200,origin);
  if(action==="admin_commission")return reply(await commissionAction(input,req),200,origin);
  if(action==="admin_settings")return reply(await updateSettings(input,req),200,origin);
  return reply({error:"Unknown action"},400,origin);
 }catch(err){console.error("Affiliate operation",String(err));const msg=String(err instanceof Error?err.message:err);return reply({error:msg},/sign-in|restricted|not found/i.test(msg)?403:400,origin)}
});
