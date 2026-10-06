# ============================================================
# Step 2: Run Migrations & Generate Dummy Data
# ============================================================

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TBCall Database Setup - Step 2" -ForegroundColor Cyan
Write-Host "Run Migrations & Generate Dummy Data" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for PostgreSQL password
Write-Host "Enter PostgreSQL password for user 'postgres':" -ForegroundColor Yellow
$dbPassword = Read-Host -AsSecureString
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

# Set environment variables
$env:TBCALL_DB_URL = "jdbc:postgresql://localhost:5432/tbcall"
$env:TBCALL_DB_USER = "postgres"
$env:TBCALL_DB_PASSWORD = $plainPassword

Write-Host ""
Write-Host "✓ Environment variables configured" -ForegroundColor Green
Write-Host ""
Write-Host "Running Flyway migrations..." -ForegroundColor Yellow
Write-Host ""
Write-Host "This will:" -ForegroundColor White
Write-Host "  • Create all tables (V1-V17)" -ForegroundColor White
Write-Host "  • Insert reference data" -ForegroundColor White
Write-Host "  • Generate 35,000+ dummy records (V99)" -ForegroundColor White
Write-Host ""
Write-Host "⏱️  Estimated time: 5-10 minutes" -ForegroundColor Yellow
Write-Host "Please wait..." -ForegroundColor Yellow
Write-Host ""

$startTime = Get-Date

# Run migration
& .\mvnw.cmd flyway:migrate

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ SUCCESS! Database ready with dummy data!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Duration: $($duration.Minutes)m $($duration.Seconds)s" -ForegroundColor White
    Write-Host ""
    Write-Host "Generated data:" -ForegroundColor Cyan
    Write-Host "  • 1,000 facilities" -ForegroundColor White
    Write-Host "  • 1,000 patients" -ForegroundColor White
    Write-Host "  • 1,000 users" -ForegroundColor White
    Write-Host "  • 1,000 TB registrations" -ForegroundColor White
    Write-Host "  • 600 TB cases" -ForegroundColor White
    Write-Host "  • 700 treatments" -ForegroundColor White
    Write-Host "  • 10,000 dose events" -ForegroundColor White
    Write-Host "  • 1,000 contacts" -ForegroundColor White
    Write-Host "  • 1,000 alerts" -ForegroundColor White
    Write-Host "  • 3,000 notifications" -ForegroundColor White
    Write-Host "  • and more... (~35,000 total records)" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Run application:" -ForegroundColor White
    Write-Host "     .\mvnw.cmd spring-boot:run" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Test API endpoints:" -ForegroundColor White
    Write-Host "     curl http://localhost:8080/api/patients" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. View data in DBeaver/pgAdmin" -ForegroundColor White
    Write-Host ""
    
} else {
    Write-Host "✗ Migration Failed" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the error messages above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  • Wrong password" -ForegroundColor White
    Write-Host "  • PostgreSQL not running" -ForegroundColor White
    Write-Host "  • Port 5432 blocked" -ForegroundColor White
    Write-Host ""
    Write-Host "Try running migrations via DBeaver/pgAdmin instead." -ForegroundColor White
}

# Clear sensitive data
$env:TBCALL_DB_PASSWORD = $null
