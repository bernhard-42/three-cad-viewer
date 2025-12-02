/**
 * Slider component for controlling numeric values with linked input field.
 */
class Slider {
  /**
   * Create a Slider instance
   * @param {string} index - Slider identifier (e.g., "plane1", "ambientlight")
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {HTMLElement} container - DOM container to search for slider elements
   * @param {Object} options - Configuration options
   * @param {Function} options.handler - Value change handler
   * @param {boolean} [options.percentage=false] - Convert value to percentage (0-1)
   * @param {Function} [options.notifyCallback] - Optional callback for change notifications
   * @param {Function} [options.isReadyCheck] - Optional check if handler should be called
   * @param {Function} [options.onSetSlider] - Optional callback when setSlider is called (for plane sliders)
   */
  constructor(index, min, max, container, options) {
    if (index.startsWith("plane")) {
      this.index = parseInt(index.substring(5));
      this.type = "plane";
    } else {
      this.index = undefined;
      this.type = index;
    }

    this.handler = options.handler;
    this.percentage = options.percentage || false;
    this.notifyCallback = options.notifyCallback || null;
    this.isReadyCheck = options.isReadyCheck || null;
    this.onSetSlider = options.onSetSlider || null;

    this.slider = container.getElementsByClassName(`tcv_sld_value_${index}`)[0];
    this.input = container.getElementsByClassName(`tcv_inp_value_${index}`)[0];

    if (!this.slider || !this.input) {
      throw new Error(
        `Slider elements not found for index "${index}" in container`,
      );
    }

    this.slider.min = min;
    this.slider.max = max;
    this.input.value = max;
    this.slider.oninput = this.sliderChange;
    this.input.addEventListener("change", this.inputChange);
  }

  /**
   * Send change notification via callback (for plane-type sliders only)
   * @private
   * @param {number} value - The current slider value
   * @param {boolean} [notify=true] - Whether to trigger the notification
   */
  _notify = (value, notify = true) => {
    if (this.type == "plane" && this.notifyCallback) {
      const change = {};
      change[`clip_slider_${this.index - 1}`] = parseFloat(value);
      this.notifyCallback(change, notify);
    }
  };

  /**
   * Invoke the value change handler with appropriate value transformation
   * @private
   * @param {string} type - Slider type ("plane" or other identifier)
   * @param {number} index - Plane index (for plane-type sliders)
   * @param {string} value - The input value as string
   */
  _handle(type, index, value) {
    if (type == "plane") {
      this.handler(index, value);
    } else {
      // Check if ready (if check provided), or assume ready
      const isReady = this.isReadyCheck ? this.isReadyCheck() : true;
      if (isReady) {
        if (this.percentage) {
          value = value / 100;
        }
        this.handler(value);
      }
    }
  }

  /**
   * Handle slider drag/input events
   * @private
   * @param {Event} e - The input event from the slider element
   */
  sliderChange = (e) => {
    const value = e.target.value;
    this.input.value = Math.round(1000 * value) / 1000;
    this._handle(this.type, this.index, this.input.value);
    this._notify(value);
  };

  /**
   * Handle text input change events
   * @private
   * @param {Event} e - The change event from the input element
   */
  inputChange = (e) => {
    const clampedValue = Math.max(
      Math.min(e.target.value, this.slider.max),
      this.slider.min,
    );
    this.input.value = Math.round(1000 * clampedValue) / 1000;
    this.slider.value = clampedValue;
    this._handle(this.type, this.index, this.input.value);
    this._notify(clampedValue);
  };

  /**
   * Configure slider for symmetric range around zero (used for clipping planes)
   * Sets min to -limit, max to +limit, and calculates appropriate step size
   * @param {number} limit - The absolute limit value for both min (-limit) and max (+limit)
   */
  setSlider(limit) {
    const exp = Math.abs(Math.round(Math.log10(2 * limit)));
    this.slider.min = -limit;
    this.slider.max = limit;
    this.slider.step = Math.pow(10, -(3 - exp));
    this.slider.value = limit;
    this.input.value = Math.round(1000 * this.slider.max) / 1000;
    if (this.onSetSlider) {
      this.onSetSlider(this.index, this.input.value);
    }
  }

  /**
   * Get the current slider value
   * @returns {number} The current value as a float
   */
  getValue() {
    return parseFloat(this.input.value);
  }

  /**
   * Set the slider value programmatically
   * @param {number} value - The value to set (will be clamped to min/max range)
   * @param {boolean} [notify=true] - Whether to trigger change notifications
   */
  setValue(value, notify = true) {
    const clampedValue = Math.max(
      Math.min(value, this.slider.max),
      this.slider.min,
    );
    this.input.value = Math.round(1000 * clampedValue) / 1000;
    this.slider.value = clampedValue;
    this._handle(this.type, this.index, this.input.value);
    this._notify(clampedValue, notify);
  }
}

export { Slider };
