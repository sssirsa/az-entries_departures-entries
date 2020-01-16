const mongodb = require('mongodb');
//db connections
let mongo_client = null;
let cosmos_client = null;
const connection_mongoDB = process.env["connection_mongoDB"];
const connection_cosmosDB = process.env["connection_cosmosDB"];
const MONGO_DB_NAME = process.env['MONGO_DB_NAME'];

module.exports = function (context, req) {
    switch (req.method) {
        case "GET":
            GET_entries();
            break;
        case "POST":
            POST_entry();
            break;
        default:
            notAllowed();
            break;
    }
    //Create entry
    function POST_entry() {
        //TODO: Get person data trough userid and save it in the entry data
        var userId = null;
        var originAgencyId = req.body['udn_origen_id'];
        var originSubsidiaryId = req.body['sucursal_origen_id'];

        var subsidiaryId = req.body['sucursal_destino_id'];
        var transportDriverId = req.body['operador_transporte_id'];
        var transportKindId = req.body['tipo_transporte_id']; //Non mandatory

        //Origin validation
        if (originAgencyId && originSubsidiaryId) {
            //no both
            context.res = {
                status: 400,
                body: {
                    message: 'ES-053'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }
        if (!originAgencyId && !originSubsidiaryId) {
            //at least one
            context.res = {
                status: 400,
                body: {
                    message: 'ES-056'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }
        //Destination validation
        if (!subsidiaryId) {
            context.res = {
                status: 400,
                body: {
                    message: 'ES-054'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }

        //Not same origin and destination validation
        if (subsidiaryId === originSubsidiaryId) {
            //no both
            context.res = {
                status: 400,
                body: {
                    message: 'ES-055'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }

        //Fridge array validation
        if (!req.body.cabinets_id) {
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
        if (req.body.cabinets_id.length === 0) {
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

        //Transport driver validation
        if (req.body.nombre_chofer && transportDriverId) {
            context.res = {
                status: 400,
                body: {
                    message: 'ES-047'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }
        if (!req.body.nombre_chofer && !transportDriverId) {
            context.res = {
                status: 400,
                body: {
                    message: 'ES-048'
                },
                headers: {
                    'Content-Type': 'application / json'
                }
            };
            context.done();
        }

        var date = new Date();
        var date_string = date.toISOString();

        // Create an entry base object.
        var entry = {
            descripcion: req.body.descripcion,
            fecha_hora: date_string,
            tipo_entrada: "Garantías",
            nombre_chofer: req.body.nombre_chofer,
            persona: null
        };

        //Transport information
        if (transportDriverId) {
            //search driver information and add it to the entry object
            createCosmosClient()
                .then(function () {
                    searchTransportDriver(transportDriverId)
                        .then(function (transportDriver) {
                            if (transportDriver) {
                                entry['operador_transporte'] = transportDriver;
                                if (transportKindId) {
                                    //search transport kind information and add it to the entry object
                                    createCosmosClient()
                                        .then(function () {
                                            searchTransportKind(transportKindId)
                                                .then(function (transporKind) {
                                                    if (transporKind) {
                                                        entry['tipo_transporte'] = transporKind;
                                                        createEntry();
                                                    }
                                                    else {
                                                        context.log('No transport kind found with the given id');
                                                        context.res = {
                                                            status: 400,
                                                            body: { message: "ES-050" },
                                                            headers: {
                                                                'Content-Type': 'application/json'
                                                            }
                                                        };
                                                        context.done();
                                                    }
                                                })
                                                .catch(function (error) {
                                                    context.log('Error searching transport kind');
                                                    context.log(error);
                                                    context.res = { status: 500, body: error };
                                                    context.done();
                                                });
                                        })
                                        .catch(function (error) {
                                            context.log('Error creating cosmos_client for transport kind search');
                                            context.log(error);
                                            context.res = { status: 500, body: error };
                                            context.done();
                                        });
                                }
                                else {
                                    createEntry();
                                }
                            }
                            else {
                                context.log('No transport driver found with the given id');
                                context.res = {
                                    status: 400,
                                    body: { message: "ES-049" },
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                };
                                context.done();
                            }
                        })
                        .catch(function (error) {
                            context.log('Error searching transport driver');
                            context.log(error);
                            context.res = { status: 500, body: error };
                            context.done();
                        });
                })
                .catch(function (error) {
                    context.log('Error creating cosmos_client for transport driver search');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();
                });
        }
        else {
            createEntry();
        }

        function createEntry() {
            createMongoClient()
                .then(function () {
                    //Origin search
                    if (originAgencyId) {
                        searchAgency(originAgencyId)
                            .then(function (agency) {
                                //Adding agency object to entry
                                if (agency) {
                                    entry['agencia_origen'] = agency;
                                    //Searching destination and adding it to the entry object
                                    if (subsidiaryId) {
                                        searchSubsidiary(subsidiaryId)
                                            .then(function (subsidiary) {
                                                //Adding subsidiary object to entry
                                                if (subsidiary) {
                                                    entry['sucursal_destino'] = subsidiary;
                                                    addFridgesToEntry();
                                                }
                                                else {
                                                    context.log('No subsidiary found with the given id');
                                                    context.res = {
                                                        status: 400,
                                                        body: { message: "ES-043" },
                                                        headers: {
                                                            'Content-Type': 'application/json'
                                                        }
                                                    };
                                                    context.done();
                                                }
                                            })
                                            .catch(function (error) {
                                                context.log('Error searching subsidiary');
                                                context.log(error);
                                                context.res = { status: 500, body: error };
                                                context.done();
                                            });
                                    }
                                }
                                else {
                                    context.log('No agency found with the given id');
                                    context.res = {
                                        status: 400,
                                        body: { message: "ES-045" },
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    };
                                    context.done();
                                }
                            })
                            .catch(function (error) {
                                context.log('Error searching agency');
                                context.log(error);
                                context.res = { status: 500, body: error };
                                context.done();
                            });
                    }
                    if (originSubsidiaryId) {
                        searchSubsidiary(originSubsidiaryId)
                            .then(function (subsidiary) {
                                //Adding subsidiary object to entry
                                if (subsidiary) {
                                    entry['sucursal_origen'] = subsidiary;
                                    //Searching destination and adding it to the entry object
                                    if (subsidiaryId) {
                                        searchSubsidiary(subsidiaryId)
                                            .then(function (subsidiary) {
                                                //Adding subsidiary object to entry
                                                if (subsidiary) {
                                                    entry['sucursal_destino'] = subsidiary;
                                                    addFridgesToEntry();
                                                }
                                                else {
                                                    context.log('No subsidiary found with the given id');
                                                    context.res = {
                                                        status: 400,
                                                        body: { message: "ES-043" },
                                                        headers: {
                                                            'Content-Type': 'application/json'
                                                        }
                                                    };
                                                    context.done();
                                                }
                                            })
                                            .catch(function (error) {
                                                context.log('Error searching subsidiary');
                                                context.log(error);
                                                context.res = { status: 500, body: error };
                                                context.done();
                                            });
                                    }
                                }
                                else {
                                    context.log('No subsidiary found with the given id');
                                    context.res = {
                                        status: 400,
                                        body: { message: "ES-043" },
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    };
                                    context.done();
                                }
                            })
                            .catch(function (error) {
                                context.log('Error searching subsidiary');
                                context.log(error);
                                context.res = { status: 500, body: error };
                                context.done();
                            });
                    }
                })
                .catch(function (error) {
                    context.log('Error creating mongo_client for origin search');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();
                });
        }

        //Search each fridge information and then add it to the entry
        //Validations of each fridge are made in the searchFridge function
        function addFridgesToEntry() {
            var fridgesInfoPromises = [];
            while (req.body['cabinets_id'].length) {
                fridgesInfoPromises.push(
                    searchFridge(
                        req.body['cabinets_id'].pop()
                    )
                );
            }
            //Waiting for all fridges promises to be solved
            Promise.all(fridgesInfoPromises)
                .then(function (fridgesArray) {
                    //If all fridges are found and can enter, then they are
                    //modified with the destination and then added to the entry object
                    modifyFridgesInfo(fridgesArray, entry);
                })
                .catch(function (error) {
                    //Reject with the returned error from the searchFridge function
                    context.log('Validation failure or error found while searching fridge');
                    context.log(error);
                    context.res = error;
                    context.done();
                });
        }

    }

    function modifyFridgesInfo(fridgesArray, entry) {
        var fridgesPromises = [];
        var destination = {
            sucursal: entry['sucursal_destino']
        };
        for (var i = 0; i < fridgesArray.length; i++) {
            fridgeId = fridgesArray[i]._id;
            fridgesPromises.push(
                updateFridgeDestination(destination, fridgeId)
            );
        }

        Promise.all(fridgesPromises)
            .then(function () {
                entry['cabinets'] = fridgesArray;
                // Write the entry to the database.
                writeEntry(entry)
                    .then(function (response) {
                        createFridgeControl(entry._id, fridgesArray, entry.sucursal, entry.udn)
                            .then(function () {
                                context.res = {
                                    status: 200,
                                    body: response.ops[0],
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                };
                                context.done();
                            })
                            .catch(function (error) {
                                context.log('Error writting fridge control to database');
                                context.log(error);
                                context.res = { status: 500, body: error };
                                context.done();
                            });
                    })
                    .catch(function (error) {
                        context.log('Error writting entry to database');
                        context.log(error);
                        context.res = { status: 500, body: error };
                        context.done();
                    });
            })
            .catch(function (error) {
                //Reject with the returned error from the updateFridgeDestination function
                context.log('Error writing destination information to fridge');
                context.log(error);
                context.res = error;
                context.done();
            });
    }

    //Get entries
    function GET_entries() {
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
                    getEntries({ tipo_entrada: "Garantías" })
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

    function createMongoClient() {
        return new Promise(function (resolve, reject) {
            if (!mongo_client) {
                mongodb.MongoClient.connect(connection_mongoDB, function (error, _mongo_client) {
                    if (error) {
                        reject(error);
                    }
                    mongo_client = _mongo_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
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

    function searchFridge(fridgeInventoryNumber) {
        return new Promise(function (resolve, reject) {
            mongo_client
                .db(MONGO_DB_NAME)
                .collection('fridges')
                .findOne({ economico: fridgeInventoryNumber },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        var err;
                        //Validations
                        if (!docs) {
                            //Not found fridge
                            err = {
                                status: 400,
                                body: {
                                    message: 'ES-046'
                                },
                                headers: {
                                    'Content-Type': 'application / json'
                                }
                            };
                            reject(err);
                            return;
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
                            return;
                        }
                        //if (docs['sucursal'] || docs['udn']) {
                        if (docs['sucursal']) {
                            //Fridge located in any subsidiary or agency
                            //Overriding agency validation because of implementation process
                            //TODO: Validate that fridge has properly departed when implementation is complete
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
                            return;
                        }
                        if (docs.estatus_unilever) {
                            //Validation is overridden if no status is present
                            if (
                                docs.estatus_unilever['code'] !== "0007"
                                || docs.estatus_unilever['code'] !== "0003"
                                || docs.estatus_unilever['code'] !== "0011"
                            ) {
                                //NImproper unilever status
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
                                return;
                            }
                        }
                        //Resolve correctly if all validations are passed        
                        resolve(docs);
                    }
                );
        });
    }

    function searchAgency(agencyId) {
        return new Promise(function (resolve, reject) {
            mongo_client
                .db(MONGO_DB_NAME)
                .collection('agencies')
                .findOne({ _id: mongodb.ObjectId(agencyId) },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function searchSubsidiary(subsidiaryId) {
        return new Promise(function (resolve, reject) {
            mongo_client
                .db(MONGO_DB_NAME)
                .collection('subsidiaries')
                .findOne({ _id: mongodb.ObjectId(subsidiaryId) },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function searchTransportDriver(transportDriverId) {
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('TransportDriver')
                .findOne({ _id: mongodb.ObjectId(transportDriverId) },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function searchTransportKind(transportKindId) {
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('TransportKind')
                .findOne({ _id: mongodb.ObjectId(transportKindId) },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function writeEntry(entry) {
        // Write the entry to the database.
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('Entries')
                .insertOne(entry,
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function updateFridgeDestination(newValues, fridgeId) {
        return new Promise(function (resolve, reject) {
            mongo_client
                .db(MONGO_DB_NAME)
                .collection('fridges')
                .updateOne(
                    { _id: mongodb.ObjectId(fridgeId) },
                    { $set: newValues },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function createFridgeControl(entryId, fridgeArray, subsidiary, agency) {
        return new Promise(function (resolve, reject) {
            var fridgesPromises = [];
            var element;
            var subsidiaryId, agencyId;
            subsidiary ? subsidiaryId = subsidiary['_id'] : subsidiaryId = null;
            agency ? agencyId = agency['_id'] : agencyId = null;
            for (var i = 0; i < fridgeArray.length; i++) {
                element = {
                    tipo_entrada: "Garantías",
                    cabinet_id: fridgeArray[i].economico,
                    entrada_id: entryId,
                    impedimento_id: null,
                    servicio_id: null,
                    sucursal_id: subsidiaryId,
                    agencia_id: agencyId
                };
                fridgesPromises.push(
                    writeFridgeControl(element)
                );
            }

            Promise.all(fridgesPromises)
                .then(function () {
                    resolve();
                })
                .catch(function (error) {
                    reject(error);
                });
        });
    }

    function writeFridgeControl(element) {
        // Write the entry to the database.
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('Control')
                .insertOne(element,
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

};