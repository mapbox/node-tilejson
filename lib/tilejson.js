var path = require('path');
var fs = require('fs');
var url = require('url');
var get = require('get');

function getMimeType(data) {
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E &&
        data[3] === 0x47 && data[4] === 0x0D && data[5] === 0x0A &&
        data[6] === 0x1A && data[7] === 0x0A) {
        return 'image/png';
    } else if (data[0] === 0xFF && data[1] === 0xD8 &&
        data[data.length - 2] === 0xFF && data[data.length - 1] === 0xD9) {
        return 'image/jpeg';
    } else if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 &&
        data[3] === 0x38 && (data[4] === 0x39 || data[4] === 0x37) &&
        data[5] === 0x61) {
        return 'image/gif';
    }
};

module.exports = TileJSON;
function TileJSON(uri, callback) {
    if (typeof uri === 'string') uri = url.parse(uri);

    if (uri.protocol === 'tilejson:') {
        fs.readFile(uri.pathname, 'utf8', loaded.bind(this));
    } else {
        throw new Error('TODO: implement other protocols')
    }

    function loaded(err, data) {
        if (err) return callback(err);
        try { data = JSON.parse(data); } catch(err) { return callback(err); }
        this.data = data;
        if (!data.id) data.id = path.basename(uri.pathname, '.tilejson');
        callback(null, this);
    };
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

TileJSON.prototype.getInfo = function(callback) {
    if (!this.data) callback(new Error('Tilesource not loaded'));
    else callback(null, this.data);
};

// z, x, y are XYZ coordinates.
// TODO: caching
TileJSON.prototype.getTile = function(z, x, y, callback) {
    if (!this.data) return callback(new Error('Tilesource not loaded'));

    // Flip Y coordinate.
    if (this.data.scheme === 'tms') {
        y = Math.pow(2, z) - 1 - y;
    }

    var url = this.data.tiles[0]
        .replace(/\$\{z\}/g, z)
        .replace(/\$\{x\}/g, x)
        .replace(/\$\{y\}/g, y);

    new get(url).asBuffer(function(err, data, headers) {
        if (err) return callback(err);
        var modified = headers['last-modified'] ? new Date(headers['last-modified']) : new Date;
        var options = {
            'Content-Type': getMimeType(data),
            'Last-Modified': modified,
            'ETag': headers['etag'] || (headers['content-length'] + '-' + +modified)
        };
        callback(null, data, options);
    });
};

// z, x, y are XYZ coordinates.
// TODO: caching
TileJSON.prototype.getGrid = function(z, x, y, callback) {
    if (!this.data) return callback(new Error('Tilesource not loaded'));
    if (!this.data.grids) return callback(new Error('Grid does not exist'));

    // Flip Y coordinate.
    if (this.data.scheme === 'tms') {
        y = Math.pow(2, z) - 1 - y;
    }

    var url = this.data.tiles[0]
        .replace(/\$\{z\}/g, z)
        .replace(/\$\{x\}/g, x)
        .replace(/\$\{y\}/g, y);

    new get(url).asBuffer(callback);
};
