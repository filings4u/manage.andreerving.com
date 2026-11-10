// Andre Erving Management API. All operations are checked against active management accounts.
const base=Deno.env.get("SUPABASE_URL")||"https://gnfyidajbectlppsekzj.supabase.co";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const origins=new Set(["https://manage.andreerving.com","https://filings4u.github.io","http://localhost:3000"]);
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function reply(data:unknown,status=200,origin=""){return new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",
 ...(origins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
 "Access-Control-Allow-Headers":"apikey,authorization,content-type",
 "Access-Control-Allow-Methods":"POST,OPTIONS"}})}
function headers(){return {apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"}}
function esc(s:unknown){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}
function email(s:unknown){return String(s??"").trim().toLowerCase().slice(0,254)}
function name(s:unknown){return String(s??"").trim().slice(0,80)}
async function rest(table:string,query="",opts:RequestInit={}){return fetch(base+"/rest/v1/"+table+query,{...opts,headers:{...headers(),...(opts.headers||{})}})}
async function rows(table:string,query=""){const r=await rest(table,query);if(!r.ok)throw Error(table+" lookup unavailable");return await r.json()}
async function create(table:string,data:unknown,returning=false){const r=await rest(table,"",{method:"POST",headers:{Prefer:returning?"return=representation":"return=minimal"},body:JSON.stringify(data)});if(!r.ok)throw Error(table+" insert failed: "+r.status+" "+(await r.text()).slice(0,160));return returning?await r.json():true}
async function update(table:string,query:string,data:unknown){const r=await rest(table,query,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(data)});if(!r.ok)throw Error(table+" update failed: "+r.status);return await r.json()}
async function getUser(request:Request){
 const jwt=(request.headers.get("authorization")||"").replace(/^Bearer /,"");
 if(!jwt||jwt.length>5000)throw Error("Authentication required");
 const a=await fetch(base+"/auth/v1/user",{headers:{Authorization:"Bearer "+jwt,apikey:service}});
 if(!a.ok)throw Error("Your session has expired");
 const u=await a.json();
 if(!uuidPattern.test(u.id||""))throw Error("Invalid account");
 const staff=await rows("admin_profiles","?select=id,role,active&id=eq."+u.id+"&active=eq.true&limit=1");
 if(staff.length!==1)throw Error("Management access required");
 return {id:u.id,email:u.email,role:String(staff[0].role||"")};
}
async function findUserByEmail(value:string){
 // List users through GoTrue with bounded pagination, never through a public table.
 for(let page=1;page<=30;page++){
  const r=await fetch(base+"/auth/v1/admin/users?page="+page+"&per_page=200",{headers:headers()});
  if(!r.ok)throw Error("Account lookup failed");
  const body=await r.json();const users=body.users||[];
  const found=users.find((u:{email:string})=>String(u.email).toLowerCase()===value);
  if(found)return found;
  if(users.length<200)return null;
 }
 throw Error("Account directory too large to search safely");
}
const crmFields=["company","job_title","alternate_phone","address_line1","address_line2","city","state","postal_code","country","preferred_contact","customer_type","acquisition_source","account_status","internal_notes"];
function crmData(input:Record<string,unknown>){
 const metadata:Record<string,unknown>={};
 for(const field of crmFields)metadata[field]=String(input[field]||"").trim().slice(0,field==="internal_notes"?3000:field==="address_line1"?180:150)||null;
 metadata.country=metadata.country||"United States";
 metadata.customer_type=metadata.customer_type||"Individual";
 metadata.account_status=metadata.account_status||"Active";
 if(!["Individual","Business","Organization"].includes(String(metadata.customer_type)))throw Error("Invalid customer type");
 if(!["Active","Inactive","Prospect"].includes(String(metadata.account_status)))throw Error("Invalid status");
 if(metadata.preferred_contact&&!["Email","Phone","No preference"].includes(String(metadata.preferred_contact)))throw Error("Invalid contact preference");
 return metadata;
}
async function saveCrmDetails(userId:string,input:Record<string,unknown>){
 const payload={customer_id:userId,...crmData(input),updated_at:new Date().toISOString()};
 const result=await rest("customer_crm_details","?on_conflict=customer_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload)});
 if(!result.ok)throw Error("Customer account created but CRM details could not be saved");
}
async function saveCustomerDetails(input:Record<string,unknown>){
 const id=String(input.userId||"");
 if(!uuidPattern.test(id))throw Error("Invalid customer");
 const found=await rows("customer_profiles","?select=id,email&id=eq."+id+"&limit=1");
 if(!found.length)throw Error("Customer not found");
 const first=name(input.firstName),last=name(input.lastName);
 const phone=String(input.phone||"").trim().slice(0,32);
 if(!first||!last)throw Error("First and last name are required");
 if(input.email&&email(input.email)!==email(found[0].email))throw Error("Account email cannot be changed here");
 const fullName=(first+" "+last).trim();
 const updated=await update("customer_profiles","?id=eq."+id,{full_name:fullName,phone});
 if(!updated.length)throw Error("Could not save customer contact information");
 const authUpdate=await fetch(base+"/auth/v1/admin/users/"+id,{method:"PUT",headers:headers(),body:JSON.stringify({user_metadata:{first_name:first,last_name:last,full_name:fullName,phone}})});
 if(!authUpdate.ok)console.warn("Customer auth metadata update failed",authUpdate.status);
 await saveCrmDetails(id,input);
 return {userId:id,authMetadataUpdated:authUpdate.ok};
}
async function createAccount(input:Record<string,unknown>){
 const address=email(input.email),first=name(input.firstName),last=name(input.lastName),phone=String(input.phone||"").trim().slice(0,32);
 if(!emailPattern.test(address)||!first||!last)throw Error("First name, last name and valid email are required");
 const profileMatches=await rows("customer_profiles","?select=id,email&email=eq."+encodeURIComponent(address)+"&limit=1");
 if(profileMatches.length)return {userId:profileMatches[0].id,email:address,existing:true};
 const prior=await findUserByEmail(address);
 if(prior){
  const existingProfile=await rows("customer_profiles","?select=id&id=eq."+prior.id+"&limit=1");
  if(!existingProfile.length)await create("customer_profiles",{id:prior.id,email:address,full_name:first+" "+last,phone});
  return {userId:prior.id,email:address,existing:true};
 }
 const r=await fetch(base+"/auth/v1/admin/users",{method:"POST",headers:headers(),body:JSON.stringify({
  email:address,email_confirm:false,user_metadata:{first_name:first,last_name:last,full_name:(first+" "+last).trim(),phone}
 })});
 if(!r.ok){
  // A simultaneous request may have created the identity. Reuse it instead of allowing another customer.
  if(r.status===422||r.status===409){
   const found=await findUserByEmail(address);
   if(found?.id){
    const matches=await rows("customer_profiles","?select=id&id=eq."+found.id+"&limit=1");
    if(!matches.length)await create("customer_profiles",{id:found.id,email:address,full_name:first+" "+last,phone});
    return {userId:found.id,email:address,existing:true};
   }
  }
  throw Error("Could not create account ("+r.status+")");
 }
 const created=await r.json();const uid=created.id||created.user?.id;
 if(!uuidPattern.test(uid))throw Error("Account creation confirmation unavailable");
 // Customer profile is linked only to the Auth account; never store passwords.
 const existing=await rows("customer_profiles","?select=id&id=eq."+uid);
 if(!existing.length)await create("customer_profiles",{id:uid,email:address,full_name:first+" "+last,phone});
 await saveCrmDetails(uid,input);
 return {userId:uid,email:address,existing:false};
}
async function staffExclusion(address:string){
 const r=await rest("rpc/is_staff_invite_email","",{method:"POST",body:JSON.stringify({p_email:address})});
 if(!r.ok)throw Error("Cannot verify invitation eligibility");
 return Boolean(await r.json());
}
async function invite(input:Record<string,unknown>,staff:{id:string}){
 const address=email(input.email);
 if(!emailPattern.test(address))throw Error("Valid customer email required");
 if(await staffExclusion(address))throw Error("Management accounts cannot receive customer onboarding invitations");
 let order:any=null;
 if(input.orderId){
  if(!uuidPattern.test(input.orderId))throw Error("Invalid order ID");
  const data=await rows("orders","?select=id,customer_email,order_number,status,total&id=eq."+input.orderId+"&limit=1");
  if(!data.length)throw Error("Order not found");
  order=data[0];if(email(order.customer_email)!==address)throw Error("Customer does not match order");
 }
 const resendKey=Deno.env.get("RESEND_API_KEY")||"";
 if(!resendKey)throw Error("Email delivery is not configured");
 let auditId:string|null=null;
 try{
  const logs=await create("management_invitation_log",{customer_email:address,order_id:order?.id||null,initiated_by:staff.id,status:"pending"},true);
  auditId=logs[0]?.id||null;
  const existing=await findUserByEmail(address);
  const type=existing?"magiclink":"invite";
  const auth=await fetch(base+"/auth/v1/admin/generate_link",{method:"POST",headers:headers(),body:JSON.stringify({type,email:address,redirect_to:"https://app.andreerving.com/"})});
  if(!auth.ok)throw Error("Account invitation could not be generated");
  const data=await auth.json();
  const identity=await findUserByEmail(address);
  if(!identity?.id)throw Error("Could not verify the customer account after preparing invitation");
  const stored=await rows("customer_profiles","?select=id&id=eq."+identity.id+"&limit=1");
  if(!stored.length){
   const fullName=String(identity.user_metadata?.full_name||"").trim().slice(0,160);
   await create("customer_profiles",{id:identity.id,email:address,full_name:fullName||null,phone:String(identity.user_metadata?.phone||"").slice(0,32)||null});
  }
  const ownedOrders=await rows("orders","?select=id,user_id&customer_email=ilike."+encodeURIComponent(address)+"&status=in.(paid,completed)&limit=250");
  for(const purchased of ownedOrders){
   if(purchased.user_id&&purchased.user_id!==identity.id)continue;
   if(!purchased.user_id)await update("orders","?id=eq."+purchased.id+"&user_id=is.null",{user_id:identity.id});
   await rest("rpc/grant_order_course_access","",{method:"POST",body:JSON.stringify({p_order_id:purchased.id})});
  }
  const token=String(data.properties?.hashed_token||data.hashed_token||"");
  if(!/^[A-Za-z0-9_-]{12,300}$/.test(token))throw Error("Could not generate secure invitation token");
  const activation=new URL("https://app.andreerving.com/invite.html");
  activation.searchParams.set("token_hash",token);activation.searchParams.set("type",type);
  const link=activation.toString();
  const orderText=order?" for order "+esc(order.order_number):"";
  const html='<!doctype html><html><body style="background:#f2f5fa;padding:30px 14px;font:15px Arial,sans-serif;color:#122c4d"><div style="background:#fff;border:1px solid #dae4ef;border-radius:12px;max-width:570px;margin:auto;overflow:hidden"><div style="padding:25px 32px;border-bottom:4px solid #c99a36"><img src="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo.png" alt="Andre Erving" style="display:block;width:310px;max-width:100%;height:auto"></div><div style="padding:30px 32px"><h1 style="font-size:23px">Your account invitation</h1><p>You are invited to access your Andre Erving customer portal'+orderText+'.</p><p><a href="'+esc(link)+'" style="display:inline-block;background:#2051a0;color:white;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Activate your account</a></p><p>Set your password to access your purchases, documents, and courses.</p><p style="color:#637b97;font-size:12px">This is a secure, one-time invitation. If you did not expect this email, you may ignore it.</p></div></div></body></html>';
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},
   body:JSON.stringify({from:Deno.env.get("PURCHASE_EMAIL_FROM")||"Andre Erving <support@andreerving.com>",to:[address],subject:"Your Andre Erving account invitation",html})});
  if(!sent.ok)throw Error("Email delivery rejected ("+sent.status+")");
  if(auditId)await update("management_invitation_log","?id=eq."+auditId,{status:"sent",sent_at:new Date().toISOString(),error_message:null});
  return {sent:true,email:address,orderNumber:order?.order_number||null};
 }catch(err){
  if(auditId)await update("management_invitation_log","?id=eq."+auditId,{status:"failed",error_message:String(err).slice(0,500)}).catch(()=>{});
  throw err;
 }
}
function expiresFrom(days:number){return new Date(Date.now()+days*86400000).toISOString()}
async function enroll(_input:Record<string,unknown>){
 throw Error("Direct course enrollment is disabled. Create a completed paid or approved free order containing the course.");
}
async function modifyEnrollment(input:Record<string,unknown>){
 const id=String(input.enrollmentId||"");
 if(!uuidPattern.test(id))throw Error("Invalid enrollment");
 const found=await rows("course_enrollments","?select=id,expires_at,status&id=eq."+id+"&limit=1");
 if(!found.length)throw Error("Enrollment not found");
 const changes:Record<string,unknown>={};
 if(input.expiresAt){const d=new Date(String(input.expiresAt));if(!Number.isFinite(d.getTime()))throw Error("Invalid expiration date");changes.expires_at=d.toISOString();}
 if(input.status!==undefined){if(!["active","completed","expired","cancelled"].includes(String(input.status)))throw Error("Invalid status");changes.status=input.status;}
 if(!Object.keys(changes).length)throw Error("No changes supplied");
 return {enrollment:(await update("course_enrollments","?id=eq."+id,changes))[0]};
}

