// ./library/JunDrive.js
import fs from 'fs';
import path from 'path';
import v8 from 'v8';
import { open } from 'lmdb';
import { JunRAM } from './JunRAM.js';

export class JunDrive {
    constructor(options = {}) {
        options.folder = options.folder || './data';
        options.memory = options.memory || 50;
        this.basePath = path.resolve(options.folder);
        if (!fs.existsSync(this.basePath)) fs.mkdirSync(this.basePath, { recursive: true });
        this.db = open({ path: this.basePath, compression: true, encoding: 'binary' });
        this.mapsRam = new JunRAM(options.memory * 0.10, ['root.map.bin']);
        this.nodesRam = new JunRAM(options.memory * 0.90, ['root.node.bin']);
    }

    #a0(filename) {
        if (filename?.endsWith('map.bin')) return this.mapsRam;
        else if (filename?.endsWith('node.bin')) return this.nodesRam;
        else throw new Error('Invalid filename');
    }

    #encode(data) { return v8.serialize(data); }
    #decode(buffer) { return buffer ? v8.deserialize(buffer) : null; }

    writeSync(filename, data = {}) {
        const ram = this.#a0(filename);
        const buffer = this.#encode(data);
        ram.set(filename, data, buffer.length);
        this.db.putSync(filename, buffer);
        return true;
    }

    async write(filename, data = {}) {
        const ram = this.#a0(filename);
        const buffer = this.#encode(data);
        ram.set(filename, data, buffer.length);
        await this.db.put(filename, buffer);
        return true;
    }

    readSync(filename) {
        const ram = this.#a0(filename);
        const cached = ram.get(filename);
        if (cached) return cached;
        const buffer = this.db.getBinary(filename);
        if (!buffer) return null;
        const data = this.#decode(buffer);
        ram.set(filename, data, buffer.length);
        return data;
    }

    async read(filename) { return this.readSync(filename); }
    removeSync(key) { this.#a0(key).delete(key); this.db.removeSync(key); return true; }
    async remove(key) { this.#a0(key).delete(key); await this.db.remove(key); return true; }
    existsSync(key) { return this.#a0(key).has(key) || this.db.doesExist(key); }
    async exists(key) { return this.existsSync(key); }
    async flush() { return this.db.flushed; }
    async prune() { return true; }
}