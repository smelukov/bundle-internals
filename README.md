# Bundle Internals Plugin

The webpack plugin that collects a debug information about your webpack bundle (e.g. bundled modules, input entry points, and output assets)

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
    watchModeOnly: true
});
```

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

## Data Analyzing

This plugin will be used in [Webpack Runtime Analyzer](https://github.com/smelukov/webpack-runtime-analyzer/) V2 But for now, you can load debug data from your bundle to [Jora Sandbox](https://discoveryjs.github.io/jora-sandbox/) and make some interesting queries to it.

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
