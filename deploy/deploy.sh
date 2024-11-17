#!/bin/bash

# Exit on any error
set -e

# Function to show usage
show_usage() {
    echo "Usage: $0 [full|code]"
    echo "  full - Full deployment including infrastructure"
    echo "  code - Code updates only (build and push)"
    exit 1
}

# Function to get current timestamp
get_timestamp() {
    date +%s
}

# Validate command line argument
if [ $# -eq 0 ]; then
    echo "Error: No deployment type specified"
    show_usage
fi

if [ "$1" != "full" ] && [ "$1" != "code" ]; then
    echo "Error: Invalid deployment type '$1'"
    show_usage
fi

deploy_type=$1

echo "Starting deployment process... (Type: $deploy_type)"

# Record start time
start_time=$(get_timestamp)

# Generate unique tag using timestamp
unique_tag=$(date +%Y%m%d-%H%M%S)
echo "Using unique tag: ${unique_tag}"

# Login to Azure Container Registry
echo "Logging into Azure Container Registry..."
az acr login --name myshtccontainerregistry

# Build container with both tags
echo "Building container..."
docker build --no-cache -f build/Dockerfile \
  -t myshtccontainerregistry.azurecr.io/nodejs-demoapp:latest \
  -t myshtccontainerregistry.azurecr.io/nodejs-demoapp:${unique_tag} .

# Push both tags to registry
echo "Pushing to registry..."
docker push myshtccontainerregistry.azurecr.io/nodejs-demoapp:latest
docker push myshtccontainerregistry.azurecr.io/nodejs-demoapp:${unique_tag}

# Calculate code update duration
end_time=$(get_timestamp)
code_duration=$((end_time - start_time))

if [ "$deploy_type" = "full" ]; then
    echo "Deploying to Azure Container Apps..."
    deployment_result=$(az deployment group create \
      --resource-group myResourceGroup \
      --template-file deploy/container-app.bicep \
      --parameters @deploy/parameters.json \
      --parameters managedIdentityResourceId="/subscriptions/b0f7b1d4-7534-4570-94d2-96dc432854ef/resourcegroups/myResourceGroup/providers/Microsoft.ManagedIdentity/userAssignedIdentities/myacrmanagedid" \
      --query "{status: properties.provisioningState, duration: properties.duration, appUrl: properties.outputs.appURL.value}" \
      -o json)

    # Convert PT duration to seconds
    duration=$(echo $deployment_result | jq -r .duration | sed 's/PT//g' | sed 's/S//g')
    # Round to nearest second
    duration_seconds=$(printf "%.0f" $duration)

    echo "Deployment Results:"
    echo "==================="
    echo "Status: $(echo $deployment_result | jq -r .status)"
    echo "Code Update Duration: ${code_duration} seconds"
    echo "Infrastructure Deployment Duration: ${duration_seconds} seconds"
    echo "Total Duration: $((code_duration + duration_seconds)) seconds"
    echo "App URL: $(echo $deployment_result | jq -r .appUrl)"
    echo "==================="
else
    echo "Updating Container App with new image..."
    az containerapp update \
      --name nodejs-demoapp \
      --resource-group myResourceGroup \
      --image myshtccontainerregistry.azurecr.io/nodejs-demoapp:${unique_tag}

    echo "Waiting for update to complete..."
    sleep 10  # Give it some time to update

    echo "Code Update Results:"
    echo "==================="
    echo "Status: Completed"
    echo "Duration: ${code_duration} seconds"
    echo "Image: myshtccontainerregistry.azurecr.io/nodejs-demoapp:${unique_tag}"
    echo "==================="
fi

echo "Process complete!"