const logo2="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo.png";
async function hashInvoiceToken(token:string){
 const bytes=new TextEncoder().encode(token);
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function brandedMail(to:string,subject:string,contents:string){
 const key=Deno.env.get("RESEND_API_KEY")||"";
 if(!key)throw Error("Branded email delivery is not configured");
 const html='<!doctype html><html><body style="margin:0;background:#edf2f9;padding:30px 12px;font:15px Arial,sans-serif;color:#173451"><table role="presentation" style="margin:auto;width:100%;max-width:600px;background:#fff;border-collapse:collapse;border-radius:12px;overflow:hidden"><tr><td style="padding:28px;background:#fff;text-align:center;border-bottom:4px solid #c99632"><img src="'+logo2+'" alt="Andre Erving" width="330" style="width:100%;max-width:330px;height:auto;border:0"></td></tr><tr><td style="padding:30px;line-height:1.6">'+contents+'</td></tr></table></body></html>';
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:Deno.env.get("PURCHASE_EMAIL_FROM")||"Andre Erving <support@andreerving.com>",to:[to],subject,html})});
 if(!r.ok)throw Error("Branded email could not be sent ("+r.status+")");
 return (await r.json().catch(()=>({}))).id||null;
}
function orderCourseForKey(key:string){
 const k=key.replace(/^offering\./,"");
 const map:Record<string,string>={"freight-broker-lifetime":"freight-broker-training","trucking-pro-lifetime":"trucking-pro","freight-broker-one-on-one":"freight-broker-training","trucking-pro-coaching":"trucking-pro"};
 return map[k]||k;
}
async function fulfillFreeOrder(orderId:string,staff:{id:string}){
 const data=await rows("orders","?select=*&id=eq."+orderId+"&limit=1");const o=data[0];
 if(!o||o.status!=="paid"||Number(o.total)!==0)throw Error("Only an approved free order can be fulfilled");
 const first=String(o.customer_first_name||"Customer"),last=String(o.customer_last_name||"Access");
 const account=await createAccount({email:o.customer_email,firstName:first,lastName:last,phone:o.customer_phone||""});
 await update("orders","?id=eq."+o.id,{user_id:account.userId});
 const granted=await rest("rpc/grant_order_course_access","",{method:"POST",body:JSON.stringify({p_order_id:o.id})});
 if(!granted.ok)throw Error("Free order created, but course activation needs attention");
 const meta=await rows("crm_order_invoices","?select=price_key,invite_sent_at,receipt_sent_at&order_id=eq."+o.id+"&limit=1");const m=meta[0];
 if(m?.price_key?.endsWith("-lifetime")){
  const items=await rows("order_items","?select=course_id&order_id=eq."+o.id+"&course_id=not.is.null");
  for(const x of items)await update("course_enrollments","?user_id=eq."+account.userId+"&course_id=eq."+x.course_id,{expires_at:null,status:"active"});
 }
 if(!m?.invite_sent_at){
  await invite({email:o.customer_email,orderId:o.id},staff);
  await update("crm_order_invoices","?order_id=eq."+o.id,{invite_sent_at:new Date().toISOString()});
 }
 if(!m?.receipt_sent_at){
  const freeItems=await rows("order_items","?select=item_name,course_id,quantity&order_id=eq."+o.id);
  const entitlements=freeItems.map((item:any)=>String(item.item_name||"").trim()).filter(Boolean);
  const accessHtml=entitlements.length?'<div style="margin:20px 0;padding:18px;background:#f3f6fb;border:1px solid #e0e8f1;border-radius:9px"><strong>Your complimentary access includes:</strong><ul style="margin:10px 0 0;padding-left:22px">'+entitlements.map((item:string)=>'<li style="padding:4px 0">'+esc(item)+'</li>').join("")+'</ul></div>':'<p>You can view your assigned training in your customer portal.</p>';
  await brandedMail(o.customer_email,"Andre Erving — Your Free Access Receipt",'<h1 style="font-size:24px">Your access is confirmed</h1><p>Hi '+esc(o.customer_name||first)+', your complimentary order has been completed.</p><p><strong>Order:</strong> '+esc(o.order_number)+'</p><p><strong>Total:</strong> $0.00 (Free Access)</p>'+accessHtml+'<p>Access your training at <a href="https://app.andreerving.com/">Andre Erving Customer Portal</a>. Your account activation invitation is sent separately.</p>');
  await update("crm_order_invoices","?order_id=eq."+o.id,{receipt_sent_at:new Date().toISOString(),completed_at:new Date().toISOString()});
 }
 return account;
}
async function sendInvoiceForOrder(orderId:string){
 const data=await rows("orders","?select=*&id=eq."+orderId+"&limit=1"),o=data[0];
 const meta=await rows("crm_order_invoices","?select=*&order_id=eq."+orderId+"&limit=1"),m=meta[0];
 if(!o||!m||m.mode!=="invoice"||o.status!=="pending")throw Error("Only unpaid invoice orders can be sent");
 const token=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
 const link="https://andreerving.com/invoice.html?token="+token;
 await update("crm_order_invoices","?order_id=eq."+orderId,{token_hash:await hashInvoiceToken(token),status:"draft",updated_at:new Date().toISOString()});
 try{
  await brandedMail(o.customer_email,"Andre Erving Invoice "+o.order_number,
   '<h1 style="font-size:24px">Your Invoice Is Ready</h1><p>Hello '+esc(o.customer_name||"there")+',</p><p>Review the invoice for your order and pay securely on AndreErving.com.</p><div style="padding:17px;background:#f3f6fb;border-radius:9px"><strong>Invoice:</strong> '+esc(o.order_number)+'<br><strong>Amount due:</strong> $'+Number(o.total).toFixed(2)+'</div><p><a href="'+esc(link)+'" style="background:#d09d34;color:#142c49;display:inline-block;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:bold">View Invoice &amp; Pay</a></p><p>Account access begins after verified payment.</p>');
  await update("crm_order_invoices","?order_id=eq."+orderId,{status:"sent",invoice_sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()});
 }catch(e){await update("crm_order_invoices","?order_id=eq."+orderId,{last_error:String(e).slice(0,400)}).catch(()=>{});throw e}
 return {sent:true,orderId,invoiceUrl:link};
}
async function createOrder(input:Record<string,unknown>,staff:{id:string}){
 const address=email(input.email),itemKey=String(input.priceKey||""),mode=String(input.mode||"");
 if(!emailPattern.test(address)||!/^offering\.[a-z0-9-]+$/.test(itemKey)||!["free","invoice"].includes(mode))throw Error("Enter customer details, an offering, and Free Access or Accept Payment");
 const first=name(input.firstName),last=name(input.lastName),phone=String(input.phone||"").slice(0,32);
 if(!first||!last)throw Error("Customer first and last name are required");
 if(await staffExclusion(address))throw Error("Management accounts cannot be added as customers through invoice orders");
 const products=await rows("site_prices","?select=price_key,label,amount,currency,section,active&price_key=eq."+encodeURIComponent(itemKey)+"&limit=1");
 const item=products[0];if(!item||!item.active)throw Error("Offering is unavailable");
 const price=Number(item.amount);if(!Number.isFinite(price)||price<0)throw Error("Invalid catalog amount");
 if(mode==="invoice"&&price<=0)throw Error("Choose Free Access for zero-dollar offerings");
 const matched=await rows("customer_profiles","?select=id,email&email=eq."+encodeURIComponent(address)+"&limit=1");
 const existingId=matched[0]?.id||null;
 const ref="AE-MAN-"+crypto.randomUUID().slice(0,12).toUpperCase(),amount=mode==="free"?0:price;
 const order={order_number:ref,user_id:existingId,customer_email:address,customer_name:first+" "+last,customer_first_name:first,customer_last_name:last,customer_phone:phone||null,status:mode==="free"?"paid":"pending",subtotal:amount,total:amount,currency:"USD",external_payment_id:mode==="free"?"free_"+crypto.randomUUID().replace(/-/g,""):null};
 const saved=await create("orders",order,true),id=saved[0]?.id;
 if(!id)throw Error("Order could not be saved");
 let courseId:string|null=null;
 if(item.section==="Courses"&&!itemKey.startsWith("offering.extension-")){
  const found=await rows("courses","?select=id&slug=eq."+encodeURIComponent(orderCourseForKey(itemKey))+"&status=eq.published&limit=1");
  courseId=found[0]?.id||null;
 }
 await create("order_items",{order_id:id,course_id:courseId,item_type:item.section==="Courses"?"course":"product",item_name:item.label,unit_price:amount,line_total:amount,quantity:1});
 await create("crm_order_invoices",{order_id:id,mode,token_hash:await hashInvoiceToken(crypto.randomUUID()),price_key:itemKey,status:mode==="free"?"free":"draft"});
 if(mode==="free"){
  await fulfillFreeOrder(id,staff);
  return {orderId:id,orderNumber:ref,status:"paid",mode,total:0};
 }
 const sent=await sendInvoiceForOrder(id);
 return {orderId:id,orderNumber:ref,status:"pending",mode,total:amount,invoiceUrl:sent.invoiceUrl};
}
async function customerDetail(input:Record<string,unknown>){
 const uid=String(input.userId||"");
 const address=email(input.email);
 if(!uuidPattern.test(uid)&&!emailPattern.test(address))throw Error("Customer ID or email required");
 const p=uid?"?select=*&id=eq."+uid+"&limit=1":"?select=*&email=eq."+encodeURIComponent(address)+"&limit=1";
 const profiles=await rows("customer_profiles",p);
 const person=profiles[0];
 if(!person)throw Error("Customer profile not found");
 const identity=person.id,canonical=email(person.email);
 const [orders,enrollments,documents,tickets,extensions,crmDetails]=await Promise.all([
  rows("orders","?select=*&or=(user_id.eq."+identity+",customer_email.eq."+encodeURIComponent(canonical)+")&order=created_at.desc&limit=250"),
  rows("course_enrollments","?select=id,course_id,status,enrolled_at,expires_at,completed_at&user_id=eq."+identity+"&limit=250"),
  rows("customer_documents","?select=id,title,document_type,created_at&user_id=eq."+identity+"&limit=250"),
  rows("support_tickets","?select=id,subject,status,created_at&user_id=eq."+identity+"&limit=250"),
  rows("course_access_extensions","?select=course_id,added_days,new_expires_at,created_at&user_id=eq."+identity+"&limit=250"),
  rows("customer_crm_details","?select=*&customer_id=eq."+identity+"&limit=1")
 ]);
 const orderIds=orders.map((o:any)=>o.id).filter((v:string)=>uuidPattern.test(v));
 const lines=orderIds.length?await rows("order_items","?select=order_id,item_name,quantity,unit_price,line_total&order_id=in.("+orderIds.join(",")+")&limit=500"):[];
 const catalog=await rows("courses","?select=id,title,access_days");
 return {profile:person,crmDetails:crmDetails[0]||null,orders,orderItems:lines,enrollments,documents,tickets,extensions,
  courses:catalog.map((c:any)=>({id:c.id,title:c.title,access_days:c.access_days}))};
}
async function setExtensionPrice(input:Record<string,unknown>){
 const cid=String(input.courseId||""),amount=input.amount===null?null:Number(input.amount),enabled=Boolean(input.enabled);
 if(!uuidPattern.test(cid)||amount!==null&&(!Number.isFinite(amount)||amount<=0)||enabled&&amount===null)throw Error("Enter a valid course and price");
 const data={course_id:cid,amount,enabled,days:30,updated_at:new Date().toISOString()};
 const course=await rows("courses","?select=id,title,status&id=eq."+cid+"&limit=1");
 if(!course.length||course[0].status!=="published")throw Error("Published course not found");
 const r=await rest("course_extension_prices","?on_conflict=course_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(data)});
 if(!r.ok)throw Error("Unable to save extension price");
 const key="offering.extension-"+cid;
 const p=await rest("site_prices","?on_conflict=price_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({price_key:key,label:course[0].title+" - 30-day extension",section:"Courses",amount:amount||0,currency:"USD",active:enabled})});
 if(!p.ok)throw Error("Extension settings saved but checkout catalog could not be updated");
 return {extension:(await r.json())[0]};
}
Deno.serve(async(request)=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS")return reply({},200,origin);
 if(!origins.has(origin)||request.method!=="POST")return reply({error:"Unauthorized origin"},403,origin);
 if(!service)return reply({error:"Service unavailable"},503,origin);
 try{
  const staff=await getUser(request);
  let input:Record<string,unknown>={};try{input=await request.json()}catch{return reply({error:"Invalid request body"},400,origin)}
  let result:unknown;
  switch(input.action){
   case "list_website_inquiries":result={items:await rows("website_inquiries","?select=*&order=created_at.desc&limit=200")};break;
   case "list_newsletter_signups":result={items:await rows("newsletter_signups","?select=*&order=created_at.desc&limit=200")};break;
   case "list_customers":result={items:await rows("customer_profiles","?select=id,email,full_name,phone,created_at&order=created_at.desc&limit=1000")};break;
   case "list_orders":result={items:await rows("orders","?select=id,order_number,user_id,customer_email,customer_name,total,currency,status,created_at&order=created_at.desc&limit=500"),invoices:await rows("crm_order_invoices","?select=order_id,mode,status,invoice_sent_at,last_error&limit=500")};break;
   case "list_prices":result={items:await rows("site_prices","?select=price_key,label,amount,currency,section,active&order=label.asc&limit=500")};break;
   case "list_courses":result={items:await rows("courses","?select=id,title,slug,status,access_days&order=title.asc&limit=500")};break;
   case "list_enrollments":result={items:await rows("course_enrollments","?select=id,user_id,course_id,status,enrolled_at,expires_at,completed_at&order=enrolled_at.desc&limit=1000")};break;
   case "list_extensions":result={items:await rows("course_extension_prices","?select=course_id,amount,enabled,days&limit=500")};break;
   case "create_account":result=await createAccount(input);break;
   case "update_customer_details":result=await saveCustomerDetails(input);break;
   case "send_invite":result=await invite(input,staff);break;
   case "create_order":result=await createOrder(input,staff);break;
   case "send_invoice":result=await sendInvoiceForOrder(String(input.orderId||""));break;
   case "enroll":result=await enroll(input);break;
   case "change_enrollment":result=await modifyEnrollment(input);break;
   case "customer_detail":result=await customerDetail(input);break;
   case "extension_price":result=await setExtensionPrice(input);break;
   default:return reply({error:"Unknown management action"},400,origin);
  }
  return reply(result,200,origin);
 }catch(error){
  const message=String(error instanceof Error?error.message:error);
  const auth=/Authentication|session|Management access/i.test(message);
  console.error("Management operation:",message);
  return reply({error:message},auth?403:400,origin);
 }
});
