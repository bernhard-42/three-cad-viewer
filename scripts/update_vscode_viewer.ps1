# Define the path to the Visual Studio Code OCP Viewer directory
$vscodeOcpViewerPath = "D:\Projets\vscode-ocp-cad-viewer"

$json = Get-Content -Raw -Path 'package.json' | ConvertFrom-Json
$currentVersion = $json.version
$newVersion = $currentVersion.Split('.') | ForEach-Object { [int]$_ }
$newVersion[2]++
$newVersionString = $newVersion -join '.'
$json.version = $newVersionString
$json | ConvertTo-Json | Set-Content -Path 'package.json'
Write-Host "Version incremented to $newVersionString"


# Define the path to the old tgz file
$oldTgzPath = "D:\Projets\three-cad-viewer\three-cad-viewer-v$($newVersion[0]).$($newVersion[1]).$($newVersion[2] - 1).tgz"

# Check if the old tgz file exists and delete it if it does
if (Test-Path -Path $oldTgzPath) {
    Remove-Item -Path $oldTgzPath -Force
    Write-Host "Deleted old tgz file: $oldTgzPath"
}

# Define the relative path to the TGZ file
$relativeTgzPath = "$PSSCriptRoot\three-cad-viewer-v$newVersionString.tgz"



$yarnAddCommand = "yarn add $relativeTgzPath"

# Edit index.js and set DEBUG to false
$measureJsPath = ".\src\cad_tools\measure.js"
$measureContent = Get-Content -Path $measureJsPath
$measureContent = $measureContent -replace 'const DEBUG = true;', 'const DEBUG = false;'
$measureContent | Set-Content -Path $measureJsPath


yarn install
yarn add --dev rollup-plugin-string
yarn run build
yarn pack

# Copy the TGZ file to the Visual Studio Code OCP Viewer directory
Copy-Item -Path $relativeTgzPath -Destination $vscodeOcpViewerPath

Set-Location D:\Projets\vscode-ocp-cad-viewer
yarn remove three-cad-viewer
yarn cache clean three-cad-viewer
Invoke-Expression $yarnAddCommand
Set-Location $PSScriptRoot
