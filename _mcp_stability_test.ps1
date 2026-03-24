$dataDir = "C:\Users\lsz\.cursor-mcp-messenger\fee31d2c567f"
$queueFile = Join-Path $dataDir "queue.json"
$sessionTag = "sess_cursormessage_handoff"
$intervalMinutes = 10
$round = 0

while ($true) {
    $round++
    $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
    $id = "ping_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString("x") + "_" + (Get-Random -Maximum 999999).ToString("D6")

    $queue = @()
    if (Test-Path $queueFile) {
        try {
            $raw = Get-Content $queueFile -Raw -Encoding UTF8
            $parsed = $raw | ConvertFrom-Json
            if ($parsed -is [array]) { $queue = [System.Collections.ArrayList]@($parsed) }
            else { $queue = [System.Collections.ArrayList]@() }
        } catch {
            $queue = [System.Collections.ArrayList]@()
        }
    }

    $msg = [ordered]@{
        id         = $id
        type       = "text"
        content    = "[STABILITY-PING] round=$round time=$ts"
        timestamp  = $ts
        session_id = $sessionTag
    }
    [void]$queue.Add($msg)
    $queue | ConvertTo-Json -Depth 10 | Set-Content $queueFile -Encoding UTF8

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Round $round ping written"
    Start-Sleep -Seconds ($intervalMinutes * 60)
}
