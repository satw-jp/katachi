param(
  [ValidateSet("win-x64", "win-arm64")]
  [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDirectory = Join-Path $projectDirectory "publish\$Runtime"
$archive = Join-Path $projectDirectory "publish\Hikari-Blender-Bridge-$Runtime.zip"

if (Test-Path $outputDirectory) { Remove-Item $outputDirectory -Recurse -Force }

dotnet publish (Join-Path $projectDirectory "HikariBlenderBridge.csproj") `
  --configuration Release `
  --runtime $Runtime `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:EnableCompressionInSingleFile=true `
  --output $outputDirectory

Copy-Item (Join-Path $projectDirectory "install.ps1") $outputDirectory -Force
Copy-Item (Join-Path $projectDirectory "uninstall.ps1") $outputDirectory -Force
Copy-Item (Join-Path $projectDirectory "install.cmd") $outputDirectory -Force
Copy-Item (Join-Path $projectDirectory "uninstall.cmd") $outputDirectory -Force
Copy-Item (Join-Path $projectDirectory "README.md") $outputDirectory -Force
if (Test-Path $archive) { Remove-Item $archive -Force }
Compress-Archive -Path (Join-Path $outputDirectory "*") -DestinationPath $archive
Write-Host $archive
