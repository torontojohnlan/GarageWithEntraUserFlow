const express = require('express');
const session = require('express-session');
const axios = require('axios');
const app = express();
// const https = require('https');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const tokenSigningKey = fs.readFileSync('./server/tokenSigningKey.txt', 'utf8'); // for token signing
// showDebugMsg('Loading private key from garage.pem:', tokenSigningKey ? tokenSigningKey : 'Failed to load key');
const { v4: uuidv4 } = require('uuid');

const expressWs = require('express-ws');
expressWs(app);
const makeWss = require('./ws.js');
const e = require('express');
const wsHandler = makeWss();

app.ws('/ws', wsHandler);
app.use('/public', express.static('public')); //apps route is the client interface portion of this app

const HOST = process.env.HOST || 'localhost';

let debugMode, PORT, protocol;
if (HOST === 'localhost') {
  require('dotenv').config({ path: ".env.EntraParameters" });
  require('dotenv').config({ path: ".env.appParameters" });
  debugMode = true;
  protocol = 'http';
  PORT = 80
  console.log('Debug mode is ON. Using .env.appParameters and .env.EntraParameters');
} else {
  debugMode = false;
  protocol = 'https';
  PORT = 443;
  console.log('Debug mode is OFF. Using environment variables directly.');
}
function showDebugMsg(...args) {
    if (debugMode)
        console.log(...args);
}

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID; // Use your tenant ID or set it in .env
const TENANT_NAME = process.env.TENANT_NAME; // Use your tenant name or set it in .env
const AUTHORITY = process.env.AUTHORITY;
const EntraExtensionAppID = process.env.EntraExtensionAppID;
const EntraExtensionAppID_with_dash_removed = EntraExtensionAppID.replace(/-/g, ''); // e.g., 9522cfa68fa1
const extn_deviceID = `extension_${EntraExtensionAppID_with_dash_removed}_deviceID`; // The custom attribute created in Entra ID, e.g., extension_9522cfa68fa1_deviceID
const URI = process.env.URI;// if ngrok is used, please update env variable to match the public URI
const REDIRECT_URI = `${protocol}://${URI}/redirect`;
const API_SCOPE = `api://${URI}/${CLIENT_ID}/deviceID.clone`; // prerequisite: you need to create a scope in Entra ID for your API, e.g., api://<your-client-id>/deviceID
const GARAGE_CERT_THUMBPRINT = process.env.GARAGE_CERT_THUMBPRINT; // Thumbprint of the certificate used to sign the JWT token

showDebugMsg(`Using AUTHORITY: ${AUTHORITY}`);
showDebugMsg(`Using REDIRECT_URI: ${REDIRECT_URI}`);
showDebugMsg(`Using API_SCOPE: ${API_SCOPE}`);

app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'your_secret_v3ry_$7r0ng_secret', // Use a strong secret for session encryption
  resave: false,
  saveUninitialized: true
}));

//#region Define custom auth extension API
// --------------------------------
// To be finished
// --------------------------------
// The Auth Extension Handler has a helper function, which is defined as a middleware
// Middleware to validate Entra request for extension (simplified)
// const validateEntraRequest = (req, res, next) => {
//   showDebugMsg('Validating Entra request with headers:', req.headers);
//   const authHeader = req.headers['authorization'];
//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     console.error('[CAE] Missing or invalid Authorization header');
//     return res.status(401).json({ error: 'Invalid authorization' });
//   }
//   // In production: Validate JWT against Entra's JWKS endpoint
//   next();
// };

// Core handler for the authentication extension

// ----------- if we are to use attributeCollectionSubmit event -----------
// const attributeCollectionSubmitCAE = async (req, res) => { // CAE is shorthand for Custom Authentication Extension
//   showDebugMsg('[CAE] Received request at /api/authExtension with body:', req.body);
//   try {
//     const eventData = req.body;
//     // showDebugMsg('[CAE] request body:', req.body);
//     // if (eventData.eventType === 'AttributeCollectionSubmit') { //original line given by grok
//     if (eventData.type === 'microsoft.graph.authenticationEvent.attributeCollectionSubmit') {
//       const userSignUpInfo = eventData.data.userSignUpInfo;
//       showDebugMsg('[Auth Extension Handler][user signup info from req body]:', userSignUpInfo);

//       // Access the custom attribute collected during signup
//       const deviceID = userSignUpInfo.attributes[extn_deviceID];
//       const displayName = userSignUpInfo.attributes.displayName;
//       const signUpEmail = userSignUpInfo.identities.issuerAssignedId;

//       if (!deviceID) { // here we should clone value
//         return res.status(400).json({ error: `DeviceID not found in user signup data` });
//       }

//       // Store in session for app-specific use
//       req.session.signUPmail = signUpEmail;
//       req.session.displayName = displayName;
//       req.session.deviceID = deviceID;

