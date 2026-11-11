const API="https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-affiliates";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const date=d=>d?new Date(d).toLocaleDateString("en-US"):"—";
const options=[["applications","Applications"],["partners","Partners"],["clicks","Link clicks"],["commissions","Commissions"],["payouts","Payouts"],["settings","Settings"]];
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
   (rows.map(p=>'<tr><td><strong>'+esc(p.full_name)+'</strong><div class="muted">'+esc(p.email)+'</div></td><td>'+esc(p.code||"—")+'</td><td>'+'<label class="ae-aff-rate-inline">Individual % <input type="number" min="0" max="50" step="0.1" value="'+esc(p.commission_rate)+'" data-aff-rate="'+esc(p.id)+'"></label><button type="button" class="ae-inline-btn" data-aff-save-rate="'+esc(p.id)+'">Save</button></td><td>'+chip(p.status)+'</td><td><button type="button" class="ae-inline-btn" data-aff-partner="'+esc(p.id)+'">Manage partner</button></td></tr>').join("")||'<tr><td colspan="5">No approved partners yet.</td></tr>')+'</tbody></table></div></section>';
 }
 function partner(p){
  const sales=data.conversions.filter(c=>c.affiliate_id===p.id);
  const links=(data.clickReport||[]).filter(c=>c.affiliate_id===p.id);
  const payouts=data.payouts.filter(x=>x.affiliate_id===p.id);
  const totalClicks=links.reduce((n,c)=>n+Number(c.total||0),0);
  const selectedTypes=["Content creator","Educator or trainer","Business or organization","Consultant or coach","Blogger or publisher","Community owner","Other"];
  const control=(label,name,value,attrs='')=>'<label class="ae-aff-edit-field"><span>'+esc(label)+'</span><input name="'+name+'" value="'+esc(value||'')+'" '+attrs+'></label>';
  return head('Manage affiliate partner','Maintain the partner’s contact information, referral performance, commission terms, and access.')+
  '<div class="ae-aff-partner-toolbar"><button type="button" class="btn secondary" data-aff-back="partners">← Back to partners</button><button type="button" class="btn secondary" data-aff-review="'+esc(p.id)+'">View application</button></div>'+
  '<section class="panel ae-mgmt-panel ae-aff-partner-header"><div class="ae-aff-panel-head"><div><div class="ae-aff-overline">PARTNER RECORD</div><h2>'+esc(p.full_name)+'</h2><p class="muted">'+esc(p.email)+'</p></div>'+chip(p.status)+'</div>'+
  '<div class="ae-aff-partner-stats">'+stat('Tracked link clicks',totalClicks.toLocaleString())+stat('Attributed sales',sales.length.toLocaleString())+stat('Recorded commissions',money(sales.reduce((n,c)=>n+Number(c.commission_amount||0),0)))+stat('Payouts',payouts.length.toLocaleString())+'</div></section>'+
  '<div class="ae-aff-manage-grid"><section class="panel ae-mgmt-panel"><h2>Partner profile</h2><p class="muted">Edit business and contact information without changing the Supabase sign-in email.</p>'+
  '<form id="aff-partner-profile" class="ae-aff-edit-form"><div class="ae-aff-edit-grid">'+
  control('Full name','fullName',p.full_name,'required minlength="2" maxlength="150" autocomplete="name"')+
  control('Business or brand','businessName',p.business_name,'maxlength="180"')+
  control('Contact phone','phone',p.contact_phone,'type="tel" maxlength="30" autocomplete="tel"')+
  control('Country or market','market',p.country_market,'required minlength="2" maxlength="120"')+
  control('Primary website or channel','website',p.primary_channel||p.website,'maxlength="300"')+
  '<label class="ae-aff-edit-field"><span>Partner type</span><select name="partnerType"><option value="">Select type</option>'+selectedTypes.map(t=>'<option value="'+esc(t)+'" '+(t===p.partner_type?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label></div>'+
  '<label class="ae-aff-edit-field"><span>Internal management notes</span><textarea name="managementNotes" rows="4" maxlength="3000" placeholder="Private notes for affiliate management only">'+esc(p.management_notes||'')+'</textarea></label>'+
  '<div class="ae-aff-form-footer"><button type="submit" class="btn">Save profile changes</button><span class="muted" id="aff-profile-status" role="status"></span></div></form></section>'+
  '<div class="ae-aff-manage-side"><section class="panel ae-mgmt-panel"><h2>Commission settings</h2><p class="muted">Individual commission rate for this partner; already-earned commissions are unchanged.</p>'+
  '<form id="aff-rate" class="ae-aff-commission-form"><label class="ae-aff-edit-field"><span>Commission rate (%)</span><input type="number" name="rate" min="0" max="50" step="0.1" required value="'+esc(p.commission_rate)+'"></label><button type="submit" class="btn">Save commission rate</button></form></section>'+
  '<section class="panel ae-mgmt-panel"><h2>Account status and access</h2><p class="muted">Approve, suspend or revoke affiliate portal access while keeping their Supabase account intact.</p>'+
  '<div class="ae-aff-actions">'+applyActions(p)+'</div></section>'+
  '<section class="panel ae-mgmt-panel"><h2>Payout configuration</h2>'+detailField('Selected method',p.payout_method==='zelle'?'Zelle':p.payout_method==='bank'?'Bank / Stripe Connect':'Not set')+
  '<p class="muted">Manage payout destination verification and masked details from the Payouts section.</p><button type="button" class="btn secondary" data-aff-jump="payouts">Go to payouts</button></section></div></div>'+
  '<section class="panel ae-mgmt-panel"><h2>Referral link performance</h2><div class="tablewrap"><table><thead><tr><th>Destination</th><th>Lifetime clicks</th><th>Last 30 days</th><th>Last click</th></tr></thead><tbody>'+
  (links.map(x=>'<tr><td>'+destinationLink(x.path)+'</td><td>'+Number(x.total||0).toLocaleString()+'</td><td>'+Number(x.recent||0).toLocaleString()+'</td><td>'+date(x.last)+'</td></tr>').join('')||'<tr><td colspan="4">No tracked link clicks yet.</td></tr>')+'</tbody></table></div></section>'+
  '<section class="panel ae-mgmt-panel"><h2>Attributed sales and commission history</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Sale amount</th><th>Commission</th><th>Status</th></tr></thead><tbody>'+
  (sales.map(x=>'<tr><td>'+date(x.created_at)+'</td><td>'+money(x.gross_amount)+'</td><td>'+money(x.commission_amount)+'</td><td>'+chip(x.status)+'</td></tr>').join('')||'<tr><td colspan="4">No attributed sales yet.</td></tr>')+'</tbody></table></div></section>';
 }
 function destinationLink(path){
  const raw=String(path||"/");
  if(!raw.startsWith("/")||raw.startsWith("//"))return esc(raw);
  const safePath=raw.split("?")[0].split("#")[0];
  if(!/^\/[a-zA-Z0-9/_.-]*$/.test(safePath))return esc(raw);
  const url="https://andreerving.com"+safePath;
  const label=safePath==="/"
   ?"Main website · Homepage"
   :safePath.split("/").filter(Boolean).pop().replace(/\.html?$/i,"").replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  return '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" class="ae-aff-destination"><strong>'+esc(label)+'</strong><small>'+esc(url)+'</small></a>';
 }
 function clickReports(){
 const report=data.clickReport||[];
 return head('Affiliate link clicks','Track recorded referral visits by affiliate and destination.')+
 '<div class="ae-crm-overview">'+stat('Total clicks',report.reduce((n,c)=>n+Number(c.total||0),0).toLocaleString())+stat('Last 30 days',report.reduce((n,c)=>n+Number(c.recent||0),0).toLocaleString())+stat('Destinations',report.length)+stat('Partners with clicks',new Set(report.map(c=>c.affiliate_id)).size)+'</div>'+
 '<section class="panel ae-mgmt-panel"><h2>Referral click report</h2><p class="muted">Clicks represent tracked visits, not confirmed purchases; repeat visitors may be counted more than once.</p><div class="tablewrap"><table><thead><tr><th>Affiliate</th><th>Destination</th><th>All clicks</th><th>30 days</th><th>Last visit</th></tr></thead><tbody>'+
 (report.map(c=>'<tr><td>'+esc(data.profiles.find(p=>p.id===c.affiliate_id)?.full_name||'Unknown')+'</td><td>'+destinationLink(c.path)+'</td><td>'+Number(c.total||0).toLocaleString()+'</td><td>'+Number(c.recent||0).toLocaleString()+'</td><td>'+date(c.last)+'</td></tr>').join('')||'<tr><td colspan="5">No referral clicks recorded.</td></tr>')+'</tbody></table></div></section>';
 }
 function commissions(){
  return head('Affiliate commissions','Review tracked purchases and approve eligible commissions after the holding period.')+
   '<section class="panel ae-mgmt-panel"><h2>Commission review</h2><p class="muted">Paid commissions cannot be edited. Commission approval does not initiate payment.</p><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Sale date</th><th>Gross</th><th>Commission</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   (data.conversions.map(c=>'<tr><td>'+esc(data.profiles.find(p=>p.id===c.affiliate_id)?.full_name||"Unknown")+'</td><td>'+date(c.created_at)+'</td><td>'+money(c.gross_amount)+'</td><td>'+money(c.commission_amount)+'</td><td>'+date(c.available_at)+'</td><td>'+chip(c.status)+'</td><td>'+(c.status==="pending"?'<button type="button" class="ae-inline-btn" data-aff-commission="approved" data-payment="'+esc(c.payment_intent_id)+'" '+(Date.parse(c.available_at)>Date.now()?'disabled title="Holding period not complete"':'')+'>Approve</button> <button type="button" class="ae-inline-btn" data-aff-commission="rejected" data-payment="'+esc(c.payment_intent_id)+'">Reject</button>':'—')+'</td></tr>').join("")||'<tr><td colspan="7">No attributed sales recorded.</td></tr>')+'</tbody></table></div></section>';
 }
 function payouts(){
  const methods=data.profiles.filter(p=>p.status==="active"||p.status==="suspended");
  return head('Affiliate payouts','Review payout preferences, recorded payouts and eligibility.')+
   '<section class="panel ae-mgmt-panel"><h2>Partner payout setup</h2><p class="muted">Zelle destinations must be verified before a manual transfer. A Stripe account identifier does not prove onboarding is complete. No payment is automatically issued.</p><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Method</th><th>Destination / provider status</th><th>Terms</th><th>Updated</th></tr></thead><tbody>'+
   (methods.map(p=>'<tr><td><strong>'+esc(p.full_name)+'</strong></td><td>'+esc(p.payout_method||"Not configured")+'</td><td>'+
    (p.payout_method==="zelle"?esc(p.zelle_contact_type||"")+': '+'<span id="masked-zelle-'+esc(p.id)+'">••••••</span> <button type="button" class="ae-inline-btn" data-aff-zelle="'+esc(p.id)+'" aria-label="Show Zelle payout destination">Show ◉</button>':(p.payout_method==="bank"?(p.stripe_account_id?'Stripe account created <button type="button" class="ae-inline-btn" data-aff-bank="'+esc(p.id)+'">View masked bank</button> <span id="masked-bank-'+esc(p.id)+'"></span>':'Bank setup incomplete'):'—'))+'</td>'+
    '<td>'+esc(p.payout_method==="zelle"?(p.zelle_terms_accepted_at?"Accepted":"Not accepted"):"—")+'</td><td>'+date(p.payout_updated_at)+'</td></tr>').join("")||'<tr><td colspan="5">No approved partners yet.</td></tr>')+'</tbody></table></div></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Payout ledger</h2><p class="muted">No manual paid-state changes are offered without a verified transfer.</p><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th></tr></thead><tbody>'+
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
  else if(state.page==="clicks")body=clickReports();
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
  root.querySelectorAll("[data-aff-jump]").forEach(b=>b.onclick=()=>{state.page=b.dataset.affJump;state.selected=null;state.record=null;render()});
  const profile=root.querySelector("#aff-partner-profile");
  if(profile)profile.onsubmit=async event=>{
   event.preventDefault();if(!profile.reportValidity())return;
   const button=profile.querySelector('button[type="submit"]'),status=root.querySelector("#aff-profile-status");
   button.disabled=true;status.textContent="Saving…";
   try{
    const output=await call("admin_partner_update",{id:state.selected,...Object.fromEntries(new FormData(profile))});
    if(!output.updated)throw Error("No changes were saved");
    notify("Affiliate partner profile saved");await start(false);
   }catch(err){status.textContent=err.message||"Unable to save profile";button.disabled=false}
  };
  const rate=root.querySelector("#aff-rate");
  if(rate)rate.onsubmit=async e=>{e.preventDefault();const b=rate.querySelector('button');b.disabled=true;try{const out=await call("admin_rate",{id:state.selected,rate:rate.elements.rate.value});if(!out.updated)throw Error("Commission rate was not saved");notify("Partner commission rate saved.");await start(false)}catch(err){notify(err.message,true);b.disabled=false}};
  root.querySelectorAll("[data-aff-save-rate]").forEach(b=>b.onclick=async()=>{const rate=Number(root.querySelector('[data-aff-rate="'+b.dataset.affSaveRate+'"]')?.value);if(!Number.isFinite(rate)||rate<0||rate>50){notify("Enter an individual commission percentage between 0 and 50.",true);return}b.disabled=true;try{const out=await call('admin_rate',{id:b.dataset.affSaveRate,rate});if(!out.updated)throw Error('Rate update did not save');notify("Individual rate saved; past commissions are unchanged.");await start(false)}catch(err){notify(err.message,true);b.disabled=false}});
  root.querySelectorAll("[data-aff-zelle]").forEach(b=>b.onclick=async()=>{const id=b.dataset.affZelle,el=root.querySelector('[id="masked-zelle-'+id+'"]');if(b.getAttribute('aria-pressed')==='true'){el.textContent='••••••';b.textContent='Show ◉';b.setAttribute('aria-pressed','false');return}b.disabled=true;try{const x=await call('affiliate_payout_details',{scope:'management',affiliateId:id,reveal:true});el.textContent=x.zelleContact||'Not configured';b.textContent='Hide ◉';b.setAttribute('aria-pressed','true')}catch(err){notify(err.message,true)}finally{b.disabled=false}});
  root.querySelectorAll("[data-aff-bank]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{const x=await call('affiliate_payout_details',{scope:'management',affiliateId:b.dataset.affBank});root.querySelector('[id="masked-bank-'+b.dataset.affBank+'"]').textContent=' · '+(x.bank?.display||'Unavailable')}catch(err){notify(err.message,true)}finally{b.disabled=false}});
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
   data={profiles:result.profiles||[],conversions:result.conversions||[],payouts:result.payouts||[],settings:result.settings||{},clickReport:result.clickReport||[]};
   render();
  }catch(err){
   root.innerHTML='<section class="panel"><h2>Affiliate management unavailable</h2><p>'+esc(err.message)+'</p><button type="button" class="btn" id="affiliate-retry">Try again</button></section>';
   root.querySelector("#affiliate-retry").onclick=()=>start(false);
  }
 }
 return {start};
}
