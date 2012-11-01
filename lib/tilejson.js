var path = require('path');
var fs = require('fs');
var url = require('url');
var get = require('get');
var Step = require('step');
var Agent = require('agentkeepalive');
var agent = new Agent({
    maxSockets: 128,
    maxKeepAliveRequests: 0,
    maxKeepAliveTime: 30000
});

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

var cache = {};

module.exports = TileJSON;
require('util').inherits(TileJSON, require('events').EventEmitter)
function TileJSON(uri, callback) {
    if (typeof callback !== 'function') throw new Error('callback required');
    if (typeof uri === 'string') uri = url.parse(uri, true);
    else if (typeof uri.query === 'string') uri.query = qs.parse(uri.query);

    if (!uri.pathname) {
        callback(new Error('Invalid URI ' + url.format(uri)));
        return;
    }

    if (uri.hostname === '.' || uri.hostname == '..') {
        uri.pathname = uri.hostname + uri.pathname;
        delete uri.hostname;
        delete uri.host;
    }
    uri.query = uri.query || {};

    var key = url.format(uri);
    if (!cache[key]) {
        cache[key] = this;
        this._open(uri);
    }

    var tilejson = cache[key];
    if (!tilejson.open) {
        tilejson.once('open', callback);
    } else {
        callback(null, tilejson);
    }
    return undefined;
}

TileJSON.prototype._open = function(uri) {
    var tilejson = this;
    function error(err) {
        process.nextTick(function() {
            tilejson.close();
            tilejson.emit('open', err);
        });
    }

    var key = url.format(uri);

    Step(function() {
        if (uri.protocol === 'http:' || uri.protocol === 'https:') {
            new get({
                uri: url.format(uri),
                headers: {Connection:'Keep-Alive'},
                agent: agent
            }).asString(this);
        } else {
            tilejson.filename = uri.pathname;
            fs.watchFile(uri.pathname, {persistent:false}, function(cur, prev) {
                // Make sure we throw away this object when the file changed.
                if (
                    cache[key] && // TODO verify that this isn't required and remove.
                    (cur.mtime.getTime() !== prev.mtime.getTime() || cur.size !== prev.size)
                ) {
                    cache[key].close();
                    delete cache[key];
                }
            });

            fs.readFile(uri.pathname, 'utf8', this);
        }
    }, function(err, data) {
        if (err) return error(err);
        data = data.replace(/^\s*\w+\s*\(\s*|\s*\)\s*;?\s*$/g, '');
        try { tilejson.data = JSON.parse(data); }
        catch(err) { return error(err); }

        if (!tilejson.data.id) {
            tilejson.data.id = path.basename(uri.pathname, path.extname(uri.pathname));
        }

        tilejson.timeout = 'timeout' in uri.query ? uri.query.timeout : 10000;
        tilejson.open = true;
        tilejson.emit('open', null, tilejson);
    });
}

TileJSON.prototype.close = function(callback) {
    if (this.filename) fs.unwatchFile(this.filename);
    if (callback) callback(null);
};

TileJSON.registerProtocols = function(tilelive) {
    tilelive.protocols['tilejson:'] = TileJSON;
};

TileJSON.list = function(filepath, callback) {
    filepath = path.resolve(filepath);
    fs.readdir(filepath, function(err, files) {
        if (err && err.code === 'ENOENT') return callback(null, {});
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
TileJSON.prototype.getTile = function(z, x, y, callback) {
    if (!this.data) return callback(new Error('Tilesource not loaded'));
    if (!this.data.tiles) return callback(new Error('Tile does not exist'));

    var url = this._prepareURL(this.data.tiles[0], z, x, y);
    new get({
        uri:url,
        timeout: this.timeout,
        headers: {Connection:'Keep-Alive'},
        agent: agent
    }).asBuffer(function(err, data, headers) {
        if (err) {
            return callback(err.status === 404 ? new Error('Tile does not exist') : err);
        }

        var modified = headers['last-modified'] ? new Date(headers['last-modified']) : new Date;
        var responseHeaders = {
            'Content-Type': getMimeType(data),
            'Last-Modified': modified,
            'ETag': headers['etag'] || (headers['content-length'] + '-' + +modified)
        };
        if (headers['cache-control']) {
            responseHeaders['Cache-Control'] = headers['cache-control'];
        }

        callback(null, data, responseHeaders);
    });
};

TileJSON.prototype._prepareURL = function(url, z, x, y) {
    return (url
        .replace(/\{z\}/g, z)
        .replace(/\{x\}/g, x)
        .replace(/\{y\}/g, (this.data.scheme === 'tms') ? (1 << z) - 1 - y : y));
};

// z, x, y are XYZ coordinates.
TileJSON.prototype.getGrid = function(z, x, y, callback) {
    if (!this.data) return callback(new Error('Gridsource not loaded'));
    if (!this.data.grids) return callback(new Error('Grid does not exist'));

    var url = this._prepareURL(this.data.grids[0], z, x, y);
    new get({
        uri:url,
        timeout: this.timeout,
        headers: {Connection:'Keep-Alive'},
        agent: agent
    }).asString(function(err, grid, headers) {
        if (err) return callback(new Error('Grid does not exist'));

        var modified = headers['last-modified'] ? new Date(headers['last-modified']) : new Date;
        var responseHeaders = {
            'Content-Type': 'application/json',
            'Last-Modified': modified,
            'ETag': headers['etag'] || (headers['content-length'] + '-' + +modified)
        };
        if (headers['cache-control']) {
            responseHeaders['Cache-Control'] = headers['cache-control'];
        }

        // TODO: compression
        grid = grid.replace(/^\s*\w+\s*\(|\)\s*;?\s*$/g, '');

        callback(null, JSON.parse(grid), responseHeaders);
    });
};

