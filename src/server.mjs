//
// Main Express server for nodejs-demoapp
// ---------------------------------------------
// Ben C, Oct 2017 - Updated: Oct 2024
//

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
console.log(`### 🚀 Node.js demo app v${packageJson.version} starting...`)

// Dotenv handy for local config & debugging
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

import appInsights from 'applicationinsights'

// Configure App Insights
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  // Note we are keeping on the old v2.x SDK for now as the v3.x SDK doesn't work very well
  appInsights
    .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setSendLiveMetrics(true)
    .setAutoCollectConsole(true, true)
    .start()

  console.log('### 🩺 Azure App Insights enabled')
}

// Core Express & logging stuff
import express from 'express'
import path from 'path'
import logger from 'morgan'
import session from 'express-session'
import { createClient as createRedisClient } from 'redis'
import RedisStore from 'connect-redis'
import { readFileSync } from 'fs'
import { PublicClientApplication } from '@azure/msal-node'
import authConfig from './authConfig.mjs'
import crypto from 'crypto'

const app = new express()
// Get values from env vars or defaults where not provided
const port = process.env.PORT || 3000

// View engine setup, static content & session
const __dirname = path.resolve()
app.set('views', [path.join(__dirname, 'views'), path.join(__dirname, 'todo')])
app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')))

// Session required for auth and MSAL signin flow
const sessionConfig = {
  secret: packageJson.name,
  cookie: { secure: false },
  resave: false,
  saveUninitialized: false,
}

// MSAL Auth setup
const msalClient = new PublicClientApplication(authConfig)

app.use(session({
  secret: '1234567890QWERTY',
  resave: false,
  saveUninitialized: false,
}))

const generateCodeVerifier = () => {
  return crypto.randomBytes(32).toString('base64url')
}

const generateCodeChallenge = (codeVerifier) => {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

app.get('/login', (req, res) => {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  req.session.codeVerifier = codeVerifier

  const authCodeUrlParameters = {
    scopes: ['user.read'],
    redirectUri: 'https://nodejs-demoapp.lemonrock-97154e27.canadacentral.azurecontainerapps.io/signin',
    codeChallenge: codeChallenge,
    codeChallengeMethod: 'S256'
  }

  msalClient.getAuthCodeUrl(authCodeUrlParameters)
  .then((response) => {
    res.redirect(response)
  })
  .catch((error) => {
    console.error('Auth URL Error:', error); // Better error logging
    res.status(500).send('Authentication initialization failed');
  })
})

app.get('/signin', (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: ['user.read'],
    redirectUri: 'https://nodejs-demoapp.lemonrock-97154e27.canadacentral.azurecontainerapps.io/signin',
    codeVerifier: req.session.codeVerifier
  };

  msalClient.acquireTokenByCode(tokenRequest)
    .then((response) => {
      req.session.accessToken = response.accessToken;
      console.log('Token acquired successfully');
      res.redirect('/');
    })
    .catch((error) => {
      console.error('Token acquisition failed:', JSON.stringify(error));
      res.redirect('/login');
    });
});

const ensureAuthenticated = (req, res, next) => {
  if (req.session.accessToken) {
    return next()
  }
  res.redirect('/login')
}

// In server.mjs, update the root route to pass user auth state
app.get('/', ensureAuthenticated, (req, res) => {
  res.render('index', {
    title: 'Home',
    isAuthenticated: !!req.session.accessToken,
    user: req.session.user || null
  });
});

app.get('/protected', ensureAuthenticated, (req, res) => {
  res.send('This is a protected route.')
})

// Update logout route to handle MSAL session
app.get('/logout', (req, res) => {
  // Get post-logout redirect URI
  const logoutUri = `https://${process.env.WEBSITE_HOSTNAME}`;
  
  // Clear session
  req.session.destroy(() => {
    // Redirect to MSAL logout
    const logoutUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(logoutUri)}`;
    res.redirect(logoutUrl);
  });
});

// Update server creation to bind to all interfaces
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Handle container health checks
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Very optional Redis session store - only really needed when running multiple instances
if (process.env.REDIS_SESSION_HOST) {
  const redisClient = createRedisClient({ url: `redis://${process.env.REDIS_SESSION_HOST}` })

  redisClient.connect().catch((err) => {
    console.error('### 🚨 Redis session store error:', err.message)
    process.exit(1)
  })

  sessionConfig.store = new RedisStore({ client: redisClient })
  console.log('### 📚 Session store configured using Redis')
} else {
  console.log('### 🎈 Session store not configured, sessions will not persist')
}

app.use(session(sessionConfig))

// Request logging, switch off when running tests
if (process.env.NODE_ENV !== 'test') {
  app.use(
    logger('dev', {
      skip: function (req, res) {
        // Don't log the signin code PKCE redirect
        return req.path.indexOf('/signin') == 0
      },
    }),
  )
}

// Parsing middleware
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Routes & controllers
import pageRoutes from './routes/pages.mjs'
import apiRoutes from './routes/api.mjs'
import authRoutes from './routes/auth.mjs'
import todoRoutes from './todo/routes.mjs'
import addMetrics from './routes/metrics.mjs'

// Prometheus metrics, enabled by default
if (process.env.DISABLE_METRICS !== 'true') {
  // Can't use app.use() here due to how the metrics middleware wants to be registered
  addMetrics(app)
}

// Core routes we always want
app.use('/', pageRoutes)
app.use('/', apiRoutes)

// Initialize authentication only when configured
if (process.env.ENTRA_APP_ID) {
  app.use('/', authRoutes)
}

// Optional routes based on certain settings/features being enabled
if (process.env.TODO_MONGO_CONNSTR) {
  app.use('/', todoRoutes)
}

// Make package app version a global var, shown in _foot.ejs
app.locals.version = packageJson.version

// Catch all route, generate an error & forward to error handler
app.use(function (req, res, next) {
  let err = new Error('Not Found')
  err.status = 404
  if (req.method != 'GET') {
    err = new Error(`Method ${req.method} not allowed`)
    err.status = 500
  }

  next(err)
})

// Error handler
app.use(function (err, req, res, next) {
  console.error(`### 💥 ERROR: ${err.message}`)

  // App Insights
  if (appInsights.defaultClient) {
    appInsights.defaultClient.trackException({ exception: err })
  }

  // Render the error page
  res.status(err.status || 500)
  res.render('error', {
    title: 'Error',
    message: err.message,
    error: err,
  })
})

export default app
