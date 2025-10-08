Certainly! Here’s how you can expose an API (for example, `/api/device`) that is protected by your Entra External ID (CIAM) access token and checks for the `deviceID` scope. I’ll also show you how to integrate it into your existing Express project.

---

## 1. **Sample Protected API Endpoint**

This endpoint will:
- Validate the access token.
- Check that the `scp` claim contains `deviceID`.
- Return the user's `deviceID` and other claims.

````javascript
// ...existing code...

const jwt = require('jsonwebtoken'); // Add at the top of your file

// Middleware to validate access token and scope
function requireDeviceIDScope(req, res, next) {
  const token = req.session.access_token;
  if (!token) return res.status(401).json({ error: 'No access token' });

  try {
    // Decode token without verifying signature (for demo only; in production, verify signature!)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (!payload.scp || !payload.scp.includes('deviceID')) {
      return res.status(403).json({ error: 'Insufficient scope' });
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(400).json({ error: 'Invalid token' });
  }
}

// Protected API endpoint
app.get('/api/device', requireDeviceIDScope, (req, res) => {
  // deviceID may be under 'deviceID' or 'extension_{AppId}_deviceID'
  const deviceID = req.user.deviceID || req.user[`extension_${EntraExtensionAppID}_deviceID`];
  res.json({
    deviceID,
    allClaims: req.user
  });
});

// ...existing code...
````

---

## 2. **How to Integrate**

- Place the middleware and endpoint code in your existing server.js file (as shown above).
- Make sure you have `jsonwebtoken` installed if you want to do signature verification (for demo, this code just decodes).
    ```sh
    npm install jsonwebtoken
    ```
- Call `/api/device` from your frontend after login to get the deviceID and all claims.

---

## 3. **How to Call the API from the Frontend**

Add a fetch call in your `profile.html` or another page:

````javascript
fetch('/api/device')
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      // handle error
    } else {
      // display deviceID and claims
      console.log(data.deviceID, data.allClaims);
    }
  });
````

---

## 4. **Summary**

- The `/api/device` endpoint is protected by checking the `deviceID` scope in the access token.
- The endpoint returns the `deviceID` and all claims for the authenticated user.
- Integrate by adding the code to your existing server.js and calling the endpoint from your frontend.

Let me know if you want a more advanced example (with signature verification) or further integration tips!