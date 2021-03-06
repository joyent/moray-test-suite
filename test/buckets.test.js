/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

var jsprim = require('jsprim');
var tape = require('tape');
var uuid = require('libuuid').create;
var vasync = require('vasync');
var VError = require('verror');

var helper = require('./helper.js');



///--- Globals

var FULL_CFG = {
    index: {
        str: {
            type: 'string'
        },
        str_u: {
            type: 'string',
            unique: true
        },
        num: {
            type: 'number'
        },
        num_u: {
            type: 'number',
            unique: true
        },
        numr: {
            type: 'numrange'
        },
        numr_u: {
            type: 'numrange',
            unique: true
        },
        bool: {
            type: 'boolean'
        },
        bool_u: {
            type: 'boolean',
            unique: true
        },
        date: {
            type: 'date'
        },
        date_u: {
            type: 'date',
            unique: true
        },
        daterange: {
            type: 'daterange'
        },
        daterange_u: {
            type: 'daterange',
            unique: true
        },
        ip: {
            type: 'ip'
        },
        ip_u: {
            type: 'ip',
            unique: true
        },
        mac: {
            type: 'mac'
        },
        mac_u: {
            type: 'mac',
            unique: true
        },
        subnet: {
            type: 'subnet'
        },
        subnet_u: {
            type: 'subnet',
            unique: true
        },
        uuid: {
            type: 'uuid'
        },
        uuid_u: {
            type: 'uuid',
            unique: true
        }
    },
    pre: [function onePre(req, cb) { cb(); }],
    post: [function onePost(req, cb) { cb(); }],
    options: {}
};

var REINDEX_OBJ = {
    bar: 'hello',
    foo: 'world'
};

var c; // client
var server;
var b; // bucket

function test(name, setup) {
    tape.test(name + ' - setup', function (t) {
        b = 'moray_unit_test_' + uuid().substr(0, 7);
        helper.createServer(null, function (s) {
            server = s;
            c = helper.createClient();
            c.on('connect', t.end.bind(t));
        });
    });

    tape.test(name + ' - main', function (t) {
        setup(t);
    });

    tape.test(name + ' - teardown', function (t) {
        // May or may not exist, just blindly ignore
        c.delBucket(b, function () {
            c.once('close', function () {
                helper.cleanupServer(server, function () {
                    t.pass('closed');
                    t.end();
                });
            });
            c.close();
        });
    });
}


///--- Helpers

function assertBucket(t, bucket, cfg) {
    t.ok(bucket);
    if (!bucket)
        return (undefined);
    t.equal(bucket.name, b);
    t.ok(bucket.mtime instanceof Date);
    t.deepEqual(bucket.index, (cfg.index || {}));
    t.ok(Array.isArray(bucket.pre));
    t.ok(Array.isArray(bucket.post));
    t.equal(bucket.pre.length, (cfg.pre || []).length);
    t.equal(bucket.post.length, (cfg.post || []).length);

    if (bucket.pre.length !== (cfg.pre || []).length ||
        bucket.post.length !== (cfg.post || []).length)
        return (undefined);
    var i;
    for (i = 0; i < bucket.pre.length; i++)
        t.equal(bucket.pre[i].toString(), cfg.pre[i].toString());
    for (i = 0; i < bucket.post.length; i++)
        t.equal(bucket.post[i].toString(), cfg.post[i].toString());

    return (undefined);
}


function setupReindexingBucket(t) {
    var cfg1 = {
        index: {
            bar: {
                type: 'string'
            }
        },
        options: { version: 1 }
    };

    var cfg2 =  {
        index: {
            bar: {
                type: 'string'
            },
            foo: {
                type: 'string'
            }
        },
        options: { version: 2 }
    };

    t.test('create bucket', function (t2) {
        c.createBucket(b, cfg1, function (err) {
            t2.ifError(err);
            t2.end();
        });
    });

    t.test('put object', function (t2) {
        c.putObject(b, 'obj1', REINDEX_OBJ, function (err) {
            t2.ifError(err);
            t2.end();
        });
    });

    t.test('update bucket', function (t2) {
        c.updateBucket(b, cfg2, function (err) {
            t2.ifErr(err);
            t2.end();
        });
    });
}