//       // Copy the value to extn.deviceID
//       // need to use graph PATCH function to clone value from the b2c app to my own app - to be done
//       try {
//         await axios.patch(
//           `https://graph.microsoft.com/v1.0/users/${userId}`,
//           {
//             [`extension_${EntraExtensionAppID_with_dash_removed}_deviceID`]: deviceID
//           },
//           {
//             headers: {
//               Authorization: `Bearer ${accessToken}`,
//               'Content-Type': 'application/json'
//             }
//           }
//         );
//         showDebugMsg(`Cloned deviceID to directory extension for user ${userId}`);
//       } catch (err) {
//         console.error('Failed to clone deviceID to directory extension:', err.response?.data || err.message);
//       }


//       // https://medium.com/the-new-control-plane/augmenting-sign-up-attributes-with-the-attribute-collection-start-custom-authentication-extension-757c5614be23

//       // Manipulate claim value here if needed. If we are to manipulate one claim, we need to populate all other claims as well
//       const customClaims = {
//         "deviceID": deviceID // This will be mapped to the user's attribute if claim mapping policy is set
//         // Not sure what the claim name should be here, either "deviceID", or "extn.deviceID"

//         // email: signUpEmail;  // --> this should not be necccessary as this is part of core claim set.
//         // verified_primary_email: signUpEmail;   // --> this should not be necccessary as this is part of core claim set.
//       };

//       // Response to Entra ID
//       const response = {
//         "data": {
//           "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData", // added by JL as per MS doc, https://learn.microsoft.com/en-us/entra/identity-platform/custom-extension-onattributecollectionstart-retrieve-return-data
//           "actions": [
//             {
//               // '@odata.type': 'microsoft.graph.onTokenIssuanceStartResponseData', // original line given by grok
//               "@odata.type": "microsoft.graph.attributeCollectionStart.continueWithDefaultBehavior", // changed by JL as per MS doc, https://learn.microsoft.com/en-us/entra/identity-platform/custom-extension-onattributecollectionstart-retrieve-return-data
//               // claims: customClaims
//             }
//           ]
//         }
//       };

//       return res.status(200).json(response);
//     } else {
//       return res.status(400).json({ error: 'Unsupported event type' });
//     }
//   } catch (error) {
//     console.error('Error processing auth extension:', error);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// };
// app.post('/api/preTokenCAE', validateEntraRequest, attributeCollectionSubmitCAE);   // In Entra, auth enxtension endpoint should be https://<your-domain-or-ip>/<route defined here>
// ----------- if we are to use attributeCollectionSubmit event -----------

// const tokenIssuanceCAE = async (req, res) => { // CAE is shorthand for Custom Authentication Extension
//   showDebugMsg('[CAE] Received request at /api/authExtension with body:', req.body);
//   try {
//     const eventData = req.body;
//     // showDebugMsg('[CAE] request body:', req.body);
//     // if (eventData.eventType === 'AttributeCollectionSubmit') { //original line given by grok
//     if (eventData.type === 'microsoft.graph.authenticationEvent.tokenIssuanceStart') {
//       const user = eventData.data.authenticationContext.user;
//       showDebugMsg('[Auth Extension Handler][user info from req body]:', user);
//       const userId = user.id;

//       // Store in session for app-specific use
//       req.session.id = userId;
//       req.session.displayName = user.displayName;
//       req.session.deviceID = user.deviceID;

//       // Copy the value to extn.deviceID
//       // need to use graph PATCH function to clone value from the b2c app to my own app - to be done
//       // try {
//       //   await axios.patch(
//       //     `https://graph.microsoft.com/v1.0/users/${userId}`,
//       //     {
//       //       [`extension_${EntraExtensionAppID_with_dash_removed}_deviceID`]: deviceID
//       //     },
//       //     {
//       //       headers: {
//       //         Authorization: `Bearer ${accessToken}`,
//       //         'Content-Type': 'application/json'
//       //       }
//       //     }
//       //   );
//       //   showDebugMsg(`Cloned deviceID to directory extension for user ${userId}`);
//       // } catch (err) {
//       //   console.error('Failed to clone deviceID to directory extension:', err.response?.data || err.message);
//       // }

//       // Response to Entra ID
//       const response = {
//         "data": {
//           "@odata.type": "microsoft.graph.onTokenIssuanceStartResponseData", // added by JL as per MS doc, https://learn.microsoft.com/en-us/entra/identity-platform/custom-extension-onattributecollectionstart-retrieve-return-data
//           "actions": [
//             {
//               '@odata.type': 'microsoft.graph.onTokenIssuanceStartResponseData.provideClaimsForToken', // original line given by grok
//               // claims: customClaims
//             }
//           ]
//         }
//       };

//       return res.status(200).json(response);
//     } else {
//       return res.status(400).json({ error: 'Unsupported event type' });
//     }
//   } catch (error) {
//     console.error('Error processing auth extension:', error);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// };

// // Custom Authentication Extension Endpoint (for Entra)
// // Note: With the help of "Custom Claim Provider" under Enterprise applications → All applications → select your app → Single sign-on → Attributes & claims → Advanced settings → Custom claims provider
// // This is also where we can bind the app to a preTokenIssuance event
// // 
// //  We no longer need CAE but I will leave the coee in here for reference
// app.post('/api/preTokenCAE', validateEntraRequest, tokenIssuanceCAE);   // In Entra, auth enxtension endpoint should be https://<your-domain-or-ip>/<route defined here>
//#endregion Auth Extension API



