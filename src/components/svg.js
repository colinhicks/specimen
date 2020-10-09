import { uuidv4, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { svg_width, svg_height } = styles;

  return {
    kind: "svg",
    id: uuidv4(),
    name: "svg-container",
    rendering: {
      width: svg_width,
      height: svg_height
    }
  };
}

export function render(data) {
  const { id, rendering } = data;
  const { width, height } = rendering;

  const svg = create_svg_el("svg");
  svg.id = id;
  svg.setAttributeNS(null, "width", width);
  svg.setAttributeNS(null, "height", height);
  svg.setAttributeNS(null, "viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("animation");

  return svg;
}
