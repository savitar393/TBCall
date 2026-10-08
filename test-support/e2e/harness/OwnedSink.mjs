// Task-owned sinks only. DNS never forwards; all answers point to this sink.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import os from 'node:os';
import { readFileSync } from 'node:fs';
const interfaces = Object.values(os.networkInterfaces()).flat().filter(x => x && !x.internal);
const v4 = interfaces.find(x => x.family === 'IPv4')?.address;
const v6 = interfaces.find(x => x.family === 'IPv6' && x.address.startsWith('fd'))?.address;
if (!v4 || !v6) throw new Error('Expected owned dual-stack network');
net.createServer(socket => {socket.on('error',()=>{});socket.end('owned-e2e');}).listen(8081, '::');
const handler = (req, res) => {
  console.log(`OWNED_HTTP_REQUEST method=${req.method} path=${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
  res.end('<!doctype html><title>Owned sink</title><p>synthetic-only</p>');
};
http.createServer(handler).listen(8083, '::');
https.createServer({ key: readFileSync('/tls/server.key'), cert: readFileSync('/tls/server.pem') }, handler).listen(8443, '::');
function ip6Bytes(ip) {
  const [left, right=''] = ip.split('::');
  const l = left ? left.split(':') : [], r = right ? right.split(':') : [];
  const parts = [...l, ...Array(8-l.length-r.length).fill('0'), ...r];
  const b = Buffer.alloc(16); parts.forEach((part,i) => b.writeUInt16BE(parseInt(part,16),i*2)); return b;
}
function dnsAnswer(query) {
  let cursor=12; const labels=[];
  while(cursor<query.length && query[cursor]) { const n=query[cursor++]; labels.push(query.subarray(cursor,cursor+n).toString()); cursor+=n; }
  cursor++; if(cursor+4>query.length) return null;
  const type=query.readUInt16BE(cursor), end=cursor+4;
  const name=labels.join('.'); const owned=['probe.tbcall.test','probe.tbcall.test'].includes(name);
  console.log(`DNS_QUERY ownedName=${owned} type=${type}`);
  const header=Buffer.alloc(12); query.copy(header,0,0,2); header.writeUInt16BE(owned?0x8180:0x8183,2); header.writeUInt16BE(1,4);
  const answer=owned && [1,28].includes(type);
  header.writeUInt16BE(answer?1:0,6);
  if(!answer) return Buffer.concat([header,query.subarray(12,end)]);
  const address=type===1?Buffer.from(v4.split('.').map(Number)):ip6Bytes(v6);
  const rr=Buffer.alloc(12); rr.writeUInt16BE(0xc00c,0); rr.writeUInt16BE(type,2); rr.writeUInt16BE(1,4); rr.writeUInt16BE(address.length,10);
  return Buffer.concat([header,query.subarray(12,end),rr,address]);
}
for (const family of ['udp4','udp6']) {
  const bindAddress=family==='udp4'?'0.0.0.0':'::';
  for (const port of [8082,53,3478]) {
    const socket=dgram.createSocket({type:family,...(family==='udp6'?{ipv6Only:true}:{})});
    socket.on('message',(message,peer) => {
      if(port===8082) return socket.send(message,peer.port,peer.address);
      if(port===53) { const answer=dnsAnswer(message); if(answer) socket.send(answer,peer.port,peer.address); return; }
      if(message.length<20 || message.readUInt32BE(4)!==0x2112a442) return;
      console.log(`STUN_REQUEST family=${family}`);
      const ip=family==='udp4'?Buffer.from(peer.address.split('.').map(Number)):ip6Bytes(peer.address);
      const value=Buffer.alloc(4+ip.length); value[1]=family==='udp4'?1:2; value.writeUInt16BE(peer.port^0x2112,2);
      const mask=Buffer.concat([message.subarray(4,8),message.subarray(8,20)]);
      for(let i=0;i<ip.length;i++) value[i+4]=ip[i]^mask[i];
      const attr=Buffer.alloc(4); attr.writeUInt16BE(0x0020,0); attr.writeUInt16BE(value.length,2);
      const header=Buffer.from(message.subarray(0,20)); header.writeUInt16BE(0x0101,0); header.writeUInt16BE(attr.length+value.length,2);
      socket.send(Buffer.concat([header,attr,value]),peer.port,peer.address);
    });
    socket.bind(port,bindAddress);
  }
}
net.createServer(socket => {
  socket.on('error',()=>{});
  let pending=Buffer.alloc(0);
  socket.on('data',chunk => {
    pending=Buffer.concat([pending,chunk]); if(pending.length<2) return;
    const length=pending.readUInt16BE(0); if(pending.length<length+2) return;
    const answer=dnsAnswer(pending.subarray(2,2+length)); if(answer) { const prefix=Buffer.alloc(2); prefix.writeUInt16BE(answer.length); socket.end(Buffer.concat([prefix,answer])); }
  });
}).listen(53,'::');
console.log(`OWNED_SINK_READY IPv4=${v4} IPv6=${v6} TCP=8081 UDP=8082 DNS=53 HTTP=8083 HTTPS=8443 STUN=3478`);

