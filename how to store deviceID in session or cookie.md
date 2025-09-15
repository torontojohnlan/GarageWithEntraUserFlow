Option A: Store deviceID in session
This is clean, secure, and does not expose data to the client.

ts
Copy
Edit
// After login & token processing
app.post("/auth/callback", async (req, res) => {
  const userId = extractUserIdFromToken(req); // e.g., sub or oid
  const deviceID = await getDeviceIDFromGraphOrDB(userId);

  // Store in session
  req.session.deviceID = deviceID;

  res.redirect("/dashboard");
});

// Later usage in any route
app.get("/dashboard", (req, res) => {
  const deviceID = req.session.deviceID;
  // Use deviceID in downstream processing
});
✅ Pros:

Keeps deviceID off the token.

Secure (stored server-side, not exposed to client).

Available across requests.

🛑 Cons:

Requires sticky sessions (if not using a shared session store like Redis).

Option B: Store deviceID in signed, HttpOnly cookie
If you're not using server-side session, you can use a signed cookie:

ts
Copy
Edit
// Set after login
res.cookie('deviceID', deviceID, {
  httpOnly: true,
  signed: true,
  sameSite: 'lax',
  secure: true,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
});
Then later:

ts
Copy
Edit
const deviceID = req.signedCookies.deviceID;
✅ Pros:

Works even in stateless serverless environments.

Slightly faster than session.

🛑 Cons:

Cookie size limit (~4KB total).

More exposed to client than server-side session.