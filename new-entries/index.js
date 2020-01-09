const mongodb = require('mongodb');
//db connections
let mongo_client= null;
let cosmos_client = null;
const connection_mongoDB = process.env["connection_mongoDB"];
const connection_cosmosDB = process.env["connection_cosmosDB"];

module.exports = function (context, req) {
    //Create entry
    if (req.method === "POST") {
            var date = new Date();
            var date_string = date.toISOString();
            // Create a JSON string.
            var entryString = JSON.stringify({
                id: req.body.id,
                fecha_hora: date_string,
                tipo_entrada: "Nuevos"
            });

            // Write the entry to the database.
            context.bindings.newEntry = entryString;

            context.res = {
                status: 200,
                body: entryString,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
        
        context.done();
    }

    //Get entries
    if (req.method === "GET") {
        //TODO: Add filter for returning just the NEW FRIDGES entries
        var requestedID;
        if (req.query) {
            requestedID = req.query["id"];
        }
        if (requestedID) {
            //Get specific entry
             createCosmosClient()
                .then(function () {
                    getEntry(requestedID)
                        .then(function (entry) {
                            context.res = {
                                status: 200,
                                body: entry,
                                headers:{
                                    'Content-Type':'application/json'
                                }
                            };
                            context.done();
                        })
                        .catch(function (error) {
                            context.log('Error reading entry from database');
                            context.log(error);
                            context.res = { status: 500, body: error };
                            context.done();
                        });
                })
                .catch(function (error) {
                    context.log('Error creating cosmos_client for entry detail');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();
                });
        }
        else {
            //Get entries list
            createCosmosClient()
                .then(function () {
                    getEntries()
                        .then(function (entriesList) {
                            context.res = {
                                body: entriesList,
                                headers:{
                                    'Content-Type':'application/json'
                                }
                            };
                            context.done();
                        })
                        .catch(function (error) {
                            context.log('Error entries list from database');
                            context.log(error);
                            context.res = { status: 500, body: error };
                            context.done();
                        });
                })
                .catch(function (error) {
                    context.log('Error creating cosmos_client for entries list');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();
                });
        }
        context.done();
    }
    
    function createCosmosClient() {
        return new Promise(function (resolve, reject) {
            if (!cosmos_client) {
                mongodb.MongoClient.connect(connection_cosmosDB, function (error, _cosmos_client) {
                    if (error) {
                        reject(error);
                    }
                    cosmos_client = _cosmos_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }    

    function getEntry(entryId) {
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('Entries')
                .findOne({ _id: mongodb.ObjectId(entryId) },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function getEntries(query) {
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('Entries')
                .find(query)
                .toArray(function (error, docs) {
                    if (error) {
                        reject(error);
                    }
                    resolve(docs)
                });
        });
    }    
};