function finishReindexingBucket(t, overrideObj) {
    t.test('reindex objects', function (t2) {
        c.reindexObjects(b, 1000, function (err, res) {
            t2.ifError(err, 'reindexObjects() error');
            t2.deepEqual({
                processed: 1,
                remaining: 0
            }, res, 'reindex results');
            t2.end();
        });
    });

    t.test('reindex objects (finish)', function (t2) {
        c.reindexObjects(b, 1000, function (err, res) {
            t2.ifError(err, 'reindexObjects() error');
            t2.deepEqual({
                processed: 0,
                remaining: 0
            }, res, 'reindex results');
            t2.end();
        });
    });

    t.test('bucket correctly reindexed', function (t2) {
        c.getObject(b, 'obj1', function (err, obj) {
            t2.ifError(err, 'getObject() error');
            t2.ok(obj, 'object returned');
            if (obj) {
                if (overrideObj) {
                    t2.deepEqual(overrideObj, obj.value, 'correct value');
                } else {
                    t2.deepEqual(REINDEX_OBJ, obj.value, 'correct value');
                }
            }
            t2.end();
        });
    });
}


///--- tests


test('create bucket stock config', function (t) {
    c.createBucket(b, {}, function (err) {
        t.ifError(err);
        c.getBucket(b, function (err2, bucket) {
            t.ifError(err2);
            assertBucket(t, bucket, {});
            c.listBuckets(function (err3, buckets) {
                t.ifError(err3);
                t.ok(buckets);
                t.ok(buckets.length);
                t.end();
            });
        });
    });
});


test('create bucket loaded', function (t) {
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        c.getBucket(b, function (err2, bucket) {
            t.ifError(err2);
            assertBucket(t, bucket, FULL_CFG);
            t.end();
        });
    });
});


test('reindexing with no reindex_active present', function (t) {
    /*
     * When most Moray consumers first start up, they often try to make
     * sure that their buckets are in a sane state. To do this, they'll
     * usually initialize their buckets for the first time with
     * createBucket(), and then do reindexObjects(). We replicate that
     * kind of behaviour here, to make sure Moray is okay with reindexing
     * buckets with no "reindex_active" field.
     */
    function doNeedlessReindex(t2) {
        c.reindexObjects(b, 100, function (err, res) {
            t2.ifError(err);
            t2.deepEqual({ processed: 0 }, res);
            t2.end();
        });
    }

    var cfg = {
        options: { version: 1 }
    };

    t.test('create bucket', function (t2) {
        c.createBucket(b, cfg, function (err) {
            t2.ifError(err);
            t2.end();
        });
    });

    t.test('check bucket', function (t2) {
        c.getBucket(b, function (err, bucket) {
            t2.ifError(err);
            t2.ok(bucket);
            t2.end();
        });
    });

    t.test('reindex on empty, newly created bucket', doNeedlessReindex);

    t.test('put an object', function (t2) {
        c.putObject(b, 'k', { foo: 'hello' }, function (err) {
            t2.ifError(err);
            t2.end();
        });
    });

    t.test('reindex on bucket w/ object', doNeedlessReindex);

    t.test('update bucket', function (t2) {
        c.updateBucket(b, {
            index: { foo: { type: 'string' } },
            options: { version: 2 }
        }, function (err) {
            t2.ifError(err);
            t2.end();
        });
    });

    t.test('reindex object', function (t2) {
        c.reindexObjects(b, 100, function (err, res) {
            t2.ifError(err);
            t2.deepEqual(res, { processed: 1, remaining: 0 });
            t2.end();
        });
    });

    t.test('finish up reindexing', function (t2) {
        c.reindexObjects(b, 100, function (err, res) {
            t2.ifError(err);
            t2.deepEqual(res, { processed: 0, remaining: 0 });
            t2.end();
        });
    });

    t.test('reindex w/ nothing to do', doNeedlessReindex);
});


test('getObject() is safe to use during reindexing', function (t) {
    setupReindexingBucket(t);

    function doGet(t2, opts) {
        c.getObject(b, 'obj1', opts, function (err, obj) {
            t2.ifError(err, 'getObject() error');
            t2.ok(obj, 'object returned');
            if (obj) {
                t2.deepEqual(REINDEX_OBJ, obj.value, 'value has "foo" field');
            }
            t2.end();
        });
    }

    t.test('object doesn\'t lose reindexing fields', function (t2) {
        doGet(t2, {});
    });

    t.test('"requireOnlineReindexing" option', function (t2) {
        doGet(t2, { requireOnlineReindexing: true });
    });

    finishReindexingBucket(t);
});


