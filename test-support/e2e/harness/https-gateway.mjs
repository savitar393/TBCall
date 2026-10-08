// Task-only TLS gateway. Fixed Next.js upstream; never logs URLs, bodies or headers.
import https from 'node:https';
import http from 'node:http';
import {readFileSync} from 'node:fs';
const upstream={hostname:'frontend',port:3000};
function proxy(request,response){
 if(request.url==='/__e2e/probe'){response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.end('<!doctype html><title>E2E TLS probe</title><p>Task-only connectivity probe</p>');return;}
 const headers={...request.headers,'x-forwarded-proto':'https','x-forwarded-host':request.headers.host};
 const connection=http.request({...upstream,path:request.url,method:request.method,headers},result=>{
  response.writeHead(result.statusCode,result.headers);result.pipe(response);
 });
 connection.on('error',()=>{response.writeHead(502);response.end('Task upstream unavailable');});
 request.pipe(connection);
}
https.createServer({key:readFileSync('/tls/server.key'),cert:readFileSync('/tls/server.pem'),minVersion:'TLSv1.2'},proxy).listen(3443,'::');
https.createServer({key:readFileSync('/tls/untrusted.key'),cert:readFileSync('/tls/untrusted.pem'),minVersion:'TLSv1.2'},(q,s)=>{s.writeHead(200);s.end('Untrusted TLS control');}).listen(3444,'::');
console.log('INTERNAL_HTTPS_GATEWAY_READY');
