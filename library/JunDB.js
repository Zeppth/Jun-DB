// ./library/JunDB.js

import { JunDrive } from "./JunDrive.js";
import { JunMap, JunHub } from "./JunHub.js";
import { JunFlow } from "./JunFlow.js";

export class JunDB {
    constructor(options = {}) {
        if (options?.constructor?.name !== 'Object') {
            return new Error('Invalid options');
        }

        this.JunDrive = new JunDrive({
            folder: options.folder || './data',
            memoryLimit: options.memoryLimit || 20,
        });

        this.index = new JunMap(this.JunDrive, {
            limit: options.saveLimit || 10,
            delay: options.saveDelay || 5000
        });

        this.depth = options.depth || 2;
        this.proxies = new WeakMap();

        this.memory = () => this.JunDrive.RAM.stats()
        this.flush = () => this.JunDrive.flush()

        this.flow = new JunFlow()

        this.data = this.Proxy(
            this.index.data);
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

        const root = new JunHub(this.JunDrive,
            index, this.depth);

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