# Shared safety gates. Dot-source only; no Docker mutations occur on import.
Set-StrictMode -Version 3
$E2EBaseline='ce7c5f353dd4593c86775f957a2f7d826f9e7337'
function Assert-ChildPath([string]$Root,[string]$Path) {
 $parent=[IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
 $child=[IO.Path]::GetFullPath($Path)
 if(-not $child.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase)){throw 'Path escapes task-local root'}
 # Refuse existing reparse points in the ancestry before deletion or writing.
 for($cursor=$child; $cursor; $cursor=[IO.Path]::GetDirectoryName($cursor)) {
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Task-local reparse point refused'}
 }
}
function Assert-Ownership($Labels,[string]$RunId) {
 if($RunId -notmatch '^[a-f0-9]{32}$' -or $Labels.'tbcall.e2e.suite' -ne 'tbcall-f6c' -or $Labels.'tbcall.e2e.run' -cne $RunId -or $Labels.'tbcall.e2e.disposable' -ne 'true'){throw 'Resource ownership guard failed'}
}
function Assert-Coverage($Contract,$Ledger,$Database) {
 $expectedIds=@($Contract.scenarios | ForEach-Object id | Sort-Object)
 $actualIds=@($Ledger.results | ForEach-Object id | Sort-Object)
 if(($expectedIds -join '|') -cne ($actualIds -join '|') -or @($Ledger.results | Where-Object status -ne PASS).Count){throw 'Scenario coverage incomplete or failed'}
 $expectedKeys=@($Contract.database | ForEach-Object { "$($_.scenario)|$($_.key)" } | Sort-Object)
 $actualKeys=@($Database | ForEach-Object { "$($_.scenario)|$($_.key)" } | Sort-Object)
 if(($expectedKeys -join '`n') -cne ($actualKeys -join '`n') -or @($Database | Where-Object { $_.status -ne 'PASS' -or [string]$_.actual -cne [string]$_.expected }).Count){throw 'Database coverage incomplete or failed'}
 foreach($row in $Database) {
  $rules=@($Contract.database|Where-Object {$_.scenario -ceq $row.scenario -and $_.key -ceq $row.key})
  $allowed=@(foreach($rule in $rules){if(Has-Field $rule 'allowedExpected'){@($rule.allowedExpected)}else{[string]$rule.expected}})
  if([string]$row.expected -cnotin $allowed){throw 'Database expected count outside source-defined contract'}
 }
 if(Has-Field $Contract 'raceGroups') {
  foreach($group in $Contract.raceGroups) {
   $values=@(foreach($key in $group.keys){$row=@($Database|Where-Object {$_.scenario -ceq $group.scenario -and $_.key -ceq $key});if($row.Count -ne 1){throw 'Race assertion occurrence mismatch'};[string]$row[0].expected})
   if(($values -join '|') -cnotin $group.allowed){throw 'Illegal race outcome vector'}
  }
 }
}
function Has-Field($Value,[string]$Name) {
 if($Value -is [Collections.IDictionary]){return $Value.Contains($Name)}
 return $null -ne $Value.PSObject.Properties[$Name]
}
function D([string[]]$DockerArgs) {
 $previous=$ErrorActionPreference; $ErrorActionPreference='Continue'
 try {$result=& docker @DockerArgs 2>&1; $exit=$LASTEXITCODE} finally {$ErrorActionPreference=$previous}
 # Commands can include credentials or synthetic IDs. Never echo arguments/output on failure.
 if($exit -ne 0){throw ('Docker operation failed: '+$DockerArgs[0]+' exit='+$exit)}
 return ($result -join "`n")
}
function Save-Json($Value,[string]$Path) {
 $temp=$Path+'.new'
 $json=($Value|ConvertTo-Json -Depth 40).Replace("`r`n","`n")+"`n"
 [IO.File]::WriteAllText($temp,$json,[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temp -Destination $Path -Force
}
function Get-EnvironmentSnapshot {
 $containers=@((D @('ps','--all','--no-trunc','--format','{{.ID}}')) -split "`n" | Where-Object {$_})
 $states=@(foreach($id in $containers) {$s=(D @('inspect',$id)|ConvertFrom-Json)[0];@{id=$id;status=$s.State.Status;exitCode=$s.State.ExitCode}})
 $volumes=@((D @('volume','ls','--format','{{.Name}}')) -split "`n" | Where-Object {$_} | Sort-Object)
 $networks=@((D @('network','ls','--no-trunc','--format','{{.ID}}')) -split "`n" | Where-Object {$_} | Sort-Object)
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue | ForEach-Object { "$($_.LocalAddress)|$($_.OwningProcess)" } | Sort-Object)
 $firewall=@(Get-NetFirewallProfile | Sort-Object Name | ForEach-Object { "$($_.Name)|$($_.Enabled)|$($_.DefaultInboundAction)|$($_.DefaultOutboundAction)" })
 return @{containers=$states;volumes=$volumes;networks=$networks;host5432=$listeners;firewall=$firewall}
}
function Assert-Preservation($Before,$After) {
 foreach($kind in @('volumes','networks','host5432','firewall')) {
  if((@($Before.$kind) -join '|') -cne (@($After.$kind) -join '|')){throw "Preservation mismatch: $kind"}
 }
 $a=@($Before.containers | ForEach-Object {"$($_.id)|$($_.status)|$($_.exitCode)"} | Sort-Object)
 $b=@($After.containers | ForEach-Object {"$($_.id)|$($_.status)|$($_.exitCode)"} | Sort-Object)
 if(($a -join ';') -cne ($b -join ';')){throw 'Preservation mismatch: containers (including unrelated changes)'}
}
function Assert-ProductionSource([string]$Repository) {
 $changes=& git -C $Repository diff --name-only $E2EBaseline -- . ':(exclude)test-support/e2e'
 if($LASTEXITCODE -ne 0 -or $changes){throw 'Production source differs from approved baseline'}
 # Index-only changes are also refused. Untracked files are never used to build source snapshots.
 $staged=& git -C $Repository diff --cached --name-only -- . ':(exclude)test-support/e2e'
 if($LASTEXITCODE -ne 0 -or $staged){throw 'Unrelated staged files refused'}
}
function Assert-Daemon($State) {
 if((D @('context','show')).Trim() -cne $State.context -or (D @('info','--format','{{.ID}}')).Trim() -cne $State.daemon){throw 'Docker context/daemon changed; cleanup refused'}
}
function Remove-OwnedResources($State) {
 Assert-Daemon $State
 if($State.runId -notmatch '^[a-f0-9]{32}$'){throw 'Invalid cleanup run ID'}
 $failures=[Collections.Generic.List[string]]::new()
 foreach($kind in @('containers','networks')) {
  # Recover the create/journal crash window using all three labels, then verify
  # each exact ID and labels again. Names are never a deletion authority.
  $args=if($kind -eq 'containers'){@('ps','--all','--no-trunc')}else{@('network','ls','--no-trunc')}
  $found=D ($args+@('--filter','label=tbcall.e2e.suite=tbcall-f6c','--filter',('label=tbcall.e2e.run='+$State.runId),'--filter','label=tbcall.e2e.disposable=true','--format','{{.ID}}'))
  $ids=@(@($State.$kind)+@($found -split "`n"|Where-Object {$_})|Select-Object -Unique)
  [array]::Reverse($ids)
  foreach($id in $ids) {
   try {
    if($id -notmatch '^[a-f0-9]{64}$'){throw 'Invalid resource identity'}
    $list=if($kind -eq 'containers'){D @('ps','--all','--no-trunc','--filter',"id=$id",'--format','{{.ID}}')}else{D @('network','ls','--no-trunc','--filter',"id=$id",'--format','{{.ID}}')}
    if(-not $list.Trim()){continue}
    if($list.Trim() -cne $id){throw 'Resource ID mismatch'}
    $inspect=if($kind -eq 'containers'){(D @('inspect',$id)|ConvertFrom-Json)[0]}else{(D @('network','inspect',$id)|ConvertFrom-Json)[0]}
    $labels=if($kind -eq 'containers'){$inspect.Config.Labels}else{$inspect.Labels}
    Assert-Ownership $labels $State.runId
    if($kind -eq 'containers'){D @('rm','--force',$id)|Out-Null}else{D @('network','rm',$id)|Out-Null}
   } catch {$failures.Add("$kind $id")}
  }
 }
 if($failures.Count){throw ('Owned cleanup incomplete: '+($failures -join ', '))}
}
function Assert-NoOwnedResources([string]$RunId) {
 if($RunId -notmatch '^[a-f0-9]{32}$'){throw 'Invalid run ID'}
 foreach($kind in @('ps','network')) {
  $args=if($kind -eq 'ps'){@('ps','--all')}else{@('network','ls')}
  $left=D ($args+@('--filter',"label=tbcall.e2e.run=$RunId",'--format','{{.ID}}'))
  if($left.Trim()){throw 'Owned resources still exist'}
 }
}
