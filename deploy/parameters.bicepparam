using './container-app.bicep'

// Authentication configuration
param entraAppId = '0b2f7424-ac58-413e-91cf-c1b97c16f3f7'
param entraTenantId = '99d1cd35-2846-46f1-935e-59047152a180'
param authRedirectUri = 'https://nodejs-demoapp.lemonrock-97154e27.canadacentral.azurecontainerapps.io/signin'

// Other required parameters
param appName = 'nodejs-demoapp'
param location = 'canadacentral'
param image = 'myshtccontainerregistry.azurecr.io/nodejs-demoapp:latest'
param managedIdentityResourceId = '' // You'll need to add your managed identity resource ID here

// Optional features (add values if you're using these)
param weatherApiKey = ''
param appInsightsConnString = ''
param todoMongoConnstr = '' 
