/*
 * Developer: Shivam Gangwar
 * Maintainer: Shivam Gangwar
 * Date: 19 Feb 2019
 */

const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const storage = require("node-persist");

//just replace this call with our security algorithm
var crypto = require("crypto");

//allow for variable storage --> security feature
storage.initSync();

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.appdata'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.


const TOKEN_PATH = 'token.json';

function downloadFileFromAppDataFolder(drive, fileName){
  return new Promise(function(resolve, reject){
    searchFileInGdrive(drive,fileName).then(searchResult => {
      if(searchResult !== 'FileNotFound'){
        const dest = fs.createWriteStream('persist/'+fileName);
        drive.files.get({
        spaces: 'appDataFolder',
        fileId: searchResult,
        alt: 'media'
        },
        {responseType: 'stream'},
        function(err, res){
          res.data
            .on('end', () => {
              dest.end();
              resolve();
            })
            .on('error', err => {
              reject(err);
            })
            .pipe(dest);
        });
      }else{
        reject(searchResult);
      }
    });
  });
}


function searchFileInGdrive(drive,fileName) {
  let found = false;
  return new Promise(function(resolve, reject){
    drive.files.list({
      spaces: 'appDataFolder',
      fields: 'nextPageToken, files(id, name)',
      pageSize: 100
    }, function (err, res) {
      if (err) {
         reject(err);
         console.error(err);
      }
      else {
        let fileId = 'FileNotFound';
        res.data.files.forEach(function (file) {
          if(file.name === fileName){
              found = true;
              fileId = file.id;
              resolve(fileId);
          }
        });
        if(found === false){
          resolve(fileId);
        }
      }
    });
  });
}


function callableGetIds(masterPassword, domain){
  return new Promise((resolve,reject) => {
    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
      if (err) reject(err);
      // Authorize a client with credentials, then call the Google Drive API.
      authorizeForGetDomain(JSON.parse(content), getIdsCallback, masterPassword, domain).then(accounts=>{
           resolve(accounts);
      }).catch(e =>{
           reject(e);
      });
    });
  });
}



/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorizeForGetDomain(credentials, callback, masterPassword, domain) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  return new Promise((resolve,reject) => {
      // Check if we have previously stored a token.
      fs.readFile('persist/'+TOKEN_PATH, (err, token) => {
        if (err){
          const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
          });
          console.log('[ALERT] Authorize this app by visiting this url:', authUrl);
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question('\n[INPUT] Enter the code from that page here: ', (code) => {
            rl.close();
             oAuth2Client.getToken(code, (err, token) => {
              if (err) return console.error('Error retrieving access token', err);
              oAuth2Client.setCredentials(token);

              // Store the token to disk for later program executions
                new Promise(function(res, rej){
                fs.writeFile('persist/'+TOKEN_PATH, JSON.stringify(token), (err) => {
                    if (err) rej(err);
                    else res();
                  });
                }).then(function(oAuth2Client){
                      console.log("[SUCCESS] Token is stored at 'persist/token.json'");
                      //Calling main function where all the operations will be done.
                      callback(oAuth2Client, masterPassword, domain).then(accounts=>{
                              resolve(accounts);
                      }).catch(e =>{
                           reject(e.message);
                      });
                }).catch(function(err) {
                      reject(err);
                });

            });
          });

        }
        else{
          oAuth2Client.setCredentials(JSON.parse(token));
          callback(oAuth2Client, masterPassword, domain).then(accounts=>{
               resolve(accounts);
          }).catch(e =>{
               reject(e.message);
          });
        }
      });
    });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

function getIdsCallback(auth,masterPassword,domain){
 const drive = google.drive({ version: 'v3', auth});
 return new Promise((resolve,reject) => {
    downloadFileFromAppDataFolder(drive,domain).then(()=>{
      let accounts = [];
        let tempAccounts = getAccounts(domain, masterPassword);
        for (var j = 0; j < tempAccounts.length; j++) {
          accounts.push({domain:tempAccounts[j].name, id:tempAccounts[j].username, /* password:tempAccounts[j].password, */securityLevel: 1});
        }
      resolve(accounts);
    }).catch(e =>{
     reject(e);
    });
 }).catch(e =>{
  reject(e);
 });
}

function getAccounts(accountName,masterPassword){
    var encryptedAccounts = storage.getItemSync(accountName);
    var accounts = [];

    if(typeof encryptedAccounts !== 'undefined'){
        try{
            let cipher = crypto.createDecipher('aes-256-cbc', masterPassword);
            let decryptedAccounts = cipher.update(encryptedAccounts, 'hex', 'utf8') + cipher.final('utf8');
            accounts = JSON.parse(decryptedAccounts);
        }catch(exception){
            throw new Error(exception.message);
        }
    }


    return accounts;
}


callableGetIds('master@123','facebook.com').then(result => {
  for(var i = 0; i < result.length; ++i){
    console.log(result[i].domain,"\t",result[i].id,"\t",/*result[i].password,*/"\t",result[i].securityLevel);
  }
}).catch(e => {
  console.log(e.message);
});
