module.exports = function (context, req) {

    //Create entry
    if (req.method === "POST") {
        var entry = context.bindings.entry;
        if (entry) {
            context.res = {
                status: 422,
                body: "Entry already exists.",
                headers: {
                    'Content-Type': 'application/json'
                }
            };
        }
        else {
            var date = new Date();
            var date_string = date.toISOString();
            // Create a JSON string.
            var entryString = JSON.stringify({
                id: req.body.id,
                fecha_hora: date_string,
                tipo_entrada: "Punto de Venta"
            });

            // Write the entry to the database.
            context.bindings.newEntry = entryString;

            // Push this bookmark onto our queue for further processing.
            //context.bindings.newmessage = bookmarkString;

            // Tell the user all is well.
            context.res = {
                status: 200,
                body: entryString,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
        }
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
            var entry = context.bindings.entry;
            context.res = {
                status: 200,
                body: entry,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
        }
        else {
            var entries = context.bindings.entries;
            context.res = {
                status: 200,
                body: entries,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
        }
        context.done();
    }
};