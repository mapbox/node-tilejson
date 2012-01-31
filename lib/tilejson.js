var path = require('path');
var fs = require('fs');
var url = require('url');
var crypto = require('crypto');
var get = require('get');
var Step = require('step');
var sqlite3 = require('sqlite3');

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

function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

function getExpires(headers) {
    if (headers['expires']) {
        var expires = +new Date(headers['expires']);
    } else if (headers['cache-control']) {
        var expires = Date.now() + +'max-age=600'.replace('max-age=', '') * 1000;
    }
    return expires || (Date.now() + 3600 * 1000);
}

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
            clearInterval(tilejson._deleteInterval);
            tilejson.emit('open', err);
        });
    }

    var key = url.format(uri);
    this._deleteInterval = setInterval(this._deleteExpired.bind(this), 60000);

    Step(function() {
        if (uri.protocol === 'http:' || uri.protocol === 'https:') {
            new get(url.format(uri)).asString(this);
        } else {
            tilejson.filename = uri.pathname;
            fs.watchFile(uri.pathname, function(cur, prev) {
                // Make sure we throw away this object when the file changed.
                cache[key]._close();
                delete cache[key];
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

        // Create a file based anonymous database as cache..
        tilejson.cache = new sqlite3.Database('', this);
    }, function(err) {
        if (err) return error(err);
        fs.readFile(__dirname + '/schema.sql', 'utf8', this);
    }, function(err, schema) {
        if (err) return error(err);
        tilejson.cache.exec(schema, this);
    }, function(err) {
        if (err) return error(err);
        tilejson._getTile = tilejson.cache.prepare('SELECT data, headers FROM tile WHERE z = ? AND x = ? AND y = ? AND expires > ?');
        tilejson._putTile = tilejson.cache.prepare('REPLACE INTO tile (z, x, y, data, headers, expires) VALUES (?, ?, ?, ?, ?, ?)');
        tilejson._getGrid = tilejson.cache.prepare('SELECT data, headers FROM grid WHERE z = ? AND x = ? AND y = ? AND expires > ?');
        tilejson._putGrid = tilejson.cache.prepare('REPLACE INTO grid (z, x, y, data, headers, expires) VALUES (?, ?, ?, ?, ?, ?)');
        tilejson.open = true;
        tilejson.emit('open', null, tilejson);
    });
}

TileJSON.prototype._close = function() {
    if (this.filename) {
        fs.unwatchFile(this.filename);
        clearInterval(this._deleteInterval);
    }
};

TileJSON.prototype._deleteExpired = function() {
    this.cache.run('DELETE FROM tile WHERE expires <= ?', Date.now());
    this.cache.run('DELETE FROM grid WHERE expires <= ?', Date.now());
};

TileJSON.registerProtocols = function(tilelive) {
    tilelive.protocols['tilejson:'] = TileJSON;
};

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
    if (!this.data || !this.cache) callback(new Error('Tilesource not loaded'));
    else callback(null, this.data);
};

// z, x, y are XYZ coordinates.
TileJSON.prototype.getTile = function(z, x, y, callback) {
    if (!this.data || !this.cache) return callback(new Error('Tilesource not loaded'));
    if (!this.data.tiles) return callback(new Error('Tile does not exist'));

    var tilejson = this;
    tilejson._getTile.get(z, x, y, Date.now(), function(err, row) {
        if (err) return callback(err);
        if (row) return callback(null, row.data, JSON.parse(row.headers));

        // The tile wasn't found in the database or expired already.
        // Download it from the source.
        tilejson._downloadTile(z, x, y, callback);
    });
};

TileJSON.prototype._prepareURL = function(url, z, x, y) {
    return (url
        .replace(/\{z\}/g, z)
        .replace(/\{x\}/g, x)
        .replace(/\{y\}/g, (this.data.scheme === 'tms') ? (1 << z) - 1 - y : y));
};

TileJSON.prototype._downloadTile = function(z, x, y, callback) {
    var tilejson = this;

    var url = this._prepareURL(this.data.tiles[0], z, x, y);
    new get(url).asBuffer(function(err, data, headers) {
        if (err) return callback(new Error('Tile does not exist'));

        var expires = getExpires(headers);
        var modified = headers['last-modified'] ? new Date(headers['last-modified']) : new Date;
        var headers = {
            'Content-Type': getMimeType(data),
            'Last-Modified': modified,
            'ETag': headers['etag'] || (headers['content-length'] + '-' + +modified)
        };

        tilejson._putTile.run(z, x, y, data, JSON.stringify(headers), expires);
        callback(null, data, headers);
    });
};

// z, x, y are XYZ coordinates.
TileJSON.prototype.getGrid = function(z, x, y, callback) {
    if (!this.data || !this.cache) return callback(new Error('Gridsource not loaded'));
    if (!this.data.grids) return callback(new Error('Grid does not exist'));

    var tilejson = this;
    tilejson._getGrid.get(z, x, y, Date.now(), function(err, row) {
        if (err) return callback(err);
        if (row) return callback(null, JSON.parse(row.data), JSON.parse(row.headers));

        // The grid wasn't found in the database or expired already.
        // Download it from the source.
        tilejson._downloadGrid(z, x, y, callback);
    });
};

TileJSON.prototype._downloadGrid = function(z, x, y, callback) {
    var tilejson = this;

    var url = this._prepareURL(this.data.grids[0], z, x, y);
    new get(url).asString(function(err, grid, headers) {
        if (err) return callback(new Error('Grid does not exist'));

        var expires = getExpires(headers);
        var modified = headers['last-modified'] ? new Date(headers['last-modified']) : new Date;
        var headers = {
            'Content-Type': 'application/json',
            'Last-Modified': modified,
            'ETag': headers['etag'] || (headers['content-length'] + '-' + +modified)
        };

        // TODO: compression
        grid = grid.replace(/^\s*\w+\s*\(|\)\s*;?\s*$/g, '');

        tilejson._putGrid.run(z, x, y, grid, JSON.stringify(headers), expires);
        callback(null, JSON.parse(grid), headers);
    });
};
