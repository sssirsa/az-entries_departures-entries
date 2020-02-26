const mongodb = require('mongodb');
const axios = require('axios');
const entry_kind = "Buen estado";
//db connections
let management_client = null;
let entries_departures_client = null;
const connection_Management = process.env["connection_Management"];
const connection_EntriesDepartures = process.env["connection_EntriesDepartures"];
const MANAGEMENT_DB_NAME = process.env['MANAGEMENT_DB_NAME'];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];

//URLS
const entries_departures = process.env["ENTRIES_DEPARTURES"];

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

    async function GET_entries() {
        var requestedID;
        if (req.query) {
            requestedID = req.query["id"];
        }
        try {
            if (requestedID) {
                //Specific entry requested
                let entry = await getEntry(requestedID);
                context.res = {
                    body: entry,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
            else {
                //return all new fridge entries
                let entries = await getEntries();
                context.res = {
                    body: entries,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
        }
        catch (e) {
            context.res = e;
            context.done();
        }

        //Internal functions
        async function getEntry(id) {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Entries')
                        .findOne({ _id: mongodb.ObjectId(id) },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            "Content-Type": "application/json"
                                        }
                                    });
                                }
                                if (docs) {
                                    resolve(docs);
                                }
                                else {
                                    reject({
                                        status: 404,
                                        body: {},
                                        headers: {
                                            "Content-Type": "application/json"
                                        }
                                    });
                                }
                            }
                        );
                }
                catch (error) {
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });

        }

        async function getEntries() {
            let query = {
                tipo_entrada: entry_kind
            };
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Entries')
                        .find(query)
                        .toArray(function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error,
                                    headers: {
                                        "Content-Type": "application/json"
                                    }
                                });
                            }
                            resolve(docs)
                        });
                }
                catch (error) {
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });
        }

    }

    async function POST_entry() {
        //TODO: Get person data trough userid and save it in the entry data
        let entry; //Base object
        var userId = null;
        var destinationAgencyId = req.body['udn_destino'];
        var destinationSubsidiaryId = req.body['sucursal_destino'];
        var originAgencyId = req.body['udn_origen'];
        var originSubsidiaryId = req.body['sucursal_origen'];
        var transportDriverId = req.body['operador_transporte'];
        var transportKindId = req.body['tipo_transporte']; //Non mandatory

        validate();

        try {
            let originAgency,
                originSubsidiary,
                destinationAgency,
                destinationSubsidiary,
                transportDriver,
                transportKind;
            if (originAgencyId) {
                originAgency = await searchAgency(originAgencyId);
            }
            if (originSubsidiaryId) {
                originSubsidiary = await searchSubsidiary(originSubsidiaryId);
            }
            if (destinationAgencyId) {
                destinationAgency = await searchAgency(destinationAgencyId);
            }
            if (destinationSubsidiaryId) {
                destinationSubsidiary = await searchSubsidiary(destinationSubsidiaryId);
            }
            if (transportDriverId) {
                transportDriver = await searchTransportDriver(transportDriverId);
            }
            if (transportKindId) {
                transportKind = await searchTransportKind(transportKindId);
            }
            let fridges = await searchAllFridges(req.body['cabinets']);

            let precedentPromises = [originAgency, originSubsidiary, destinationAgency, destinationSubsidiary, transportDriver, transportKind, fridges];

            Promise.all(precedentPromises)
                .then(async function () {
                    let date = new Date();
                    let date_string = date.toISOString();

                    // Create a entry base object.
                    entry = {
                        descripcion: req.body.descripcion,
                        fecha_hora: date_string,
                        tipo_entrada: entry_kind,
                        nombre_chofer: req.body.nombre_chofer,
                        persona: req.body.persona,
                        sucursal_origen: originSubsidiary,
                        udn_origen: originAgency,
                        sucursal_destino: destinationSubsidiary,
                        udn_destino: destinationAgency,
                        tipo_transporte: transportKind,
                        operador_transporte: transportDriver,
                        cabinets: fridges
                    };

                    let response = await writeEntry();
                    await createAllControl(response.ops[0]);
                    await updateFridges(entry);

                    context.res = {
                        status: 200,
                        body: response.ops[0],
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                    context.done();
                })
                .catch(function (error) {
                    context.res = error;
                    context.done();
                });

        }
        catch (error) {
            context.res = error;
            context.done();
        }

        //Internal functions
        function validate() {
            //Origin validation
            //No origin validation for salepoint entries

            //Destination validation        
            if (!destinationAgencyId && !destinationSubsidiaryId) {
                //at least one
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
            if (destinationAgencyId && destinationSubsidiaryId) {
                //not both
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

            //Cross origin and destination validation
            if ((originAgencyId && destinationAgencyId) || (originSubsidiaryId && destinationSubsidiaryId)) {
                //Needs to be from agency to subsidiary or from subsidiary to agency
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-060'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Fridge array validation
            if (!req.body.cabinets) {
                //No array
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
            if (req.body.cabinets.length === 0) {
                //Empty array
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

        }

        async function searchAgency(agencyId) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('agencies')
                        .findOne({ _id: mongodb.ObjectId(agencyId) },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                if (!docs) {
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-045'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                resolve(docs);
                            }
                        );
                }
                catch (error) {
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                }
            });
        }
        function searchAllFridges(fridgesId) {
            let fridgesIdArray = fridgesId.slice();
            return new Promise(async function (resolve, reject) {
                var fridgesInfoPromises = [];
                while (fridgesIdArray.length) {
                    fridgesInfoPromises.push(
                        searchFridge(
                            fridgesIdArray.pop()
                        )
                    );
                }
                try {
                    let fridgesArray = await Promise.all(fridgesInfoPromises);
                    resolve(fridgesArray);
                }
                catch (error) {
                    reject(error);
                }
            });
        }
        async function searchFridge(fridgeInventoryNumber) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('fridges')
                        .findOne({ economico: fridgeInventoryNumber },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                //Validations
                                if (!docs) {
                                    //Not found fridge
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-046'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
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
                                    //Agency validation overriden due to implementation
                                    //Fridge located in any subsidiary or agency
                                    //TODO: validate no agency in fridge, after implementation has been finished
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
                                    if (
                                        docs.estatus_unilever['code'] !== "0001"
                                        && docs.estatus_unilever['code'] !== "0011"
                                    ) {
                                        //Improper unilever status
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
                                if (docs.nuevo) {
                                    //New fridge
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-059'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                //Resolve correctly if all validations are passed        
                                resolve(docs);
                            }
                        );
                }
                catch (error) {
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                }
            });
        }
        async function searchSubsidiary(subsidiaryId) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('subsidiaries')
                        .findOne({ _id: mongodb.ObjectId(subsidiaryId) },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                if (!docs) {
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-043'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                resolve(docs);
                            }
                        );
                }
                catch (error) {
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                }
            });
        }
        function searchTransportDriver(transportDriverId) {
            return new Promise(async function (resolve, reject) {
                try {
                    var transportDriver = await axios.get(entries_departures + '/api/transport-driver?id=' + transportDriverId);
                    //Validations
                    if (!transportDriver.data) {
                        reject({
                            status: 400,
                            body: {
                                message: 'ES-049'
                            },
                            headers: {
                                'Content-Type': 'application / json'
                            }
                        });
                        return;
                    }
                    resolve(transportDriver.data);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });
        }
        function searchTransportKind(transportKindId) {
            return new Promise(async function (resolve, reject) {
                try {
                    var transportKind = await axios.get(entries_departures + '/api/transport-kind?id=' + transportKindId);
                    //Validations
                    if (!transportKind.data) {
                        reject({
                            status: 400,
                            body: {
                                message: 'ES-050'
                            },
                            headers: {
                                'Content-Type': 'application / json'
                            }
                        });
                        return;
                    }
                    resolve(transportKind.data);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });

        }
        async function searchUnileverStatus(code) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('unilevers')
                        .findOne({ code: code },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                if (!docs) {
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'MG-016'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                resolve(docs);
                            }
                        );
                }
                catch (error) {
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                }
            });
        }
        async function writeEntry() {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Entries')
                        .insertOne(entry, function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error,
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                                return;
                            }
                            resolve(docs);
                        });
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function createAllControl(entry) {
            return new Promise(async function (resolve, reject) {
                var fridgesControlPromises = [];
                for (var i = 0; i < entry.cabinets.length; i++) {
                    element = {
                        tipo_entrada: "Buen estado",
                        cabinet_id: entry.cabinets[i].economico,
                        entrada_id: entry['_id'],
                        impedimento_id: null,
                        servicio_id: null,
                        sucursal_id: destinationSubsidiaryId,
                        udn_id: destinationAgencyId
                    };
                    fridgesControlPromises.push(
                        createControl(element)
                    );
                }
                try {
                    let fridgesArray = await Promise.all(fridgesControlPromises);

                    resolve(fridgesArray);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function createControl(control) {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Control')
                        .insertOne(control, function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error,
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                                return;
                            }
                            if (!docs) {
                                reject({
                                    status: 500,
                                    body: 'Error at creating control  ',
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                            }
                            if (docs) {
                                resolve(docs);
                            }
                        });
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function updateFridges(entry) {
            let fridges = entry['cabinets'];
            let fridgesArray = fridges.slice();
            let unileverStatus = await searchUnileverStatus('0001');
            
            let newValues = {
                sucursal: null,
                udn: null,
                estatus_unilever: unileverStatus,
                fecha_ingreso: entry.fecha_hora
            };

            if (entry.sucursal_destino) {
                newValues.sucursal = entry['sucursal_destino'];
            }
            if (entry.udn_destino) {
                newValues.udn = entry['udn_destino'];

            }

            return new Promise(async function (resolve, reject) {
                var fridgesLocationPromises = [];
                while (fridgesArray.length) {
                    fridgesLocationPromises.push(
                        updateFridge(
                            newValues,
                            fridgesArray.pop()['_id']
                        )
                    );
                }
                try {
                    let updatedFridgesArray = await Promise.all(fridgesLocationPromises);
                    resolve(updatedFridgesArray);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function updateFridge(newValues, fridgeId) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('fridges')
                        .updateOne(
                            { _id: mongodb.ObjectId(fridgeId) },
                            { $set: newValues },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                resolve(docs);
                            }
                        );
                }
                catch (error) {
                    reject({

                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
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

    function createEntriesDeparturesClient() {
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

    function createMongoClient() {
        return new Promise(function (resolve, reject) {
            if (!management_client) {
                mongodb.MongoClient.connect(connection_Management, function (error, _management_client) {
                    if (error) {
                        reject(error);
                    }
                    management_client = _management_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }

};