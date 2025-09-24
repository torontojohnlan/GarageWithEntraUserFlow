# Prerequisites
- An Entra external ID tenant
- GCP project (optional, if use gmail as 3rd party IdP)

# Set up
## Tenant wide configuration
- create a web app
- set the redirect URI as per source code. For DEV on localhost, http is allowed, but https is mandatory on Azure. Port # in URI will be ignored, meaning http://localhost:3000 and http://localhost are same
- create a schema extension called "deviceID"
- creat a user flow for signup signin that collects name and deviceID

## App specific configurations
- assign the user flow to app
- In Enterprise Applications, custom claim policy
- Set **AcceptMappedClaims** to be true in app manifest (optional, if claim mapping policy is used, which our app isn't)

# Ad Hoc Notes
- **kid** in assertion should be base64 coded


# Docs
- [MS official doc to create Custom Authentication Extension](https://learn.microsoft.com/en-us/entra/identity-platform/custom-extension-attribute-collection?tabs=start-continue%2Csubmit-continue)