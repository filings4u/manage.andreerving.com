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
 async function customers(){
  const res=await api("list_customers");
  if(!isCurrent("customer_profiles"))return;
  const people=res.items||[];
  root.innerHTML=head("Customer CRM","Manage complete customer profiles, purchases, courses, documents, and support.")+
   '<div class="ae-mgmt-header-actions"><button type="button" class="btn" id="crm-add">Create customer account</button></div>'+
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
  root.querySelector("#crm-add").onclick=()=>customerForm();
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
  root.innerHTML=head(p.full_name||p.email,"Customer CRM / Full account record")+
   '<div class="ae-mgmt-header-actions"><button class="btn secondary" id="crm-back">All customers</button><button class="btn secondary" id="crm-edit">Edit customer details</button>'+
   '<button class="btn" id="crm-enroll">Assign a course</button><button class="btn secondary" id="crm-order">Create an order</button><button class="btn secondary" id="crm-invite">Send account invitation</button></div>'+
   '<div class="ae-crm-overview">'+
   [['Customer email',p.email],['Phone',p.phone||"Not provided"],['Purchases',orders.length],['Courses',items.length]].map(x=>'<section class="ae-crm-stat"><span>'+escapeHtml(x[0])+'</span><strong>'+escapeHtml(x[1])+'</strong></section>').join("")+'</div>'+
   '<section class="panel ae-mgmt-panel"><h2>Courses and access</h2><div class="tablewrap"><table><thead><tr><th>Course</th><th>Status</th><th>Enrolled</th><th>Expires</th><th>Manage</th></tr></thead><tbody>'+
   items.map(e=>'<tr><td>'+escapeHtml(courses.get(e.course_id)?.title||e.course_id)+'</td><td>'+escapeHtml(e.status)+'</td><td>'+formatDate(e.enrolled_at)+'</td><td>'+formatDate(e.expires_at)+'</td><td><button class="ae-inline-btn" data-access="'+escapeHtml(e.id)+'">Change access</button></td></tr>').join("")+
   '</tbody></table></div></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Purchase and billing history</h2><p class="muted">Only recorded order details are displayed. Card numbers and payment credentials are never stored in this portal.</p>'+
   '<div class="tablewrap"><table><thead><tr><th>Order</th><th>Date</th><th>Products or services</th><th>Total</th><th>Payment reference</th><th>Status</th></tr></thead><tbody>'+
   orders.map(o=>'<tr><td><strong>'+escapeHtml(o.order_number)+'</strong></td><td>'+formatDate(o.created_at)+'</td><td>'+escapeHtml(rows.filter(x=>x.order_id===o.id).map(x=>x.item_name).join(", ")||"Not recorded")+'</td><td>'+money(o.total)+'</td><td>'+escapeHtml(o.external_payment_id||'Not available')+'</td><td>'+escapeHtml(o.status)+'</td></tr>').join("")+'</tbody></table></div></section>'+
   '<div class="ae-mgmt-two"><section class="panel ae-mgmt-panel"><h2>Customer documents</h2>'+
   (documents.map(d=>'<p class="ae-crm-item">'+escapeHtml(d.title)+' <small>'+formatDate(d.created_at)+'</small></p>').join("")||'<p class="muted">No documents yet.</p>')+
   '</section><section class="panel ae-mgmt-panel"><h2>Support history</h2>'+
   (tickets.map(t=>'<p class="ae-crm-item">'+escapeHtml(t.subject)+' <small>'+escapeHtml(t.status)+'</small></p>').join("")||'<p class="muted">No support requests.</p>')+'</section></div>';
  root.querySelector("#crm-back").onclick=customers;
  root.querySelector("#crm-edit").onclick=()=>customerForm(p,data.crmDetails||{});
  root.querySelector("#crm-enroll").onclick=async()=>{await navigateTo("course_enrollments");await enrollments(uid)};
  root.querySelector("#crm-order").onclick=async()=>{await navigateTo("orders");await ordersPage(uid,p.email)};
  root.querySelector("#crm-invite").onclick=async()=>{await navigateTo("orders");inviteForm({email:p.email})};
  root.querySelectorAll("[data-access]").forEach(b=>b.onclick=()=>changeAccess(b.dataset.access,uid,items,courses));
 }
 async function enrollments(prefill=""){
  const [people,catalog,enrolled]=await Promise.all([api("list_customers"),api("list_courses"),api("list_enrollments")]);
  if(!isCurrent("course_enrollments")&&!isCurrent("customer_profiles"))return;
  const users=people.items||[],courses=(catalog.items||[]).filter(c=>c.status==="published"),records=enrolled.items||[];
  root.innerHTML=head("Course enrollments","Grant course access, edit expiration dates, and review existing enrollments.")+
   '<div class="ae-mgmt-two"><section class="panel ae-mgmt-panel"><h2>Assign a course</h2>'+
   '<form id="ae-enrollment" class="ae-mgmt-form"><label>Customer<select name="userId" required>'+optionList(users,"Choose a customer",p=>p.id,p=>p.full_name||p.email).replace('value="'+escapeHtml(prefill)+'"','value="'+escapeHtml(prefill)+'" selected')+'</select></label>'+
   '<label>Course<select name="courseId" required>'+optionList(courses,"Choose a course",c=>c.id,c=>c.title)+'</select></label>'+
   '<label>Expiration date <span class="ae-form-hint">Leave empty to use the course default.</span><input name="expiresAt" type="date"></label>'+
   '<button class="btn" type="submit">Grant course access</button></form></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Access durations</h2><p>Trucking Pro and Freight Broker Training have a 60-day default. All other published courses have a 30-day default.</p>'+
   '<p>Every course access record can have its own expiration date, which you can change at any time.</p></section></div>'+
   '<section class="panel ae-mgmt-panel"><h2>Enrollment records</h2><div class="tablewrap"><table><thead><tr><th>Customer</th><th>Course</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead><tbody>'+
   records.map(e=>'<tr><td>'+escapeHtml(users.find(p=>p.id===e.user_id)?.email||e.user_id)+'</td><td>'+escapeHtml(courses.find(c=>c.id===e.course_id)?.title||e.course_id)+'</td><td>'+escapeHtml(e.expires_at&&new Date(e.expires_at)<=new Date()?"Expired":e.status)+'</td><td>'+formatDate(e.expires_at)+'</td><td><button class="ae-inline-btn" data-edit-access="'+escapeHtml(e.id)+'">Manage</button></td></tr>').join("")+'</tbody></table></div></section>';
  if(prefill){const select=root.querySelector('select[name="userId"]');select.value=prefill}
  onSubmit("#ae-enrollment",async fd=>{
   const payload=Object.fromEntries(fd);
   if(payload.expiresAt)payload.expiresAt=new Date(payload.expiresAt+"T23:59:59Z").toISOString();
   const res=await api("enroll",payload);
   notify(res.updated?"Existing course access updated":"Course access granted");
   await enrollments(prefill);
  });
  root.querySelectorAll("[data-edit-access]").forEach(b=>b.onclick=()=>changeAccess(b.dataset.editAccess,null,records,new Map(courses.map(c=>[c.id,c]))));
 }
 async function changeAccess(id,returnUid,records,courses){
  const selected=records.find(e=>e.id===id);if(!selected)return;
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
 async function ordersPage(prefillUser="",prefillEmail=""){
  const [customers,orders,catalog]=await Promise.all([api("list_customers"),api("list_orders"),api("list_prices")]);
  if(!isCurrent("orders")&&!isCurrent("customer_profiles"))return;
  const people=customers.items||[],records=orders.items||[],prices=(catalog.items||[]).filter(p=>p.active&&p.price_key.startsWith("offering."));
  root.innerHTML=head("Orders and purchases","Create pending orders, review purchase history, and send customer invitations.")+
   '<div class="ae-mgmt-two"><section class="panel ae-mgmt-panel"><h2>Create an order</h2><p class="muted">Manual orders remain pending until payment is verified. This does not charge the customer.</p>'+
   '<form id="ae-create-order" class="ae-mgmt-form"><label>Customer<select name="userId" required>'+optionList(people,"Choose a customer",p=>p.id,p=>p.full_name||p.email)+'</select></label>'+
   '<label>Offering<select name="priceKey" required>'+optionList(prices,"Choose a product or service",p=>p.price_key,p=>p.label+" — "+money(p.amount))+'</select></label>'+
   '<div class="ae-mgmt-actions"><button class="btn" type="submit">Create pending order</button></div></form></section>'+
   '<section class="panel ae-mgmt-panel"><h2>Account invitations</h2><p>Send an account invitation after recording an order. Invites use a secure, single-use link.</p><button class="btn secondary" id="ae-invite-from-orders">Send invitation</button></section></div>'+
   '<section class="panel ae-mgmt-panel"><h2>All orders</h2><div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>'+
   records.map(o=>'<tr><td><strong>'+escapeHtml(o.order_number)+'</strong></td><td>'+escapeHtml(o.customer_email)+'</td><td>'+money(o.total)+'</td><td><span class="pill '+escapeHtml(o.status)+'">'+escapeHtml(o.status)+'</span></td><td>'+formatDate(o.created_at)+'</td><td><button class="ae-inline-btn" type="button" data-order-invite="'+escapeHtml(o.id)+'" data-order-email="'+escapeHtml(o.customer_email)+'">Invite customer</button></td></tr>').join("")+'</tbody></table></div></section>';
  const customerSelect=root.querySelector('#ae-create-order [name="userId"]');
  if(prefillUser)customerSelect.value=prefillUser;
  onSubmit("#ae-create-order",async fd=>{
   const uid=String(fd.get("userId")||"");const p=people.find(x=>x.id===uid);
   if(!p)throw Error("Choose a valid customer");
   const parts=String(p.full_name||"").trim().split(/\s+/);
   const result=await api("create_order",{userId:uid,email:p.email,firstName:parts.shift()||"",lastName:parts.join(" "),phone:p.phone||"",priceKey:fd.get("priceKey")});
   notify("Pending order "+result.orderNumber+" created");
   await ordersPage(uid,p.email);
  });
  root.querySelector("#ae-invite-from-orders").onclick=()=>inviteForm({email:prefillEmail||""});
  root.querySelectorAll("[data-order-invite]").forEach(button=>button.onclick=()=>inviteForm({email:button.dataset.orderEmail,orderId:button.dataset.orderInvite}));
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
