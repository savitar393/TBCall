# Offline packaging only. Inputs must have been separately acquired and approved.
# Never copies source or node_modules from the Windows working tree.
param([Parameter(Mandatory)][string]$InputDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Assert-ProductionSource $repo
$lock=Get-Content (Join-Path $PSScriptRoot 'toolchain.lock.json') -Raw|ConvertFrom-Json
$inputs=(Resolve-Path -LiteralPath $InputDirectory).Path
if((Get-PSDrive -Name ([IO.Path]::GetPathRoot($PSScriptRoot).Substring(0,1))).Free -lt 10GB){throw 'Reserve at least 10 GiB before preparation'}
foreach($pair in @(@('jdk.tar.gz',$lock.sha256.jdkArchive),@('maven.zip',$lock.sha256.mavenArchive),@('linux-dependencies.tar.gz',$lock.sha256.linuxFrontendDependencies))) {
 if((Get-FileHash -LiteralPath (Join-Path $inputs $pair[0])).Hash.ToLowerInvariant() -cne $pair[1]){throw ('Input hash mismatch: '+$pair[0])}
}
foreach($package in $lock.packages|Where-Object {$_.name -in @('pnpm','playwright','playwright-core')}) {
 if((Get-FileHash -LiteralPath (Join-Path $inputs ($package.name+'-'+$package.version+'.tgz'))).Hash.ToLowerInvariant() -cne $package.sha256.ToLowerInvariant()){throw 'Package archive hash mismatch'}
}
if(-not (Test-Path -LiteralPath (Join-Path $inputs 'maven-repository'))){throw 'Complete trusted Maven cache required; offline packaging will fail on missing artifacts'}
foreach($artifact in $lock.packages|Where-Object {$_.source.StartsWith('https://repo.maven.apache.org/maven2/')}) {
 $relative=$artifact.source.Substring('https://repo.maven.apache.org/maven2/'.Length)
 $jar=Join-Path (Join-Path $inputs 'maven-repository') $relative
 if((Get-FileHash -LiteralPath $jar).Hash.ToLowerInvariant() -cne $artifact.sha256.ToLowerInvariant()){throw 'Maven closure artifact hash mismatch'}
}
foreach($image in @($lock.images.node,$lock.images.postgres,$lock.images.playwright)){D @('image','inspect',$image)|Out-Null}
$buildId=[guid]::NewGuid().ToString('N')
$work=Join-Path $PSScriptRoot ('.local/preparation/'+$buildId)
Assert-ChildPath (Join-Path $PSScriptRoot '.local') $work
New-Item -ItemType Directory -Path $work -Force|Out-Null
$archive=Join-Path $work 'source.tar'
& git -C $repo archive --format=tar --output=$archive $E2EBaseline pom.xml src frontend
if($LASTEXITCODE -ne 0){throw 'Source archive failed'}
$source=Join-Path $work 'source';New-Item -ItemType Directory -Path $source|Out-Null
& tar -xf $archive -C $source
if($LASTEXITCODE -ne 0){throw 'Source extraction failed'}
if((Get-FileHash (Join-Path $source 'frontend/pnpm-lock.yaml')).Hash.ToLowerInvariant() -cne $lock.sha256.frontendLockfile){throw 'Frontend source lock mismatch'}
$manifest=@{baseline=$E2EBaseline}
foreach($component in @('backend','frontend','browser')) {
 $context=Join-Path $work $component;New-Item -ItemType Directory -Path $context|Out-Null
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('build/'+$component+'.Dockerfile')) -Destination (Join-Path $context 'Dockerfile')
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'build/.dockerignore') -Destination $context
 if($component -eq 'backend') {
  $backend=Join-Path $context 'backend';New-Item -ItemType Directory -Path $backend|Out-Null
  Copy-Item -LiteralPath (Join-Path $source 'pom.xml') -Destination $backend
  Copy-Item -LiteralPath (Join-Path $source 'src') -Destination $backend -Recurse
  Copy-Item -LiteralPath (Join-Path $inputs 'jdk.tar.gz') -Destination $context
  Expand-Archive -LiteralPath (Join-Path $inputs 'maven.zip') -DestinationPath (Join-Path $context 'maven-extract')
  Move-Item -LiteralPath (Join-Path $context ('maven-extract/apache-maven-'+$lock.maven)) -Destination (Join-Path $context 'maven')
  Copy-Item -LiteralPath (Join-Path $inputs 'maven-repository') -Destination $context -Recurse
 } elseif($component -eq 'frontend') {
  Copy-Item -LiteralPath (Join-Path $source 'frontend') -Destination $context -Recurse
  Copy-Item -LiteralPath (Join-Path $inputs 'linux-dependencies.tar.gz') -Destination $context
  $pnpm=Join-Path $context 'pnpm';New-Item -ItemType Directory -Path $pnpm|Out-Null
  & tar -xf (Join-Path $inputs ('pnpm-'+$lock.pnpm+'.tgz')) --strip-components=1 -C $pnpm
  if($LASTEXITCODE -ne 0){throw 'pnpm extraction failed'}
 } else {
  foreach($name in @('playwright','playwright-core')) {
   $package=Join-Path $context ('runner/node_modules/'+$name);New-Item -ItemType Directory -Path $package -Force|Out-Null
   & tar -xf (Join-Path $inputs ($name+'-'+$lock.playwright+'.tgz')) --strip-components=1 -C $package
   if($LASTEXITCODE -ne 0){throw 'Playwright extraction failed'}
  }
 }
 $iid=Join-Path $work ($component+'.iid')
 # No mutable tag, implicit base-image pull, install or connected RUN steps.
 D @('build','--pull=false','--network=none','--label',('tbcall.audit.baseline='+$E2EBaseline),'--label','tbcall.e2e.artifact=true','--build-arg',('SOURCE_DATE_EPOCH='+$lock.sourceDateEpoch),'--iidfile',$iid,$context)|Write-Output
 $manifest[$component]=(Get-Content -LiteralPath $iid -Raw).Trim()
}
# Read the packaged jar through a disposable no-network container with no inherited volume.
$id=D @('create','--pull','never','--label','tbcall.e2e.suite=tbcall-f6c','--label',('tbcall.e2e.run='+$buildId),'--label','tbcall.e2e.disposable=true','--network','none','--read-only','--tmpfs','/var/lib/postgresql/data:rw,size=1m','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','sha256sum',$manifest.backend,'/app/backend.jar')
try {
 $output=D @('start','--attach',$id)
 $manifest.backendJarSha256=($output -split ' ')[0]
 if($manifest.backendJarSha256 -notmatch '^[a-f0-9]{64}$'){throw 'Packaged jar hash missing'}
} finally {
 $state=(D @('inspect',$id)|ConvertFrom-Json)[0];Assert-Ownership $state.Config.Labels $buildId
 D @('rm',$id)|Out-Null
}
$path=Join-Path $work 'artifacts.json';Save-Json $manifest $path
Write-Output ('OFFLINE_PREPARATION_PASS manifest='+$path)
