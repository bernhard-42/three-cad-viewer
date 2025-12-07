/**
 * Handler type for slider value changes.
 * For plane sliders: (index: number, value: string) => void
 * For other sliders: (value: number) => void
 */
type SliderHandler = (indexOrValue: number, value?: string | boolean) => void;

/**
 * Options for configuring a Slider instance.
 */
interface SliderOptions {
  handler: SliderHandler;
  percentage?: boolean;
  notifyCallback?: ((change: Record<string, number>, notify: boolean) => void) | null;
  isReadyCheck?: (() => boolean) | null;
  onSetSlider?: ((index: number, value: string) => void) | null;
}

/**
 * Slider component for controlling numeric values with linked input field.
 */
class Slider {
  index: number | undefined;
  type: string;
  handler: SliderHandler;
  percentage: boolean;
  notifyCallback: ((change: Record<string, number>, notify: boolean) => void) | null;
  isReadyCheck: (() => boolean) | null;
  onSetSlider: ((index: number, value: string) => void) | null;
  slider: HTMLInputElement;
  input: HTMLInputElement;

  /**
   * Create a Slider instance
   * @param index - Slider identifier (e.g., "plane1", "ambientlight")
   * @param min - Minimum value
   * @param max - Maximum value
   * @param container - DOM container to search for slider elements
   * @param options - Configuration options
   */
  constructor(
    index: string,
    min: number,
    max: number,
    container: HTMLElement,
    options: SliderOptions
  ) {
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

    this.slider = container.getElementsByClassName(`tcv_sld_value_${index}`)[0] as HTMLInputElement;
    this.input = container.getElementsByClassName(`tcv_inp_value_${index}`)[0] as HTMLInputElement;

    if (!this.slider || !this.input) {
      throw new Error(
        `Slider elements not found for index "${index}" in container`,
      );
    }

    this.slider.min = String(min);
    this.slider.max = String(max);
    this.input.value = String(max);
    this.slider.oninput = this.sliderChange;
    this.input.addEventListener("change", this.inputChange);
  }

  /**
   * Send change notification via callback (for plane-type sliders only)
   * @param value - The current slider value
   * @param notify - Whether to trigger the notification
   */
  private _notify = (value: number | string, notify: boolean = true): void => {
    if (this.type == "plane" && this.notifyCallback && this.index !== undefined) {
      const change: Record<string, number> = {};
      change[`clip_slider_${this.index - 1}`] = parseFloat(String(value));
      this.notifyCallback(change, notify);
    }
  };

  /**
   * Invoke the value change handler with appropriate value transformation
   * @param type - Slider type ("plane" or other identifier)
   * @param index - Plane index (for plane-type sliders)
   * @param value - The input value as string
   */
  private _handle(type: string, index: number | undefined, value: string): void {
    if (type == "plane" && index !== undefined) {
      this.handler(index, value);
    } else {
      // Check if ready (if check provided), or assume ready
      const isReady = this.isReadyCheck ? this.isReadyCheck() : true;
      if (isReady) {
        let handlerValue: number | string = value;
        if (this.percentage) {
          handlerValue = parseFloat(value) / 100;
        }
        this.handler(handlerValue as number);
      }
    }
  }

  /**
   * Handle slider drag/input events
   */
  sliderChange = (e: Event): void => {
    const value = (e.target as HTMLInputElement).value;
    this.input.value = String(Math.round(1000 * parseFloat(value)) / 1000);
    this._handle(this.type, this.index, this.input.value);
    this._notify(value);
  };

  /**
   * Handle text input change events
   */
  inputChange = (e: Event): void => {
    const target = e.target as HTMLInputElement;
    const clampedValue = Math.max(
      Math.min(parseFloat(target.value), parseFloat(this.slider.max)),
      parseFloat(this.slider.min),
    );
    this.input.value = String(Math.round(1000 * clampedValue) / 1000);
    this.slider.value = String(clampedValue);
    this._handle(this.type, this.index, this.input.value);
    this._notify(clampedValue);
  };

  /**
   * Configure slider for symmetric range around zero (used for clipping planes)
   * Sets min to -limit, max to +limit, and calculates appropriate step size
   * @param limit - The absolute limit value for both min (-limit) and max (+limit)
   */
  setSlider(limit: number): void {
    const exp = Math.abs(Math.round(Math.log10(2 * limit)));
    this.slider.min = String(-limit);
    this.slider.max = String(limit);
    this.slider.step = String(Math.pow(10, -(3 - exp)));
    this.slider.value = String(limit);
    this.input.value = String(Math.round(1000 * parseFloat(this.slider.max)) / 1000);
    if (this.onSetSlider && this.index !== undefined) {
      this.onSetSlider(this.index, this.input.value);
    }
  }

  /**
   * Get the current slider value
   * @returns The current value as a float
   */
  getValue(): number {
    return parseFloat(this.input.value);
  }

  /**
   * Set the slider value programmatically
   * @param value - The value to set (will be clamped to min/max range)
   * @param notify - Whether to trigger change notifications
   */
  setValue(value: number, notify: boolean = true): void {
    const clampedValue = Math.max(
      Math.min(value, parseFloat(this.slider.max)),
      parseFloat(this.slider.min),
    );
    this.input.value = String(Math.round(1000 * clampedValue) / 1000);
    this.slider.value = String(clampedValue);
    this._handle(this.type, this.index, this.input.value);
    this._notify(clampedValue, notify);
  }

  /**
   * Update slider visual without triggering handler (for state subscription updates).
   * Use this when the state has already been updated and you just need to sync the UI.
   * @param value - The value to set (will be clamped to min/max range)
   */
  setValueFromState(value: number): void {
    const clampedValue = Math.max(
      Math.min(value, parseFloat(this.slider.max)),
      parseFloat(this.slider.min),
    );
    this.input.value = String(Math.round(1000 * clampedValue) / 1000);
    this.slider.value = String(clampedValue);
  }

  /**
   * Clean up event listeners.
   */
  dispose(): void {
    this.slider.oninput = null;
    this.input.removeEventListener("change", this.inputChange);
  }
}

export { Slider };
