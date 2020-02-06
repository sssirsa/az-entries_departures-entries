const mongodb = require('mongodb');
//db connections
let entries_departures_client = null;
const connection_EntriesDepartures = process.env["connection_EntriesDepartures"];

module.exports = function (context, req) {
    switch (req.method) {
        case "GET":
            GET_entries();
            break;
        default:
            notAllowed();
            break;
    }
    function GET_entries() {
        var requestedID;
        var requestedKind;
        if (req.query) {
            requestedID = req.query["id"];
            requestedKind = req.query["tipo_entrada"];
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
                                headers: {
                                    'Content-Type': 'application/json'
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
                    context.log('Error creating entries_departures_client for entry detail');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();

                });
        }
        else {
            //Get entries list
            createCosmosClient()
                .then(function () {
                    getEntries(requestedKind)
                        .then(function (entriesList) {
                            context.res = {
                                body: entriesList,
                                headers: {
                                    'Content-Type': 'application/json'
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
                    context.log('Error creating entries_departures_client for entries list');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();
                });
        }
    }

    function notAllowed() {
        context.res = {
            status: 405,
            body: "Method not allowed",
            headers: {
                'Content-Type': 'application/json'
            }
        };
        context.done();
    }

    function createCosmosClient() {
        return new Promise(function (resolve, reject) {
            if (!entries_departures_client) {
                mongodb.MongoClient.connect(connection_EntriesDepartures, function (error, _entries_departures_client) {
                    if (error) {
                        reject(error);
                    }
                    entries_departures_client = _entries_departures_client;
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
            entries_departures_client
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
            entries_departures_client
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
