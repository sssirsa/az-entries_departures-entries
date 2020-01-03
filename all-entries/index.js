module.exports = function (context, req) {

    if (req.method === "GET") {
        var requestedID;
        var requestedKind;
        if (req.query) {
            requestedID = req.query["id"];
            requestedKind = req.query["tipo_entrada"];
        }
        if (requestedID) {
            //Get speciic entry
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
            //Get entries list
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
    else {
        context.res = {
            status: 405,
            body: "Method not allowed",
            headers: {
                'Content-Type': 'application/json'
            }
        };
        context.done();
    }
};