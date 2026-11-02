param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start-db', 'stop-db', 'migrate', 'api', 'dashboard', 'landing')]
    [string]$Service,
    [string]$FirebaseProjectId = $env:Firebase__ProjectId
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$local = Join-Path $env:LOCALAPPDATA 'AtelieAlexandra'
$bin = Join-Path $local 'postgresql-17\pgsql\bin'
$data = Join-Path $local 'data'

function Assert-NativeSuccess {
    if ($LASTEXITCODE -ne 0) {
        throw "O comando falhou (codigo $LASTEXITCODE). Veja a mensagem acima."
    }
}

if ($Service -eq 'start-db') {
    & "$bin\pg_ctl.exe" status -D $data
    if ($LASTEXITCODE -eq 3) {
        & "$bin\pg_ctl.exe" start -D $data -l "$local\postgresql.log" -w
        Assert-NativeSuccess
    } elseif ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel consultar o PostgreSQL local.'
    }
    & "$bin\pg_isready.exe" -h localhost -p 5432
    Assert-NativeSuccess
    return
}

if ($Service -eq 'stop-db') {
    & "$bin\pg_ctl.exe" stop -D $data -m fast -w
    Assert-NativeSuccess
    return
}

Set-Location $root
if ($Service -in @('dashboard', 'landing')) {
    & npm.cmd run "dev:$Service"
    Assert-NativeSuccess
    return
}

if ($Service -eq 'api' -and [string]::IsNullOrWhiteSpace($FirebaseProjectId)) {
    throw 'Informe -FirebaseProjectId com o ID real do projeto Firebase. O login nao sera simulado.'
}

$credentialPath = Join-Path $local 'app-credential.xml'
if (-not (Test-Path -LiteralPath $credentialPath)) {
    throw 'Credencial local nao encontrada. Configure o PostgreSQL primeiro.'
}
$credential = Import-Clixml -LiteralPath $credentialPath
if ($credential -isnot [System.Management.Automation.PSCredential]) {
    throw 'A credencial local nao e valida para este usuario do Windows.'
}
$previousConnection = $env:ConnectionStrings__Postgres
$previousFirebase = $env:Firebase__ProjectId
$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$previousPath = $env:PATH
try {
    $env:ConnectionStrings__Postgres = "Host=localhost;Port=5432;Database=atelie;Username=$($credential.UserName);Password=$($credential.GetNetworkCredential().Password)"
    $env:Firebase__ProjectId = $FirebaseProjectId
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $dotnet = Join-Path $env:USERPROFILE '.dotnet\dotnet.exe'
    if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = 'dotnet' }
    $env:PATH = "$(Join-Path $env:USERPROFILE '.dotnet');$env:PATH"
    Set-Location (Join-Path $root 'backend')
    if ($Service -eq 'migrate') {
        & $dotnet tool restore
        Assert-NativeSuccess
        & $dotnet ef database update --project src\Cartao.Api
    } else {
        & $dotnet run --project src\Cartao.Api --urls http://localhost:5080
    }
    Assert-NativeSuccess
} finally {
    $env:ConnectionStrings__Postgres = $previousConnection
    $env:Firebase__ProjectId = $previousFirebase
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:PATH = $previousPath
}
