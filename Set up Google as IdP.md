You're right - let me revise for **Entra External Tenant** (the newer platform, not legacy B2C):

## Steps to Configure Google as IdP in Entra External Tenant

### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Configure OAuth consent screen if needed:
   - User Type: **External**
   - Add app name and contact info
6. Application type: **Web application**
7. Add **Authorized redirect URI**:
   ```
   https://<your-tenant-name>.ciamlogin.com/<your-tenant-name>.onmicrosoft.com/federation/oauth2
   ```
   Replace `<your-tenant-name>` with your External tenant name
8. Save the **Client ID** and **Client Secret**

### Step 2: Add Google IdP in Entra External Tenant

1. In Azure Portal, go to your **Microsoft Entra External ID** tenant
2. Navigate to **Identity providers** (under External Identities)
3. Click **+ New identity provider** → **Google**
4. Enter:
   - **Client ID**: From Google Console
   - **Client secret**: From Google Console
5. Click **Save**

### Step 3: Enable Google in Your App Registration

1. Go to **App registrations** → Select your app
2. Navigate to **Authentication**
3. Under **Federated credentials** or **Identity providers**, ensure Google is listed/enabled
4. Or configure in your **User flow** if you're using self-service sign-up

### Step 4: Configure Self-Service Sign-Up User Flow (if needed)

1. Go to **Identity** → **External Identities** → **User flows**
2. Create or edit your user flow
3. Under **Identity providers**, select **Google**
4. Configure attribute collection (note: `deviceID` won't come from Google)
5. Save

### Step 5: Update Login URL (if needed)

Your existing code should work, but the authority/endpoints might be slightly different:

```javascript
// Verify your AUTHORITY is correct for External tenant
const AUTHORITY = `https://<tenant-name>.ciamlogin.com/<tenant-name>.onmicrosoft.com/<user-flow-name>`;
```

### Step 6: Handle Social Login Users Without DeviceID

Google users won't have `deviceID` initially. You need to handle this:

```javascript
app.get('/api/retrieveUserProfile', async (req, res) => {
  if (!req.session.id_token) return res.status(401).json({ error: 'Not authenticated' });

  const base64Payload = req.session.id_token.split('.')[1];
  const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
  
  // Check identity provider
  const idp = payload.idp; // Will be 'google.com' for Google users
  
  if (idp === 'google.com' && !payload['userDeviceID']) {
    // Redirect to deviceID collection page
    return res.json({
      DisplayName: payload.name,
      DeviceID: null,
      UPN: payload.preferred_username,
      needsDeviceID: true
    });
  }
  
  res.json({
    DisplayName: payload.name,
    DeviceID: payload['userDeviceID'],
    UPN: payload.preferred_username,
  });
});
```

### Key Differences from B2C:

- Uses `.ciamlogin.com` instead of `.b2clogin.com`
- Simpler configuration (less custom policies needed)
- Better integration with Entra ID features
- Social users are "members" not "guests" by default

The main challenge is that Google-authenticated users won't have your custom `deviceID` attribute until you collect it post-login.