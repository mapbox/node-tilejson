var path = require('path');
var fs = require('fs');
var url = require('url');
var get = require('get');
var retry = require('retry');
var EventEmitter = require('events').EventEmitter;
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
module.exports.get = get;
module.exports.agent = agent;
require('util').inherits(TileJSON, EventEmitter)
function TileJSON(uri, callback) {
    if (typeof callback !== 'function') throw new Error('callback required');
    if (typeof uri === 'string') uri = url.parse(uri, true);
    else if (typeof uri.query === 'string') uri.query = qs.parse(uri.query);

    if (!uri.pathname && !uri.data) {
        callback(new Error('Invalid URI ' + url.format(uri)));
        return;
    }

    if (uri.hostname === '.' || uri.hostname == '..') {
        uri.pathname = uri.hostname + uri.pathname;
        delete uri.hostname;
        delete uri.host;
    }
    if (uri.data) {
        this.data = uri.data;
    }
    uri.query = uri.query || {};

    var tilejson = this;
    var key = uri.data ? JSON.stringify(uri.data) : url.format(uri);
    var lock = Locking(key, function(err, data) {
        if (err) return callback(err);
        tilejson.data = data;
        tilejson.data.id = tilejson.data.id || path.basename(uri.pathname, path.extname(uri.pathname));
        tilejson.timeout = 'timeout' in uri.query ? parseInt(uri.query.timeout, 10) : 5000;
        tilejson.open = true;
        return callback(null, tilejson);
    });

    // Remote.
    if (/https?:/.test(uri.protocol)) return lock(function(callback) {
        tilejson.get(url.format(uri), function(err, buffer) {
            if (err && (err.status == 403 || err.status == 404))
                return callback(new Error('Tileset does not exist'));
            if (err)
                return callback(err);
            try { var data = JSON.parse(buffer); }
            catch(err) { return callback(err); }
            callback(null, data);
        });
    });

    // Direct data.
    if (uri.data) return lock(function(callback) {
        uri.data.id = uri.data.id || 'memory';
        callback(null, uri.data);
    });

    // Local file.
    if (uri.pathname) return lock(function(callback) {
        tilejson.filename = uri.pathname;
        fs.readFile(uri.pathname, 'utf8', function(err, buffer) {
            if (err) return callback(err);
            try { var data = JSON.parse(buffer); }
            catch(err) { return callback(err); }
            callback(null, data);
        });
    });

    return undefined;
}

TileJSON.prototype.close = function(callback) {
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
    this.get(url, function(err, data, headers) {
        if (err && (err.status === 404 || err.status === 403))
            err = new Error('Tile does not exist');
        if (err) return callback(err);

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
        .replace(/\{prefix\}/g, (x%16).toString(16) + (y%16).toString(16))
        .replace(/\{z\}/g, z)
        .replace(/\{x\}/g, x)
        .replace(/\{y\}/g, (this.data.scheme === 'tms') ? (1 << z) - 1 - y : y));
};

// z, x, y are XYZ coordinates.
TileJSON.prototype.getGrid = function(z, x, y, callback) {
    if (!this.data) return callback(new Error('Gridsource not loaded'));
    if (!this.data.grids) return callback(new Error('Grid does not exist'));

    var url = this._prepareURL(this.data.grids[0], z, x, y);
    this.get(url, function(err, grid, headers) {
        if (err && (err.status === 404 || err.status === 403))
            err = new Error('Grid does not exist');
        if (err) return callback(err);

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
        try {
            grid = grid.toString('utf8').replace(/^\s*\w+\s*\(|\)\s*;?\s*$/g, '');
            grid = JSON.parse(grid);
        } catch(err) {
            return callback(err);
        }
        return callback(null, grid, responseHeaders);
    });
};

// Wrapper around node-get. Returns URL as buffer.
// Abstracted out to allow others to override/wrap this functionality
// with additional caching, etc., if desired.
TileJSON.prototype.get = function(url, callback) {
    var tilejson = this;
    var operation = retry.operation({
        retries: 1
    });

    operation.attempt(function(current) {
        new get({
            uri: url,
            timeout: tilejson.timeout,
            headers: {Connection:'Keep-Alive'},
            agent: agent
        }).asBuffer(function(err, result, headers) {
            // Retry if status is missing or in the 5XX range.
            if (err && (!err.status || err.status >= 500)) {
                if (operation.retry(err)) return;
            }
            callback(err, result, headers);
        });
    });
};

// Helper for locking multiple requests for the same IO operations to a
// single IO call. Callbacks for the IO operation result in many listeners
// against the same operation.
var locks = {};
function Locking(id, many) {
    // Create a locking event emitter.
    if (!locks[id]) {
        locks[id] = new EventEmitter();
        locks[id].setMaxListeners(0);
    }

    // Register callback to be run once lock is released.
    locks[id].once('done', many);

    // Return a function that will run its callback IO operation only once.
    return function(once) {
        if (!locks[id].io) {
            locks[id].io = true;
            once(function(err, data) {
                var lock = locks[id];
                delete locks[id];
                lock.emit('done', err, data);
            });
        }
    };
};

TileJSON.Locking = Locking;

