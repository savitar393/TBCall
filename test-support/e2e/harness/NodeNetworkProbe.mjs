import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
const [mode,allowed4,allowed6,outside4,outside6]=process.argv.slice(2);
const control=mode==='control'; let failures=0;
function tcp(host,port=8081) { return new Promise(resolve => { const socket=net.createConnection({host,port}); let done=false; const finish=value => { if(done) return; done=true; socket.destroy(); resolve(value); }; socket.setTimeout(1500,()=>finish(false)); socket.on('connect',()=>finish(true)); socket.on('error',()=>finish(false)); }); }
function udp(host,port) { return new Promise(resolve => { const socket=dgram.createSocket(host.includes(':')?'udp6':'udp4'); let done=false; const timer=setTimeout(()=>finish(false),1500); function finish(value) { if(done) return; done=true; clearTimeout(timer); socket.close(); resolve(value); } socket.on('message',()=>finish(true)); socket.on('error',()=>finish(false)); const labels=Buffer.from([5,102,54,97,51,120,4,116,101,115,116,0,0,1,0,1]); const header=Buffer.from([0x12,0x34,1,0,0,1,0,0,0,0,0,0]); socket.send(port===53?Buffer.concat([header,labels]):Buffer.from('owned'),port,host,error=>{if(error)finish(false);}); }); }
async function check(label,promise,expected) { const actual=await promise; console.log(`${label}=${actual?'REACHABLE':'FAILED_OR_BLOCKED'} expected=${expected}`); if(actual!==expected) failures++; }
for(const [suffix,allowed,outside] of [['4',allowed4,outside4],['6',allowed6,outside6]]) {
 await check('ALLOWED_TCP'+suffix,tcp(allowed),true);
 await check('ALLOWED_UDP'+suffix,udp(allowed,8082),true);
 await check('OUTSIDE_TCP'+suffix,tcp(outside),control);
 await check('OUTSIDE_UDP'+suffix,udp(outside,8082),control);
 await check('OUTSIDE_DIRECT_DNS_UDP'+suffix,udp(outside,53),control);
 await check('OUTSIDE_DIRECT_DNS_TCP'+suffix,tcp(outside,53),control);
}
for(const [label,lookup] of [['LIBC_DNS',()=>dns.lookup('probe.tbcall.test',{all:true})],['NODE_DNS_A',()=>dns.resolve4('probe.tbcall.test')],['NODE_DNS_AAAA',()=>dns.resolve6('probe.tbcall.test')]]) {
 let success=false; try { const result=await lookup(); success=result.length>0; } catch(error) { console.log(`${label}_ERROR=${error.code}`); }
 await check(label,Promise.resolve(success),control);
}
console.log(`NODE_PROBE mode=${mode} expectationFailures=${failures}`); process.exitCode=failures?3:0;
