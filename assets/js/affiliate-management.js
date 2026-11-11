const API="https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-affiliates";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const date=d=>d?new Date(d).toLocaleDateString("en-US"):"—";
const options=[["applications","Applications"],["partners","Partners"],["commissions","Commissions"],["payouts","Payouts"],["settings","Settings"]];
const detailField=(label,value)=>'<div class="ae-aff-field"><span>'+esc(label)+'</span><strong>'+esc(value||"—")+'</strong></div>';
const listValue=v=>Array.isArray(v)?v.join(", "):v;
export function createAffiliateManagement({db,root,notify,isCurrent}){
 let state={page:"applications",selected:null,filter:"pending",search:"",confirm:null,record:null};
 let data=null;
 async function call(action,details={}){
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error("Sign in again");
  const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({action,...details})});
  const value=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(value.error||"Affiliate service unavailable");
  return value;
 }
 function head(title,description){
  return '<div class="head ae-aff-head"><div><div class="eyebrow">ANDRE ERVING / AFFILIATE MANAGEMENT</div><h1>'+esc(title)+'</h1><p class="muted">'+esc(description)+'</p></div><button type="button" class="btn secondary" id="affiliate-reload">Refresh</button></div>';
 }
 const chip=s=>'<span class="ae-aff-chip ae-aff-'+esc(s)+'">'+esc(s)+'</span>';
 function stat(label,value){return '<section class="ae-crm-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></section>'}
 function nav(){
  return '<nav class="ae-aff-nav" aria-label="Affiliate management sections">'+options.map(([page,label])=>'<button type="button" data-aff-tab="'+page+'" class="'+(state.page===page?'active':'')+'" aria-current="'+(state.page===page?'page':'false')+'">'+label+(page==="applications"?' <span>'+data.profiles.filter(p=>p.status==="pending").length+'</span>':'')+'</button>').join("")+'</nav>';
 }
 function applyActions(p){
  const buttons=[];
  if(p.status==="pending"||p.status==="suspended"||p.status==="rejected")buttons.push('<button class="btn" data-aff-action="active" data-id="'+esc(p.id)+'">Approve / reactivate</button>');
  if(p.status!=="rejected")buttons.push('<button class="btn secondary" data-aff-action="rejected" data-id="'+esc(p.id)+'">Deny application &amp; revoke portal access</button>');
  if(p.status==="active")buttons.push('<button class="btn secondary" data-aff-action="suspended" data-id="'+esc(p.id)+'">Suspend affiliate</button>');
  return buttons.join(" ");
 }
 function applications(){
  const rows=data.profiles.filter(p=>(state.filter==="all"||p.status===state.filter)&&(!state.search||[p.full_name,p.email,p.business_name,p.partner_type,p.country_market].some(v=>String(v||"").toLowerCase().includes(state.search.toLowerCase()))));
  return head('Affiliate applications','Review submitted applications, inspect every response and make approval decisions.')+
   '<div class="ae-aff-toolbar"><label>Application status<select id="aff-filter"><option value="pending">Pending</option><option value="all">All applications</option><option value="active">Approved</option><option value="rejected">Denied</option><option value="suspended">Suspended</option></select></label><label>Search applications<input id="aff-search" placeholder="Name, email, business or market" value="'+esc(state.search)+'"></label></div>'+
   '<section class="panel ae-mgmt-panel"><div class="ae-aff-panel-head"><h2>Applications ('+rows.length+')</h2><p class="muted">Select Review application to read the full submission.</p></div><div class="tablewrap"><table><thead><tr><th>Applicant</th><th>Partner type</th><th>Audience</th><th>Market</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>'+
   (rows.map(p=>'<tr><td><strong>'+esc(p.full_name)+'</strong><div class="muted">'+esc(p.email)+'</div><small>'+esc(p.business_name||"Individual")+'</small></td><td>'+esc(p.partner_type||"—")+'</td><td>'+esc(p.audience_size||"—")+'</td><td>'+esc(p.country_market||"—")+'</td><td>'+chip(p.status)+'</td><td>'+date(p.created_at)+'</td><td><button type="button" class="ae-inline-btn" data-aff-review="'+esc(p.id)+'">Review application</button></td></tr>').join("")||'<tr><td colspan="7">No applications match this filter.</td></tr>')+
   '</tbody></table></div></section>';
 }
 function review(p){
  const fields=[
   ["Full name",p.full_name],["Email address",p.email],["Business or brand name",p.business_name||p.full_name],
   ["Country or primary market",p.country_market],["Website or primary promotional channel",p.primary_channel||p.website],
   ["Partner type",p.partner_type],["How they will promote resources",listValue(p.promotion_channels)||p.promotion_plan],
   ["Additional social media or profile links",p.additional_profiles],["Audience description",p.audience_description],
   ["Audience size or monthly traffic",p.audience_size],["Terms accepted",p.terms_accepted_at?date(p.terms_accepted_at):"Not recorded"],
   ["Application submitted",date(p.created_at)],["Approval date",date(p.approved_at)],
   ["Affiliate access revoked",p.affiliate_access_revoked_at?date(p.affiliate_access_revoked_at):"No"]
  ];
  return head('Review affiliate application','Inspect the applicant’s responses and manage their approval decision.')+
   '<button type="button" class="btn secondary ae-aff-back" data-aff-back="applications">Back to applications</button>'+
   '<section class="panel ae-mgmt-panel"><div class="ae-aff-panel-head"><div><h2>'+esc(p.full_name)+'</h2><p class="muted">'+esc(p.email)+' · '+esc(p.business_name||"Individual")+'</p></div>'+chip(p.status)+'</div>'+
   '<div class="ae-aff-detail-grid">'+fields.map(([l,v])=>detailField(l,v)).join("")+'</div>'+
   '<div class="ae-aff-actions">'+applyActions(p)+'</div>'+
   '<p class="muted ae-aff-caution">Denied applicants lose affiliate portal access; their Supabase authentication account and other Andre Erving services remain intact.</p></section>';
 }
 function partners(){
  const rows=data.profiles.filter(p=>p.status==="active"||p.status==="suspended");
  return head('Affiliate partners','Manage approved and suspended partners, their referral accounts, and commission rates.')+
   '<div class="ae-crm-overview">'+stat('Active partners',rows.filter(p=>p.status==="active").length)+stat('Suspended',rows.filter(p=>p.status==="suspended").length)+stat('Total referrals',data.conversions.length)+stat('Recorded commissions',money(data.conversions.reduce((n,c)=>n+Number(c.commission_amount||0),0)))+'</div>'+
   '<section class="panel ae-mgmt-panel"><h2>Partner accounts</h2><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Referral code</th><th>Commission rate</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   (rows.map(p=>'<tr><td><strong>'+esc(p.full_name)+'</strong><div class="muted">'+esc(p.email)+'</div></td><td>'+esc(p.code||"—")+'</td><td>'+esc(p.commission_rate)+'%</td><td>'+chip(p.status)+'</td><td><button type="button" class="ae-inline-btn" data-aff-partner="'+esc(p.id)+'">Manage partner</button></td></tr>').join("")||'<tr><td colspan="5">No approved partners yet.</td></tr>')+'</tbody></table></div></section>';
 }
 function partner(p){
  const related=data.conversions.filter(c=>c.affiliate_id===p.id);
  return head('Manage partner','Review affiliate account details, commission rates and status.')+
   '<button type="button" class="btn secondary ae-aff-back" data-aff-back="partners">Back to partners</button>'+
   '<section class="panel ae-mgmt-panel"><div class="ae-aff-panel-head"><div><h2>'+esc(p.full_name)+'</h2><p class="muted">'+esc(p.email)+'</p></div>'+chip(p.status)+'</div>'+
   '<div class="ae-aff-detail-grid">'+detailField("Business",p.business_name)+detailField("Market",p.country_market)+detailField("Partner type",p.partner_type)+detailField("Referral code",p.code)+detailField("Total attributed sales",related.length)+detailField("Recorded commission",money(related.reduce((n,c)=>n+Number(c.commission_amount||0),0)))+'</div>'+
   '<form id="aff-rate" class="ae-aff-rate-form"><label>Commission rate (%)<input type="number" name="rate" min="0" max="50" step="0.1" required value="'+esc(p.commission_rate)+'"></label><button class="btn" type="submit">Save partner rate</button></form><p class="muted">Changing the partner rate affects future conversions only.</p>'+
   '<div class="ae-aff-actions">'+applyActions(p)+' <button class="btn secondary" type="button" data-aff-review="'+esc(p.id)+'">View original application</button></div></section>';
 }
 function commissions(){
  return head('Affiliate commissions','Review tracked purchases and approve eligible commissions after the holding period.')+
   '<section class="panel ae-mgmt-panel"><h2>Commission review</h2><p class="muted">Paid commissions cannot be edited. Commission approval does not initiate payment.</p><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Sale date</th><th>Gross</th><th>Commission</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   (data.conversions.map(c=>'<tr><td>'+esc(data.profiles.find(p=>p.id===c.affiliate_id)?.full_name||"Unknown")+'</td><td>'+date(c.created_at)+'</td><td>'+money(c.gross_amount)+'</td><td>'+money(c.commission_amount)+'</td><td>'+date(c.available_at)+'</td><td>'+chip(c.status)+'</td><td>'+(c.status==="pending"?'<button type="button" class="ae-inline-btn" data-aff-commission="approved" data-payment="'+esc(c.payment_intent_id)+'" '+(Date.parse(c.available_at)>Date.now()?'disabled title="Holding period not complete"':'')+'>Approve</button> <button type="button" class="ae-inline-btn" data-aff-commission="rejected" data-payment="'+esc(c.payment_intent_id)+'">Reject</button>':'—')+'</td></tr>').join("")||'<tr><td colspan="7">No attributed sales recorded.</td></tr>')+'</tbody></table></div></section>';
 }
 function payouts(){
  return head('Affiliate payouts','View payout history and payout readiness.')+
   '<section class="panel ae-mgmt-panel"><h2>Payout ledger</h2><p class="muted">Stripe Connect payouts are not yet enabled. No manual paid-state changes are offered without a verified transfer.</p><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th></tr></thead><tbody>'+
   (data.payouts.map(p=>'<tr><td>'+esc(data.profiles.find(x=>x.id===p.affiliate_id)?.full_name||"Unknown")+'</td><td>'+money(p.amount)+'</td><td>'+chip(p.status)+'</td><td>'+date(p.created_at)+'</td><td>'+date(p.paid_at)+'</td></tr>').join("")||'<tr><td colspan="5">No payouts recorded yet.</td></tr>')+'</tbody></table></div></section>';
 }
 function settings(){
  const st=data.settings||{};
  return head('Affiliate settings','Configure commission defaults and attribution rules.')+
   '<section class="panel ae-mgmt-panel"><h2>Program configuration</h2><form id="affiliate-settings" class="ae-mgmt-form"><div class="ae-invoice-fields"><label>Default commission %<input type="number" name="commissionRate" min="0" max="50" step="0.1" value="'+esc(st.default_commission_rate)+'" required></label><label>Attribution window (days)<input type="number" name="attributionDays" min="1" max="90" value="'+esc(st.attribution_days)+'" required></label><label>Commission hold (days)<input type="number" name="holdDays" min="0" max="180" value="'+esc(st.hold_days)+'" required></label><label>Minimum payout ($)<input type="number" name="minPayout" min="0" step="0.01" value="'+esc(st.min_payout)+'" required></label></div><p class="muted">New default rates affect new affiliates only. Existing affiliate rates and earned commissions remain unchanged.</p><button type="submit" class="btn">Save program settings</button></form></section>';
 }
 function confirmScreen(){
  const a=state.confirm;
  if(!a)return '';
  const reject=a.status==="rejected";
  return '<div class="ae-aff-confirm" role="dialog" aria-modal="true" aria-labelledby="aff-confirm-title"><section class="panel"><h2 id="aff-confirm-title">'+(reject?'Deny affiliate application?':'Confirm affiliate status change')+'</h2><p>'+(reject?'This will revoke access to the affiliate portal. The applicant’s Supabase account will remain active for other services.':'Update this affiliate to '+esc(a.status)+'?')+'</p><div class="ae-aff-actions"><button class="btn" id="aff-confirm-yes">Confirm '+(reject?'denial':'change')+'</button><button class="btn secondary" id="aff-confirm-no">Cancel</button></div><p class="muted" id="aff-confirm-error" role="status"></p></section></div>';
 }
 function render(){
  if(!data||!isCurrent())return;
  let body;
  if(state.selected){
   const p=data.profiles.find(x=>x.id===state.selected);
   body=p?(state.record==="partner"?partner(p):review(p)):(state.selected=null,applications());
  }else if(state.page==="partners")body=partners();
  else if(state.page==="commissions")body=commissions();
  else if(state.page==="payouts")body=payouts();
  else if(state.page==="settings")body=settings();
  else body=applications();
  root.innerHTML='<div class="ae-aff-workspace">'+nav()+body+'</div>'+confirmScreen();
  root.querySelector("#affiliate-reload").onclick=()=>start(false);
  root.querySelectorAll("[data-aff-tab]").forEach(b=>b.onclick=()=>{state.page=b.dataset.affTab;state.selected=null;state.record=null;state.confirm=null;render()});
  root.querySelectorAll("[data-aff-review]").forEach(b=>b.onclick=()=>{state.page="applications";state.selected=b.dataset.affReview;state.record="review";render()});
  root.querySelectorAll("[data-aff-partner]").forEach(b=>b.onclick=()=>{state.page="partners";state.selected=b.dataset.affPartner;state.record="partner";render()});
  root.querySelectorAll("[data-aff-back]").forEach(b=>b.onclick=()=>{state.selected=null;state.record=null;state.page=b.dataset.affBack;render()});
  const filter=root.querySelector("#aff-filter");
  if(filter){filter.value=state.filter;filter.onchange=()=>{state.filter=filter.value;render()}}
  const search=root.querySelector("#aff-search");
  if(search){search.oninput=()=>{const pos=search.selectionStart;state.search=search.value;render();const next=root.querySelector("#aff-search");if(next){next.focus();next.setSelectionRange(pos,pos)}}}
  root.querySelectorAll("[data-aff-action]").forEach(b=>b.onclick=()=>{state.confirm={id:b.dataset.id,status:b.dataset.affAction};render()});
  if(state.confirm){
   root.querySelector("#aff-confirm-no").onclick=()=>{state.confirm=null;render()};
   root.querySelector("#aff-confirm-yes").onclick=async e=>{
    const b=e.currentTarget;b.disabled=true;
    try{await call("admin_approval",state.confirm);notify("Affiliate status updated.");state.confirm=null;state.selected=null;await start(false)}
    catch(err){const notice=root.querySelector("#aff-confirm-error");if(notice)notice.textContent=err.message;b.disabled=false}
   };
  }
  const rate=root.querySelector("#aff-rate");
  if(rate)rate.onsubmit=async e=>{e.preventDefault();const b=rate.querySelector('button');b.disabled=true;try{await call("admin_rate",{id:state.selected,rate:rate.elements.rate.value});notify("Partner commission rate saved.");await start(false)}catch(err){notify(err.message,true);b.disabled=false}};
  root.querySelectorAll("[data-aff-commission]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await call("admin_commission",{paymentIntentId:b.dataset.payment,status:b.dataset.affCommission});notify("Commission updated.");await start(false)}catch(err){notify(err.message,true);b.disabled=false}});
  const config=root.querySelector("#affiliate-settings");
  if(config)config.onsubmit=async e=>{e.preventDefault();const b=config.querySelector('button');b.disabled=true;try{await call("admin_settings",Object.fromEntries(new FormData(config)));notify("Affiliate program settings saved.");await start(false)}catch(err){notify(err.message,true);b.disabled=false}};
 }
 async function start(reset=true){
  if(reset){state={page:"applications",selected:null,filter:"pending",search:"",confirm:null,record:null};}
  root.innerHTML='<div class="head"><div><div class="eyebrow">ANDRE ERVING / MANAGEMENT</div><h1>Affiliate management</h1></div></div><section class="panel"><p>Loading affiliate records…</p></section>';
  try{
   const result=await call("admin_overview");
   if(!isCurrent())return;
   data={profiles:result.profiles||[],conversions:result.conversions||[],payouts:result.payouts||[],settings:result.settings||{}};
   render();
  }catch(err){
   root.innerHTML='<section class="panel"><h2>Affiliate management unavailable</h2><p>'+esc(err.message)+'</p><button type="button" class="btn" id="affiliate-retry">Try again</button></section>';
   root.querySelector("#affiliate-retry").onclick=()=>start(false);
  }
 }
 return {start};
}
