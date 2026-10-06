# ============================================================
# TBCall Dummy Data Generator - Simple Version
# Just set env vars and run
# ============================================================

# GANTI INI dengan credential PostgreSQL Anda:
$env:TBCALL_DB_URL = "jdbc:postgresql://localhost:5432/tbcall"
$env:TBCALL_DB_USER = "postgres"
$env:TBCALL_DB_PASSWORD = "postgres"  # <-- GANTI INI!

Write-Host "Running Flyway migration to generate dummy data..." -ForegroundColor Cyan
Write-Host "This will take 5-10 minutes. Please wait..." -ForegroundColor Yellow
Write-Host ""

# Run migration
& .\mvnw.cmd flyway:migrate

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ SUCCESS! Dummy data generated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify by running:" -ForegroundColor Cyan
    Write-Host "  psql -U postgres -d tbcall -c 'SELECT COUNT(*) FROM patients;'" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "✗ Failed. Check error messages above." -ForegroundColor Red
}
