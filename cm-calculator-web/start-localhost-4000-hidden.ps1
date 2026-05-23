$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root "server"
$pidFile = Join-Path $serverDir "server.pid"
$outLog = Join-Path $serverDir "server.out.log"
$errLog = Join-Path $serverDir "server.err.log"
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodePath = if (Test-Path -LiteralPath $bundledNode) {
  $bundledNode
} else {
  (Get-Command node -ErrorAction Stop).Source
}

$listener = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Set-Content -Path $pidFile -Value $listener.OwningProcess
  exit 0
}

$process = Start-Process `
  -FilePath $nodePath `
  -ArgumentList "dist/index.js" `
  -WorkingDirectory $serverDir `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden `
  -PassThru

Set-Content -Path $pidFile -Value $process.Id

Start-Sleep -Seconds 2

$started = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $started) {
  throw "Server did not start on port 4000."
}
