var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var TileJSON = require('..');

var fixtures = {
    'world-bright': JSON.parse(fs.readFileSync(__dirname + '/fixtures/world-bright.tilejson')),
    'grid': JSON.parse(fs.readFileSync(__dirname + '/fixtures/grid.tilejson'))
};

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

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

describe('load file', function() {
    it('should load a tilejson file', function(done) {
        new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            source.getTile(0, 0, 0, function(err, data, headers) {
                assert.ifError(err);
                assert.ok('Cache-Control' in headers);
                assert.equal('943ca1495e3b6e8d84dab88227904190', md5(data));
                done();
            });
        });
    });

    it('should load a tilejson file with tilejson+file:', function(done) {
        new TileJSON('tilejson+file://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            done();
        });
    });

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

    it('should not attempt to load source from cache', function(done) {
         new TileJSON('tilejson://' + __dirname + '/fixtures/bad.tilejson', function(err, source) {
            assert.ok(err);
            assert.equal(err.type, 'unexpected_token');
            done();
        });
    });
});

describe('load http', function() {
    it('loads a tilejson file', function(done) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.world-bright.json', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            source.getTile(0, 0, 0, function(err, data, headers) {
                assert.ifError(err);
                assert.ok('Cache-Control' in headers);
                assert.equal('943ca1495e3b6e8d84dab88227904190', md5(data));
                done();
            });
        });
    });

    it('loads a tilejson file with tilejson+http:', function(done) {
        new TileJSON('tilejson+http://a.tiles.mapbox.com/v3/mapbox.world-bright.json', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            done();
        });
    });

    it('errors on 404', function(done) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.doesnotexist.json', function(err, source) {
            assert.equal('Tileset does not exist', err.message);
            done();
        });
    });

    it('errors on bad JSON', function(done) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.world-bright.jsonp', function(err, source) {
            assert.equal('Unexpected token g', err.message);
            done();
        });
    });
});


describe('load data', function() {
    it('loads directly from data', function(done) {
        new TileJSON({ data: fixtures['world-bright'] }, function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            source.getTile(0, 0, 0, function(err, data, headers) {
                assert.ifError(err);
                assert.ok('Cache-Control' in headers);
                assert.equal('943ca1495e3b6e8d84dab88227904190', md5(data));
                done();
            });
        });
    });
});

describe('locking IO', function() {
    it('avoids multiple IO calls', function(done) {
        var stats = {
            a: { once: 0, many: 0 },
            b: { once: 0, many: 0 }
        };
        var remaining = 10;
        for (var i = 0; i < 4; i++) {
            var lock = TileJSON.Locking('a', function(err, data) {
                stats.a.many++;
                assert.ifError(err);
                assert.ok(data);
                if (--remaining === 0) {
                    assert.equal(1, stats.a.once);
                    assert.equal(4, stats.a.many);
                    done();
                }
            });
            lock(function(callback) {
                stats.a.once++;
                fs.readFile(__dirname + '/fixtures/world-bright.tilejson', 'utf8', callback);
            });
        }
        for (var i = 0; i < 6; i++) {
            var lock = TileJSON.Locking('b', function(err, data) {
                stats.b.many++;
                assert.ifError(err);
                assert.ok(data);
                if (--remaining === 0) {
                    assert.equal(1, stats.b.once);
                    assert.equal(6, stats.b.many);
                    done();
                }
            });
            lock(function(callback) {
                stats.b.once++;
                fs.readFile(__dirname + '/fixtures/world-bright.tilejson', 'utf8', callback);
            });
        }
    });
    it('completes multiple callbacks', function(done) {
        var url = __dirname + '/fixtures/world-bright.tilejson';
        var stats = { once: 0, many: 0 };
        var remaining = 4;
        for (var i = 0; i < 4; i++) {
            var callback = function(err, data) {
                stats.many++;
                assert.ifError(err);
                if (--remaining === 0) {
                    assert.equal(4, stats.many);
                    done();
                }
            };
            var lock = TileJSON.Locking(url, function(err, data) {
                assert.ifError(err);
                assert.ok(data);
                return callback(null, data);
            });
            lock(function(callback) {
                stats.once++;
                fs.readFile(url, 'utf8', function(err, buffer) {
                    if (err) return callback(err);
                    try { var data = JSON.parse(buffer); }
                    catch(err) { return callback(err); }
                    callback(null, data)
                });
            });
        }
    });
    it('completes multiple callbacks asynchronously', function(done) {
        var url = __dirname + '/fixtures/world-bright.tilejson';
        var stats = { once: 0, many: 0 };
        var once = function(callback) {
            stats.once++;
            fs.readFile(url, 'utf8', function(err, buffer) {
                if (err) return callback(err);
                try { var data = JSON.parse(buffer); }
                catch(err) { return callback(err); }
                callback(null, data);
            });
        };
        var lock = function(callback) {
            return TileJSON.Locking(url, function(err, data) {
                stats.many++;
                assert.ifError(err);
                assert.ok(data);
                callback();
            })(once);
        };
        lock(function() {
            lock(function() {
                assert.equal(2, stats.many);
                done();
            });
        });
    });
});

describe('tiles', function() {
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

describe('grids', function() {
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

describe('tiles from bad server', function() {
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

describe('get retry', function() {
    var tilejson;
    var server;
    var connectionCount;

    beforeEach(function(done) {
        connectionCount = 0;
        new TileJSON('tilejson://' + __dirname + '/fixtures/invalid.tilejson?timeout=200', function(err, source) {
            tilejson = source;
            done(err);
        });
    });

    it('should retry on socket hangup', function(done) {
        function setupServer(callback) {
            server = http.createServer(function (req, res) {});
            server.on('connection', function(socket) {
                connectionCount++;
                socket.destroy();
            });
            server.listen(38923);
            callback();
        }

        (setupServer(function() {
            tilejson.getTile(2, 2, 2, function(err, data, headers) {
                assert.equal(err.code, 'ECONNRESET');
                assert.equal(connectionCount, 2);
                server.close();
                done();
            });
        }));
    });

    describe('http status', function(){
        before(function(done) {
            server = http.createServer(function (req, res) {
                connectionCount++;
                if (req.url === '/tiles/5/0/0.png') {
                    res.writeHead(500);
                } else  {
                    res.writeHead(400);
                }
                res.end();
            }).listen(38923, done);
        });

        it('500 should retry', function(done) {
            tilejson.getTile(5, 0, 0, function(err, data, headers) {
                assert.equal(err.status, 500);
                assert.equal(connectionCount, 2);
                done();
            });
        });

        it('400 should not retry', function(done) {
            tilejson.getTile(4, 0, 0, function(err, data, headers) {
                assert.equal(err.status, 400);
                assert.equal(connectionCount, 1);
                done();
            });
        });
    });
});