test('putObject() is safe to use during reindexing', function (t) {
    var k = 'obj2';
    var o = {
        bar: 'hiya',
        foo: 'earth'
    };

    function checkObject(t2) {
        c.getObject(b, k, function (err, obj) {
            t2.ifError(err, 'getObject() error');
            t2.ok(obj, 'object returned');
            if (obj) {
                t2.deepEqual(o, obj.value, 'correct value');
            }
            t2.end();
        });
    }

    setupReindexingBucket(t);

    t.test('put new object', function (t2) {
        c.putObject(b, k, o, function (err) {
            t2.ifError(err, 'putObject() error');
            t2.end();
        });
    });

    t.test('fetch new object', checkObject);

    finishReindexingBucket(t);

    t.test('fetch new object (after reindexing)', checkObject);
});


test('findObjects() is safe to use during reindexing', function (t) {
    setupReindexingBucket(t);

    function doFind(t2, opts) {
        var count = 0;
        var req = c.findObjects(b, '(bar=hello)', opts);

        req.on('error', function (err) {
            t2.ifError(err, 'findObjects() error');
            t2.end();
        });

        req.on('record', function (obj) {
            count += 1;
            t2.deepEqual(REINDEX_OBJ, obj.value);
            t2.deepEqual(1, obj._count, 'object returned');
        });

        req.on('end', function (err) {
            t2.deepEqual(1, count, 'one object returned');
            t2.end();
        });
    }

    t.test('reindexing fields are not lost', function (t2) {
        doFind(t2, {});
    });

    t.test('"requireOnlineReindexing" option', function (t2) {
        doFind(t2, { requireOnlineReindexing: true });
    });

    t.test('"requireOnlineReindexing" should prevent ' +
        'querying reindexing fields', function (t2) {
        var count = 0;
        var req = c.findObjects(b, '(foo=world)', {
            requireOnlineReindexing: true
        });

        req.on('error', function (err) {
            t2.equal(count, 0, 'no records should be returned');
            t2.ok(err, 'expected error');
            if (err) {
                t2.ok(VError.hasCauseWithName(err, 'NotIndexedError'),
                    'expected "NotIndexedError"');
            }
            t2.end();
        });

        req.on('record', function (obj) {
            count += 1;
            t2.fail('no records should be returned');
            t2.deepEqual(null, obj);
        });

        req.on('end', function (err) {
            t2.fail('query should fail');
            t2.end();
        });
    });

    finishReindexingBucket(t);
});


test('updateObjects() is safe to use during reindexing', function (t) {
    var updatedObj = {
        bar: 'hi',
        foo: 'world'
    };

    setupReindexingBucket(t);

    t.test('filter containing reindexing field returns error', function (t2) {
        c.updateObjects(b, { bar: 'bye' }, '(foo=world)', function (err) {
            t2.ok(err, 'should return error');
            if (err) {
                t2.ok(VError.hasCauseWithName(err, 'NotIndexedError'),
                    'NotIndexedError');
            }
            t2.end();
        });
    });

    t.test('filter containing non-indexed field returns error', function (t2) {
        c.updateObjects(b, { bar: 'bye' }, '(baz=world)', function (err) {
            t2.ok(err, 'should return error');
            if (err) {
                t2.ok(VError.hasCauseWithName(err, 'NotIndexedError'),
                    'NotIndexedError');
            }
            t2.end();
        });
    });

    t.test('update containing reindexing field returns error', function (t2) {
        c.updateObjects(b, { foo: 'hi' }, '(bar=hello)', function (err) {
            t2.ok(err, 'should return error');
            if (err) {
                t2.ok(VError.hasCauseWithName(err, 'NotIndexedError'),
                    'NotIndexedError');
            }
            t2.end();
        });
    });

    t.test('update of indexed field is fine', function (t2) {
        c.updateObjects(b, { bar: 'hi' }, '(bar=hello)', function (uErr, meta) {
            t2.ifError(uErr, 'should not return error');
            t2.ok(meta, 'should return object');
            if (meta) {
                t2.deepEqual(1, meta.count, 'correct count returned');
                t2.ok(meta.etag, 'etag returned');
            }

            c.getObject(b, 'obj1', function (gErr, obj) {
                t2.ifError(gErr, 'should not return error');
                t2.ok(obj, 'should return object');
                if (obj) {
                    t2.deepEqual(updatedObj, obj.value, 'should return object');
                    t2.deepEqual(meta.etag, obj._etag, 'etags should match');
                }
                t2.end();
            });
        });
    });

    finishReindexingBucket(t, updatedObj);
});


