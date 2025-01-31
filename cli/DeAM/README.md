deam
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/deam.svg)](https://npmjs.org/package/deam)
[![Downloads/week](https://img.shields.io/npm/dw/deam.svg)](https://npmjs.org/package/deam)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g deam
$ deam COMMAND
running command...
$ deam (--version)
deam/0.0.0 linux-x64 node-v20.12.2
$ deam --help [COMMAND]
USAGE
  $ deam COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`deam hello PERSON`](#deam-hello-person)
* [`deam hello world`](#deam-hello-world)
* [`deam help [COMMAND]`](#deam-help-command)
* [`deam plugins`](#deam-plugins)
* [`deam plugins add PLUGIN`](#deam-plugins-add-plugin)
* [`deam plugins:inspect PLUGIN...`](#deam-pluginsinspect-plugin)
* [`deam plugins install PLUGIN`](#deam-plugins-install-plugin)
* [`deam plugins link PATH`](#deam-plugins-link-path)
* [`deam plugins remove [PLUGIN]`](#deam-plugins-remove-plugin)
* [`deam plugins reset`](#deam-plugins-reset)
* [`deam plugins uninstall [PLUGIN]`](#deam-plugins-uninstall-plugin)
* [`deam plugins unlink [PLUGIN]`](#deam-plugins-unlink-plugin)
* [`deam plugins update`](#deam-plugins-update)

## `deam hello PERSON`

Say hello

```
USAGE
  $ deam hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ deam hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/cli/deam/blob/v0.0.0/src/commands/hello/index.ts)_

## `deam hello world`

Say hello world

```
USAGE
  $ deam hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ deam hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/cli/deam/blob/v0.0.0/src/commands/hello/world.ts)_

## `deam help [COMMAND]`

Display help for deam.

```
USAGE
  $ deam help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for deam.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.23/src/commands/help.ts)_

## `deam plugins`

List installed plugins.

```
USAGE
  $ deam plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ deam plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/index.ts)_

## `deam plugins add PLUGIN`

Installs a plugin into deam.

```
USAGE
  $ deam plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into deam.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the DEAM_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the DEAM_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ deam plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ deam plugins add myplugin

  Install a plugin from a github url.

    $ deam plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ deam plugins add someuser/someplugin
```

## `deam plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ deam plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ deam plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/inspect.ts)_

## `deam plugins install PLUGIN`

Installs a plugin into deam.

```
USAGE
  $ deam plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into deam.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the DEAM_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the DEAM_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ deam plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ deam plugins install myplugin

  Install a plugin from a github url.

    $ deam plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ deam plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/install.ts)_

## `deam plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ deam plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ deam plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/link.ts)_

## `deam plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ deam plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ deam plugins unlink
  $ deam plugins remove

EXAMPLES
  $ deam plugins remove myplugin
```

## `deam plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ deam plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/reset.ts)_

## `deam plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ deam plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ deam plugins unlink
  $ deam plugins remove

EXAMPLES
  $ deam plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/uninstall.ts)_

## `deam plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ deam plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ deam plugins unlink
  $ deam plugins remove

EXAMPLES
  $ deam plugins unlink myplugin
```

## `deam plugins update`

Update installed plugins.

```
USAGE
  $ deam plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.28/src/commands/plugins/update.ts)_
<!-- commandsstop -->