// The /login route redirects the user to the Entra authorization endpoint to get an authorization code.
// The /redirect route receives the code as a query parameter after user authentication.
// The server then exchanges this code for tokens (id_token and access_token) by POSTing to the /token endpoint.

app.get('/login', (req, res) => {
  // Redirect to Azure B2C sign-in/sign-up
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: `openid profile  ${API_SCOPE}`,
    state: '12345',
    p: 'myGarageSignup' // this should match the user flow name you created in Entra ID
  });
  res.redirect(`${AUTHORITY}/oauth2/v2.0/authorize?${params}`); //get the authorization code
});

app.get('/redirect', async (req, res) => { // once Entra successfully authenticates the user, it will redirect to this endpoint with a code
  showDebugMsg('[/redirect] Received request with query:', req.query);
  showDebugMsg('[/redirect] request body: ', req);
  const code = req.query.code;
  if (!code) return res.redirect('/');
  else {
    // showDebugMsg(`/redirect:exchange auth code for access token. Received authorization code: ${code}`)
  };

  const now = Math.floor(Date.now() / 1000); // Current time in seconds since epoch
  const kid = Buffer.from(GARAGE_CERT_THUMBPRINT, 'hex').toString('base64'); // Convert thumbprint to base64
  const assertion = jwt.sign(
    {
      aud: `${AUTHORITY}/oauth2/v2.0/token`,
      iss: CLIENT_ID,
      sub: CLIENT_ID,
      jti: uuidv4(),
      nbf: now,
      exp: now + 600 // Token valid for 10 minutes
    },
    tokenSigningKey,
    {
      // algorithm: 'RS256'
      header: {
        alg: 'RS256',
        typ: 'JWT',
        kid: kid // optional but preferred if known
      }
    }
  );

  // showDebugMsg('JWT Assertion:', assertion);
  // Exchange code for tokens
  try {
    // USING CLIENT SECRET
    // const tokenRes = await axios.post(
    //   `${AUTHORITY}/oauth2/v2.0/token`,
    //   new URLSearchParams({
    //     grant_type: 'authorization_code',
    //     client_id: CLIENT_ID,
    //     client_secret: CLIENT_SECRET,
    //     code,
    //     redirect_uri: REDIRECT_URI,
    //     scope: `openid profile  ${API_SCOPE}`,
    //   }),
    //   { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    // );

    // USING CLIENT CERTIFICATE
    const tokenEndpoint = `${AUTHORITY}/oauth2/v2.0/token`;
    const tokenRes = await axios.post(tokenEndpoint, new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: `openid profile ${API_SCOPE}`
    }));


    req.session.id_token = tokenRes.data.id_token;
    req.session.access_token = tokenRes.data.access_token;
    showDebugMsg('Token response data:', tokenRes.data);
    showDebugMsg('ID Token:', req.session.id_token);
    showDebugMsg("redirecting to /userProfile.html");
    res.redirect('/public/userProfile.html');
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.status(500).send('Token exchange failed');
  }
});

app.get('/api/garage', (req, res) => {
  if (!req.session.id_token) return res.status(401).json({ error: 'Not authenticated' });

  // Decode ID token to get claims (including custom attributes)
  const base64Payload = req.session.id_token.split('.')[1];
  const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
  showDebugMsg('Decoded ID Token Payload:', payload);
  showDebugMsg(`ID Token.deviceID: ${payload['userDeviceID']}`);
  // showDebugMsg(`accessToken.extension_xxx_deviceID: ${payload[`extension_${EntraExtensionAppID}_deviceID`]}`);

  // Decode Access token
  const base64AccessPayload = req.session.access_token.split('.')[1];
  const accessPayload = JSON.parse(Buffer.from(base64AccessPayload, 'base64').toString());

  // showDebugMsg('Decoded Access Token Payload:', accessPayload); // deviceID is in ID token not in access token
  // showDebugMsg(`accessToken.deviceID: ${accessPayload['extn.deviceID']}`); 
  // showDebugMsg(`accessToken.extension_xxx_deviceID: ${accessPayload[`extension_${EntraExtensionAppID}_deviceID`]}`);

  res.json({
    DisplayName: payload.name,  // this is displayName in Entra
    DeviceID: payload['userDeviceID'], // simply reference with '.deviceID' since we deployed the claim mapping policy
    UPN: payload.preferred_username,
  });
});

app.listen(PORT, HOST, () => {
  showDebugMsg(`Server running on ${protocol}://${HOST}:${PORT}`);
})

// Below 7 lines are for HTTPS server setup, in case you want to run with HTTPS locally
// const options = {
//   cert: fs.readFileSync('./HTTPS_SERVER.crt','utf8'),
//   key: fs.readFileSync('./HTTPS_SERVER.key','utf8'),
//   secureProtocol: "TLSv1_2_method"  // force TLS 1.2
// };
// const httpsServer = https.createServer(options, app);

// httpsServer.listen(443, HOST, () => showDebugMsg('Server running on https://localhost:443'));

