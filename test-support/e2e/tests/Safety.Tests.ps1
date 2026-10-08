$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../Common.ps1')
$checks=0
function Accept([scriptblock]$Check) { & $Check; $script:checks++ }
function Reject([scriptblock]$Check) {
 $rejected=$false
 try { & $Check } catch { $rejected=$true }
 if(-not $rejected){throw 'Unsafe input accepted'}
 $script:checks++
}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local'))
Accept { Assert-ChildPath $root (Join-Path $root 'runs/abc/tls') }
Reject { Assert-ChildPath $root $root }
Reject { Assert-ChildPath $root (Join-Path $root '../outside') }
Reject { Assert-ChildPath $root ($root+'-other/file') }
$run='0123456789abcdef0123456789abcdef'
$labels=@{'tbcall.e2e.suite'='tbcall-f6c';'tbcall.e2e.run'=$run;'tbcall.e2e.disposable'='true'}
Accept { Assert-Ownership $labels $run }
Reject { Assert-Ownership $labels ('f'*32) }
Reject { Assert-Ownership @{'tbcall.e2e.run'=$run} $run }
Reject { Assert-Ownership $labels 'not-a-run' }
$contract=@{scenarios=@(@{id='A01'});database=@(@{scenario='D01';key='COUNT';expected='1'},@{scenario='D01';key='COUNT';expected='1'})}
$ledger=@{results=@(@{id='A01';status='PASS'})}
$database=@(@{scenario='D01';key='COUNT';expected='1';actual='1';status='PASS'},@{scenario='D01';key='COUNT';expected='1';actual='1';status='PASS'})
Accept { Assert-Coverage $contract $ledger $database }
Reject { Assert-Coverage $contract $ledger @($database[0]) }
Reject { Assert-Coverage $contract @{results=@(@{id='A01';status='BLOCKED'})} $database }
Reject { Assert-Coverage $contract @{results=@(@{id='A01';status='PASS'},@{id='A01';status='PASS'})} $database }
Reject { Assert-Coverage $contract $ledger @($database[0],@{scenario='D01';key='COUNT';expected='1';actual='0';status='PASS'}) }
Reject { Assert-Coverage $contract $ledger @($database[0],@{scenario='D01';key='OTHER';expected='1';actual='1';status='PASS'}) }
$raceContract=@{scenarios=@(@{id='A01'});database=@(@{scenario='D07';key='ROW';expected='1';allowedExpected=@('0','1')},@{scenario='D07';key='AUDIT';expected='0';allowedExpected=@('0','1')});raceGroups=@(@{scenario='D07';keys=@('ROW','AUDIT');allowed=@('0|1','1|0')})}
$alternate=@(@{scenario='D07';key='ROW';expected='0';actual='0';status='PASS'},@{scenario='D07';key='AUDIT';expected='1';actual='1';status='PASS'})
Accept { Assert-Coverage $raceContract $ledger $alternate }
Reject { Assert-Coverage $raceContract $ledger @($alternate[0],@{scenario='D07';key='AUDIT';expected='0';actual='0';status='PASS'}) }
Reject { Assert-Coverage $raceContract $ledger @($alternate[0],@{scenario='D07';key='AUDIT';expected='2';actual='2';status='PASS'}) }
# Windows junction fixtures stay in ignored owned storage. No elevation needed.
$fixture=Join-Path $root ('safety-tests/'+[guid]::NewGuid().ToString('N'))
Assert-ChildPath $root $fixture
New-Item -ItemType Directory -Path (Join-Path $fixture 'target') -Force|Out-Null
$junction=Join-Path $fixture 'junction'
try {
 New-Item -ItemType Junction -Path $junction -Target (Join-Path $fixture 'target')|Out-Null
 Reject { Assert-ChildPath $junction (Join-Path $junction 'nested/file') }
 Reject { Assert-ChildPath (Join-Path $junction 'nested') (Join-Path $junction 'nested/file') }
} finally {
 # Remove only the known junction itself, then the validated non-link fixture.
 if(Test-Path -LiteralPath $junction){Remove-Item -LiteralPath $junction -Force}
 Assert-ChildPath $root $fixture;Remove-Item -LiteralPath $fixture -Recurse -Force
}
$dockerFunction=(Get-Item Function:D).ScriptBlock
try {
 # Exercise preservation with multiple pre-existing resources, without Docker access.
 function Get-NetTCPConnection { return @() }
 function Get-NetFirewallProfile { return @([pscustomobject]@{Name='Synthetic';Enabled=$true;DefaultInboundAction='NotConfigured';DefaultOutboundAction='NotConfigured'}) }
 function D([string[]]$DockerArgs) {
  switch($DockerArgs[0]) {
   'ps' { return (('a'*64)+"`n"+('b'*64)) }
   'inspect' {
    if($DockerArgs[1] -match "`n"){throw 'Multiline container ID passed to inspect'}
    return (@(@{State=@{Status='exited';ExitCode=0}})|ConvertTo-Json -AsArray -Compress)
   }
   'volume' { return "first-volume`nsecond-volume" }
   'network' { return (('c'*64)+"`n"+('d'*64)) }
   default {throw 'Unexpected mocked Docker call'}
  }
 }
 Accept {
  $snapshot=Get-EnvironmentSnapshot
  if($snapshot.containers.Count -ne 2 -or $snapshot.volumes.Count -ne 2 -or $snapshot.networks.Count -ne 2){throw 'Resource inventory lost row boundaries'}
 }
} finally {Set-Item Function:D -Value $dockerFunction}
Write-Output "SAFETY_TESTS_PASS checks=$checks"
