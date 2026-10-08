# E2E owned isolation preflight and sequential real smoke testing. No pulls/install.
param([ValidateSet('Full','Preflight','Tls')][string]$Mode='Full',[string]$ArtifactManifest=(Join-Path $PSScriptRoot 'artifacts.reference.json'))
$TlsOnly=$Mode -eq 'Tls';$InfrastructureOnly=$Mode -eq 'Preflight'
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Refusing Windows administrator execution' }
 . (Join-Path $PSScriptRoot 'Common.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Assert-ProductionSource $repo
& (Join-Path $PSScriptRoot 'Test-E2E.ps1')
$runId=[guid]::NewGuid().ToString('N')
$localRoot=Join-Path $PSScriptRoot '.local'
$evidenceDir=Join-Path $localRoot ('runs/'+$runId)
Assert-ChildPath $localRoot $evidenceDir
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
$statePath=Join-Path $evidenceDir 'state.json'
$profile=Join-Path $PSScriptRoot 'security/browser-seccomp.json'
$artifacts=Get-Content -LiteralPath $ArtifactManifest -Raw|ConvertFrom-Json
if($artifacts.baseline -cne $E2EBaseline){throw 'Artifact source baseline mismatch'}
$images=@{}
foreach($component in @('backend','frontend','browser')) {
 $images[$component]=$artifacts.$component
 if($images[$component] -notmatch '^sha256:[a-f0-9]{64}$'){throw 'Only immutable local image IDs accepted'}
 $image=(D @('image','inspect',$images[$component])|ConvertFrom-Json)[0]
 if($image.Os -ne 'linux' -or $image.Architecture -ne 'amd64' -or $image.Config.Labels.'tbcall.audit.baseline' -cne $E2EBaseline){throw 'Missing/mismatched Linux baseline artifact'}
}
$toolchain=Get-Content (Join-Path $PSScriptRoot 'toolchain.lock.json') -Raw|ConvertFrom-Json
$node=$toolchain.images.node; $postgres=$toolchain.images.postgres
foreach($base in @($node,$postgres)){D @('image','inspect',$base)|Out-Null}
$ownedContainers=[Collections.Generic.List[string]]::new(); $ownedNetworks=[Collections.Generic.List[string]]::new()
$auditDir=Join-Path $PSScriptRoot 'harness'; $tls=Join-Path $evidenceDir 'tls'
$nets=@{}; $sinks=@{}; $addr=@{}
$journal=@{runId=$runId;context=(D @('context','show')).Trim();daemon=(D @('info','--format','{{.ID}}')).Trim();containers=@();networks=@();before=(Get-EnvironmentSnapshot);completed=$false;cleanup=$false}
function Journal { $journal.containers=@($ownedContainers.ToArray());$journal.networks=@($ownedNetworks.ToArray());Save-Json $journal $statePath }
Journal
Write-Output ('E2E_RUN_ID='+$runId+' evidence='+$evidenceDir)
function Register-Container([string]$Id){$ownedContainers.Add($Id);Journal}
function Register-Network([string]$Id){$ownedNetworks.Add($Id);Journal}
function Network([string]$role,[bool]$internal,[string]$subnet6) {
 $args=@('network','create','--driver','bridge','--ipv6','--subnet',$subnet6,'--label',"tbcall.e2e.run=$runId",'--label','tbcall.e2e.suite=tbcall-f6c','--label','tbcall.e2e.disposable=true')
 if($internal) { $args+='--internal' }
 $id=D ($args+('tbcall-'+$runId+'-'+$role)); Register-Network $id; return $id
}
function Container([string[]]$ContainerArgs) {
 $id=D (@('create','--pull','never','--label',"tbcall.e2e.run=$runId",'--label','tbcall.e2e.suite=tbcall-f6c','--label','tbcall.e2e.disposable=true','--mount',"type=bind,src=$auditDir,dst=/audit,readonly",'--dns','127.0.0.1','--dns-option','timeout:1','--dns-option','attempts:1')+$ContainerArgs)
 Register-Container $id
 $state=(D @('inspect',$id) | ConvertFrom-Json)[0]
 foreach($mount in @($state.Mounts | Where-Object Type -eq bind)) {
  $auditMount=$mount.Destination -eq '/audit' -and $mount.Source.Replace('\','/').ToLowerInvariant() -eq $auditDir.Replace('\','/').ToLowerInvariant()
  $serverMount=$mount.Destination -eq '/tls' -and $mount.Source.Replace('\','/').ToLowerInvariant() -eq (Join-Path $tls 'server').Replace('\','/').ToLowerInvariant()
  $trustMount=$mount.Destination -eq '/trust' -and $mount.Source.Replace('\','/').ToLowerInvariant() -eq (Join-Path $tls 'public').Replace('\','/').ToLowerInvariant()
  if($mount.RW -or -not ($auditMount -or $serverMount -or $trustMount)){throw 'Unexpected read-write or unrelated bind mount'}
 }
 if($state.Config.Labels.'tbcall.e2e.run' -ne $runId -or @($state.HostConfig.PortBindings.PSObject.Properties).Count -or @($state.Mounts | Where-Object Type -eq volume).Count) { throw 'Container ownership/mount/publication assertion failed' }
 return $id
}
function Addresses([string]$id,[string]$network) {
 $state=(D @('inspect',$id) | ConvertFrom-Json)[0]; $endpoint=$state.NetworkSettings.Networks.$network
 if(-not $endpoint.IPAddress -or -not $endpoint.GlobalIPv6Address) { throw 'Missing owned dual-stack addresses' }
 return @($endpoint.IPAddress,$endpoint.GlobalIPv6Address)
}
function SinkCounts([string]$id) {
 $logs=D @('logs',$id)
 return [ordered]@{http=@(($logs -split "`n") | Where-Object {$_ -match '^OWNED_HTTP_REQUEST'}).Count;dns=@(($logs -split "`n") | Where-Object {$_ -match '^DNS_QUERY'}).Count;stun4=@(($logs -split "`n") | Where-Object {$_ -eq 'STUN_REQUEST family=udp4'}).Count;stun6=@(($logs -split "`n") | Where-Object {$_ -eq 'STUN_REQUEST family=udp6'}).Count}
}
function WaitFor([string]$id,[string]$pattern,[int]$seconds=40) {
 $watch=[Diagnostics.Stopwatch]::StartNew()
 while($watch.Elapsed.TotalSeconds -lt $seconds) { if((D @('logs',$id)) -match $pattern) {return}; Start-Sleep -Milliseconds 250 }
 throw ('Owned readiness timeout: '+$id)
}
 $envNames=@('POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB','PGUSER','PGPASSWORD','PGDATABASE','TBCALL_DB_URL','TBCALL_DB_USER','TBCALL_DB_PASSWORD','TBCALL_BOOTSTRAP_EMAIL','TBCALL_BOOTSTRAP_PASSWORD','E2E_SINK_SANS')
$previousEnv=@{};foreach($name in $envNames){$previousEnv[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$env:POSTGRES_USER='e2e_owned_user'; $env:POSTGRES_DB='tbcall_e2e_smoke'; $env:POSTGRES_PASSWORD=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$env:PGUSER=$env:POSTGRES_USER; $env:PGDATABASE=$env:POSTGRES_DB; $env:PGPASSWORD=$env:POSTGRES_PASSWORD
$env:TBCALL_DB_URL='jdbc:postgresql://database:5432/'+$env:POSTGRES_DB; $env:TBCALL_DB_USER=$env:POSTGRES_USER; $env:TBCALL_DB_PASSWORD=$env:POSTGRES_PASSWORD
$common=@('--read-only','--tmpfs','/tmp:rw,nosuid,size=256m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','256')
try {
 New-Item -ItemType Directory -Path $tls | Out-Null
 $nets=@{}; $sinks=@{}; $addr=@{}
 $sinkIPs=@{};$sans=[Collections.Generic.List[string]]::new()
 $roles=@('db','api','web','outside'); $index=1
 foreach($role in $roles) {
  # The outside sink is outside the application networks, not on the Internet.
  # Positive-control Chromium containers must also retain internal-only networking.
  $nets[$role]=Network $role $true ('fd'+$runId.Substring(0,2)+':'+$runId.Substring(2,4)+':'+$runId.Substring(6,4)+':'+$index+'::/64'); $index++
  $config=(D @('network','inspect',$nets[$role])|ConvertFrom-Json)[0].IPAM.Config
  $subnet4=($config|Where-Object Subnet -NotMatch ':').Subnet.Split('/')[0];$subnet6=($config|Where-Object Subnet -Match ':').Subnet.Split('/')[0]
  $bytes=[Net.IPAddress]::Parse($subnet4).GetAddressBytes();$bytes[3]+=2;$v4=([Net.IPAddress]::new($bytes)).ToString();$v6=$subnet6+'2';$sinkIPs[$role]=@($v4,$v6);$sans.Add('IP:'+$v4);$sans.Add('IP:'+$v6)
 }
 $env:E2E_SINK_SANS=$sans -join ','
 $generator=D @('create','--pull','never','--label',"tbcall.e2e.run=$runId",'--label','tbcall.e2e.suite=tbcall-f6c','--label','tbcall.e2e.disposable=true','--network','none','--read-only','--tmpfs','/var/lib/postgresql/data:rw,size=1m','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',"type=bind,src=$tls,dst=/tls",'--mount',"type=bind,src=$auditDir,dst=/audit,readonly",'--env','E2E_SINK_SANS','--entrypoint','sh',$postgres,'/audit/generate-tls.sh');Register-Container $generator
 D @('start','--attach',$generator)|Write-Output
 $generatorState=(D @('inspect',$generator)|ConvertFrom-Json)[0];if($generatorState.State.ExitCode -ne 0){throw 'TLS generation failed'}
 $serverDir=Join-Path $tls 'server';$publicDir=Join-Path $tls 'public'
 foreach($role in $roles) {
  $sinks[$role]=Container (@('--name',('tbcall-'+$runId+'-sink-'+$role),'--network',$nets[$role],'--ip',$sinkIPs[$role][0],'--ip6',$sinkIPs[$role][1],'--mount',"type=bind,src=$serverDir,dst=/tls,readonly",'--network-alias',('owned-'+$role),'--user','1000:1000','--cap-add','NET_BIND_SERVICE')+$common+@('--entrypoint','node',$node,'/audit/OwnedSink.mjs'))
  D @('start',$sinks[$role]) | Out-Null; WaitFor $sinks[$role] 'OWNED_SINK_READY'; $addr[$role]=Addresses $sinks[$role] ('tbcall-'+$runId+'-'+$role)
 }
 $java=Container (@('--name',('tbcall-'+$runId+'-java'),'--network',$nets.db,'--network-alias','backend','--user','1000:1000','--tmpfs','/var/lib/postgresql/data:rw,size=1m','--env','TBCALL_DB_URL','--env','TBCALL_DB_USER','--env','TBCALL_DB_PASSWORD','--env','TBCALL_CORS_ALLOWED_ORIGINS=https://app.tbcall.test:3443','--env','TBCALL_MONITORING_SCHEDULER_ENABLED=false','--env','SPRING_PROFILES_ACTIVE=test','--env','TBCALL_PRODUCTION=false','--env','TBCALL_EXPOSE_VERIFICATION_TOKENS=true','--env','TBCALL_COOKIE_SECURE=true')+$common+@('--entrypoint','sh',$images.backend,'-c','sleep 7200'))
 D @('network','connect','--alias','backend',$nets.api,$java)|Out-Null
 $next=Container (@('--name',('tbcall-'+$runId+'-next'),'--network',$nets.api,'--network-alias','frontend','--user','1000:1000','--env','TBCALL_BACKEND_URL=http://backend:8080','--env','HOME=/tmp','--tmpfs','/app/.next/cache:rw,size=128m,uid=1000,gid=1000')+$common+@('--entrypoint','sh',$images.frontend,'-c','sleep 7200'))
 D @('network','connect','--alias','frontend',$nets.web,$next)|Out-Null
 $browser=Container (@('--name',('tbcall-'+$runId+'-browser'),'--network',$nets.web,'--user','1001:1001','--mount',"type=bind,src=$publicDir,dst=/trust,readonly",'--security-opt',"seccomp=$profile",'--ipc','private','--shm-size','512m','--env','HOME=/tmp/e2e-browser')+$common+@('--memory','2g','--pids-limit','768','--tmpfs','/tmp:rw,nosuid,size=512m','--entrypoint','sh',$images.browser,'-c','sleep 7200'))
 $gateway=Container (@('--name',('tbcall-'+$runId+'-https'),'--network',$nets.web,'--network-alias','app.tbcall.test','--network-alias','wrong-host.tbcall.test','--network-alias','untrusted.tbcall.test','--user','1000:1000','--mount',"type=bind,src=$serverDir,dst=/tls,readonly")+$common+@('--entrypoint','node',$node,'/audit/https-gateway.mjs'))
 $pg=Container @('--name',('tbcall-'+$runId+'-postgres'),'--network',$nets.db,'--network-alias','database','--read-only','--tmpfs','/tmp:rw,nosuid,size=128m','--tmpfs','/var/lib/postgresql/data:rw,size=512m','--tmpfs','/var/run/postgresql:rw,size=16m','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','FOWNER','--cap-add','DAC_OVERRIDE','--cap-add','SETUID','--cap-add','SETGID','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--pids-limit','128','--env','POSTGRES_USER','--env','POSTGRES_PASSWORD','--env','POSTGRES_DB','--env','PGUSER','--env','PGPASSWORD','--env','PGDATABASE','--user','0:0','--entrypoint','docker-entrypoint.sh',$images.backend,'postgres')
 D @('start',$java,$next,$browser,$pg,$gateway)|Out-Null
 $jarHash=D @('exec',$java,'sha256sum','/app/backend.jar');Write-Output $jarHash
 if($artifacts.backendJarSha256 -notmatch '^[a-f0-9]{64}$' -or -not $jarHash.StartsWith($artifacts.backendJarSha256)){throw 'Prepared backend artifact mismatch'}
 $nextVersions=D @('exec',$next,'node','-e','console.log(JSON.stringify({node:process.version,next:require("next/package.json").version,react:require("react/package.json").version}))');Write-Output $nextVersions
 $v=$nextVersions|ConvertFrom-Json;if($v.node -ne 'v24.15.0' -or $v.next -ne '16.3.8' -or $v.react -ne '19.3.0'){throw 'Frontend toolchain mismatch'}
 $browserVersions=D @('exec',$browser,'/opt/node/bin/node','-e','console.log(JSON.stringify({node:process.version,playwright:require("/runner/node_modules/playwright/package.json").version}))');Write-Output $browserVersions
 $v=$browserVersions|ConvertFrom-Json;if($v.node -ne 'v24.15.0' -or $v.playwright -ne '1.62.1'){throw 'Browser toolchain mismatch'}
 $javaVersion=D @('exec',$java,'/opt/java/bin/java','-version');if($javaVersion -notmatch '21\.0\.12\.1'){throw 'Java toolchain mismatch'}
 Write-Output $javaVersion
 WaitFor $gateway 'INTERNAL_HTTPS_GATEWAY_READY'
 D @('exec','--env','HOME=/tmp/e2e-untrusted',$browser,'/opt/node/bin/node','/audit/tls-probe.mjs','untrusted')|Write-Output
 D @('exec',$browser,'python3','/audit/import-ca.py')|Write-Output
 D @('exec',$browser,'/opt/node/bin/node','/audit/tls-probe.mjs','trusted')|Write-Output
 if($TlsOnly){Write-Output 'E2E_TLS_GATE_PASS';return}
 $control=Container (@('--name',('tbcall-'+$runId+'-node-control'),'--network',$nets.outside,'--dns',$addr.outside[0],'--user','1000:1000')+$common+@('--entrypoint','sh',$node,'-c','sleep 7200'))
 $browserControl=Container (@('--name',('tbcall-'+$runId+'-browser-control'),'--network',$nets.outside,'--dns',$addr.outside[0],'--user','1001:1001','--mount',"type=bind,src=$publicDir,dst=/trust,readonly",'--security-opt',"seccomp=$profile",'--ipc','private','--shm-size','512m','--env','HOME=/tmp/e2e-control')+$common+@('--memory','1g','--entrypoint','sh',$images.browser,'-c','sleep 7200'))
 D @('start',$control,$browserControl)|Out-Null
 D @('exec',$browserControl,'python3','/audit/import-ca.py')|Write-Output
 $javaControl=Container (@('--name',('tbcall-'+$runId+'-java-control'),'--network',$nets.outside,'--dns',$addr.outside[0],'--user','1000:1000','--tmpfs','/var/lib/postgresql/data:rw,size=1m')+$common+@('--entrypoint','sh',$images.backend,'-c','sleep 7200'))
 D @('start',$javaControl)|Out-Null
 D (@('exec',$javaControl,'/opt/java/bin/java','/audit/NetworkProbe.java','control')+$addr.outside+$addr.outside)|Write-Output
 D (@('exec',$control,'node','/audit/NodeNetworkProbe.mjs','control')+$addr.outside+$addr.outside)|Write-Output
 D (@('exec',$browserControl,'/opt/node/bin/node','/audit/BrowserNetworkProbe.mjs','control')+$addr.outside+$addr.outside)|Write-Output
 $before=SinkCounts $sinks.outside; Write-Output ('OUTSIDE_COUNTS_BEFORE='+($before|ConvertTo-Json -Compress))
 if($before.http -lt 1 -or $before.dns -lt 1 -or $before.stun4 -lt 1 -or $before.stun6 -lt 1){throw 'Outside positive-control counters incomplete'}
 foreach($role in @('db','api')) { D (@('exec',$java,'/opt/java/bin/java','/audit/NetworkProbe.java','isolated')+$addr[$role]+$addr.outside)|Write-Output }
 foreach($role in @('api','web')) { D (@('exec',$next,'node','/audit/NodeNetworkProbe.mjs','isolated')+$addr[$role]+$addr.outside)|Write-Output }
 $watch=[Diagnostics.Stopwatch]::StartNew(); $ready=$false
 while($watch.Elapsed.TotalSeconds -lt 40) { & docker exec $pg pg_isready -q -h 127.0.0.1 2>&1|Out-Null; if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 250 }
 if(-not $ready){throw 'Owned PG final TCP readiness failed'}
 $pgVersion=D @('exec',$pg,'postgres','--version');Write-Output $pgVersion
 if($pgVersion -notmatch 'PostgreSQL\) 16\.15'){throw 'PostgreSQL toolchain mismatch'}
 $empty=D @('exec',$pg,'psql','-h','127.0.0.1','-X','-At','-v','ON_ERROR_STOP=1','-c',"select current_database(),(select count(*) from information_schema.tables where table_schema='public');")
 Write-Output $empty; if($empty.Trim() -ne 'tbcall_e2e_smoke|0'){throw 'Owned database empty-state assertion failed'}
 $pgProgram='sh /audit/pg-network-probe.sh '+(($addr.db+$addr.outside)-join ' ')
 D @('exec',$pg,'psql','-h','127.0.0.1','-X','-At','-v','ON_ERROR_STOP=1','-c',"COPY (SELECT 1) TO PROGRAM '$pgProgram'; select pg_read_file('/tmp/postgres-network-probe.log');")|Write-Output
 D (@('exec',$browser,'/opt/node/bin/node','/audit/BrowserNetworkProbe.mjs','isolated')+$addr.web+$addr.outside)|Write-Output
 Write-Output 'NON_PEER_INTERNAL_NETWORK_NEGATIVE_CHECKS'
 D (@('exec',$java,'/opt/java/bin/java','/audit/NetworkProbe.java','isolated')+$addr.db+$addr.web)|Write-Output
 D (@('exec',$next,'node','/audit/NodeNetworkProbe.mjs','isolated')+$addr.web+$addr.db)|Write-Output
 foreach($role in @('api','web')) {
  $pgProgram='sh /audit/pg-network-probe.sh '+(($addr.db+$addr[$role])-join ' ')
  D @('exec',$pg,'psql','-h','127.0.0.1','-X','-At','-v','ON_ERROR_STOP=1','-c',"COPY (SELECT 1) TO PROGRAM '$pgProgram'; select pg_read_file('/tmp/postgres-network-probe.log');")|Write-Output
 }
 foreach($role in @('api','db')) {D (@('exec',$browser,'/opt/node/bin/node','/audit/BrowserNetworkProbe.mjs','isolated')+$addr.web+$addr[$role])|Write-Output}
 $after=SinkCounts $sinks.outside; Write-Output ('OUTSIDE_COUNTS_AFTER='+($after|ConvertTo-Json -Compress))
 if(($before|ConvertTo-Json -Compress) -cne ($after|ConvertTo-Json -Compress)){throw 'Isolated probes reached outside sink'}
 foreach($component in @($java,$next,$browser,$pg)) {
  D @('exec',$component,'sh','-c','cat /proc/net/route; cat /proc/net/ipv6_route; cat /etc/resolv.conf; grep -E "Uid|CapEff|NoNewPrivs|Seccomp" /proc/1/status')|Write-Output
 }
 Write-Output 'RUNTIME_ISOLATION_COMPONENT_GATES_PASS'
 # Application startup only after ownership and containment gates, on this own DB.
 D @('exec','--detach',$java,'sh','/audit/restart-backend.sh','start')|Out-Null
 $watch.Restart();$started=$false
 while($watch.Elapsed.TotalSeconds -lt 75) { $startup=D @('exec',$java,'cat','/tmp/backend-startup.log'); if($startup -match 'Started .*Application in'){ $started=$true;break }; if($startup -match 'APPLICATION FAILED TO START'){throw 'Owned Spring startup failed'};Start-Sleep -Milliseconds 500 }
 $startup|Set-Content -LiteralPath (Join-Path $evidenceDir 'runtime-backend-startup.log') -Encoding utf8
 if(-not $started){throw 'Owned Spring startup timeout'}
 $migrations=D @('exec',$pg,'psql','-h','127.0.0.1','-X','-At','-v','ON_ERROR_STOP=1','-c',"select count(*),max(version::int),bool_and(success) from flyway_schema_history where version is not null; select count(*) from users;")
 Write-Output $migrations; if(($migrations.Trim() -replace "`r",'') -ne "17|17|t`n0"){throw 'Migration/account assertion failed'}
 D @('exec','--detach',$next,'sh','-c','exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000 > /tmp/next-startup.log 2>&1')|Out-Null
 $watch.Restart();$started=$false
 while($watch.Elapsed.TotalSeconds -lt 40) { $nextLog=D @('exec',$next,'cat','/tmp/next-startup.log');if($nextLog -match 'Ready in'){ $started=$true;break };Start-Sleep -Milliseconds 300 }
 $nextLog|Set-Content -LiteralPath (Join-Path $evidenceDir 'runtime-frontend-startup.log') -Encoding utf8
 if(-not $started){throw 'Owned Next startup timeout'}
 D @('exec',$next,'node','--input-type=module','-e','const direct=await fetch("http://backend:8080/api/e2e-owned-probe"); const proxy=await fetch("http://frontend:3000/api/tbcall/e2e-owned-probe"); console.log(JSON.stringify({direct:direct.status,proxy:proxy.status})); if(direct.status!==proxy.status||proxy.status===503)process.exit(3);')|Write-Output
 D (@('exec',$java,'/opt/java/bin/java','/audit/NetworkProbe.java','isolated')+$addr.db+$addr.outside)|Write-Output
 D (@('exec',$next,'node','/audit/NodeNetworkProbe.mjs','isolated')+$addr.api+$addr.outside)|Write-Output
 $browserFinal=D (@('exec',$browser,'/opt/node/bin/node','/audit/BrowserNetworkProbe.mjs','isolated')+$addr.web+$addr.outside)
 Write-Output $browserFinal;if($browserFinal -notmatch 'BROWSER_STACK_COMMUNICATION_PASS'){throw 'Browser-to-Next-to-Spring gate missing'}
 foreach($component in @($java,$next)) {D @('exec',$component,'sh','-c','for p in /proc/[0-9]*; do if grep -aqE "java|next-server" "$p/cmdline"; then cat "$p/comm"; grep -E "Uid|CapEff|NoNewPrivs|Seccomp" "$p/status"; fi; done')|Write-Output}
 $final=SinkCounts $sinks.outside;Write-Output ('OUTSIDE_COUNTS_FINAL='+($final|ConvertTo-Json -Compress));if(($before|ConvertTo-Json -Compress) -cne ($final|ConvertTo-Json -Compress)){throw 'Started stack reached outside sink'}
 Write-Output 'E2E_TLS_ISOLATION_DATABASE_STARTUP_GATES_PASS'
 if($InfrastructureOnly){return}
 # The preflight session-cookie probe requires only a supported bootstrap fixture.
 $env:TBCALL_BOOTSTRAP_EMAIL='e2e-admin-'+[guid]::NewGuid().ToString('N')+'@example.invalid'
 $env:TBCALL_BOOTSTRAP_PASSWORD='F6b!'+[guid]::NewGuid().ToString('N')
 D @('exec',$java,'sh','/audit/restart-backend.sh','stop')|Write-Output
 D @('exec',$java,'sh','-c',': > /tmp/backend-startup.log')|Out-Null
 D @('exec','--detach','--env','TBCALL_BOOTSTRAP_EMAIL','--env','TBCALL_BOOTSTRAP_PASSWORD',$java,'sh','/audit/restart-backend.sh','start')|Out-Null
 $watch.Restart();$started=$false
 while($watch.Elapsed.TotalSeconds -lt 75){$bootLog=D @('exec',$java,'cat','/tmp/backend-startup.log');if($bootLog -match 'Started .*Application in'){$started=$true;break};if($bootLog -match 'APPLICATION FAILED TO START'){throw 'Bootstrap startup failed'};Start-Sleep -Milliseconds 500}
 if(-not $started){throw 'Bootstrap readiness timeout'}
 # Detached owned runner permits controlled JVM restart without retrying any command.
 D @('exec','--detach','--env','TBCALL_BOOTSTRAP_EMAIL','--env','TBCALL_BOOTSTRAP_PASSWORD',$browser,'sh','-c','/opt/node/bin/node /audit/run-smoke.mjs > /tmp/e2e-runner.log 2>&1; printf "%s" "$?" > /tmp/e2e-runner.exit')|Out-Null
 $runnerWatch=[Diagnostics.Stopwatch]::StartNew();$schedulerStarted=$false;$runnerExit=$null
 try {
  while($runnerWatch.Elapsed.TotalSeconds -lt 1800) {
   $state=D @('exec',$browser,'sh','-c','if test -f /tmp/e2e-runner.exit; then printf "DONE "; cat /tmp/e2e-runner.exit; elif test -f /tmp/e2e-scheduler-ready; then printf READY; else printf RUNNING; fi')
   if($state.StartsWith('DONE ')){$runnerExit=[int]$state.Substring(5);break}
   if($state -eq 'READY' -and -not $schedulerStarted) {
    Write-Output 'CONTROLLED_NONPRODUCTION_SCHEDULER enabling=true intervalMs=1000 profile=test'
    D @('exec',$java,'sh','/audit/restart-backend.sh','stop')|Write-Output
    D @('exec',$java,'sh','-c',': > /tmp/backend-startup.log')|Out-Null
    D @('exec','--detach','--env','TBCALL_MONITORING_SCHEDULER_ENABLED=true','--env','TBCALL_MONITORING_SWEEP_INTERVAL_MS=1000',$java,'sh','/audit/restart-backend.sh','start')|Out-Null
    $schedulerWatch=[Diagnostics.Stopwatch]::StartNew();$schedulerReady=$false
    while($schedulerWatch.Elapsed.TotalSeconds -lt 75){$schedulerLog=D @('exec',$java,'cat','/tmp/backend-startup.log');if($schedulerLog -match 'Started .*Application in'){$schedulerReady=$true;break};if($schedulerLog -match 'APPLICATION FAILED TO START'){throw 'Controlled scheduler startup failed'};Start-Sleep -Milliseconds 500}
    if(-not $schedulerReady){throw 'Controlled scheduler startup timeout'}
    $schedulerLog|Set-Content -LiteralPath (Join-Path $evidenceDir 'scheduler-startup.log') -Encoding utf8
    D @('exec',$browser,'sh','-c','printf enabled > /tmp/e2e-scheduler-enabled')|Out-Null
    $schedulerStarted=$true
   }
   Start-Sleep -Milliseconds 750
  }
  D @('exec',$browser,'cat','/tmp/e2e-runner.log')|Write-Output
  if($null -eq $runnerExit){throw 'Bounded E2E runner deadline expired'}
 } finally {
  # Preserve an incomplete run when collection succeeds; never mask its original failure.
  try {
  # This Docker daemon's archive API omits tmpfs; use verified process reads.
  D @('exec',$browser,'cat','/tmp/e2e-results.json')|Set-Content -LiteralPath (Join-Path $evidenceDir 'results.json') -Encoding utf8
  D @('exec',$browser,'cat','/tmp/e2e-runner.log')|Set-Content -LiteralPath (Join-Path $evidenceDir 'runner-summary.log') -Encoding utf8
  } catch {Write-Output 'EVIDENCE_COLLECTION_INCOMPLETE'}
 }
 # Assertion SQL/IDs stay transient. Only sanitized key/count/status is retained.
 $assertionState=D @('exec',$browser,'sh','-c','if test -f /tmp/e2e-db-assertions.json; then cat /tmp/e2e-db-assertions.json; else printf "[]"; fi')|ConvertFrom-Json
 $databaseResults=@();$ledger=Get-Content -LiteralPath (Join-Path $evidenceDir 'results.json') -Raw|ConvertFrom-Json
 foreach($assertion in $assertionState) {
  if($assertion.key -notmatch '^[A-Z_]+$' -or $assertion.scenario -notmatch '^D[0-9]{2}$' -or $assertion.sql -notmatch '^select count' -or $assertion.sql -match ';|--|/\*'){throw 'Read-only diagnostic assertion guard failed'}
  # Transaction read-only also rejects writable functions/CTEs irrespective text checks.
  $actual=D @('exec','--env','PGOPTIONS=-c default_transaction_read_only=on',$pg,'psql','-h','127.0.0.1','-X','-At','-v','ON_ERROR_STOP=1','-c',$assertion.sql)
  if($actual.Trim() -notmatch '^[0-9]+$'){throw 'Unexpected diagnostic count output'}
  $passed=$actual.Trim() -eq $assertion.expected
  $databaseResults+=@{scenario=$assertion.scenario;key=$assertion.key;expected=$assertion.expected;actual=$actual.Trim();status=$(if($passed){'PASS'}else{'FAIL'})}
  if(-not $passed){$entry=$ledger.results|Where-Object id -eq $assertion.scenario;$entry.status='FAIL';$entry.actual='DATABASE_ASSERTION_MISMATCH';$runnerExit=3}
 }
 $databaseResults|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $evidenceDir 'database-assertions.json') -Encoding utf8
 $ledger|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $evidenceDir 'results.json') -Encoding utf8
 Write-Output ('E2E_DATABASE_ASSERTIONS count='+$databaseResults.Count+' failed='+@($databaseResults|Where-Object status -eq FAIL).Count)
 # Recheck the actual browser subprocesses and running Java/Node after commands.
 D (@('exec',$java,'/opt/java/bin/java','/audit/NetworkProbe.java','isolated')+$addr.db+$addr.outside)|Write-Output
 D (@('exec',$next,'node','/audit/NodeNetworkProbe.mjs','isolated')+$addr.api+$addr.outside)|Write-Output
 D (@('exec',$browser,'/opt/node/bin/node','/audit/BrowserNetworkProbe.mjs','isolated')+$addr.web+$addr.outside)|Write-Output
 $post=SinkCounts $sinks.outside;Write-Output ('OUTSIDE_COUNTS_POST_SMOKE='+($post|ConvertTo-Json -Compress));if(($before|ConvertTo-Json -Compress) -cne ($post|ConvertTo-Json -Compress)){throw 'Smoke workflow reached off-network sink'}
 D @('exec',$pg,'psql','-h','127.0.0.1','-X','-At','-v','ON_ERROR_STOP=1','-c','select action,count(*) from audit_logs group by action order by action;')|Set-Content -LiteralPath (Join-Path $evidenceDir 'audit-action-counts.txt') -Encoding utf8
 if($runnerExit -ne 0){throw 'E2E_SMOKE_ASSERTIONS_DID_NOT_PASS See local results.json'}
 $coverage=Get-Content (Join-Path $PSScriptRoot 'coverage.json') -Raw|ConvertFrom-Json
 Assert-Coverage $coverage $ledger $databaseResults
 $journal.completed=$true;Journal
 Write-Output 'E2E_FULL_PASS scenarios=56 databaseAssertions=58 mutationRetries=0'
} finally {
 $cleanupErrors=[Collections.Generic.List[string]]::new()
 try {Remove-OwnedResources $journal;Assert-NoOwnedResources $runId}catch{$cleanupErrors.Add('Docker resources')}
 foreach($name in $envNames){[Environment]::SetEnvironmentVariable($name,$previousEnv[$name],'Process')}
 try {
  if(Test-Path -LiteralPath $tls){Assert-ChildPath $evidenceDir $tls;Remove-Item -LiteralPath $tls -Recurse -Force}
 }catch{$cleanupErrors.Add('Transient TLS directory')}
 try {Assert-Preservation $journal.before (Get-EnvironmentSnapshot)}catch{$cleanupErrors.Add('Preservation inventory')}
 $journal.cleanup=$cleanupErrors.Count -eq 0;Journal
 if($cleanupErrors.Count){throw ('E2E_CLEANUP_FAILED '+($cleanupErrors -join ', '))}
 Write-Output 'E2E_CLEANUP_PASS ownedResourcesAbsent=true certificatesRemoved=true preservationMatched=true'
}
