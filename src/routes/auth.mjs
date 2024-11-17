//
// Routes used by login and account screen
// ---------------------------------------------
// Ben C, Nov 2020 - Updated Aug 2022
//

import express from 'express'
const router = express.Router()
import * as msal from '@azure/msal-node'
import appInsights from 'applicationinsights'

import { getUserDetails, getUserPhoto } from '../graph.mjs'

// For reasons we need to do this here as well
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

const AUTH_SCOPES = ['user.read']
const AUTH_ENDPOINT = 'https://login.microsoftonline.com/common'
const AUTH_CALLBACK_PATH = 'signin'

let msalApp

// Add session secret from environment variables
const SESSION_SECRET = process.env.SESSION_SECRET || '1234567890QWERTY'

// Update MSAL configuration to be more robust
if (process.env.ENTRA_APP_ID) {
  msalApp = new msal.PublicClientApplication({
    auth: {
      clientId: process.env.ENTRA_APP_ID,
      authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
      redirectUri: process.env.AUTH_REDIRECT_URI
    },

    system: {
      loggerOptions: {
        loggerCallback(level, msg) {
          if (!msg.includes('redirect?code=')) console.log('### 🕵️‍♀️ MSAL: ', msg)
        },
        piiLoggingEnabled: false,
        logLevel: msal.LogLevel.Warning,
      },
    },
  })

  console.log(`### 🔐 MSAL configured using client ID: ${process.env.ENTRA_APP_ID}`)
}

// Add middleware to check authentication status
const ensureAuthenticated = (req, res, next) => {
  if (!req.session?.user?.account) {
    return res.redirect('/login')
  }
  next()
}

// ==============================
// Routes
// ==============================

// This login route will redirect to Azure AD start the PKCE auth flow
router.get('/login', async (req, res) => {
  console.log('### 🔐 MSAL login, start PKCE flow...')
  const host = req.get('host')
  const redirectUri = process.env.AUTH_REDIRECT_URI

  try {
    // Generate PKCE Codes before starting the authorization flow
    const cryptoProvider = new msal.CryptoProvider()
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes()

    // create session object if does not exist
    if (!req.session.pkceCodes) {
      req.session.pkceCodes = {
        challengeMethod: 'S256',
      }
    }

    // Set generated PKCE Codes as session vars
    req.session.pkceCodes.verifier = verifier
    req.session.pkceCodes.challenge = challenge

    // Add PKCE code challenge and challenge method to authCodeUrl request object
    const authCodeUrlParameters = {
      scopes: AUTH_SCOPES,
      redirectUri: redirectUri,
      codeChallenge: req.session.pkceCodes.challenge, // PKCE Code Challenge
      codeChallengeMethod: req.session.pkceCodes.challengeMethod, // PKCE Code Challenge Method
    }

    // Get url to sign user in and consent to scopes needed for application
    const authCodeUrl = await msalApp.getAuthCodeUrl(authCodeUrlParameters)
    if (!authCodeUrl) {
      throw new Error('ERROR! Failed to get auth code url')
    }
    // Redirect user to auth code url to sign in
    res.redirect(authCodeUrl)
  } catch (err) {
    res.render('error', {
      title: 'PKCE redirect error',
      message: err,
      error: err,
      isAuthenticated: !!req.session?.user?.account,
      user: req.session?.user?.account || null
    })
  }
})

// This route is called by Azure AD after the user has logged in
// It will exchange the auth code for an access token
router.get(`/${AUTH_CALLBACK_PATH}`, async (req, res) => {
  console.log('### 🔐 MSAL login, code received...');
  
  const host = req.get('host')
  const redirectUri = process.env.AUTH_REDIRECT_URI

  // Add PKCE code verifier to token request object
  const tokenRequest = {
    code: req.query.code,
    scopes: AUTH_SCOPES,
    redirectUri: redirectUri,
    codeVerifier: req.session.pkceCodes.verifier, // PKCE Code Verifier
    clientInfo: req.query.client_info,
  }

  try {
    const tokenResponse = await msalApp.acquireTokenByCode(tokenRequest);
    console.log('Token response:', {
      account: tokenResponse.account,
      hasToken: !!tokenResponse.accessToken
    });

    // Store user details in session
    req.session.user = {
      account: {
        name: tokenResponse.account.name,
        username: tokenResponse.account.username,
        tenantId: tokenResponse.account.tenantId,
        environment: tokenResponse.account.environment,
        homeAccountId: tokenResponse.account.homeAccountId
      },
      accessToken: tokenResponse.accessToken
    };

    console.log('Session after login:', {
      user: req.session.user,
      account: req.session.user.account
    });

    res.redirect('/account');
  } catch (err) {
    console.error('Token acquisition error:', err);
    res.render('error', {
      title: 'Authentication Error',
      message: err.message,
      error: err,
      isAuthenticated: false,
      user: null
    });
  }
})

router.get('/logout', function (req, res) {
  req.session.destroy(() => {
    res.redirect('/')
  })
})

// Update account route to use middleware
router.get('/account', ensureAuthenticated, async function (req, res) {
  console.log('Account route - session user:', req.session.user);
  
  let details = {}
  let photo = null

  try {
    details = await getUserDetails(req.session.user.accessToken)
    photo = await getUserPhoto(req.session.user.accessToken)
  } catch (err) {
    console.log('### 💥 ERROR! Problem calling graph API')
    console.log('### 💥 ERROR! ', err)
  }

  // Ensure we have the correct user structure
  const user = {
    account: req.session.user.account || {},
    accessToken: req.session.user.accessToken
  };

  res.render('account', {
    title: 'Node DemoApp: Account',
    isAuthenticated: true,
    user: user,
    details: details || {},
    photo: photo,
  })
})

// Add a helper route to check auth status
router.get('/auth-status', (req, res) => {
  res.json({
    isAuthenticated: !!req.session.user,
    user: req.session.user ? {
      name: req.session.user.account.name,
      username: req.session.user.account.username
    } : null
  })
})

// Add this near your other routes
router.get('/debug-session', (req, res) => {
  res.json({
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    sessionContent: {
      user: req.session?.user ? {
        hasAccount: !!req.session.user.account,
        hasToken: !!req.session.user.accessToken,
        accountUsername: req.session.user.account?.username
      } : null
    }
  });
});

export { ensureAuthenticated }  // Export middleware for use in other routes
export default router
