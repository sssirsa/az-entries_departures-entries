const mongodb = require('mongodb');
//db connections
let mongo_client = null;
let cosmos_client = null;
const connection_mongoDB = process.env["connection_mongoDB"];
const connection_cosmosDB = process.env["connection_cosmosDB"];

module.exports = function (context, req) {
    //Create entry
    if (req.method === "POST") {
        var providerId = req.body['proveedor_origen_id'];
        var agencyId = req.body['udn_destino_id'];
        var subsidiaryId = req.body['sucursal_destino_id'];
        //Destination validation
        if (agencyId && subsidiaryId) {
            context.res = {
                status: 400,
                body: {
                    message: 'ES-001'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }

        //Minimum fields validation
        if ((!providerId && !agencyId) || (!providerId && !subsidiaryId)) {
            context.res = {
                status: 400,
                body: {
                    message: 'ES-002'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }

        //Fridge array validation
        if (req.body.cabinets_id.length === 0 || !req.body.cabinets_id) {
            context.res = {
                status: 400,
                body: {
                    message: 'ES-003'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }
        var date = new Date();
        var date_string = date.toISOString();
        // Create a JSON string.
        var entryString = JSON.stringify({
            id: req.body.id,
            descripcion: req.body.descripcion,
            fecha_hora: date_string,
            tipo_entrada: "Nuevos",
            nombre_chofer: req.body.nombre_chofer
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
        err
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

    function searchFridge(fridgeInventoryNumber) {
        return new Promise(function (resolve, reject) {
            mongo_client
                .db('sssirsa')
                .collection('fridges')
                .findOne({ economico: fridgeInventoryNumber },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        var err;
                        //Validations
                        if (!docs['nuevo']) {
                            //Not new fridge
                            err = {
                                status: 400,
                                body: {
                                    message: 'ES-004'
                                },
                                headers: {
                                    'Content-Type': 'application / json'
                                }
                            };
                            reject(err);
                        }
                        if (docs['establecimiento']) {
                            //Fridge is in a store
                            err = {
                                status: 400,
                                body: {
                                    message: 'ES-005'
                                },
                                headers: {
                                    'Content-Type': 'application / json'
                                }
                            };
                            reject(err);
                        }
                        if (docs['sucursal'] || docs['udn']) {
                            //Fridge located in any subsidiary or agency
                            err = {
                                status: 400,
                                body: {
                                    message: 'ES-006'
                                },
                                headers: {
                                    'Content-Type': 'application / json'
                                }
                            };
                            reject(err);
                        }
                        if (docs.estatus_unilever) {
                            if (docs.estatus_unilever['code'] !== "0001") {
                                //Not new fridge
                                err = {
                                    status: 400,
                                    body: {
                                        message: 'ES-007'
                                    },
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                };
                                reject(err);
                            }
                        }
                        //Resolve correctly if all validations are passed        
                        resolve(docs);
                    }
                );
        });
    }
};