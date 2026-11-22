param([string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk")
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$tools = Join-Path $Sdk 'build-tools\35.0.0'
$api = Join-Path $Sdk 'platforms\android-35\android.jar'
$temp = New-Item -ItemType Directory (Join-Path ([IO.Path]::GetTempPath()) ('faultline-' + [guid]::NewGuid()))
$output = New-Item -ItemType Directory -Force (Join-Path $root 'release')
function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit $LASTEXITCODE" }
}
try {
    Push-Location $root
    try { Invoke-Checked npm.cmd @('run','build') } finally { Pop-Location }
    if (!(Test-Path "$root\build\game.js") -or !(Select-String -Quiet -SimpleMatch '<script defer src="./game.js"></script>' "$root\build\index.html")) { throw 'Missing offline game entry' }
    Copy-Item -LiteralPath $api -Destination "$temp\android.jar"
    $api = "$temp\android.jar"
    $class = New-Item -ItemType Directory (Join-Path $temp 'classes')
    Invoke-Checked javac @('--release','8','-classpath',$api,'-d',$class.FullName,"$PSScriptRoot\MainActivity.java")
    Invoke-Checked "$tools\d8.bat" @('--lib',$api,'--min-api','26','--output',$temp.FullName,"$class\game\faultline\descent\MainActivity.class")
    Invoke-Checked "$tools\aapt2.exe" @('link','-I',$api,'--manifest',"$PSScriptRoot\AndroidManifest.xml",'-A',"$root\build",'-o',"$temp\unsigned.apk")
    $entries = & jar tf "$temp\unsigned.apk"
    foreach ($entry in @('assets/index.html', 'assets/game.js')) {
        if ($entries -cnotcontains $entry) { throw "Packaged startup asset missing: $entry" }
    }
    Push-Location $temp
    try { Invoke-Checked jar @('uf','unsigned.apk','classes.dex') } finally { Pop-Location }
    Invoke-Checked "$tools\zipalign.exe" @('-f','4',"$temp\unsigned.apk","$temp\aligned.apk")
    $key = Join-Path ([IO.Path]::GetTempPath()) 'faultline-local-test-signing.p12'
    if (!(Test-Path -LiteralPath $key)) {
        Invoke-Checked keytool @('-genkeypair','-keystore',$key,'-storepass','android','-alias','faultline','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Faultline Debug')
    }
    $apk = Join-Path $output 'Faultline-Android.apk'
    Invoke-Checked "$tools\apksigner.bat" @('sign','--ks',$key,'--ks-pass','pass:android','--v4-signing-enabled','false','--out',$apk,"$temp\aligned.apk")
    Invoke-Checked "$tools\apksigner.bat" @('verify','--verbose',$apk)
    Write-Output $apk
} finally {
    $resolved = (Resolve-Path -LiteralPath $temp.FullName).Path
    if ($resolved -eq $temp.FullName) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}







