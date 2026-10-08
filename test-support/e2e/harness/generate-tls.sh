#!/bin/sh
set -eu
umask 077
cd /tls
test ! -e ca.key
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -keyout ca.key -out ca.pem -subj '/CN=TBCall E2E temporary CA' \
  -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1
openssl req -new -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj '/CN=app.tbcall.test' >/dev/null 2>&1
printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth' "subjectAltName=DNS:app.tbcall.test,DNS:probe.tbcall.test,DNS:probe.tbcall.test,$E2E_SINK_SANS" > server.ext
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -set_serial 1001 -days 1 -sha256 -extfile server.ext -out server.pem >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -keyout untrusted.key -out untrusted.pem -subj '/CN=untrusted.tbcall.test' \
  -addext 'subjectAltName=DNS:untrusted.tbcall.test' >/dev/null 2>&1
openssl x509 -in ca.pem -outform DER -out ca.der
mkdir public server
chmod 755 public server
cp ca.pem ca.der public/
cp server.pem server.key untrusted.pem untrusted.key server/
chmod 644 public/* server/*
openssl verify -CAfile ca.pem server.pem >/dev/null
printf '%s\n' 'TEMPORARY_CA_AND_SERVER_CERTIFICATES_PASS'
