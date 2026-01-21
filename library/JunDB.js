// ./library/JunDB.js

import { JunDrive } from "./JunDrive.js";
import { JunMap, JunNode } from "./JunHub.js";
import { JunFlow } from "./JunFlow.js";
import { JunShard } from "./JunShard.js";


/*new JunDB({
    depth: 2,
    folder: './data',
    memory: 20,
    index: {
        threshold: 10,
        debounce: 5000
    },
    nodes: {
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
                this.map = new JunMap(this.JunDrive, ...a0);
            } else if (a0.constructor.name == 'Object') {
                this.map = new JunMap(this.JunDrive, a0);
            } else this.map = a0
        }

        if (!this.map) {
            let limit = options.index?.threshold || 10;
            let delay = options.index?.debounce || 5000;
            this.map = new JunMap(
                this.JunDrive, 'root.map.bin', {
                file: { limit: limit, delay: delay }
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
        this.flows = new WeakMap();

        this.data = this.Proxy(
            this.map);

        this.shared = {}
    }

    memory() {
        return {
            maps: this.JunDrive.mapsRam.stats(),
            nodes: this.JunDrive.nodesRam.stats()
        }
    }

    flush() {
        return this.JunDrive
            .flush()
    }

    open(...path) {
        if (!path.length) return;
        let a0 = this.map.data;

        path = path.filter((o) => {
            if (typeof o == 'string') return true;
            else if (o instanceof this.map.constructor) {
                a0 = o.data; return false;
            } else return false;
        });

        for (let i = 0; i < path.length; i++) {
            if (!a0[path[i]]) return false;
            const file = a0[path[i]];
            if (typeof file !== 'string') return false;
            if (!file.endsWith('.map.bin')) return false;
            a0 = this.JunDrive.readSync(file);
        }

        if (!a0) return false;
        if (!(a0?.$file)) return false;

        let limit = this.#options.index?.threshold || 10;
        let delay = this.#options.index?.debounce || 5000;

        const mapInstance = new this.map
            .constructor(this.JunDrive, a0.$file,
                { file: { limit: limit, delay: delay } });

        const router = this.flow.get(...path)
        return this.Proxy(mapInstance, router)
    }

    Proxy(map, flow) {
        const Jun = this
        if (!map?.data) return null;

        if (map.data?.$file.includes('root.map.bin'))
            flow = this.flow.tree;

        const a0 = map.data;
        if (flow) this.flows.set(a0, flow);
        if (this.proxies.has(a0)) return this
            .proxies.get(a0);


        let root = null;

        // class JunHub
        if (this.#options?.$class?.JunHub) {
            const a0 = this.#options.$class.JunHub;
            if (a0.constructor.name === 'Array') {
                root = new JunNode(this.JunDrive, map, ...a0);
            } else if (a0.constructor.name === 'Object') {
                root = new JunNode(this.JunDrive, map, a0);
            } else root = a0;
        }

        if (!root) {
            let limit = this.#options?.nodes?.threshold || 10;
            let delay = this.#options?.nodes?.debounce || 5000;

            root = new JunNode(this.JunDrive, map, {
                shard: { depth: this.#options?.depth || 2 },
                file: { limit: limit, delay: delay }
            });
        }

        ////////////////////////////

        const open = (...args) => {
            const Open = (object) => () => args.reduce(
                (acc, k) => acc?.[k], object) ?? false;

            const $index = this.open(...args, map);
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
                    open: (...args) => open(...args),
                    data: receiver, index: map, flow: flow,
                }, args);

                return control
            }
        }

        const proxy = new Proxy({}, {
            get(target, key, receiver) {
                if (typeof key === 'symbol')
                    return Reflect.get(target, key);

                const flow = Jun.flows.get(a0);

                // flow
                if (flow?.$call && flow?.$call?.[key]) {
                    const fun = flow.$call[key];
                    if (typeof fun === 'function') {
                        return (...args) => fun.apply({
                            data: receiver, index: map, flow: flow,
                            open: (...args) => open(...args),
                            Jun: Jun
                        }, args);
                    }
                } else if (Jun.shared[key]) {
                    const fun = Jun.shared[key];
                    if (typeof fun === 'function') {
                        return (...args) => fun.apply({
                            data: receiver, index: map, flow: flow,
                            open: (...args) => open(...args),
                            Jun: Jun
                        }, args);
                    }
                }

                const r = guard('get')(target, key, receiver);

                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                // ////////////////////////////

                const rootGet = root.get(key);
                if (typeof rootGet === 'string'
                    && rootGet.startsWith('node:')) {
                    const JunMap = Jun.map.constructor;
                    const node = new JunMap(Jun.JunDrive,
                        rootGet.replace('node:', ''));
                    return Jun.Proxy(node,
                        flow?.[key]);
                } else {
                    return rootGet;
                }
            },
            set(target, key, value, receiver) {
                const r = guard('set')(
                    target, key, value, receiver);
                if (r?.end && r?.error) throw r.error;
                root.set(key, (r?.end) ? r.value : value);
                return true;
            },
            deleteProperty(target, key) {
                const r = guard('delete')(target, key);
                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;
                root.delete(key);
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
            a0, proxy);
        return proxy;
    }
}