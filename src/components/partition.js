import * as r from './row';
import * as c from './consumer-marker';
import { uuidv4, create_svg_el } from './../util';

function build_consumer_markers_data(partition, pqs, styles, computed) {
  const { row_width, row_offset_right } = styles;
  const { consumer_m_margin_right, consumer_m_offset_bottom, consumer_m_margin_bottom } = styles;
  const { right_x, bottom_y } = computed;

  let this_bottom_y = bottom_y - consumer_m_offset_bottom;
  const result = [];

  pqs.forEach(pq_name => {
    const config = { partition, pq_name };
    const marker = c.build_data(config, styles, {
      left_x: right_x - row_offset_right - (row_width / 2) - consumer_m_margin_right,
      bottom_y: this_bottom_y
    });

    result.push(marker);
    this_bottom_y = marker.refs.top_y - consumer_m_margin_bottom;
  });

  return result;
}

function index_consumer_markers(consumer_markers_data) {
  return consumer_markers_data.reduce((all, marker) => {
    all[marker.vars.pq_name] = marker.id;
    return all;
  }, {});
}

function find_top_y(consumer_markers_data, top_y) {
  if (consumer_markers_data.length == 0) {
    return top_y;
  } else {
    return consumer_markers_data.slice(-1)[0].refs.top_y;
  }
}

export function build_data(config, styles, computed) {
  const { partition, rows } = config;

  const { part_width, part_height,
          part_id_margin_top, part_id_margin_left,
          part_container_fill
        } = styles;
  const { row_height, row_width, row_margin_left, row_offset_right } = styles;

  const { successors, top_y, midpoint_x } = computed;

  const left_x = midpoint_x - (part_width / 2);
  const right_x = midpoint_x + (part_width / 2);
  const bottom_y = top_y + part_height;
  const midpoint_y = top_y + (part_height / 2);

  let row_x = right_x - row_offset_right - row_width;
  let rows_data = [];

  rows.forEach(row => {
    rows_data.push(r.build_data(row, styles, {
      left_x: row_x,
      top_y: top_y,
    }));
    row_x -= (row_width + row_margin_left);
  });

  const consumer_markers_data = build_consumer_markers_data(partition, successors, styles, {
    right_x: right_x,
    bottom_y: midpoint_y - (row_height / 2)
  });

  const absolute_top_y = find_top_y(consumer_markers_data, top_y);
  const indexed_markers = index_consumer_markers(consumer_markers_data);

  return {
    kind: "partition",
    id: uuidv4(),
    rendering: {
      partition_label: {
        x: left_x + part_id_margin_left,
        y: top_y + part_id_margin_top
      },
      container: {
        x: left_x,
        y: top_y,
        rx: 10,
        width: part_width,
        height: part_height,
        fill: part_container_fill
      },
    },
    vars: {
      partition_id: partition,
      indexed_consumer_markers: indexed_markers
    },
    refs: {
      top_y: absolute_top_y,
      midpoint_y: midpoint_y,
      right_x: right_x,
      left_x: left_x
    },
    children: {
      rows: rows_data,
      consumer_markers: consumer_markers_data
    }
  };
}

export function render(data, styles, computed) {
  const { id, vars, rendering, children } = data;
  const { partition_label, container } = rendering;
  const { rows, consumer_markers } = children;

  const g = create_svg_el("g");
  g.id = id;
  g.classList.add("partition-container");

  const text = create_svg_el("text");
  text.setAttributeNS(null, "x", partition_label.x);
  text.setAttributeNS(null, "y", partition_label.y);
  text.classList.add("code");
  text.textContent = vars.partition_id;

  const d_container = create_svg_el("rect");
  d_container.setAttributeNS(null, "x", container.x);
  d_container.setAttributeNS(null, "y", container.y);
  d_container.setAttributeNS(null, "rx", container.rx);
  d_container.setAttributeNS(null, "width", container.width);
  d_container.setAttributeNS(null, "height", container.height);
  d_container.setAttributeNS(null, "fill", container.fill);

  const rows_g = create_svg_el("g");
  rows_g.classList.add("rows");

  const d_rows = rows.map(row => r.render(row));
  d_rows.forEach(row => rows_g.appendChild(row));

  const markers_g = create_svg_el("g");
  markers_g.classList.add("consumer-markers");

  const d_consumer_markers = consumer_markers.map(marker => c.render(marker));
  d_consumer_markers.forEach(marker => markers_g.appendChild(marker));

  g.appendChild(text);
  g.appendChild(d_container);
  g.appendChild(rows_g);
  g.appendChild(markers_g);

  return g;
}
