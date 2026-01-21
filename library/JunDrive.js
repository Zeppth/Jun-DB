// ./library/JunDrive.js

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

import { JunRAM } from './JunRAM.js';
import { syncIO, asyncIO } from './JunIO.js';

export class JunDrive {
    constructor(options = {}) {
        if (options.constructor.name !== 'Object')
            throw new Error('Invalid options');

        //////////
        if (options?.$class?.syncIO) {
            const a0 = options.$class.syncIO;
            if (a0.constructor.name == 'Array') {
                this.syncIO = new syncIO(...a0);
            } else this.syncIO = a0
        }

        if (options?.$class?.asyncIO) {
            const a0 = options.$class.asyncIO;
            if (a0.constructor.name == 'Array') {
                this.asyncIO = new asyncIO(...a0);
            } else this.asyncIO = a0
        }

        if (options?.$class?.JunRAM?.maps) {
            const a0 = options.$class.JunRAM.maps;
            if (a0.constructor.name == 'Array') {
                this.mapsRam = new JunRAM(...a0);
            } else this.mapsRam = a0
        }

        if (options?.$class?.JunRAM?.nodes) {
            const a0 = options.$class.JunRAM.nodes;
            if (a0.constructor.name == 'Array') {
                this.nodesRam = new JunRAM(...a0);
            } else this.nodesRam = a0
        }


        //////////
        if (!this.syncIO) {
            this.syncIO = new syncIO(
                options.folder);
        }

        if (!this.asyncIO) {
            this.asyncIO = new asyncIO(
                options.folder);
        }

        if (!this.mapsRam) {
            const files = ['root.map.bin'];
            const memory = options.memory?.maps || 5;
            this.mapsRam = new JunRAM(memory, files);
        }

        if (!this.nodesRam) {
            const files = ['root.node.bin'];
            const memory = options.memory?.nodes || 20;
            this.nodesRam = new JunRAM(memory, files);
        }

        //////////
        if (!options.folder) options.folder = './data';

        this.basePath = path.resolve(options.folder);

        this.nodesPath = path.join(this.basePath, 'nodes');
        this.mapsPath = path.join(this.basePath, 'maps');

        const folders = [
            this.basePath,
            this.nodesPath,
            this.mapsPath
        ]

        folders.forEach(dir => {
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, {
                    recursive: true
                });
        });
    }

    #a0(filename) {
        let ram = null;
        let $path = null;

        if (this.mapsRam.pinnedKeys.has(filename)) {
            $path = path.join(this.basePath, filename);
            ram = this.mapsRam;
        } else if (this.nodesRam.pinnedKeys.has(filename)) {
            $path = path.join(this.basePath, filename);
            ram = this.nodesRam;
        } else if (filename.endsWith('map.bin')) {
            ram = this.mapsRam;
            $path = path.join(this.mapsPath, filename);
        } else if (filename.endsWith('node.bin')) {
            ram = this.nodesRam;
            $path = path.join(this.nodesPath, filename);
        }

        return {
            ram: ram,
            path: $path,
        }
    }

    //////////////////////

    readSync(filename) {
        const { ram, path } = this.#a0(filename);
        const cached = ram.get(filename);
        if (cached) return cached;
        const data = this.syncIO.read(path);
        ram.set(filename, data);
        return data;

    }

    writeSync(filename, data = {}) {
        const { ram, path } = this.#a0(filename);
        this.syncIO.write(path, data);
        ram.set(filename, data);
        return true;
    }

    removeSync(filename) {
        const { ram, path } = this.#a0(filename);
        this.syncIO.remove(path);
        ram.delete(filename);
        return true;
    }


    existsSync(filename) {
        const { ram, path } = this.#a0(filename);
        if (ram.has(filename)) return true;
        return this.syncIO.exists(path);
    }

    //////////////////////

    async read(filename) {
        const { ram, path } = this.#a0(filename);
        const cached = ram.get(filename);
        if (cached) return cached;
        const data = await this.asyncIO.read(path);
        ram.set(filename, data);
        return data;
    }

    async write(filename, data = {}) {
        const { ram, path } = this.#a0(filename);
        ram.set(filename, data);
        return this.asyncIO.write(path, data);
    }

    async remove(filename) {
        const { ram, path } = this.#a0(filename);
        ram.delete(filename);
        return this.asyncIO.remove(path);
    }

    async exists(filename) {
        const { ram, path } = this.#a0(filename);
        if (ram.has(filename)) return true;
        return this.asyncIO.exists(path);
    }

    //////////////////////

    async flush() {
        return await this
            .asyncIO.flush();
    }

    async prune() {
        return this.asyncIO.queue('__maint__', async () => {
            const scan = async (d) => {
                const items = await fsp.readdir(d,
                    { withFileTypes: true });
                for (const i of items) if (i.isDirectory())
                    await scan(path.join(d, i.name));
                if (d !== this.nodesPath && d !== this.basePath &&
                    !(await fsp.readdir(d)).length)
                    await fsp.rmdir(d).catch(() => null);
            };

            if (fs.existsSync(this.nodesPath))
                await scan(this.nodesPath);
            if (fs.existsSync(this.mapsPath))
                await scan(this.mapsPath);
        });
    }
}
