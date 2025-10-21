# Safe deployment script for Render.com (Windows PowerShell)
# Prevents stuck deployments with automatic retry logic

param(
    [switch]$Force,
    [int]$MaxWaitMinutes = 10
)

Write-Host "🚀 Starting safe deployment process..." -ForegroundColor Green

function Test-SiteHealth {
    try {
        $response = Invoke-WebRequest -Uri "https://bpapp-battle-plan.onrender.com/api/health" -UseBasicParsing -TimeoutSec 10
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Start-ForceDeploy {
    Write-Host "🔄 Forcing new deployment..." -ForegroundColor Yellow
    
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    git commit --allow-empty -m "Force deploy $timestamp"
    git push origin main
    
    Write-Host "✅ New deploy triggered" -ForegroundColor Green
}

function Start-MonitorDeploy {
    param([int]$MaxWaitSeconds)
    
    $waitTime = 0
    $checkInterval = 30
    
    Write-Host "⏱️ Monitoring deployment (max wait: $MaxWaitSeconds seconds)..." -ForegroundColor Cyan
    
    while ($waitTime -lt $MaxWaitSeconds) {
        if (Test-SiteHealth) {
            Write-Host "✅ Deploy completed successfully!" -ForegroundColor Green
            return $true
        }
        
        Start-Sleep -Seconds $checkInterval
        $waitTime += $checkInterval
        Write-Host "⏳ Still waiting... ($waitTime seconds elapsed)" -ForegroundColor Yellow
    }
    
    Write-Host "⚠️ Deploy timeout reached, forcing new deploy..." -ForegroundColor Red
    Start-ForceDeploy
    return $false
}

function Start-SafeDeploy {
    Write-Host "📦 Starting deployment..." -ForegroundColor Blue
    
    # Stage and commit changes
    git add .
    $commitMessage = "Deploy: $(Get-Date -Format 'yyyyMMdd_HHmmss')"
    
    try {
        git commit -m $commitMessage
        Write-Host "✅ Changes committed" -ForegroundColor Green
    }
    catch {
        Write-Host "ℹ️ No changes to commit" -ForegroundColor Yellow
    }
    
    # Push changes
    git push origin main
    Write-Host "✅ Changes pushed to repository" -ForegroundColor Green
    
    # Monitor deployment
    $maxWaitSeconds = $MaxWaitMinutes * 60
    $success = Start-MonitorDeploy -MaxWaitSeconds $maxWaitSeconds
    
    if ($success) {
        Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Deployment required intervention" -ForegroundColor Yellow
    }
}

# Main execution
if ($Force) {
    Start-ForceDeploy
} else {
    Start-SafeDeploy
}
