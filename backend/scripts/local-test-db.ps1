param([ValidateSet('start', 'stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$backendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$databaseRoot = [IO.Path]::GetFullPath((Join-Path $backendRoot '.local\pg'))
if (!$databaseRoot.StartsWith($backendRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {throw 'Database path escaped backend workspace'}
$postgresBin = 'C:\Program Files\PostgreSQL\16\bin'
if ($Action -eq 'stop') {
  & (Join-Path $postgresBin 'pg_ctl.exe') -D $databaseRoot stop -m fast
  exit $LASTEXITCODE
}
New-Item -ItemType Directory -Path (Split-Path $databaseRoot) -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $databaseRoot 'PG_VERSION'))) {
  & (Join-Path $postgresBin 'initdb.exe') -D $databaseRoot -U postgres --auth=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) {throw 'Disposable PostgreSQL initialization failed'}
}
# Trust authentication is limited to loopback in this disposable local test cluster.
& (Join-Path $postgresBin 'pg_ctl.exe') -D $databaseRoot -l (Join-Path $backendRoot '.local\postgres.log') -o '-p 55439 -h 127.0.0.1 -c shared_buffers=32MB' start -w
if ($LASTEXITCODE -ne 0) {throw 'Disposable PostgreSQL startup failed'}
& (Join-Path $postgresBin 'createdb.exe') -h 127.0.0.1 -p 55439 -U postgres zenex_test
Write-Host 'Set TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/zenex_test for integration tests.'
