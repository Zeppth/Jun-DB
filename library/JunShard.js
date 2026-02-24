// ./library/JunShard.js

import crypto from 'crypto';

export const JunType = {
    NODE: 1,
    FUNCTION: 2,
    FILE: 3
}

export const JunCodec = {
    SIG: 0x4A554E,
    is(array) {
        return Array.isArray(array)
            && array[0] === this.SIG;
    },
    encode(type, data) {
        return [this.SIG, type, Date.now(),
        Buffer.from(data.toString()).toString('base64')]
    },
    decode(array) {
        if (array?.[0] !== this.SIG) return;
        return [array[1], array[2], Buffer.from(
            array[3], 'base64').toString('utf-8')]
    },
}

export class JunShard {
    constructor(JunDrive, JunMap, JunHub, depth) {
        this.JunDrive = JunDrive;
        this.JunMap = JunMap;
        this.JunHub = JunHub;
        this.depth = depth || 2;
    }

    static isObject(any) {
        if (!any) return false;
        if (typeof any !== 'object') return false;
        if (Array.isArray(any)) return false;
        const proto = Object.getPrototypeOf(any);
        return proto === Object.prototype
            || proto === null;
    }

    genId(depth) {
        depth = depth || this.depth;
        const id = crypto.randomBytes(6)
            .toString('hex').toUpperCase();
        if (!depth || depth <= 0) return `${id}`
        const folder = id.substring(0, depth);
        return `${folder}/${id}`;
    }

    forge(data, JunMap, JunHub) {
        if (!JunShard.isObject(data)) return;

        JunMap = JunMap || this.JunMap;
        JunHub = JunHub || this.JunHub;

        let mapContent = {};
        let hubContent = {};

        for (const key in data) {
            const value = data[key];

            if (JunShard.isObject(value)) {
                const Id = this.genId();
                const nodeFile = Id + '.node.bin';
                const mapFile = Id + '.map.bin';

                this.JunDrive.write(mapFile,
                    { $file: mapFile });

                const _JunMap = new this.JunMap
                    .constructor(this.JunDrive, mapFile);

                const _JunHub = new this.JunHub
                    .constructor(this.JunDrive, _JunMap);

                this.forge(value, _JunMap, _JunHub);

                hubContent[key] = JunCodec
                    .encode(1, nodeFile)
                mapContent[key] = mapFile;
            } else {
                hubContent[key] = value;
            }
        }

        Object.assign(JunMap
            .data, mapContent);
        Object.assign(JunHub
            .data, hubContent);

        JunMap.file.save();
        JunHub.file.save();
    }

    purge(mapPath) {
        if (!mapPath) return;
        if (typeof mapPath !== 'string') return;
        if (!mapPath.endsWith('.map.bin')) return;
        const mapData = this.JunDrive.readSync(mapPath);

        if (!mapData) return;
        for (const key in mapData) {
            if (key === '$file') continue;
            const childPath = mapData[key];
            this.purge(childPath);
        }

        const nodePath = mapPath.replace(
            '.map.bin', '.node.bin');

        this.JunDrive.remove(mapPath);
        this.JunDrive.remove(nodePath);
    }
}