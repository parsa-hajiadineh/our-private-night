'use strict';
const fs=require('node:fs');
const path=require('node:path');
const PDFDocument=require('pdfkit');
const {ZipFile}=require('yazl');
const bidi=require('bidi-js')();
const statusNames={pending:'در انتظار تأیید',approved:'منتشرشده',rejected:'خصوصی / ردشده'};
const fa=new Intl.NumberFormat('fa-IR');
const date=value=>new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'}).format(new Date(value));

// Keep logical Unicode text for shaping, and reorder directional runs visually.
function runs(text){
  const embedding=bidi.getEmbeddingLevels(text,'rtl'),groups=[],owners=[],directions=[];
  for(let i=0;i<text.length;i++){if(!i||embedding.levels[i]!==embedding.levels[i-1]){groups.push('');directions.push(embedding.levels[i]%2?'rtl':'ltr');}groups[groups.length-1]+=text[i];owners.push(groups.length-1);}
  for(const [a,b] of bidi.getReorderSegments(text,embedding))for(let i=a,j=b;i<j;i++,j--)[owners[i],owners[j]]=[owners[j],owners[i]];
  return [...new Set(owners)].map(i=>({text:groups[i],direction:directions[i]}));
}
function guestbookPdf(res,notes,root){
  const doc=new PDFDocument({size:'A5',margin:0,info:{Title:'Parsa & Saba - Guestbook',Author:'Parsa & Saba'},compress:true});
  doc.registerFont('Body',path.join(root,'assets/vazirmatn-pdf.ttf'));
  doc.registerFont('Title',path.join(root,'assets/nastaliq-veil.ttf'));
  doc.registerFont('Emoji',path.join(root,'assets/noto-emoji-pdf.ttf'));
  const width=doc.page.width,height=doc.page.height,left=34,right=width-34,content=width-68;let page=0,y=0;
  function line(text,top,size=11,color='#594332',font='Body',inset=0){
    const parts=runs(text).flatMap(run=>{
      const pieces=[];for(const {segment} of new Intl.Segmenter('fa',{granularity:'grapheme'}).segment(run.text)){
        const face=/\p{Extended_Pictographic}/u.test(segment)?'Emoji':font;
        if(pieces.at(-1)?.font===face)pieces.at(-1).text+=segment;else pieces.push({text:segment,font:face,direction:run.direction});
      }return run.direction==='rtl'?pieces.reverse():pieces;
    });
    // PDFKit delegates shaping to Fontkit; specify the Unicode run direction
    // explicitly so Persian numerals and Latin fragments retain their order.
    function shaped(part,action){doc.font(part.font).fontSize(size).fillColor(color);const face=doc._font.font,layout=face.layout;face.layout=function(text,features,script,language){return layout.call(this,text,features,script,language,part.direction);};try{return action();}finally{face.layout=layout;}}
    const sizes=parts.map(p=>shaped(p,()=>doc.widthOfString(p.text,{features:['kern']})));let x=right-inset-sizes.reduce((a,b)=>a+b,0);
    parts.forEach((p,i)=>{shaped(p,()=>doc.text(p.text,x,top,{lineBreak:false,features:['kern']}));x+=sizes[i];});
  }
  function base(cover=false){
    page++;doc.rect(0,0,width,height).fill('#f8f0e2');doc.rect(18,18,width-36,height-36).lineWidth(.6).stroke('#cbb396');
    doc.font('Helvetica').fontSize(8).fillColor('#98745b').text('PARSA & SABA',left,31,{width:content,align:'center',lineBreak:false,characterSpacing:2});
    doc.moveTo(left,height-40).lineTo(right,height-40).lineWidth(.5).stroke('#d8c3a5');
    line('یادگارِ شب ما',height-34,8,'#94745d');doc.font('Body').fontSize(8).text(fa.format(page),left,height-34,{lineBreak:false});
    if(!cover){line('چند خط که می‌ماند',59,20,'#72503d','Title');y=112;}
  }
  function next(){doc.addPage();base();}
  function wrap(text){
    doc.font('Body').fontSize(11);const result=[];
    for(const paragraph of text.replace(/\r/g,'').split('\n')){
      let current='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
        const candidate=current?current+' '+word:word;
        if(doc.widthOfString(candidate,{features:['kern']})<=content-28){current=candidate;continue;}
        if(current){result.push(current);current='';}
        for(const char of Array.from(word)){if(current&&doc.widthOfString(current+char,{features:['kern']})>content-28){result.push(current);current='';}current+=char;}
      }result.push(current);
    }return result;
  }
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Parsa-Saba-Guestbook.pdf"','Cache-Control':'private, no-store'});
  doc.on('error',()=>res.destroy());res.on('close',()=>{if(!res.writableFinished)doc.destroy();});doc.pipe(res);
  base(true);
  const photo=path.join(root,'assets/couple.jpg');
  if(fs.existsSync(photo)){
    const portrait=doc.openImage(photo),photoWidth=128,photoHeight=150,photoX=(width-photoWidth)/2,photoY=76;
    const scale=Math.max(photoWidth/portrait.width,photoHeight/portrait.height);
    doc.save().roundedRect(photoX,photoY,photoWidth,photoHeight,60).clip();
    doc.image(portrait,photoX+(photoWidth-portrait.width*scale)/2,photoY+(photoHeight-portrait.height*scale)*.35,{width:portrait.width*scale,height:portrait.height*scale});
    doc.restore();doc.roundedRect(photoX-4,photoY-4,photoWidth+8,photoHeight+8,64).lineWidth(.7).stroke('#c1a086');
  }
  line('حرف‌هایی برای همیشه',235,29,'#72503d','Title');
  line('دفتر یادگاری پارسا و صبا',318,14);line('پنجشنبه ۲۸ آبان ۱۴۰۵',352,11,'#94745d');
  line(fa.format(notes.length)+' یادگاری از آدم‌های این شب',405,11);
  for(const [index,note]of notes.entries()){
    const lines=wrap(note.message);if(y+92>height-62)next();if(page===1)next();
    let offset=0;
    while(offset<lines.length){
      const capacity=Math.max(1,Math.floor((height-64-y-67)/21)),slice=lines.slice(offset,offset+capacity),boxHeight=65+slice.length*21;
      doc.roundedRect(left,y,content,boxHeight,5).fillAndStroke('#fffbf3','#dfceb8');
      line((offset?'ادامه یادگاریِ ':'')+note.name,y+12,12,'#795441','Body',14);
      line(date(note.created_at)+' · '+statusNames[note.status],y+34,8,'#a1866d','Body',14);
      slice.forEach((text,i)=>line(text,y+58+i*21,11,'#594332','Body',14));
      offset+=slice.length;y+=boxHeight+16;if(offset<lines.length)next();
    }
  }
  if(!notes.length){next();line('هنوز یادگاری‌ای ثبت نشده است.',160,13);}
  doc.end();
}

