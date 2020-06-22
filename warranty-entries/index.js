const mongodb = require('mongodb');
const axios = require('axios');
const entry_kind = "Garantías";
//db connections
let db_client = null;
const connection = process.env["connection"];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];
const MANAGEMENT_DB_NAME = process.env['MANAGEMENT_DB_NAME'];
const TECHNICAL_SERVICE_DB_NAME = process.env['TECHNICAL_SERVICE_DB_NAME'];

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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Entries')
                        .find(query)
                        .sort({ fecha_hora: -1 })
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
        var destinationSubsidiaryId = req.body['sucursal_destino'];
        var originAgencyId = req.body['udn_origen'];
        var transportDriverId = req.body['operador_transporte'];
        var transportKindId = req.body['tipo_transporte']; //Non mandatory
        let date = new Date();

        validate();

        try {
            await createDatabaseClient();

            let originAgency,
                destinationSubsidiary,
                transportDriver,
                transportKind;
            if (originAgencyId) {
                originAgency = await searchAgency(originAgencyId);
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

            let precedentPromises = [originAgency, destinationSubsidiary, transportDriver, transportKind, fridges];

            Promise.all(precedentPromises)
                .then(async function () {

                    // Create a entry base object.
                    entry = {
                        descripcion: req.body.descripcion,
                        fecha_hora: date,
                        tipo_entrada: entry_kind,
                        nombre_chofer: req.body.nombre_chofer,
                        persona: req.body.persona,
                        udn_origen: originAgency,
                        sucursal_destino: destinationSubsidiary,
                        tipo_transporte: transportKind,
                        operador_transporte: transportDriver,
                        cabinets: fridges
                    };

                    let response = await writeEntry();
                    await updateFridges(entry);
                    let createdEntry = response.ops[0];
                    let services = await createServices(fridges, createdEntry._id);

                    if (services) {
                        context.res = {
                            status: 201,
                            body: createdEntry,
                            headers: {
                                "Content-Type": "application/json"
                            }
                        }
                        context.done();
                    }
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
            if (!originAgencyId) {
                //at least one
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-009'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }
            //Destination validation
            if (!destinationSubsidiaryId) {
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-013'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Fridge array validation
            if (!req.body.cabinets) {
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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('fridges')
                        .findOne({ economico: fridgeInventoryNumber },
                            {
                                _id: 1,
                                economico: 1,
                                no_serie: 1,
                                modelo: 1,
                                sucursal: 1,
                                udn: 1,
                                estatus_unilever: 1
                            },
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
                                let validUnileverStatuses = ["0001", "0003", "0007", "0010", "0011", "0012"];
                                if (docs.estatus_unilever) {
                                    if (!validUnileverStatuses.includes(docs.estatus_unilever['code'])) {
                                        //Improper unilever status
                                        err = {
                                            status: 400,
                                            body: {
                                                message: 'ES-057'
                                            },
                                            headers: {
                                                'Content-Type': 'application / json'
                                            }
                                        };
                                        reject(err);
                                        return;
                                    }
                                }
                                // if (docs.nuevo) {
                                //     //New fridge
                                //     reject({
                                //         status: 400,
                                //         body: {
                                //             message: 'ES-059'
                                //         },
                                //         headers: {
                                //             'Content-Type': 'application / json'
                                //         }
                                //     });
                                //     return;
                                // }
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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
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
        async function updateFridges(entry) {
            let fridges = entry['cabinets'];
            let fridgesArray = fridges.slice();
            let unileverStatus = await searchUnileverStatus('0003');

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
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
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
        async function createServices(fridges, entryId) {
            return new Promise(async function (resolve, reject) {
                try {
                    await createDatabaseClient();
                    //Initial service creation based on subsidiary workflow
                    let query;
                    query = { subsidiary: mongodb.ObjectId(destinationSubsidiaryId) };
                    let workflow = await searchWorkflow(query);
                    if (workflow) {
                        //Just create services if subsidiary has a workflow
                        let initialStage = await searchStage(workflow.initial);
                        let stages = [
                            {
                                stage: initialStage
                            }
                        ];
                        let servicesArray = [];
                        fridges.forEach(function (fridge) {
                            let service = {
                                fridge: fridge,
                                endDate: null,
                                startDate: date,
                                entry: entryId,
                                changes: [],
                                stages: stages,
                                departure: null,
                                actualFlow: null
                            };
                            service.stages.push();
                            servicesArray.push(service);
                        });
                        db_client
                            .db(TECHNICAL_SERVICE_DB_NAME)
                            .collection('Service')
                            .insertMany(servicesArray, function (error, docs) {
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
                    else {
                        resolve(null);
                    }
                }
                catch (error) {
                    context.log(error);
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
        async function searchWorkflow(query) {
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
                        .db(TECHNICAL_SERVICE_DB_NAME)
                        .collection('Workflow')
                        .findOne(query,
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
                                    resolve(null);
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
        async function searchStage(stageId) {
            await createDatabaseClient();
            return new Promise(function (resolve, reject) {
                try {
                    db_client
                        .db(TECHNICAL_SERVICE_DB_NAME)
                        .collection('Stage')
                        .findOne({ _id: mongodb.ObjectId(stageId) },
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
                                    resolve(null);
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
    }


    function createDatabaseClient() {
        return new Promise(function (resolve, reject) {
            if (!db_client) {
                mongodb.MongoClient.connect(connection, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true
                }, function (error, _db_client) {
                    if (error) {
                        reject(error);
                    }
                    db_client = _db_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }

};