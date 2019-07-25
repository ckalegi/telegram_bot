/*
  
  Jacob Waller - 2018
  jacobwaller.com

  Chicago E-Skate

*/
const Telegraf = require("telegraf");
const request = require("request");
const cheerio = require("cheerio");
const rp = require("request-promise");
const fs = require("fs");
const dialogflow = require("dialogflow")
const uuid = require("uuid")

const readline = require('readline');
const {google} = require('googleapis');

var jsdom = require("jsdom");
var mysql = require("mysql");
var schedule = require("node-schedule");
var basicCommands = require("./basicCommands.json");
var projectInformation = require("./projectID.json")

const { Markup } = require("telegraf");

require("dotenv").config();

let BOT_TOKEN = process.env.BOT_TOKEN;
let DARKSKY_TOKEN = process.env.DARKSKY_TOKEN;
let OPENWEATHER_TOKEN = process.env.OPENWEATHER_TOKEN;
let GROUP_ID = process.env.GROUP_ID;
let SECRET_COMMAND = process.env.SECRET_COMMAND;
let PROJECT_ID = process.env.PROJECT_ID

//Credentials for the SQL server
let sql_creds = require("./sql_creds.json");

//Google Sheet API
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = 'token.json';

const bot = new Telegraf(BOT_TOKEN, { username: "ChiSk8_bot" });

var mainCTX;

//Generic Error message
const errorMsg =
  "There was an error. Try again later. \n@jacob_waller Look at logs pls";


//Generic Command Section. Commands defined in basicCommands.json
for (var i = 0; i < basicCommands.length; i++) {
  bot.command(
    basicCommands[i].commands,
    Telegraf.reply(basicCommands[i].response)
  );
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  mainCTX.reply("Verification Token Expired. @jacob-waller pls fix this")

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function sayNextGroupRide(auth) {
  const sheets = google.sheets({version: 'v4', auth});
  sheets.spreadsheets.values.get({
    spreadsheetId: '1LCfjmKDpbmrU3rtASEdicNlW0ruCYLuuYmBgW5kWBcg',
    range: 'Ride!A1:L',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const rows = res.data.values;

    console.log(rows);

    let rowsAfterToday = [];
    //console.log(rows)
    // 9 is date

    if (rows.length > 0) {
      for(let i = 0; i < rows.length; i++) { 
        if(rows[i][9] >= rows[2][10]) {
          rowsAfterToday.push(rows[i])
        }
      }

      //console.log(rowsAfterToday);

      if(rowsAfterToday.length > 0) {
          let minRowIndex = 0;
          for(let i = 1; i < rowsAfterToday.length; i++) {
              if(rowsAfterToday[i][9] < rowsAfterToday[minRowIndex][9]) {
                  minRowIndex = i;
              }
          }

          fr = rowsAfterToday[minRowIndex];
          output = "The next group ride is scheduled for " + fr[0] + ", " + fr[1] + " at " + fr[2] + ".\n"+
                   "It will start at " + fr[4] + " and will end at " + fr[7] + ".\n" + 
                   "For more information on this group ride, visit: " + fr[6];

          mainCTX.reply(output);

      } else {
          mainCTX.reply("There are no group rides scheduled.");
      }


    } else {
      mainCTX.reply('No Group Rides Scheduled');
    }
  });
}

function repl(word, ctx) {
  for(var i = 0; i < basicCommands.length; i++) {
    if(basicCommands[i].commands.includes(word)) {
      ctx.reply(basicCommands[i].response)
      return;
    }
  }

  ctx.reply("I couldn't find any recommendations about " + word)
}

/**
 * Send a query to the dialogflow agent, and return the query result.
 * @param {string} projectId The project to be used
 */
async function runSample(projectId = 'your-project-id', message, ctx) {
  // A unique identifier for the given session
  const sessionId = uuid.v4();

  // Create a new session
  const sessionClient = new dialogflow.SessionsClient();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        // The query to send to the dialogflow agent
        text: 'hello',
        // The language used by the client (en-US)
        languageCode: 'en-US',
      },
    },
  };

  request.queryInput.text.text = message

  // Send request and log result
  const responses = await sessionClient.detectIntent(request);
  console.log('Detected intent');
  const result = responses[0].queryResult;

  console.log(result)

  console.log(`  Query: ${result.queryText}`);
  console.log(`  Response: ${result.fulfillmentText}`);
  if (result.intent) {
    console.log(`  Intent: ${result.intent.displayName}`);
  } else {
    console.log(`  No intent matched.`);
  }

  if(result.fulfillmentText){
    ctx.reply(result.fulfillmentText)
  } else {
    if(result.intent.displayName == 'RecommendationsIntent') {

      let object = result.parameters.fields.ObjectsEntity.stringValue
      console.log(object)
      if(object == '') {
        ctx.reply("I'm not sure what you want recommendations for. Try again and be specific")
      } else {
        repl(object, ctx)
      }
    }
    else if(result.intent.displayName == 'GroupRideIntent') {
      mainCTX = ctx;
      // Load client secrets from a local file.
      fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
          // Authorize a client with credentials, then call the Google Sheets API.
          authorize(JSON.parse(content), sayNextGroupRide);
      });  
    }
  }
}

