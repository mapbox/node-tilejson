var tape = require('tape');
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
var world_bright_ssl;
var grid_source;

tape('setup', function(assert) {
    new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
        world_bright = source;
        assert.ifError(err);
        assert.end();
    });
});
tape('setup', function(assert) {
    new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright-ssl.tilejson', function(err, source) {
        world_bright_ssl = source;
        assert.ifError(err);
        assert.end();
    });
});
tape('setup', function(assert) {
    new TileJSON('tilejson://' + __dirname + '/fixtures/grid.tilejson', function(err, source) {
        grid_source = source;
        assert.ifError(err);
        assert.end();
    });
});

tape('list', function(assert) {
    TileJSON.list(__dirname + '/fixtures', function(err, list) {
        assert.ifError(err);
        assert.deepEqual(Object.keys(list), ['bad', 'grid', 'invalid', 'world-bright-ssl', 'world-bright']);
        assert.end();
    });
});

tape('findID', function(assert) {
    TileJSON.findID(__dirname + '/fixtures', 'world-bright', function(err, uri) {
        assert.ifError(err);
        assert.equal(/^tilejson:/.test(uri), true);
        assert.end();
    });
});

(function() {
    function checkTile(source, assert) {
        source.getTile(0, 0, 0, function(err, data, headers) {
            assert.ifError(err);
            assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
            assert.equal('image/png', headers['Content-Type']);
            assert.equal('string', typeof headers['ETag']);
            assert.equal('string', typeof headers['Cache-Control']);
            assert.equal('f4dc90257d0cfe350f8875f0db57cb77', md5(data));
            assert.end();
        });
    }

    tape('loads directly from data', function(assert) {
        new TileJSON({ data: fixtures['world-bright'] }, function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            checkTile(source, assert);
        });
    });

    tape('loads a tilejson file', function(assert) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.world-bright.json', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            checkTile(source, assert);
        });
    });

    tape('loads a tilejson file with tilejson+http:', function(assert) {
        new TileJSON('tilejson+http://a.tiles.mapbox.com/v3/mapbox.world-bright.json', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            checkTile(source, assert);
        });
    });

    tape('errors on 404', function(assert) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.doesnotexist.json', function(err, source) {
            assert.equal('Tileset does not exist', err.message);
            assert.end();
        });
    });

    tape('errors on bad JSON', function(assert) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.world-bright.jsonp', function(err, source) {
            assert.ok(err.message === 'Unexpected token g' || err.message === 'Unexpected token g in JSON at position 0');
            assert.end();
        });
    });

    tape('should load a tilejson file', function(assert) {
        new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            checkTile(source, assert);
        });
    });

    tape('should load a tilejson file with tilejson+file:', function(assert) {
        new TileJSON('tilejson+file://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            checkTile(source, assert);
        });
    });

    tape('should return ENOENT for missing file', function(assert) {
         new TileJSON('tilejson://' + __dirname + '/fixtures/enoent.tilejson', function(err, source) {
            assert.ok(err);
            assert.equal(err.code, 'ENOENT');
            assert.end();
        });
    });

    tape('should return parser error for invalid JSON', function(assert) {
         new TileJSON('tilejson://' + __dirname + '/fixtures/bad.tilejson', function(err, source) {
            assert.ok(err);
            assert.ok(err instanceof SyntaxError);
            assert.end();
        });
    });

    tape('should not attempt to load source from cache', function(assert) {
         new TileJSON('tilejson://' + __dirname + '/fixtures/bad.tilejson', function(err, source) {
            assert.ok(err);
            assert.ok(err instanceof SyntaxError);
            assert.end();
        });
    });

    tape('should load a templated source from an http tiles url', function(assert) {
        new TileJSON('http://a.tiles.mapbox.com/v3/mapbox.world-bright/{z}/{x}/{y}.png', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            assert.deepEqual(source.data.tiles, [
                'http://a.tiles.mapbox.com/v3/mapbox.world-bright/{z}/{x}/{y}.png'
            ]);
            checkTile(source, assert);
        });
    });

    tape('should load a templated source from an tilejson+http tiles url', function(assert) {
        new TileJSON('tilejson+http://a.tiles.mapbox.com/v3/mapbox.world-bright/{z}/{x}/{y}.png', function(err, source) {
            assert.ifError(err);
            assert.ok(source.data);
            assert.deepEqual(source.data.tiles, [
                'http://a.tiles.mapbox.com/v3/mapbox.world-bright/{z}/{x}/{y}.png'
            ]);
            checkTile(source, assert);
        });
    });
})();

(function() {
    tape('avoids multiple IO calls', function(assert) {
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
                    assert.end();
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
                    assert.end();
                }
            });
            lock(function(callback) {
                stats.b.once++;
                fs.readFile(__dirname + '/fixtures/world-bright.tilejson', 'utf8', callback);
            });
        }
    });
    tape('completes multiple callbacks', function(assert) {
        var url = __dirname + '/fixtures/world-bright.tilejson';
        var stats = { once: 0, many: 0 };
        var remaining = 4;
        for (var i = 0; i < 4; i++) {
            var callback = function(err, data) {
                stats.many++;
                assert.ifError(err);
                if (--remaining === 0) {
                    assert.equal(4, stats.many);
                    assert.end();
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
    tape('completes multiple callbacks asynchronously', function(assert) {
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
                assert.end();
            });
        });
    });
})();

