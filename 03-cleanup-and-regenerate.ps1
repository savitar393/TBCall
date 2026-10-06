# ============================================================
# Cleanup Old Data & Regenerate Dummy Data
# Use this if V99 failed or you want fresh data
# ============================================================

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TBCall - Cleanup & Regenerate Dummy Data" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "⚠️  WARNING!" -ForegroundColor Yellow
Write-Host "This will DELETE all existing transaction data!" -ForegroundColor Yellow
Write-Host "Reference data and schema will be preserved." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Are you sure you want to continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "Cancelled by user" -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# Get database credentials
Write-Host "Enter PostgreSQL password for user 'postgres':" -ForegroundColor Yellow
$dbPassword = Read-Host -AsSecureString
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

# Set environment for psql
$env:PGPASSWORD = $plainPassword
$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

Write-Host ""
Write-Host "[1/2] Cleaning up old data..." -ForegroundColor Yellow

try {
    # Run cleanup SQL
    $result = & $psqlPath -U postgres -d tbcall -f "00-cleanup-dummy-data.sql" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Cleanup successful" -ForegroundColor Green
    } else {
        Write-Host "✗ Cleanup failed" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error during cleanup: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/2] Regenerating dummy data..." -ForegroundColor Yellow
Write-Host "This will take 5-10 minutes. Please wait..." -ForegroundColor Yellow
Write-Host ""

# Set environment for Maven
$env:TBCALL_DB_URL = "jdbc:postgresql://localhost:5432/tbcall"
$env:TBCALL_DB_USER = "postgres"
$env:TBCALL_DB_PASSWORD = $plainPassword

# Run only V99 migration
try {
    # Execute V99 directly via psql (faster than re-running all migrations)
    $startTime = Get-Date
    
    $result = & $psqlPath -U postgres -d tbcall -f "src/main/resources/db/migration/V99__complete_dummy_data.sql" 2>&1
    
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "✓ SUCCESS! Fresh dummy data generated!" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "Duration: $($duration.Minutes)m $($duration.Seconds)s" -ForegroundColor Green
        Write-Host ""
        
        # Verify
        Write-Host "Verifying data..." -ForegroundColor Yellow
        Write-Host ""
        
        $verifyQuery = @"
SELECT 
    'patients' as table_name, COUNT(*) as records FROM patients
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'treatments', COUNT(*) FROM treatments
UNION ALL SELECT 'dose_events', COUNT(*) FROM dose_events
ORDER BY records DESC;
"@
        
        & $psqlPath -U postgres -d tbcall -c $verifyQuery
        
        Write-Host ""
        Write-Host "✓ Data regeneration complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next: Run application with .\mvnw.cmd spring-boot:run" -ForegroundColor Cyan
        
    } else {
        Write-Host ""
        Write-Host "✗ Data generation failed" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "✗ Error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clear sensitive data
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\TBCALL_DB_PASSWORD -ErrorAction SilentlyContinue
}
