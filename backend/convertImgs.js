const appRoot = require('app-root-path');
const fs = require('fs-extra');
const gm = require('gm');
const exiftool = require('node-exiftool');
const ep = new exiftool.ExiftoolProcess();
const eachLimit = require('async/eachLimit');
const eachSeries = require('async/eachSeries');
const Img = require('./Img');
const Dir = require('./Dir');
const File = require('./File');
const randomString = require('./randomString');

class ConvertImgs {
    /**
     *
     * @param imgsPath {string}
     * @param imgsDonePath {string}
     */
    constructor ({imgsPath, imgsDonePath} = {}) {
        this.imgsPath = imgsPath;
        this.imgsDonePath = imgsDonePath;
        this.widthArr = [
            640,
            1280,
            1600,
            1920,
            2560,
            3840,
            5210,
            7680
        ];
    }

    /**
     * @private
     * @param img {object}
     * @param img.fullPath {string}
     * @returns {Promise}
     */
    async setupTargets (img) {
        const info = {};
        const newSize = [];

        info.size = await Img.getInfo(img.fullPath, 'size');
        info.format = await Img.getInfo(img.fullPath, 'format');

        const width = info.size.width;
        const height = info.size.height;
        const delta = (width / height);

        if (width < 640) {
            console.log(`${img.fullPath} is too small, skipped;`);
            return;
        }

        if (delta < 1 || delta > 2) {
            //todo: проверить, что отрабатывает корректно
            const tryToSquareResult = await ConvertImgs.tryToSquare({
                img,
                size: info.size
            });

            console.log(`${img.fullPath} is not valid due size;`);

            if (tryToSquareResult !== false) {
                img = tryToSquareResult;

                console.log(`${img.fullPath} was cropped to square;`);
            }
        }

        const maxWidth = ConvertImgs.getMaxWidth(width);

        this.widthArr.forEach((widthCur) => {
            if (maxWidth >= widthCur) newSize.push(widthCur);
        });

        const target = {
            img,
            size: newSize
        };

        return Promise.resolve(target);
    }

    /**
     *
     * @param img {object}
     * @param img.fullPath {string}
     * @param img.nameWithoutExt {string}
     * @param size {object}
     * @returns {Promise}
     */
    static tryToSquare ({img, size} = {}) {
        const cropVal = size.height < size.width ? size.height : size.width;

        return new Promise(((resolve, reject) => {
            gm(img.fullPath).gravity('Center').crop(cropVal, cropVal)
                .write(img.fullPath, async (err) => {
                    if (err) throw err;

                    const size = await Img.getInfo(img.fullPath, 'size');

                    if (size.width < 640) {
                        resolve(false);
                    } else {
                        resolve(File.getInfo(img.fullPath));
                    }
                });
        }));
    }

    /**
     * @private
     * @param width {number}
     */
    static getMaxWidth (width) {
        if (width >= 640 && width < 1280) return 640;
        else if (width >= 1280 && width < 1600) return 1280;
        else if (width >= 1600 && width < 1920) return 1600;
        else if (width >= 1920 && width < 2560) return 1920;
        else if (width >= 2560 && width < 3840) return 2560;
        else if (width >= 3840 && width < 5210) return 3840;
        else if (width >= 5210 && width < 7680) return 5210;
        else if (width >= 7680) return 7680;
    }

    /**
     *
     * @param img {object}
     * @param img.fullPath {string}
     * @param img.name {string}
     * @param img.ext {string}
     * @param size[] {string}
     */
    prepareToConvert ({img, size} = {}) {
        return new Promise((resolve, reject) => {
            //todo: попробовать eachLimit вместо eachSeries
            eachSeries(size, (sizeCur, next) => {
                const newName = randomString();
                const imgCurDoneDir = `${this.imgsDonePath}/${sizeCur}`;
                const newFullName = `${imgCurDoneDir}/${newName}.jpg`;
                Dir.checkExist(imgCurDoneDir);

                this.convert({
                    img,
                    size: sizeCur,
                    newName,
                    newFullName
                }).then(() => {
                    next();
                });
            }, (err) => {
                if (err) throw err;

                console.log(`done with ${img.name}`);

                resolve();
            });
        });
    }

    /**
     * @private
     * @param img {object}
     * @param img.fullPath {string}
     * @param img.name {string}
     * @param img.ext {string}
     * @param size {string}
     * @param newName {string}
     * @param newFullName {string}
     * @returns {Promise<[any]>}
     */
    convert ({img, size, newName, newFullName} = {}) {
        return new Promise(((resolve, reject) => {
            gm(img.fullPath).channel('gray').resize(size).quality(75)
                .write(`${newFullName}`, (err) => {
                    if (err) throw err;

                    //ConvertImgs.ReadMetaData(newFullName);
                    //todo: delete = writeMetadata with ['overwrite_original'] option

                    console.log(`${img.name} converted to ${size}/${newName}.jpg`);

                    resolve();
                });
        }));
    }

    static ReadMetaData (img) {
        ep
            .open()
            // display pid
            .then((pid) => console.log('Started exiftool process %s', pid))
            .then(() => ep.readMetadata(img, ['-File:all']))
            .then(console.log, console.error)
            .then(() => ep.close())
            .then(() => console.log('Closed exiftool'))
            .catch(console.error);
    }

    async start () {
        /**
         * empty folder before convert.
         * it's need because of random name for
         * each new converted image.
         * so if not empty there will many duplicate
         */
        try {
            await fs.emptyDir(this.imgsDonePath);
            console.log(`${this.imgsDonePath} is now empty;`);
        } catch (err) {
            throw err;
        }

        const imgsList = Dir.readDir({
            path: this.imgsPath,
            formats: ['bmp', 'gif', 'jng', 'jp2', 'jpc', 'jpeg', 'jpg', 'png', 'ptif', 'tiff']
        });

        //todo: раскидать всё, что ниже по методам

        const targetsPromisesArr = [];

        imgsList.forEach((imgCur) => {
            targetsPromisesArr.push(this.setupTargets(imgCur));
        });

        const targets = await Promise.all(targetsPromisesArr);

        eachSeries(targets, (targetCur, next) => {
            const promise = this.prepareToConvert(targetCur);
            promise.then(() => {
                next();
            });
        }, (err) => {
            if (err) throw err;

            console.log('done');
        });
    }
}

const convert = new ConvertImgs({
    imgsPath: `${appRoot}/public/img_bg_sources`,
    imgsDonePath: `${appRoot}/public/img_bg`
});

convert.start();