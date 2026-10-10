Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-Sha256Stream($stream) {
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try { return ([Convert]::ToHexString($sha.ComputeHash($stream))).ToLowerInvariant() } finally { $sha.Dispose() }
}
function Inspect($path) {
  $fs=[System.IO.File]::OpenRead($path)
  try { $containerHash=Get-Sha256Stream $fs } finally { $fs.Dispose() }
  $zip=[System.IO.Compression.ZipFile]::OpenRead($path)
  try {
    $entries=@($zip.Entries | ForEach-Object { [ordered]@{name=$_.FullName;bytes=$_.Length;crc32=('{0:x8}' -f $_.Crc32)} })
    $gcodes=@()
    foreach($e in $zip.Entries | Where-Object {$_.FullName -match '\.gcode$'}) {
      $s=$e.Open(); try {$hash=Get-Sha256Stream $s} finally {$s.Dispose()}
      $gcodes += [ordered]@{entry=$e.FullName;bytes=$e.Length;sha256=$hash}
    }
    return [ordered]@{path=$path;bytes=(Get-Item -LiteralPath $path).Length;sha256=$containerHash;entries=$entries;embedded_gcode=$gcodes}
  } finally { $zip.Dispose() }
}
$out=[ordered]@{success=Inspect 'J:\My Drive\codex\2026-09-23\files-pasted-by-the-user-fukei\outputs\R4_MINIA_TERMINAL_REVIEW_20260922\package_only\plate_1.gcode.3mf';editable=Inspect 'J:\My Drive\codex\2026-09-22\skin-fukei-slice-runner-execution-3\outputs\MINIA_PLA_EDITABLE_REPACKED.3mf'}
$out | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 'work\luna_binding\ARTIFACT_INSPECTION.json'
Get-Content -Raw 'work\luna_binding\ARTIFACT_INSPECTION.json'

