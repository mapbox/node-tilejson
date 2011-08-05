var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var TileJSON = require('..');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

try { fs.unlink(__dirname + '/fixtures/mapquest.tilejson.cache'); } catch (err) {}

exports['test loading tile'] = function(beforeExit) {
    var completed = {};

    new TileJSON('tilejson://' + __dirname + '/fixtures/mapquest.tilejson', function(err, source) {
        completed.load = true;
        if (err) throw err;

        source.getTile(0, 0, 0, function(err, data) {
            completed.tile_0_0_0 = true;
            if (err) throw err;
            // Note: This may break when MapQuest changes their tiles.
            assert.equal('65257724699b3d97ac33242ab3030130', md5(data));
        });

        source.getTile(2, 0, 2, function(err, data) {
            completed.tile_2_0_2 = true;
            if (err) throw err;
            fs.writeFileSync('foo.png', data);
            // Note: This may break when MapQuest changes their tiles.
            assert.equal('9fd9db987fde0b36aee4548dbb3e0097', md5(data));
            source._close();
        });
    });

    beforeExit(function() {
        assert.deepEqual(completed, {
            load: true,
            tile_0_0_0: true,
            tile_2_0_2: true
        });
    });
};


exports['test loading interactivity'] = function(beforeExit) {
    var completed = {};

    new TileJSON('tilejson://' + __dirname + '/fixtures/mapquest.tilejson', function(err, source) {
        completed.load = true;
        if (err) throw err;

        source.getGrid(0, 0, 0, function(err, data) {
            completed.tile_0_0_0 = true;
            assert.ok(err);
            assert.equal(err.message, 'Grid does not exist');
            source._close();
        });
    });

    beforeExit(function() {
        assert.deepEqual(completed, {
            load: true,
            tile_0_0_0: true
        });
    });
};
