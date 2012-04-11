var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var TileJSON = require('..');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function deleteCache(done) {
    fs.unlink(__dirname + '/fixtures/grid.tilejson.cache', function(err) {
        done(!err || err.code === 'ENOENT' ? null : err);
    });
}



before(deleteCache);
after(deleteCache);


var world_bright;
before(function(done) {
    new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
        world_bright = source;
        done(err);
    });
});
after(function(done) { world_bright.close(done); });

var grid_source;
before(function(done) {
    new TileJSON('tilejson://' + __dirname + '/fixtures/grid.tilejson', function(err, source) {
        grid_source = source;
        done(err);
    });
});
after(function(done) { grid_source.close(done); });


// -----------------------------------------------------------------------------


describe('loading tiles', function() {
    it('should load tile 0/0/0', function(done) {
        world_bright.getTile(0, 0, 0, function(err, data) {
            if (err) throw err;
            assert.equal('943ca1495e3b6e8d84dab88227904190', md5(data));
            done();
        });
    });

    it('should load tile 2/2/2', function(done) {
        world_bright.getTile(2, 2, 2, function(err, data) {
            if (err) throw err;
            assert.equal('84044cc921ee458cd1ece905e2682db0', md5(data));
            done();
        });
    });
});

describe('loading grids', function() {
    it('should fail for non-existent grid', function(done) {
        world_bright.getGrid(0, 0, 0, function(err, data) {
            assert.ok(err);
            assert.equal(err.message, 'Grid does not exist');
            done();
        });
    });

    it('should load grid 6/29/30', function(done) {
        grid_source.getGrid(6, 29, 30, function(err, data, headers) {
            if (err) throw err;
            assert.equal('4f8790dc72e204132531f1e12dea20a1', md5(JSON.stringify(data)));
            assert.ok('Content-Type' in headers);
            assert.ok('Last-Modified' in headers);
            assert.ok('ETag' in headers);
            done();
        });
    });
});


describe('loading tilejson files via HTTP', function() {
    var tilejson;

    it('should load a tilejson file', function(done) {
        new TileJSON('http://a.tiles.mapbox.com/mapbox/1.0.0/world-bright/layer.json', function(err, source) {
            tilejson = source;
            done(err);
        });
    });

    it('should load a tile from the specified tilejson source', function(done) {
        tilejson.getTile(0, 0, 0, function(err, data, headers) {
            if (err) throw err;
            assert.equal('max-age=14400', headers['Cache-Control']);
            assert.equal('943ca1495e3b6e8d84dab88227904190', md5(data));
            done();
        });
    });

    after(function(done) {
        if (tilejson) tilejson.close(done); else done();
    });
});


describe('loading bad tilejson files', function() {
    it('should return ENOENT for missing file', function(done) {
         new TileJSON('tilejson://' + __dirname + '/fixtures/enoent.tilejson', function(err, source) {
            assert.ok(err);
            assert.equal(err.code, 'ENOENT');
            done();
        });
    });

    it('should return parser error for invalid JSON', function(done) {
         new TileJSON('tilejson://' + __dirname + '/fixtures/bad.tilejson', function(err, source) {
            assert.ok(err);
            assert.equal(err.type, 'unexpected_token');
            done();
        });
    });
});


describe('loading tiles from bad server', function() {
    var tilejson;
    var server;

    before(function(done) {
        new TileJSON('tilejson://' + __dirname + '/fixtures/invalid.tilejson?timeout=200', function(err, source) {
            tilejson = source;
            done(err);
        });
    });

    before(function(done) {
        server = http.createServer(function (req, res) {
            if (req.url === '/tiles/1/0/0.png') {
                // Wait forever.
            } else  {
                res.writeHead(500);
                res.end();
            }
        }).listen(38923, done);
    });

    it('should load a tile from the specified tilejson source', function(done) {
        tilejson.getTile(0, 0, 0, function(err, data, headers) {
            assert.ok(err);
            assert.equal(err.message, 'Server returned HTTP 500');
            done();
        });
    });

    it('should abort when the server takes too long', function(done) {
        tilejson.getTile(1, 0, 0, function(err, data, headers) {
            assert.ok(err);
            assert.equal(err.message, 'Timed out after 200ms');
            done();
        });
    });

    after(function(done) {
        if (tilejson) tilejson.close(done); else done();
    });

    after(function() {
        server.close();
    });
});
