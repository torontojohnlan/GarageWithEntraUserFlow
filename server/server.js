console.log('Server starting...');

const express = require('express');
const session = require('express-session');
const axios = require('axios');
const app = express();
// const https = require('https');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

let localMode, PORT, protocol;
let serverSideDebugMode = false;
let tokenSigningKey;

const HOST = process.env.WEBSITE_HOSTNAME || 'localhost';
if (HOST === 'localhost') {
  require('dotenv').config({ path: ".env.EntraParameters" });
  require('dotenv').config({ path: ".env.appParameters" });
  localMode = true;
  protocol = 'http';
  PORT = 80;

  const fs = require('fs');
  tokenSigningKey = fs.readFileSync('./server/.env.tokenSigningPrivateKey.pem', 'utf8'); // for token signing

  console.log('[Local mode is ON]. Using .env.appParameters and .env.EntraParameters');
} else {
  localMode = false;
  protocol = 'https';
  PORT = process.env.PORT;  //Azure app service will populate this var and the app must listen on this port
  serverSideDebugMode = process.env.DEBUG;
  tokenSigningKey = process.env.TOKEN_SIGNING_KEY.replace(/\\n/g, '\n'); // for token signing

  console.log('[Local mode is OFF]. Using environment variables directly.');
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

function showDebugMsg(...args) {
  if (process.env.DEBUG === 'true' || localMode)
    console.log(...args);
}

showDebugMsg(`[Main]Using AUTHORITY: ${AUTHORITY}`);
showDebugMsg(`[Main]Using REDIRECT_URI: ${REDIRECT_URI}`);
showDebugMsg(`[Main]Using API_SCOPE: ${API_SCOPE}`);


// session middleware must be registered before the express-ws middleware for websokcet server to see the session
// middleware register order matters.

app.use(session({
  secret: 'your_secret_v3ry_$7r0ng_secret', // Use a strong secret for session encryption
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,           // Prevents JavaScript access to cookie
    secure: !localMode,       // Only send cookie over HTTPS in production
    sameSite: 'lax',          // CSRF protection
    maxAge: 1 * 60 * 60 * 1000  // 1 hours
  }
}));

const expressWs = require('express-ws');
expressWs(app);

console.log('Initializing websocket server.');
const makeWss = require('./ws.js');
const wsHandler = makeWss();
app.ws('/ws', wsHandler);
console.log('Websocket server initialized.');


app.use('/public', express.static('public')); //apps route is the client interface portion of this app

app.use(express.json());
showDebugMsg(`[Main]setting up [public] static path`);
app.use(express.static('public'));
showDebugMsg('[Main]Successfully finished setting up main web server');

// insert CAE codes here (temporary saved in CAE.js.nouse)

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
    scope: `openid profile User.ReadWrite ${API_SCOPE}`,
    state: '12345',
    // p: 'myGarageSignup' // this should match the user flow name you created in Entra ID. In External tenant, this parameter is ignored(?)
  });
  res.redirect(`${AUTHORITY}/oauth2/v2.0/authorize?${params}`); //get the authorization code
});

app.get('/redirect', async (req, res) => { // once Entra successfully authenticates the user, it will redirect to this endpoint with a code
  // showDebugMsg('[Main][/redirect] Received request with query:', req.query);
  // showDebugMsg('[Main][/redirect] request body: ', req);
  const code = req.query.code;
  if (!code) return res.redirect('/?error=auth_failed&message=Authentication failed. Please try again.');
  else {
    // showDebugMsg(`[Main]/redirect:exchange auth code for access token. Received authorization code: ${code}`)
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

  // showDebugMsg('[Main]JWT Assertion:', assertion);
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

    // In this redirect route, we immedicately request an access token. But it doesn't have to happen here. We can simply return
    // and request access token where we need one

    // USING CLIENT CERTIFICATE
    const tokenEndpoint = `${AUTHORITY}/oauth2/v2.0/token`;
    const tokenRes = await axios.post(tokenEndpoint, new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: `openid profile User.ReadWrite ${API_SCOPE}`
    }));


    req.session.id_token = tokenRes.data.id_token;           // this is why we need express-session. We leverage session to store the id_token and access_token
    req.session.access_token = tokenRes.data.access_token;
    showDebugMsg('[Main][/redirect] access token:', req.session.access_token);
    showDebugMsg('[Main][/redirect] ID Token:', req.session.id_token);
    showDebugMsg('[Main][/redirect] SessionID:', req.sessionID);
    req.session.save((err) => {
      if (err) {
        console.error('[Main][/redirect] Error saving session:', err);
        return res.status(500).send('[Main][/redirect] Session save failed');
      }
      showDebugMsg("[/redirect] redirecting to /garage.html");
      res.redirect(`/public/garage.html?debug=${serverSideDebugMode}`);  // if the server is set to debugMode, we want the client to be in debugmode as well
    }); // Ensure session is saved before redirecting
  } catch (err) {
    console.error('[/redirect] Token exchange error:', err.response?.data || err.message);
    res.status(500).send('Token exchange failed');
  }
});

