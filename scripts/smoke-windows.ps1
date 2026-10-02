$ErrorActionPreference = "Stop"
$installer = Get-ChildItem "src-tauri/target/release/bundle/nsis/*.exe" | Select-Object -First 1
if (!$installer) { throw "Installateur absent" }
function Install-Parking {
  $process = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Échec de l'installation : $($process.ExitCode)" }
}
function Start-Parking {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcut = Join-Path $desktop "Parking local.lnk"
  if (!(Test-Path $shortcut)) { throw "Raccourci du bureau absent" }
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($shortcut)
  if (!(Test-Path $link.TargetPath)) { throw "Cible du raccourci absente" }
  $process = Start-Process -FilePath $link.TargetPath -PassThru
  Start-Sleep -Seconds 10
  if ($process.HasExited) { throw "L'application s'est arrêtée : $($process.ExitCode)" }
  return $process
}
function Stop-Parking($process) {
  $null = $process.CloseMainWindow()
  if (!$process.WaitForExit(5000)) { Stop-Process -Id $process.Id -Force }
}
Install-Parking
$app = Start-Parking
$data = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "fr.parking-local.desktop"
try { python scripts/check-installed-data.py "$data"; if ($LASTEXITCODE -ne 0) { throw "Données invalides" } }
finally { Stop-Parking $app }
python scripts/check-installed-data.py "$data" seed
if ($LASTEXITCODE -ne 0) { throw "Préparation de la mise à jour échouée" }
Install-Parking
$app = Start-Parking
try { python scripts/check-installed-data.py "$data" updated; if ($LASTEXITCODE -ne 0) { throw "Mise à jour invalidée" } }
finally { Stop-Parking $app }
