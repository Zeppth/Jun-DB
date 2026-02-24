// ./library/core/JunHub.js

import { JunShard, JunType } from '../JunShard.js';
import { JunNode } from './JunNode.js';
import { JunCodec } from '../JunShard.js';


export class JunHub {
    constructor(JunDrive, JunMap, options = {}) {
        this.JunMap = JunMap
        this.JunDrive = JunDrive
        this.JunNode = new JunNode(
            JunDrive, JunMap, options)
        this.JunShard = new JunShard(
            JunDrive, JunMap, this.JunNode)
    }

    get data() {
        return this.JunNode.data;
    }

    get(key) {
        const value = this.data[key];

        if (JunCodec.is(value)
            && value[1] === JunType.NODE) {
            const data = JunCodec.decode(value);
            if (!this.JunMap.get(key)) this
                .JunMap.set(key, data[2]);
        }

        return value;
    }

    set(key, value) {
        if (this.JunMap.get(key))
            this.delete(key);
        if (JunShard.isObject(value)) {
            this.JunShard.forge({ [key]: value },
                this.JunMap, this.JunNode);
        } else if (typeof value === 'function') {
            this.data[key] = JunCodec.encode(2, value);
        } else this.data[key] = value;
        this.JunNode.file.save();
    }

    delete(key) {
        const map = this.JunMap.get(key);

        if (map) {
            this.JunShard.purge(map);
            this.JunMap.delete(key);
        }

        delete this.data[key];
        this.JunNode.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }
}