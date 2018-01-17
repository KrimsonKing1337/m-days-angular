const fs = require('fs');
const File = require('./File');

class Dir {
    constructor() {

    }

    /**
     *
     * @param path {string}
     * @returns {Promise<any>}
     */
    static checkExist(path) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    /**
     *
     * @param path {string}
     */
    static ls(path) {
        return new Promise(((resolve, reject) => {
            fs.readdir(path, (err, files) => {
                if (err) throw err;
                resolve(files);
            });
        }));
    }

    static lsSync(path) {
        return fs.readdirSync(path);
    }

    /**
     * R = recursive
     * @param path
     * @returns {Array}
     */
    static readDir (path) {
        const allFiles = [];

        function R (path) {
            const files = Dir.lsSync(path);

            files.forEach((fileCur) => {
                const fileCurFullPath = `${path}/${fileCur}`;
                const stats = fs.statSync(fileCurFullPath);

                if (stats.isFile()) {
                    allFiles.push(File.getInfo(fileCurFullPath));
                } else if (stats.isDirectory()) {
                    R(fileCurFullPath);
                }
            });
        }

        R(path);

        return allFiles;
    }
}

module.exports = Dir;