module.exports = function (context, req) {

    var entries = context.bindings.entriesList;
    if(entries){
            context.res = {
            status: 422,
            body : "Entry already exists.",
            headers: {
            'Content-Type': 'application/json'
            }
        };
    }
    else {
        
        // Create a JSON string.
        var entryString = JSON.stringify({ 
            id: req.body.id,
            fecha_hora: Date.now(),
            tipo_entrada:"Nuevos"
        });

        // Write the entry to the database.
        context.bindings.newEntry = entryString;

        // Push this bookmark onto our queue for further processing.
        //context.bindings.newmessage = bookmarkString;

        // Tell the user all is well.
        context.res = {
            status: 200,
            body : "Entry added!",
            headers: {
            'Content-Type': 'application/json'
            }
        };
    }
    context.done();
};