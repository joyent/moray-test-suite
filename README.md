<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2017, Joyent, Inc.
-->

# Moray test suite

This repository is part of the Joyent SmartDataCenter project (SDC), and the
Joyent Manta project.  For contribution guidelines, issues, and general
documentation, visit the main [SDC](http://github.com/joyent/sdc) and
[Manta](http://github.com/joyent/manta) project pages.

This repository contains the test suite for the [Moray
client](https://github.com/joyent/node-moray) and [Moray
server](https://github.com/joyent/moray).

## A note on Node versions

As of this writing, the server only works with Node v0.10 while the client
supports v0.10 and later.  This test suite is designed with the assumption that
the client and server may be running different versions of Node, with different
dependencies (even for dependencies of the same package and version, since
binaries differ across Node versions).  **The test suite and client always run
with the version of Node on your PATH when you run the `configure` tool.**  The
server runs with the Node version specified in the configuration file (which
also defaults to the one on your PATH).  **Attempting to run this test suite
with later versions of Node may fail.**

## Quick start

To run the tests, you typically:

1. Verify that you are running a supported version of Node:

       $ node --version
       v0.10.48

2. Clone this repository.

       $ git clone git@github.com:joyent/moray-test-suite.git
       $ cd moray-test-suite

3. Install the dependencies:

       $ npm install

4. Configure the test suite.  Start with one of the template configuration
   files.  You'll need to fill in the path to a sample Moray server
   configuration file appropriate for your environment:

       $ cp etc/moray-test-suite-stock.json etc/moray-test-suite.json
       $ vim etc/moray-test-suite.json

    See the **Configuration section** below for tunables and their respective
    meanings before running configure.  Once all parameters that you care about
    have been specified, run configure on that file:

       $ ./tools/configure etc/moray-test-suite.json

5. Run the tests:

       $ make test

When testing against a Moray client or server workspace, perform a `make clean`
in those workspaces prior to running `make test` in the moray-test-suite
workspace.  Leftover artifacts from a previous build of a Moray client or server
workspace could prevent the node-moray-test suite build process from completing
successfully.

To run individual tests by hand, first configure the test suite (steps 1 through
4 above), then source the generated environment file and run the test programs
by hand:

    $ source run/env.sh
    $ node test/buckets.test.js

## Configuration

The test suite supports both a standalone mode, in which the test runner must 
supply a path to a local Moray server branch for starting any Moray servers that
the test suite reuires as well as remote mode, in which the test suite runs
against an existing (already deployed) Moray server.  The remote mode exists
primarily for flexibility during development, as it allows you to point the test
suite at any network endpoint that speaks the Moray protocol.  That could be a
proxy server, or an instrumented Moray, or a process in a deployed Manta system,
for example.  However, the remote mode skips some tests that require multiple
servers.  **Before integration, changes should pass the test suite in standalone
mode.**

The configuration file created above, in step 4, (etc/moray-test-suite.json)
allows you to specify the following parameters:

Property          | Type   | Example         | Meaning
--------          | ------ | --------------- | -------
server            | object | (see below)     | Describes the server implementation used for the test suite and how to run the server.
server.remote     | string | `'tcp://localhost:2020'` | If specified, then use the servers at the specified URLs instead of spinning up servers using the `server.node`, `server.path`, `server.start`, and `server.configBase` properties.  Note that the example supplied here assumes that the "remote" Moray server is running on the same system as the test suite, but `localhost` can be replaced with absolutely any address as long as a Moray server is running at that location.
server.node       | string | `node`          | Path to the node executable to use when running the server, or `node` to use executable on the path (not recommended).
server.path       | string | `../moray`      | Path to the server implementation that you want to test.  This is usually a cloned copy of the moray repository, possibly with local changes.  If this path is not absolute, then it will be interpreted relative to the root of this repository.  If this is not specified, then the stock server will be cloned and used.
server.start      | string | `$MORAY_NODE $MORAY_PATH main.js -f $MORAY_CONFIG -v 2>&1` | bash command to start the server, emitting logs to stdout.  $MORAY\_NODE expands to `server.node`, $MORAY\_PATH expands to `server.path`, and $MORAY\_CONFIG expands to the target configuration file, which will be based on the file `server.configBase`.
server.configBase | string | `../moray/config.json` | Path to the configuration file to use for servers started by the test suite.  The test suite may need to modify configuration slightly (e.g., to adjust port numbers), so it will create new configuration files based on this one.  Note that it is easier to start with a config.json that is currently consumed by an existing Moray server as a template and modify it as needed.  Generally, no modifications are necessary assuming that all network endpoints specified in the file are reachable from where the test suite is executed.
client            | string | (see below)     | Describes the client implementation used for the test suite.
client.path       | string | `../node-moray` | Path to the client implementation that you want to test.  This is usually a cloned copy of the node-moray repository, possibly with local changes.  If this path is not absolute, then it will be interpreted relative to the root of this repository.  If this is not specified, then the stock client will be cloned and used.

The `configure` script takes this configuration file, fills in default values,
and then validates the configuration.  The script then sets up a "run" directory
that contains links to the installed client and server and a shell environment
file that contains the above configuration.

The test suite programs read the configuration out of the environment.  If you
like, you can modify the environment file or even modify your environment
directly,  but the intended workflow is that you modify the config file, re-run
configure, and then source the new configuration file.  This keeps everything in
sync and the result is repeatable.

The environment variables are documented in the generated file.
