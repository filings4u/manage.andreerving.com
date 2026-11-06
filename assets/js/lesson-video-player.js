/**
 * Narrated motion-slide course player.
 * Combines the lesson's authenticated narration and visual, with synchronized scene cards.
 * This is a browser-rendered presentation; it is not represented as an uploaded MP4.
 */
export function mountNarratedLessonVideo(host,{title,number,artworkUrl,audioUrl,sections=[],headings=[]}){
  if(!host||!audioUrl)return;
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const realSections=sections.map((body,i)=>({eyebrow:'MODULE LESSON · SECTION '+String(i+1).padStart(2,'0'),headline:clean(headings[i]||'Lesson section '+(i+1)),copy:clean(body)})).filter(x=>x.copy||x.headline);
  const scenes=[{eyebrow:'ANDRE ERVING · FREIGHT BROKER TRAINING',headline:clean(title),copy:'Lesson '+number+' · Learn the process. Practice the skill.'},...realSections];
  // Relative lengths approximate segment speech timing. Each section is recorded
  // separately, with a heading and inserted silence before the next section.
  const weights=scenes.map((scene,i)=>i===0?24:Math.max(35,(scene.headline.length+scene.copy.length)+35));
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  const cuts=[];let running=0;for(const weight of weights){running+=weight;cuts.push(running/totalWeight)}
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  host.classList.add('rc-video-host');
  host.innerHTML='<div class="rc-video-stage" tabindex="0" role="group" aria-label="'+esc(title)+' narrated video lesson">'+
    '<div class="rc-video-art" style="background-image:url(\''+esc(artworkUrl||'')+'\')"></div>'+
    '<div class="rc-video-tint"></div>'+
    '<div class="rc-video-scene"><div class="rc-video-eyebrow"></div><h2></h2><p></p></div>'+
    '<button class="rc-video-overlay-play" type="button" aria-label="Play narrated video">▶</button>'+
    '<div class="rc-video-controls"><button type="button" data-action="play" aria-label="Play or pause video">▶</button>'+
    '<span class="rc-video-time">0:00 / 0:00</span><input class="rc-video-seek" aria-label="Video progress" type="range" min="0" max="1000" value="0">'+
    '<button type="button" data-action="mute" aria-label="Mute narration">♫</button>'+
    '<button type="button" data-action="captions" aria-label="Toggle captions" aria-pressed="true">CC</button>'+
    '<button type="button" data-action="fullscreen" aria-label="Fullscreen video">⛶</button></div></div>';
  const stage=host.querySelector('.rc-video-stage'),audio=new Audio();
  audio.src=audioUrl;audio.preload='metadata';audio.controls=false;
  const eyebrow=stage.querySelector('.rc-video-eyebrow'),heading=stage.querySelector('h2'),copy=stage.querySelector('.rc-video-scene p');
  const play=stage.querySelector('[data-action="play"]'),overlay=stage.querySelector('.rc-video-overlay-play'),seek=stage.querySelector('input'),time=stage.querySelector('.rc-video-time');
  const sceneEl=stage.querySelector('.rc-video-scene');
  let active=-1,showCaptions=true;
  const fmt=n=>{if(!Number.isFinite(n))return '0:00';const t=Math.floor(n);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
  function render(){
    const duration=Number.isFinite(audio.duration)?audio.duration:0;
    const ratio=duration>0?Math.min(1,audio.currentTime/duration):0;
    seek.value=String(Math.round(ratio*1000));
    time.textContent=fmt(audio.currentTime)+' / '+fmt(duration);
    const next=Math.max(0,cuts.findIndex(c=>ratio<c)===-1?scenes.length-1:cuts.findIndex(c=>ratio<c));
    if(next!==active){active=next;const s=scenes[next];eyebrow.textContent=s.eyebrow;heading.textContent=s.headline;copy.textContent=s.copy;stage.dataset.scene=String(next)}
    copy.hidden=!showCaptions;
    play.textContent=audio.paused?'▶':'❚❚';
    overlay.hidden=!audio.paused&&!!audio.currentTime;
    overlay.textContent=audio.currentTime?'▶':'▶';
  }
  const onOtherAudio=e=>{if(e.target!==audio&&e.target instanceof HTMLAudioElement)audio.pause()};
  document.addEventListener('play',onOtherAudio,true);
  const toggle=()=>{if(audio.paused){document.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause()});audio.play().catch(()=>{})}else audio.pause()};
  stage.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{
    switch(b.dataset.action){
      case 'play':toggle();break;
      case 'mute':audio.muted=!audio.muted;b.textContent=audio.muted?'⊘':'♫';break;
      case 'captions':showCaptions=!showCaptions;b.setAttribute('aria-pressed',String(showCaptions));render();break;
      case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen?.();else stage.requestFullscreen?.();break;
    }
  });
  overlay.onclick=toggle;
  seek.oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Number(seek.value)/1000*audio.duration};
  stage.onkeydown=e=>{if(e.target===stage&&(e.key===' '||e.key==='Enter')){e.preventDefault();toggle()}};
  ['timeupdate','durationchange','loadedmetadata','play','pause','ended','seeked'].forEach(event=>audio.addEventListener(event,render));
  render();
  return {pause(){audio.pause()},destroy(){document.removeEventListener('play',onOtherAudio,true);audio.pause();audio.removeAttribute('src');audio.load();host.replaceChildren()}};
}
