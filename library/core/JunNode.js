// ./library/core/JunNode.js

import { JunDoc } from "./JunDoc.js";

export class JunNode {
    constructor(JunDrive, JunMap, options = {}) {
        this.JunDrive = JunDrive;
        this.file = new JunDoc(
            JunDrive, JunMap.fileNode, {
            limit: options?.file?.limit || 10,
            delay: options.file?.delay || 5000
        });
    }

    save() { return this.file.save(); }
    keys() { return Object.keys(this.data); }
    get data() { return this.file.data; }
    get(key) { return this.data[key] }

    set(key, value) {
        this.data[key] = value;
        this.file.save();
    }

    delete(key) {
        delete this.data[key];
        this.file.save();
    }
}