app.get('/api/session-info', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    hasTokens: {
      id_token: !!req.session.id_token,
      access_token: !!req.session.access_token
    }
  });
});

//region extracts user profile from ID token
// app.get('/api/retrieveUserProfile', (req, res) => {
//   if (!req.session.id_token) return res.status(401).json({ error: 'Not authenticated' });

//   // Decode ID token to get claims (including custom attributes)
//   const base64Payload = req.session.id_token.split('.')[1];
//   const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
//   showDebugMsg('[Main]Decoded ID Token Payload:', payload);
//   showDebugMsg(`[Main]ID Token.deviceID: ${payload['userDeviceID']}`);
//   // showDebugMsg(`[Main]accessToken.extension_xxx_deviceID: ${payload[`extension_${EntraExtensionAppID}_deviceID`]}`);

//   // Decode Access token
//   const base64AccessPayload = req.session.access_token.split('.')[1];
//   const accessPayload = JSON.parse(Buffer.from(base64AccessPayload, 'base64').toString());

//   showDebugMsg('[Main]Decoded Access Token Payload:', accessPayload); // deviceID is in ID token not in access token
//   // showDebugMsg(`[Main]accessToken.deviceID: ${accessPayload['extn.deviceID']}`); 
//   // showDebugMsg(`[Main]accessToken.extension_xxx_deviceID: ${accessPayload[`extension_${EntraExtensionAppID}_deviceID`]}`);

//   res.json({
//     DisplayName: payload.name,  // this is displayName in Entra
//     DeviceID: payload['userDeviceID'], // simply reference with '.deviceID' since we deployed the claim mapping policy
//     UPN: payload.preferred_username,
//   });
// });
//endregion extracts user profile from ID token

//region extracts user profile from Microsoft Graph
app.get('/api/retrieveUserProfile', async (req, res) => {
  showDebugMsg('[Main][/api/retrieveUserProfile] ID token in req body:', req.session.id_token);
  showDebugMsg('[Main][/api/retrieveUserProfile] access token in req body:', req.session.access_token);
  showDebugMsg('[Main][/api/retrieveUserProfile] sessionID:', req.session.sessionID);
  if (!req.session.access_token) return res.status(401).json({ error: 'Access token null' });

  try {
    // Get fresh profile data from Microsoft Graph instead of cached ID token
    const profileResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName,${extn_deviceID}`,
      {
        headers: {
          Authorization: `Bearer ${req.session.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const profile = profileResponse.data;

    res.json({
      DisplayName: profile.displayName,
      DeviceID: profile[extn_deviceID],
      UPN: profile.userPrincipalName,
    });

  } catch (error) {
    showDebugMsg('%c[api/f=retrieveUserProfile] Error fetching  profile:', 'color:red', error.response?.data || error.message);
    // Fallback to cached ID token if Graph call fails
    const base64Payload = req.session.id_token.split('.')[1];
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());

    res.json({
      DisplayName: payload.name,
      DeviceID: payload['userDeviceID'],
      UPN: payload.preferred_username,
    });
  }
});
//endregion extracts user profile from Microsoft Graph

// helper function for profile editing
// this helper gets application token using client credential flow (for api that doesn't or can't use user's token)
async function getUserWriteToken() {
  const now = Math.floor(Date.now() / 1000);
  const kid = Buffer.from(GARAGE_CERT_THUMBPRINT, 'hex').toString('base64');

  const assertion = jwt.sign(
    {
      aud: `${AUTHORITY}/oauth2/v2.0/token`,
      iss: CLIENT_ID,
      sub: CLIENT_ID,
      jti: uuidv4(),
      nbf: now,
      exp: now + 600
    },
    tokenSigningKey,
    { header: { alg: 'RS256', typ: 'JWT', kid: kid } }
  );

  const tokenResponse = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: 'https://graph.microsoft.com/.default'
    })
  );

  showDebugMsg('[Main][getUserReadWriteToken][helper function] Token return:', tokenResponse.data.access_token);
  return tokenResponse.data.access_token;
}

