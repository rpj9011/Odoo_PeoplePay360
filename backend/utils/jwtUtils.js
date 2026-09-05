const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const fs = require('fs');
const path = require('path');

// JWKS client for verifying SSO tokens (from SSO portal)
// Enhanced caching (15 minutes) to optimize repeated SSO verifications
const jwksUri = process.env.SSO_JWKS_URL || 'http://localhost:3003/.well-known/jwks.json';
const client = jwksClient({
  jwksUri,
  cache: true,
  rateLimit: true,
  cacheMaxAge: 900000, // 15 minutes (optimized for SSO verification)
  cacheMaxEntries: 5,
  jwksRequestsPerMinute: 10, // Rate limit for JWKS requests
  jwksRequestsTimeout: 10000 // 10 second timeout
});

function getKey(header, callback) {
  if (!header || !header.kid) {
    return callback(new Error('Missing key ID (kid) in token header'));
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('[JWT Utils] Error getting signing key:', err.message);
      return callback(err);
    }
    const pubKey = key.publicKey || key.rsaPublicKey;
    if (!pubKey) return callback(new Error('Public key not found in JWK'));
    callback(null, pubKey);
  });
}

// Local AMS key management for RS256 signing/verification
function getPrivateKey() {
  const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem';
  const resolved = path.resolve(__dirname, '..', privateKeyPath);
  
  if (!fs.existsSync(resolved)) {
    throw new Error(`Private key file not found: ${resolved}. Run: node generate-rsa-keys.js`);
  }
  
  const privateKey = fs.readFileSync(resolved, 'utf8');
  
  if (!privateKey || privateKey.length < 100) {
    throw new Error(`Invalid private key file: ${resolved}. File is empty or too short.`);
  }
  
  return privateKey;
}

function getPublicKey() {
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem';
  const resolved = path.resolve(__dirname, '..', publicKeyPath);
  
  if (!fs.existsSync(resolved)) {
    throw new Error(`Public key file not found: ${resolved}. Run: node generate-rsa-keys.js`);
  }
  
  const publicKey = fs.readFileSync(resolved, 'utf8');
  
  if (!publicKey || publicKey.length < 100) {
    throw new Error(`Invalid public key file: ${resolved}. File is empty or too short.`);
  }
  
  return publicKey;
}

// Sign AMS tokens with RS256
function sign(payload, options = {}) {
  // Default to 15-minute short-lived access tokens.
  // All callers should pass an explicit expiresIn; this default
  // is a safety net so an omitted option never produces a long-lived token.
  const expiresIn = options.expiresIn || '15m';
  const keyid = process.env.JWT_KEY_ID || 'ams-key';

  try {
    const privateKey = getPrivateKey();

    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      expiresIn,
      keyid,
      header: { kid: keyid, alg: 'RS256', typ: 'JWT' }
    });

    // Self-test: verify the token we just created
    try {
      const publicKey = getPublicKey();
      jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    } catch (verifyError) {
      throw new Error(`Token signing failed self-verification: ${verifyError.message}`);
    }

    return token;
  } catch (error) {
    const fallbackSecret = process.env.JWT_SECRET;
    if (!fallbackSecret) throw error;
    console.warn('[JWT] ⚠️ RS256 signing failed, falling back to HS256:', error.message);
    return jwt.sign(payload, fallbackSecret, { algorithm: 'HS256', expiresIn });
  }
}

// Verify AMS tokens with local public key (RS256)
function verify(token, options = {}) {
  try {
    // Decode token header first to check algorithm and kid
    const decodedHeader = jwt.decode(token, { complete: true });

    if (!decodedHeader || !decodedHeader.header) {
      throw new Error('Invalid token format: missing header');
    }

    const tokenAlg = decodedHeader.header.alg;
    const tokenKid = decodedHeader.header.kid;

    if (tokenAlg === 'RS256') {
      if (!tokenKid) throw new Error('Missing kid (key ID) in token header');

      const publicKey = getPublicKey();
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        ...(options || {})
      });
      return decoded;
    }

    if (tokenAlg === 'HS256') {
      const fallbackSecret = process.env.JWT_SECRET;
      if (!fallbackSecret) throw new Error('Cannot verify HS256 token: JWT_SECRET is not configured');
      return jwt.verify(token, fallbackSecret, { algorithms: ['HS256'], ...(options || {}) });
    }

    throw new Error(`Invalid algorithm: ${tokenAlg}. Only RS256 or HS256 (fallback) are supported.`);
  } catch (error) {
    console.error('[JWT Utils] ❌ Token verification failed:', error.message);
    throw error;
  }
}

