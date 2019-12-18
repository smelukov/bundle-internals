# Bundle Internals Plugin

The webpack plugin that collects a debug information about your webpack bundle (e.g. bundled modules, input entry points, and output assets)

[![npm](https://img.shields.io/npm/v/bundle-internals)](https://www.npmjs.com/package/bundle-internals)

## Usage

`npm i bundle-internals`

```js
const BundleInternalsPlugin = require('bundle-internals');

config.plugins.push(new BundleInternalsPlugin());
```

## Options

### saveTo: string

Allow to dump a debug data to specified file (relative an output directory)

```js
new BundleInternalsPlugin({
    saveTo: 'debug.json'
});
```

### runMode: string

One of the values:

- `all` - run plugin on watch and non-watch build
- `non-watch` - run plugin only on non-watch build
- `watch` - run plugin only on watch build

`runMode` is `all` by default

```js
new BundleInternalsPlugin({
    runMode: 'watch'
});
```

### resolve: boolean

Resolves payload before pass it to the data-hook

```js
new BundleInternalsPlugin({
    resolve: true
});
```

`resolve` is `false` by default

> Don't mix `resolve` and `saveTo` options because `resolve` makes a recursive JSON that can't be stringified
> If you really want to save recursive JSON then use some specialized tools (e.g. [flatted](https://www.npmjs.com/package/flatted))

## Hooks

### data(payload)

```js
const bundleInternalsPlugin = new BundleInternalsPlugin()
bundleInternalsPlugin.hooks.data.tap('my-plugin', payload => {
    console.log(payload);
})
```

## Data format

Data format described in [types.d.ts](src/types.d.ts)

### Data denormalization/resolving

Some data fields contain only ids and need to denormalize/resolve. For example `file` field in `data.input.modules` contain the only id of the file and we need to resolve it from `data.input.files`:

```js
data.input.modules.forEach(module => {
    module.file = data.input.files.find(file => module.file === file.path)
});
```

Or you can use builtin `resolve` function:

```js
const BundleInternalsPlugin = require('bundle-internals');

const bundleInternalsPlugin = new BundleInternalsPlugin()
bundleInternalsPlugin.hooks.data.tap('my-plugin', payload => {
    BundleInternalsPlugin.resolve(payload);
    console.log(payload);
});
```

Or use `resolve` option:

```js
new BundleInternalsPlugin({
    resolve: true
});
```

## Why not a builtin webpack Stats object?

Its too huge to analyze ;)

## Data Analyzing

This plugin will be used in [Webpack Runtime Analyzer](https://github.com/smelukov/webpack-runtime-analyzer/) V2

But for now, you can get the raw bundle internal data and analyze it manually.

> It's just a JSON and you may use any tools to analyze and visualize it

For example, you may load it to [Jora Sandbox](https://discoveryjs.github.io/jora-sandbox/) and make some interesting queries to it.

Jora Sandbox is a sandbox for the [Jora](https://github.com/discoveryjs/jora) query engine that allows you to query and aggregate any data from JSON.

For example...

### Used node modules

Jora Query:

```
input.files.nodeModule
  .group(<name>)
  .({name: key, version: value.version.sort()})
  .sort(<name>)
```

Result:

```json
[
  { name: "@babel/polyfill", version: ["7.4.4"] },
  { name: "@babel/runtime", version: ["7.5.5"] },
  { name: "@firebase/app", version: ["0.1.10"] },
  { name: "@firebase/messaging", version: ["0.1.9"] },
  { name: "@firebase/util", version: ["0.1.10", "0.1.8"] },
  { name: "@sentry/browser", version: ["4.6.6"] },
  // ...
]
```

### The most required modules

Jora Query:

```
input.modules.sort(<reasons.size()>).reverse().id
```

Result:

```json
[
  "./node_modules/react/index.js",
  "./node_modules/prop-types/index.js",
  "./node_modules/react-redux/lib/index.js",
  "./node_modules/lodash/get.js",
  "./node_modules/@babel/polyfill/node_modules/core-js/modules/  _export.js",
  "./node_modules/react-dom/index.js",
  // ...
```
