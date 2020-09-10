import { uuidv4, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { render_stream_time } = styles;
  const { left_x, top_y, bottom_margin } = computed;
  const bottom_y = top_y + bottom_margin;

  return {
    kind: "stream_time",
    id: uuidv4(),
    rendering: {
      x: left_x,
      y: top_y,
      subtext_id: uuidv4()
    },
    vars: {
      label: "ST: ",
      init: "-",
      viewable: render_stream_time
    },
    refs: {
      bottom_y: bottom_y
    }
  };
}

export function render(data) {
  const { id, vars, rendering } = data;
  const { viewable } = vars;

  const text = create_svg_el("text");
  text.id = id;
  text.setAttributeNS(null, "x", rendering.x);
  text.setAttributeNS(null, "y", rendering.y);
  text.classList.add("code");
  text.textContent = vars.label;

  if (!viewable) {
    text.style.display = "none";
  }

  const tspan = create_svg_el("tspan");
  tspan.id = rendering.subtext_id;
  tspan.textContent = vars.init;

  text.appendChild(tspan);

  return text;
}

export function update_time(stream_time, row) {
  const { rendering, vars } = stream_time;

  const id = rendering.subtext_id;  
  const el = document.getElementById(id);

  el.textContent = row.stream_time || vars.init;
}
