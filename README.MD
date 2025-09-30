# Prerequisites
- An Entra external ID tenant
- GCP project (optional, if use gmail as 3rd party IdP)

# Set up
## Tenant wide configuration
- create a web app
- set the redirect URI as per source code. For DEV on localhost, http is allowed, but https is mandatory on Azure. Port # in URI will be ignored, meaning http://localhost:3000 and http://localhost are same
- create a schema extension called "deviceID"
- creat a user flow for signup signin that collects name and deviceID
- [Optional] Create a Custom Authentiction Extension (CAE hereafter) if we need to manipulate any aspect of the User Flow. 
- [Todo]: add a attributeCollectionSubmit CAE to check if the deviceID user provided is existing in Entra. If yes, current owner's confirmation is required to proceed
- [optional] Link the CAE to our User Flow

## App specific configurations
- assign the user flow to app
- In Enterprise Applications, custom claim policy, here please include deviceiD claim in ID token
- Link User Flow to our app
- [Optional] 
- [Optional] Set **AcceptMappedClaims** to be true in app manifest (optional, if claim mapping policy is used, which our app isn't)

# App control flow and architect
- server.js sets up a node.js web server. This server has below endpoints and routes
    * /login: login route
    * /redirect: redirect route after successful login. This route is used by Entra 
    * /api/retrieveUserProfile: REST API for client side to fetch deviceID claim from ID token
    * /ws: websocket server
    * /public: expose static folder /public
- Flow for current version (place holder)
    * [client] user visite web server, which by default (implicit so it's not in my code) loads /public/index.html
    * [server] local script in index.html calls /login route
    * [server] login route redirected to /redirct route
    * [server] /rediret gets access token then redirects to /public/showProfile.html page. Here depending on which link user clicks, showProfile.html/logout.html/garage.html can be loaded 
    * [client] garage.html page runs webSocketClient.js
    * [client] webSocketClient.js establishes a channel with ws.js[server], and refresh garage.html with info it receives from the channel
- Flow for first working version
    * [client] user visite web server, which by default (implicit so it's not in my code) loads /public/index.html
    * [server] local script in index.html calls /login route
    * [server] login route redirected to /redirct route
    * [server] /rediret gets access token then redirects to /public/garage.html page 
    * [client] garage.html page runs webSocketClient.js
    * [client] webSocketClient.js establishes a channel with ws.js[server], and refresh garage.html with info it receives from the channel

# Ad Hoc Notes
- **kid** in assertion should be base64 coded


# Docs
- [MS official doc to create Custom Authentication Extension](https://learn.microsoft.com/en-us/entra/identity-platform/custom-extension-attribute-collection?tabs=start-continue%2Csubmit-continue)