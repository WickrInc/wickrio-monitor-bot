const fs = require('fs');
const prompt = require('prompt');
const processes = require('./processes.json');
const dataStringify = JSON.stringify(processes);
const dataParsed = JSON.parse(dataStringify);
const {exec, execSync, execFileSync} = require('child_process');
prompt.colors = false;

process.stdin.resume(); //so the program will not close instantly

function exitHandler(options, err) {
  try {
    if (err) {
      process.kill(process.pid);
      process.exit();
    }
    if (options.exit) {
      process.exit();
    } else if (options.pid) {
      process.kill(process.pid);
    }
  } catch (err) {
    console.log(err);
  }
}

//catches ctrl+c and stop.sh events
process.on('SIGINT', exitHandler.bind(null, {exit: true}));

//catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {pid: true}));
process.on('SIGUSR2', exitHandler.bind(null, {pid: true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {
  exit: true,
  reason: 'uncaughtException'
}));

main();

async function main() {
  if (processConfigured()) {
    try {
      var cp = execSync('cp processes.json processes_backup.json');
      if (dataParsed.apps[0].env.tokens.WICKRIO_BOT_NAME.value !== undefined) {
        var newName = "WickrIO-Monitor-Bot_" + dataParsed.apps[0].env.tokens.WICKRIO_BOT_NAME.value;
      } else {
        var newName = "WickrIO-Monitor-Bot";
      }
      //var assign = Object.assign(dataParsed.apps[0].name, newName);
      dataParsed.apps[0].name = newName;
      var ps = fs.writeFileSync('./processes.json', JSON.stringify(dataParsed, null, 2));
    } catch (err) {
      console.log(err);
    }
    console.log("Already configured");
    process.exit();
  } else {
    try {
      var it = await inputTokens();
      process.exit();
      } catch (err) {
      console.log(err);
    }
  }
}

async function inputTokens() {
  var tokens = ['WICKRIO_BOT_NAME','PAGERDUTY_API_KEY', 'NEIGHBOR_BOTS_LIST']; //Add any tokens(as strings separated by commas) you want to prompt for in the configuration process here
  var config = [];
  var i = 0;
  var inputResult = await readFileInput();
  let objectKeyArray = [];
  let objectValueArray = [];
  if (inputResult !== "" || inputResult !== undefined) {
    for (var x = 0; x < inputResult.length; x++) {
      let locationEqual = inputResult[x].indexOf("=");
      let objectKey = inputResult[x].slice(0, locationEqual);
      let objectValue = inputResult[x].slice(locationEqual + 1, inputResult[x].length); //Input value
      objectKeyArray.push(objectKey);
      objectValueArray.push(objectValue);
    }
    var newObjectResult = {};
    for (var j = 0; j < inputResult.length; j++) {
      newObjectResult[objectKeyArray[j]] = objectValueArray[j];
    }
  }
  return new Promise((resolve, reject) => {
    var recursivePrompt = function() {
      var token = tokens[i];
      var type;
      if (i === tokens.length) {
        return resolve("Configuration complete!");
      }
      if (token === 'WICKRIO_BOT_NAME' && process.env.WICKRIO_BOT_NAME !== undefined){
        var input = token + '=' + process.env.WICKRIO_BOT_NAME;
        config.push(input);
        i++;
        return recursivePrompt();
      } else if (token === 'PAGERDUTY_API_KEY' && process.env.PAGERDUTY_API_KEY !== undefined){
        var input = token + '=' + process.env.PAGERDUTY_API_KEY;
        config.push(input);
        i++;
        return recursivePrompt();
      } else if(token === 'NEIGHBOR_BOTS_LIST' && process.env.NEIGHBOR_BOTS_LIST !== undefined){
        var input = token + '=' + process.env.NEIGHBOR_BOTS_LIST;
        config.push(input);
        i++;
        return recursivePrompt();
      }
      var dflt = newObjectResult[token];
      var emptyChoice = false;
      if (dflt === "undefined" || dflt === undefined) {
        dflt = "N/A";
        emptyChoice = true;
      }
      var schema = {
        properties: {
          [token]: {
            pattern: type,
            type: 'string',
            description: 'Enter your ' + token.replace(/_/g, " ").replace(/\w\S*/g, function(txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }) + ' (Default: ' + dflt + ')',
            message: 'Cannot leave ' + token + ' empty! Please enter a value',
            required: emptyChoice
          }
        }
      };
      prompt.get(schema, function(err, answer) {
        if (answer[token] === "")
          answer[token] = newObjectResult[token];
        var input = token + '=' + answer[token];
        config.push(input);
        i++;
        recursivePrompt();
      });
    }
    recursivePrompt();
  }).then(function(answer) {
    let objectKeyArray = [];
    let objectValueArray = [];
    for (var i = 0; i < config.length; i++) {
      let locationEqual = config[i].indexOf("=");
      let objectKey = config[i].slice(0, locationEqual);
      let objectValue = config[i].slice(locationEqual + 1, config[i].length); //Input value
      objectKeyArray.push(objectKey);
      objectValueArray.push(objectValue);
    }
    var newObjectResult = {};
    for (var j = 0; j < config.length; j++) {
      newObjectResult[objectKeyArray[j]] = objectValueArray[j];
    }
    for (var key in newObjectResult) {
      if (key === 'WICKRIO_BOT_NAME' && process.env.WICKRIO_BOT_NAME !== undefined){
        var obj = {
          "value": process.env.WICKRIO_BOT_NAME,
          "encrypted": false
        };
        newObjectResult.WICKRIO_BOT_NAME = obj;
        continue;
      } else if (key === 'PAGERDUTY_API_KEY' && process.env.PAGERDUTY_API_KEY !== undefined){
        var obj = {
          "value": process.env.PAGERDUTY_API_KEY,
          "encrypted": false
        };
        newObjectResult.PAGERDUTY_API_KEY = obj;
        continue;
      } else if(key === 'NEIGHBOR_BOTS_LIST' && process.env.NEIGHBOR_BOTS_LIST !== undefined){
        var obj = {
          "value": process.env.NEIGHBOR_BOTS_LIST,
          "encrypted": false
        };
        newObjectResult.NEIGHBOR_BOTS_LIST = obj;
        continue;
      }
      var obj = {
        "value": newObjectResult[key],
        "encrypted": false
      };
      newObjectResult[key] = obj;
    }
    for (var key in dataParsed.apps[0].env.tokens) {
      delete dataParsed.apps[0].env.tokens[key];
    }
    try {
      var cp = execSync('cp processes.json processes_backup.json');

      if (process.env.WICKRIO_BOT_NAME !== undefined) {
        var newName = "WickrIO-Monitor-Bot_" + process.env.WICKRIO_BOT_NAME;
      } else if (newObjectResult.WICKRIO_BOT_NAME.value !== undefined) {
        var newName = "WickrIO-Monitor-Bot_" + newObjectResult.WICKRIO_BOT_NAME.value;
      } else {
        var newName = "WickrIO-Monitor-Bot";
      }
      dataParsed.apps[0].name = newName;

      var assign = Object.assign(dataParsed.apps[0].env.tokens, newObjectResult);
      var ps = fs.writeFileSync('./processes.json', JSON.stringify(dataParsed, null, 2));
    } catch (err) {
      console.log(err);
    }
    console.log(answer);
    return;
  }).catch(err => {
    console.log(err);
  });
}

function readFileInput() {
  try {
    var rfs = fs.readFileSync('./processes.json', 'utf-8');
    if (!rfs) {
      console.log("Error reading processes.json!")
      return rfs;
    } else
      return rfs.trim().split('\n');
    }
  catch (err) {
    console.log(err);
    process.exit();
  }
}

function processConfigured()
{
    var processes;
    try {
        processes = fs.readFileSync('./processes.json', 'utf-8');
        if (!processes) {
          console.log("Error reading processes.json!")
          return false;
        }
    }
    catch (err) {
        console.log(err);
        return false;
    }

    var pjson = JSON.parse(processes);
    if (pjson.apps[0].env.tokens === undefined) {
        return false;
    }

    if (pjson.apps[0].env.tokens.WICKRIO_BOT_NAME === undefined) {
        return false;
    }
    if (pjson.apps[0].env.tokens.PAGERDUTY_API_KEY === undefined) {
        return false;
    }
    if (pjson.apps[0].env.tokens.NEIGHBOR_BOTS_LIST === undefined) {
        return false;
    }

    return true;
}

