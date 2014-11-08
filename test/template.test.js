var tape = require('tape');
var TileJSON = require('..');

tape('templateToTileJSON', function(assert) {
    assert.throws(function() {
        TileJSON.templateToTileJSON({});
    });
    assert.equal(TileJSON.templateToTileJSON('not a url'), false, 'not url');
    assert.equal(TileJSON.templateToTileJSON('ftp://server'), false, 'not http/s');
    assert.equal(TileJSON.templateToTileJSON('http://www.example.com'), false, 'not zxy url');
    assert.equal(TileJSON.templateToTileJSON('http://www.example.com/{z}'), false, 'not zxy url');
    assert.deepEqual(TileJSON.templateToTileJSON('http://www.example.com/{z}/{x}/{y}.png'), {
        tilejson: '2.1.0',
        minzoom: 0,
        maxzoom: 22,
        center: [0,0,3],
        bounds: [-180,-85.0511,180,85.0511],
        geocoder_data: 'http://www.example.com',
        tiles: [ 'http://www.example.com/{z}/{x}/{y}.png' ]
    }, 'returns tilejson with templated url');
    assert.deepEqual(TileJSON.templateToTileJSON('http://www.example.com/{z}-{x}-{y}.png'), {
        tilejson: '2.1.0',
        minzoom: 0,
        maxzoom: 22,
        center: [0,0,3],
        bounds: [-180,-85.0511,180,85.0511],
        tiles: [ 'http://www.example.com/{z}-{x}-{y}.png' ]
    }, 'returns tilejson with templated url');
    assert.deepEqual(TileJSON.templateToTileJSON('http://www.example.com/{z}/{x}/{y}.grid.json'), {
        tilejson: '2.1.0',
        minzoom: 0,
        maxzoom: 22,
        center: [0,0,3],
        bounds: [-180,-85.0511,180,85.0511],
        grids: [ 'http://www.example.com/{z}/{x}/{y}.grid.json' ]
    }, 'returns tilejson with templated url');
    assert.deepEqual(TileJSON.templateToTileJSON('tilejson+http://www.example.com/{z}/{x}/{y}.png'), {
        tilejson: '2.1.0',
        minzoom: 0,
        maxzoom: 22,
        center: [0,0,3],
        bounds: [-180,-85.0511,180,85.0511],
        geocoder_data: 'http://www.example.com',
        tiles: [ 'http://www.example.com/{z}/{x}/{y}.png' ]
    }, 'tilejson+ works too');
    assert.end();
});

