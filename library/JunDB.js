// ./library/JunDB.js

import { JunDrive } from "./JunDrive.js";
import { JunHub } from "./core/JunHub.js";
import { JunMap } from "./core/JunMap.js";

/*new JunDB({
    depth: 2,
    folder: './data',
    memory: 20,
    maps: {
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

        this.JunDrive = new JunDrive({
            memory: options.memory || 50,
            folder: options.folder || './data',
            atomic: options.atomic
        });

        this.map = new JunMap(
            this.JunDrive, 'root.map.bin', {
            file: {
                limit: options.maps?.threshold || 10,
                delay: options.maps?.debounce || 5000
            }
        })

        this.proxies = new WeakMap();
        this.data = this.Proxy(
            this.map);

        this.shared = {}
    }

    memory() {
        return {
            maps: this.JunDrive.mapsRam.stats(),
            nodes: this.JunDrive.nodesRam.stats(),
            flow: this.JunDrive.flowRam.stats()
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

        let limit = this.#options?.maps?.threshold || 10;
        let delay = this.#options?.maps?.debounce || 5000;

        const mapInstance = new this.map
            .constructor(this.JunDrive, a0.$file,
                { file: { limit: limit, delay: delay } });

        return this.Proxy(mapInstance)
    }

    Proxy(map) {
        if (!map?.data) return;

        const Jun = this
        const a0 = map.data;
        const root = new JunHub(this.JunDrive, map, {
            shard: { depth: this.#options?.depth || 2 },
            file: {
                limit: this.#options?.nodes?.threshold || 10,
                delay: this.#options?.nodes?.debounce || 5000
            }
        });


        ////////////////////////////

        const open = (...args) => {
            const _map = this.open(...args, map);
            if (_map && _map.$file) return this.Proxy(_map)
        }

        const guard = (method) => (...args) => {
            if (!root.JunFlow.isFlow) return;
            const flow = root.JunFlow.get('proxy');

            if (flow?.[method]) {
                let control = { end: false, value: null, error: null };
                const receiver = (method === 'delete') ? null
                    : args[args.length - 1];

                flow[method].apply({
                    resolve: (val) => { control.end = true; control.value = val },
                    reject: (err) => { control.end = true; control.error = err },
                    open: (...args) => open(...args),
                    data: receiver, map,
                }, args);

                return control
            }
        }

        const proxy = new Proxy({}, {
            get(target, key, receiver) {
                if (typeof key === 'symbol')
                    return Reflect.get(target, key);

                if (key === '$call') return {
                    define: (o) => { root.JunFlow.set('call', o) },
                    remove: (key) => { root.JunFlow.delete('call', key) }
                }
                if (key === '$proxy') return {
                    define: (o) => { root.JunFlow.set('proxy', o) },
                    remove: (key) => { root.JunFlow.delete('proxy', key) }
                }

                const flow = root.JunFlow.isFlow
                    ? (root.JunFlow.get('call')) : null;

                // flow
                if (flow?.[key]) {
                    const fun = root.JunFlow.get('call', key);

                    if (typeof fun === 'function') {
                        return (...args) => fun.apply({
                            data: receiver, index: map, flow: flow,
                            open: (...args) => open(...args),
                            Jun: Jun
                        }, args);
                    }
                }

                if (Jun.shared[key]) {
                    const fun = Jun.shared[key];
                    if (typeof fun === 'function') {
                        return (...args) => fun.apply({
                            data: receiver, index: map, flow: flow,
                            open: (...args) => open(...args),
                            Jun: Jun
                        }, args);
                    }
                }

                const r = guard('get')(
                    target, key, receiver);

                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                // ////////////////////////////

                const rootGet = root.get(key);
                if (typeof rootGet === 'string'
                    && rootGet.startsWith('node:')) {
                    const JunMap = Jun.map.constructor;
                    const node = new JunMap(Jun.JunDrive,
                        rootGet.replace('node:', '').replace(
                            '.node.bin', '.map.bin'));
                    return Jun.Proxy(node);
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