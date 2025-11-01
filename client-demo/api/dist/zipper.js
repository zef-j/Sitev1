// Minimal ZIP builder (STORE only)
import { Buffer } from 'buffer';
function crc32(buf){ let c=~0; for (let i=0;i<buf.length;i++){ c^=buf[i]; for (let k=0;k<8;k++){ c=(c>>>1)^(0xEDB88320&(-(c&1))); } } return (~c)>>>0; }
function dosDateTime(date){ const dt=new Date(date||Date.now()); const year=dt.getFullYear();
  const dosTime=((dt.getHours()&31)<<11)|((dt.getMinutes()&63)<<5)|((Math.floor(dt.getSeconds()/2))&31);
  const dosDate=(((year-1980)&127)<<9)|(((dt.getMonth()+1)&15)<<5)|(dt.getDate()&31); return {dosTime,dosDate}; }
export function createZipBuffer(files){
  const central=[]; const chunks=[]; let offset=0; let entries=0;
  for (const f of files){
    const nameBuf=Buffer.from(f.name,'utf8'); const data=Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data);
    const crc=crc32(data); const size=data.length>>>0; const {dosTime,dosDate}=dosDateTime(f.mtime);
    const lh=Buffer.alloc(30); lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6); lh.writeUInt16LE(0,8);
    lh.writeUInt16LE(dosTime,10); lh.writeUInt16LE(dosDate,12); lh.writeUInt32LE(crc,14); lh.writeUInt32LE(size,18); lh.writeUInt32LE(size,22);
    lh.writeUInt16LE(nameBuf.length,26); lh.writeUInt16LE(0,28);
    chunks.push(lh,nameBuf,data); const localOffset=offset; offset+=lh.length+nameBuf.length+data.length;
    const cd=Buffer.alloc(46); cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(0,8); cd.writeUInt16LE(0,10); cd.writeUInt16LE(dosTime,12); cd.writeUInt16LE(dosDate,14);
    cd.writeUInt32LE(crc,16); cd.writeUInt32LE(size,20); cd.writeUInt32LE(size,24); cd.writeUInt16LE(nameBuf.length,28);
    cd.writeUInt16LE(0,30); cd.writeUInt16LE(0,32); cd.writeUInt16LE(0,34); cd.writeUInt16LE(0,36); cd.writeUInt32LE(0,38);
    cd.writeUInt32LE(localOffset,42); central.push(cd,nameBuf); entries++;
  }
  const centralStart=offset; for (const c of central){ chunks.push(c); offset+=c.length; }
  const eocd=Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50,0); eocd.writeUInt16LE(0,4); eocd.writeUInt16LE(0,6);
  eocd.writeUInt16LE(entries,8); eocd.writeUInt16LE(entries,10); eocd.writeUInt32LE(offset-centralStart,12);
  eocd.writeUInt32LE(centralStart,16); eocd.writeUInt16LE(0,20); chunks.push(eocd); return Buffer.concat(chunks);
}
