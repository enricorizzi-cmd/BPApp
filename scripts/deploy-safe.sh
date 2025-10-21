#!/bin/bash

# Safe deployment script for Render.com
# Prevents stuck deployments with automatic retry logic

set -e

echo "🚀 Starting safe deployment process..."

# Function to check deploy status
check_deploy_status() {
    local service_id="srv-d2rds26r433s73fhcn60"
    local deploy_id=$1
    
    echo "📊 Checking deploy status: $deploy_id"
    
    # Check if deploy is stuck (running for more than 10 minutes)
    # This would need to be implemented with Render API calls
    return 0
}

# Function to force new deploy
force_deploy() {
    echo "🔄 Forcing new deployment..."
    git commit --allow-empty -m "Force deploy $(date +%Y%m%d_%H%M%S)"
    git push origin main
    echo "✅ New deploy triggered"
}

# Function to monitor deploy
monitor_deploy() {
    local max_wait=600  # 10 minutes
    local wait_time=0
    
    echo "⏱️ Monitoring deployment (max wait: ${max_wait}s)..."
    
    while [ $wait_time -lt $max_wait ]; do
        # Check if site is responding
        if curl -s -f "https://bpapp-battle-plan.onrender.com/api/health" > /dev/null; then
            echo "✅ Deploy completed successfully!"
            return 0
        fi
        
        sleep 30
        wait_time=$((wait_time + 30))
        echo "⏳ Still waiting... (${wait_time}s elapsed)"
    done
    
    echo "⚠️ Deploy timeout reached, forcing new deploy..."
    force_deploy
    return 1
}

# Main deployment process
main() {
    echo "📦 Starting deployment..."
    
    # Push current changes
    git add .
    git commit -m "Deploy: $(date +%Y%m%d_%H%M%S)" || echo "No changes to commit"
    git push origin main
    
    # Monitor the deployment
    monitor_deploy
}

# Run main function
main "$@"
