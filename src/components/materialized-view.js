import { uuidv4, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { aggregate, pq_style } = config;
  const { columns } = aggregate;
  const { materialized_view_height } = pq_style;
  const { mv_container_fill, mv_row_height, mv_margin_top, font_size } = styles;
  const { top_y, left_x, width } = computed;

  const bottom_y = top_y + materialized_view_height;
  // Three rows for upper dashes, headers, lower dashes.
  const next_y = mv_margin_top + (mv_row_height * 3);
  
  return {
    kind: "materialized_view",
    id: uuidv4(),
    rendering: {
      container: {
        x: left_x,
        y: top_y,
        rx: 10,
        width: width,
        height: materialized_view_height,
        fill: mv_container_fill
      },
      mv_margin_top,
      mv_row_height,
      mv_margin_top,
      font_size
    },
    vars: {
      columns,
      row_index: {},
      next_row_y: top_y + next_y,
    },
    refs: {
      left_x, bottom_y
    }
  }
}

const break_sym = "+";
const col_sym = "|";
const sep_sym = "-";

function make_dashes(columns) {
  return columns.reduce((all, { width }) => {
    return all + break_sym + sep_sym.repeat(width);
  }, "") + break_sym;
};

function make_padding(s, width) {
  const spare = width - String(s).length;
  const pad = Math.max(0, spare / 2);
  const left = Math.ceil(pad);
  const right = Math.floor(pad);

  return [ left, right ];
}

function make_column_names(columns) {
  return columns.reduce((all, { name, width }) => {
    const [ left, right ] = make_padding(name, width);

    return all + col_sym + " ".repeat(left) + name + " ".repeat(right);
  }, "") + col_sym;
}

function make_row(columns, table_row) {
  return columns.reduce((all, { name, width }) => {
    const v = table_row[name];
    const [ left, right ] = make_padding(v, width);

    return all + col_sym + " ".repeat(left) + v + " ".repeat(right);
  }, "") + col_sym;
}

export function render(data) {
  const { id, vars, rendering } = data;
  const { columns } = vars;
  const { container, mv_row_height, mv_margin_top } = rendering;
  
  const g = create_svg_el("g");
  g.id = id;

  const d_container = create_svg_el("rect");
  d_container.setAttributeNS(null, "x", container.x);
  d_container.setAttributeNS(null, "y", container.y);
  d_container.setAttributeNS(null, "rx", container.rx);
  d_container.setAttributeNS(null, "width", container.width);
  d_container.setAttributeNS(null, "height", container.height);
  d_container.setAttributeNS(null, "fill", container.fill);

  const d_dashes_upper = create_svg_el("text");
  d_dashes_upper.setAttributeNS(null, "x", container.x);
  d_dashes_upper.setAttributeNS(null, "y", container.y + mv_margin_top);
  d_dashes_upper.setAttributeNS(null, "font-size", rendering.font_size);
  d_dashes_upper.classList.add("code");
  d_dashes_upper.textContent = make_dashes(columns);

  const d_headers = create_svg_el("text");
  d_headers.setAttributeNS(null, "x", container.x);
  d_headers.setAttributeNS(null, "y", container.y + mv_margin_top + mv_row_height);
  d_headers.setAttributeNS(null, "font-size", rendering.font_size);
  d_headers.style.whiteSpace = "pre";
  d_headers.classList.add("code");
  d_headers.textContent = make_column_names(columns);

  const d_dashes_lower = create_svg_el("text");
  d_dashes_lower.setAttributeNS(null, "x", container.x);
  d_dashes_lower.setAttributeNS(null, "y", container.y + mv_margin_top + (mv_row_height * 2));
  d_dashes_lower.setAttributeNS(null, "font-size", rendering.font_size);
  d_dashes_lower.classList.add("code");
  d_dashes_lower.textContent = make_dashes(columns);
  
  g.appendChild(d_container);
  g.appendChild(d_dashes_upper);
  g.appendChild(d_headers);
  g.appendChild(d_dashes_lower);

  return g;
}

export function update_table(mv, row) {
  const { id, rendering, vars } = mv;
  const { container, mv_row_height } = rendering;
  const { columns, row_index } = vars;
  const record = row.vars.record;

  const table_row = columns.reduce((all, column) => {
    all[column.name] = column.lookup(record);
    return all;
  }, {});

  row_index[record.key] = row_index[record.key] || {};
  row_index[record.key].data = table_row;

  if (row_index[record.key].id) {
    const d_row = document.getElementById(row_index[record.key].id);
    d_row.textContent = make_row(columns, table_row);
  } else {
    const el_id = uuidv4();
    
    const d_row = create_svg_el("text");
    d_row.id = el_id;
    d_row.setAttributeNS(null, "x", container.x);
    d_row.setAttributeNS(null, "y", vars.next_row_y);
    d_row.setAttributeNS(null, "font-size", rendering.font_size);
    d_row.style.whiteSpace = "pre";
    d_row.classList.add("code");
    d_row.textContent = make_row(columns, table_row);

    const el = document.getElementById(id);
    el.appendChild(d_row);
    
    vars.next_row_y += mv_row_height;
    row_index[record.key].id = el_id;
  }
}

export function undo_row(mv, key, table_row) {
  const { vars, rendering } = mv;
  const { columns, row_index } = vars;
  const { mv_row_height } = rendering;

  const d_row = document.getElementById(row_index[key].id);

  if (table_row) {
    d_row.textContent = make_row(columns, table_row.data);
    row_index[key] = table_row;
  } else {
    row_index[key] = undefined;
    vars.next_row_y -= mv_row_height;
    d_row.remove();
  }
};
