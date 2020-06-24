const mongodb = require('mongodb');
const axios = require('axios');
const entry_kind = "Punto de venta";
//db connections
let entries_departures_client = null;
let management_client = null;
const connection_EntriesDepartures = process.env["connection_EntriesDepartures"];
const connection_Management = process.env["connection_Management"];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];
const MANAGEMENT_DB_NAME = process.env['MANAGEMENT_DB_NAME'];
//URLS
const entries_departures = process.env["ENTRIES_DEPARTURES"];

module.exports = function (context, req) {
    switch (req.method) {
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

    //Create entry
    function POST_entry() {
        //TODO: Get person data trough userid and save it in the entry data
        var userId = req.body['persona'];
        var destinationAgencyId = req.body['udn_destino'];
        var destinationSubsidiaryId = req.body['sucursal_destino'];
        var transportDriverId = req.body['operador_transporte'];
        var transportKindId = req.body['tipo_transporte']; //Non mandatory

        validate();

        createEntry();
        async function createEntry() {
            try {
                let transportDriver, transportKind, destinationAgency, destinationSubsidiary;
                if (destinationAgencyId) {
                    destinationAgency = await searchAgency(agencyId);
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
                //Mandatory fields
                let fridges = await searchAllFridges(req.body['cabinets']);

                let precedentPromises = [transportDriver, transportKind, destinationAgency, destinationSubsidiary, fridges];

                Promise.all(precedentPromises)
                    .then(async function () {

                        var date = new Date();

                        // Create an entry base object.
                        entry = {
                            descripcion: req.body.descripcion,
                            fecha_hora: date,
                            tipo_entrada: entry_kind,
                            nombre_chofer: req.body.nombre_chofer,
                            persona: userId,
                            udn_destino: destinationAgency,
                            sucursal_destino: destinationSubsidiary,
                            operador_transporte: transportDriver,
                            tipo_transporte: transportKind,
                            cabinets: fridges
                        };
                        let response = await writeEntry(entry);
                        await updateFridges(fridges, entry)
                        //await writeFridgesControl(response.ops[0]);

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
                        context.res = {
                            status: 500,
                            body: error.toString(),
                            headers: {
                                "Content-Type": "application/json"
                            }
                        };
                        context.done();
                    });
            }
            catch (error) {
                context.res = {
                    status: 500,
                    body: error.toString(),
                    headers: {
                        "Content-Type": "application/json"
                    }
                };
                context.done();
            }
        }

        //Internal functions
        function validate() {
            //Destination validation
            if (destinationAgencyId && destinationSubsidiaryId) {
                //no both
                context.res = {
                    status: 400,
                    body: {
                        code: 'ES-001'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            if (!destinationAgencyId && !destinationSubsidiaryId) {
                //at least one
                context.res = {
                    status: 400,
                    body: {
                        code: 'ES-002'
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
                        code: 'ES-003' < z
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
                        code: 'ES-003'
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
                        code: 'ES-047'
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
                        code: 'ES-048'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }
            if (!userId) {
                context.res= {
                    status: 401,
                    body: {
                        message: 'The userId parameter is mandatory'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }
        }
        async function searchAgency(agencyId) {
            await createManagementClient();
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
                                        body: error.toString(),
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
                                            code: 'ES-045'
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
        async function searchSubsidiary(subsidiaryId) {
            await createManagementClient();
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
                                        body: error.toString(),
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
                                            code: 'ES-043'
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
            await createManagementClient();
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
                                        body: error.toString(),
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
                                            code: 'ES-046'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                if (docs['sucursal'] || docs['udn']) {
                                    //Not found fridge
                                    reject({
                                        status: 400,
                                        body: {
                                            code: 'ES-006'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                let validUnileverStatuses = ["0001", "0002", "0005", "0009", "0011"];
                                if (docs.estatus_unilever) {
                                    if (!validUnileverStatuses.includes(docs.estatus_unilever['code'])) {
                                        //Improper unilever status
                                        reject({
                                            status: 400,
                                            body: {
                                                code: 'ES-058'
                                            },
                                            headers: {
                                                'Content-Type': 'application / json'
                                            }
                                        });
                                        return;
                                    }
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
        async function searchUnileverStatus(code) {
            await createManagementClient();
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
                                        body: error.toString(),
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
                                            code: 'MG-016'
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
                                code: 'ES-049'
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
                        body: error.toString(),
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
                                code: 'ES-050'
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
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });

        }
        async function writeEntry(entry) {
            await createEntriesDeparturesClient();
            // Write the entry to the database.
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Entries')
                        .insertOne(entry,
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error.toString(),
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
                        body: error.toString(),
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function updateFridges(fridges, entry) {
            //Cloning the array
            let fridgesArray = fridges.slice();
            //let unlieverStatus = await searchUnileverStatus('0001');
            let newValues = {
                sucursal: null,
                udn: null,
                estatus_unilever: null,
                fecha_ingreso: entry.fecha_hora
            };
            if (entry['udn_destino']) {
                newValues.udn = entry['udn_destino'];
            }
            if (entry['sucursal_destino']) {
                newValues.sucursal = entry['sucursal_destino'];
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
                        body: error.toString(),
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function updateFridge(newValues, fridgeId) {
            await createManagementClient();
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
                                        body: error.toString(),
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
                        body: error.toString(),
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        function writeFridgesControl(entry) {
            return new Promise(function (resolve, reject) {
                var fridgesPromises = [];
                var fridgeArray = entry['cabinets'];
                var element;
                var subsidiaryId, agencyId;
                entry['sucursal'] ? subsidiaryId = ntry['sucursal']._id : subsidiaryId = null;
                entry['udn'] ? agencyId = entry['udn']._id : agencyId = null;
                for (var i = 0; i < fridgeArray.length; i++) {
                    element = {
                        tipo_entrada: entry_kind,
                        cabinet_id: fridgeArray[i].economico,
                        entrada_id: entry['_id'],
                        impedimento_id: null,
                        servicio_id: null,
                        sucursal_id: subsidiaryId,
                        udn_id: agencyId
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
                        reject({
                            status: 500,
                            body: error.toString(),
                            headers: {
                                'Content-Type': 'application / json'
                            }
                        });
                    });
            });
        }
        async function writeFridgeControl(element) {
            // Write the entry to the database.
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                management_client
                    .db(ENTRIES_DEPARTURES_DB_NAME)
                    .collection('Control')
                    .insertOne(element,
                        function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error.toString(),
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                            }
                            resolve(docs);
                        }
                    );
            });
        }
        //Fridge brand is referred as origin provider
        async function searchFridgeBrand(fridgeBrandId) {
            await createManagementClient();
            return new Promise(function (resolve, reject) {
                management_client
                    .db(MANAGEMENT_DB_NAME)
                    .collection('fridgebrands')
                    .findOne({ _id: mongodb.ObjectId(fridgeBrandId) },
                        function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error.toString(),
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                            }
                            if (!docs) {
                                reject({
                                    status: 400,
                                    body: { code: "ES-051" },
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                            }
                            resolve(docs);
                        }
                    );
            });
        }
    }

    //Internal global functions
    function createManagementClient() {
        return new Promise(function (resolve, reject) {
            if (!management_client) {
                mongodb.MongoClient.connect(connection_Management,
                    function (error, _management_client) {
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

    function createEntriesDeparturesClient() {
        return new Promise(function (resolve, reject) {
            if (!entries_departures_client) {
                mongodb.MongoClient.connect(connection_EntriesDepartures,
                    function (error, _management_client) {
                        if (error) {
                            reject(error);
                        }
                        entries_departures_client = _management_client;
                        resolve();
                    });
            }
            else {
                resolve();
            }
        });
    }


};