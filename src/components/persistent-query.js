import { uuidv4, create_svg_el } from './../util';
import * as sp from './source-partition';
import * as st from './stream-time';

function build_source_partitions_data(arr, styles, computed) {
  const { left_x, top_y, margin } = computed;
  let current_top_y = top_y;

  return Object.entries(arr).reduce((all, [stream, partitions]) => {
    partitions.forEach(partition => {
      const this_top_y = current_top_y;

      const config = {
        stream: stream,
        partition: partition
      };

      const this_computed = {
        left_x: left_x,
        top_y: this_top_y,
        bottom_margin: margin
      };

      all.push(sp.build_data(config, styles, this_computed));
      current_top_y += margin;
    });

    return all;
  }, []);
}

export function build_data(config, styles, computed) {
  const { name, source_partitions, query_text, style: pq_style } = config;
  const { into, where, partition_by } = config;

  const { pq_width, pq_height, pq_margin_top, pq_bracket_len } = styles;
  const { pq_label_margin_left, pq_label_margin_bottom } = styles;
  const { pq_metadata_offset_top, pq_metadata_margin_top } = styles;

  const { predecessors, successors, top_y, midpoint_x } = computed;

  const absolute_top_y = top_y + pq_margin_top;
  let top_y_slide = absolute_top_y;

  const box_bottom_y = top_y_slide + pq_height;
  const left_x = midpoint_x - (pq_width / 2);
  const right_x = midpoint_x + (pq_width / 2);
  const line_bottom_y = top_y_slide - 5;
  const b_len = pq_bracket_len;

  const metadata_top_y = box_bottom_y + pq_metadata_offset_top;
  const source_partitions_data = build_source_partitions_data(source_partitions, styles, {
    left_x: left_x,
    top_y: metadata_top_y,
    margin: pq_metadata_margin_top
  });

  top_y_slide = source_partitions_data.slice(-1)[0].refs.bottom_y + pq_metadata_offset_top;
  const stream_time_data = st.build_data({}, styles, {
    left_x: left_x,
    top_y: top_y_slide,
    bottom_margin: pq_metadata_margin_top
  });

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
      brackets: {
        tl: {
          x: left_x + b_len,
          y: absolute_top_y,
          h: -b_len,
          v: b_len
        },
        tr: {
          x: right_x - b_len,
          y: absolute_top_y,
          h: b_len,
          v: b_len
        },
        bl: {
          x: left_x,
          y: box_bottom_y - b_len,
          v: b_len,
          h: b_len
        },
        br: {
          x: right_x,
          y: box_bottom_y - b_len,
          v: b_len,
          h: -b_len
        }
      },
      style: pq_style || {},
    },
    vars: {
      query_text: query_text,
      query_parts: {
        into: into,
        where: where,
        partition_by: partition_by
      }
    },
    children: {
      stream_time: stream_time_data,
      source_partitions: source_partitions_data
    },
    graph: {
      predecessors: predecessors,
      successors: successors
    },
    refs: {
      top_y: absolute_top_y,
      bottom_y: stream_time_data.refs.bottom_y,
      midpoint_y: box_bottom_y - (pq_height / 2),
      left_x: left_x,
      right_x: right_x,
      midpoint_x: midpoint_x
    }
  }
}

export function render(data) {
  const { id, name, vars, rendering, children } = data;
  const { line, label, brackets } = rendering;
  const { tl, tr, bl, br } = brackets;
  const { stream_time, source_partitions } = children;

  const g = create_svg_el("g");
  g.id = id;
  g.classList.add("persistent-query-container");

  const d_line = create_svg_el("line");
  d_line.setAttributeNS(null, "x1", line.x1);
  d_line.setAttributeNS(null, "y1", line.y1);
  d_line.setAttributeNS(null, "x2", line.x2);
  d_line.setAttributeNS(null, "y2", line.y2);
  d_line.classList.add("pq-connector");

  const d_tl = create_svg_el("path");
  d_tl.setAttributeNS(null, "d", `M ${tl.x},${tl.y} h ${tl.h} v ${tl.v}`);
  d_tl.classList.add("pq");

  const d_tr = create_svg_el("path");
  d_tr.setAttributeNS(null, "d", `M ${tr.x},${tr.y} h ${tr.h} v ${tr.v}`);
  d_tr.classList.add("pq");

  const d_bl = create_svg_el("path");
  d_bl.setAttributeNS(null, "d", `M ${bl.x},${bl.y} v ${bl.v} h ${bl.h}`);
  d_bl.classList.add("pq");

  const d_br = create_svg_el("path");
  d_br.setAttributeNS(null, "d", `M ${br.x},${br.y} v ${br.v} h ${br.h}`);
  d_br.classList.add("pq");

  const d_label = create_svg_el("text");
  d_label.setAttributeNS(null, "x", label.x);
  d_label.setAttributeNS(null, "y", label.y);
  d_label.classList.add("code");
  d_label.textContent = name;

  const d_stream_time = st.render(stream_time);
  const d_source_partitions = source_partitions.map(s => sp.render(s));
  
  g.appendChild(d_line);
  g.appendChild(d_tl);
  g.appendChild(d_tr);
  g.appendChild(d_bl);
  g.appendChild(d_br);
  g.appendChild(d_label);
  g.appendChild(d_stream_time);
  d_source_partitions.forEach(sp => g.appendChild(sp));

  return g;
}
