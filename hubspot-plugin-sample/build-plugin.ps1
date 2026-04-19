# Builds notes.plugin.dll and packages it with notes.js into notes-plugin.zip
$root  = Split-Path $MyInvocation.MyCommand.Path
$out   = "$root\bin\plugin-release"
$zip   = "$root\notes-plugin.zip"

dotnet publish "$root\HubSpotPlugin.Sample.csproj" -c Release -o $out --no-self-contained

if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

$dll = Get-Item "$out\notes.plugin.dll"
$js  = "$root\notes.js"

if (Test-Path $zip) { Remove-Item $zip }

Compress-Archive -Path $dll.FullName, $js -DestinationPath $zip

Write-Host "Plugin ZIP created: $zip" -ForegroundColor Green
Write-Host "Upload it via Settings → Install Plugin in the web UI."
