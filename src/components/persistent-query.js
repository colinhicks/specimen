import { uuidv4, create_svg_el } from './../util';
import * as sps from './source-partitions';
import * as st from './stream-time';
import * as mv from './materialized-view';

export function build_data(config, styles, computed) {
  const { name, source_partitions, query_text, index, style: pq_style } = config;
  const { select, aggregate, into, where, partition_by } = config;

  const { pq_width, pq_height, pq_container_fill,
          pq_container_opacity, pq_margin_top
        } = styles;
  const { pq_label_margin_left, pq_label_margin_bottom } = styles;
  const { pq_metadata_offset_top, pq_metadata_margin_top } = styles;
  const { st_margin_top, st_margin_left } = styles;

  const { predecessors, successors, top_y, midpoint_x } = computed;

  const absolute_top_y = top_y + pq_margin_top;
  let top_y_slide = absolute_top_y;

  const box_bottom_y = top_y_slide + pq_height;
  const left_x = midpoint_x - (pq_width / 2);
  const right_x = midpoint_x + (pq_width / 2);
  const line_bottom_y = top_y_slide - 5;

  const metadata_top_y = box_bottom_y + pq_metadata_offset_top;
  const source_partitions_data = sps.build_data({ source_partitions }, styles, {
    left_x: left_x,
    top_y: metadata_top_y,
    width: pq_width,
    margin: pq_metadata_margin_top
  });

  top_y_slide = source_partitions_data.children.partitions.slice(-1)[0].refs.bottom_y + pq_metadata_offset_top;
  const stream_time_data = st.build_data({}, styles, {
    left_x: left_x + st_margin_left,
    top_y: absolute_top_y + st_margin_top,
    bottom_margin: pq_metadata_margin_top
  });

  const children = {
    stream_time: stream_time_data,
    source_partitions: source_partitions_data,
  };

  if (aggregate) {
    const mv_data = mv.build_data({ aggregate, pq_style }, styles, {
      top_y: top_y_slide,
      left_x: left_x,
      width: pq_width
    });
    top_y_slide = mv_data.refs.bottom_y;

    children.materialized_view = mv_data;
  }

  return {
    kind: "persistent_query",
    id: uuidv4(),
    name: name,
    rendering: {
      line: {
        x1: midpoint_x,
        y1: 0,
        x2: midpoint_x,
        y2: line_bottom_y
      },
      label: {
        name: name,
        x: left_x + pq_label_margin_left,
        y: absolute_top_y - pq_label_margin_bottom
      },
      container: {
        x: left_x,
        y: absolute_top_y,
        rx: 10,
        width: pq_width,
        height: pq_height,
        fill: pq_container_fill,
        opacity: pq_container_opacity
      },
      style: pq_style || {},
      top_component: index == 0
    },
    vars: {
      query_text: query_text,
      query_parts: {
        select,
        aggregate,
        into,
        where,
        partition_by
      },
      stateful: Boolean(aggregate)
    },
    children: children,
    graph: {
      predecessors: predecessors,
      successors: successors
    },
    refs: {
      top_y: absolute_top_y,
      bottom_y: top_y_slide,
      box_bottom_y: box_bottom_y,
      midpoint_y: box_bottom_y - (pq_height / 2),
      left_x: left_x,
      right_x: right_x,
      midpoint_x: midpoint_x
    }
  }
}

export function render(data) {
  const { id, name, vars, rendering, children } = data;
  const { line, label, container } = rendering;
  const { stream_time, source_partitions, materialized_view } = children;

  const g = create_svg_el("g");
  g.id = id;
  g.classList.add("persistent-query-container");

  const d_line = create_svg_el("line");
  d_line.setAttributeNS(null, "x1", line.x1);
  d_line.setAttributeNS(null, "y1", line.y1);
  d_line.setAttributeNS(null, "x2", line.x2);
  d_line.setAttributeNS(null, "y2", line.y2);
  d_line.classList.add("pq-connector");

  const d_container = create_svg_el("rect");
  d_container.setAttributeNS(null, "x", container.x);
  d_container.setAttributeNS(null, "y", container.y);
  d_container.setAttributeNS(null, "rx", container.rx);
  d_container.setAttributeNS(null, "width", container.width);
  d_container.setAttributeNS(null, "height", container.height);
  d_container.setAttributeNS(null, "fill", container.fill);
  d_container.setAttributeNS(null, "opacity", container.opacity);

  const d_label = create_svg_el("text");
  d_label.setAttributeNS(null, "x", label.x);
  d_label.setAttributeNS(null, "y", label.y);
  d_label.classList.add("code");
  d_label.textContent = name;

  const d_stream_time = st.render(stream_time);
  const d_source_partitions = sps.render(source_partitions);

  if (rendering.top_component) {
    g.appendChild(d_line);
  }

  g.appendChild(d_container);
  g.appendChild(d_label);
  g.appendChild(d_stream_time);
  g.appendChild(d_source_partitions);

  if (materialized_view) {
    const d_materialized_view = mv.render(materialized_view);
    g.appendChild(d_materialized_view);
  }

  return g;
}
