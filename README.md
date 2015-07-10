[![Build Status](https://secure.travis-ci.org/mapbox/node-tilejson.png)](http://travis-ci.org/mapbox/node-tilejson)
[![Build status](https://ci.appveyor.com/api/projects/status/725cer8r9bq7ltm2?svg=true)](https://ci.appveyor.com/project/Mapbox/node-tilejson)
[![Coverage Status](https://coveralls.io/repos/mapbox/node-tilejson/badge.svg?branch=master&service=github)](https://coveralls.io/github/mapbox/node-tilejson?branch=master)

# node-tilejson

A javascript implementation of https://github.com/mapbox/tilejson-spec

## install

```
npm install --save tilejson
```

## API

This module mainly provides an API for use by [tilelive](https://github.com/mapbox/tilelive.js):
it implements methods that allow fetching of tiles and metadata given a TileJSON
object.

Provides a metadata for online tile sources in json format.
