
// Minimal ZIP builder (STORE only, no compression). Suitable for modest payloads.
import { Buffer } from 'buffer';

function crc32(buf){
  // CRC-32 (IEEE 802.3) polynomial 0xEDB88320
  let c = ~0;
  for (let i=0; i<buf.length; i++){
    c ^= buf[i];
    for (let k=0; k<8; k++){
      c = (c>>>1) ^ (0xEDB88320 & (-(c & 1)));
    }
  }
  return (~c) >>> 0;
}
function dosDateTime(date){
  const dt = new Date(date || Date.now());
  const year = dt.getFullYear();
  const dosTime = ((dt.getHours() & 31) << 11) | ((dt.getMinutes() & 63) << 5) | ((Math.floor(dt.getSeconds()/2)) & 31);
  const dosDate = (((year - 1980) & 127) << 9) | (((dt.getMonth()+1) & 15) << 5) | (dt.getDate() & 31);
  return { dosTime, dosDate };
}

export function createZipBuffer(files){
  // files: [{name, data:Buffer, mtime:Date}]
  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;
  const chunks = [];

  for (const f of files){
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const crc = crc32(data);
    const size = data.length >>> 0;
    const { dosTime, dosDate } = dosDateTime(f.mtime);

    // Local file header
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);    // signature
    lh.writeUInt16LE(20, 4);            // version needed
    lh.writeUInt16LE(0, 6);             // general purpose
    lh.writeUInt16LE(0, 8);             // method = 0 (STORE)
    lh.writeUInt16LE(dosTime, 10);      // mod time
    lh.writeUInt16LE(dosDate, 12);      // mod date
    lh.writeUInt32LE(crc, 14);          // CRC-32
    lh.writeUInt32LE(size, 18);         // comp size
    lh.writeUInt32LE(size, 22);         // uncomp size
    lh.writeUInt16LE(nameBuf.length, 26); // filename length
    lh.writeUInt16LE(0, 28);            // extra length

    chunks.push(lh, nameBuf, data);
    const localHeaderOffset = offset;
    offset += lh.length + nameBuf.length + data.length;

    // Central directory header
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);           // version made by
    cd.writeUInt16LE(20, 6);           // version needed
    cd.writeUInt16LE(0, 8);            // general purpose
    cd.writeUInt16LE(0, 10);           // method
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);           // extra length
    cd.writeUInt16LE(0, 32);           // file comment length
    cd.writeUInt16LE(0, 34);           // disk number start
    cd.writeUInt16LE(0, 36);           // internal attrs
    cd.writeUInt32LE(0, 38);           // external attrs
    cd.writeUInt32LE(localHeaderOffset, 42);

    centralDirs.push(cd, nameBuf);
  }

  const centralStart = offset;
  chunks.push(...centralDirs);
  offset += centralDirs.reduce((acc, b)=> acc + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(centralDirs.length // number of entries (buffers pair count /2)
                     // centralDirs is [cd,name,cd,name,...]
                     / 2, 8);
  eocd.writeUInt16LE(centralDirs.length / 2, 10);
  const centralSize = offset - centralStart;
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  chunks.push(eocd);

  return Buffer.concat(chunks);
}
