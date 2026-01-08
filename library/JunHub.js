// ./library/JunHub.js

import { JunShard } from "./JunShard.js";

export class JunDoc {
    #count = 0;
    #timer = null;
    constructor(file, JunDrive, options = {}) {
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

export class JunMap extends JunDoc {
    constructor(JunDrive, options = {}) {
        super('index.bin', JunDrive, options);
        if (!this.data.$file) {
            this.data.$file = 'root.bin';
            this.save(true);
        }
    }

    get(...args) {
        return args.reduce((acc, k) =>
            acc?.[k], this.data) ?? false;
    }
}

export class JunHub {
    constructor(JunDrive, index, depth = 2) {
        this.JunDrive = JunDrive;
        this.index = index;

        this.Adater = new JunShard(JunDrive, depth);
        this.file = new JunDoc(this.index.$file,
            JunDrive, { limit: 5, delay: 3000 });
    }

    get data() {
        return this.file.data;
    }

    get(key) {
        const value = this.data[key];
        if (typeof value === 'string' && value.endsWith('.bin')) {
            if (!this.index[key]) this.index[key] = { $file: value };
            return { $file: value }
        }
        return value;
    }

    set(key, value) {
        if (this.index[key]) {
            this.Adater.purge(this.index[key]);
            delete this.index[key];
        }

        const isObject = value
            && typeof value === 'object'
            && !Array.isArray(value);

        if (isObject) {
            let tmpIndex = {}
            const file = this.Adater.forge(
                tmpIndex, value);

            if (file) {
                this.index[key] = tmpIndex;
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
        if (this.index[key]) {
            this.Adater.purge(this.index[key]);
            delete this.index[key];
        }
        delete this.data[key];
        this.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }
}