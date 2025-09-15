# Prerequisites
- An Entra external ID tenant
- GCP project (optional, if use gmail as 3rd party IdP)

# Design considerations
- Since only Schema Extensions can be used in user flows, but then it's very difficult to include Schema Extension in claims - it requires claim mapping policy - I may create both Schema Extension and Directory Extension to store same info "deviceID". 
Schema Extension will be used to collect device ID during user flow; then the value clone to Directory Extension for claim composing.

# Set up
## Tenant wide configuration
- create a web app
- set the redirect URI as per source code. For DEV on localhost, http is allowed, but https is mandatory on Azure. Port # in URI will be ignored, meaning http://localhost:3000 and http://localhost are same
- create a schema extension called "deviceID"
- creat a user flow for signup signin that collects email and deviceID

## App specific configurations
- assign the user flow to app
- create a app specific directory extension also called "deviceID"
- Set **AcceptMappedClaims** to be true in app manifest

# Ad Hoc Notes
- **kid** in assertion should be base64 coded


# Docs
- [MS official doc to create Custom Authentication Extension](https://learn.microsoft.com/en-us/entra/identity-platform/custom-extension-attribute-collection?tabs=start-continue%2Csubmit-continue)