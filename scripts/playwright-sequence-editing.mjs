import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const temp = mkdtempSync(join(tmpdir(), 'iterlay-sequence-'));
const fixture = join(temp, 'video.mp4');
execFileSync('ffmpeg', ['-loglevel','error','-f','lavfi','-i','testsrc=size=160x90:rate=24','-t','3','-pix_fmt','yuv420p',fixture]);
const video = readFileSync(fixture);
mkdirSync('output/playwright', {recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
try {
  await page.route('**/sequence-test.mp4', route => {
    const match = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : video.length - 1;
    return route.fulfill({status:match ? 206 : 200, body:video.subarray(start,end+1), contentType:'video/mp4',headers:{'Accept-Ranges':'bytes',...(match ? {'Content-Range':`bytes ${start}-${end}/${video.length}`} : {})}});
  });
  await page.goto('http://127.0.0.1:5180/?preview=assistant-history');
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default ?? reactModule;
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const createRoot = client.createRoot ?? client.default.createRoot;
    const {I18nProvider} = await import('/src/i18n/index.tsx');
    const {VideoSequenceEditor} = await import('/src/components/video-sequence/VideoSequenceEditor.tsx');
    document.querySelector('#root').style.display='none';
    const host=document.createElement('div');host.style.height='100vh';document.body.append(host);
    window.closedCount=0;window.patches=0;
    function Harness(){
      const [sequence,setSequence]=React.useState({id:'test',kind:'video-assembly',name:'剪辑验证',defaults:{model:'test',durationSeconds:3,fps:24,resolution:'720p'},keyframes:[],segments:[0,1].map(i=>({id:`s${i}`,order:i,prompt:'',trimInMs:0,state:'valid',versions:[{id:`v${i}`,videoPath:'video',durationMs:3000,createdAt:new Date().toISOString()}]}))});
      const noop=()=>{};
      return React.createElement(VideoSequenceEditor,{sequence,mediaUrls:{video:'/sequence-test.mp4'},providers:[],onChange:next=>{window.patches++;setSequence(next)},onClose:()=>window.closedCount++,onGenerateSegment:noop,onGenerateBatch:noop,onSaveTemplate:noop,onApplyTemplate:noop,onExport:noop});
    }
    createRoot(host).render(React.createElement(I18nProvider,null,React.createElement(Harness)));
  });
  await page.locator('video').waitFor();
  await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
  assert((await page.getByRole('button',{name:'返回画布',exact:true}).boundingBox()).x>=80);
  await page.getByRole('slider',{name:'播放位置',exact:true}).fill('1500');
  await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1.5)<.2);
  await page.getByRole('button',{name:'下一片段',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.vse-clip.selected')?.textContent.includes('02'));
  await page.getByRole('slider',{name:'播放位置',exact:true}).fill('4500');
  await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1.5)<.2);
  await page.getByRole('spinbutton',{name:'入点',exact:true}).fill('0.5');
  assert.equal(await page.evaluate(()=>window.patches),0);
  await page.getByRole('spinbutton',{name:'入点',exact:true}).press('Enter');
  await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-.5)<.2);
  assert.equal(await page.evaluate(()=>window.patches),1);
  await page.getByRole('button',{name:'返回画布',exact:true}).click();
  await page.locator('main.video-sequence-editor').click({position:{x:600,y:100}});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.closedCount),2);
  await page.getByRole('button',{name:'播放',exact:true}).first().click();
  await page.waitForTimeout(400);
  assert(await page.locator('video').evaluate(v=>v.currentTime>.6));
  await page.getByRole('slider',{name:'播放位置',exact:true}).fill('2800');
  await page.waitForFunction(()=>document.querySelector('.vse-clip.selected')?.textContent.includes('01'));
  await page.waitForFunction(()=>document.querySelector('.vse-stage-tools').textContent.includes('02') && !document.querySelector('video').paused);
  await page.screenshot({path:'output/playwright/sequence-editing.png'});
  console.log('PASS: exit clearance, button/Escape exit, same/cross-clip seek, trim draft/save/preview, playback');
} finally { await browser.close(); rmSync(temp,{recursive:true,force:true}); }
