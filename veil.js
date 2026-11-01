(() => {
  const layer = document.getElementById('veil-layer');
  if (!layer) return;
  let seen = false; try { seen = sessionStorage.getItem('wedding-veil-open') === 'yes'; } catch {}
  const sheet = document.getElementById('veil-sheet');
  const prompt = layer.querySelector('.veil-prompt');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const texture = sheet.querySelector('img');
  const mesh = document.createElement('div');mesh.className='cloth-mesh';
  const patches=[];const columns=16,rows=22;
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const patch=document.createElement('i');
    patch.style.cssText=`position:absolute;left:${x/columns*100}%;top:${y/rows*100}%;width:${100/columns+.2}%;height:${100/rows+.2}%;background-image:url("${texture.getAttribute('src')}");background-size:${columns*100}% ${rows*100}%;background-position:${x/(columns-1)*100}% ${y/(rows-1)*100}%;`;
    mesh.append(patch);patches.push({patch,x:(x+.5)/columns,y:(y+.5)/rows});
  }
  sheet.append(mesh);
  function deform(amount=1){
    const bounds=sheet.getBoundingClientRect();
    const px=origin?(origin.x-bounds.left)/bounds.width:.5,py=origin?(origin.y-bounds.top)/bounds.height:.5;
    for(const p of patches){const radius=Math.hypot((p.x-px)*bounds.width,(p.y-py)*bounds.height);const weight=Math.exp(-radius/170);p.patch.style.transform=`translate(${dx*weight*amount}px,${dy*weight*amount}px) rotate(${dx*weight*amount/70}deg)`;}
  }
  let origin = null, dx = 0, dy = 0, frame = 0, opened = false;
  const hero = layer.closest('.hero');
  const bypass = seen || (location.hash && location.hash !== '#top') || new URLSearchParams(location.search).has('from');
  layer.hidden = !!bypass;
  if (!bypass) hero.classList.add('veil-covered');
  function showDrag() {
    frame = 0;
    const distance = Math.hypot(dx, dy);
    const progress = Math.min(distance / Math.max(120, layer.clientWidth * .38), 1);
    deform();
    sheet.style.filter = `drop-shadow(${-dx*.08}px 12px 10px rgba(70,55,40,.12))`;
    prompt.style.opacity = String(Math.max(0,1-progress*3));
  }
  function open(direction = 1) {
    if (opened) return; opened = true;
    try { sessionStorage.setItem('wedding-veil-open','yes'); } catch {}
    layer.classList.add('veil-opening');
    hero.classList.remove('veil-covered');
    sheet.style.transition = reduced ? 'none' : 'transform 1.15s cubic-bezier(.3,.02,.2,1), opacity .85s ease';
    sheet.style.transform = `translate3d(${direction*115}%,-85%,0) rotate(${direction*24}deg) scale(.55,.8)`;
    sheet.style.opacity = '0'; prompt.style.opacity = '0'; layer.style.pointerEvents = 'none';
    const button = document.getElementById('veil-skip');
    if(document.activeElement===button) document.querySelector('.open-invitation').focus({preventScroll:true});
    setTimeout(() => { layer.hidden=true; }, reduced ? 0 : 1200);
  }
  layer.addEventListener('pointerdown', e => {
    if (opened || e.target.closest('button')) return;
    origin = {x:e.clientX,y:e.clientY,id:e.pointerId};dx=dy=0;
    layer.setPointerCapture(e.pointerId);sheet.style.transition='none';layer.classList.add('dragging');
  });
  layer.addEventListener('pointermove',e => {
    if(!origin || e.pointerId!==origin.id)return;
    dx=e.clientX-origin.x;dy=e.clientY-origin.y;
    if(!frame)frame=requestAnimationFrame(showDrag);
  });
  function release(e) {
    if(!origin || e.pointerId!==origin.id)return;
    layer.classList.remove('dragging');
    if(frame){cancelAnimationFrame(frame);frame=0;}
    if(e.type!=='pointercancel'&&Math.hypot(dx,dy)>Math.min(100,layer.clientWidth*.22))open(dx<0?-1:1);
    else{deform(0);sheet.style.filter='none';prompt.style.opacity='1';}
    origin=null;
  }
  layer.addEventListener('pointerup',release);layer.addEventListener('pointercancel',release);
  document.getElementById('veil-skip').addEventListener('click',()=>open(-1));
  const replay = document.createElement('button');
  replay.type='button'; replay.className='veil-replay'; replay.textContent='نمایش دوباره تور ↺';
  document.querySelector('footer .back-top').before(replay);
  replay.addEventListener('click',()=>{
    opened=false; origin=null; dx=dy=0;
    deform(0);
    layer.hidden=false; layer.classList.remove('veil-opening'); layer.style.pointerEvents='';
    sheet.style.transition='none'; sheet.style.transform='none'; sheet.style.opacity='1'; sheet.style.filter='none'; prompt.style.opacity='1';
    hero.classList.add('veil-covered'); hero.scrollIntoView({behavior:reduced?'instant':'smooth'});
  });
})();
