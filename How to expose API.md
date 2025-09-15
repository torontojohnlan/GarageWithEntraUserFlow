
torontojohnlan: what configuration changes I have to make on Entra portal to expose `api://${CLIENT_ID}/deviceID`?

GitHub Copilot: To expose the scope `api://${CLIENT_ID}/deviceID` in Entra (Azure AD/Entra External ID), you need to configure your App Registration as an API and define a custom scope. Here are the steps:

---

### 1. Register (or select) your application

- Go to **Microsoft Entra admin center** > **Applications** > **App registrations**.
- Select your app registration (the one with `CLIENT_ID`).

---

### 2. Expose an API

- In the left menu, click **Expose an API**.
- If you haven’t set an Application ID URI, click **Set** and enter:  
  ```
  api://<your-client-id>
  ```
  (Replace `<your-client-id>` with the actual Application (client) ID.)

---

### 3. Add a scope

- Under **Scopes defined by this API**, click **Add a scope**.
- For **Scope name**, enter:  
  ```
  deviceID
  ```
- Fill in the required fields (admin consent display name, description, etc.).
- Set **Who can consent?** as appropriate (usually "Admins and users").
- Click **Add scope**.

---

### 4. (Optional) Grant permissions to other apps

If you have a separate client app, add this scope as an **API permission** to that app.

---

### 5. Update your code

Your scope in code should match:
```
api://<your-client-id>/deviceID
```

---

**Summary:**  
- Set Application ID URI to `api://<client-id>`
- Add a scope named `deviceID`
- Use `api://<client-id>/deviceID` in your code

Let me know if you need step-by-step screenshots or further details!