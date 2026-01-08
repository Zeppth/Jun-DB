// ./library/JunAD.js

import crypto from 'crypto';

export const genId = (depth) => {
    const id = crypto.randomBytes(4)
        .toString('hex').toUpperCase();
    if (!depth || depth <= 0) return `${id}.bin`
    const folder = id.substring(0, depth);
    return `${folder}/${id}.bin`;
};

export class JunShard {
    constructor(JunDrive, depth) {
        this.JunDrive = JunDrive;
        this.depth = depth;
    }

    purge(index) {
        if (index.$file) this.JunDrive
            .remove(index.$file);
        for (const key in index) {
            if (key === '$file') continue;
            if (index[key] && typeof index[key] === 'object')
                this.purge(index[key]);
        }
    }

    forge(index, value, file) {
        try {
            const Id = file || genId(this.depth);
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

            this.JunDrive.write(
                Id, value);
            return Id;
        } catch (e) {
            this.JunDrive
                .onError(e.message);
            return null
        }
    }
}
