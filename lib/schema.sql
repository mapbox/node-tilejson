CREATE TABLE IF NOT EXISTS tile (
    z INT,
    x INT,
    y INT,
    data BLOB,
    headers VARCHAR,
    expires INT
);

CREATE UNIQUE INDEX IF NOT EXISTS tile_idx ON tile (z, x, y);


CREATE TABLE IF NOT EXISTS grid (
    z INT,
    x INT,
    y INT,
    data BLOB,
    headers VARCHAR,
    expires INT
);

CREATE UNIQUE INDEX IF NOT EXISTS grid_idx ON grid (z, x, y);