test('deleteMany() is safe to use during reindexing', function (t) {
    var cfg3 = {
        index: {
            bar: {
                type: 'string'
            },
            foo: {
                type: 'string'
            },
            quux: {
                type: 'string'
            }
        },
        options: { version: 3 }
    };

    setupReindexingBucket(t);

    t.test('filter containing reindexing field returns error', function (t2) {
        c.deleteMany(b, '(foo=hello)', function (err) {
            t2.ok(err, 'should return error');
            if (err) {
                t2.ok(VError.hasCauseWithName(err, 'NotIndexedError'),
                    'NotIndexedError');
            }
            t2.end();
        });
    });

    t.test('filter containing unindexed field returns error', function (t2) {
        c.deleteMany(b, '(baz=world)', function (err) {
            t2.ok(err, 'should return error');
            if (err) {
                t2.ok(VError.hasCauseWithName(err, 'NotIndexedError'),
                    'NotIndexedError');
            }
            t2.end();
        });
    });

    finishReindexingBucket(t);

    t.test('update bucket again', function (t2) {
        c.updateBucket(b, cfg3, function (err) {
            t2.ifErr(err);
            t2.end();
        });
    });

    t.test('filter containing indexed fields works', function (t2) {
        c.deleteMany(b, '(foo=world)', function (err, res) {
            t2.ifError(err, 'deleteMany() error');
            t2.ok(res, 'result');
            if (res) {
                t2.deepEqual({
                    count: 1
                }, res, 'result');
            }
            t2.end();
        });
    });

    t.test('reindex objects finds nothing (finish version 3)', function (t2) {
        c.reindexObjects(b, 1000, function (err, res) {
            t2.ifError(err, 'reindexObjects() error');
            t2.deepEqual({
                processed: 0,
                remaining: 0
            }, res, 'reindex results should be 0');
            t2.end();
        });
    });
});


test('update bucket', function (t) {
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        var cfg = jsprim.deepCopy(FULL_CFG);
        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        cfg.post.push(function two(req, cb) {
            cb();
        });
        c.updateBucket(b, cfg, function (err2) {
            t.ifError(err2);
            c.getBucket(b, function (err3, bucket) {
                t.ifError(err3);
                assertBucket(t, bucket, cfg);
                t.end();
            });
        });
    });
});


test('update bucket (versioned ok 0->1)', function (t) {
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        var cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 1;
        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        cfg.post.push(function two(req, cb) {
            cb();
        });
        c.updateBucket(b, cfg, function (err2) {
            t.ifError(err2);
            c.getBucket(b, function (err3, bucket) {
                t.ifError(err3);
                assertBucket(t, bucket, cfg);
                t.end();
            });
        });
    });
});


test('update bucket (versioned ok 1->2)', function (t) {
    var cfg = jsprim.deepCopy(FULL_CFG);

    cfg.options.version = 1;
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 2;
        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        cfg.post.push(function two(req, cb) {
            cb();
        });
        c.updateBucket(b, cfg, function (err2) {
            t.ifError(err2);
            c.getBucket(b, function (err3, bucket) {
                t.ifError(err3);
                assertBucket(t, bucket, cfg);
                t.end();
            });
        });
    });
});


test('update bucket (reindex tracked)', function (t) {
    var cfg = jsprim.deepCopy(FULL_CFG);

    cfg.options.version = 1;
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 2;
        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        c.updateBucket(b, cfg, function (err2) {
            t.ifError(err2);
            c.getBucket(b, function (err3, bucket) {
                t.ifError(err3);
                assertBucket(t, bucket, cfg);
                t.ok(bucket.reindex_active);
                t.ok(bucket.reindex_active['2']);
                t.end();
            });
        });
    });
});


test('update bucket (reindex disabled)', function (t) {
    var cfg = jsprim.deepCopy(FULL_CFG);

    cfg.options.version = 1;
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 2;
        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        var opts = {
            no_reindex: true
        };
        c.updateBucket(b, cfg, opts, function (err2) {
            t.ifError(err2);
            c.getBucket(b, function (err3, bucket) {
                t.ifError(err3);
                assertBucket(t, bucket, cfg);
                t.notOk(bucket.reindex_active);
                t.end();
            });
        });
    });
});


