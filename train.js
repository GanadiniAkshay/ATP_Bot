const fs           = require('fs');
const request      = require('request');
const util         = require('util');


const intentFolder = './NLP/intents/';
const entitiesFolder = './NLP/entities/';

intentsFile = [];
intentsApi  = [];

entitiesFile = [];
entitiesApi  = [];

intentIds = {};
entityIds = {};


// Read Intents Folder
fs.readdirSync(intentFolder).forEach(file => {
    name = file.split('.');
    
    if (name[1] == 'txt'){
        intentsFile.push(name[0]);
    }
});

// Read Entities Folder
fs.readdirSync(entitiesFolder).forEach(file => {
    name = file.split('.');

    if (name[1] == 'txt'){
        entitiesFile.push(name[0]);
    }
});

// Get existing intents and begin training intents
var options = { method: 'GET',
  url: 'https://api.api.ai/v1/intents',
  qs: { v: '20150910' },
  headers: 
   { 'cache-control': 'no-cache',
     'authorization': 'Bearer 22a9dd3e04c7422bb10eb7a73583aa55',
     'content-type': 'application/json' },
  json: true };

request(options, function (error, response, body) {
  if (error) throw new Error(error);

  for (i=0; i<body.length;i++){
      intent_name = body[i]['name'];

      intentIds[intent_name] = body[i]['id'];
      intentsApi.push(intent_name);
  }
  beginIntentTraining(intentsFile,intentsApi, intentIds);
});


// Get existing entities and begin training entities
var options = { method: 'GET',
  url: 'https://api.api.ai/v1/entities',
  qs: { v: '20150910' },
  headers: 
   { 'cache-control': 'no-cache',
     'authorization': 'Bearer 22a9dd3e04c7422bb10eb7a73583aa55',
     'content-type': 'application/json' } };

request(options, function (error, response, body) {
  if (error) throw new Error(error);

  body = JSON.parse(body);
  
  for (i=0; i<body.length;i++){
      entity_name = body[i]['name'];

      entityIds[entity_name] = body[i]['id'];
      entitiesApi.push(entity_name);
  }

  beginEntityTraining(entitiesFile,entitiesApi, entityIds);
});


//Begin Intent Training
function beginIntentTraining(intentsFile,intentsApi, intentIds){
    var trained = intersect(intentsFile, intentsApi);
    var untrained = except(intentsFile, intentsApi);

    trainIntents(trained,0,'PUT',intentIds);
    trainIntents(untrained,0,'POST',intentIds);
}

//Loop through intents with a timeout
function trainIntents(intents,iter,method,intentIds){
    if (iter >= intents.length){
        return;
    }

    setTimeout(function(){
        currentIntent = intents[iter];
        if (method == 'PUT'){
            console.log("Updating - " + currentIntent);
        }else{
            console.log("Creating - " + currentIntent);
        }
        
        readIntentFile(currentIntent,method,intentIds);
        trainIntents(intents,iter+1,method,intentIds)
    },1000);
}

//Begin Entity Training
function beginEntityTraining(entitiesFile,entitiesApi, entityIds){
    var trained = intersect(entitiesFile, entitiesApi);
    var untrained = except(entitiesFile, entitiesApi);

    for (i=0; i<trained.length; i++){
        currentEntity = trained[i];
        readEntityFile(currentEntity,'PUT',entityIds);
    }

    for (i=0; i<untrained.length; i++){
        currentEntity = untrained[i];
        readEntityFile(currentEntity,'POST',entityIds);
    }
}


//Read the intent file and extract the required info
function readIntentFile(currentIntent,method,intentIds={}){
    fs.readFile('./NLP/intents/' + currentIntent + '.txt', 'utf-8', function(err,data){
        let speeches = processData(data);

        let templates = [];
        let userSays  = [];
        let answer = '';
        let answerFlag = false;

        for (var i=0;i<speeches.length;i++){
            if (speeches[i]!='<-answer->'){
                if (answerFlag){
                    answer += speeches[i] + '\r\n';
                }else{
                    templates.push(speeches[i]);
                    userSays.push({"data":[{"text":speeches[i]}]})
                }
            }else{
                answerFlag = true;
            }
        }

        if (method == 'POST'){
            createIntent(currentIntent,templates,userSays,answer)
        }else{
            let id = intentIds[currentIntent];
            setTimeout(function(){updateIntent(id,currentIntent,templates,userSays,answer);}, 10000);
        }
    })
}

//Read the entity file and extract the required info
function readEntityFile(currentEntity,method,entityIds={}){
    fs.readFile('./NLP/entities/' + currentEntity + '.txt', 'utf-8', function(err,data){
        let speeches = processData(data);

        let entries = [];

        for (var i=0;i<speeches.length;i++){
           let synonyms = speeches[i].split(',');
           let value = synonyms[0];

           entries.push({"value":value,"synonyms":synonyms});
        }

        createUpdateEntity(currentEntity,entries,method);
    })
}


//Create a new intent
function createIntent(name,templates,userSays,answer,method){
    var options = { method: 'POST',
    url: 'https://api.api.ai/v1/intents',
    qs: { v: '20150910' },
    headers: 
    { 'cache-control': 'no-cache',
        'content-type': 'application/json',
        'authorization': 'Bearer 22a9dd3e04c7422bb10eb7a73583aa55' },
    body: 
    { name: name,
        auto: true,
        contexts: [],
        templates: templates,
        userSays: userSays,
        responses: [ { resetContexts: false, speech: answer } ] },
    json: true };


   request(options, function (error, response, body) {
            if (error) throw new Error(error);
    });
}

//Create a update intent
function updateIntent(id,currentIntent,templates,userSays,answer){
    var options = { method: 'PUT',
        url: 'https://api.api.ai/v1/intents/' + id,
        qs: { v: '20150910' },
        headers: 
        {   'cache-control': 'no-cache',
            'authorization': 'Bearer 22a9dd3e04c7422bb10eb7a73583aa55',
            'content-type': 'application/json' },
        body: 
        {   name: currentIntent,
            templates: templates,
            userSays: userSays },
        json: true };

    
        request(options, function (error, response, body) {
            if (error) throw new Error(error);
        });
}


//Create or update a entity
function createUpdateEntity(currentEntity,entries,method){
    var options = { method: method,
    url: 'https://api.api.ai/v1/entities',
    qs: { v: '20150910' },
    headers: 
    {   'cache-control': 'no-cache',
        'authorization': 'Bearer 22a9dd3e04c7422bb10eb7a73583aa55',
        'content-type': 'application/json' },
    body: 
    { name: currentEntity,
        entries: entries
    },
    json: true };

    request(options, function (error, response, body) {
        if (error) throw new Error(error);

        console.log(body);
    });
}


//================================//
// Utility Functions              //
//================================//

//Find intersection of two arrays
function intersect(a,b){
    return a.filter(function (e){
        return b.indexOf(e) > -1
    });
}

//Find except of two arrays
function except(a,b){
    return a.filter(function (e){
        return b.indexOf(e) == -1
    });
}

//Split the data into lines
function processData(data){
    let lines = data.toString().split('\n');
    return lines;
}




