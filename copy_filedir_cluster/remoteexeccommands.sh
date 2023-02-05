#!/bin/bash

servidores=$(cat clusterremotes.txt)

for host in $servidores; do
    echo "${host}"
    sshpass -fmypass scp -r /home/sysadmin/projects/git-crypt-keys/* $host/projects/git-crypt-keys/
done