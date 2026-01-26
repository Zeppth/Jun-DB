// ./library/core/JunHub.js

import { JunShard } from '../JunShard.js';
import { JunFlow } from './JunFlow.js';
import { JunNode } from './JunNode.js';


export class JunHub {
    constructor(JunDrive, JunMap, options = {}) {
        this.JunMap = JunMap
        this.JunDrive = JunDrive

        this.JunFlow = new JunFlow(JunDrive, JunMap)
        this.JunNode = new JunNode(JunDrive, JunMap, options)

        this.JunShard = new JunShard(
            JunDrive, JunMap, this.JunNode)
    }

    get data() {
        return this.JunNode.data;
    }

    get(key) {
        const value = this.data[key];

        if (typeof value === 'string'
            && value.startsWith('node:')
            && value.endsWith('.node.bin')
            && this.JunMap.get(value)) {
            this.JunMap.set(key, value);
        }

        return value;
    }

    set(key, value) {
        if (this.JunMap.get(key))
            this.delete(key);

        if (JunShard.isObject(value)) {
            this.JunShard.forge({ [key]: value },
                this.JunMap, this.JunNode);
        } else {
            this.data[key] = value;
            this.JunNode.file.save();
        }
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