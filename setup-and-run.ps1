# ============================================================
# TBCall Dummy Data - Setup & Run (Interactive)
# ============================================================

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TBCall Dummy Data Generator Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for credentials
Write-Host "Enter your PostgreSQL credentials:" -ForegroundColor Yellow
Write-Host ""

$dbPassword = Read-Host "PostgreSQL password for user 'postgres'" -AsSecureString
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

# Set environment variables
$env:TBCALL_DB_URL = "jdbc:postgresql://localhost:5432/tbcall"
$env:TBCALL_DB_USER = "postgres"
$env:TBCALL_DB_PASSWORD = $plainPassword

Write-Host ""
Write-Host "✓ Environment variables set" -ForegroundColor Green
Write-Host ""
Write-Host "Starting Flyway migration..." -ForegroundColor Yellow
Write-Host "This will take 5-10 minutes. Please wait..." -ForegroundColor Yellow
Write-Host ""

# Run migration
& .\mvnw.cmd flyway:migrate

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "✓ SUCCESS! Dummy data generated!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Run application: .\mvnw.cmd spring-boot:run" -ForegroundColor White
    Write-Host "  2. Test endpoints: curl http://localhost:8080/api/patients" -ForegroundColor White
} else {
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host "✗ Migration Failed" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  • Wrong password - Try again with correct password" -ForegroundColor White
    Write-Host "  • Database 'tbcall' doesn't exist - Create it first" -ForegroundColor White
    Write-Host "  • PostgreSQL not running - Start the service" -ForegroundColor White
}
