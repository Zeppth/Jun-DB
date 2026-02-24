// ./library/core/JunMap.js

import { JunDoc } from "./JunDoc.js";

export class JunMap {
    constructor(JunDrive, file, options = {}) {
        this.JunDrive = JunDrive;

        this.fileMap = file
        this.fileNode = this.fileMap.replace(
            '.map.bin', '.node.bin');
        this.file = new JunDoc(JunDrive, this.fileMap, {
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