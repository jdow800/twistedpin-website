param(
  [string]$DesktopRoot = 'C:/Users/jdow8/OneDrive/Desktop'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$campaignRoot = Join-Path $repoRoot 'Context/marketing/holiday-drip-2026'
$postingRoot = Join-Path $campaignRoot 'posting-dates'
$manifest = Get-Content -LiteralPath (Join-Path $postingRoot 'campaign-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.posts.Count -ne 16 -or $manifest.scheduling_authorized -or $manifest.publication_authorized) { throw 'Expected sixteen prepared, unscheduled posting folders.' }
$deliveryRoot = Join-Path $DesktopRoot 'Twisted Pin Holiday Campaign 2026'
$cacheRoot = Join-Path $repoRoot '.astro/holiday-posting'
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null

function Copy-VerifiedTree([string]$Source, [string]$Destination) {
  $files = @(Get-ChildItem -LiteralPath $Source -Recurse -File)
  foreach ($file in $files) {
    $suffix = $file.FullName.Substring($Source.Length).TrimStart('\','/')
    $target = Join-Path $Destination $suffix
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw "Delivery mismatch: $target" }
  }
  return @{ destination=$Destination; files_verified=$files.Count }
}

$checks = @()
$checks += Copy-VerifiedTree $postingRoot $deliveryRoot
$portableZip = Join-Path $cacheRoot 'Twisted-Pin-Holiday-Campaign-2026.zip'
Compress-Archive -LiteralPath $postingRoot -DestinationPath $portableZip -Force
$portableTarget = Join-Path $DesktopRoot 'Twisted-Pin-Holiday-Campaign-2026.zip'
Copy-Item -LiteralPath $portableZip -Destination $portableTarget -Force
if ((Get-FileHash -LiteralPath $portableZip -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $portableTarget -Algorithm SHA256).Hash) { throw 'Portable ZIP mismatch' }

# Refresh the two earlier convenience deliveries without deleting their history.
$fullZip = Join-Path $cacheRoot 'Holiday-drip-2026-batch-02-REVIEW.zip'
Compress-Archive -LiteralPath $campaignRoot -DestinationPath $fullZip -Force
foreach ($eventFolder in @('NYE 2026','2026 Jingle Bowl')) {
  $eventRoot = Join-Path $DesktopRoot $eventFolder
  $checks += Copy-VerifiedTree $campaignRoot (Join-Path $eventRoot 'Drip review - batch 02')
  $fullTarget = Join-Path $eventRoot 'Holiday-drip-2026-batch-02-REVIEW.zip'
  Copy-Item -LiteralPath $fullZip -Destination $fullTarget -Force
  if ((Get-FileHash -LiteralPath $fullZip -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $fullTarget -Algorithm SHA256).Hash) { throw 'Full source-delivery ZIP mismatch' }
}
$receipt = @{ checked_at=(Get-Date).ToUniversalTime().ToString('o'); copy_revision=$manifest.copy_revision; delivery_revision=$manifest.delivery_revision; folders=$manifest.posts.Count; trees=$checks; portable_zip=$portableTarget; portable_zip_sha256=(Get-FileHash -LiteralPath $portableTarget -Algorithm SHA256).Hash; source_pack_zip_sha256=(Get-FileHash -LiteralPath $fullZip -Algorithm SHA256).Hash }
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $cacheRoot 'delivery-verification.json') -Encoding UTF8
$receipt | ConvertTo-Json -Depth 6 -Compress
