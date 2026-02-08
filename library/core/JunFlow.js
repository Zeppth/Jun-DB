// ./library/core/JunFlow.js

import { JunShard } from '../JunShard.js';
import { JunDoc } from './JunDoc.js';

export class JunFlow {
    constructor(JunDrive, JunMap, options = {}) {
        this.afile = null;
        this.efile = null;
        this.JunDrive = JunDrive;
        this.JunMap = JunMap;

        this.args = [JunDrive, JunMap.fileFlow, {
            limit: options?.file?.limit || 2,
            delay: options.file?.delay || 3000
        }]

        if (JunDrive.existsSync(JunMap.fileFlow)) {
            this.afile = new JunDoc(...this.args)
        }

        this.codec = {
            serialize: (fun) => {
                return fun.toString()
            },
            deserialize: (string) => {
                const cleanSource = `return ${string}\n//# sourceURL=JunDB_UserLogic.js`;
                return new Function(cleanSource)();

            }
        }
    }

    get data() { return this.file.data }
    get isFlow() { return !!(this.afile ?? this.efile) }

    get file() {
        if (this.efile) return this.efile;
        if (this.afile) return this.afile;
        this.efile = new JunDoc(...this.args)
        return this.efile;
    }

    get call() {
        return {
            get: (key) => {
                if (!this.isFlow) return;

                const call = (this
                    .data.call ||= {})
                const _call = call[key];
                if (_call === undefined) return;
                try { return this.codec.deserialize(_call) }
                catch (e) { console.error('JunFlow.call.get', e) }
            },
            define: (a0, a1) => {
                const call = (this.data.call ||= {})

                if (JunShard.isObject(a0)) for (const key in a0) {
                    if (typeof a0[key] !== 'function') continue;
                    try { call[key] = this.codec.serialize(a0[key]) }
                    catch (e) { console.error('JunFlow.call.define', e) }
                    this.file.save();

                } else if (a0 && (typeof a1 === 'function')) {
                    call[a0] = this.codec.serialize(a1)
                    this.file.save();
                } else return false;
            },
            remove: (key) => {
                const call = (this
                    .data.call ||= {})

                if (!key === undefined) {
                    delete this.data.call;
                } else if (call[key]) {
                    delete call[key]
                }

                if (Object.keys(call).length === 0) {
                    delete this.data.call;
                    if (Object.keys(this.data).length === 0) {
                        this.JunDrive.remove(this
                            .JunMap.fileFlow);
                    }
                }

                this.file.save();
                return true;
            }
        }
    }

    get proxy() {
        return {
            get: (key) => {
                if (!this.isFlow) return;

                const proxy = (this
                    .data.proxy ||= {})
                const _proxy = proxy[key];
                if (_proxy === undefined) return;
                try { return this.codec.deserialize(_proxy); }
                catch (e) { console.error('JunFlow.proxy.get', e) }
            },
            define: (a0, a1) => {
                const proxy = (this.data.proxy ||= {})

                if (JunShard.isObject(a0)) for (const key in a0) {
                    if (typeof a0[key] !== 'function') continue;
                    try { proxy[key] = this.codec.serialize(a0[key]) }
                    catch (e) { console.error('JunFlow.proxy.define', e) }
                    this.file.save();

                } else if (a0 && (typeof a1 === 'function')) {
                    proxy[a0] = this.codec.serialize(a1)
                    this.file.save();
                } else return false;
            },
            remove: (key) => {
                const proxy = (this
                    .data.proxy ||= {})

                if (!key === undefined) {
                    delete this.data.proxy;
                } else if (proxy[key]) {
                    delete proxy[key]
                }

                if (Object.keys(proxy).length === 0) {
                    delete this.data.proxy

                    if (Object.keys(this.data).length === 0) {
                        this.JunDrive.remove(this
                            .JunMap.fileFlow);
                    }
                }

                this.file.save();
                return true;
            }
        }
    }
}