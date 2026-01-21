import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import v8 from 'v8';

export class syncIO {
    constructor(folder) {
        this.base = folder;
        if (!fs.existsSync(this.base)) fs
            .mkdirSync(this.base, { recursive: true });
    }

    #catch(fn) {
        try { return fn() } catch (e) {
            console.error(e); return null
        }
    }

    read(filePath) {
        return this.#catch(() => {
            const buffer = fs.readFileSync(filePath);
            const data = v8.deserialize(buffer);
            return data;
        })
    }

    write(filePath, data = {}) {
        return this.#catch(() => {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(
                dir, { recursive: true });
            const tempPath = filePath + '.tmp';
            const buffer = v8.serialize(data);
            const fd = fs.openSync(tempPath, 'w');
            fs.writeSync(fd, buffer);
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fs.renameSync(
                tempPath,
                filePath);
            return true;
        })
    }

    remove(filePath) {
        return this.#catch(() => {
            if (fs.existsSync(filePath)) fs.rmSync(filePath,
                { recursive: true, force: true });
            return true;
        })
    }


    exists(filePath) {
        return fs.existsSync(filePath);
    }
}

///////////////////////

export class asyncIO {
    constructor(folder) {
        this.base = folder;
        this.Pipe = new Map();

        if (!fs.existsSync(this.base)) fs
            .mkdirSync(this.base, { recursive: true });
    }

    async queue(filename, action) {
        const next = (this.Pipe.get(filename) || Promise.resolve())
            .then(() => action().catch((e) => console.error(e))).finally(() =>
                (this.Pipe.get(filename) === next) ? this.Pipe.delete(filename) : false);
        return this.Pipe.set(filename, next).get(filename);
    }


    async read(filePath) {
        return this.queue(filePath, async () => {
            const buffer = await fsp.readFile(filePath);
            return v8.deserialize(buffer);
        });
    }

    async write(filePath, data = {}) {
        return this.queue(filePath, async () => {
            const dir = path.dirname(filePath);
            await fsp.mkdir(dir, { recursive: true });
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

    async remove(filePath) {
        return this.queue(filePath, async () => {
            await fsp.rm(filePath, {
                recursive: true, force: true
            });
            return true;
        });
    }

    async exists(filePath) {
        return await fsp.access(filePath)
            .then(() => true).catch(
                () => null)
    }

    async flush() {
        await Promise.all(this
            .Pipe.values());
        return true;
    }
}