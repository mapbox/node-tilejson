var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var TileJSON = require('..');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

exports['test loading tile'] = function(beforeExit) {
    var completed = {};

    new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
        completed.load = true;
        if (err) throw err;

        source.getTile(0, 0, 0, function(err, data) {
            completed.tile_0_0_0 = true;
            if (err) throw err;
            assert.equal('943ca1495e3b6e8d84dab88227904190', md5(data));
        });

        source.getTile(2, 2, 2, function(err, data) {
            completed.tile_2_2_2 = true;
            if (err) throw err;
            assert.equal('84044cc921ee458cd1ece905e2682db0', md5(data));
            source._close();
        });
    });

    beforeExit(function() {
        assert.deepEqual(completed, {
            load: true,
            tile_0_0_0: true,
            tile_2_2_2: true
        });
    });
};


exports['test loading interactivity'] = function(beforeExit) {
    var completed = {};

    new TileJSON('tilejson://' + __dirname + '/fixtures/world-bright.tilejson', function(err, source) {
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
