$ErrorActionPreference = 'Stop'
$websiteRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendRoot = [IO.Path]::GetFullPath((Join-Path $websiteRoot '..\jingle-resume-20261022'))
$sessionPath = Join-Path $backendRoot 'apps\backend\scripts\jingle-rehearsal\local\session.json'
if (-not (Test-Path -LiteralPath $sessionPath)) { throw 'Start the isolated Jingle backend first; its generated session is missing.' }
$session = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
if ($session.products.traditional -ne 'c0d96e76-cbfc-4e5b-98ec-cddac2fd9106' -or $session.products.vip -ne 'd61e83c0-5cb4-4cc8-a391-cddac2fd9107' -or $session.proxyKey.Length -lt 40) { throw 'Unexpected local Jingle fixture identity.' }
if (Get-NetTCPConnection -LocalPort 55686 -State Listen -ErrorAction SilentlyContinue) { throw 'Website review port 55686 is already in use; keep the existing process intact.' }
$env:NODE_ENV = 'development'
$env:PUBLIC_TPRS_API_BASE = '/jingle-bowl/rehearsal-api'
$env:JINGLE_REHEARSAL_PROXY_KEY = $session.proxyKey
$env:JINGLE_REVIEW_PASSWORD = 'jingle'
$bytes = New-Object byte[] 32
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($bytes)
$generator.Dispose()
$env:JINGLE_REVIEW_SESSION_SECRET = ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
Remove-Item Env:PUBLIC_STRIPE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
Set-Location -LiteralPath $websiteRoot
Write-Output 'Jingle local review: http://127.0.0.1:55686/jingle-bowl/booking/ (password: jingle). Payments are simulated.'
node node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 55686
