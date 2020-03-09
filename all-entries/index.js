const mongodb = require('mongodb');
//db connections
let entries_departures_client = null;
const connection_EntriesDepartures = process.env['connection_EntriesDepartures'];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];


module.exports = function (context, req) {
    switch (req.method) {
        case 'GET':
            GET_entries();
            break;
        default:
            notAllowed();
            break;
    }
    function notAllowed() {
        context.res = {
            status: 405,
            body: 'Method not allowed',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        context.done();
    }

    async function GET_entries() {
        var requestedID;
        //var requestedKind;
        var query;
        //Adding filters
        if (req.query) {
            requestedID = req.query['id'];
            if (req.query['tipo_entrada']) {
                if (!query) {
                    query = {};
                }
                query['tipo_entrada'] = req.query['tipo_entrada'];
            }
            if (req.query['economico']) {
                if (!query) {
                    query = {};
                }
                query['cabinets.economico'] = req.query['economico'];
            }
            if (req.query['fecha_inicio'] || req.query['fecha_fin']) {
                if (!query) {
                    query = {};
                }
                var fecha_hora;
                if (req.query['fecha_inicio']) {
                    if (!fecha_hora) {
                        fecha_hora = {};
                    }
                    fecha_hora['$gte'] = new Date(new Date(req.query['fecha_inicio']).setHours(00, 00, 00));
                }
                if (req.query['fecha_fin']) {
                    if (!fecha_hora) {
                        fecha_hora = {};
                    }
                    fecha_hora['$lte'] = new Date(new Date(req.query['fecha_fin']).setHours(23, 59, 59));
                }
                query['fecha_hora'] = fecha_hora;
            }
            if (req.query['sucursal']) {
                if (!query) {
                    query = {};
                }
                query['sucursal_destino._id'] = mongodb.ObjectId(req.query['sucursal']);
            }            
            if (req.query['udn']) {
                if (!query) {
                    query = {};
                }
                query['udn_destino._id'] = mongodb.ObjectId(req.query['udn']);
            }
        }
        if (requestedID) {
            //Get specific entry
            try {
                entry = await getEntry(requestedID);
                context.res = {
                    status: 200,
                    body: entry,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();

            }
            catch (error) {
                context.res = error;
                context.done();
            }
        }

        else {
            //Get entries list
            try {
                let entries = await getEntries(query);
                context.res = {
                    body: entries,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
            catch (error) {
                context.res = error;
                context.done();
            }
        }
        async function getEntry(entryId) {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                entries_departures_client
                    .db(ENTRIES_DEPARTURES_DB_NAME)
                    .collection('Entries')
                    .findOne({ _id: mongodb.ObjectId(entryId) },
                        function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error.toString(),
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                });
                            }
                            resolve(docs);
                        }
                    );
            });
        }

        async function getEntries(query) {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                entries_departures_client
                    .db(ENTRIES_DEPARTURES_DB_NAME)
                    .collection('Entries')
                    .find(query)
                    .sort({ fecha_hora: -1 })
                    .toArray(function (error, docs) {
                        if (error) {
                            reject({
                                status: 500,
                                body: error.toString(),
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });
                        }
                        resolve(docs)
                    });
            });
        }
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

};
