// ./library/JunAD.js

import crypto from 'crypto';

export const fileId = (depth) => {
    const id = crypto.randomBytes(4)
        .toString('hex').toUpperCase();
    if (!depth || depth <= 0) return `${id}.bin`
    const folder = id.substring(0, depth);
    return `${folder}/${id}.bin`;
};

export class Adapter {
    constructor(JunIO, depth) {
        this.JunIO = JunIO;
        this.depth = depth;
    }

    purge(index) {
        if (index.$file) this.JunIO
            .remove(index.$file);
        for (const key in index) {
            if (key === '$file') continue;
            if (index[key] && typeof index[key] === 'object')
                this.purge(index[key]);
        }
    }

    forge(index, value, file) {
        const Id = file || fileId(this.depth);
        value = structuredClone(value);
        index.$file = Id;

        for (const key in value) {
            const bool = typeof value[key] === 'object'
                && !Array.isArray(value[key]);
            if (value[key] && !bool) continue;
            index[key] = {};
            value[key] = this.forge(
                index[key],
                value[key]);
        }

        this.JunIO.write(
            Id, value);
        return Id;
    }
}