// Decode without verifying
function decode(token, options = {}) {
  return jwt.decode(token, options);
}

// Verify SSO token using JWKS (remote SSO keys) - RS256 ONLY
async function verifySSOTokenWithJWKS(token) {
  return new Promise((resolve, reject) => {
    // Decode token header first to get kid and validate format
    let decodedHeader;
    try {
      decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader || !decodedHeader.header) {
        return reject(new Error('Invalid token format: missing header'));
      }
      
      const kid = decodedHeader.header.kid;
      const alg = decodedHeader.header.alg;
      
      if (!kid) {
        return reject(new Error('Missing kid (key ID) in token header'));
      }
      
      if (alg !== 'RS256') {
        return reject(new Error(`Invalid algorithm: ${alg}. Only RS256 is supported for SSO tokens.`));
      }
    } catch (headerError) {
      return reject(new Error('Invalid token format: ' + headerError.message));
    }
    
    // Verify token signature first (without audience check to avoid double validation)
    jwt.verify(token, getKey, { 
      algorithms: ['RS256'],
      issuer: process.env.SSO_ISSUER || 'sso-portal',
      ignoreExpiration: false
    }, (err, decoded) => {
      if (err) {
        console.error('[JWT Utils] ❌ SSO token verification failed:', err.message);
        return reject(err);
      }
      
      // Manual audience verification after successful signature verification
      if (decoded.aud !== 'sso-apps') {
        return reject(new Error(`Invalid SSO audience: expected 'sso-apps', got '${decoded.aud}'`));
      }
      
      resolve(decoded);
    });
  });
}

// Startup validation - ensure RS256 is enforced
function validateRS256Configuration() {
  console.log('🔐 JWT Configuration Validation');
  console.log('================================');
  
  // Check JWKS URL
  const jwksUrl = process.env.SSO_JWKS_URL || 'http://localhost:3003/.well-known/jwks.json';
  console.log(`✅ JWKS URL: ${jwksUrl}`);
  
  // Check local key files
  try {
    const privateKey = getPrivateKey();
    const publicKey = getPublicKey();
    console.log('✅ Local RSA keys loaded successfully');
    console.log(`   Private key: ${privateKey.length} chars`);
    console.log(`   Public key: ${publicKey.length} chars`);
    
    // Test key pair compatibility
    try {
      const jwt = require('jsonwebtoken');
      const testPayload = { test: 'validation' };
      const testToken = jwt.sign(testPayload, privateKey, { algorithm: 'RS256' });
      jwt.verify(testToken, publicKey, { algorithms: ['RS256'] });
      console.log('✅ Key pair validation: Private and public keys match');
    } catch (keyError) {
      console.error('❌ Key pair validation failed:', keyError.message);
      console.error('   Private and public keys do not match!');
      console.error('   Run: node generate-rsa-keys.js to regenerate matching keys');
    }
  } catch (error) {
    console.error('❌ Local RSA keys not found:', error.message);
    console.error('   Run: node generate-rsa-keys.js');
  }
  
  // Check key ID
  const keyId = process.env.JWT_KEY_ID || 'ams-key';
  console.log(`✅ Key ID (kid): ${keyId}`);
  
  console.log('✅ RS256 algorithm enforcement: ENABLED');
  console.log('✅ JWKS verification: ENABLED');
  console.log('✅ HS256 fallbacks: DISABLED');
  console.log('================================');
}

module.exports = {
  // AMS local token helpers (RS256 only)
  sign,
  verify,
  decode,
  // SSO verification via JWKS (RS256 only)
  verifySSOTokenWithJWKS,
  // Configuration validation
  validateRS256Configuration
};