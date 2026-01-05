// ./library/JunIR.js

import { Adapter } from "./JunAD.js";

export class Index {
    constructor(JunIO) {
        this.JunIO = JunIO;
        this.data = this.JunIO.readSync(
            'index.bin') || {};
        this.data.$file = 'root.bin';
    }

    save() {
        this.JunIO.write(
            'index.bin',
            this.data);
    }
}

export class Root {
    constructor(JunIO, index) {
        this.JunIO = JunIO;
        this.index = index;
        this.Adater = new Adapter(JunIO);
    }

    get data() {
        const file = this.index.$file;
        if (this.JunIO.existsSync(file)) {
            return this.JunIO.readSync(
                this.index.$file);
        } else {
            this.JunIO.writeSync(file, {});
            return this.JunIO.readSync(file)
        }
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
            this.index[key] = {};
            const file = this.Adater.forge(
                this.index[key], value);
            this.data[key] = file;
        } else {
            this.data[key] = value;
        }

        this.JunIO.write(this.index
            .$file, this.data);
    }

    delete(key) {
        if (this.index[key]) {
            this.Adater.purge(this.index[key]);
            delete this.index[key];
        }
        delete this.data[key];
        this.JunIO.write(this.index
            .$file, this.data);
    }
}