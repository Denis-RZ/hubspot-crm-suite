$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runnerPath = Join-Path $scriptDir 'tests\capture-screenshots.spec.js'

if (-not (Test-Path $runnerPath)) {
    throw "Capture runner not found: $runnerPath"
}

Push-Location $scriptDir
try {
    node .\tests\capture-screenshots.spec.js
    if ($LASTEXITCODE -ne 0) {
        throw "Screenshot capture failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