bot.command("ask", ctx => {
  runSample(projectId=PROJECT_ID, ctx.message.text.toString().substring(5), ctx);
});

//Says
//Good morning
//Weather
//Whether or not a group ride is today or tomorrow
function dailyMessage() {
  var resp = "Good morning!\n";
  bot.telegram.sendMessage(GROUP_ID, resp);

  //Get weather for the day
  request(
    `https://api.darksky.net/forecast/${DARKSKY_TOKEN}/41.8781,-87.6298`,
    function(err, response, body) {
      if (err) {
        console.log(errorMsg);
      } else {
        try {
          let con = JSON.parse(body);
          resp =
            "Today in Chicago you can expect a high of " +
            con.daily.data[0].temperatureMax +
            " and a low of " +
            con.daily.data[0].temperatureMin +
            ".\n";
          resp +=
            "Weather summary for the day: " + con.daily.data[0].summary + "\n";
          bot.telegram.sendMessage(GROUP_ID, resp);
        } catch (error) {
          console.log(error);
          return;
        }
      }
    }
  );

  mainCTX = ctx;
  // Load client secrets from a local file.
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
      // Authorize a client with credentials, then call the Google Sheets API.
      authorize(JSON.parse(content), sayNextGroupRide);
  });  
}

var s = schedule.scheduleJob("0 11 * * *", () => {
  dailyMessage();
});

bot.start(ctx => {
  ctx.reply(
    "Hi! I'm the Chicago E-Skate bot! I can give you weather information, helmet recommendations, and helpful links! Type /help for a list of available commands."
  );
});

bot.help(ctx =>
  ctx.reply(
    "Hi! I'm here to answer some questions. If you want to add a feature, DM @jacob_waller. Also, be advised I am in the Pre-est of Alphas. Things may not work correctly\n\n" +
      "/helmets: Get a list of links to some pretty good helmets\n" +
      "/links: Get a list of helpful links for newcomers or those who are curious\n" +
      "/group_ride: Gives information on the next group ride\n" +
      "/charge: Gives the charging map for Chicago\n" +
      "/nosedive: idk some OneWheel meme\n" +
      "/sendit: inspiration\n" +
      "/bearings: shows a gif on how to remove bearings from a wheel\n" +
      "/battery: shows a video on how to replace the battery on a Boosted Board\n" +
      "/ask <a question>: ask me a question!\n\n" +
      "Version: 1.0"
  )
);

bot.command(SECRET_COMMAND, ctx => {
  console.log(ctx.message.text);
  ctx.reply(ctx.message.text.toString().substring(6));
  ctx.telegram.sendMessage(GROUP_ID, ctx.message.text.toString().substring(6));
});

bot.on("new_chat_members", ctx => {
  var resp =
    "Hey! Welcome to the Chicago E-Skate Telegram.\n" +
    "For a map on places to charge, check out: https://www.google.com/maps/d/edit?mid=1KIzwP95pZD0A3CWmjC6lcMD29f4&usp=sharing\n" +
    "For info on the next group ride, click: /group_ride\n" +
    "For even more info, check out: https://www.facebook.com/groups/chicagoeskate/events/\n" +
    "If you want to know more about what I can do, click /help\n" +
    "Also, make sure you look at the Group Ride Guidelines by clicking: /rules";

  ctx.reply(resp);
});

var group_ride_comms = ["group_ride", "groupride", "ride", "rides"];
bot.command(group_ride_comms, ctx => {
  mainCTX = ctx;
  // Load client secrets from a local file.
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
      // Authorize a client with credentials, then call the Google Sheets API.
      authorize(JSON.parse(content), sayNextGroupRide);
  }); 
});

bot.startPolling();
