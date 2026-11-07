/* Shared unsaved-change protection for management editors.
   Internal navigation: Save changes / Stay editing / Discard changes.
   Browser closing/reloading uses the browser's native warning (custom dialogs are not permitted).
*/
export function createUnsavedGuard(){
 let active=null,dirty=false,dialogOpen=false;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const hasChanges=()=>!!active&&dirty&&active.root?.isConnected;
 function watch(root,{title='this editor',save=null}={}){
   if(!root)return;
   active={root,title,save};dirty=false;
   const flag=e=>{if(active?.root!==root)return;if(e.target.closest?.('[data-unsaved-ignore]'))return;dirty=true;root.classList.add('ae-has-unsaved')};
   root.addEventListener('input',flag);root.addEventListener('change',flag);
 }
 function mark(){if(!active?.root?.isConnected)return;dirty=true;active.root.classList.add('ae-has-unsaved')}
 function clean(){dirty=false;active?.root?.classList.remove('ae-has-unsaved')}
 function clear(){active=null;dirty=false}
 function prompt(){
  return new Promise(resolve=>{
   if(dialogOpen)return resolve('stay');dialogOpen=true;
   const el=document.createElement('div');el.className='ae-unsaved-backdrop';
   el.innerHTML='<section class="ae-unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ae-unsaved-title" aria-describedby="ae-unsaved-desc"><div class="ae-unsaved-brand"><span class="ae-unsaved-monogram">AE</span><span>ANDRE ERVING <small>MANAGEMENT PORTAL</small></span></div><div class="ae-unsaved-warning">!</div><h2 id="ae-unsaved-title">You have unsaved changes</h2><p id="ae-unsaved-desc">Your edits to <strong>'+escape(active?.title||'this editor')+'</strong> will be lost if you leave without saving.</p><p class="ae-unsaved-message" id="ae-unsaved-message" role="status" aria-live="polite"></p><div class="ae-unsaved-actions"><button type="button" data-choice="stay">Stay editing</button><button type="button" data-choice="discard" class="ae-unsaved-discard">Leave without saving</button><button type="button" data-choice="save" class="ae-unsaved-save">Save and leave</button></div></section>';
   document.body.append(el);
   const done=choice=>{dialogOpen=false;el.remove();document.removeEventListener('keydown',key);resolve(choice)};
   const key=e=>{if(e.key==='Escape'){e.preventDefault();done('stay')}};
   document.addEventListener('keydown',key);
   el.querySelector('[data-choice="stay"]').onclick=()=>done('stay');
   el.querySelector('[data-choice="discard"]').onclick=()=>done('discard');
   const saveButton=el.querySelector('[data-choice="save"]');
   if(typeof active?.save!=='function'){saveButton.disabled=true;saveButton.title='Save from the editor before leaving'}
   saveButton.onclick=async()=>{
    if(!active?.save)return;
    const buttons=[...el.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    const status=el.querySelector('#ae-unsaved-message');status.textContent='Saving your changes…';
    try{
      const ok=await active.save();
      if(ok!==true)throw Error('The editor did not confirm a successful save. Your changes remain here.');
      clean();done('save');
    }catch(error){status.textContent=error.message||'Could not save changes.';buttons.forEach(b=>b.disabled=false)}
   };
   el.querySelector('[data-choice="stay"]').focus();
  });
 }
 async function confirm(){if(!hasChanges())return true;const choice=await prompt();if(choice==='stay')return false;if(choice==='discard'){clean();return true}return choice==='save'}
 window.addEventListener('beforeunload',e=>{if(!hasChanges())return;e.preventDefault();e.returnValue=''});
 return {watch,mark,clean,clear,confirm,isDirty:hasChanges};
}
