// tokenValidator.js - Shared module for token validation
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const HOST = process.env.WEBSITE_HOSTNAME || 'localhost';
if (HOST === 'localhost') {
    require('dotenv').config({ path: ".env.EntraParameters" });
    require('dotenv').config({ path: ".env.appParameters" });
}
const AUTHORITY = process.env.AUTHORITY;
const CLIENT_ID = process.env.CLIENT_ID;
const EntraExtensionAppID_with_dash_removed = process.env.EntraExtensionAppID?.replace(/-/g, '');

// JWKS client for fetching public keys
const client = jwksClient({
    jwksUri: `${AUTHORITY}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 86400000, // 24 hours
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

// Helper function to get signing key
function getKey(header, callback) {
    client.getSigningKey(header.kid, function (err, key) {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}

/**
 * Helper function to retrieve issuer from Entra External ID OpenID configuration
 * @param {string} tenantId - The tenant ID of the Entra External ID instance
 * @returns {Promise<string>} - The issuer URL
 * @throws {Error} - If unable to retrieve or parse the configuration
 */
async function getIssuerFromEntraExternalID(tenantId) {
    if (!tenantId || typeof tenantId !== "string") {
        throw new Error("tenantId must be a non-empty string");
    }

    const url = `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0/.well-known/openid-configuration`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch OpenID configuration: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.issuer) {
            throw new Error("Issuer field not found in OpenID configuration");
        }

        return data.issuer;
    } catch (err) {
        console.error(`Error retrieving issuer for tenant ${tenantId}:`, err.message);
        throw err;
    }
}


/**
 * Validates an ID token from Entra ID
 * @param {string} token - The ID token to validate
 * @returns {Promise<object>} - Decoded and validated token payload
 * @throws {Error} - If token is invalid, expired, or malformed
 */
async function validateIdToken(token) {
    return new Promise(async (resolve, reject) => {
        if (!token) {
            reject(new Error('No token provided'));
            return;
        }

        // First decode without verification to check structure
        const decoded = jwt.decode(token, { complete: true });

        if (!decoded) {
            reject(new Error('Invalid token format'));
            return;
        }

        // Verify and validate the token
        const TENANT_ID = process.env.TENANT_ID;
        let issuer;
        try {
            issuer = await getIssuerFromEntraExternalID(TENANT_ID);
            console.log(`[tokenValidator] Retrieved issuer: ${issuer}`);
        }   catch (err) {
            return reject(new Error(`Failed to retrieve issuer: ${err.message}`));
        }
        // const issuer = `https://${TENANT_ID}.ciamlogin.com/${TENANT_ID}/v2.0`;
        // Note: The format of issuer may not always be same. For example, older tenants may use TENANT_NAME in place of TENANT_ID.
        // We should fetch https://<tenantId>.ciamlogin.com/<tenantId>/v2.0/.well-known/openid-configuration
        // and use the "issuer" value from there for more robust validation.
        jwt.verify(token, getKey, {
            audience: CLIENT_ID,
            issuer: issuer,
            algorithms: ['RS256']
        }, (err, decodedToken) => {
            if (err) {
                reject(new Error(`Token verification failed: ${err.message}`));
                return;
            }

            // Additional validation checks
            const now = Math.floor(Date.now() / 1000);

            // Check expiration
            if (decodedToken.exp && decodedToken.exp < now) {
                reject(new Error('Token has expired'));
                return;
            }

            // Check not before
            if (decodedToken.nbf && decodedToken.nbf > now) {
                reject(new Error('Token not yet valid'));
                return;
            }

            resolve(decodedToken);
        });
    });
}

/**
 * Extracts deviceID from a validated token
 * @param {object} decodedToken - The decoded token payload
 * @returns {string|null} - The deviceID or null if not found
 */
function getDeviceIdFromToken(decodedToken) {
    // Try multiple possible claim names for deviceID
    return decodedToken.userDeviceID ||
        decodedToken['extn.deviceID'] ||
        (EntraExtensionAppID_with_dash_removed ?
            decodedToken[`extension_${EntraExtensionAppID_with_dash_removed}_deviceID`] :
            null);
}

/**
 * Validates token from session and extracts deviceID
 * @param {object} session - Express session object
 * @returns {Promise<{valid: boolean, deviceID: string|null, error: string|null, decodedToken: object|null}>}
 */
async function validateSessionToken(session) {
    const result = {
        valid: false,
        deviceID: null,
        error: null,
        decodedToken: null,
        userPrincipalName: null,
        displayName: null
    };

    if (!session || !session.id_token) {
        result.error = 'No session or token found';
        return result;
    }

    try {
        const decodedToken = await validateIdToken(session.id_token);
        const deviceID = getDeviceIdFromToken(decodedToken);

        if (!deviceID) {
            result.error = 'No deviceID found in token';
            return result;
        }

        result.valid = true;
        result.deviceID = deviceID;
        result.decodedToken = decodedToken;
        result.userPrincipalName = decodedToken.preferred_username || decodedToken.upn;
        result.displayName = decodedToken.name;

        return result;
    } catch (error) {
        result.error = error.message;
        return result;
    }
}

/**
 * Express middleware to validate token from session
 * Attaches validation result to req.tokenValidation
 */
function requireValidToken(req, res, next) {
    validateSessionToken(req.session)
        .then(validation => {
            if (!validation.valid) {
                return res.status(401).json({
                    error: 'Authentication failed',
                    details: validation.error
                });
            }

            // Attach validation result to request for use in route handlers
            req.tokenValidation = validation;
            next();
        })
        .catch(error => {
            return res.status(500).json({
                error: 'Token validation error',
                details: error.message
            });
        });
}

module.exports = {
    validateIdToken,
    getDeviceIdFromToken,
    validateSessionToken,
    requireValidToken
};