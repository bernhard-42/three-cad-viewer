class BoundingBox {
    constructor(bb) {
        this.xmin = bb.xmin;
        this.xmax = bb.xmax;
        this.ymin = bb.ymin;
        this.ymax = bb.ymax;
        this.zmin = bb.zmin;
        this.zmax = bb.zmax;
        this._calc();
    }

    _calc() {
        this.xsize = this.xmax - this.xmin;
        this.ysize = this.ymax - this.ymin;
        this.zsize = this.zmax - this.zmin;
        this.center = [
            this.xmin + this.xsize / 2.0,
            this.ymin + this.ysize / 2.0,
            this.zmin + this.zsize / 2.0
        ]
        this.max = Math.max(
            ...[this.xmin, this.xmax, this.ymin, this.ymax, this.zmin, this.zmax].map((x) => Math.abs(x))
        );
    }

    max_dist_from_center() {
        var norms = [];
        for (var x of [this.xmin, this.xmax]) {
            for (var y of [this.ymin, this.ymax]) {
                for (var z of [this.zmin, this.zmax]) {
                    norms.push(Math.sqrt(x * x + y * y + z * z))
                }
            }
        }
        return Math.max(...norms)
    }
}

export { BoundingBox };