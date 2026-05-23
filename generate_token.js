const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    }
  }
});

const CLIENT_ID = env.client_id;
const CLIENT_SECRET = env.client_secret;
// Force this local callback for the terminal script
const REDIRECT_URI = 'http://localhost:3000/oauth2callback'; 

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Missing client_id or client_secret in .env!");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline', // Crucial: This gets the refresh_token!
  prompt: 'consent',      // Crucial: Forces Google to give a new refresh_token
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
});

console.log('===================================================');
console.log('1. Click this link (or copy/paste into your browser):');
console.log('\n' + authUrl + '\n');
console.log('2. Log in with your Google Account and approve access.');
console.log('===================================================');

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const q = url.parse(req.url, true).query;
    
    if (q.error) {
      res.end('Error: ' + q.error);
      console.error('❌ Error during authentication:', q.error);
      process.exit(1);
    } else if (q.code) {
      try {
        console.log('⏳ Got auth code! Getting tokens from Google...');
        const { tokens } = await oAuth2Client.getToken(q.code);
        
        // Update .env file
        let newEnv = fs.readFileSync(envPath, 'utf8');
        
        if (tokens.access_token) {
          if (newEnv.match(/access_token\s*=.*/)) {
            newEnv = newEnv.replace(/access_token\s*=.*/, `access_token=${tokens.access_token}`);
          } else {
            newEnv += `\naccess_token=${tokens.access_token}`;
          }
        }
        
        if (tokens.refresh_token) {
          if (newEnv.match(/refresh_token\s*=.*/)) {
            newEnv = newEnv.replace(/refresh_token\s*=.*/, `refresh_token=${tokens.refresh_token}`);
          } else {
            newEnv += `\nrefresh_token=${tokens.refresh_token}`;
          }
        }
        
        fs.writeFileSync(envPath, newEnv);
        
        console.log('✅ Success! access_token and refresh_token have been automatically saved to your .env file.');
        console.log('\n=== YOUR TOKENS ===');
        console.log('Access Token:', tokens.access_token);
        console.log('Refresh Token:', tokens.refresh_token);
        console.log('===================\n');
        res.end('Authentication successful! You can close this window. Your .env file has been updated.');
        
        server.close();
        process.exit(0);
      } catch (err) {
        res.end('Failed to get tokens: ' + err.message);
        console.error('❌ Failed to get tokens:', err);
        process.exit(1);
      }
    }
  }
}).listen(3000, () => {
  console.log('Listening on port 3000 for the Google callback...\n');
});
