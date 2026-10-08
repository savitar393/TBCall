"""Import a public test CA into a fresh container-local Chromium NSS database.

Uses the public APIs of the already installed NSS library, not a new dependency.
No private key, system trust store or host path is opened.
"""
import ctypes as c
import os
from pathlib import Path

class SECItem(c.Structure):
    _fields_ = [('type', c.c_int), ('data', c.POINTER(c.c_ubyte)), ('len', c.c_uint)]

class Trust(c.Structure):
    _fields_ = [('sslFlags', c.c_uint), ('emailFlags', c.c_uint), ('objectSigningFlags', c.c_uint)]

home = Path(os.environ['HOME'])
if not str(home).startswith('/tmp/e2e-') or os.getuid() != 1001:
    raise RuntimeError('Refusing non-task HOME or non-browser user')
db = home / '.local/share/pki/nssdb'
db.mkdir(parents=True, exist_ok=True)
if (db / 'cert9.db').exists():
    raise RuntimeError('Refusing an existing trust database')
nss = c.CDLL('libnss3.so')
def bind(name, result, args):
    fn = getattr(nss, name); fn.restype = result; fn.argtypes = args; return fn
init = bind('NSS_InitReadWrite', c.c_int, [c.c_char_p])
certdb = bind('CERT_GetDefaultCertDB', c.c_void_p, [])
newcert = bind('CERT_NewTempCertificate', c.c_void_p, [c.c_void_p, c.POINTER(SECItem), c.c_char_p, c.c_int, c.c_int])
slotfn = bind('PK11_GetInternalKeySlot', c.c_void_p, [])
needs = bind('PK11_NeedUserInit', c.c_int, [c.c_void_p])
pin = bind('PK11_InitPin', c.c_int, [c.c_void_p, c.c_char_p, c.c_char_p])
importcert = bind('PK11_ImportCert', c.c_int, [c.c_void_p, c.c_void_p, c.c_ulong, c.c_char_p, c.c_int])
decode = bind('CERT_DecodeTrustString', c.c_int, [c.POINTER(Trust), c.c_char_p])
change = bind('CERT_ChangeCertTrust', c.c_int, [c.c_void_p, c.c_void_p, c.POINTER(Trust)])
destroy = bind('CERT_DestroyCertificate', None, [c.c_void_p])
free = bind('PK11_FreeSlot', None, [c.c_void_p])
shutdown = bind('NSS_Shutdown', c.c_int, [])
def success(status, step):
    if status != 0:
        raise RuntimeError('NSS failed at ' + step)
success(init(('sql:' + str(db)).encode()), 'initialization')
cert = slot = None
try:
    data = Path('/trust/ca.der').read_bytes()
    raw = (c.c_ubyte * len(data)).from_buffer_copy(data)
    item = SECItem(0, raw, len(data))
    cert = newcert(certdb(), c.byref(item), b'E2E temporary CA', 0, 1)
    slot = slotfn()
    if not cert or not slot:
        raise RuntimeError('NSS certificate/slot missing')
    if needs(slot): success(pin(slot, None, b''), 'empty task database PIN')
    success(importcert(slot, cert, 0, b'E2E temporary CA', 0), 'CA import')
    trust = Trust()
    success(decode(c.byref(trust), b'C,,'), 'server CA trust decoding')
    success(change(certdb(), cert, c.byref(trust)), 'server CA trust assignment')
finally:
    if cert: destroy(cert)
    if slot: free(slot)
    success(shutdown(), 'shutdown')
print('TASK_LOCAL_CA_IMPORT_PASS')
