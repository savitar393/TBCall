# ============================================================
# Step 1: Create TBCall Database
# ============================================================

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TBCall Database Setup - Step 1" -ForegroundColor Cyan
Write-Host "Create Database" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for PostgreSQL password
Write-Host "Enter PostgreSQL password for user 'postgres':" -ForegroundColor Yellow
$dbPassword = Read-Host -AsSecureString
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

Write-Host ""
Write-Host "Creating database 'tbcall'..." -ForegroundColor Yellow

# Set password for psql
$env:PGPASSWORD = $plainPassword

# Path to psql
$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

try {
    # Create database
    $result = & $psqlPath -U postgres -c "CREATE DATABASE tbcall;" 2>&1
    
    if ($LASTEXITCODE -eq 0 -or $result -like "*already exists*") {
        Write-Host "✓ Database 'tbcall' ready" -ForegroundColor Green
        
        # Verify
        Write-Host ""
        Write-Host "Verifying database..." -ForegroundColor Yellow
        & $psqlPath -U postgres -l | Select-String "tbcall"
        
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "✓ Database Created Successfully!" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next step: Run migrations and generate dummy data" -ForegroundColor Cyan
        Write-Host "  .\02-run-migrations.ps1" -ForegroundColor White
        
    } else {
        Write-Host "✗ Failed to create database" -ForegroundColor Red
        Write-Host "Error: $result" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  • Make sure PostgreSQL is running" -ForegroundColor White
    Write-Host "  • Check if password is correct" -ForegroundColor White
    Write-Host "  • Try using pgAdmin to create database manually" -ForegroundColor White
    exit 1
} finally {
    # Clear password
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