async function albumZip(res,media,uploads){
  const zip=new ZipFile();let activeStream;
  const entries=await Promise.all(media.map(async(row,i)=>{
    const file=path.resolve(uploads,row.filename);
    if(path.dirname(file)!==path.resolve(uploads))throw Error('Invalid media path');
    const stat=await fs.promises.stat(file);if(!stat.isFile())throw Error('Missing media file');
    const name=String(i+1).padStart(4,'0')+'-'+row.id+path.extname(row.filename);
    return {row,file,stat,name};
  }));
  res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Parsa-Saba-Guest-Album.zip"','Cache-Control':'private, no-store'});
  zip.on('error',()=>res.destroy());zip.outputStream.on('error',()=>res.destroy());
  res.on('close',()=>{if(!res.writableFinished){activeStream?.destroy();zip.outputStream.destroy();}});
  zip.outputStream.pipe(res);
  const manifest=entries.map(({row,name})=>({file:'media/'+name,originalName:row.original_name,guest:row.name,caption:row.caption,status:row.status,publicConsent:!!row.public_consent,createdAt:row.created_at}));
  zip.addBuffer(Buffer.from(JSON.stringify({couple:'Parsa & Saba',items:manifest},null,2)),'album-index.json',{compress:false});
  zip.addBuffer(Buffer.from('آلبوم خصوصی پارسا و صبا\nهمه عکس‌ها و فیلم‌ها، شامل موارد خصوصی و در انتظار تأیید.\nمشخصات هر فایل در album-index.json قرار دارد.\n'),'راهنمای آلبوم.txt');
  for(const {file,stat,name}of entries)zip.addReadStreamLazy('media/'+name,{compress:false,size:stat.size,mtime:stat.mtime},callback=>{activeStream=fs.createReadStream(file);callback(null,activeStream);});
  zip.end();
}
module.exports={guestbookPdf,albumZip};
