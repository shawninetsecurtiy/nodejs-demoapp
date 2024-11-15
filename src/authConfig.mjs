// src/authConfig.js
const msalConfig = {
    auth: {
      clientId: '0b2f7424-ac58-413e-91cf-c1b97c16f3f7', // Application (client) ID
      authority: 'https://login.microsoftonline.com/99d1cd35-2846-46f1-935e-59047152a180', // Directory (tenant) ID
      knownAuthorities: ['login.microsoftonline.com'],
      redirectUri: 'http://localhost:3000/signin'
    },
    system: {
      loggerOptions: {
        loggerCallback(loglevel, message, containsPii) {
          console.log(message);
        },
        piiLoggingEnabled: false,
        logLevel: 'Info',
      }
    }
  };
  
  // module.exports = msalConfig;
  export default msalConfig;