// ./library/JunDB.js

import { JunDrive } from "./JunDrive.js";
import { JunMap, JunHub } from "./JunHub.js";
import { JunFlow } from "./JunFlow.js";

/*new JunDB({
    depth: 2,
    folder: './data',
    memory: 20,
    index: {
        threshold: 10,
        debounce: 5000
    },
    shards: {
        threshold: 5,
        debounce: 3000
    }
})*/

export class JunDB {
    #options = null;
    constructor(options = {}) {
        if (options?.constructor?.name !== 'Object') {
            throw new Error('Invalid options');
        }

        this.#options = options;

        // class JunDrive
        if (options.$class?.JunDrive) {
            const a0 = options.$class.JunDrive;
            if (a0.constructor.name == 'Array') {
                this.JunDrive = new JunDrive(...a0);
            } else if (a0.constructor.name == 'Object') {
                this.JunDrive = new JunDrive(a0);
            } else this.JunDrive = a0
        }

        if (!this.JunDrive) {
            this.JunDrive = new JunDrive({
                memory: { limit: options.memory || 20 },
                folder: options.folder || './data',
            });
        }

        // class JunMap
        if (options.$class?.JunMap) {
            const a0 = options.$class.JunMap;
            if (a0.constructor.name == 'Array') {
                this.index = new JunMap(this.JunDrive, ...a0);
            } else if (a0.constructor.name == 'Object') {
                this.index = new JunMap(this.JunDrive, a0);
            } else this.index = a0
        }

        if (!this.index) {
            this.index = new JunMap(this.JunDrive, {
                file: {
                    limit: options.index?.threshold || 10,
                    delay: options.index?.debounce || 5000
                }
            })
        }

        // class JunFlow
        if (options.$class?.JunFlow) {
            const a0 = options.$class.JunFlow;
            if (a0.constructor.name == 'Array') {
                this.flow = new JunFlow(...a0);
            } else this.flow = a0
        }

        if (!this.flow) {
            this.flow = new JunFlow();
        }

        /////////////////////////////

        this.proxies = new WeakMap();

        this.data = this.Proxy(
            this.index.data);

        this.shared = {}
    }

    memory() {
        return this.JunDrive
            .RAM.stats()
    }

    flush() {
        return this.JunDrive
            .flush()
    }

    open(...path) {
        const o = this.index.get(...path)
        const router = this.flow.get(...path)
        if (o && o.$file) return this.Proxy(o, router)
        return false
    }

    Proxy(index, flow) {
        const Jun = this
        if (!index) index = this.index.data;
        if (!flow) index.$file == 'root.bin' ?
            flow = this.flow.tree : flow = {};

        if (this.proxies.has(index))
            return this.proxies.get(index);

        let root = null;

        // class JunHub
        if (this.#options?.$class?.JunHub) {
            const a0 = this.#options.$class.JunHub;
            if (a0.constructor.name === 'Array') {
                root = new JunHub(this.JunDrive, index, ...a0);
            } else if (a0.constructor.name === 'Object') {
                root = new JunHub(this.JunDrive, index, a0);
            } else root = a0;
        }

        if (!root) root = new JunHub(this.JunDrive, index, {
            shard: { depth: this.#options?.depth || 2 },
            file: {
                limit: options?.file?.limit || 5,
                delay: options.file?.delay || 3000
            }
        });

        ////////////////////////////

        const open = (args, index, flow) => {
            const Open = (object) => () => args.reduce(
                (acc, k) => acc?.[k], object) ?? false;
            const $index = Open(index)();
            const $flow = Open(flow)();
            if ($index && $index.$file)
                return this.Proxy($index,
                    $flow)
        }

        const guard = (method) => (...args) => {
            if (flow?.$proxy && flow?.$proxy?.[method]) {
                let control = { end: false, value: null, error: null };
                const receiver = (method === 'delete') ? null
                    : args[args.length - 1];

                flow.$proxy[method].apply({
                    resolve: (val) => { control.end = true; control.value = val },
                    reject: (err) => { control.end = true; control.error = err },
                    open: (...args) => open(args, index, flow),
                    data: receiver, index: index, flow: flow,
                }, args);

                return control
            }
        }

        const proxy = new Proxy({}, {
            get(target, key, receiver) {
                if (typeof key === 'symbol')
                    return Reflect.get(target, key);

                // flow
                if (flow?.$call && flow?.$call?.[key]) {
                    return (...args) => flow.$call[key].apply({
                        data: receiver, index: index, flow: flow,
                        open: (...args) => open(args, index, flow),
                        Jun: Jun
                    }, args);
                }

                // shared
                if (Jun.shared[key]) {
                    return (...args) => Jun.shared[key].apply({
                        data: receiver, index: index, flow: flow,
                        open: (...args) => open(args, index, flow),
                        Jun: Jun
                    }, args);
                }

                const r = guard('get')(target, key, receiver);
                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                // index
                const rootGet = root.get(key);

                if (rootGet?.constructor?.name
                    === 'Object' && rootGet.$file) {
                    return Jun.Proxy(index[key],
                        flow?.[key]);
                } else {
                    return rootGet;
                }
            },
            set(target, key, value, receiver) {
                const r = guard('set')(
                    target, key, value, receiver);

                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                root.set(key, value);
                Jun.index.save();
                return true;
            },
            deleteProperty(target, key) {
                const r = guard('delete')(target, key);
                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                root.delete(key);
                Jun.index.save();
                return true;
            },
            ownKeys(target) {
                return root.keys();
            },

            getOwnPropertyDescriptor(_, key) {
                return {
                    enumerable: true,
                    configurable: true,
                    value: root.get(key)
                };
            }
        })

        this.proxies.set(
            index, proxy);
        return proxy;
    }
}