import * as rc from './row-card';
import { uuidv4, select_keys, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { record, source_id, style: row_style } = config;

  const { row_width, row_height } = styles;
  const { part_height } = styles;
  const { top_y, left_x } = computed;

  const id = uuidv4();
  const this_top_y = top_y + (part_height / 2) - (row_height / 2);

  const row_card_data = rc.build_data({ row_id: id, record: record }, styles, {
    x: left_x,
    y: this_top_y
  });

  return {
    kind: "row",
    id: id,
    rendering: {
      width: row_width,
      height: row_height,
      x: left_x,
      y: this_top_y,
      fill: row_style.fill
    },
    vars: {
      record: {
        stream: record.stream,
        partition: record.partition,
        offset: record.offset,
        t: record.t,
        key: record.key,
        value: record.value
      },
      source_id: source_id
    },
    children: {
      row_card: row_card_data
    }
  };
}


export function render(data) {
  // Intentionally skip rendering of the row card.
  // That has to happen last to correct for its z-index.
  const { id, vars, rendering } = data;

  const circle = create_svg_el("circle");
  circle.id = id;
  circle.setAttributeNS(null, "cx", (rendering.x + (rendering.width / 2)));
  circle.setAttributeNS(null, "cy", (rendering.y + (rendering.height / 2)));
  circle.setAttributeNS(null, "r", (rendering.width / 2));
  circle.setAttributeNS(null, "fill", rendering.fill);
  circle.setAttributeNS(null, "data-stream", vars.record.stream);
  circle.setAttributeNS(null, "data-partition", vars.record.partition);
  circle.setAttributeNS(null, "data-offset", vars.record.offset);

  return circle;
}