test('update bucket (null version, reindex disabled)', function (t) {
    var cfg = jsprim.deepCopy(FULL_CFG);

    cfg.options.version = 0;
    c.createBucket(b, FULL_CFG, function (err) {
        t.ifError(err);
        cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 0;
        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        c.updateBucket(b, cfg, function (err2) {
            t.ifError(err2);
            c.getBucket(b, function (err3, bucket) {
                t.ifError(err3);
                assertBucket(t, bucket, cfg);
                t.notOk(bucket.reindex_active);
                t.end();
            });
        });
    });
});


test('update bucket (versioned not ok 1 -> 0)', function (t) {
    var cfg = jsprim.deepCopy(FULL_CFG);
    cfg.options.version = 1;

    c.createBucket(b, cfg, function (err) {
        t.ifError(err);

        cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 0;

        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        cfg.post.push(function two(req, cb) {
            cb();
        });

        c.updateBucket(b, cfg, function (err2) {
            t.ok(err2);
            if (err2) {
                t.ok(VError.findCauseByName(
                    err2, 'BucketVersionError') !== null);
                t.ok(err2.message);
            }
            t.end();
        });
    });
});


test('update bucket (versioned not ok 2 -> 1)', function (t) {
    var cfg = jsprim.deepCopy(FULL_CFG);
    cfg.options.version = 2;

    c.createBucket(b, cfg, function (err) {
        t.ifError(err);

        cfg = jsprim.deepCopy(FULL_CFG);
        cfg.options.version = 1;

        cfg.index.foo = {
            type: 'string',
            unique: false
        };
        cfg.post.push(function two(req, cb) {
            cb();
        });

        c.updateBucket(b, cfg, function (err2) {
            t.ok(err2);
            if (err2) {
                t.ok(VError.findCauseByName(
                    err2, 'BucketVersionError') !== null);
                t.ok(err2.message);
            }
            t.end();
        });
    });
});


test('update bucket (bucket not found)', function (t) {
    c.updateBucket('nonexistent', { }, function (err) {
        t.ok(err, 'error returned');
        if (err) {
            t.ok(VError.hasCauseWithName(err, 'BucketNotFoundError'),
                'BucketNotFoundError');
        }
        t.end();
    });
});


test('create bucket bad index type', function (t) {
    c.createBucket(b, {index: {foo: 'foo'}}, function (err) {
        t.ok(err);
        t.ok(VError.findCauseByName(err, 'InvalidBucketConfigError') !== null);
        t.ok(err.message);
        t.end();
    });
});

test('bad index names', function (t) {
    var names = [
        // Reserved names
        '_etag', '_id', '_key', '_mtime', '_rver', '_txn_snap',
        '_value', '_vnode', '_atime', '_ctime',

        // Reserved names, different case
        '_ETag', '_ID', '_Key', '_MTime', '_Value', '_VNODE',

        // Disallowed characters
        'a!b', 'b@c', '&', '*', 'a+b', '~name', 'a-b',

        // Empty string
        '',

        // Restrictions on names with leading underscores
        '__foo', '_foo_2', '_bar_a', '___a',

        // Numbers at the beginning
        '1', '2nd', '5column',

        // Ending with an underscore
        '_', 'foo_', 'a2_',

        // Begins with "moray"
        '_moray', '__moray', '___Moray', '_moray_column', 'moray',
        'MORAY', 'morayC', 'moray_index', 'MoraY_foo', 'moray_bar'
    ];

    function isInvalidBucketErr(err) {
        return err && VError.hasCauseWithName(err, 'InvalidBucketConfigError');
    }

    vasync.forEachPipeline({
        inputs: names,
        func: function checkIndexName(name, cb) {
            var schema = { index: { } };
            schema.index[name] = { type: 'string' };

            c.createBucket(b, schema, function (err) {
                t.ok(isInvalidBucketErr(err),
                    JSON.stringify(name) + ' should be rejected');
                cb();
            });
        }
    }, function () {
        t.end();
    });
});

