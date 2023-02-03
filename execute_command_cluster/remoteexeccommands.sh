#!/bin/bash

servidores=$(cat clusterremotes.txt)

for host in $servidores; do
    echo "${host}"
    sshpass -fmypass ssh $host 'bash -s' < commands.sh
done