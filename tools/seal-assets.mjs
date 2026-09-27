/* Keep page/module integrity receipts reproducible. No network or player data. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const folder=new URL('../starmax/',import.meta.url);
const read=name=>readFileSync(new URL(name,folder),'utf8');
const files=readdirSync(folder).filter(name=>name.endsWith('.js')&&name!=='sw.js').sort();
const hashes=Object.fromEntries(files.map(name=>[name,'sha384-'+createHash('sha384').update(readFileSync(new URL(name,folder))).digest('base64')]));
let html=read('index.html');
html=html.replace(/<script\b([^>]*?)src="([^"?#]+\.js)"([^>]*)><\/script>/g,(all,before,src,after)=>{
  const key=src.replace(/^\.\//,'');if(!hashes[key])throw new Error('Unknown script '+src);
  const attrs=(before+after).replace(/\s(?:integrity|crossorigin)="[^"]*"/g,'').trim();
  return '<script src="'+src+'" integrity="'+hashes[key]+'" crossorigin="anonymous"'+(attrs?' '+attrs:'')+'></script>';
});
html=html.replace(/guardScript\.integrity = "[^"]*";/,'guardScript.integrity = "'+hashes['data-guard.js']+'";');
for(const name of ['index.html','focus-hero.html'])writeFileSync(new URL(name,folder),html);
const bundle=createHash('sha256');
for(const name of readdirSync(folder).filter(name=>name!=='sw.js').sort()){
  bundle.update(name+'\0').update(readFileSync(new URL(name,folder)));
}
let sw=read('sw.js');
sw=sw.replace(/const BUNDLE_HASH = "[^"]*";/,'const BUNDLE_HASH = "'+bundle.digest('hex')+'";');
sw=sw.replace(/\/\* BEGIN MODULE INTEGRITY \*\/[\s\S]*?\/\* END MODULE INTEGRITY \*\//,'/* BEGIN MODULE INTEGRITY */\nconst MODULE_INTEGRITY = '+JSON.stringify(hashes,null,2)+';\n/* END MODULE INTEGRITY */');
writeFileSync(new URL('sw.js',folder),sw);
console.log('Sealed '+files.length+' runtime modules; HTML mirrors match.');
