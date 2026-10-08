#!/bin/sh
set -eu
if [ "$1" = stop ]; then
  pid=$(cat /tmp/backend.pid)
  case "$pid" in ''|*[!0-9]*) exit 3;; esac
  grep -aq '/app/backend.jar' "/proc/$pid/cmdline"
  kill -TERM "$pid"
  for i in $(seq 1 40); do
    if ! kill -0 "$pid" 2>/dev/null; then printf '%s\n' 'OWNED_BACKEND_STOPPED';exit 0;fi
    sleep .25
  done
  exit 3
fi
test "$1" = start
echo $$ > /tmp/backend.pid
exec /opt/java/bin/java -jar /app/backend.jar > /tmp/backend-startup.log 2>&1
