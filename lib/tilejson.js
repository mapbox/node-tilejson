var path = require('path');
var fs = require('fs');

module.exports = TileJSON;
function TileJSON(uri, callback) {
    fs.readFile(uri.pathname, 'utf8', function(err, data) {
        if (err) return callback(err);
        try { data = JSON.parse(data); } catch(err) { return callback(err); }
        this.data = data;
        if (!data.id) data.id = path.basename(uri.pathname, '.tilejson');
        callback(null, this);
    }.bind(this));
}

TileJSON.list = function(filepath, callback) {
    filepath = path.resolve(filepath);
    fs.readdir(filepath, function(err, files) {
        if (err) return callback(err);
        for (var result = {}, i = 0; i < files.length; i++) {
            var name = files[i].match(/^([\w-]+)\.tilejson$/);
            if (name) result[name[1]] = 'tilejson://' + path.join(filepath, name[0]);
        }
        callback(null, result);
    });
};

TileJSON.findID = function(filepath, id, callback) {
    filepath = path.resolve(filepath);
    var file = path.join(filepath, id + '.tilejson');
    fs.stat(file, function(err, stats) {
        if (err) callback(err);
        else callback(null, 'tilejson://' + file);
    });
};

TileJSON.prototype.info = function(callback) {
    if (!this.data) callback(new Error('Tilesource not loaded.'));
    else callback(null, this.data);
};
