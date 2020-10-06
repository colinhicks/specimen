import { uuidv4, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { name } = config;
  const { coll_tip_len, coll_foot_len, coll_tip_margin_top } = styles;
  const { part_width, part_height, font_size } = styles;
  const { top_y, midpoint_x } = computed;

  const left_x = midpoint_x - (part_width / 2);
  const right_x = midpoint_x + (part_width / 2);

  const coll_tip_top_y = top_y + coll_tip_margin_top;
  const coll_tip_bottom_y = coll_tip_top_y + coll_tip_len;
  const coll_foot_bottom_y = coll_tip_bottom_y + coll_foot_len;

  return {
    kind: "stream_label",
    id: uuidv4(),
    rendering: {
      text: {
        x: midpoint_x,
        y: top_y
      },
      tip: {
        x1: midpoint_x,
        y1: coll_tip_top_y,
        x2: midpoint_x,
        y2: coll_tip_bottom_y
      },
      bar: {
        x1: left_x,
        y1: coll_tip_bottom_y,
        x2: right_x,
        y2: coll_tip_bottom_y
      },
      left_foot: {
        x1: left_x,
        y1: coll_tip_bottom_y,
        x2: left_x,
        y2: coll_foot_bottom_y
      },
      right_foot: {
        x1: right_x,
        y1: coll_tip_bottom_y,
        x2: right_x,
        y2: coll_foot_bottom_y
      },
      font_size
    },
    vars: {
      name: name
    },
    refs: {
      bottom_y: coll_foot_bottom_y
    }
  };
}

export function render(data) {
  const { vars, rendering } = data;
  const { text, tip, bar, left_foot, right_foot } = rendering;

  const g = create_svg_el("g");
  g.classList.add("stream-label");

  const d_text = create_svg_el("text");
  d_text.setAttributeNS(null, "x", text.x);
  d_text.setAttributeNS(null, "y", text.y);
  d_text.setAttributeNS(null, "text-anchor", "middle");
  d_text.setAttributeNS(null, "font-size", rendering.font_size);
  d_text.classList.add("code");
  d_text.textContent = vars.name;

  const d_tip = create_svg_el("line");
  d_tip.setAttributeNS(null, "x1", tip.x1);
  d_tip.setAttributeNS(null, "y1", tip.y1);
  d_tip.setAttributeNS(null, "x2", tip.x2);
  d_tip.setAttributeNS(null, "y2", tip.y2);
  d_tip.classList.add("stream-connector");

  const d_bar = create_svg_el("line");
  d_bar.setAttributeNS(null, "x1", bar.x1);
  d_bar.setAttributeNS(null, "y1", bar.y1);
  d_bar.setAttributeNS(null, "x2", bar.x2);
  d_bar.setAttributeNS(null, "y2", bar.y2);
  d_bar.classList.add("stream-connector");

  const d_left_foot = create_svg_el("line");
  d_left_foot.setAttributeNS(null, "x1", left_foot.x1);
  d_left_foot.setAttributeNS(null, "y1", left_foot.y1);
  d_left_foot.setAttributeNS(null, "x2", left_foot.x2);
  d_left_foot.setAttributeNS(null, "y2", left_foot.y2);
  d_left_foot.classList.add("stream-connector");

  const d_right_foot = create_svg_el("line");
  d_right_foot.setAttributeNS(null, "x1", right_foot.x1);
  d_right_foot.setAttributeNS(null, "y1", right_foot.y1);
  d_right_foot.setAttributeNS(null, "x2", right_foot.x2);
  d_right_foot.setAttributeNS(null, "y2", right_foot.y2);
  d_right_foot.classList.add("stream-connector");

  g.appendChild(d_text);
  g.appendChild(d_tip);
  g.appendChild(d_bar);
  g.appendChild(d_left_foot);
  g.appendChild(d_right_foot);

  return g;
}
