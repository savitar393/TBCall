# Read-only independent verification; pass the state.json printed by the runner.
param([Parameter(Mandatory)][string]$StatePath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-ChildPath (Join-Path $PSScriptRoot '.local/runs') $StatePath
$state=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
Assert-Daemon $state
Assert-NoOwnedResources $state.runId
if(Test-Path -LiteralPath (Join-Path (Split-Path $StatePath) 'tls')){throw 'Temporary certificate directory remains'}
Assert-Preservation $state.before (Get-EnvironmentSnapshot)
Assert-ProductionSource ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')))
Write-Output ('INDEPENDENT_CLEANUP_PASS run='+$state.runId+' ownershipChecked=true exactPreservation=true')
