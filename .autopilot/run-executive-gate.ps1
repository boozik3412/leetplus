param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9-]+$')][string]$GateName,
  [Parameter(Mandatory = $true)][string[]]$GateArgs
)
$ErrorActionPreference = 'Stop'
$taskWorkspace = Split-Path -Parent $PSScriptRoot
$taskEvidence = Join-Path (Split-Path -Parent $taskWorkspace) 'deploy-evidence/executive-dashboard-20260915'
$taskGateDir = Join-Path $taskEvidence 'gates'
[IO.Directory]::CreateDirectory($taskGateDir) | Out-Null
$taskStamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
$taskPrefix = Join-Path $taskGateDir ($taskStamp + '-' + $GateName)
$taskStartedAt = (Get-Date).ToString('o')
$taskTimer = [Diagnostics.Stopwatch]::StartNew()
$taskPnpmEntry = Join-Path $env:LOCALAPPDATA 'node/corepack/v1/pnpm/10.33.2/bin/pnpm.cjs'
if (-not (Test-Path -LiteralPath $taskPnpmEntry)) {
  throw 'The verified cached pnpm 10.33.2 entrypoint is unavailable; do not install or switch versions silently.'
}
Push-Location $taskWorkspace
try {
  & node.exe $taskPnpmEntry @GateArgs 1> ($taskPrefix + '.stdout.log') 2> ($taskPrefix + '.stderr.log')
  $taskGateExit = $LASTEXITCODE
} finally {
  Pop-Location
  $taskTimer.Stop()
}
$taskReceipt = [ordered]@{
  gate = $GateName
  command = 'node.exe'
  packageManagerEntrypoint = $taskPnpmEntry
  arguments = $GateArgs
  cwd = $taskWorkspace
  startedAt = $taskStartedAt
  finishedAt = (Get-Date).ToString('o')
  durationMs = $taskTimer.ElapsedMilliseconds
  exitCode = $taskGateExit
  stdout = $taskPrefix + '.stdout.log'
  stderr = $taskPrefix + '.stderr.log'
}
$taskReceipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($taskPrefix + '.exit.json')
$taskReceipt | ConvertTo-Json -Depth 8
Get-Content -LiteralPath ($taskPrefix + '.stdout.log') -Tail 12
Get-Content -LiteralPath ($taskPrefix + '.stderr.log') -Tail 16
exit $taskGateExit
