// Multi-step DeviceID validation with attempt tracking
// Note: This requires additional custom attributes in your B2C user flow

const deviceIDMultiStepValidationCAE = async (req, res) => {
  showDebugMsg('[CAE] Multi-step validation request:', JSON.stringify(req.body, null, 2));
  
  try {
    const eventData = req.body;
    
    if (eventData.type !== 'microsoft.graph.authenticationEvent.attributeCollectionSubmit') {
      return res.status(400).json({ 
        error: 'Unsupported event type',
        received: eventData.type
      });
    }

    const userSignUpInfo = eventData.data.userSignUpInfo;
    const submittedDeviceID = userSignUpInfo.attributes[extn_deviceID];
    const confirmationEmail = userSignUpInfo.attributes['extension_confirmationEmail']; // User's input
    const attemptCountStr = userSignUpInfo.attributes['extension_attemptCount'] || '0'; // Hidden field to track attempts
    const validationState = userSignUpInfo.attributes['extension_validationState'] || 'initial'; // Track validation state
    
    const attemptCount = parseInt(attemptCountStr, 10);
    
    showDebugMsg('[CAE] DeviceID:', submittedDeviceID);
    showDebugMsg('[CAE] Confirmation email:', confirmationEmail);
    showDebugMsg('[CAE] Current attempt:', attemptCount);
    showDebugMsg('[CAE] Validation state:', validationState);

    if (!submittedDeviceID) {
      return res.status(400).json({ error: 'DeviceID is required' });
    }

    // Get application token to search existing users
    const appToken = await getUserWriteToken();
    
    // Search for existing users with the same deviceID
    const searchResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/users?$filter=${extn_deviceID} eq '${submittedDeviceID}'&$select=userPrincipalName,displayName,${extn_deviceID}`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const existingUsers = searchResponse.data.value || [];
    showDebugMsg('[CAE] Found existing users:', existingUsers.length);

    // If no existing users, allow signup to continue
    if (existingUsers.length === 0) {
      return res.status(200).json({
        data: {
          "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
          actions: [{
            "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
          }]
        }
      });
    }

    // DeviceID exists - need email confirmation
    const existingUserEmails = existingUsers.map(user => user.userPrincipalName.toLowerCase());
    
    // Initial state - show the prompt for email
    if (validationState === 'initial') {
      return res.status(200).json({
        data: {
          "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
          actions: [{
            "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
            attributeErrors: [{
              attribute: extn_deviceID,
              message: `This Device ID is already registered. Please enter the email address of the existing user to confirm ownership.`
            }],
            // Set hidden fields to track state
            attributeUpdates: [
              {
                attribute: 'extension_validationState',
                value: 'validating'
              },
              {
                attribute: 'extension_attemptCount',
                value: '1'
              }
            ]
          }]
        }
      });
    }

    // In validation state - check the email
    if (validationState === 'validating') {
      if (!confirmationEmail) {
        // No email provided yet
        const newAttemptCount = attemptCount + 1;
        
        if (newAttemptCount > 3) {
          return res.status(200).json({
            data: {
              "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
              actions: [{
                "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
                attributeErrors: [{
                  attribute: extn_deviceID,
                  message: `Maximum attempts exceeded. This Device ID cannot be registered. Please contact support for assistance.`
                }]
              }]
            }
          });
        }

        return res.status(200).json({
          data: {
            "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
            actions: [{
              "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
              attributeErrors: [{
                attribute: 'extension_confirmationEmail',
                message: `Please enter the email address of the existing user. Attempt ${newAttemptCount} of 3.`
              }],
              attributeUpdates: [{
                attribute: 'extension_attemptCount',
                value: newAttemptCount.toString()
              }]
            }]
          }
        });
      }

      // Email provided - validate it
      const providedEmail = confirmationEmail.toLowerCase().trim();
      
      if (existingUserEmails.includes(providedEmail)) {
        // Email matches! Allow signup to continue
        showDebugMsg('[CAE] Email confirmed, allowing signup');
        return res.status(200).json({
          data: {
            "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
            actions: [{
              "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
            }]
          }
        });
      } else {
        // Email doesn't match
        const newAttemptCount = attemptCount + 1;
        
        if (newAttemptCount > 3) {
          return res.status(200).json({
            data: {
              "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
              actions: [{
                "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
                attributeErrors: [{
                  attribute: 'extension_confirmationEmail',
                  message: `Maximum attempts exceeded. The email you provided does not match our records for this Device ID. Registration blocked.`
                }]
              }]
            }
          });
        }

        return res.status(200).json({
          data: {
            "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
            actions: [{
              "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
              attributeErrors: [{
                attribute: 'extension_confirmationEmail',
                message: `Email does not match our records. Please try again. Attempt ${newAttemptCount} of 3.`
              }],
              attributeUpdates: [{
                attribute: 'extension_attemptCount',
                value: newAttemptCount.toString()
              }]
            }]
          }
        });
      }
    }

    // Fallback - shouldn't reach here
    return res.status(200).json({
      data: {
        "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
        actions: [{
          "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
        }]
      }
    });

  } catch (error) {
    console.error('[CAE] Error in multi-step validation:', error.response?.data || error.message);
    
    // On error, allow signup to continue (fail open)
    return res.status(200).json({
      data: {
        "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
        actions: [{
          "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
        }]
      }
    });
  }
};

// Alternative approach using external state storage (Redis/Database)
// This is more reliable but requires additional infrastructure

// In-memory state store (for demonstration - use Redis/DB in production)
const validationState = new Map();

const deviceIDValidationWithExternalState = async (req, res) => {
  try {
    const eventData = req.body;
    const userSignUpInfo = eventData.data.userSignUpInfo;
    const submittedDeviceID = userSignUpInfo.attributes[extn_deviceID];
    const confirmationEmail = userSignUpInfo.attributes['extension_confirmationEmail'];
    const signupEmail = userSignUpInfo.identities[0]?.issuerAssignedId;
    
    // Create a unique key for this signup session (using signup email + deviceID)
    const sessionKey = `${signupEmail}_${submittedDeviceID}`;
    
    // Get or create session state
    let sessionState = validationState.get(sessionKey) || {
      attempts: 0,
      phase: 'initial'
    };
    
    showDebugMsg('[CAE] Session state:', sessionState);

    if (!submittedDeviceID) {
      return res.status(400).json({ error: 'DeviceID is required' });
    }

    // Search for existing users
    const appToken = await getUserWriteToken();
    const searchResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/users?$filter=${extn_deviceID} eq '${submittedDeviceID}'&$select=userPrincipalName,displayName,${extn_deviceID}`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const existingUsers = searchResponse.data.value || [];

    // If no existing users, clean up session and allow signup
    if (existingUsers.length === 0) {
      validationState.delete(sessionKey);
      return res.status(200).json({
        data: {
          "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
          actions: [{
            "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
          }]
        }
      });
    }

    // DeviceID exists - handle validation flow
    const existingUserEmails = existingUsers.map(user => user.userPrincipalName.toLowerCase());
    
    if (sessionState.phase === 'initial') {
      // First encounter - ask for email
      sessionState.phase = 'validating';
      sessionState.attempts = 1;
      validationState.set(sessionKey, sessionState);
      
      return res.status(200).json({
        data: {
          "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
          actions: [{
            "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
            attributeErrors: [{
              attribute: extn_deviceID,
              message: `This Device ID is already registered to another user. Please enter that user's email address to confirm ownership.`
            }]
          }]
        }
      });
    }

    if (sessionState.phase === 'validating') {
      if (!confirmationEmail) {
        sessionState.attempts++;
        validationState.set(sessionKey, sessionState);
        
        if (sessionState.attempts > 3) {
          validationState.delete(sessionKey);
          return res.status(200).json({
            data: {
              "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
              actions: [{
                "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
                attributeErrors: [{
                  attribute: 'extension_confirmationEmail',
                  message: `Maximum attempts exceeded. Registration blocked. Please contact support.`
                }]
              }]
            }
          });
        }

        return res.status(200).json({
          data: {
            "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
            actions: [{
              "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
              attributeErrors: [{
                attribute: 'extension_confirmationEmail',
                message: `Please enter the email address. Attempt ${sessionState.attempts} of 3.`
              }]
            }]
          }
        });
      }

      // Validate email
      const providedEmail = confirmationEmail.toLowerCase().trim();
      
      if (existingUserEmails.includes(providedEmail)) {
        // Success!
        validationState.delete(sessionKey);
        return res.status(200).json({
          data: {
            "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
            actions: [{
              "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
            }]
          }
        });
      } else {
        // Email doesn't match
        sessionState.attempts++;
        
        if (sessionState.attempts > 3) {
          validationState.delete(sessionKey);
          return res.status(200).json({
            data: {
              "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
              actions: [{
                "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
                attributeErrors: [{
                  attribute: 'extension_confirmationEmail',
                  message: `Maximum attempts exceeded. The email does not match our records.`
                }]
              }]
            }
          });
        }

        validationState.set(sessionKey, sessionState);
        return res.status(200).json({
          data: {
            "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
            actions: [{
              "@odata.type": "microsoft.graph.attributeCollectionSubmit.showValidationError",
              attributeErrors: [{
                attribute: 'extension_confirmationEmail',
                message: `Email does not match. Try again. Attempt ${sessionState.attempts} of 3.`
              }]
            }]
          }
        });
      }
    }

  } catch (error) {
    console.error('[CAE] Error in validation with external state:', error.response?.data || error.message);
    return res.status(200).json({
      data: {
        "@odata.type": "microsoft.graph.onAttributeCollectionSubmitResponseData",
        actions: [{
          "@odata.type": "microsoft.graph.attributeCollectionSubmit.continueWithDefaultBehavior"
        }]
      }
    });
  }
};

// Register the endpoints
app.post('/api/cae/deviceid-multistep', validateEntraRequest, deviceIDMultiStepValidationCAE);
app.post('/api/cae/deviceid-external-state', validateEntraRequest, deviceIDValidationWithExternalState);