(function() {
    tape('should load tile 0/0/0', function(assert) {
        world_bright.getTile(0, 0, 0, function(err, data, headers) {
            if (err) throw err;
            assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
            assert.equal('image/png', headers['Content-Type']);
            assert.equal('string', typeof headers['ETag']);
            assert.equal('string', typeof headers['Cache-Control']);
            assert.equal('f4dc90257d0cfe350f8875f0db57cb77', md5(data));
            assert.end();
        });
    });

    tape('should load tile 2/2/2', function(assert) {
        world_bright.getTile(2, 2, 2, function(err, data, headers) {
            if (err) throw err;
            assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
            assert.equal('image/png', headers['Content-Type']);
            assert.equal('string', typeof headers['ETag']);
            assert.equal('string', typeof headers['Cache-Control']);
            assert.equal('548bad4a8a01a3c22f866f0f6c8d562e', md5(data));
            assert.end();
        });
    });

    tape('https should load tile 0/0/0', function(assert) {
        world_bright_ssl.getTile(0, 0, 0, function(err, data, headers) {
            if (err) throw err;
            assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
            assert.equal('image/png', headers['Content-Type']);
            assert.equal('string', typeof headers['ETag']);
            assert.equal('string', typeof headers['Cache-Control']);
            assert.equal('f4dc90257d0cfe350f8875f0db57cb77', md5(data));
            assert.end();
        });
    });

    tape('https should load tile 2/2/2', function(assert) {
        world_bright_ssl.getTile(2, 2, 2, function(err, data, headers) {
            if (err) throw err;
            assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
            assert.equal('image/png', headers['Content-Type']);
            assert.equal('string', typeof headers['ETag']);
            assert.equal('string', typeof headers['Cache-Control']);
            assert.equal('548bad4a8a01a3c22f866f0f6c8d562e', md5(data));
            assert.end();
        });
    });
})();

(function() {
    tape('should fail for non-existent grid', function(assert) {
        world_bright.getGrid(0, 0, 0, function(err, data) {
            assert.ok(err);
            assert.equal(err.message, 'Grid does not exist');
            assert.end();
        });
    });

    tape('should load grid 6/29/30', function(assert) {
        grid_source.getGrid(6, 29, 30, function(err, data, headers) {
            if (err) throw err;
            assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
            assert.equal('application/json', headers['Content-Type']);
            assert.equal('string', typeof headers['ETag']);
            assert.equal('string', typeof headers['Cache-Control']);
            assert.equal('4f8790dc72e204132531f1e12dea20a1', md5(JSON.stringify(data)));
            assert.end();
        });
    });

    tape('should set scheme as xyz', function(assert) {
        grid_source.getInfo(function(err, info) {
            if (err) throw err;
            assert.equal('xyz', info.scheme);
            assert.end();
        });
    });
})();

(function() {
    var tilejson;
    var server;

    tape('setup', function(assert) {
        new TileJSON('tilejson://' + __dirname + '/fixtures/invalid.tilejson?timeout=200', function(err, source) {
            tilejson = source;
            assert.ifError(err);
            assert.end();
        });
    });

    tape('setup', function(assert) {
        server = http.createServer(function (req, res) {
            if (req.url === '/tiles/1/0/0.png') {
                // Wait forever.
            } else  {
                res.writeHead(500);
                res.end();
            }
        }).listen(38923, assert.end);
    });

    tape('should load a tile from the specified tilejson source', function(assert) {
        tilejson.getTile(0, 0, 0, function(err, data, headers) {
            assert.ok(err);
            assert.equal(err.message, 'Server returned HTTP 500');
            assert.end();
        });
    });

    tape('should abort when the server takes too long', function(assert) {
        tilejson.getTile(1, 0, 0, function(err, data, headers) {
            assert.ok(err);
            assert.equal(err.message, 'ETIMEDOUT');
            assert.end();
        });
    });

    tape('cleanup', function(assert) {
        server.close(assert.end);
    });
})();

(function() {
    var tilejson;
    var server;

    tape('setup', function(assert) {
        new TileJSON('tilejson://' + __dirname + '/fixtures/invalid.tilejson?timeout=200', function(err, source) {
            assert.ifError(err);
            tilejson = source;
            assert.end();
        });
    });

    tape('should retry on socket hangup', function(assert) {
        var connectionCount = 0;

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
                server.close(assert.end);
            });
        }));
    });

    tape('500 should retry', function(assert) {
        var connectionCount = 0;

        function setupServer(callback) {
            server = http.createServer(function (req, res) {
                connectionCount++;
                if (req.url === '/tiles/5/0/0.png') {
                    res.writeHead(500);
                } else  {
                    res.writeHead(400);
                }
                res.end();
            }).listen(38923, callback);
        }
        setupServer(function() {
            tilejson.getTile(5, 0, 0, function(err, data, headers) {
                assert.equal(err.statusCode, 500);
                assert.equal(connectionCount, 2);
                server.close(assert.end);
            });
        });
    });

    tape('400 should not retry', function(assert) {
        var connectionCount = 0;

        function setupServer(callback) {
            server = http.createServer(function (req, res) {
                connectionCount++;
                if (req.url === '/tiles/5/0/0.png') {
                    res.writeHead(500);
                } else  {
                    res.writeHead(400);
                }
                res.end();
            }).listen(38923, callback);
        }
        setupServer(function() {
            tilejson.getTile(4, 0, 0, function(err, data, headers) {
                assert.equal(err.statusCode, 400);
                assert.equal(connectionCount, 1);
                server.close(assert.end);
            });
        });
    });
})();

