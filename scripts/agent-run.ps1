[CmdletBinding()]
param(
  [int]$TimeoutSec = 120,
  [int]$IdleTimeoutSec = 30,
  [int]$HeartbeatSec = 5,
  [string]$CommandLine
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Marker {
  param([string]$Name, [string]$Detail = "")
  if ([string]::IsNullOrWhiteSpace($Detail)) {
    Write-Output "__AGENT_RUN_${Name}__"
    return
  }
  Write-Output "__AGENT_RUN_${Name}__ $Detail"
}

function Quote-CmdString {
  param([string]$Value)
  return '"' + ($Value -replace '"', '""') + '"'
}

function Stop-ProcessTree {
  param([int]$TargetPid)
  try {
    & taskkill /PID $TargetPid /T /F 2>$null | Out-Null
  } catch {
    try {
      Stop-Process -Id $TargetPid -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
}

function Flush-Delta {
  param(
    [string]$Path,
    [ref]$LastLength,
    [bool]$StdErr
  )

  if (-not (Test-Path $Path)) {
    return $false
  }

  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8, $true)
    try {
      $content = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $fs.Dispose()
  }
  if ($content.Length -le $LastLength.Value) {
    return $false
  }

  $delta = $content.Substring($LastLength.Value)
  $LastLength.Value = $content.Length
  if ($StdErr) {
    [Console]::Error.Write($delta)
  } else {
    [Console]::Out.Write($delta)
  }
  return ($delta.Length -gt 0)
}

if ([string]::IsNullOrWhiteSpace($CommandLine)) {
  Write-Marker "FAIL" "exit=64 reason=no_command"
  exit 64
}

$cwd = (Get-Location).Path
$startedAt = [DateTime]::UtcNow
$lastChildActivityAt = $startedAt
$lastHeartbeatAt = $startedAt
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-run-" + [guid]::NewGuid().ToString("N"))
$stdoutFile = Join-Path $tmpDir "stdout.log"
$stderrFile = Join-Path $tmpDir "stderr.log"
$stdoutLen = 0
$stderrLen = 0

New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
[System.IO.File]::WriteAllText($stdoutFile, "", [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($stderrFile, "", [System.Text.Encoding]::UTF8)

Write-Marker "START" ("cwd={0} command={1}" -f $cwd, $CommandLine)

$wrapped = '(' + $CommandLine + ') 1>>' + (Quote-CmdString $stdoutFile) + ' 2>>' + (Quote-CmdString $stderrFile)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/d /s /c ' + (Quote-CmdString $wrapped)
$psi.WorkingDirectory = $cwd
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi

try {
  if (-not $process.Start()) {
    Write-Marker "FAIL" "exit=65 reason=start_failed"
    exit 65
  }
} catch {
  Write-Marker "FAIL" ("exit=65 reason=start_failed message={0}" -f $_.Exception.Message)
  exit 65
}

$timedOut = $false
$idleTimedOut = $false

try {
  while (-not $process.HasExited) {
    Start-Sleep -Milliseconds 250
    $hadOut = Flush-Delta -Path $stdoutFile -LastLength ([ref]$stdoutLen) -StdErr:$false
    $hadErr = Flush-Delta -Path $stderrFile -LastLength ([ref]$stderrLen) -StdErr:$true
    if ($hadOut -or $hadErr) {
      $lastChildActivityAt = [DateTime]::UtcNow
    }

    $now = [DateTime]::UtcNow
    $elapsedSec = ($now - $startedAt).TotalSeconds
    $silentSec = ($now - $lastChildActivityAt).TotalSeconds

    if ($HeartbeatSec -gt 0 -and ($now - $lastHeartbeatAt).TotalSeconds -ge $HeartbeatSec) {
      Write-Marker "HEARTBEAT" ("elapsed_s={0:N1} silent_s={1:N1}" -f $elapsedSec, $silentSec)
      $lastHeartbeatAt = $now
    }

    if ($TimeoutSec -gt 0 -and $elapsedSec -ge $TimeoutSec) {
      $timedOut = $true
      break
    }

    if ($IdleTimeoutSec -gt 0 -and $silentSec -ge $IdleTimeoutSec) {
      $idleTimedOut = $true
      break
    }
  }

  if ($timedOut -or $idleTimedOut) {
    Stop-ProcessTree -TargetPid $process.Id
    try {
      $process.WaitForExit()
    } catch {
    }
  }

  try {
    $process.WaitForExit()
  } catch {
  }

  $null = Flush-Delta -Path $stdoutFile -LastLength ([ref]$stdoutLen) -StdErr:$false
  $null = Flush-Delta -Path $stderrFile -LastLength ([ref]$stderrLen) -StdErr:$true

  $elapsedMs = [int](([DateTime]::UtcNow - $startedAt).TotalMilliseconds)
  if ($timedOut) {
    Write-Marker "TIMEOUT" ("exit=124 elapsed_ms={0} limit_s={1}" -f $elapsedMs, $TimeoutSec)
    exit 124
  }
  if ($idleTimedOut) {
    Write-Marker "IDLE_TIMEOUT" ("exit=125 elapsed_ms={0} idle_limit_s={1}" -f $elapsedMs, $IdleTimeoutSec)
    exit 125
  }

  $exitCode = $process.ExitCode
  if ($exitCode -eq 0) {
    Write-Marker "OK" ("exit=0 elapsed_ms={0}" -f $elapsedMs)
    exit 0
  }

  Write-Marker "FAIL" ("exit={0} elapsed_ms={1}" -f $exitCode, $elapsedMs)
  exit $exitCode
} finally {
  try {
    if (Test-Path $tmpDir) {
      Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  } catch {
  }
}
