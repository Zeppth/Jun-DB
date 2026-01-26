// ./library/JunHub.js

import { JunShard } from "./JunShard.js";

export class JunDoc {
    #count = 0;
    #timer = null;
    constructor(JunDrive, file, options = {}) {
        this.file = file;
        this.JunDrive = JunDrive;

        this._limit = options.limit ?? 10;
        this._delay = options.delay ?? 5000;
    }

    get data() {
        if (this.JunDrive.existsSync(this.file)) {
            return this.JunDrive.readSync(this.file);
        } else {
            this.JunDrive.writeSync(this.file, {});
            return this.JunDrive.readSync(this.file)
        }
    }

    save(force = false) {
        if (force || ++this.#count
            >= this._limit) {
            clearTimeout(this.#timer);
            this.#timer = null;
            this.#count = 0;
            return this.JunDrive.write(
                this.file, this.data);
        }

        clearTimeout(this.#timer);
        this.#timer = setTimeout(() =>
            this.save(true),
            this._delay);
    }
}

export class JunMap {
    constructor(JunDrive, options = {}) {
        this.JunDrive = JunDrive;

        // class JunDoc
        if (options?.$class?.JunDoc) {
            const a0 = options.$class.JunDoc;
            if (a0.constructor.name === 'Array') {
                this.file = new JunDoc(JunDrive,
                    'index.bin', ...a0);
            } else if (a0.constructor.name === 'Object') {
                this.file = new JunDoc(JunDrive,
                    'index.bin', a0);
            } else this.file = a0;
        }

        if (!this.file) {
            this.file = new JunDoc(JunDrive, 'index.bin', {
                limit: options?.file?.limit || 10,
                delay: options.file?.delay || 5000
            });
        }

        this.data = this.file.data;
        if (!this.data.$file) {
            this.data.$file = 'root.bin';
            this.save();
        }
    }

    get(...args) {
        return args.reduce((acc, k) =>
            acc?.[k], this.data) ?? false;
    }

    save() {
        return this.file.save();
    }
}

export class JunHub {
    constructor(JunDrive, JunMap, options = {}) {
        this.JunDrive = JunDrive;
        this.JunMap = JunMap;

        // class JunShard
        if (options.$class?.JunShard) {
            const a0 = options.$class.JunShard;
            if (a0.constructor.name === 'Array') {
                this.JunShard = new JunShard(JunDrive, ...a0);
            } else if (a0.constructor.name === 'Number') {
                this.JunShard = new JunShard(JunDrive, a0);
            } else this.JunShard = a0;
        }

        // class JunDoc
        if (options?.$class?.JunDoc) {
            const a0 = options.$class.JunDoc;
            if (a0.constructor.name === 'Array') {
                this.file = new JunDoc(JunDrive,
                    this.JunMap.$file, ...a0);
            } else if (a0.constructor.name === 'Object') {
                this.file = new JunDoc(JunDrive,
                    this.JunMap.$file, a0);
            } else this.file = a0;
        }

        if (!this.JunShard) {
            this.JunShard = new JunShard(
                JunDrive, options?.shard?.depth || 2);
        }

        if (!this.file) {
            this.file = new JunDoc(JunDrive, this.JunMap.$file, {
                limit: options?.file?.limit || 5,
                delay: options.file?.delay || 3000
            });
        }
    }

    get data() {
        return this.file.data;
    }

    get(key) {
        const value = this.data[key];
        if (typeof value === 'string' && value.endsWith('.bin')) {
            if (!this.JunMap[key]) this.JunMap[key] = { $file: value };
            return { $file: value }
        }
        return value;
    }

    set(key, value) {
        if (this.JunMap[key]) {
            this.JunShard.purge(this.JunMap[key]);
            delete this.JunMap[key];
        }

        let isObject

        if (value && typeof value === 'object') {
            const proto = Object.getPrototypeOf(value);
            isObject = (proto === Object.prototype
                || proto === null);
        }

        if (isObject) {
            let tmpIndex = {}
            const file = this.JunShard.forge(
                tmpIndex, value);

            if (file) {
                this.JunMap[key] = tmpIndex;
                this.data[key] = file;
            } else {
                return false;
            }
        } else {
            this.data[key] = value;
        }

        this.file.save();
    }

    delete(key) {
        if (this.JunMap[key]) {
            this.JunShard.purge(this.JunMap[key]);
            delete this.JunMap[key];
        }
        delete this.data[key];
        this.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }
}