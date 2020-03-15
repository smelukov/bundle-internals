const fs = require('fs');
const path = require('path');
const NodeOutputFileSystem = require('webpack/lib/node/NodeOutputFileSystem');
const RequestShortener = require('webpack/lib/RequestShortener');
const { Tapable, SyncHook } = require("tapable");
const {
    getFileHash,
    deepExtend,
    unixpath
} = require('./utils');
const resolve = require('./resolve');

const pluginName = 'Bundle Internals';

class BundleInternalsPlugin extends Tapable {
    constructor(options) {
        super();
        this.options = deepExtend({
            watchModeOnly: false,
            runMode: 'all',
            resolve: false
        }, options);

        this.hooks = {
            data: new SyncHook(["data"])
        };
    }

    /**
     * @param {Compiler} compiler
     */
    apply(compiler) {
        const run = this.run.bind(this);

        if (this.options.runMode === 'all' || this.options.runMode === 'watch') {
            compiler.hooks.watchRun.tap(pluginName, run);
        }

        if (this.options.runMode === 'all' || this.options.runMode === 'non-watch') {
            compiler.hooks.run.tap(pluginName, run);
        }
    }

    run(compiler) {
        const requestShortener = new RequestShortener(compiler.context);

        this.compiler = compiler;
        this.requestShortener = requestShortener;

        const webpackVersion = require.main.require('webpack/package.json').version;
        const publicPath = compiler.options.output.publicPath || '/';
        const outputPath = compiler.options.output.path;
        const compilerContext = compiler.context;

        const stats = {
            assets: {
                initial: {},
                dynamic: {}
            },
            input: { entries: [], modules: [], files: [], nodeModules: {} },
            output: { bundles: [], chunks: [], files: [] }
        };

        compiler.hooks.afterEmit.tapAsync(pluginName, async (compilation, cb) => {
            stats.assets = compilation.chunkGroups.reduce((all, group) => {
                if (!group.isInitial()) {
                    return all;
                }

                const initialFiles = new Set();
                const dynamicFiles = new Set();
                const chunks = group.chunks.map(chunk => ({ type: 'initial', chunk }));
                const stack = [...group.getChildren()];
                let cursor;

                while (cursor = stack.pop()) { // eslint-disable-line no-cond-assign
                    stack.push(...cursor.getChildren());
                    chunks.push(...cursor.chunks.map(chunk => ({ type: 'dynamic', chunk })));
                }

                chunks.forEach(({ chunk, type }) => {
                    chunk.files.forEach(file => {
                        const target = type === 'initial' ? initialFiles : dynamicFiles;

                        target.add(path.join(publicPath, file));
                    });
                });

                if (initialFiles.size) {
                    all.initial[group.runtimeChunk.name] = [...initialFiles];
                }

                if (dynamicFiles.size) {
                    all.dynamic[group.runtimeChunk.name] = [...dynamicFiles];
                }

                return all;
            }, stats.assets);

            let outputFileSystem = compilation.compiler.outputFileSystem;

            if (compilation.compiler.outputFileSystem instanceof NodeOutputFileSystem) {
                outputFileSystem = fs;
            }

            compilation.entrypoints.forEach((entry, name) => {
                stats.input.entries.push({ name })
            });

            const modules = [...compilation.modules];
            const handledModules = new Set();
            let module;

            while (module = modules.pop()) { // eslint-disable-line no-cond-assign
                const moduleId = this.getModuleId(module);

                let absResourcePath = module.resource;
                let resource = module.resource ? path.relative(compiler.context, module.resource) : undefined;
                let extractedFrom;

                if (!resource && module.issuer && module.issuer.resource) {
                    absResourcePath = module.issuer.resource;
                    resource = path.relative(compiler.context, module.issuer.resource);
                }

                resource = resource && resource.split('?')[0];

                if (resource && !stats.input.files.find(({ path }) => path === resource)) {
                    const fileStat = compiler.inputFileSystem.statSync(absResourcePath);
                    const fileInfo = {
                        path: resource,
                        ext: path.extname(resource),
                        size: fileStat.size
                    };

                    const [pathToPackageJson] = absResourcePath.match(/.*node_modules\/(?:@[^/]+\/[^/]+|[^/]+)\//) || [];

                    if (pathToPackageJson) {
                        const {
                            name: packageName,
                            version: packageVersion
                        } = compiler.inputFileSystem.readJsonSync(pathToPackageJson + 'package.json');

                        fileInfo.nodeModule = { name: packageName, version: packageVersion };
                        stats.input.nodeModules[packageName] = stats.input.nodeModules[packageName] || [];

                        if (!stats.input.nodeModules[packageName].includes(packageVersion)) {
                            stats.input.nodeModules[packageName].push(packageVersion);
                        }
                    }

                    stats.input.files.push(fileInfo);
                }

                if (module.constructor.name === 'ConcatenatedModule') {
                    if (module.rootModule && !compilation.modules.includes(module.rootModule)) {
                        modules.push(module.rootModule);
                    }

                    if (module.modules && !compilation.modules.includes(module.rootModule)) {
                        module.modules.forEach(m => !modules.includes(m) && modules.push(m));
                    }
                } else if (
                    module.constructor.name === 'MultiModule' ||
                    module.constructor.name === 'ContextModule'
                ) {
                    module.dependencies.forEach(dep => {
                        if (dep.module && !compilation.modules.includes(dep.module)) {
                            modules.push(dep.module);
                        }
                    });
                } else if (module.constructor.name === 'CssModule') {
                    if (module.issuer) {
                        extractedFrom = this.getModuleId(module.issuer);

                        if (!compilation.modules.includes(module.issuer)) {
                            modules.push(module.issuer);
                        }
                    }
                }

                module.dependencies.forEach(dep => {
                    if (
                        dep.module && !compilation.modules.includes(dep.module) &&
                        !modules.includes(dep.module) && !handledModules.has(dep.module)
                    ) {
                        modules.push(dep.module);
                    }
                });

                handledModules.add(module);

                const moduleInfo = {
                    id: moduleId,
                    file: resource,
                    size: module.size(),
                    type: module.constructor.name,
                    isEntry: module.isEntryModule(),
                    extracted: extractedFrom,
                    concatenated: module.modules && module.modules.map(module => this.getModuleId(module)),
                    deopt: module.optimizationBailout.map(reason => {
                        if (typeof reason === 'function') {
                            return reason(requestShortener);
                        }

                        return reason;
                    }),
                    deps: module.dependencies
                        .filter(dependency => dependency.module)
                        .map(dependency => ({ module: this.getModuleId(dependency.module) })),
                    reasons: module.reasons
                        .filter(reason => reason.module)
                        .map(reason => ({ module: this.getModuleId(reason.module) }))
                };

                stats.input.modules.push(moduleInfo);
            }

            stats.output.chunks = compilation.chunks.map(chunk => ({
                id: chunk.id,
                name: chunk.name,
                reason: chunk.chunkReason,
                size: chunk.size({}),
                groups: [...chunk.groupsIterable].map(group => group.id),
                canBeInitial: chunk.canBeInitial(),
                onlyInitial: chunk.isOnlyInitial(),
                entryModule: chunk.entryModule && this.getModuleId(chunk.entryModule),
                files: chunk.files.map(file => {
                    const absFilePath = path.join(outputPath, file);

                    if (!stats.output.files.find(({ path }) => path === file)) {
                        const foleStat = outputFileSystem.statSync(absFilePath);
                        let { size } = foleStat;

                        if (!size) {
                            size = compilation.assets[file].size();
                        }

                        stats.output.files.push({
                            path: file,
                            ext: path.extname(file),
                            size
                        });
                    }

                    return file;
                }),
                modules: chunk.getModules().map(module => this.getModuleId(module))
            }));

            stats.output.chunkGroups = compilation.chunkGroups.map(group => {
                return {
                    id: group.id,
                    isInitial: group.isInitial(),
                    name: group.name,
                    chunks: group.chunks.map(chunk => chunk.id),
                    runtimeChunk: group.runtimeChunk && group.runtimeChunk.id,
                    children: [...group.childrenIterable].map(group => group.id),
                    parents: [...group.parentsIterable].map(group => group.id)
                };
            });

            for (const group of compilation.chunkGroups) {
                if (group.runtimeChunk) {
                    stats.output.bundles.push({
                        name: group.runtimeChunk.name,
                        module: group.runtimeChunk.entryModule && this.getModuleId(group.runtimeChunk.entryModule),
                        chunks: group.chunks.map(chunk => chunk.id)
                    });
                }
            }

            await Promise.all(stats.input.files
                .map(file => {
                    return getFileHash(fs, path.join(compilerContext, file.path))
                        .then(hash => file.hash = hash);
                })
            );
            await Promise.all(stats.output.files
                .map(file => {
                    return getFileHash(outputFileSystem, path.join(outputPath, file.path))
                        .then(hash => file.hash = hash);
                }));

            const data = {
                version: webpackVersion,
                hash: compilation.hash,
                mode: compilation.options.mode || 'production',
                context: unixpath(compilation.compiler.context),
                assets: stats.assets,
                input: stats.input,
                output: stats.output,
                errors: this.collectWarnings(compilation.errors),
                warnings: this.collectWarnings(compilation.warnings)
            };

            if (this.options.resolve) {
                resolve(data);
            }

            this.hooks.data.call(data);

            const { saveTo } = this.options;

            if (saveTo) {
                fs.writeFileSync(path.resolve(outputPath, saveTo), JSON.stringify(data));
            }

            cb();
        });
    }

    getModuleId(module) {
        if (module.libIdent) {
            return module.libIdent(this.compiler);
        }

        return module.readableIdentifier(this.requestShortener);
    }

    collectWarnings(source) {
        return source.reduce((all, warning) => {
            const entrypoints = warning.entrypoints || (warning.entrypoint ? [warning.entrypoint] : []);
            const modules = warning.modules || (warning.module ? [warning.module] : []);
            const chunks = warning.chunks || (warning.chunk ? [warning.chunk] : []);
            const assets = warning.assets || (warning.asset ? [warning.asset] : []);

            if (entrypoints) {
                entrypoints.forEach(data => {
                    all.push({
                        from: 'entrypoint',
                        type: warning.constructor.name,
                        message: warning.message,
                        source: data.name
                    });
                })
            }

            if (modules) {
                modules.forEach(data => {
                    all.push({
                        from: 'module',
                        type: warning.constructor.name,
                        message: warning.message,
                        source: this.getModuleId(data)
                    });
                })
            }

            if (chunks) {
                chunks.forEach(data => {
                    all.push({
                        from: 'chunk',
                        type: warning.constructor.name,
                        message: warning.message,
                        source: data.id
                    });
                })
            }

            if (assets) {
                assets.forEach(data => {
                    all.push({
                        from: 'asset',
                        type: warning.constructor.name,
                        message: warning.message,
                        source: data.name
                    });
                })
            }

            if (!entrypoints.length && !modules.length && !chunks.length && !assets.length) {
                all.push({
                    from: 'unknown',
                    type: warning.constructor.name,
                    message: warning.message,
                });
            }

            return all;
        }, []);
    }
}

module.exports = BundleInternalsPlugin;
module.exports.resolve = resolve;
