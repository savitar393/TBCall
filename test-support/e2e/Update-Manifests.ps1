# Explicit maintainer operation, never called automatically by execution.
# Review the resulting diff; this does not approve source changes or new artifacts.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$files=@(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Force | ForEach-Object {$_.FullName.Substring($PSScriptRoot.Length+1).Replace('\','/')} | Where-Object { -not $_.StartsWith('.local/') } | Sort-Object)
foreach($path in $files) {
 if($path -match '\.(pem|key|der|pfx|p12|har|log|png|jpg|webm|zip|tgz|gz|sql)$'){throw 'Refusing generated/sensitive file in source manifest'}
}
Save-Json @{files=$files} (Join-Path $PSScriptRoot 'manifest.json')
$entries=@(foreach($path in $files|Where-Object {$_ -match '\.(ps1|mjs|java|sh|py|json|Dockerfile)$' -and $_ -notin @('manifest.json','source.lock.json')}) {
 @{path=$path;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $path)).Hash.ToLowerInvariant()}
})
Save-Json @{files=$entries} (Join-Path $PSScriptRoot 'source.lock.json')
Write-Output 'MANIFESTS_UPDATED reviewRequired=true'
