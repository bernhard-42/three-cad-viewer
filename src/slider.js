class Slider {
    constructor(index, min, max, display) {
        if (index.startsWith("plane")) {
            this.index = parseInt(index.substring(5));
            this.type = "plane";
        } else {
            this.index = undefined;
            this.type = index;
        }
        this.display = display;

        this.slider = display.container.getElementsByClassName(
            `tcv_sld_value_${index}`,
        )[0];
        this.slider.min = min;
        this.slider.max = max;
        this.input = display.container.getElementsByClassName(
            `tcv_inp_value_${index}`,
        )[0];
        this.input.value = max;
        this.slider.oninput = this.sliderChange;
        this.input.addEventListener("change", this.inputChange);
    }

    _notify = (value, notify = true) => {
        if (this.type == "plane") {
            const change = {};
            change[`clip_slider_${this.index - 1}`] = parseFloat(value);
            this.display.viewer.checkChanges(change, notify);
        }
    };

    _handle(type, index, value) {
        if (type == "plane") {
            this.display.refreshPlane(index, value);
        } else if (type === "ambientlight") {
            if (this.display.viewer.ready) {
                this.display.viewer.setAmbientLight(value / 100);
            }
        } else if (type === "pointlight") {
            if (this.display.viewer.ready) {
                this.display.viewer.setDirectLight(value / 100);
            }
        } else if (type === "metalness") {
            if (this.display.viewer.ready) {
                this.display.viewer.setMetalness(value / 100);
            }
        } else if (type === "roughness") {
            if (this.display.viewer.ready) {
                this.display.viewer.setRoughness(value / 100);
            }
        }
    }

    sliderChange = (e) => {
        const value = e.target.value;
        this.input.value = Math.round(1000 * value) / 1000;
        this._handle(this.type, this.index, this.input.value);
        this._notify(value);
    };

    inputChange = (e) => {
        const value = Math.max(
            Math.min(e.target.value, this.slider.max),
            this.slider.min,
        );
        // if (value != e.target.value) {
        //     this.input.value = Math.round(1000 * value) / 1000;
        // }
        this.slider.value = value;
        this._handle(this.type, this.index, this.input.value);
        this._notify(value);
    };

    setSlider(limit) {
        const exp = Math.abs(Math.round(Math.log10(2 * limit)));
        this.slider.min = -limit;
        this.slider.max = limit;
        this.slider.step = Math.pow(10, -(3 - exp));
        this.slider.value = limit;
        this.input.value = Math.round(1000 * this.slider.max) / 1000;
        this.display.refreshPlane(this.index, this.input.value);
    }

    getValue() {
        return parseFloat(this.input.value);
    }

    setValue(value, notify = true) {
        const trimmed_value = Math.max(
            Math.min(value, this.slider.max),
            this.slider.min,
        );
        this.input.value = Math.round(1000 * trimmed_value) / 1000;
        this.slider.value = value;
        this._handle(this.type, this.index, this.input.value);
        this._notify(value, notify);
    }
}

export { Slider };