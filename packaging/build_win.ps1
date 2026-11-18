param(
    [string]$QtRoot = "C:\Qt\6.5.3\msvc2019_64",
    [string]$Generator = "Visual Studio 17 2022",
    [switch]$EnableOnnxRuntime = $false,
    [string]$OnnxRoot = "desktop\HongguoTool\third_party\onnxruntime"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $RepoRoot "desktop\HongguoTool"
$BuildDir = Join-Path $RepoRoot "build_win"
$DistDir = Join-Path $RepoRoot "dist_win\HongguoTool"

Write-Host "==> Configuring CMake ($Generator)..."
$cmakeArgs = @(
    "-S", $SourceDir,
    "-B", $BuildDir,
    "-G", $Generator,
    "-A", "x64",
    "-DCMAKE_PREFIX_PATH=$QtRoot"
)

if ($EnableOnnxRuntime) {
    $cmakeArgs += "-DENABLE_ONNXRUNTIME=ON"
    $cmakeArgs += "-DONNXRUNTIME_ROOT=$OnnxRoot"
} else {
    $cmakeArgs += "-DENABLE_ONNXRUNTIME=OFF"
}

& cmake @cmakeArgs

Write-Host "==> Building Release..."
& cmake --build $BuildDir --config Release

Write-Host "==> Running CTest..."
& ctest --test-dir $BuildDir -C Release --output-on-failure

Write-Host "==> Staging distribution directory..."
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

Copy-Item (Join-Path $BuildDir "Release\HongguoTool.exe") $DistDir
Copy-Item -Recurse (Join-Path $SourceDir "resources") (Join-Path $DistDir "resources")

if ($EnableOnnxRuntime -and (Test-Path (Join-Path $OnnxRoot "lib\onnxruntime.dll"))) {
    Copy-Item (Join-Path $OnnxRoot "lib\onnxruntime.dll") $DistDir
}

$windeployqt = Join-Path $QtRoot "bin\windeployqt.exe"
Write-Host "==> Running windeployqt..."
& $windeployqt --release --no-translations (Join-Path $DistDir "HongguoTool.exe")

$ZipPath = Join-Path $RepoRoot "dist_win\HongguoTool-v2.0-win64.zip"
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path "$DistDir\*" -DestinationPath $ZipPath

Write-Host "==> Packaging complete: $ZipPath"
