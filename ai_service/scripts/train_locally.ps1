# Train the basketball-court CNN inside the ai_service Docker container.
# All Python deps (TensorFlow CPU, OpenCV, kaggle CLI) live in the container —
# nothing extra is required on your Windows host beyond Docker Desktop.
#
# Usage (from repo root):
#   ./ai_service/scripts/train_locally.ps1
#   ./ai_service/scripts/train_locally.ps1 -KaggleDataset 'owner/slug'
#   ./ai_service/scripts/train_locally.ps1 -ManualRoot '/app/data/manual'
#
# Prerequisites:
#   - Docker Desktop running.
#   - The ai_service image is built (`docker compose build ai_service`).
#     This script will build it for you on first run.
#   - (Optional) For the Kaggle source, place your real kaggle.json at
#     $env:USERPROFILE\.kaggle\kaggle.json — it is bind-mounted into the
#     container at /root/.kaggle/kaggle.json read-only.

param(
    [string]$DataDir = '/app/data',
    [string]$OutputModel = '/app/models/basketball_court_cnn.h5',
    [int]$SyntheticTrain = 400,
    [int]$SyntheticVal = 80,
    [int]$SyntheticTest = 50,
    [int]$Epochs = 12,
    [int]$Batch = 16,
    [string]$KaggleDataset,
    [string]$ManualRoot
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
Write-Host "repo root: $repoRoot" -ForegroundColor DarkGray
Push-Location $repoRoot
try {
    # Mount kaggle creds if they exist on the host. Read-only so the container
    # can't write back.
    $kaggleHostPath = Join-Path $env:USERPROFILE '.kaggle'
    $kaggleMount = @()
    if (Test-Path $kaggleHostPath) {
        $kaggleMount = @('-v', "${kaggleHostPath}:/root/.kaggle:ro")
        Write-Host 'Mounting host ~/.kaggle into container' -ForegroundColor DarkGray
    }

    Write-Host '=== 1/2: preparing dataset ===' -ForegroundColor Cyan
    $prepareCmd = @(
        'compose', 'run', '--rm', '--no-deps'
    ) + $kaggleMount + @(
        'ai_service',
        'python', '-m', 'app.training.prepare_data',
        '--out', $DataDir,
        '--synthetic-train', $SyntheticTrain,
        '--synthetic-val', $SyntheticVal,
        '--synthetic-test', $SyntheticTest
    )
    if ($KaggleDataset) { $prepareCmd += @('--kaggle-dataset', $KaggleDataset) }
    if ($ManualRoot)    { $prepareCmd += @('--manual-root',   $ManualRoot) }
    & docker @prepareCmd
    if ($LASTEXITCODE -ne 0) { throw "prepare_data failed (exit $LASTEXITCODE)" }

    Write-Host ''
    Write-Host '=== 2/2: training (this is the long one) ===' -ForegroundColor Cyan
    & docker compose run --rm --no-deps ai_service `
        python -m app.training.train `
        --data $DataDir `
        --output $OutputModel `
        --epochs $Epochs `
        --batch $Batch
    if ($LASTEXITCODE -ne 0) { throw "train failed (exit $LASTEXITCODE)" }

    Write-Host ''
    Write-Host "Training complete. Model at $OutputModel (host: ai_service/models/)" -ForegroundColor Green
    Write-Host 'Restart the AI service to pick up the new weights:' -ForegroundColor Yellow
    Write-Host '  docker compose restart ai_service' -ForegroundColor Yellow
}
finally {
    Pop-Location
}
