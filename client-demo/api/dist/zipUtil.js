
// zipUtil.js
import JSZip from 'jszip';
export async function createZipBuffer(entries){
  const zip = new JSZip();
  for (const e of entries){
    zip.file(e.name, e.data);
  }
  return await zip.generateAsync({type:'nodebuffer', compression:'DEFLATE', compressionOptions:{level:6}});
}
