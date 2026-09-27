import { launch, openApp, makeReporter } from './harness.mjs';
import { mkdir } from 'node:fs/promises';
const R=makeReporter('contrast-themes.mjs');
const browser=await launch();
const palettes={afterglow:['#ff9c86','#65e6df'],voltage:['#bc9cff','#d6f576'],cobalt:['#83c6ff','#ffd17b']};
const luminance=hex=>{const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
try{
  const {ctx,page,problems}=await openApp(browser,process.argv[2],{settleMs:1500});
  await page.setViewportSize({width:1365,height:980});
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  const before=await page.evaluate(()=>({theme:state.settings.theme,minutes:state.totalFocusMin,sessions:JSON.stringify(state.sessionsLog)}));
  R.eq('new options do not silently replace the saved theme',before.theme,'dark');
  for(const [key,pair] of Object.entries(palettes)){
    await page.locator('#btn-theme').click();
    R.eq(key+' appears once in the theme chooser',await page.locator('.theme-swatch[data-theme="'+key+'"]').count(),1);
    await page.locator('.theme-swatch[data-theme="'+key+'"]').click();
    const view=await page.evaluate(()=>{
      const root=document.documentElement,cs=getComputedStyle(root);
      return {theme:root.dataset.theme,preset:state.settings.colorPreset,colors:Object.fromEntries(['accent','accent-2','ink','ink-dim','ink-mute','panel','panel-2','bg'].map(k=>[k,cs.getPropertyValue('--'+k).trim()]))};
    });
    R.eq(key+' applies',view.theme,key);
    R.eq(key+' uses its paired colors',view.preset,'theme');
    R.eq(key+' primary accent',view.colors.accent,pair[0]);
    R.eq(key+' complementary accent',view.colors['accent-2'],pair[1]);
    const ratios=['ink','ink-dim','ink-mute'].flatMap(ink=>['bg','panel','panel-2'].map(bg=>contrast(view.colors[ink],view.colors[bg])));
    R.check(key+' text contrast stays at least 4.5:1 on solid surfaces',Math.min(...ratios)>=4.5,Math.min(...ratios).toFixed(2)+':1 minimum');
    await page.locator('#theme-modal [data-close]').click();
    await page.screenshot({path:new URL('../test-results/theme-'+key+'.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  }
  const stable=await page.evaluate(async()=>{
    await saveStateDurable({source:'contrast-theme-test'});
    const before=JSON.stringify(state);applyTheme();applyTheme();
    return {same:before===JSON.stringify(state),minutes:state.totalFocusMin,sessions:JSON.stringify(state.sessionsLog)};
  });
  R.check('theme rendering does not mutate any state',stable.same);
  R.eq('theme selection leaves minutes unchanged',stable.minutes,before.minutes);
  R.eq('theme selection leaves session records unchanged',stable.sessions,before.sessions);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true);
  R.eq('chosen palette survives reload',await page.getAttribute('html','data-theme'),'cobalt');
  R.eq('theme colors survive reload',await page.evaluate(()=>state.settings.colorPreset),'theme');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#btn-theme').click();
  await page.locator('.theme-swatch[data-theme="voltage"]').click();
  const overflow=await page.locator('#theme-modal .modal').evaluate(el=>el.scrollWidth>el.clientWidth+2);
  R.check('theme chooser fits a narrow phone screen',!overflow);
  await page.screenshot({path:new URL('../test-results/theme-chooser-mobile.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.locator('#theme-modal [data-close]').click();
  await page.evaluate(()=>setColorPreset('custom'));
  R.eq('custom accent remains available after choosing a contrast theme',await page.evaluate(()=>state.settings.colorPreset),'custom');
  R.check('no unexpected browser errors',problems.length===0,problems.join('\n'));
  await ctx.close();
}finally{await browser.close();}
R.finish();
