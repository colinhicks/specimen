import { uuidv4, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { stream, partition } = config;
  const { left_x, top_y, bottom_margin } = computed;
  const { source_partitions_margin_left, font_size } = styles;

  return {
    kind: "source_partition_offset",
    id: uuidv4(),
    rendering: {
      x: left_x + source_partitions_margin_left,
      y: top_y,
      subtext_id: uuidv4(),
      font_size
    },
    vars: {
      stream: stream,
      partition: partition,
      label: `${stream}/${partition}: `,
      init: "-"
    },
    refs: {
      bottom_y: top_y + bottom_margin
    }
  };
}

export function render(data) {
  const { id, vars, rendering } = data;

  const text = create_svg_el("text");
  text.id = id;
  text.setAttribute("data-stream", vars.stream);
  text.setAttribute("data-partition", vars.partition);
  text.setAttribute("x", rendering.x);
  text.setAttribute("y", rendering.y);
  text.setAttribute("font-size", rendering.font_size);
  text.classList.add("code");
  text.textContent = vars.label;

  const tspan = create_svg_el("tspan");
  tspan.id = rendering.subtext_id;
  tspan.textContent = vars.init;

  text.appendChild(tspan);

  return text;
}

export function update_offset(source_partition, offset) {
  const { rendering, vars } = source_partition;
  const id = rendering.subtext_id;
  const el = document.getElementById(id);

  if (offset < 0) {
    el.textContent = vars.init;
  } else {
    el.textContent = offset;
  }
}
