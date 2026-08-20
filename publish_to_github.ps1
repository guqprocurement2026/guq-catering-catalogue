param(
  [Parameter(Mandatory=$true)][string]$RepositoryUrl
)
$ErrorActionPreference = "Stop"
Write-Host "Initializing catalogue repository..."
git init
git add .
git commit -m "Initial GU-Q catering catalogue implementation"
git branch -M main
if ((git remote) -contains "origin") { git remote set-url origin $RepositoryUrl } else { git remote add origin $RepositoryUrl }
git push -u origin main
Write-Host "Pushed. In GitHub: Settings > Pages > Source = GitHub Actions."
