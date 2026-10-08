# Opt-in recovery after interruption. Never prunes volumes or unrelated resources.
param([Parameter(Mandatory)][string]$StatePath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-ChildPath (Join-Path $PSScriptRoot '.local/runs') $StatePath
$state=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
Remove-OwnedResources $state
$tls=Join-Path (Split-Path $StatePath) 'tls'
if(Test-Path -LiteralPath $tls){Assert-ChildPath (Split-Path $StatePath) $tls;Remove-Item -LiteralPath $tls -Recurse -Force}
& (Join-Path $PSScriptRoot 'Verify-Cleanup.ps1') -StatePath $StatePath
