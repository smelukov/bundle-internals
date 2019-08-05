function isValidId(id) {
    const type = typeof id;
  
    return type === 'string' || type === 'number';
  }
  
  function createMessageHandler(data, messageType) {
    return warning => {
      switch (warning.from) {
        case 'module':
          warning.source = data.input.modules.find(m => m.id === warning.source);
          break;
        case 'entrypoint':
          warning.source = data.output.bundles.find(e => e.name === warning.source);
          break;
        case 'chunk':
          warning.source = data.output.chunks.find(c => c.id === warning.source);
          break;
        case 'asset':
          warning.source = data.output.files.find(f => f.path === warning.source);
          break;
      }
  
      if (warning.source && !warning.source[messageType].includes(warning)) {
        warning.source[messageType].push(warning);
      }
    };
  }
  
  module.exports = data => {
      data.output.chunks.forEach(chunk => {
        chunk.warnings = [];
        chunk.errors = [];
  
        if (chunk.entryModule) {
          if (isValidId(chunk.entryModule)) {
            chunk.entryModule = data.input.modules.find(m => m.id === chunk.entryModule)
          }
        }
  
        if (chunk.files) {
          chunk.files = chunk.files.map(file => {
            if (isValidId(file)) {
              return data.output.files.find(i => file === i.path)
            }
  
            return file;
          });
        }
  
        if (chunk.modules) {
          chunk.modules = chunk.modules.map(module => {
            if (isValidId(module)) {
              return data.input.modules.find(m => m.id === module);
            }
  
            return module;
          });
        }
  
        if (chunk.groups) {
          chunk.groups = chunk.groups.map(group => {
            if (isValidId(group)) {
              return data.output.chunkGroups.find(g => g.id === group);
            }
  
            return group;
          });
        }
      });
  
      data.output.chunkGroups.forEach(group => {
        if (group.runtimeChunk) {
          if (isValidId(group.runtimeChunk)) {
            group.runtimeChunk = data.output.chunks.find(c => c.id === group.runtimeChunk)
          }
        }
  
        if (group.chunks) {
          group.chunks = group.chunks.map(chunk => {
            if (isValidId(chunk)) {
              return data.output.chunks.find(c => c.id === chunk);
            }
  
            return chunk;
          });
        }
  
        if (group.children) {
          group.children = group.children.map(group => {
            if (isValidId(group)) {
              return data.output.chunkGroups.find(g => g.id === group);
            }
  
            return group;
          });
        }
  
        if (group.parents) {
          group.parents = group.parents.map(group => {
            if (isValidId(group)) {
              return data.output.chunkGroups.find(g => g.id === group);
            }
  
            return group;
          });
        }
      });
  
      data.output.bundles.forEach(bundle => {
        bundle.warnings = [];
        bundle.errors = [];
  
        if (bundle.module) {
          if (isValidId(bundle.module)) {
            bundle.module = data.input.modules.find(m => m.id === bundle.module)
          }
        }
  
        if (bundle.chunks) {
          bundle.chunks = bundle.chunks.map(chunk => {
            if (isValidId(chunk)) {
              return data.output.chunks.find(c => c.id === chunk);
            }
  
            return chunk;
          });
        }
      });
  
      data.output.files.forEach(file => {
        file.warnings = [];
        file.errors = [];
        file.chunks = data.output.chunks.filter(chunk =>
          chunk.files.find(chunkFile =>
            chunkFile.path === file.path));
      });
  
      data.input.modules.forEach(module => {
        module.chunks = data.output.chunks.filter(c => c.modules.includes(module));
        module.warnings = [];
        module.errors = [];
  
        if (isValidId(module.file)) {
          module.file = data.input.files.find(i => module.file === i.path)
        }
  
        if (module.deps) {
          module.deps.map(dep => {
            if (isValidId(dep.module)) {
              dep.module = data.input.modules.find(m => m.id === dep.module);
            }
          });
        }
  
        if (module.reasons) {
          module.reasons.map(reason => {
            if (isValidId(reason.module)) {
              reason.module = data.input.modules.find(m => m.id === reason.module);
            }
          });
        }
  
        if (module.concatenated) {
          module.concatenated = module.concatenated.map(concatenatedModule => {
            if (isValidId(concatenatedModule)) {
              return data.input.modules.find(m => m.id === concatenatedModule);
            }
  
            return concatenatedModule;
          });
        }
  
        if (module.extracted) {
          if (isValidId(module.extracted)) {
            module.extracted = data.input.modules.find(m => m.id === module.extracted);
          }
        }
      });
  
      data.warnings.forEach(createMessageHandler(data, 'warnings'));
      data.errors.forEach(createMessageHandler(data, 'errors'));
  
    return data;
  };