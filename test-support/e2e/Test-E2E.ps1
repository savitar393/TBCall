# Local static checks only. No container creation, installation or networking.
param([switch]$CheckStaged)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Assert-ProductionSource $repo
$manifest=Get-Content (Join-Path $PSScriptRoot 'manifest.json') -Raw|ConvertFrom-Json
$actual=@(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Force | Where-Object { $_.FullName -notlike (Join-Path $PSScriptRoot '.local/*') } | ForEach-Object {$_.FullName.Substring($PSScriptRoot.Length+1).Replace('\','/')} | Sort-Object)
$expected=@($manifest.files|Sort-Object)
if(($actual -join '|') -cne ($expected -join '|')){throw 'Proposed manifest differs from files present'}
foreach($path in $manifest.files) {
 if($path -match '(^|/)\.local/|\.(pem|key|der|pfx|p12|har|log|png|jpg|webm|zip|tgz|gz|sql)$'){throw 'Sensitive/generated manifest entry refused'}
 Assert-ChildPath $PSScriptRoot (Join-Path $PSScriptRoot $path)
}
$lock=Get-Content (Join-Path $PSScriptRoot 'source.lock.json') -Raw|ConvertFrom-Json
foreach($entry in $lock.files) {
 if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $entry.path)).Hash.ToLowerInvariant() -cne $entry.sha256){throw ('Source hash mismatch: '+$entry.path)}
}
foreach($path in $manifest.files|Where-Object {$_ -like '*.ps1'}) {
 $tokens=$null;$errors=$null
 [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $path),[ref]$tokens,[ref]$errors)|Out-Null
 if($errors.Count){throw ('PowerShell parse failed: '+$path)}
}
foreach($path in $manifest.files|Where-Object {$_ -like '*.mjs'}) {
 & node --check (Join-Path $PSScriptRoot $path)
 if($LASTEXITCODE -ne 0){throw ('Node parse failed: '+$path)}
}
& node (Join-Path $PSScriptRoot 'tests/Static.mjs')
if($LASTEXITCODE -ne 0){throw 'Static security/coverage checks failed'}
& (Join-Path $PSScriptRoot 'tests/Safety.Tests.ps1')
if($CheckStaged) {
 $staged=@(& git -C $repo diff --cached --name-only)
 if($LASTEXITCODE -ne 0 -or -not $staged.Count){throw 'No staged manifest'}
 foreach($path in $staged) {
  if(-not $path.StartsWith('test-support/e2e/') -or $path.Substring(17) -notin $manifest.files){throw 'Unexpected staged path'}
  # Compare the staged object bytes with the reviewed working file, including profiles.
  $index=& git -C $repo rev-parse (':'+$path)
  $working=& git -C $repo hash-object --path=$path (Join-Path $repo $path)
  if($index -cne $working){throw 'Staged contents differ from verified files'}
 }
}
Write-Output ('STATIC_MANIFEST_PASS files='+$manifest.files.Count+' trackedDependenciesChanged=false')
