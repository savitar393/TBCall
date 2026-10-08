import {chromium} from '/runner/node_modules/playwright/index.mjs';
import {readdirSync,readFileSync} from 'node:fs';
const mode=process.argv[2];
const browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true});
let failed=false;
try {
 const context=await browser.newContext({ignoreHTTPSErrors:false});
 for(const [id,url,expected] of mode==='untrusted' ? [['BEFORE_IMPORT','https://app.tbcall.test:3443/__e2e/probe',false]] : [
  ['TRUSTED_APP','https://app.tbcall.test:3443/__e2e/probe',true],
  ['WRONG_HOST','https://wrong-host.tbcall.test:3443/__e2e/probe',false],
  ['UNTRUSTED_CA','https://untrusted.tbcall.test:3444/',false]]){
  const page=await context.newPage();let valid=false,category='';
  try{const response=await page.goto(url,{timeout:15000,waitUntil:'domcontentloaded'});valid=response.status()===200;}catch(error){category=error.message.includes('ERR_CERT_AUTHORITY_INVALID')?'CERT_AUTHORITY_INVALID':error.message.includes('ERR_CERT_COMMON_NAME_INVALID')?'CERT_HOSTNAME_INVALID':'OTHER_ERROR';}
  const pass=valid===expected && (expected || category.startsWith('CERT_'));
  console.log(JSON.stringify({id:'TLS_'+id,status:pass?'PASS':'FAIL',expectedTrusted:expected,actualTrusted:valid,errorCategory:category}));
  if(!pass) failed=true;
  if(valid){const security=await responseSecurity(page);if(!security)failed=true;}
  await page.close();
 }
 for(const pid of readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const cmd=readFileSync(`/proc/${pid}/cmdline`,'utf8');if(cmd.includes('/ms-playwright/') && /--no-sandbox|--ignore-certificate-errors|--allow-insecure-localhost|--disable-web-security/.test(cmd))throw new Error('Forbidden browser flag');}catch(error){if(error.message==='Forbidden browser flag')throw error;}}
}finally{await browser.close();}
process.exitCode=failed?3:0;
async function responseSecurity(page){
 const client=await page.context().newCDPSession(page);await client.send('Security.enable');
 const secure=await page.evaluate(()=>isSecureContext);console.log(JSON.stringify({id:'TLS_SECURE_CONTEXT',status:secure?'PASS':'FAIL'}));return secure;
}
