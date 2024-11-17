//
// HTML page routes, that render ejs templates
// --------------------------------------------------
// Ben C, Jan 2020
//

import express from 'express'
const router = express.Router()
import os from 'os'
import fs from 'fs'
import { ManagedIdentityCredential } from "@azure/identity";

// =======================================================================
// Middleware to pass user data from session to all views
// =======================================================================
router.use(function (req, res, next) {
  // Set both user and authentication status
  res.locals.user = req.session?.user || null
  res.locals.isAuthenticated = !!req.session?.user?.account
  next()
})

// =======================================================================
// Get home page and index
// =======================================================================
router.get('/', function (req, res, next) {
  res.render('index', {
    title: 'Node DemoApp: Home',
  })
})

// =======================================================================
// Get system & runtime info
// =======================================================================
router.get('/info', function (req, res, next) {
  const info = {
    release: os.release(),
    type: os.type(),
    cpus: os.cpus(),
    hostname: os.hostname(),
    arch: os.arch(),
    mem: Math.round(os.totalmem() / 1048576),
    env: process.env.WEBSITE_SITE_NAME ? process.env.WEBSITE_SITE_NAME.split('-')[0] : 'Local',
    nodever: process.version,
    uptime: convertSeconds(os.uptime()),
  }

  const isKube = fs.existsSync('/var/run/secrets/kubernetes.io')
  let isContainer = isKube || fs.existsSync('/.dockerenv')

  // Fallback to try to detect containerd, only works when *NOT* in Kubernetes
  if (!isContainer) {
    try {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8')
      if (cgroup.includes('containerd')) {
        isContainer = true
      }
      // eslint-disable-next-line
    } catch (err) {
      isContainer = false
    }
  }

  res.render('info', {
    title: 'Node DemoApp: Info',
    info: info,
    isKube: isKube,
    isContainer: isContainer,
  })
})

// =======================================================================
// Get monitor page
// =======================================================================
router.get('/monitor', function (req, res, next) {
  res.render('monitor', {
    title: 'Node DemoApp: Monitoring',
  })
})

// =======================================================================
// Get weather page
// =======================================================================
router.get('/weather', function (req, res, next) {
  res.render('weather', {
    title: 'Node DemoApp: Weather',
  })
})

// =======================================================================
// Tools page
// =======================================================================
router.get('/tools', function (req, res, next) {
  res.render('tools', {
    title: 'Node DemoApp: Tools',
  })
})

// =======================================================================
// Page to generate CPU load
// =======================================================================
router.get('/tools/load', function (req, res, next) {
  const start = new Date().getTime()
  for (let i = 0; i < 499900000.0; i++) {
    Math.pow(9000.0, 9000.0)
  }

  const time = new Date().getTime() - start

  res.render('tools', {
    title: 'Node DemoApp: Tools',
    message: `I did some really hard sums and it only took me ${time} milliseconds!`,
  })
})

// =======================================================================
// Page to generate server side errors, good for App Insights demos
// =======================================================================
router.get('/tools/error', function (req, res, next) {
  try {
    // Intentionally throw an error for demo purposes
    throw new Error('This is a demo error from /tools/error');
  } catch (err) {
    err.status = 500;
    err.details = 'This error was intentionally generated for testing purposes';
    next(err);
  }
})

// =======================================================================
// Page to force GC
// =======================================================================
router.get('/tools/gc', function (req, res, next) {
  let message = 'Garbage collector was not able to run'
  try {
    if (global.gc) {
      global.gc()
      message = 'Garbage collector was run'
    }
    // eslint-disable-next-line
  } catch (e) {
    // DO nothing
  }

  res.render('tools', {
    title: 'Node DemoApp: Tools',
    message: message,
  })
})

// =======================================================================
// Get hello world from API
// =======================================================================
router.get('/hello', async function (req, res, next) {
  try {
    console.log('Initializing managed identity credential...');
    const credential = new ManagedIdentityCredential('7d75d2b9-58c0-4478-b4f0-44679da0c500');
    
    console.log('Getting token...');
    const scope = 'api://shtc-hello-world-api/.default';
    const token = await credential.getToken(scope);
    console.log('Token acquired successfully');
    
    const apiUrl = 'https://hello-world-api.internal.lemonrock-97154e27.canadacentral.azurecontainerapps.io/';
    console.log('Calling API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token.token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('API Response received');
    
    res.render('hello', {
      title: 'Node DemoApp: Hello World',
      message: data.message
    });
  } catch (err) {
    console.error('Error:', {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    next(err);
  }
});

export default router

// ******* UTILS HERE *************************************************************

// Util to convert seconds to DD:HH:MM:SS
function convertSeconds(n) {
  const days = Math.floor(n / (24 * 3600))
  n = n % (24 * 3600)
  const hours = Math.floor(n / 3600)
  n %= 3600
  const mins = Math.floor(n / 60)
  n %= 60
  const secs = Math.round(n)
  return `${days} days, ${hours} hours, ${mins} mins, ${secs} seconds`
}