test('good index names', function (t) {
    var names = [
        // Contains an underscore
        '_v', '_foo', '_bar', 'belongs_to_uuid', 'zfs_io_priority',

        // Mixed case
        'wantInputRemoved', 'wantRetry', 'timeDone',

        // All upper-case
        'ZFS', 'AVAILABLE_MB',

        // Numbers at the end
        'foo1', 'number10', '_v2',

        // Index names from Triton and Manta
        '_default', '_owner', '_replicated', 'result', 'status', 'target',
        'timestamp', 'transient', 'updated_at', 'urn', 'v', 'valid',
        'version', 'worker',

        // Single letter
        'a', 'b', 'v', 'A', 'Z', 'V'
    ];

    t.test('create bucket', function (t2) {
        c.createBucket(b, {}, function (err) {
            t2.ifError(err);
            t2.end();
        });
    });


    t.test('update bucket w/ different index names', function (t2) {
        vasync.forEachPipeline({
            inputs: names,
            func: function checkIndexName(name, cb) {
                var schema = { index: {} };
                schema.index[name] = { type: 'string' };
                c.updateBucket(b, schema, function (err) {
                    t2.ifError(err, JSON.stringify(name) + ' should be okay');
                    cb();
                });
            }
        }, function () {
            t2.end();
        });
    });
});


test('create bucket triggers not function', function (t) {
    c.createBucket(b, {pre: ['foo']}, function (err) {
        t.ok(err);
        t.ok(VError.findCauseByName(err, 'NotFunctionError') !== null);
        t.ok(err.message);
        t.end();
    });
});


test('get bucket 404', function (t) {
    c.getBucket(uuid().substr(0, 7), function (err) {
        t.ok(err);
        t.ok(VError.findCauseByName(err, 'BucketNotFoundError') !== null);
        t.ok(err.message);
        t.end();
    });
});


test('delete missing bucket', function (t) {
    c.delBucket(uuid().substr(0, 7), function (err) {
        t.ok(err);
        t.ok(VError.findCauseByName(err, 'BucketNotFoundError') !== null);
        t.ok(err.message);
        t.end();
    });
});


[ 'buckets_config', 'moray', 'search' ].forEach(function (bucket) {
    test('delete reserved bucket: "' + bucket + '"', function (t) {
        c.delBucket(bucket, function (err) {
            t.ok(err, 'error returned');
            if (err && VError.hasCauseWithName(err, 'InvalidBucketNameError')) {
                t.ok(jsprim.endsWith(err.message,
                    bucket + ' is not a valid bucket name'),
                    'InvalidBucketNameError');
            } else {
                t.ifError(err);
            }
            t.end();
        });
    });
});


test('MORAY-378 - Bucket cache cleared on bucket delete', function (t) {
    vasync.pipeline({ funcs: [
        // Create the initial bucket.
        function (_, cb) { c.createBucket(b, {}, cb); },

        // updateBucket() will set "reindex_active" on the bucket.
        function (_, cb) {
            c.updateBucket(b, {
                index: { field: { type: 'number' } },
                options: { version: 2 }
            }, cb);
        },

        // Prime the bucket cache with putObject().
        function (_, cb) { c.putObject(b, 'key', { field: 5 }, cb); },

        // Delete the bucket.
        function (_, cb) { c.delBucket(b, cb); },

        // Create a bucket with the same name; it won't have "reindex_active".
        function (_, cb) { c.createBucket(b, {}, cb); },

        // If the old cached bucket is used, it'll have "reindex_active", and
        // Moray will try to place a value in the non-existent "_rver" column.
        function (_, cb) { c.putObject(b, 'key', { field: 5 }, cb); }
    ]}, function (err) {
        t.error(err, 'Finish without error');
        t.end();
    });
});


test('MORAY-378 - Bucket cache cleared on bucket update', function (t) {
    var schema = {
        index: { field: { type: 'string' } },
        options: { version: 2 }
    };

    vasync.pipeline({ funcs: [
        // Create the initial bucket.
        function (_, cb) { c.createBucket(b, {}, cb); },

        // Prime the bucket cache with putObject().
        function (_, cb) { c.putObject(b, 'key1', {}, cb); },

        // Add a new index.
        function (_, cb) { c.updateBucket(b, schema, cb); },

        // Insert a new object into the bucket.
        function (_, cb) { c.putObject(b, 'key2', { field: 'foo' }, cb); },

        // If the old cached value was used, a value won't have been inserted
        // into the "field" column. We can check this using .sql() results.
        function (_, cb) {
            var count = 0;
            var args = [ 'key2' ];
            var res = c.sql('SELECT * FROM ' + b + ' WHERE _key = $1;', args);
            res.on('record', function (r) {
                t.equal(r._key, 'key2', 'correct object returned for key');
                t.equal(r.field, 'foo', '"field" column had value inserted');
                count += 1;
            });
            res.on('error', cb);
            res.on('end', function () {
                t.equal(count, 1, 'one row returned');
                cb();
            });
        }
    ]}, function (err) {
        t.error(err, 'Finish without error');
        t.end();
    });
});


