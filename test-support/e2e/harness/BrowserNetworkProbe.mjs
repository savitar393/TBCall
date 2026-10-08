import { chromium } from '/runner/node_modules/playwright/index.mjs';
import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
const [mode,allowed4,allowed6,outside4,outside6]=process.argv.slice(2);
const control=mode==='control'; let failures=0;
const browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
try {
 console.log(`CHROMIUM_VERSION=${browser.version()}`);
 if(browser.version()!=='151.0.7922.34') throw new Error('Browser mismatch');
 const context=await browser.newContext({ignoreHTTPSErrors:false});
 const statusPage=await context.newPage(); await statusPage.goto('chrome://sandbox');
 const sandbox=await statusPage.locator('body').innerText();
 console.log('CHROMIUM_SANDBOX_STATUS='+JSON.stringify(sandbox));
 for(const pattern of [/Layer 1 Sandbox\s+Namespace/i,/PID namespaces\s+Yes/i,/Network namespaces\s+Yes/i,/Seccomp-BPF sandbox\s+Yes/i,/Seccomp-BPF sandbox supports TSYNC\s+Yes/i]) if(!pattern.test(sandbox)) throw new Error('Actual Chromium sandbox assertion failed');
 await statusPage.close();
 let page=await context.newPage();
 async function visit(label,url,expected) { await page.close();page=await context.newPage();let ok=false; try { const result=await page.goto(url,{timeout:4000,waitUntil:'domcontentloaded'}); ok=result?.status()===200; } catch(error) { console.log(`${label}_ERROR=${error.message.split('\n')[0]}`); } console.log(`${label}=${ok?'REACHABLE':'FAILED_OR_BLOCKED'} expected=${expected}`); if(ok!==expected) failures++; return ok; }
 const host=x=>x.includes(':')?`[${x}]`:x;
 for(const [suffix,allowed,outside] of [['4',allowed4,outside4],['6',allowed6,outside6]]) {
  await visit('BROWSER_ALLOWED_TCP'+suffix,`http://${host(allowed)}:8083/allowed-${mode}`,true);
  await visit('BROWSER_OUTSIDE_TCP'+suffix,`http://${host(outside)}:8083/outside-${mode}`,control);
  // HTTPS DNS-endpoint reachability, not a claim that Chromium forced its own DoH mode.
  await visit('BROWSER_OUTSIDE_HTTPS_DNS_ENDPOINT'+suffix,`https://${host(outside)}:8443/dns-query?owned=1`,control);
 }
 await visit('BROWSER_SYSTEM_DNS','http://probe.tbcall.test:8083/dns-'+mode,control);
 for(const [suffix,outside] of [['4',outside4],['6',outside6]]) {
  if(!await visit('BROWSER_STUN_PAGE'+suffix,`https://${host(allowed4)}:8443/stun-page`,true)) continue;
  const evidence=await page.evaluate(async server => {
   const pc=new RTCPeerConnection({iceServers:[{urls:server}]}); const candidates=[];
   pc.onicecandidate=event=>{if(event.candidate)candidates.push(event.candidate.candidate);}; pc.createDataChannel('owned'); await pc.setLocalDescription(await pc.createOffer());
   await new Promise(resolve=>setTimeout(resolve,5000)); pc.close(); return {srflx:candidates.some(item=>item.includes(' typ srflx ')),count:candidates.length};
  },`stun:${host(outside)}:3478`);
  console.log(`BROWSER_STUN${suffix}=${JSON.stringify(evidence)} expectedSrflx=${control}`);
  if(evidence.srflx!==control) failures++;
 }
 const processes=[];
 for(const pid of readdirSync('/proc').filter(name=>/^\d+$/.test(name))) {
  try {
   const cmd=readFileSync(`/proc/${pid}/cmdline`,'utf8').replaceAll('\0',' ');
   if(!cmd.includes('/ms-playwright/')) continue;
   if(cmd.includes('--no-sandbox')) throw new Error('Forbidden Chromium flag observed');
   const role=cmd.includes('network.mojom.NetworkService')?'network-service':cmd.includes('--type=renderer')?'renderer':cmd.includes('--type=zygote')?'zygote':cmd.includes('--type=gpu-process')?'gpu':'browser-or-utility';
   const status=readFileSync(`/proc/${pid}/status`,'utf8').split('\n').filter(line=>/^(Uid|CapEff|NoNewPrivs|Seccomp):/.test(line));
   const namespaces={};for(const name of ['user','net','pid']) {try{namespaces[name]=readlinkSync(`/proc/${pid}/ns/${name}`);}catch(error){namespaces[name]='unreadable:'+error.code;}}
   processes.push({pid,role,status,namespaces});
  } catch(error) {if(error.message==='Forbidden Chromium flag observed') throw error;}
 }
 console.log('BROWSER_CHILD_PROCESSES='+JSON.stringify(processes));
 if(!processes.some(p=>p.role==='network-service') || !processes.some(p=>p.role==='renderer')) failures++;
 if(!control) {
  let stackStarted=false;
  try {stackStarted=(await fetch('http://frontend:3000/icon.svg',{signal:AbortSignal.timeout(1500)})).status===200;} catch {}
  if(stackStarted) {
   await visit('BROWSER_NEXT_ASSET','https://app.tbcall.test:3443/icon.svg',true);
   await page.close();page=await context.newPage();
   const proxy=await page.goto('https://app.tbcall.test:3443/api/tbcall/e2e-owned-probe',{timeout:20000,waitUntil:'domcontentloaded'});
   console.log('BROWSER_NEXT_PROXY_STATUS='+proxy?.status());
   if(proxy?.status()!==401) failures++; else console.log('BROWSER_STACK_COMMUNICATION_PASS synthetic anonymous GETs only');
  } else console.log('BROWSER_STACK_NOT_STARTED pre-start isolation probe');
 }
 console.log(`BROWSER_PROBE mode=${mode} expectationFailures=${failures}`);
} finally {await browser.close();}
process.exitCode=failures?3:0;

