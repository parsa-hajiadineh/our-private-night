(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fa = new Intl.NumberFormat('fa-IR');
  const API_HEADERS = {'Content-Type':'application/json','X-Requested-With':'wedding-invitation'};
  let config = null, selectedFiles = [], sending = false;
  let guestKey;
  try {guestKey=localStorage.getItem('wedding-guest-key');if(!guestKey){guestKey=Array.from(crypto.getRandomValues(new Uint8Array(16)), n=>n.toString(16).padStart(2,'0')).join('').replace(/-/g,'');localStorage.setItem('wedding-guest-key',guestKey);}}catch{guestKey=Array.from(crypto.getRandomValues(new Uint8Array(16)), n=>n.toString(16).padStart(2,'0')).join('').replace(/-/g,'');}
  async function api(url, body) {
    const response = await fetch(url,body?{method:'POST',headers:API_HEADERS,body:JSON.stringify(body)}:{});
    const data = await response.json();if(!response.ok)throw Error(data.error||'دوباره تلاش کنید.');return data;
  }
  function status(form,message,bad=false){const el=form.querySelector('.form-status');el.textContent=message;el.classList.toggle('error',bad);}
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
  // Audio starts only inside a real guest gesture; an explicit pause is respected.
  const audio=$('wedding-music'),music=$('music-toggle');let manualPause=false,started=false,starting=false;
  audio.volume=.24;
  function reflectMusic(){const playing=!audio.paused;music.classList.toggle('playing',playing);music.setAttribute('aria-pressed',String(playing));music.setAttribute('aria-label',playing?'قطع موسیقی':'پخش موسیقی');$('music-label').textContent=playing?'در حال پخش':'موسیقی';}
  async function startMusic(){if(manualPause||started||starting)return;starting=true;try{await audio.play();started=true;reflectMusic();}catch{}finally{starting=false;}}
  const gesture=e=>{if(!e.target.closest('#music-toggle'))startMusic();};
  document.addEventListener('pointerdown',gesture,{passive:true});document.addEventListener('click',gesture);document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key))gesture(e);});
  music.addEventListener('click',async()=>{if(!audio.paused){manualPause=true;audio.pause();}else{manualPause=false;try{await audio.play();started=true;}catch{toast('برای پخش موسیقی دوباره لمس کنید.');}}reflectMusic();});
  audio.addEventListener('pause',reflectMusic);audio.addEventListener('play',reflectMusic);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!audio.paused){audio.pause();music.dataset.resume='yes';}else if(!document.hidden&&music.dataset.resume==='yes'&&!manualPause){delete music.dataset.resume;audio.play().catch(()=>{});}});
  async function loadConfig(){
    try{config=await api('/api/config');
      if(config.photoUrl){const image=$('couple-photo');image.onload=()=>{image.hidden=false;$('portrait-frame').classList.add('has-photo');};image.src=config.photoUrl;}
      if(config.mapUrl)$('map-link').href=config.mapUrl;
      const deadline=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',weekday:'long',day:'numeric',month:'long'}).format(new Date(config.rsvpDeadline));$('deadline-label').textContent=deadline;
      if(!config.rsvpOpen){$('rsvp-form').querySelectorAll('input,textarea,select,button').forEach(e=>e.disabled=true);status($('rsvp-form'),'مهلت اعلام حضور تمام شده؛ لطفاً مستقیم با ما هماهنگ کنید.');}
      if(config.publicBaseUrl){$('guest-qr').src='/api/qr.svg';$('album-qr').hidden=false;}
    }catch{toast('ارتباط با سرور برقرار نشد؛ فرم‌ها را کمی بعد امتحان کنید.');}
  }
  $('copy-address').addEventListener('click',async()=>{const address=config?.address||'سهیلیه، زکی‌آباد، خیابان ارغوان ۱';try{await navigator.clipboard.writeText(address);toast('نشانی کپی شد.');}catch{toast(address);}});
  $('rsvp-form').addEventListener('change',e=>{if(e.target.name==='attending'){$('guest-count-label').hidden=e.target.value==='no';}});
  $('rsvp-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;const b=Object.fromEntries(new FormData(form));b.guestKey=guestKey;try{const result=await api('/api/rsvp',b);status(form,result.message);try{localStorage.setItem('wedding-rsvp-name',b.name);}catch{}button.textContent='به‌روزرسانی پاسخ';}catch(err){status(form,err.message,true);}finally{button.disabled=false;}});
  async function loadNotes(){try{const data=await api('/api/notes');const wall=$('guest-notes');wall.replaceChildren();for(const note of data.items){const card=document.createElement('blockquote');const message=document.createElement('p');message.textContent=note.message;const author=document.createElement('cite');author.textContent=note.name;card.append(message,author);wall.append(card);}}catch{}}
  $('note-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;try{await api('/api/notes',Object.fromEntries(new FormData(form)));status(form,'یادگاری‌تان رسید؛ پس از تأیید، در دفترمان دیده می‌شود.');form.reset();}catch(err){status(form,err.message,true);}finally{button.disabled=false;}});
  async function loadGallery(){try{const data=await api('/api/gallery');const gallery=$('guest-gallery');gallery.replaceChildren();$('gallery-empty').hidden=data.items.length>0;for(const item of data.items){const figure=document.createElement('figure');const media=document.createElement(item.mime.startsWith('video/')?'video':'img');media.src=item.url;if(media.tagName==='VIDEO'){media.controls=true;media.preload='metadata';media.playsInline=true;}else{media.alt=item.caption||'عکس مهمانی از '+item.name;media.loading='lazy';}const caption=document.createElement('figcaption');caption.textContent=[item.name,item.caption].filter(Boolean).join(' · ');figure.append(media,caption);gallery.append(figure);}}catch{}}
  $('media-files').addEventListener('change',e=>{selectedFiles=Array.from(e.target.files||[]);const list=$('selected-files');list.replaceChildren();selectedFiles.forEach(f=>{const li=document.createElement('li');li.textContent=f.name+' · '+fa.format(Math.round(f.size/1024/1024*10)/10)+' مگابایت';list.append(li);});});
  function uploadOne(file,fields,onProgress){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/upload');xhr.setRequestHeader('X-Requested-With','wedding-invitation');xhr.timeout=180000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{return reject(Error('پاسخ سرور قابل خواندن نیست.'));}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(Error(data.error||'ارسال انجام نشد.'));};xhr.onerror=()=>reject(Error('ارتباط قطع شد؛ فایل‌های باقی‌مانده را دوباره ارسال کنید.'));xhr.ontimeout=()=>reject(Error('ارسال زمان زیادی برد؛ دوباره تلاش کنید.'));const body=new FormData();body.append('name',fields.name);body.append('caption',fields.caption);body.append('publicConsent',fields.publicConsent?'true':'false');body.append('file',file);xhr.send(body);});}
  $('upload-form').addEventListener('submit',async e=>{
    e.preventDefault();if(sending)return;const form=e.currentTarget,button=form.querySelector('[type=submit]');
    if(!selectedFiles.length){status(form,'عکس یا فیلم انتخاب کنید.',true);return;}
    if(selectedFiles.length>10){status(form,'هر بار حداکثر ۱۰ فایل انتخاب کنید.',true);return;}
    const tooBig=selectedFiles.find(f=>f.size>(config?.maxFileBytes||80*1024*1024));if(tooBig){status(form,'حجم «'+tooBig.name+'» بیشتر از ۸۰ مگابایت است.',true);return;}
    const fields=Object.fromEntries(new FormData(form));fields.publicConsent=!!fields.publicConsent;
    const batch=selectedFiles.slice();let uploaded=0;sending=true;button.disabled=true;$('upload-progress').hidden=false;
    try{for(const file of batch){status(form,'در حال ارسال '+fa.format(uploaded+1)+' از '+fa.format(batch.length)+'…');await uploadOne(file,fields,p=>$('upload-progress').value=(uploaded+p)/batch.length*100);uploaded++;selectedFiles.shift();}
      status(form,fields.publicConsent?'همه فایل‌ها به دستمان رسید؛ بعد از تأیید ما در آلبوم نمایش داده می‌شوند.':'همه فایل‌ها به دستمان رسید و فقط برای خودمان می‌مانند.');form.reset();$('selected-files').replaceChildren();$('upload-progress').value=100;
    }catch(err){status(form,(uploaded?fa.format(uploaded)+' فایل رسید. ':'')+err.message,true);$('selected-files').replaceChildren(...selectedFiles.map(f=>{const li=document.createElement('li');li.textContent=f.name+' — در انتظار ارسال';return li;}));}
    finally{sending=false;button.disabled=false;}
  });
  addEventListener('beforeunload',e=>{if(sending){e.preventDefault();e.returnValue='';}});
  loadConfig();loadNotes();loadGallery();
  try{const name=localStorage.getItem('wedding-rsvp-name');if(name)document.querySelectorAll('.guest-form input[name=name]').forEach(i=>i.value=name);}catch{}
})();
