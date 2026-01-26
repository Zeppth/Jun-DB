// ./library/core/JunFlow.js

import { JunShard } from '../JunShard.js';
import { JunDoc } from './JunDoc.js';

export class JunFlow {
    #options = null
    constructor(JunDrive, JunMap, options = {}) {
        this.afile = null;
        this.efile = null;
        this.JunDrive = JunDrive;
        this.#options = options;
        this.JunMap = JunMap;

        if (JunDrive.existsSync(JunMap.fileFlow)) {
            this.afile = new JunDoc(
                JunDrive, JunMap.fileFlow, {
                limit: options?.file?.limit || 2,
                delay: options.file?.delay || 3000
            })
        }
    }

    save() {
        return this.file.save();
    }

    get isFlow() {
        return this.afile ? true
            : this.efile ? true
                : false;
    }

    get file() {
        if (this.efile) return this.efile;
        if (this.afile) return this.afile;

        this.efile = new JunDoc(
            this.JunDrive, this.JunMap.fileFlow, {
            limit: this.#options?.file?.limit || 2,
            delay: this.#options?.file?.delay || 3000
        })

        return this.efile;
    }

    get data() {
        return this.file.data
    }

    get(key, key2) {
        if (!this.data[key]) return;

        const a0 = (o) => {
            if (typeof o !== 'string') return o;
            try { return eval(`(${o})`); } catch (e) {
                try { return eval(`(function ${o})`) }
                catch (e2) { return o }
            }
        };

        if (this.data[key] && !key2) {
            const v = {};
            for (const k in this.data[key]) {
                v[k] = a0(this.data[key][k]);
            }
            return v;
        } else if (this.data[key]?.[key2]) {
            return a0(this.data[key][key2]);
        }
    }

    set(key, value) {
        if (!JunShard.isObject(value)) return false;
        const target = (this.data[key] ||= {});
        for (const key in value) {
            if (typeof value[key] === 'function')
                target[key] = value[key].toString();
            else continue;
        }
        this.file.save()
        return true;
    }

    delete(key1, key2) {
        if (!this.data[key1]) return;
        if (this.data[key1] && !key2)
            delete this.data[key1];
        else if (this.data[key1]?.[key2]) {
            delete this.data[key1][key2];
            const keys = Object.keys(
                this.data[key1]);
            if (keys.length === 0)
                delete this.data[key1];
        }

        this.file.save();
        return true;
    }
}