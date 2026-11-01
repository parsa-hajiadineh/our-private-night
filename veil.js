(() => {
  'use strict';
  const layer=document.getElementById('veil-layer');if(!layer)return;
  const sheet=document.getElementById('veil-sheet'),prompt=layer.querySelector('.veil-prompt'),hero=layer.closest('.hero');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A continuous mass-spring cloth: neighboring vertices share constraints.
  // No translated image tiles, seams, external downloads or animation library.
  const css=document.createElement('style');css.textContent=`
  #veil-sheet{inset:0;background:none;backdrop-filter:none;filter:none!important;transform:none!important;opacity:1!important}
  #veil-sheet>img,#veil-sheet>.veil-weave{display:none}
  .veil-cloth-canvas{display:block;width:100%;height:100%;pointer-events:none}
  .veil-covered .hero-type{opacity:.12!important;filter:blur(1px)}
  #veil-layer .veil-prompt{top:38%;transition:opacity .25s;text-shadow:0 1px 12px #fff,0 0 24px #fff}
  #veil-layer.dragging .veil-prompt{opacity:0!important}
  `;document.head.append(css);
  const canvas=document.createElement('canvas');canvas.className='veil-cloth-canvas';canvas.setAttribute('aria-hidden','true');sheet.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
  const nx=48,ny=64,points=[],links=[];let w=0,h=0,raf=0,last=0,clock=0,grab=null,opening=0,opened=false,dragDistance=0;
  function setup(){
    w=layer.clientWidth;h=layer.clientHeight;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    points.length=links.length=0;
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
      const u=x/nx,v=y/ny,px=u*(w+30)-15,py=v*(h+18)-8;
      const z=Math.sin(u*Math.PI*9)*9+Math.sin(u*17+v*3)*5;
      points.push({x:px,y:py,z,ox:px,oy:py,oz:z,rx:px,ry:py,rz:z,u,v});
    }
    function link(a,b){const p=points[a],q=points[b];links.push({a,b,length:Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)});}
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const i=y*(nx+1)+x;if(x<nx)link(i,i+1);if(y<ny)link(i,i+nx+1);if(x<nx&&y<ny){link(i,i+nx+2);link(i+1,i+nx+1);}}
  }
  function pin(){if(!grab)return;const p=points[grab.index];p.x=grab.x;p.y=grab.y;p.z=grab.z;}
  function step(){
    clock+=1/60;
    for(const p of points){
      const vx=(p.x-p.ox)*.91,vy=(p.y-p.oy)*.91,vz=(p.z-p.oz)*.89;p.ox=p.x;p.oy=p.y;p.oz=p.z;
      const home=opening?0:.009;
      p.x+=vx+(p.rx-p.x)*home;p.y+=vy+(p.ry-p.y)*home+(opening?-1.2:0);p.z+=vz+(p.rz-p.z)*.012;
      if(!reduced&&!grab&&!opening)p.z+=Math.sin(clock*1.1+p.u*9+p.v*3)*.045;
      if(opening){p.x+=opening*.65;p.y-=1.8;}
    }
    for(let pass=0;pass<5;pass++){
      for(const l of links){const a=points[l.a],b=points[l.b];let dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const distance=Math.hypot(dx,dy,dz)||1;const force=(distance-l.length)/distance*.45;a.x+=dx*force;a.y+=dy*force;a.z+=dz*force;b.x-=dx*force;b.y-=dy*force;b.z-=dz*force;}
      if(!opening)for(let x=0;x<=nx;x++){const p=points[x];p.x+=(p.rx-p.x)*.8;p.y+=(p.ry-p.y)*.8;}
      pin();
    }
  }
  function project(p){return {x:p.x+(p.x-w/2)*p.z/1600,y:p.y+(p.y-h/2)*p.z/1600};}
  function render(){
    ctx.clearRect(0,0,w,h);const projected=points.map(project);
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const i=y*(nx+1)+x,ids=[i,i+1,i+nx+2,i+nx+1],p=points[i],q=points[i+1];
      const slope=(q.z-p.z)/(w/nx);const fold=.5+.5*Math.sin(x/nx*29+p.v*2+slope*.8);
      ctx.beginPath();ids.forEach((id,k)=>{const t=projected[id];if(k)ctx.lineTo(t.x,t.y);else ctx.moveTo(t.x,t.y);});ctx.closePath();
      ctx.fillStyle=`rgba(255,253,249,${Math.min(.69,.27+fold*.30+Math.abs(slope)*.09)})`;ctx.fill();
      // Threads run through shared edges, staying attached while the mesh folds.
      const a=projected[i],b=projected[i+1],c=projected[i+nx+1],d=projected[i+nx+2];
      ctx.strokeStyle='rgba(255,255,255,.24)';ctx.lineWidth=.45;ctx.beginPath();
      for(let t=0;t<1;t+=.5){ctx.moveTo(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);ctx.lineTo(c.x+(d.x-c.x)*t,c.y+(d.y-c.y)*t);ctx.moveTo(a.x+(c.x-a.x)*t,a.y+(c.y-a.y)*t);ctx.lineTo(b.x+(d.x-b.x)*t,b.y+(d.y-b.y)*t);}ctx.stroke();
    }
    // A continuous fine rolled hem along the free lower edge.
    ctx.beginPath();for(let x=0;x<=nx;x++){const p=projected[ny*(nx+1)+x];if(x)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.2;ctx.stroke();
  }
  function tick(time){raf=0;if(layer.hidden||document.hidden)return;if(!last||time-last>=30){step();render();last=time;}if(!reduced||grab||opening)raf=requestAnimationFrame(tick);}
  function wake(){if(!raf){last=0;raf=requestAnimationFrame(tick);}}
  let hideTimer;
  function open(direction=-1){if(opened)return;opened=true;opening=direction;grab=null;prompt.style.opacity='0';layer.style.pointerEvents='none';hero.classList.remove('veil-covered');try{sessionStorage.setItem('wedding-veil-open','yes');}catch{}
    if(reduced){layer.hidden=true;return;}wake();hideTimer=setTimeout(()=>{layer.hidden=true;if(raf)cancelAnimationFrame(raf);raf=0;},1600);
    if(document.activeElement===document.getElementById('veil-skip'))document.querySelector('.open-invitation')?.focus({preventScroll:true});
  }
  layer.addEventListener('pointerdown',e=>{if(opened||e.target.closest('button')||grab)return;const r=layer.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let index=0,best=Infinity;points.forEach((p,i)=>{const d=Math.hypot(p.x-x,p.y-y);if(d<best){best=d;index=i;}});grab={index,id:e.pointerId,x,y,z:points[index].z,startX:x,startY:y};dragDistance=0;layer.setPointerCapture(e.pointerId);layer.classList.add('dragging');wake();});
  layer.addEventListener('pointermove',e=>{if(!grab||grab.id!==e.pointerId)return;const r=layer.getBoundingClientRect();grab.x=e.clientX-r.left;grab.y=e.clientY-r.top;dragDistance=Math.hypot(grab.x-grab.startX,grab.y-grab.startY);grab.z=Math.min(120,dragDistance*.55);prompt.style.opacity=String(Math.max(0,1-dragDistance/50));wake();});
  function release(e){if(!grab||e.pointerId!==grab.id)return;const direction=grab.x<grab.startX?-1:1;grab=null;layer.classList.remove('dragging');if(e.type!=='pointercancel'&&dragDistance>Math.min(w*.32,150))open(direction);else{prompt.style.opacity='1';wake();}}
  layer.addEventListener('pointerup',release);layer.addEventListener('pointercancel',release);layer.addEventListener('lostpointercapture',release);
  document.getElementById('veil-skip').addEventListener('click',()=>open(-1));
  const replay=document.createElement('button');replay.type='button';replay.className='veil-replay';replay.textContent='نمایش دوباره تور ↺';document.querySelector('footer .back-top').before(replay);
  replay.addEventListener('click',()=>{clearTimeout(hideTimer);opened=false;opening=0;grab=null;layer.hidden=false;layer.style.pointerEvents='';prompt.style.opacity='1';hero.classList.add('veil-covered');setup();wake();hero.scrollIntoView({behavior:reduced?'instant':'smooth'});});
  let seen=false;try{seen=sessionStorage.getItem('wedding-veil-open')==='yes';}catch{}
  layer.hidden=!!(seen||(location.hash&&location.hash!=='#top')||new URLSearchParams(location.search).has('from'));
  if(!layer.hidden){hero.classList.add('veil-covered');setup();wake();}
  new ResizeObserver(()=>{if(!layer.hidden){grab=null;setup();wake();}}).observe(layer);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake();});
})();
