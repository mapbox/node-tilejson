var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var TileJSON = require('..');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

try { fs.unlink(__dirname + '/fixtures/mapquest.tilejson.cache'); } catch (err) {}

exports['test async calling'] = function(beforeExit) {
    var completed = false;
    new TileJSON('tilejson://' + __dirname + '/fixtures/mapquest.tilejson', function(err, source) {
        if (err) throw err;
        source.getTile(0, 0, 0, function(err, data) {
            completed = true;
            if (err) throw err;
            // Note: This may break when MapQuest changes their tiles.
            assert.equal('65257724699b3d97ac33242ab3030130', md5(data));
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    });
};
