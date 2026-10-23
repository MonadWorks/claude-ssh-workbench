# $sessionId, $workspace and $workerScript are supplied as literals
# by ssh.ts. SSH owns only `claude attach`; Claude's remote supervisor owns the PTY.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::InputEncoding=New-Object Text.UTF8Encoding
[Console]::OutputEncoding=New-Object Text.UTF8Encoding
$OutputEncoding=[Console]::OutputEncoding
$env:Path="$env:USERPROFILE\.local\bin;"+[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')
$env:TERM='xterm-256color'
$env:COLORTERM='truecolor'
$claude=Join-Path $env:USERPROFILE '.local\bin\claude.exe'
$jobName='workbench-'+$sessionId
$lock=$null
try {
    if($sessionId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Invalid session ID' }
    Set-Location -LiteralPath $workspace
    $lockDir=Join-Path $env:LOCALAPPDATA 'ClaudeSSHWorkbench\locks'
    [IO.Directory]::CreateDirectory($lockDir) | Out-Null
    $lockPath=Join-Path $lockDir ($sessionId+'.lock')
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    while($null -eq $lock) {
        try { $lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
        catch [IO.IOException] {
            if([DateTime]::UtcNow -ge $deadline) { throw 'Another connection is still starting this session. Reconnect shortly.' }
            Start-Sleep -Milliseconds 200
        }
    }
    # Query the supported CLI, not Claude's private daemon files. A full name
    # also finds a worker launched just before an earlier SSH connection died.
    $raw=& $claude agents --json --all
    if($LASTEXITCODE -ne 0) { throw 'Claude Code background sessions are unavailable. Update Claude Code to 2.1.308 or later.' }
    $jobs=($raw -join "`n") | ConvertFrom-Json
    $live=@($jobs | Where-Object {
        $_.kind -eq 'background' -and ($_.sessionId -eq $sessionId -or
        ($_.name -eq $jobName -and $_.state -notin @('done','completed','failed','stopped')))
    } | Sort-Object startedAt -Descending)
    if($live.Count -gt 0) {
        $jobId=$live[0].id
    } else {
        $interactive=@($jobs | Where-Object { $_.kind -eq 'interactive' -and $_.sessionId -eq $sessionId })
        if($interactive.Count -gt 0) {
            throw 'This conversation is still running in an older terminal. Run /bg there before reconnecting; it has not been stopped or duplicated.'
        }
        $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($workerScript))
        # --exec runs a native interactive CLI in the supervisor's remote PTY.
        # It invokes no model and does not manufacture an initial user prompt.
        $started=(& $claude --bg --name $jobName --exec ('powershell.exe -NoLogo -NoProfile -EncodedCommand '+$encoded)) -join "`n"
        if($LASTEXITCODE -ne 0) { throw ('Could not start the persistent remote terminal: '+$started) }
        if($started -notmatch 'backgrounded[^\r\n]*?\b([a-f0-9]{8})\b') {
            throw 'Claude started a background job but returned an unfamiliar ID. Reconnect to look up the existing job safely.'
        }
        $jobId=$matches[1]
    }
    $lock.Dispose()
    $lock=$null
    [Console]::WriteLine('Remote session is hosted independently. Closing this connection does not stop it.')
    & $claude attach $jobId
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if($null -ne $lock) { $lock.Dispose() }
}
