# ============================================================
# TBCall Dummy Data Generator - Quick Start Script
# Windows PowerShell Script
# ============================================================

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TBCall Dummy Data Generator" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Set Environment Variables
Write-Host "[1/5] Setting up environment variables..." -ForegroundColor Yellow

# Prompt for database credentials if not set
if (-not $env:TBCALL_DB_URL) {
    $dbHost = Read-Host "Enter PostgreSQL host (default: localhost)"
    if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }
    
    $dbPort = Read-Host "Enter PostgreSQL port (default: 5432)"
    if ([string]::IsNullOrWhiteSpace($dbPort)) { $dbPort = "5432" }
    
    $dbName = Read-Host "Enter database name (default: tbcall)"
    if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "tbcall" }
    
    $env:TBCALL_DB_URL = "jdbc:postgresql://${dbHost}:${dbPort}/${dbName}"
}

if (-not $env:TBCALL_DB_USER) {
    $env:TBCALL_DB_USER = Read-Host "Enter PostgreSQL username (default: postgres)"
    if ([string]::IsNullOrWhiteSpace($env:TBCALL_DB_USER)) { $env:TBCALL_DB_USER = "postgres" }
}

if (-not $env:TBCALL_DB_PASSWORD) {
    $env:TBCALL_DB_PASSWORD = Read-Host "Enter PostgreSQL password" -AsSecureString
    $env:TBCALL_DB_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($env:TBCALL_DB_PASSWORD)
    )
}

Write-Host "✓ Database URL: $env:TBCALL_DB_URL" -ForegroundColor Green
Write-Host "✓ Database User: $env:TBCALL_DB_USER" -ForegroundColor Green
Write-Host ""

# Step 2: Test Database Connection
Write-Host "[2/5] Testing database connection..." -ForegroundColor Yellow

$pgPassword = $env:TBCALL_DB_PASSWORD
$env:PGPASSWORD = $pgPassword

try {
    $dbName = $env:TBCALL_DB_URL -replace '.*\/([^\/\?]+)(\?.*)?$', '$1'
    $result = psql -U $env:TBCALL_DB_USER -d $dbName -c "SELECT 1;" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Database connection successful" -ForegroundColor Green
    } else {
        Write-Host "✗ Database connection failed" -ForegroundColor Red
        Write-Host "Error: $result" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please check:" -ForegroundColor Yellow
        Write-Host "  1. PostgreSQL is running" -ForegroundColor Yellow
        Write-Host "  2. Database '$dbName' exists" -ForegroundColor Yellow
        Write-Host "  3. Username and password are correct" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ Cannot connect to PostgreSQL" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure PostgreSQL client tools (psql) are installed and in PATH" -ForegroundColor Yellow
    Write-Host "Or skip this check and try running migration anyway" -ForegroundColor Yellow
    
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

Write-Host ""

# Step 3: Check Migration Status
Write-Host "[3/5] Checking migration status..." -ForegroundColor Yellow

try {
    & .\mvnw.cmd flyway:info
    Write-Host ""
    Write-Host "✓ Flyway info retrieved" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get migration info" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""

# Step 4: Confirm Execution
Write-Host "[4/5] Ready to generate dummy data" -ForegroundColor Yellow
Write-Host ""
Write-Host "This will:" -ForegroundColor White
Write-Host "  • Run all pending migrations (V1-V99)" -ForegroundColor White
Write-Host "  • Generate 35,000+ dummy records" -ForegroundColor White
Write-Host "  • Take approximately 5-10 minutes" -ForegroundColor White
Write-Host ""
Write-Host "WARNING: This will insert data into your database!" -ForegroundColor Red
Write-Host ""

$confirm = Read-Host "Do you want to continue? (y/n)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Cancelled by user" -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# Step 5: Run Migration
Write-Host "[5/5] Running Flyway migration (including V99 dummy data)..." -ForegroundColor Yellow
Write-Host "This may take 5-10 minutes. Please wait..." -ForegroundColor Yellow
Write-Host ""

$startTime = Get-Date

try {
    & .\mvnw.cmd flyway:migrate
    
    if ($LASTEXITCODE -eq 0) {
        $endTime = Get-Date
        $duration = $endTime - $startTime
        
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "✓ SUCCESS! Dummy data generated!" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "Duration: $($duration.Minutes)m $($duration.Seconds)s" -ForegroundColor Green
        Write-Host ""
        
        # Verification
        Write-Host "Verifying data..." -ForegroundColor Yellow
        
        $verifyQuery = @"
SELECT 
    'facilities' as table_name, COUNT(*) as count FROM facilities
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'tb_cases', COUNT(*) FROM tb_cases
UNION ALL SELECT 'treatments', COUNT(*) FROM treatments
UNION ALL SELECT 'dose_events', COUNT(*) FROM dose_events
ORDER BY count DESC
LIMIT 10;
"@
        
        try {
            $dbName = $env:TBCALL_DB_URL -replace '.*\/([^\/\?]+)(\?.*)?$', '$1'
            Write-Host ""
            psql -U $env:TBCALL_DB_USER -d $dbName -c $verifyQuery
            Write-Host ""
            Write-Host "✓ Data verification complete" -ForegroundColor Green
        } catch {
            Write-Host "⚠ Could not verify data (but migration succeeded)" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Run application: .\mvnw.cmd spring-boot:run" -ForegroundColor White
        Write-Host "  2. Test API endpoints" -ForegroundColor White
        Write-Host "  3. Explore data in DBeaver or pgAdmin" -ForegroundColor White
        Write-Host ""
        
    } else {
        Write-Host ""
        Write-Host "✗ Migration failed" -ForegroundColor Red
        Write-Host "Please check the error messages above" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "✗ Error running migration" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Cleanup
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
