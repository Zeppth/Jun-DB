// ./library/JunHub.js

import { JunShard } from './JunShard.js';

export class JunDoc {
    #count = 0;
    #timer = null;
    constructor(JunDrive, file, options = {}) {
        this.file = file;
        this.JunDrive = JunDrive;

        this._limit = options
            .limit ?? 10;
        this._delay = options
            .delay ?? 5000;
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
    constructor(JunDrive, file, options = {}) {
        file = file || 'root.map.bin';
        this.JunDrive = JunDrive;

        // class JunDoc
        if (options?.$class?.JunDoc) {
            const a0 = options.$class.JunDoc;
            if (a0.constructor.name === 'Array') {
                this.file = new JunDoc(JunDrive, file, ...a0);
            } else if (a0.constructor.name === 'Object') {
                this.file = new JunDoc(JunDrive, file, a0);
            } else this.file = a0;
        }

        if (!this.file) this.file = new JunDoc(
            JunDrive, file, {
            limit: options?.file?.limit || 10,
            delay: options.file?.delay || 5000
        });

        ///////////

        this.data = this.file.data;
        if (!this.data.$file)
            this.data.$file = file;
    }

    get(key) {
        if (typeof key == 'string') {
            return this.data[key] ?? false;
        } else return false;
    }

    set(key, value) {
        this.data[key] = value;
        this.file.save();
    }

    delete(key) {
        delete this.data[key];
        this.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }

    save() {
        this.file.save();
    }
}

export class JunHub {
    constructor(JunDrive, JunMap, options = {}) {
        this.JunDrive = JunDrive;
        const mapFile = JunMap.get('$file');
        const nodeFile = mapFile.replace(
            '.map.bin', '.node.bin');

        // class JunDoc
        if (options?.$class?.JunDoc) {
            const a0 = options.$class.JunDoc;
            if (a0.constructor.name === 'Array') {
                this.file = new JunDoc(JunDrive, nodeFile, ...a0);
            } else if (a0.constructor.name === 'Object') {
                this.file = new JunDoc(JunDrive, nodeFile, a0);
            } else this.file = a0;
        }

        if (!this.file) this.file = new JunDoc(
            JunDrive, nodeFile, {
            limit: options?.file?.limit || 10,
            delay: options.file?.delay || 5000
        });
    }

    get data() {
        return this.file.data;
    }

    get(key) {
        if (typeof key == 'string') {
            return this.data[key] ?? false;
        } else return false;
    }

    set(key, value) {
        this.data[key] = value;
        this.file.save();
    }

    delete(key) {
        delete this.data[key];
        this.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }

    save() {
        this.file.save();
    }
}


export class JunNode {
    constructor(JunDrive, JunMap, options = {}) {
        this.JunMap = JunMap
        this.JunDrive = JunDrive

        if (options?.$class?.JunHub) {
            const a0 = options.$class.JunHub;
            if (a0.constructor.name === 'Array') {
                this.JunHub = new JunHub(...a0);
            } else if (a0.constructor.name === 'Object') {
                this.JunHub = new JunHub(JunDrive, JunMap, a0);
            } else this.JunHub = a0;
        }

        if (options?.$class?.JunShard) {
            const a0 = options.$class.JunShard;
            if (a0.constructor.name === 'Array') {
                this.JunShard = new JunShard(JunDrive,
                    this.JunMap, this.JunHub, ...a0)
            } else if (a0.constructor.name === 'Object') {
                this.JunShard = new JunShard(JunDrive,
                    this.JunMap, this.JunHub, a0)
            } else this.JunShard = a0;
        }

        if (!this.JunShard) this.JunShard = new JunShard(JunDrive,
            this.JunMap, this.JunHub, options.shard?.depth || 2)

        if (!this.JunHub) this.JunHub = new JunHub(
            JunDrive, JunMap, options)
    }

    get data() {
        return this.JunHub.data;
    }

    get(key) {
        return this.data[key];
    }

    set(key, value) {
        if (this.JunMap.get(key)) this.delete(key);

        if (this.JunShard.isObject(value)) {
            this.JunShard.forge({ [key]: value },
                this.JunMap, this.JunHub);
        } else {
            this.data[key] = value;
            this.JunHub.file.save();
        }
    }

    delete(key) {
        const map = this.JunMap.get(key);

        if (map) {
            this.JunShard.purge(map);
            this.JunMap.delete(key);
            delete this.data[key];
            this.JunHub.file.save();
        } else {
            delete this.data[key];
            this.JunHub.file.save();
        }
    }

    keys() {
        return Object.keys(this.data);
    }
}