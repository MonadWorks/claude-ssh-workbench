$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding
$OutputEncoding = [Console]::OutputEncoding
function FullPath($value) {
  if ($value -notmatch '^[A-Za-z]:[\\/]') { throw 'Choose a full local Windows directory, for example C:\Projects' }
  return [IO.Path]::GetFullPath($value)
}
function SessionFiles {
  $root = Join-Path $env:USERPROFILE '.claude\projects'
  if (Test-Path -LiteralPath $root) {
    Get-ChildItem -LiteralPath $root -Directory | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter '*.jsonl' -File }
  }
}
switch ($request.op) {
  'status' {
    $cli = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
    $version = & $cli --version
    $auth = (& $cli auth status | Out-String | ConvertFrom-Json)
    $result = @{ online=$true; hostname=$env:COMPUTERNAME; version="$version"; loggedIn=[bool]$auth.loggedIn; authMethod=$auth.authMethod }
  }
  'sessions' {
    $items = @()
    foreach ($f in @(SessionFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 100)) {
      $cwd = ''; $title = ''; $custom = ''
      $lines = @(Get-Content -LiteralPath $f.FullName -Encoding UTF8 -TotalCount 80)
      $lines += @(Get-Content -LiteralPath $f.FullName -Encoding UTF8 -Tail 80)
      foreach ($line in $lines) {
        try { $row = $line | ConvertFrom-Json } catch { continue }
        if ($row.cwd) { $cwd = [string]$row.cwd }
        if ($row.type -eq 'custom-title' -and $row.customTitle) { $custom = [string]$row.customTitle }
        if (!$title -and $row.type -eq 'user' -and !$row.isMeta -and !$row.isSidechain) {
          if ($row.message.content -is [string]) { $title = $row.message.content }
          else { $title = (@($row.message.content | Where-Object {$_.type -eq 'text'} | ForEach-Object {$_.text}) -join ' ') }
          if ($title -match '^<') { $title = '' }
        }
      }
      if (!$cwd) { continue }
      if ($custom) { $title = $custom }
      if (!$title) { $title = $f.BaseName }
      if ($title.Length -gt 100) { $title = $title.Substring(0,100) }
      $items += @{ id=$f.BaseName; title=$title; cwd=$cwd; updatedAt=$f.LastWriteTimeUtc.ToString('o'); size=$f.Length }
    }
    $result = @{sessions=@($items)}
  }
  'directory' {
    $p = FullPath $request.path
    $d = Get-Item -LiteralPath $p
    if (!$d.PSIsContainer) { throw 'Not a directory' }
    $all = @(Get-ChildItem -LiteralPath $p -Force | Sort-Object @{Expression={$_.PSIsContainer};Descending=$true},Name | Select-Object -First 1001)
    $items = @($all | Select-Object -First 1000 | ForEach-Object { @{name=$_.Name; path=$_.FullName; directory=[bool]$_.PSIsContainer; size=$_.Length} })
    $result = @{path=$d.FullName; parent=$d.Parent.FullName; entries=$items; truncated=($all.Count -gt 1000)}
  }
  'read' {
    $p = FullPath $request.path
    $f = Get-Item -LiteralPath $p
    if ($f.PSIsContainer -or $f.Length -gt 2097152) { throw 'Preview supports files up to 2 MB' }
    $bytes = [IO.File]::ReadAllBytes($p)
    if ($bytes -contains 0) { throw 'Binary files cannot be previewed' }
    $result = @{path=$p; content=[Text.Encoding]::UTF8.GetString($bytes); hash=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
  }
  'changes' {
    $p = FullPath $request.path
    if (!(Get-Command git -ErrorAction SilentlyContinue)) { $result=@{available=$false; reason='Git is not installed on the remote host. File preview and Claude edits still work.'}; break }
    $ErrorActionPreference = 'Continue'
    $inside = & git -C $p rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') { $result=@{available=$false; reason='This directory is not a Git repository.'}; break }
    $status = (& git -C $p -c core.quotepath=false status --short | Out-String)
    $diff = (& git -C $p -c core.quotepath=false diff --no-ext-diff --no-textconv --no-color HEAD -- 2>$null | Out-String)
    if ($LASTEXITCODE -ne 0) { $diff = (& git -C $p -c core.quotepath=false diff --no-ext-diff --no-textconv --no-color | Out-String) }
    $cut = $diff.Length -gt 200000
    if ($cut) {$diff=$diff.Substring(0,200000)}
    $result = @{available=$true; status=$status; diff=$diff; truncated=$cut}
  }
  default { throw 'Unsupported operation' }
}
ConvertTo-Json -InputObject $result -Depth 30 -Compress
