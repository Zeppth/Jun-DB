// ./library/JunIO.js

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import v8 from 'v8';

import { JunCC } from './JunCC.js';

export class JunIO {
    constructor(options = {}) {
        this.Pipe = new Map();
        this.basePath = path.resolve(options.folder);
        this.RAM = new JunCC(options.memoryLimit);
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath,
                { recursive: true });
        }
    }

    readSync(filename) {
        const cached = this
            .RAM.get(filename);
        if (cached) return cached;
        const filePath = path.join(
            this.basePath, filename);

        try {
            const buffer = fs.readFileSync(filePath);
            const data = v8.deserialize(buffer);
            this.RAM.set(filename, data);
            return data;
        } catch (e) {
            return null;
        }
    }

    writeSync(filename, data = {}) {
        const filePath = path.join(
            this.basePath, filename);
        const tempPath = filePath + '.tmp';
        const buffer = v8.serialize(data);
        const fd = fs.openSync(tempPath, 'w');
        fs.writeSync(fd, buffer);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tempPath, filePath);
        this.RAM.set(filename, data);
        return true;
    }

    removeSync(filename) {
        const filePath = path.join(
            this.basePath, filename);
        if (fs.existsSync(filePath))
            fs.rmSync(filePath, {
                recursive: true,
                force: true
            });

        this.RAM.delete(filename);
        return true;
    }

    existsSync(filename) {
        if (this.RAM.has(filename)) return true;
        return fs.existsSync(path
            .join(this.basePath, filename));
    }


    //////////////////////

    async #pipe(filename, action) {
        const next = (this.Pipe.get(filename) || Promise.resolve())
            .then(() => action().catch(() => null)).finally(() =>
                (this.Pipe.get(filename) === next) ? this.Pipe
                    .delete(filename) : false);
        return this.Pipe.set(filename, next).get(filename);
    }


    async read(filename) {
        const cached = this
            .RAM.get(filename);
        if (cached) return cached;

        return this.#pipe(filename, async () => {
            const filePath = path.join(this.basePath, filename);
            try {
                const buffer = await fsp.readFile(filePath);
                const data = v8.deserialize(buffer);
                this.RAM.set(filename, data);
                return data;
            } catch (e) {
                return null;
            }
        });
    }

    async write(filename, data = {}) {
        this.RAM.set(filename, data);

        return this.#pipe(filename, async () => {
            const filePath = path.join(this.basePath, filename);
            const tempPath = filePath + '.tmp';
            const buffer = v8.serialize(data);
            const handle = await fsp.open(tempPath, 'w');
            await handle.write(buffer);
            await handle.sync();
            await handle.close();
            await fsp.rename(tempPath, filePath);
            return true;
        });
    }

    async remove(filename) {
        this.RAM.delete(filename);
        return this.#pipe(filename, async () => {
            const filePath = path.join(this.basePath, filename);
            await fsp.rm(filePath, { recursive: true, force: true });
            return true;
        });
    }

    async exists(filename) {
        if (this.RAM.has(filename)) return true;
        try {
            await fsp.access(path.join(
                this.basePath, filename));
            return true;
        } catch {
            return false;
        }
    }

    async flush() {
        await Promise.all(this.Pipe.values());
        return true;
    }
}