test('MORAY-388 - triggers can require microtime/crc modules', function (t) {
    function requireMicrotime(req, cb) {
        var err = new Error('Required "microtime"');
        err.name = 'RequireError';
        try {
            require('microtime');
            cb(err);
        } catch (e) {
            cb(e);
        }
    }

    function requireCRC(req, cb) {
        var err = new Error('Required "crc"');
        err.name = 'RequireError';
        try {
            require('crc');
            cb(err);
        } catch (e) {
            cb(e);
        }
    }

    function testTrigger(name, cb) {
        c.putObject(b, 'key1', {}, function (err) {
            if (err) {
                var cause = VError.findCauseByName(err, 'RequireError');
                if (cause) {
                    t.equal(cause.message, 'Required "' + name + '"');
                } else {
                    t.error(err, name + ' module not required');
                }
            } else {
                t.fail('trigger not called');
            }

            cb();
        });
    }

    var schema1 = { pre: [ requireMicrotime ] };
    var schema2 = { post: [ requireMicrotime ] };
    var schema3 = { pre: [ requireCRC ] };
    var schema4 = { post: [ requireCRC ] };

    vasync.pipeline({ funcs: [
        // Create the initial bucket to check "pre" microtime trigger.
        function (_, cb) { c.createBucket(b, schema1, cb); },
        function (_, cb) { testTrigger('microtime', cb); },

        // Update the bucket to check "post" microtime trigger.
        function (_, cb) { c.updateBucket(b, schema2, cb); },
        function (_, cb) { testTrigger('microtime', cb); },

        // Update the bucket to check "pre" crc trigger.
        function (_, cb) { c.updateBucket(b, schema3, cb); },
        function (_, cb) { testTrigger('crc', cb); },

        // Update the bucket to check "post" crc trigger.
        function (_, cb) { c.updateBucket(b, schema4, cb); },
        function (_, cb) { testTrigger('crc', cb); }
    ]}, function (err) {
        t.error(err, 'Finish without error');
        t.end();
    });
});


test('MORAY-389 - limit what triggers can require', function (t) {
    function requireAssertPlus(req, cb) {
        try {
            require('assert-plus');
            cb(new Error('should have thrown'));
        } catch (e) {
            cb(e);
        }
    }

    function requireNet(req, cb) {
        try {
            require('net');
            cb(new Error('should have thrown'));
        } catch (e) {
            cb(e);
        }
    }

    function testTrigger(name, cb) {
        c.putObject(b, 'key1', {}, function (err) {
            if (err) {
                var cause = VError.findCauseByName(err, 'InvalidRequireError');
                if (cause) {
                    t.equal(cause.message,
                        '"' + name + '" is not a permitted module');
                } else {
                    t.error(err, name + ' module was required');
                }
            } else {
                t.fail('trigger not called');
            }

            cb();
        });
    }

    var schema1 = { pre: [ requireAssertPlus ] };
    var schema2 = { post: [ requireAssertPlus ] };
    var schema3 = { pre: [ requireNet ] };
    var schema4 = { post: [ requireNet ] };

    vasync.pipeline({ funcs: [
        // Create the initial bucket to check "pre" assert-plus trigger.
        function (_, cb) { c.createBucket(b, schema1, cb); },
        function (_, cb) { testTrigger('assert-plus', cb); },

        // Update the bucket to check "post" assert-plus trigger.
        function (_, cb) { c.updateBucket(b, schema2, cb); },
        function (_, cb) { testTrigger('assert-plus', cb); },

        // Update the bucket to check "post" net trigger.
        function (_, cb) { c.updateBucket(b, schema3, cb); },
        function (_, cb) { testTrigger('net', cb); },

        // Update the bucket to check "post" net trigger.
        function (_, cb) { c.updateBucket(b, schema4, cb); },
        function (_, cb) { testTrigger('net', cb); }
    ]}, function (err) {
        t.error(err, 'Finish without error');
        t.end();
    });
});