// API endpoint to change user profile
app.post('/api/editProfile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { displayName, deviceID, upn } = req.body;

  // Validate input
  if (!deviceID || !upn) {
    return res.status(400).json({ error: 'Device ID, and UPN are required' });
  }

  showDebugMsg('[Main][/api/editProfile] Updating profile for UPN:', upn);
  showDebugMsg('[Main][/api/editProfile] New displayName:', displayName);
  showDebugMsg('[Main][/api/editProfile] New deviceID:', deviceID);

  try {
    //region get userID by upn. 
    // First, get the user's object ID using their UPN

    let userSearchResponse;
    try {
      userSearchResponse = await axios.get(
        // `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${upn}'&$select=id`,
        `https://graph.microsoft.com/v1.0/me?$select=id`,
        {
          headers: {
            Authorization: `Bearer ${req.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      showDebugMsg('[Main][/api/editProfile][read user] User id found', userSearchResponse.data.id);
    } catch {
      console.error('[/api/editProfile][read user] Error reading user profile:', error.response?.data || error.message);
      throw error;
    }

    // this if statement is neccessary only when we use the user search API
    // if (!userSearchResponse.data.value || userSearchResponse.data.value.length === 0) {
    //   return res.status(404).json({ error: 'User not found' });
    // }

    const userId = userSearchResponse.data.id;
    showDebugMsg('[Main][/api/editProfile] Found user ID:', userId);
    //endregion get userID by upn. 

    // Prepare the update payload
    const updatePayload = {
      displayName: displayName,
      [`${extn_deviceID}`]: deviceID
    };
    showDebugMsg('[Main][/api/editProfile] verifying extn_deviceID:', extn_deviceID);
    showDebugMsg('[Main][/api/editProfile] verifying deviceID:', deviceID);
    showDebugMsg('[Main][/api/editProfile] verifying displayName:', displayName);
    showDebugMsg('[Main][/api/editProfile] Update payload:', updatePayload);

    // Update the user's profile using Microsoft Graph API
    const appToken = await getUserWriteToken(); // get app token with User.ReadWrite.All permission
    const updateResponse = await axios.patch(
      // `https://graph.microsoft.com/v1.0/me`,  // this line would have benn used if external tenant allows guest to update their own object
      `https://graph.microsoft.com/v1.0/users/${userId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    showDebugMsg('[Main][/api/editProfile] Profile updated successfully for user:', upn);

    // Update the session tokens if needed (optional - tokens will be refreshed on next login)
    // Note: The changes won't be reflected in current session tokens until next login

    res.json({
      success: true,
      message: 'Profile updated successfully',
      note: 'Changes will be reflected in your next login session'
    });

  } catch (error) {
    console.error('[/api/editProfile] Error updating user profile:', error.response?.data || error.message);

    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'Insufficient permissions to update user profile. Please ensure your app has User.ReadWrite.All permissions.'
      });
    } else if (error.response?.status === 404) {
      return res.status(404).json({ error: 'User not found' });
    } else {
      return res.status(500).json({
        error: 'Failed to update user profile',
        details: error.response?.data?.error?.message || error.message
      });
    }
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  showDebugMsg('[Main][/api/logout] Logout requested');

  // Get the post logout redirect URI
  const postLogoutRedirectUri = `${protocol}://${URI}/public/logout.html`;

  // Clear the session
  req.session.destroy((err) => {
    if (err) {
      console.error('[/api/logout] Error destroying session:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }

    // Construct the Entra logout URL
    // This will sign the user out of Entra and redirect to logout.html
    const logoutUrl = `${AUTHORITY}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;

    showDebugMsg('[Main][/api/logout] Session destroyed, redirecting to:', logoutUrl);

    res.json({
      success: true,
      logoutUrl: logoutUrl
    });
  });
});


showDebugMsg('[Main]Finally start the web server')
app.listen(PORT, () => {  // Must not use HOST param here as this should be left to Azure to decide.
  showDebugMsg(`[Main]Server running on ${protocol}://${HOST}:${PORT}`);
})

// Below 7 lines are for HTTPS server setup, in case you want to run with HTTPS locally
// const options = {
//   cert: fs.readFileSync('./.env.HTTPS_SERVER.crt','utf8'),
//   key: fs.readFileSync('./.env.HTTPS_SERVER.key','utf8'),
//   secureProtocol: "TLSv1_2_method"  // force TLS 1.2
// };
// const httpsServer = https.createServer(options, app);

// httpsServer.listen(443, () => showDebugMsg('[Main]Server running on https://localhost:443'));

