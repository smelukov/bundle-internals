const crypto = require('crypto');

module.exports = {
    isObject,
    getFileHash,
    cloneArray,
    deepExtend,
    unixpath
};

function isObject(obj) {
    return typeof obj == 'object' && obj;
}

function getFileHash(fs, filepath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filepath);

        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function cloneArray(array) {
    return array.map(function (el) {
        if (Array.isArray(el)) {
            return cloneArray(el);
        }

        if (isObject(el) && el.constructor == Object) {
            return deepExtend({}, el);
        }

        return el;
    });
}

function deepExtend(target) {
    var sources = Array.prototype.slice.call(arguments, 1);

    if (typeof target != 'object' || !target) {
        return;
    }

    for (var i = 0; i < sources.length; i++) {
        var source = sources[i];

        if (isObject(source)) {
            for (var sourceKey in source) {
                if (Object.prototype.hasOwnProperty.call(source, sourceKey)) {
                    var value = source[sourceKey];

                    if (Array.isArray(value)) {
                        target[sourceKey] = cloneArray(value);
                    } else if (isObject(value) && value.constructor == Object) {
                        target[sourceKey] = deepExtend({}, value);
                    } else {
                        target[sourceKey] = value;
                    }
                }
            }
        }
    }

    return target;
}

function unixpath(value) {
    if (typeof value === 'string' && process.platform === 'win32') {
        return value
            .replace(/(^|!)[a-z]+:/gi, '$1')
            .replace(/\\/g, '/');
    }

    return value;
}
