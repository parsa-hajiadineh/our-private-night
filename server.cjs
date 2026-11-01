'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Busboy = require('busboy');
const QRCode = require('qrcode');
const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, '.local'));
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'wedding.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS rsvps (id TEXT PRIMARY KEY, guest_hash TEXT UNIQUE, name TEXT NOT NULL, attending TEXT NOT NULL, guests INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, name TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, filename TEXT NOT NULL, original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, name TEXT NOT NULL, caption TEXT NOT NULL, public_consent INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
const sessions = new Map();
const limits = new Map();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-f0-9-]{36}$/;
const MAX_FILE = 80 * 1024 * 1024;
const MAX_STORAGE = Number(process.env.MAX_STORAGE_MB || 2048) * 1024 * 1024;
let reservedUploadBytes = 0;
const baseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'event-config.json'), 'utf8').replace(/^\uFEFF/, ''));
function config() {
  const stored = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, JSON.parse(r.value)]));
  return { ...baseConfig, ...stored, publicBaseUrl: process.env.PUBLIC_BASE_URL || stored.publicBaseUrl || baseConfig.publicBaseUrl };
}
const credentialPath = path.join(DATA, 'admin.json');
let credential;
if (process.env.ADMIN_PASSWORD || !fs.existsSync(credentialPath)) {
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  credential = { salt, digest: crypto.scryptSync(password, salt, 64).toString('hex') };
  fs.writeFileSync(credentialPath, JSON.stringify(credential), { mode: 0o600 });
  if (!process.env.ADMIN_PASSWORD) fs.writeFileSync(path.join(DATA, 'admin-password.txt'), password + '\n', { mode: 0o600 });
} else credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
function error(status, message) { return Object.assign(new Error(message), { status }); }
function json(res, status, data, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); }
function text(value, max, required = false) {
  if (typeof value !== 'string') { if (required) throw error(400, 'اطلاعات لازم را وارد کنید.'); return ''; }
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) throw error(400, 'طول یکی از نوشته‌ها مناسب نیست.');
  return clean;
}
function limited(req, group, max = 20, windowMs = 3600000) {
  const key = group + ':' + req.socket.remoteAddress;
  const now = Date.now();
  let entry = limits.get(key);
  if (!entry || entry.reset < now) { entry = { count: 0, reset: now + windowMs }; limits.set(key, entry); }
  if (++entry.count > max) throw error(429, 'کمی صبر کنید و دوباره تلاش کنید.');
}
function admin(req) {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('wedding_admin='));
  const session = cookie && sessions.get(hash(cookie.slice(14)));
  return !!session && session.expires > Date.now();
}
function requireAdmin(req) { if (!admin(req)) throw error(401, 'ابتدا وارد پنل مدیریت شوید.'); }
function checkMutation(req) {
  if (req.headers['x-requested-with'] !== 'wedding-invitation') throw error(403, 'درخواست معتبر نیست.');
  const origin = req.headers.origin;
  if (origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(origin)) throw error(403, 'درخواست معتبر نیست.');
}
async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw error(415, 'نوع درخواست معتبر نیست.');
  let size = 0, chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw error(413, 'حجم نوشته زیاد است.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error(400, 'اطلاعات درخواست قابل خواندن نیست.'); }
}
function publicMedia(row) { return { id: row.id, name: row.name, caption: row.caption, mime: row.mime, url: '/media/' + row.id, createdAt: row.created_at }; }
function sniff(buffer) {
  if (buffer.length >= 12 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mime: 'image/png', ext: 'png' };
  if (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buffer.length >= 16 && buffer.toString('ascii',4,8) === 'ftyp') {
    const brands = buffer.toString('ascii',8,64);
    if (/heic|heix|hevc|mif1|avif/.test(brands)) return null;
    if (/qt  /.test(brands)) return { mime: 'video/quicktime', ext: 'mov' };
    if (/isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV/.test(brands)) return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (buffer.subarray(0,4).equals(Buffer.from([26,69,223,163])) && buffer.includes(Buffer.from('webm'))) return { mime: 'video/webm', ext: 'webm' };
  return null;
}
async function receiveUpload(req) {
  const stored = db.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM media').get().bytes;
  if (stored + reservedUploadBytes + MAX_FILE > MAX_STORAGE) throw error(507, 'فضای آلبوم پر شده؛ لطفاً با میزبان هماهنگ کنید.');
  reservedUploadBytes += MAX_FILE;
  const id = crypto.randomUUID(); const temp = path.join(UPLOADS, id + '.part');
  try {
    const result = await new Promise((resolve, reject) => {
      let parser;
      try { parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE, files: 1, fields: 5, fieldSize: 2500, parts: 7 } }); }
      catch { reject(error(400, 'فایل دریافت نشد.')); return; }
      const fields = {}; let writePromise = Promise.resolve(), original = '', count = 0, size = 0, head = Buffer.alloc(0), problem;
      parser.on('field', (name, value, info) => { if(info.valueTruncated) problem = error(400, 'نوشته طولانی است.'); fields[name] = value; });
      parser.on('file', (field, file, info) => {
        count++; original = info.filename;
        if (field !== 'file') problem = error(400, 'فایل معتبر نیست.');
        const sink = fs.createWriteStream(temp, { flags: 'wx' });
        writePromise = new Promise((done, fail) => { sink.on('finish', done); sink.on('error', fail); file.on('error', fail); });
        writePromise.catch(() => {});
        file.on('data', chunk => { size += chunk.length; if (head.length < 128) head = Buffer.concat([head, chunk.subarray(0, 128 - head.length)]); });
        file.on('limit', () => { problem = error(413, 'حجم هر فایل باید کمتر از ۸۰ مگابایت باشد.'); });
        file.pipe(sink);
      });
      parser.on('filesLimit', () => { problem = error(400, 'هر بار یک فایل ارسال کنید.'); });
      parser.on('partsLimit', () => { problem = error(400, 'اطلاعات درخواست زیاد است.'); });
      parser.on('fieldsLimit', () => { problem = error(400, 'اطلاعات درخواست زیاد است.'); });
      parser.on('error', reject);
      req.on('aborted', () => { parser.destroy(); reject(error(400, 'ارسال قطع شد.')); });
      parser.on('close', async () => { try { await writePromise; if (problem) throw problem; if (count !== 1 || !size) throw error(400, 'یک عکس یا فیلم انتخاب کنید.'); resolve({ fields, original, size, head }); } catch(e) { reject(e); } });
      req.pipe(parser);
    });
    const format = sniff(result.head); if (!format) throw error(415, 'فرمت مجاز: JPG، PNG، WebP، MP4، MOV یا WebM.');
    const name = text(result.fields.name, 80, true), caption = text(result.fields.caption, 500);
    const filename = id + '.' + format.ext;
    const consent = result.fields.publicConsent === 'true' ? 1 : 0;
    await fsp.rename(temp, path.join(UPLOADS, filename));
    try { db.prepare('INSERT INTO media(id,filename,original_name,mime,size,name,caption,public_consent,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, filename, path.basename(result.original).slice(0,200), format.mime, result.size, name, caption, consent, 'pending', new Date().toISOString()); }
    catch(e) { await fsp.unlink(path.join(UPLOADS, filename)).catch(()=>{}); throw e; }
    return { id, status: 'pending' };
  } finally { reservedUploadBytes -= MAX_FILE; await fsp.unlink(temp).catch(() => {}); }
}
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.jpg':'image/jpeg', '.png':'image/png', '.mp3':'audio/mpeg', '.woff2':'font/woff2', '.ttf':'font/ttf', '.ics':'text/calendar; charset=utf-8' };
async function serveFile(req, res, file, mime, privateFile = false) {
  const stat = await fsp.stat(file).catch(() => null); if (!stat || !stat.isFile()) throw error(404, 'یافت نشد.');
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': privateFile ? 'private, no-store' : 'no-cache' };
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start, end;
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
    if (!match[1]) { start = Math.max(0,stat.size - Number(match[2])); end = stat.size-1; }
    else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]),stat.size-1) : stat.size-1; }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'Content-Length':end-start+1, 'Content-Range':`bytes ${start}-${end}/${stat.size}` });
    if(req.method==='HEAD') res.end(); else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res); return;
  }
  res.writeHead(200,{...headers,'Content-Length':stat.size}); if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost'); const route = decodeURIComponent(url.pathname);
    if (!['GET','HEAD','POST','PATCH'].includes(req.method)) throw error(405,'روش درخواست معتبر نیست.');
    if (['POST','PATCH'].includes(req.method)) checkMutation(req);
    if (route === '/api/config' && req.method === 'GET') {
      const c=config(); const portrait=path.join(ROOT,'assets','couple.jpg');
      return json(res,200,{...c,photoUrl:fs.existsSync(portrait)?'/assets/couple.jpg?v='+fs.statSync(portrait).mtimeMs:null,rsvpOpen:Date.now()<=Date.parse(c.rsvpDeadline),maxFileBytes:MAX_FILE});
    }
    if(route==='/api/rsvp' && req.method==='POST') {
      limited(req,'rsvp',30);const c=config();if(Date.now()>Date.parse(c.rsvpDeadline))throw error(410,'مهلت اعلام حضور تمام شده؛ لطفاً مستقیم با پارسا یا صبا هماهنگ کنید.');
      const body=await readJson(req);const name=text(body.name,80,true);const key=text(body.guestKey,100,true);
      if(!/^[a-zA-Z0-9_-]{20,100}$/.test(key))throw error(400,'شناسه پاسخ معتبر نیست.');
      if(!['yes','no'].includes(body.attending))throw error(400,'وضعیت حضورتان را انتخاب کنید.');
      const guests=body.attending==='no'?0:Number(body.guests);if(!Number.isInteger(guests)||guests<0||guests>10||(body.attending==='yes'&&guests<1))throw error(400,'تعداد مهمانان باید بین ۱ و ۱۰ باشد.');
      const note=text(body.note,500), now=new Date().toISOString(), id=crypto.randomUUID();
      db.prepare('INSERT INTO rsvps VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(guest_hash) DO UPDATE SET name=excluded.name,attending=excluded.attending,guests=excluded.guests,note=excluded.note,updated_at=excluded.updated_at').run(id,hash(key),name,body.attending,guests,note,now,now);
      return json(res,200,{ok:true,message:'پاسختان ثبت شد. ممنون که خبر دادید.'});
    }
    if(route==='/api/notes' && req.method==='GET')return json(res,200,{items:db.prepare("SELECT id,name,message,created_at FROM notes WHERE status='approved' ORDER BY created_at DESC LIMIT 100").all()});
    if(route==='/api/notes' && req.method==='POST') {
      limited(req,'notes',12);const b=await readJson(req);const id=crypto.randomUUID();db.prepare('INSERT INTO notes(id,name,message,created_at) VALUES(?,?,?,?)').run(id,text(b.name,80,true),text(b.message,1200,true),new Date().toISOString());return json(res,201,{id,status:'pending'});
    }
    if(route==='/api/gallery' && req.method==='GET')return json(res,200,{items:db.prepare("SELECT * FROM media WHERE status='approved' AND public_consent=1 ORDER BY created_at DESC LIMIT 100").all().map(publicMedia)});
    if(route==='/api/upload' && req.method==='POST'){limited(req,'upload',60);return json(res,201,await receiveUpload(req));}
    if(route.startsWith('/media/') && ['GET','HEAD'].includes(req.method)) {
      const id=route.slice(7);if(!idPattern.test(id))throw error(404,'یافت نشد.');const row=db.prepare('SELECT * FROM media WHERE id=?').get(id);
      if(!row || ((row.status!=='approved'||!row.public_consent)&&!admin(req)))throw error(404,'یافت نشد.');
      return await serveFile(req,res,path.join(UPLOADS,row.filename),row.mime,true);
    }
    if(route==='/api/qr.svg' && req.method==='GET') {
      const c=config();if(!c.publicBaseUrl)throw error(409,'ابتدا آدرس عمومی سایت را در پنل مدیریت تنظیم کنید.');
      const svg=await QRCode.toString(c.publicBaseUrl.replace(/\/$/,'')+'/?from=table#album',{type:'svg',errorCorrectionLevel:'M',margin:3,width:400,color:{dark:'#49362b',light:'#fffaf0'}});
      res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-cache'});return res.end(svg);
    }
    if(route==='/api/admin/login' && req.method==='POST') {
      limited(req,'login',8,900000);const b=await readJson(req);const password=text(b.password,200,true);const digest=crypto.scryptSync(password,credential.salt,64);
      if(!crypto.timingSafeEqual(digest,Buffer.from(credential.digest,'hex')))throw error(401,'رمز مدیریت درست نیست.');
      const token=crypto.randomBytes(32).toString('base64url');sessions.set(hash(token),{expires:Date.now()+43200000});
      const secure=req.socket.encrypted || req.headers.origin?.startsWith('https://');
      return json(res,200,{ok:true},{'Set-Cookie':`wedding_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`});
    }
    if(route.startsWith('/api/admin/')) {
      requireAdmin(req);
      if(route==='/api/admin/logout'&&req.method==='POST'){const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wedding_admin='));if(cookie)sessions.delete(hash(cookie.slice(14)));return json(res,200,{ok:true},{'Set-Cookie':'wedding_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
      if(route==='/api/admin/data'&&req.method==='GET')return json(res,200,{config:config(),rsvps:db.prepare('SELECT id,name,attending,guests,note,created_at,updated_at FROM rsvps ORDER BY updated_at DESC').all(),notes:db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all(),media:db.prepare('SELECT * FROM media ORDER BY created_at DESC').all().map(row=>({...publicMedia(row),status:row.status,publicConsent:!!row.public_consent,size:row.size})),usedBytes:db.prepare('SELECT COALESCE(SUM(size),0) AS size FROM media').get().size});
      if(route==='/api/admin/moderate'&&req.method==='POST') {
        const b=await readJson(req);if(!['notes','media'].includes(b.kind)||!['approved','rejected','pending'].includes(b.status)||!idPattern.test(b.id||''))throw error(400,'درخواست معتبر نیست.');
        if(b.kind==='media'&&b.status==='approved'){const r=db.prepare('SELECT public_consent FROM media WHERE id=?').get(b.id);if(!r?.public_consent)throw error(409,'فرستنده فقط برای شما ارسال کرده و اجازه انتشار عمومی نداده است.');}
        const r=db.prepare(`UPDATE ${b.kind} SET status=? WHERE id=?`).run(b.status,b.id);if(!r.changes)throw error(404,'یافت نشد.');return json(res,200,{ok:true});
      }
      if(route==='/api/admin/settings'&&req.method==='POST') {
        const b=await readJson(req);const updates={};
        for(const key of ['publicBaseUrl','mapUrl','address','rsvpDeadline'])if(key in b)updates[key]=text(b[key],500);
        if(updates.publicBaseUrl){let u;try{u=new URL(updates.publicBaseUrl);}catch{throw error(400,'آدرس سایت معتبر نیست.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw error(400,'آدرس عمومی باید یک آدرس کامل وب بدون پارامتر باشد.');updates.publicBaseUrl=u.href.replace(/\/$/,'');}
        if(updates.mapUrl){let u;try{u=new URL(updates.mapUrl);}catch{throw error(400,'لینک نقشه معتبر نیست.');}if(!['https:','http:'].includes(u.protocol))throw error(400,'لینک نقشه معتبر نیست.');}
        if('rsvpDeadline' in updates&&!Number.isFinite(Date.parse(updates.rsvpDeadline)))throw error(400,'مهلت معتبر نیست.');
        for(const [key,val]of Object.entries(updates))db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(val));return json(res,200,{ok:true});
      }
      if(route==='/api/admin/rsvps.csv'&&req.method==='GET') {
        const safe=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
        const rows=db.prepare('SELECT name,attending,guests,note,updated_at FROM rsvps ORDER BY name').all();
        const csv='\uFEFF'+[['نام','حضور','تعداد','یادداشت','آخرین تغییر'],...rows.map(r=>[r.name,r.attending==='yes'?'بله':'خیر',r.guests,r.note,r.updated_at])].map(r=>r.map(safe).join(',')).join('\r\n');
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="guest-list.csv"','Cache-Control':'no-store'});return res.end(csv);
      }
      throw error(404,'یافت نشد.');
    }
    if(!['GET','HEAD'].includes(req.method))throw error(405,'روش درخواست معتبر نیست.');
    const publicFiles=new Set(['/index.html','/style.css','/experience.css','/app.js','/experience.js','/veil.js','/admin.html','/admin.js','/admin.css','/qr.html','/qr.js','/qr.css']);
    const normalized=route==='/'?'/index.html':route==='/admin'?'/admin.html':route;
    if(!publicFiles.has(normalized)&&!/^\/assets\/[a-zA-Z0-9_.-]+\.(webp|jpg|png|svg|mp3|woff2|ttf|ics)$/i.test(normalized))throw error(404,'یافت نشد.');
    const file=path.join(ROOT,normalized);return await serveFile(req,res,file,types[path.extname(file)]||'application/octet-stream');
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'مشکلی پیش آمد؛ لطفاً دوباره تلاش کنید.'});else res.destroy();if(!e.status)console.error('Request failed:',e.message);}
});
const cleanup=setInterval(()=>{const now=Date.now();for(const[k,v]of sessions)if(v.expires<now)sessions.delete(k);for(const[k,v]of limits)if(v.reset<now)limits.delete(k);},60000);cleanup.unref();
server.requestTimeout=180000;
server.listen(Number(process.env.PORT||5173),process.env.HOST||'127.0.0.1',()=>console.log(`Local: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||5173}\nAdmin: /admin — credentials in .local/admin-password.txt`));
function shutdown(){clearInterval(cleanup);server.close(()=>{db.close();process.exit(0);});}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
