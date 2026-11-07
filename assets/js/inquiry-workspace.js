
const inquiryEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inquiryDate=v=>v?new Date(v).toLocaleString('en-US',{dateStyle:'long',timeStyle:'short'}):'Not provided';
const inquiryPairs=r=>[['Name',r.name],['Email',r.email],['Phone',r.phone],['Inquiry type',r.interest],['Submitted',inquiryDate(r.created_at)],['Reference ID',r.id]].map(([k,v])=>[k,String(v??'').trim()||'Not provided']);
export function showInquiry(r){
 if(!r)return;
 document.querySelector('.ae-inquiry-overlay')?.remove();
 const overlay=document.createElement('div');overlay.className='ae-inquiry-overlay';
 const meta=inquiryPairs(r).map(([k,v])=>'<div class="ae-inquiry-info"><dt>'+inquiryEscape(k)+'</dt><dd>'+inquiryEscape(v)+'</dd></div>').join('');
 overlay.innerHTML='<section class="ae-inquiry-dialog" role="dialog" aria-modal="true" aria-labelledby="ae-inquiry-heading"><header><div><small>ANDRE ERVING / INQUIRIES</small><h2 id="ae-inquiry-heading">Visitor inquiry</h2><p>Complete submission details and message</p></div><button type="button" class="ae-inquiry-x" aria-label="Close inquiry">×</button></header><div class="ae-inquiry-content"><dl class="ae-inquiry-details">'+meta+'</dl><div class="ae-inquiry-message"><h3>Message from visitor</h3><p>'+inquiryEscape(r.message||'No message provided')+'</p></div></div><footer><button type="button" class="btn secondary ae-inquiry-close">Close</button><button type="button" class="btn ae-inquiry-pdf">Download PDF</button></footer></section>';
 document.body.append(overlay);const previous=document.activeElement;
 const close=()=>{overlay.remove();document.removeEventListener('keydown',key);previous?.focus?.()};
 const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const controls=[...overlay.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus()}}};
 document.addEventListener('keydown',key);
 overlay.onclick=e=>{if(e.target===overlay)close()};
 overlay.querySelector('.ae-inquiry-x').onclick=close;
 overlay.querySelector('.ae-inquiry-close').onclick=close;
 overlay.querySelector('.ae-inquiry-pdf').onclick=()=>downloadInquiryPDF(r,overlay.querySelector('.ae-inquiry-pdf'));
 overlay.querySelector('.ae-inquiry-x').focus();
}
export async function downloadInquiryPDF(r,button){
 if(!r)return;const label=button?.textContent;
 if(button){button.disabled=true;button.textContent='Preparing PDF…'}
 try{
  const {jsPDF}=await import('https://esm.sh/jspdf@2.5.2');
  const pdf=new jsPDF({format:'letter',unit:'pt',compress:true});
  const left=45,right=567,bottom=735;let y=45;
  const write=(t,x,y,size=11,bold=false,color=[17,43,76])=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(Array.isArray(t)?t:String(t),x,y)};
  const ensure=height=>{if(y+height>bottom){pdf.addPage();y=48}};
  try{
   const img=new Image();img.src=new URL('assets/img/logo.png',document.baseURI).href;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   canvas.getContext('2d').drawImage(img,0,0);let w=Math.min(200,img.naturalWidth),h=w*img.naturalHeight/img.naturalWidth;
   pdf.addImage(canvas.toDataURL('image/png'),'PNG',left,y,w,h);y+=Math.max(62,h+20);
  }catch{write('ANDRE ERVING',left,y+16,20,true);y+=65}
  pdf.setDrawColor(208,155,35);pdf.setLineWidth(2);pdf.line(left,y,right,y);y+=32;
  write('WEBSITE INQUIRY',left,y,18,true);y+=30;
  for(const [k,v]of inquiryPairs(r)){
   const lines=pdf.splitTextToSize(v,340);ensure(Math.max(29,lines.length*15+10));
   write(k.toUpperCase(),left,y,9,true,[99,118,145]);
   write(lines,left+165,y,10);y+=Math.max(29,lines.length*15+10);
  }
  y+=12;ensure(45);write('MESSAGE',left,y,12,true);y+=23;
  const paragraphs=String(r.message||'No message provided').replace(/\r\n?/g,'\n').split('\n');
  for(const paragraph of paragraphs){const lines=pdf.splitTextToSize(paragraph||' ',right-left);for(const line of lines){ensure(18);write(line,left,y,11);y+=18}y+=5}
  const pages=pdf.getNumberOfPages();
  for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setDrawColor(226,234,243);pdf.line(left,754,right,754);write('ANDRE ERVING  /  PRIVATE INQUIRY RECORD',left,770,8,false,[100,119,145]);write('Page '+i+' of '+pages,right-57,770,8,false,[100,119,145])}
  const name=String(r.name||'visitor').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,45);
  pdf.save('Andre-Erving-Inquiry-'+String(r.created_at||'').slice(0,10)+'-'+(name||'visitor')+'.pdf');
 }catch(err){console.error('PDF export error',err);alert('Could not prepare the inquiry PDF. Please retry.')}
 finally{if(button){button.disabled=false;button.textContent=label}}
}
