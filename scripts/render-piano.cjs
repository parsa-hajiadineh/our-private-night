const fs=require('node:fs');
const sr=32000, duration=64, data=new Float32Array(sr*duration);
// Original, sparse D-major arpeggio. Soft additive piano with a short room tail.
const chords=[[50,57,61,66],[47,54,59,62],[43,50,57,59],[45,52,57,61]];
function note(midi,start,gain,length=5){const f=440*2**((midi-69)/12);for(let j=0;j<length*sr && j+Math.floor(start*sr)<data.length;j++){let t=j/sr;let v=0;for(let h=1;h<=4;h++)v+=Math.sin(2*Math.PI*f*h*t)*Math.exp(-t*(.8+h*.48))/(h*h);const envelope=Math.min(1,t/.018);data[j+Math.floor(start*sr)]+=gain*v*envelope;}}
for(let bar=0;bar<16;bar++){const c=chords[bar%4];note(c[0],bar*4,.23);[1,2,3,2].forEach((n,i)=>note(c[n]+12,bar*4+.5+i*.8,.12));if(bar%2===0)note(c[3]+12,bar*4+2.9,.065);}
const dry=data.slice();for(const [delay,gain] of [[.14,.17],[.29,.12],[.43,.07]]){let d=Math.floor(delay*sr);for(let i=d;i<data.length;i++)data[i]+=dry[i-d]*gain;}
const b=Buffer.alloc(44+data.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(data.length*2,40);
for(let i=0;i<data.length;i++){const fade=Math.min(1,i/sr/2,(duration-i/sr)/4);b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[i]*fade)) * 28000),44+i*2);}
const destination=process.argv[2] || require('node:path').join(require('node:os').tmpdir(),'parsa-saba-piano-preview.wav');
fs.writeFileSync(destination,b);console.log(destination);
