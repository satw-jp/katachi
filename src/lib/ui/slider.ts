export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  format: (value: number) => string;
  formatInitial?: (value: number) => string;
  formatInput?: (value: number) => string;
  onChange: (value: number) => void;
}

export interface SliderHandle {
  row: HTMLElement;
  set: (value: number) => void;
}

/** Shared DOM structure for the numeric sliders used by every Study panel. */
export function createSlider(options: SliderOptions): SliderHandle {
  const row = document.createElement("div");
  row.className = "row slider-row";

  const label = document.createElement("label");
  label.textContent = options.label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(options.min);
  slider.max = String(options.max);
  slider.step = String(options.step);
  slider.value = String(options.initial);

  const valueOut = document.createElement("span");
  valueOut.className = "value-out";
  valueOut.textContent = (options.formatInitial ?? options.format)(options.initial);

  slider.oninput = () => {
    const value = Number(slider.value);
    valueOut.textContent = (options.formatInput ?? options.format)(value);
    options.onChange(value);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(valueOut);

  return {
    row,
    set: (value) => {
      slider.value = String(value);
      valueOut.textContent = options.format(value);
    },
  };
}
