const LOGO="https://gnfyidajbectlppsekzj.supabase.co/storage/v1/object/public/Andre%20Erving%20Public/logos/logo2.png";
export const certificateEscape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function certificateMarkup(c,preview=false){
 const txt=certificateEscape;
 const color=/^#[0-9a-f]{6}$/i.test(c.accent_color||c.accentColor||"")?(c.accent_color||c.accentColor):"#D39A28";
 const issued=c.issued_at||c.issuedAt;
 const completed=c.completed_at||c.completedAt;
 const date=v=>v?new Date(v).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}):"Upon successful completion";
 const number=c.certificate_number||"Assigned when issued";
 return '<article class="ae-certificate" style="--certificate-accent:'+color+'" aria-label="Certificate of completion">'+
 '<div class="ae-certificate-border"><div class="ae-certificate-inner">'+
 '<div class="ae-certificate-brand"><img src="'+LOGO+'" alt="Andre Erving" crossorigin="anonymous"><span>GROWTH · STRATEGY · EDUCATION</span></div>'+
 '<div class="ae-certificate-emblem" aria-hidden="true">✦</div>'+
 '<div class="ae-certificate-eyebrow">ANDRE ERVING · PERSONAL & PROFESSIONAL DEVELOPMENT</div>'+
 '<h1>'+txt(c.heading||"CERTIFICATE OF COMPLETION")+'</h1>'+
 '<p class="ae-certificate-subtitle">'+txt(c.subtitle||"This certificate is proudly presented to")+'</p>'+
 '<div class="ae-certificate-student">'+txt(c.student_name||c.studentName||"Student Full Name")+'</div>'+
 '<div class="ae-certificate-rule"></div>'+
 '<p class="ae-certificate-description">'+txt(c.completion_text||c.completionText||"In recognition of successfully completing the requirements of")+'</p>'+
 '<h2>'+txt(c.course_title||c.courseTitle||"Course Title")+'</h2>'+
 '<div class="ae-certificate-bottom"><div class="ae-certificate-detail"><span>'+txt(date(completed))+'</span><small>DATE COMPLETED</small></div>'+
 '<div class="ae-certificate-signature"><strong>'+txt(c.instructor_name||c.instructorName||"Andre Erving")+'</strong><span></span><small>'+txt(c.instructor_title||c.instructorTitle||"Instructor")+'</small></div>'+
 '<div class="ae-certificate-detail"><span>'+txt(number)+'</span><small>CERTIFICATE NUMBER</small></div></div>'+
 '<footer><span>© '+new Date().getFullYear()+' Andre Erving, LLC</span><span>'+(preview?'TEMPLATE PREVIEW':'ISSUED '+txt(date(issued)).toUpperCase())+'</span></footer>'+
 '</div></div></article>';
}
export async function downloadCertificate(element,fileName){
 if(!element)throw Error("Certificate preview unavailable");
 await document.fonts.ready;
 const [{jsPDF},html2canvasModule]=await Promise.all([
  import("https://esm.sh/jspdf@2.5.2"),
  import("https://esm.sh/html2canvas@1.4.1")
 ]);
 const html2canvas=html2canvasModule.default;
 const clone=element.cloneNode(true);
 clone.style.width="1120px";
 clone.style.height="792px";
 clone.style.maxWidth="none";
 clone.style.margin="0";
 const shell=document.createElement("div");
 shell.style.cssText="position:fixed;left:-12000px;top:0;width:1120px;height:792px;z-index:-1;";
 shell.append(clone);document.body.append(shell);
 try{
  await Promise.all([...clone.querySelectorAll("img")].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve})));
  const canvas=await html2canvas(clone,{scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false,width:1120,height:792});
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4",compress:true});
  pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,297,210,undefined,"FAST");
  pdf.save(String(fileName||"certificate").replace(/[^a-zA-Z0-9_.-]/g,"-")+".pdf");
 }finally{shell.remove()}
}
