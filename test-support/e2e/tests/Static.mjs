import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const hash=path=>createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex');
for(const path of ['artifacts.reference.json','coverage.json','toolchain.lock.json'])assert.doesNotMatch(readFileSync(new URL(path,root),'utf8'),/\r/,'Pinned text must survive LF checkout');
assert.equal(hash('security/moby-default.json'),'6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6');
assert.equal(hash('security/browser-seccomp.json'),'688e4282e75b43d8f7483c69f47178cbe106e297969c7da8c64e3f5b9f2854b8');
const baseline=json('security/moby-default.json'),profile=json('security/browser-seccomp.json');
const baselineRules=baseline.syscalls.length;
assert.deepEqual({...profile,syscalls:profile.syscalls.slice(0,baselineRules)},baseline);
assert.equal(profile.syscalls.length,baselineRules+2);
assert.deepEqual(profile.syscalls.slice(baselineRules).map(rule=>({names:rule.names,action:rule.action})),[
 {names:['clone','setns','unshare'],action:'SCMP_ACT_ALLOW'},
 {names:['chroot'],action:'SCMP_ACT_ALLOW'}
]);
for(const rule of profile.syscalls.slice(baselineRules)) {
 assert.deepEqual(rule.args,[]);assert.deepEqual(rule.includes,{});assert.deepEqual(rule.excludes,{});
 assert.deepEqual(Object.keys(rule).sort(),['action','args','comment','excludes','includes','names']);
}
const coverage=json('coverage.json');
assert.equal(coverage.scenarios.length,56);
assert.equal(new Set(coverage.scenarios.map(s=>s.id)).size,56);
assert.equal(coverage.database.length,58);
const smoke=readFileSync(new URL('harness/run-smoke.mjs',root),'utf8');
const extended=readFileSync(new URL('harness/extended.mjs',root),'utf8');
for(const s of coverage.scenarios)assert.match(smoke+extended,new RegExp(`['"]${s.id}['"]`));
assert.match(smoke,/mutationRetries:0/);
assert.match(smoke,/workers:1/);
assert.match(smoke,/chromiumSandbox:true/);
assert.match(extended,/Promise\.all/);
for(const path of ['Run-E2E.ps1','Common.ps1','harness/run-smoke.mjs','harness/extended.mjs']) {
 const source=readFileSync(new URL(path,root),'utf8');
 assert.doesNotMatch(source,/D:\\TBCall|C:\\Users|\.tools\/f6[abc]|f6c-20261008/);
 assert.doesNotMatch(source,/--privileged|seccomp=unconfined|--cap-add['", ]+SYS_ADMIN/);
}
console.log('STATIC_SECURITY_COVERAGE_PASS baselineRules='+baselineRules+' addedSyscalls=clone,setns,unshare,chroot scenarios=56 assertions=58');
