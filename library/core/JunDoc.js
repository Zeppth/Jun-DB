// ./library/core/JunDoc.js

export class JunDoc {
    #count = 0;
    #timer = null;
    constructor(JunDrive, file, options = {}) {
        this.file = file;
        this.JunDrive = JunDrive;
        this._limit = options.limit ?? 10;
        this._delay = options.delay ?? 5000;
    }

    get data() {
        if (this.JunDrive.existsSync(this.file)) {
            return this.JunDrive.readSync(this.file);
        } else {
            this.JunDrive.write(this.file, {});
            return this.JunDrive.readSync(this.file)
        }
    }

    save(force = false) {
        if (force || ++this.#count
            >= this._limit) {
            clearTimeout(this.#timer);
            this.#timer = null;
            this.#count = 0;
            return this.JunDrive.write(
                this.file, this.data);
        }

        clearTimeout(this.#timer);
        this.#timer = setTimeout(() =>
            this.save(true),
            this._delay);
    }
}