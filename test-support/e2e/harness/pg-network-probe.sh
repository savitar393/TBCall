#!/bin/sh
echo "POSTGRES_PROGRAM_UID=$(id -u)" > /tmp/postgres-network-probe.log
/opt/java/bin/java /audit/NetworkProbe.java isolated "$@" >> /tmp/postgres-network-probe.log 2>&1
