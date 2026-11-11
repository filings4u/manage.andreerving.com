const API="https://gnfyidajbectlppsekzj.supabase.co/functions/v1/andre-management-operations";
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=value=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value)||0);
const formatDate=value=>value?new Date(value).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"Not set";
const dateValue=value=>value?new Date(value).toISOString().slice(0,10):"";
const validUUID=value=>/^[a-f0-9-]{36}$/i.test(String(value));
function optionList(items,placeholder,valueFn,labelFn){
 return '<option value="">'+placeholder+'</option>'+items.map(x=>'<option value="'+escapeHtml(valueFn(x))+'">'+escapeHtml(labelFn(x))+'</option>').join("");
}
export function createManagementOperations({db,root,notify,head,isCurrent,navigateTo}){
 let selectedCustomer=null,watch=null;
 async function api(action,input={}){
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.access_token)throw Error("Sign in to management again");
  const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
   body:JSON.stringify({action,...input})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||"Management operation unavailable");
  return result;
 }
 const showError=e=>notify(String(e?.message||e||"Operation failed"),true);
 const onSubmit=(selector,callback)=>{
  const form=root.querySelector(selector);if(!form)return;
  form.addEventListener("submit",async event=>{
   event.preventDefault();if(!form.reportValidity())return;
   const button=form.querySelector("button[type=submit]");
   if(button)button.disabled=true;
   try{await callback(new FormData(form),form)}catch(e){showError(e)}
   finally{if(button)button.disabled=false}
  });
 };
 function returnToEnrollment(customerId=""){
   let state;try{state=JSON.parse(sessionStorage.getItem("ae_order_course_context")||sessionStorage.getItem("ae_enrollment_return")||"null")}catch{}
   if(!validUUID(state?.courseId||"")){notify("No course order return path is available.",true);return}
   if(customerId&&validUUID(customerId))state.userId=customerId;
   sessionStorage.setItem("ae_order_course_context",JSON.stringify({courseId:state.courseId,userId:state.userId||null}));
   sessionStorage.removeItem("ae_enrollment_return");
   history.replaceState(null,"","#/admin/orders");location.reload();
 }

 async function customers(){
  const res=await api("list_customers");
  if(!isCurrent("customer_profiles"))return;
  const people=res.items||[];
  const backEnrollment=(()=>{try{return JSON.parse(sessionStorage.getItem("ae_order_course_context")||sessionStorage.getItem("ae_enrollment_return")||"null")}catch{return null}})();
  root.innerHTML=head("Customer CRM","Manage complete customer profiles, purchases, courses, documents, and support.")+
   '<div class="ae-mgmt-header-actions"><button type="button" class="btn" id="crm-start-order">+ Create Order</button>'+(backEnrollment?.courseId?'<button type="button" class="btn secondary ae-return-enroll" data-return-enrollment>Continue to course order</button>':'')+'</div>'+
   '<section class="panel ae-mgmt-panel"><div class="ae-mgmt-panel-heading"><div><span class="ae-mini-eyebrow">CUSTOMER RELATIONSHIPS</span><h2>Customer directory</h2></div><span class="ae-mgmt-counter">'+people.length+' customers</span></div>'+
   '<label class="ae-mgmt-search-label">Search customer records<input id="crm-search" type="search" placeholder="Find a customer by name, email, or phone"></label>'+
   '<div class="tablewrap"><table class="ae-crm-table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Created</th><th></th></tr></thead><tbody id="crm-rows"></tbody></table></div></section>';
  const tbody=root.querySelector("#crm-rows");
  function draw(query=""){
   const filtered=people.filter(p=>[p.full_name,p.email,p.phone].some(v=>String(v||"").toLowerCase().includes(query.toLowerCase())));
   tbody.innerHTML=filtered.map(p=>'<tr class="ae-crm-clickable" data-customer-row="'+escapeHtml(p.id)+'" tabindex="0" role="button" aria-label="Open profile for '+escapeHtml(p.full_name||p.email)+'"><td><strong>'+escapeHtml(p.full_name||"Customer")+'</strong></td><td>'+escapeHtml(p.email)+'</td><td>'+escapeHtml(p.phone||"Not provided")+'</td><td>'+formatDate(p.created_at)+'</td><td><button class="ae-inline-btn" data-customer="'+escapeHtml(p.id)+'" type="button">Open profile</button></td></tr>').join("")||'<tr><td colspan="5">No customers match this search.</td></tr>';
   tbody.querySelectorAll("[data-customer]").forEach(b=>b.onclick=()=>profile(b.dataset.customer));
   tbody.querySelectorAll('[data-customer-row]').forEach(row=>{
    row.onclick=event=>{if(event.target.closest('button'))return;profile(row.dataset.customerRow)};
    row.onkeydown=event=>{if(event.target!==row)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();profile(row.dataset.customerRow)}};
   });
  }
  draw();root.querySelector("#crm-search").oninput=e=>draw(e.target.value);
  root.querySelector("#crm-start-order").onclick=async()=>{await navigateTo("orders");await orderCreator()};
  root.querySelector('[data-return-enrollment]')?.addEventListener("click",()=>returnToEnrollment());
  if(backEnrollment?.courseId&&!root.querySelector(".ae-crm-return-note")){
    const note=document.createElement("p");note.className="ae-crm-return-note";note.textContent="Create a paid or free order to provision course access through the standard workflow.";
    root.querySelector(".ae-mgmt-header-actions")?.after(note);
  }
 }
 function customerForm(existing=null,details=null){
  const isEdit=Boolean(existing?.id),p=existing||{},d=details||{};
  const given=(p.full_name||"").split(" ")[0]||"",family=(p.full_name||"").split(" ").slice(1).join(" ")||"";
  const val=(v)=>escapeHtml(v||"");
  const field=(label,name,value="",opts={})=>'<label class="ae-customer-field '+(opts.wide?"wide":"")+'"><span>'+label+(opts.required?' <em>*</em>':"")+'</span><input name="'+name+'" type="'+(opts.type||"text")+'" value="'+val(value)+'" maxlength="'+(opts.max||140)+'" '+(opts.required?"required ":"")+(opts.autocomplete?'autocomplete="'+opts.autocomplete+'" ':"")+(opts.placeholder?'placeholder="'+opts.placeholder+'" ':'')+(opts.readonly?"readonly ":"")+'></label>';
  const choice=(label,name,values,selected)=>'<label class="ae-customer-field"><span>'+label+'</span><select name="'+name+'">'+values.map(x=>'<option value="'+val(x)+'" '+(x===(selected||"")?"selected":"")+'>'+val(x)+'</option>').join("")+'</select></label>';
  root.innerHTML=head(isEdit?"Edit customer profile":"Create customer account",isEdit?"Update customer details and CRM information. Email identity is managed separately.":"Create a complete customer record. One email identifies one customer across orders, courses, and documents.")+
   '<form id="crm-create" class="ae-customer-form">'+
   '<div class="ae-customer-layout"><div class="ae-customer-main">'+
   '<section class="panel ae-customer-section"><div class="ae-customer-section-head"><span>01</span><div><h2>Personal information</h2><p>Identify the person associated with this customer account.</p></div></div><div class="ae-customer-fields">'+
   field("First name","firstName",given,{required:true,autocomplete:"given-name",max:80})+
   field("Last name","lastName",family,{required:true,autocomplete:"family-name",max:80})+
   field("Email address","email",p.email,{required:true,type:"email",autocomplete:"email",max:254,readonly:isEdit})+
   field("Primary phone","phone",p.phone,{type:"tel",autocomplete:"tel",max:32})+
   field("Alternate phone","alternate_phone",d.alternate_phone,{type:"tel",max:32})+
   choice("Preferred contact method","preferred_contact",["No preference","Email","Phone"],d.preferred_contact||"No preference")+
   '</div></section>'+
   '<section class="panel ae-customer-section"><div class="ae-customer-section-head"><span>02</span><div><h2>Business and organization</h2><p>Add professional details for coaching, training, or consulting customers.</p></div></div><div class="ae-customer-fields">'+
   field("Company or organization","company",d.company,{autocomplete:"organization"})+
   field("Job title","job_title",d.job_title,{autocomplete:"organization-title"})+
   choice("Customer type","customer_type",["Individual","Business","Organization"],d.customer_type||"Individual")+
   field("Customer source","acquisition_source",d.acquisition_source,{placeholder:"Website, referral, event, or other"})+
   '</div></section>'+
   '<section class="panel ae-customer-section"><div class="ae-customer-section-head"><span>03</span><div><h2>Address information</h2><p>Optional mailing and billing contact information. Payment cards are not stored here.</p></div></div><div class="ae-customer-fields">'+
   field("Street address","address_line1",d.address_line1,{wide:true,autocomplete:"address-line1"})+
   field("Apartment, suite, or unit","address_line2",d.address_line2,{wide:true,autocomplete:"address-line2"})+
   field("City","city",d.city,{autocomplete:"address-level2"})+
   field("State or region","state",d.state,{autocomplete:"address-level1"})+
   field("ZIP or postal code","postal_code",d.postal_code,{autocomplete:"postal-code"})+
   field("Country","country",d.country||"United States",{autocomplete:"country-name"})+
   '</div></section></div>'+
   '<aside class="ae-customer-side">'+
   '<section class="panel ae-customer-section"><div class="ae-customer-section-head"><span>04</span><div><h2>Account settings</h2><p>Set internal classification without sending an invitation automatically.</p></div></div><div class="ae-customer-fields one">'+
   choice("CRM status","account_status",["Active","Prospect","Inactive"],d.account_status||"Active")+
   '<div class="ae-customer-info"><strong>Account access</strong><p>Customer sign-in stays protected by Supabase authentication. Use the dedicated account invitation action after creating the record.</p></div>'+
   '</div></section>'+
   '<section class="panel ae-customer-section"><div class="ae-customer-section-head"><span>05</span><div><h2>Internal CRM notes</h2><p>These notes are restricted to management staff.</p></div></div>'+
   '<label class="ae-customer-field"><span>Notes and follow-up information</span><textarea name="internal_notes" rows="8" maxlength="3000" placeholder="Relevant customer background, follow-up reminders, or account administration notes...">'+val(d.internal_notes)+'</textarea></label></section>'+
   '<section class="ae-customer-next"><strong>One email. One customer.</strong><p>The email address is the unique customer identity. Purchases and course enrollments belong to the existing record.</p></section>'+
   '</aside></div>'+
   '<div class="ae-customer-actionbar"><div><strong>'+(isEdit?"Update customer details":"Ready to create this customer?")+'</strong><span>'+(isEdit?"Changes are saved to the customer CRM.":"No account invitation will be emailed until you choose to send one.")+'</span></div><div class="ae-customer-actions"><button class="btn secondary" type="button" id="crm-back">Cancel</button><button class="btn" type="submit">'+(isEdit?"Save customer changes":"Create customer account")+'</button></div></div></form>';
  const returning=(()=>{try{return JSON.parse(sessionStorage.getItem("ae_order_course_context")||sessionStorage.getItem("ae_enrollment_return")||"null")}catch{return null}})();
  if(returning?.courseId){
    const bar=root.querySelector(".ae-customer-actions");
    if(bar){const btn=document.createElement("button");btn.type="button";btn.className="btn secondary ae-return-enroll";btn.textContent="Continue to course order";btn.onclick=()=>returnToEnrollment();bar.prepend(btn);}
  }
  root.querySelector("#crm-back").onclick=()=>isEdit?profile(p.id):customers();
  onSubmit("#crm-create",async fd=>{
   const payload=Object.fromEntries(fd);
   if(isEdit){
    await api("update_customer_details",{userId:p.id,...payload});
    notify("Customer CRM information updated");await profile(p.id);return;
   }
   const result=await api("create_account",payload);
   notify(result.existing?"An existing account was found. Its records were preserved.":"Customer account created");
   await profile(result.userId);
  });
 }
 async function profile(uid){
  if(!validUUID(uid))return;
  selectedCustomer=uid;
  root.innerHTML=head("Customer profile","Loading customer information…");
  const data=await api("customer_detail",{userId:uid}).catch(e=>{showError(e);return null});
  if(!data||!isCurrent("customer_profiles")||selectedCustomer!==uid)return;
  const p=data.profile,items=data.enrollments||[],orders=data.orders||[],courses=new Map((data.courses||[]).map(c=>[c.id,c]));
  const rows=data.orderItems||[],documents=data.documents||[],tickets=data.tickets||[];
  const returning=(()=>{try{return JSON.parse(sessionStorage.getItem("ae_order_course_context")||sessionStorage.getItem("ae_enrollment_return")||"null")}catch{return null}})();
  root.innerHTML=head(p.full_name||p.email,"Customer CRM / Full account record")+
   '<div class="ae-mgmt-header-actions"><button class="btn secondary" id="crm-back">All customers</button><button class="btn secondary" id="crm-edit">Edit customer details</button>'+
   '<button class="btn" id="crm-order">+ Create Order</button><button class="btn secondary" id="crm-invoice">+ Create Invoice</button><button class="btn secondary" id="crm-free">+ Free Order</button><button class="btn secondary" id="crm-account-invite">Send Account Invite</button></div>'+
   '<div class="ae-crm-overview">'+
   [['Customer email',p.email],['Phone',p.phone||"Not provided"],['Purchases',orders.length],['Courses',items.length]].map(x=>'<section class="ae-crm-stat"><span>'+escapeHtml(x[0])+'</span><strong>'+escapeHtml(x[1])+'</strong></section>').join("")+'</div>'+
   '<section class="panel ae-mgmt-panel"><div class="ae-mgmt-panel-heading"><div><h2>Account invitation &amp; email delivery</h2><p class="muted">Resend delivery events and invitation history for this customer.</p></div><button class="btn secondary" id="crm-refresh-invite" type="button">Refresh delivery status</button></div><div id="crm-invite-delivery" role="status" aria-live="polite"><p class="muted">Checking Resend…</p></div></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Courses and access</h2><div class="tablewrap"><table><thead><tr><th>Course</th><th>Status</th><th>Enrolled</th><th>Expires</th><th>Manage</th></tr></thead><tbody>'+
   items.map(e=>'<tr><td>'+escapeHtml(courses.get(e.course_id)?.title||e.course_id)+'</td><td>'+escapeHtml(e.status)+'</td><td>'+formatDate(e.enrolled_at)+'</td><td>'+formatDate(e.expires_at)+'</td><td><button class="ae-inline-btn" data-access="'+escapeHtml(e.id)+'">Change access</button></td></tr>').join("")+
   '</tbody></table></div></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Purchase and billing history</h2><p class="muted">Only recorded order details are displayed. Card numbers and payment credentials are never stored in this portal.</p>'+
   '<div class="tablewrap"><table><thead><tr><th>Order</th><th>Date</th><th>Products or services</th><th>Total</th><th>Payment reference</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   orders.map(o=>'<tr><td><strong>'+escapeHtml(o.order_number)+'</strong></td><td>'+formatDate(o.created_at)+'</td><td>'+escapeHtml(rows.filter(x=>x.order_id===o.id).map(x=>x.item_name).join(", ")||"Not recorded")+'</td><td>'+money(o.total)+'</td><td>'+escapeHtml(o.external_payment_id||'Not available')+'</td><td>'+escapeHtml(o.status)+'</td><td><button class="ae-inline-btn" type="button" data-profile-invoice="'+escapeHtml(o.id)+'">View Invoice / Order</button></td></tr>').join("")+'</tbody></table></div></section>'+
   '<div class="ae-mgmt-two"><section class="panel ae-mgmt-panel"><h2>Customer documents</h2>'+
   (documents.map(d=>'<p class="ae-crm-item">'+escapeHtml(d.title)+' <small>'+formatDate(d.created_at)+'</small></p>').join("")||'<p class="muted">No documents yet.</p>')+
   '</section><section class="panel ae-mgmt-panel"><h2>Support history</h2>'+
   (tickets.map(t=>'<p class="ae-crm-item">'+escapeHtml(t.subject)+' <small>'+escapeHtml(t.status)+'</small></p>').join("")||'<p class="muted">No support requests.</p>')+'</section></div>';
  root.querySelector("#crm-back").onclick=customers;
  root.querySelector("#crm-edit").onclick=()=>customerForm(p,data.crmDetails||{});
  if(returning?.courseId){
    const actions=root.querySelector(".ae-mgmt-header-actions");
    const btn=document.createElement("button");btn.type="button";btn.className="btn ae-return-enroll";btn.textContent="Create course order for this customer";btn.onclick=()=>returnToEnrollment(uid);
    actions?.prepend(btn);
  }
  root.querySelector("#crm-order").onclick=async()=>{await navigateTo("orders");await orderCreator(uid,p.email)};
  root.querySelector("#crm-invoice").onclick=async()=>{await navigateTo("orders");await invoiceEditor(uid)};
  root.querySelector("#crm-free").onclick=async()=>{await navigateTo("orders");await orderCreator(uid,p.email,true)};
  async function refreshInviteDelivery(){
   const target=root.querySelector("#crm-invite-delivery");
   if(!target)return;
   target.innerHTML='<p class="muted">Checking Resend delivery history…</p>';
   try{
    const result=await api("invitation_delivery",{userId:uid});
    if(!root.contains(target))return;
    const messages=result.messages||[],history=result.history||[];
    const last=messages[0];
    target.innerHTML=(last?'<p><strong>Latest Resend event: '+escapeHtml(last.status)+'</strong> · '+escapeHtml(last.subject)+' · '+formatDate(last.sentAt)+'</p>':'<p class="muted">'+escapeHtml(result.providerMessage||"Resend status unknown")+'</p>')+
     '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Source</th><th>Status</th></tr></thead><tbody>'+
     (messages.map(m=>'<tr><td>'+formatDate(m.sentAt)+'</td><td>'+escapeHtml(m.subject)+'</td><td>'+escapeHtml(m.status)+'</td></tr>').join("")+
      history.map(h=>'<tr><td>'+formatDate(h.at)+'</td><td>'+escapeHtml(h.source)+'</td><td>'+escapeHtml(h.status)+(h.error?' — '+escapeHtml(h.error):'')+'</td></tr>').join("")||'<tr><td colspan="3">No invitation records found.</td></tr>')+
     '</tbody></table></div><p class="muted">A sent record does not confirm inbox delivery. Provider events are shown separately when available.</p>';
   }catch(e){target.textContent="Unable to retrieve invitation status: "+String(e?.message||e)}
  }
  root.querySelector("#crm-refresh-invite").onclick=refreshInviteDelivery;
  refreshInviteDelivery();
  root.querySelector("#crm-account-invite").textContent="Resend Account Invitation";
  root.querySelector("#crm-account-invite").onclick=async()=>{
   const btn=root.querySelector("#crm-account-invite");btn.disabled=true;
   try{await api("send_invite",{email:p.email});notify("Branded invitation submitted to Resend.");await refreshInviteDelivery()}
   catch(e){showError(e)}finally{if(root.contains(btn))btn.disabled=false}
  };
  root.querySelectorAll("[data-profile-invoice]").forEach(btn=>btn.onclick=async()=>{await navigateTo("orders");await invoiceViewer(btn.dataset.profileInvoice)});
  root.querySelectorAll("[data-access]").forEach(b=>b.onclick=()=>changeAccess(b.dataset.access,uid,items,courses));
 }
 async function enrollments(prefill=""){
  const [people,catalog,enrolled]=await Promise.all([api("list_customers"),api("list_courses"),api("list_enrollments")]);
  if(!isCurrent("course_enrollments")&&!isCurrent("customer_profiles"))return;
  const users=people.items||[],courses=catalog.items||[],records=enrolled.items||[];
  root.innerHTML=head("Course enrollments","Course access is granted only through a completed order. Paid invoices must be paid first; complimentary access requires a recorded free order.")+
   '<section class="panel ae-mgmt-panel"><div class="ae-mgmt-panel-heading"><div><h2>Order-required enrollment</h2><p>Create a customer order to assign paid or complimentary course access.</p></div><button id="ae-enroll-to-order" type="button" class="btn">+ Create Course Order</button></div></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Enrollment records</h2><div class="tablewrap"><table><thead><tr><th>Customer</th><th>Course</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead><tbody>'+
   records.map(e=>'<tr><td>'+escapeHtml(users.find(p=>p.id===e.user_id)?.email||e.user_id)+'</td><td>'+escapeHtml(courses.find(c=>c.id===e.course_id)?.title||e.course_id)+'</td><td>'+escapeHtml(e.expires_at&&new Date(e.expires_at)<=new Date()?"Expired":e.status)+'</td><td>'+formatDate(e.expires_at)+'</td><td><button class="ae-inline-btn" data-edit-access="'+escapeHtml(e.id)+'">Manage</button></td></tr>').join("")+'</tbody></table></div></section>';
  root.querySelector("#ae-enroll-to-order").onclick=async()=>{
   if(prefill&&validUUID(prefill))sessionStorage.setItem("ae_order_course_context",JSON.stringify({userId:prefill}));
   await navigateTo("orders");await ordersPage(prefill);
  };
  root.querySelectorAll("[data-edit-access]").forEach(b=>b.onclick=()=>changeAccess(b.dataset.editAccess,null,records,new Map(courses.map(c=>[c.id,c]))));
 }
 async function changeAccess(id,returnUid,records,courses){
  const selected=records.find(e=>e.id===id);if(!selected)return;
  if(!selected.order_id){
   notify('A completed order is required before granting course access. Create the order first.',true);
   sessionStorage.setItem('ae_order_course_context',JSON.stringify({courseId:selected.course_id,userId:selected.user_id}));
   await navigateTo('orders');await ordersPage(selected.user_id);return;
  }
  const course=courses.get?.(selected.course_id);
  root.innerHTML=head("Manage course access","Change enrollment expiration and status without modifying purchase history.")+
   '<section class="panel ae-mgmt-panel ae-narrow"><h2>'+escapeHtml(course?.title||"Course")+'</h2>'+
   '<form id="ae-access-edit" class="ae-mgmt-form"><label>Expiration date<input type="date" required name="expiresAt" value="'+dateValue(selected.expires_at)+'"></label>'+
   '<label>Status<select name="status">'+["active","completed","expired","cancelled"].map(s=>'<option value="'+s+'"'+(selected.status===s?" selected":"")+'>'+s+'</option>').join("")+'</select></label>'+
   '<div class="ae-mgmt-actions"><button class="btn" type="submit">Save access changes</button><button class="btn secondary" id="ae-access-back" type="button">Cancel</button></div></form></section>';
  root.querySelector("#ae-access-back").onclick=()=>returnUid?profile(returnUid):enrollments();
  onSubmit("#ae-access-edit",async fd=>{
   const v=Object.fromEntries(fd);
   v.expiresAt=new Date(v.expiresAt+"T23:59:59Z").toISOString();
   await api("change_enrollment",{enrollmentId:id,...v});
   notify("Course access updated");
   if(returnUid)await profile(returnUid);else await enrollments();
  });
 }

 async function orderCreator(prefillUser="",prefillEmail="",free=false){
  const [customers,catalog]=await Promise.all([api("list_customers"),api("list_prices")]);
  if(!isCurrent("orders")&&!isCurrent("customer_profiles"))return;
  const people=customers.items||[],prices=(catalog.items||[]).filter(p=>p.active&&p.price_key.startsWith("offering."));
  const context=(()=>{try{return JSON.parse(sessionStorage.getItem("ae_order_course_context")||"null")}catch{return null}})();
  const courseChoice=(context?.courseId&&validUUID(context.courseId))?context.courseId:"";
  const existing=people.find(p=>p.id===(prefillUser||context?.userId)||p.email?.toLowerCase()===prefillEmail.toLowerCase());
  const names=String(existing?.full_name||"").trim().split(/\s+/);
  const first=names.shift()||"",last=names.join(" ");
  const initialCourse=courseChoice?(await api("list_courses")).items?.find(c=>c.id===courseChoice):null;
  const initialKey=initialCourse?("offering."+initialCourse.slug):"";
  const orderPriceOptions=initialKey?prices.filter(p=>p.price_key===initialKey):prices;
  root.innerHTML=head("Orders & invoices","Create orders using customer details. Free access is provisioned immediately; paid access begins only after verified checkout payment.")+
   '<div class="ae-mgmt-two"><section class="panel ae-mgmt-panel"><h2>Create an order</h2><p class="muted">Select a customer already created in Customer CRM, then create a paid invoice or a recorded free-access order.</p>'+
   '<form id="ae-create-order" class="ae-mgmt-form">'+
   '<label>Existing customer<select name="customerId" id="ae-order-customer" required>'+optionList(people,"Choose existing customer",p=>p.id,p=>(p.full_name||p.email)+" — "+p.email)+'</select></label>'+
   '<label>First name<input required name="firstName" maxlength="80" value="'+escapeHtml(first)+'"></label>'+
   '<label>Last name<input required name="lastName" maxlength="80" value="'+escapeHtml(last)+'"></label>'+
   '<label>Customer email<input required readonly type="email" name="email" maxlength="254" value="'+escapeHtml(existing?.email||prefillEmail)+'"></label>'+
   '<label>Phone (optional)<input type="tel" name="phone" maxlength="32" value="'+escapeHtml(existing?.phone||"")+'"></label>'+
   '<label>Product or service<select name="priceKey" required>'+optionList(orderPriceOptions,"Choose a product or service",p=>p.price_key,p=>p.label+" — "+money(p.amount))+'</select></label>'+
   '<label>Order type<select name="mode" required><option value="invoice">Accept Payment — Send Invoice</option><option value="free">Free Access — $0.00</option></select></label>'+
   '<p class="ae-form-hint" id="ae-order-flow-explanation">An invoice will be emailed with a link to view the order and pay securely using checkout.html. Customer access begins after confirmed payment.</p>'+
   '<div class="ae-mgmt-actions"><button class="btn" type="submit">Create Order &amp; Send Invoice</button><button class="btn secondary" type="button" id="ae-order-create-customer">+ Create Customer</button></div></form></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Order workflow</h2><p><strong>1.</strong> Create an order using the customer name and email.</p><p><strong>2.</strong> Send a branded invoice, or choose Free Access.</p><p><strong>3.</strong> Payment is verified, then an account is created or reused.</p><p><strong>4.</strong> Course access is granted and branded account invitation and receipt emails are sent.</p><p class="muted">An unpaid invoice never creates an account or activates course access.</p></section></div>'+
   '<div class="ae-mgmt-actions"><button type="button" class="btn secondary" id="ae-order-back">← Back to customer directory</button></div>';
  root.querySelector("#ae-order-back").onclick=()=>ordersPage();
  if(free)root.querySelector('#ae-create-order [name="mode"]').value="free";
  const flow=root.querySelector('#ae-order-flow-explanation'),submit=root.querySelector('#ae-create-order [type="submit"]');
  const customerSelect=root.querySelector('#ae-order-customer');
  if(existing)customerSelect.value=existing.id;
  customerSelect.onchange=()=>{
   const person=people.find(p=>p.id===customerSelect.value);
   const parts=String(person?.full_name||"").trim().split(/\s+/);
   const fields=root.querySelector('#ae-create-order');
   fields.querySelector('[name="firstName"]').value=parts.shift()||"";
   fields.querySelector('[name="lastName"]').value=parts.join(" ");
   fields.querySelector('[name="email"]').value=person?.email||"";
   fields.querySelector('[name="phone"]').value=person?.phone||"";
  };
  root.querySelector('#ae-order-create-customer').onclick=async()=>{await navigateTo('customer_profiles');customerForm()};

  if(initialKey&&prices.some(p=>p.price_key===initialKey))root.querySelector('#ae-create-order [name="priceKey"]').value=initialKey;
  root.querySelector('#ae-create-order [name="mode"]').onchange=e=>{
   const free=e.target.value==="free";
   flow.textContent=free?"Free Access: create or reuse the customer account, grant any purchased course, and send branded invitation and $0 receipt. No payment is charged.":"An invoice will be emailed with a link to review the order and pay securely using checkout.html. Access begins only after verified payment.";
   submit.textContent=free?"Grant Free Access & Send Emails":"Create Order & Send Invoice";
  };
  if(free)root.querySelector('#ae-create-order [name="mode"]').onchange({target:root.querySelector('#ae-create-order [name="mode"]')});
  onSubmit("#ae-create-order",async fd=>{
   const values=Object.fromEntries(fd);const customer=people.find(p=>p.id===values.customerId);if(!customer)throw Error("Select an existing customer before creating an order.");values.email=customer.email;if(initialCourse)values.courseId=initialCourse.id;
   const result=await api("create_order",values);
   notify(values.mode==="free"?"Free access order "+result.orderNumber+" completed.":"Invoice "+result.orderNumber+" sent to "+values.email);
   sessionStorage.removeItem("ae_order_course_context");sessionStorage.removeItem("ae_enrollment_return");
   await ordersPage();
  });
  root.querySelectorAll("[data-send-invoice]").forEach(btn=>btn.onclick=async()=>{
   btn.disabled=true;
   try{await api("send_invoice",{orderId:btn.dataset.sendInvoice});notify("Branded invoice email sent.");await ordersPage()}
   catch(e){showError(e)}finally{btn.disabled=false}
  });
 }
 async function ordersPage(prefillUser="",prefillEmail=""){
  const invoiceRoute=location.hash.match(/^#\/admin\/orders\/invoice\/([a-f0-9-]{36})$/i);
  if(invoiceRoute)return invoiceViewer(invoiceRoute[1]);
  if(location.hash==="#/admin/orders/invoice/new")return invoiceEditor(prefillUser);
  const [customerResult,orderResult]=await Promise.all([api("list_customers"),api("list_orders")]);
  if(!isCurrent("orders")&&!isCurrent("customer_profiles"))return;
  const people=customerResult.items||[],orders=orderResult.items||[];
  const context=(()=>{try{return JSON.parse(sessionStorage.getItem("ae_order_course_context")||"null")}catch{return null}})();
  if(context?.courseId&&validUUID(context.courseId)){
   return orderCreator(prefillUser||context.userId||"");
  }
  const byCustomer=new Map();
  for(const p of people){
   const key=String(p.email||"").trim().toLowerCase();
   if(key&&!byCustomer.has(key))byCustomer.set(key,{person:p,orders:[]});
  }
  for(const o of orders){
   const key=String(o.customer_email||"").trim().toLowerCase();
   if(!key)continue;
   if(!byCustomer.has(key))byCustomer.set(key,{person:null,orders:[]});
   byCustomer.get(key).orders.push(o);
  }
  const groups=[...byCustomer.entries()].map(([email,group])=>({...group,email})).sort((x,y)=>(x.person?.full_name||x.email).localeCompare(y.person?.full_name||y.email));
  root.innerHTML=head("Customer orders & invoices","One customer record with all purchases, invoices, payments and course access in the customer profile.")+
    '<div class="ae-mgmt-header-actions ae-invoice-top-actions"><button type="button" class="btn" id="ae-new-order">+ Create Order</button><button type="button" class="btn secondary" id="ae-new-invoice">+ Create Invoice</button></div>'+
    '<section class="panel ae-mgmt-panel ae-order-directory"><div class="ae-mgmt-panel-heading"><div><h2>Customer accounts</h2><p class="muted">Select a customer to review all their orders, invoice details and course access.</p></div><span class="ae-mgmt-counter">'+groups.length+' customers</span></div>'+
    '<label class="ae-mgmt-search-label">Search customers<input id="ae-order-customer-search" type="search" placeholder="Search name, email or order number"></label>'+
    '<div class="tablewrap"><table class="ae-crm-table"><thead><tr><th>Customer</th><th>Orders</th><th>Paid / free</th><th>Open invoices</th><th>Total order value</th><th>Action</th></tr></thead><tbody id="ae-order-customers"></tbody></table></div></section>';
  const tbody=root.querySelector("#ae-order-customers");
  function draw(term=""){
   const q=term.toLowerCase();
   const shown=groups.filter(g=>[g.email,g.person?.full_name,...g.orders.map(o=>o.order_number)].some(v=>String(v||"").toLowerCase().includes(q)));
   tbody.innerHTML=shown.map(g=>{
     const person=g.person,paid=g.orders.filter(o=>["paid","completed"].includes(o.status)).length,pending=g.orders.filter(o=>o.status==="pending").length,total=g.orders.reduce((n,o)=>n+Number(o.total||0),0);
     return '<tr><td><strong>'+escapeHtml(person?.full_name||g.orders[0]?.customer_name||"Customer")+'</strong><div class="muted">'+escapeHtml(g.email)+'</div></td><td>'+g.orders.length+'</td><td>'+paid+'</td><td>'+pending+'</td><td>'+money(total)+'</td><td><button type="button" class="ae-inline-btn" data-customer-view="'+escapeHtml(person?.id||"")+'" data-customer-email="'+escapeHtml(g.email)+'">View profile</button></td></tr>';
   }).join("")||'<tr><td colspan="6">No customers found.</td></tr>';
   tbody.querySelectorAll("[data-customer-view]").forEach(btn=>btn.onclick=async()=>{
    if(btn.dataset.customerView){await navigateTo("customer_profiles");return profile(btn.dataset.customerView)}
    return orderCustomerDetail(btn.dataset.customerEmail);
   });
  }
  draw();
  root.querySelector("#ae-order-customer-search").oninput=e=>draw(e.target.value);
  root.querySelector("#ae-new-invoice").onclick=()=>invoiceEditor(prefillUser);
  root.querySelector("#ae-new-order").onclick=()=>orderCreator(prefillUser,prefillEmail);
 }
 async function orderCustomerDetail(customerEmail){
  const data=await api("list_orders"),orders=(data.items||[]).filter(o=>String(o.customer_email||"").toLowerCase()===String(customerEmail||"").toLowerCase());
  root.innerHTML=head("Customer order history","Orders associated with "+customerEmail)+
   '<div class="ae-mgmt-header-actions"><button type="button" class="btn secondary" id="ae-back-orders">← Customer accounts</button></div>'+
   '<section class="panel ae-mgmt-panel"><h2>Orders</h2><div class="tablewrap"><table><thead><tr><th>Number</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>'+
   orders.map(o=>'<tr><td>'+escapeHtml(o.order_number)+'</td><td>'+formatDate(o.created_at)+'</td><td>'+money(o.total)+'</td><td>'+escapeHtml(o.status)+'</td><td><button type="button" class="ae-inline-btn" data-invoice-open="'+escapeHtml(o.id)+'">View invoice / order</button></td></tr>').join("")+'</tbody></table></div></section>';
  root.querySelector("#ae-back-orders").onclick=()=>ordersPage();
  root.querySelectorAll("[data-invoice-open]").forEach(btn=>btn.onclick=()=>invoiceViewer(btn.dataset.invoiceOpen,customerEmail));
 }
 async function invoiceEditor(prefillUser="",courseId="",free=false){
  if(!courseId&&location.hash==="#/admin/orders")history.pushState(null,"","#/admin/orders/invoice/new");
  const [customers,catalog,coursesResult]=await Promise.all([api("list_customers"),api("list_prices"),api("list_courses")]);
  if(!isCurrent("orders")&&!isCurrent("customer_profiles"))return;
  const people=customers.items||[],allPrices=(catalog.items||[]).filter(p=>p.active&&p.price_key.startsWith("offering.")&&!p.price_key.startsWith("offering.extension-"));
  const course=(coursesResult.items||[]).find(c=>c.id===courseId);
  const requiredKey=course?"offering."+course.slug:"";
  const prices=requiredKey?allPrices.filter(p=>p.price_key===requiredKey):allPrices;
  const person=people.find(p=>p.id===prefillUser);
  root.innerHTML=head(free?"Create free-access order":"Create invoice","Create a customer-linked order with a catalog line item. No course access is granted until a paid invoice is verified or a $0 order is completed.")+
   '<div class="ae-mgmt-header-actions"><button type="button" class="btn secondary" id="ae-invoice-back">← Back to customer orders</button></div>'+
   '<form id="ae-invoice-create" class="ae-invoice-workspace"><section class="panel ae-mgmt-panel"><div class="ae-mgmt-panel-heading"><div><span class="ae-mini-eyebrow">INVOICE DETAILS</span><h2>Bill to</h2></div><span class="pill pending">New</span></div>'+
   '<div class="ae-invoice-fields"><label>Existing customer<select name="customerId" required>'+optionList(people,"Choose a customer",p=>p.id,p=>(p.full_name||p.email)+" — "+p.email)+'</select></label>'+
   '<label>Customer email<input name="email" type="email" readonly required></label><label>First name<input name="firstName" required maxlength="80"></label><label>Last name<input name="lastName" required maxlength="80"></label><label>Phone<input name="phone" maxlength="32"></label></div></section>'+
   '<section class="panel ae-mgmt-panel"><div class="ae-mgmt-panel-heading"><div><span class="ae-mini-eyebrow">LINE ITEM</span><h2>Product or course</h2><p class="muted">Pricing is verified against the active product catalog when saved.</p></div></div>'+
   '<div class="ae-invoice-fields"><label class="ae-invoice-wide">Description / catalog item<select name="priceKey" required>'+optionList(prices,"Choose a product or course",p=>p.price_key,p=>p.label+" — "+money(p.amount))+'</select></label>'+
   '<label>Order type<select name="mode"><option value="invoice">Invoice — payment required</option><option value="free">Complimentary — $0.00</option></select></label></div>'+
   '<div class="ae-invoice-total"><span>Total due</span><strong id="ae-invoice-total">$0.00</strong></div></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Save or send</h2><p class="muted">Save Draft creates a pending invoice without sending an email. Create & Send emails a branded invoice with secure checkout. Free access creates a recorded $0 order and sends the existing free-access emails.</p>'+
   '<div class="ae-mgmt-actions"><button type="submit" class="btn secondary" name="submitMode" value="draft" id="ae-save-draft">Save draft</button><button type="submit" class="btn" name="submitMode" value="send" id="ae-save-send">Create &amp; Send Invoice</button></div></section></form>';
  const form=root.querySelector("#ae-invoice-create"),customer=form.querySelector('[name="customerId"]'),selection=form.querySelector('[name="priceKey"]'),mode=form.querySelector('[name="mode"]');
  function fillCustomer(){
   const p=people.find(x=>x.id===customer.value),names=String(p?.full_name||"").trim().split(/\s+/);form.querySelector('[name="email"]').value=p?.email||"";form.querySelector('[name="firstName"]').value=names.shift()||"";form.querySelector('[name="lastName"]').value=names.join(" ")||"";form.querySelector('[name="phone"]').value=p?.phone||"";
  }
  function updateTotal(){
   const p=prices.find(x=>x.price_key===selection.value);root.querySelector("#ae-invoice-total").textContent=mode.value==="free"?"$0.00":money(p?.amount||0);
   root.querySelector("#ae-save-draft").disabled=mode.value==="free";
   root.querySelector("#ae-save-send").textContent=mode.value==="free"?"Create Free Order & Send Emails":"Create & Send Invoice";
  }
  customer.value=person?.id||"";fillCustomer();customer.onchange=fillCustomer;
  if(requiredKey)selection.value=requiredKey;
  if(free)mode.value="free";selection.onchange=updateTotal;mode.onchange=updateTotal;updateTotal();
  root.querySelector("#ae-invoice-back").onclick=()=>{sessionStorage.removeItem("ae_order_course_context");history.pushState(null,"","#/admin/orders");ordersPage()};
  let submitMode="send";
  form.querySelectorAll('[name="submitMode"]').forEach(btn=>btn.onclick=()=>{submitMode=btn.value});
  onSubmit("#ae-invoice-create",async fd=>{
   const p=people.find(x=>x.id===String(fd.get("customerId")));if(!p)throw Error("Select an existing customer");
   const payload=Object.fromEntries(fd);payload.email=p.email;
   if(course)payload.courseId=course.id;
   payload.saveDraft=submitMode==="draft"&&payload.mode!=="free";
   const result=await api("create_order",payload);
   sessionStorage.removeItem("ae_order_course_context");sessionStorage.removeItem("ae_enrollment_return");
   notify(payload.mode==="free"?"Complimentary order created.":payload.saveDraft?"Invoice draft saved.":"Branded invoice emailed.");
   await invoiceViewer(result.orderId);
  });
 }
 async function invoiceViewer(orderId,customerEmail=""){
  if(location.hash!=="#/admin/orders/invoice/"+orderId)history.pushState(null,"","#/admin/orders/invoice/"+orderId);
  const data=await api("invoice_detail",{orderId}),o=data.order,items=data.items||[],meta=data.invoice;
  const isPending=o.status==="pending",invoiced=meta?.mode==="invoice",canSend=isPending&&invoiced&&!meta?.payment_intent_id;
  root.innerHTML=head(invoiced?"Invoice "+o.order_number:"Order "+o.order_number,"Customer billing and payment detail")+
   '<div class="ae-mgmt-header-actions"><button type="button" class="btn secondary" id="ae-invoice-return">← Back</button>'+
   (canSend?'<button type="button" class="btn" id="ae-invoice-send">Send / Resend Invoice</button><button type="button" class="btn secondary" id="ae-invoice-pay">Take Payment</button><button type="button" class="btn secondary" id="ae-invoice-void">Void Invoice</button>':"")+
   (["paid","completed"].includes(o.status)?'<button type="button" class="btn secondary" id="ae-invoice-invite">Send Account Invite</button>':"")+'</div>'+
   '<div class="ae-invoice-view"><section class="panel ae-mgmt-panel"><div class="ae-mgmt-panel-heading"><div><span class="ae-mini-eyebrow">ANDRE ERVING / BILLING</span><h2>'+escapeHtml(o.order_number)+'</h2></div><span class="pill '+escapeHtml(o.status)+'">'+escapeHtml(o.status)+'</span></div>'+
   '<div class="ae-invoice-view-meta"><div><span>Customer</span><strong>'+escapeHtml(o.customer_name||"Customer")+'</strong><p>'+escapeHtml(o.customer_email)+'</p></div><div><span>Date issued</span><strong>'+formatDate(o.created_at)+'</strong><p>Invoice: '+escapeHtml(meta?.status||"Not applicable")+'</p></div></div>'+
   '<div class="tablewrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>'+
   items.map(item=>'<tr><td>'+escapeHtml(item.item_name)+'</td><td>'+escapeHtml(item.quantity)+'</td><td>'+money(item.unit_price)+'</td><td>'+money(item.line_total)+'</td></tr>').join("")+'</tbody></table></div>'+
   '<div class="ae-invoice-total"><span>Total</span><strong>'+money(o.total)+'</strong></div>'+
   '<div class="ae-invoice-view-meta"><div><span>Sent</span><strong>'+formatDate(meta?.invoice_sent_at)+'</strong></div><div><span>Payment status</span><strong>'+escapeHtml(o.status)+'</strong></div></div>'+
   (meta?.last_error?'<p class="notice error">'+escapeHtml(meta.last_error)+'</p>':"")+
   '</section></div>';
  root.querySelector("#ae-invoice-return").onclick=()=>{
   history.pushState(null,"","#/admin/orders");
   return customerEmail?orderCustomerDetail(customerEmail):ordersPage();
  };
  root.querySelector("#ae-invoice-send")?.addEventListener("click",async()=>{
   try{await api("send_invoice",{orderId});notify("Branded invoice sent.");await invoiceViewer(orderId,customerEmail)}catch(e){showError(e)}
  });
  root.querySelector("#ae-invoice-pay")?.addEventListener("click",async()=>{
   const tab=window.open("","_blank");if(tab){tab.document.title="Opening secure payment…";tab.opener=null}
   try{const result=await api("send_invoice",{orderId});
    if(!/^https:\/\/andreerving\.com\/invoice\.html\?token=/.test(result.invoiceUrl||""))throw Error("Secure payment link unavailable");
    if(tab)tab.location.href=result.invoiceUrl;else window.location.assign(result.invoiceUrl);
    notify("Secure payment invoice opened and emailed to the customer.");
   }catch(e){if(tab)tab.close();showError(e)}
  });
  root.querySelector("#ae-invoice-void")?.addEventListener("click",async()=>{
   if(!confirm("Void this unpaid invoice? Its payment link will stop working. This cannot be undone."))return;
   try{await api("void_invoice",{orderId});notify("Invoice voided.");await invoiceViewer(orderId,customerEmail)}catch(e){showError(e)}
  });
  root.querySelector("#ae-invoice-invite")?.addEventListener("click",async()=>{
   try{await api("send_invite",{email:o.customer_email,orderId});notify("Account invitation sent.")}catch(e){showError(e)}
  });
 }
 async function inviteForm({email="",orderId=""}={}){
  const [customerResponse,orderResponse]=await Promise.all([api("list_customers"),api("list_orders")]);
  const customers=customerResponse.items||[],allOrders=orderResponse.items||[];
  if(!isCurrent("orders"))return;
  const normalized=String(email||"").trim().toLowerCase();
  let selected=customers.find(person=>person.email.toLowerCase()===normalized);
  if(!selected&&orderId){
    const requested=allOrders.find(order=>order.id===orderId);
    selected=customers.find(person=>person.email.toLowerCase()===String(requested?.customer_email||"").trim().toLowerCase());
  }
  root.innerHTML=head("Send account invitation","Select an existing customer. Account invitations always belong to one customer record.")+
   '<section class="panel ae-mgmt-panel ae-narrow"><h2>Customer invitation</h2>'+
   '<form class="ae-mgmt-form" id="ae-send-invite">'+
   '<label>Customer<select name="userId" required>'+optionList(customers,"Choose a customer",p=>p.id,p=>(p.full_name?p.full_name+" — ":"")+p.email)+'</select></label>'+
   '<label>Related order <span class="ae-form-hint">Optional. Only this customer’s orders are shown.</span><select name="orderId"><option value="">No specific order</option></select></label>'+
   '<div class="ae-mgmt-actions"><button class="btn" type="submit">Send invitation</button><button class="btn secondary" type="button" id="ae-invite-cancel">Cancel</button></div></form>'+
   '<p class="ae-form-hint">Need to invite someone new? Create their customer account in Customer CRM first.</p></section>';
  const select=root.querySelector('#ae-send-invite [name="userId"]');
  const orderSelect=root.querySelector('#ae-send-invite [name="orderId"]');
  function refreshOrders(){
    const customer=customers.find(p=>p.id===select.value);
    const related=customer?allOrders.filter(o=>String(o.customer_email||"").trim().toLowerCase()===customer.email.trim().toLowerCase()):[];
    orderSelect.innerHTML=optionList(related,"No specific order",o=>o.id,o=>o.order_number+" — "+money(o.total));
    if(related.some(o=>o.id===orderId))orderSelect.value=orderId;
  }
  select.value=selected?.id||"";
  refreshOrders();
  select.onchange=()=>{orderId="";refreshOrders()};
  root.querySelector("#ae-invite-cancel").onclick=()=>ordersPage();
  onSubmit("#ae-send-invite",async fd=>{
    const customer=customers.find(p=>p.id===String(fd.get("userId")||""));
    if(!customer)throw Error("Choose an existing customer");
    const values={email:customer.email};
    const related=String(fd.get("orderId")||"");
    if(related)values.orderId=related;
    const res=await api("send_invite",values);
    notify("Account invitation sent to "+res.email);
    await ordersPage();
  });
 }
 async function extensionSettings(){
  const [catalog,settings]=await Promise.all([api("list_courses"),api("list_extensions")]);
  if(!isCurrent("course_extensions"))return;
  const items=(catalog.items||[]).filter(c=>c.status==="published"),current=new Map((settings.items||[]).map(e=>[e.course_id,e]));
  root.innerHTML=head("Course extensions","Configure paid 30-day access extensions for expired training programs.")+
   '<section class="panel ae-mgmt-panel"><h2>Extension pricing</h2><p class="muted">Set the price for each course. The extension purchase button is available only when a price is enabled and the student’s access has expired.</p>'+
   '<div class="ae-extension-list">'+items.map(c=>{const cfg=current.get(c.id)||{};return '<form class="ae-extension-row" data-extension="'+escapeHtml(c.id)+'">'+
    '<div><strong>'+escapeHtml(c.title)+'</strong><span>Current course access: '+escapeHtml(c.access_days||30)+' days · Extension: 30 days</span></div>'+
    '<label>Extension price (USD)<input type="number" step="0.01" min="0.01" name="amount" placeholder="Enter price" value="'+escapeHtml(cfg.amount??"")+'"></label>'+
    '<label class="ae-mgmt-check"><input type="checkbox" name="enabled" '+(cfg.enabled?"checked":"")+'> Enable</label>'+
    '<button class="btn" type="submit">Save</button></form>'}).join("")+'</div></section>';
  root.querySelectorAll("[data-extension]").forEach(form=>form.addEventListener("submit",async e=>{
   e.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;
   try{const fd=new FormData(form),raw=String(fd.get("amount")||"").trim();
    await api("extension_price",{courseId:form.dataset.extension,amount:raw===""?null:Number(raw),enabled:fd.has("enabled")});
    notify("30-day extension settings saved");
    await extensionSettings();
   }catch(error){showError(error)}finally{button.disabled=false}
  }));
 }
 return {customers,profile,customerForm,enrollments,ordersPage,extensionSettings,inviteForm,stop(){if(watch){db.removeChannel(watch);watch=null}}};
}
