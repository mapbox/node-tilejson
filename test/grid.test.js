var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var TileJSON = require('..');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

try { fs.unlink(__dirname + '/fixtures/grid.tilejson.cache'); } catch (err) {}


exports['test loading interactivity'] = function(beforeExit) {
    var completed = {};

    var source = new TileJSON('tilejson://' + __dirname + '/fixtures/grid.tilejson', function(err) {
        completed.load = true;
        if (err) throw err;

        source.getGrid(6, 29, 30, function(err, data, headers) {
            completed.tile_6_29_30_1 = true;
            assert.isNull(err);
            assert.equal('4b06ccac5efba3c4eaee3b29a1389fa0', md5(JSON.stringify(data)));
            assert.ok(headers['Content-Type']);
            assert.ok(headers['Last-Modified']);
            assert.ok(headers['ETag']);

            // Request the same again to test caching.
            source.getGrid(6, 29, 30, function(err, data, headers) {
                completed.tile_6_29_30_2 = true;
                assert.isNull(err);
                assert.equal('4b06ccac5efba3c4eaee3b29a1389fa0', md5(JSON.stringify(data)));
                assert.ok(headers['Content-Type']);
                assert.ok(headers['Last-Modified']);
                assert.ok(headers['ETag']);
                source._close();
            });
        });
    });

    beforeExit(function() {
        assert.deepEqual(completed, {
            load: true,
            tile_6_29_30_1: true,
            tile_6_29_30_2: true
        });
    });
};
