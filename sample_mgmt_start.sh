PATH=/www/server/nodejs/v24.14.0/bin:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export 
export NODE_PROJECT_NAME="sample_mgmt"
cd /www/wwwroot/sample-mgmt
nohup /www/server/nodejs/v24.14.0/bin/node /www/wwwroot/sample-mgmt/server.js  &>> /www/wwwlogs/nodejs/sample_mgmt.log &
echo $! > /www/server/nodejs/vhost/pids/sample_mgmt.pid
