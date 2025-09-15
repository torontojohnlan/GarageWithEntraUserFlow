const express = require('express');
const session = require('express-session');
const axios = require('axios');
const app = express();
const https = require('https');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const privatekey = fs.readFileSync('./privatekey.txt','utf8'); // for token signing
// console.log('Loading private key from garage.pem:', privatekey ? privatekey : 'Failed to load key');
const { v4: uuidv4 } = require('uuid');

const HOST = process.env.HOST || 'localhost';

if (HOST === 'localhost') {
  // require('dotenv').config({ path: '.env.appParameters' });
  require('dotenv').config({ path: ".env.EntraParameters" });
  require('dotenv').config({ path: ".env.appParameters" });
  console.log('Debug mode is ON. Using .env.appParameters and .env.EntraParameters');
} else {
  console.log('Debug mode is OFF. Using environment variables directly.');
}
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID; // Use your tenant ID or set it in .env
const TENANT_NAME = process.env.TENANT_NAME; // Use your tenant name or set it in .env
const REDIRECT_URI = process.env.REDIRECT_URI;
const AUTHORITY = process.env.AUTHORITY;
const EntraExtensionAppID = process.env.EntraExtensionAppID;
const API_SCOPE = `api://localhost/${CLIENT_ID}/deviceID.clone`; // prerequisite: you need to create a scope in Entra ID for your API, e.g., api://<your-client-id>/deviceID
const GARAGE_CERT_THUMBPRINT = process.env.GARAGE_CERT_THUMBPRINT; // Thumbprint of the certificate used to sign the JWT token

console.log(`Using AUTHORITY: ${AUTHORITY}`);

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
const validateEntraRequest = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Invalid authorization' });
    }
    // In production: Validate JWT against Entra's JWKS endpoint
    next();
};

// Core handler for the authentication extension
const handleAuthExtension = async (req, res) => {
    try {
        const eventData = req.body;

        if (eventData.eventType === 'AttributeCollectionSubmit') {
            const user = eventData.data.authenticationContext.user;
            console.log('[Auth Extension Handler][user info from req body]:', user);
            const userId = user.id;

            // Access the custom attribute collected during signup
            const deviceID = user[extn.deviceID];  // Not sure if the user structure contains this info, or under which field name. 

            if (!deviceID) { // here we should clone value
                return res.status(400).json({ error: `Custom signup value not found in user attributes` });
            }

            // Copy the value to a custom claim in the token
            const customClaims = {
                deviceID: deviceID
            };

            // Store in session for app-specific use
            req.session.userId = userId;
            req.session.deviceID = deviceID;

            // Response to Entra ID
            const response = {
                data: {
                    actions: [
                        {
                            '@odata.type': '#microsoft.graph.onTokenIssuanceStartResponseData',
                            claims: customClaims
                        }
                    ]
                }
            };

            return res.status(200).json(response);
        } else {
            return res.status(400).json({ error: 'Unsupported event type' });
        }
    } catch (error) {
        console.error('Error processing auth extension:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Custom Authentication Extension Endpoint (for Entra)
app.post('/api/authExtension', validateEntraRequest, handleAuthExtension);   // In Entra, auth enxtension endpoint should be https://<your-domain-or-ip>/api/authExtension
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
  const code = req.query.code;
  if (!code) return res.redirect('/');
  else {
    console.log(`/redirect:exchange auth code for access token. Received authorization code: ${code}`)
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
    privatekey,
    {
      // algorithm: 'RS256'
      header: {
        alg: 'RS256',
        typ: 'JWT',
        kid: kid // optional but preferred if known
      }
    }
  );

  // console.log('JWT Assertion:', assertion);
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
    console.log('Token response data:', tokenRes.data);
    console.log('ID Token:', req.session.id_token);
    console.log("redirecting to /profile.html");
    res.redirect('/profile.html');
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.status(500).send('Token exchange failed');
  }
});

app.get('/api/profile', (req, res) => {
  if (!req.session.id_token) return res.status(401).json({ error: 'Not authenticated' });

  // Decode JWT to get claims (including custom attributes)
  const base64Payload = req.session.id_token.split('.')[1];
  const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
  console.log('Decoded ID Token Payload:', payload);
  console.log(`accessToken.deviceID: ${payload['extn.deviceID']}`);
  // console.log(`accessToken.extension_xxx_deviceID: ${payload[`extension_${EntraExtensionAppID}_deviceID`]}`);

  // Decode Access token
  const base64AccessPayload = req.session.access_token.split('.')[1];
  const accessPayload = JSON.parse(Buffer.from(base64AccessPayload, 'base64').toString());

  console.log('Decoded Access Token Payload:', accessPayload);
  console.log(`accessToken.deviceID: ${accessPayload['extn.deviceID']}`);
  // console.log(`accessToken.extension_xxx_deviceID: ${accessPayload[`extension_${EntraExtensionAppID}_deviceID`]}`);

  res.json({
    name: payload.name,
    dummyField: 'This is a dummy field to test the API',
    // deviceID1: payload[`extension_${EntraExtensionAppID}_deviceID`], // or 'deviceID' if mapped
    deviceID2: payload['extn.deviceID'], // simply reference with '.deviceID' since we deployed the claim mapping policy

  });
});

const options = {
  cert: fs.readFileSync('./HTTPS_SERVER.crt','utf8'),
  key: fs.readFileSync('./HTTPS_SERVER.key','utf8'),
  secureProtocol: "TLSv1_2_method"  // force TLS 1.2
};
const httpsServer = https.createServer(options, app);

httpsServer.listen(443, HOST, () => console.log('Server running on https://localhost:443'));