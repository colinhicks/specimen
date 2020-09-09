import { uuidv4, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { aggregate, pq_style } = config;
  const { columns } = aggregate;
  const { materialized_view_height } = pq_style;
  const { top_y, left_x, width } = computed;

  const bottom_y = top_y + materialized_view_height;
  
  return {
    kind: "materialized_view",
    id: uuidv4(),
    rendering: {
      container: {
        x: left_x,
        y: top_y,
        rx: 10,
        width: width,
        height: materialized_view_height
      }
    },
    vars: {
      columns,
      row_index: {},
      next_row_y: top_y + 60,
    },
    refs: {
      left_x, bottom_y
    }
  }
}

function make_dashes(columns) {
  return columns.reduce((all, { width }) => {
    return all + "+" + "-".repeat(width);
  }, "") + "+";
};

function make_column_names(columns) {
  return columns.reduce((all, { name, width }) => {
    const spare = width - name.length;
    const pad = Math.max(0, spare / 2);
    const left = Math.ceil(pad);
    const right = Math.floor(pad);
    
    return all + "|" + " ".repeat(left) + name + " ".repeat(right);
  }, "") + "|";
}

function make_row(columns, table_row) {
  return columns.reduce((all, { name, width }) => {
    const v = table_row[name];

    const spare = width - String(v).length;
    const pad = Math.max(0, spare / 2);
    const left = Math.ceil(pad);
    const right = Math.floor(pad);

    return all + "|" + " ".repeat(left) + v + " ".repeat(right);
  }, "") + "|";
}

export function render(data) {
  const { id, vars, rendering } = data;
  const { columns } = vars;
  const { container } = rendering;
  
  const g = create_svg_el("g");
  g.id = id;

  const d_container = create_svg_el("rect");
  d_container.setAttributeNS(null, "x", container.x);
  d_container.setAttributeNS(null, "y", container.y);
  d_container.setAttributeNS(null, "rx", container.rx);
  d_container.setAttributeNS(null, "width", container.width);
  d_container.setAttributeNS(null, "height", container.height);
  d_container.setAttributeNS(null, "fill", "#fbf7e6");

  const d_dashes_upper = create_svg_el("text");
  d_dashes_upper.setAttributeNS(null, "x", container.x);
  d_dashes_upper.setAttributeNS(null, "y", container.y + 15);
  d_dashes_upper.classList.add("code");
  d_dashes_upper.textContent = make_dashes(columns);

  const d_headers = create_svg_el("text");
  d_headers.setAttributeNS(null, "x", container.x);
  d_headers.setAttributeNS(null, "y", container.y + 30);
  d_headers.style.whiteSpace = "pre";
  d_headers.classList.add("code");
  d_headers.textContent = make_column_names(columns);

  const d_dashes_lower = create_svg_el("text");
  d_dashes_lower.setAttributeNS(null, "x", container.x);
  d_dashes_lower.setAttributeNS(null, "y", container.y + 45);
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
  const { container } = rendering;
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
    d_row.style.whiteSpace = "pre";
    d_row.classList.add("code");
    d_row.textContent = make_row(columns, table_row);

    const el = document.getElementById(id);
    el.appendChild(d_row);
    
    vars.next_row_y += 15;
    row_index[record.key].id = el_id;
  }
}

export function undo_row(mv, key, table_row) {
  const { vars } = mv;
  const { columns, row_index } = vars;

  const d_row = document.getElementById(row_index[key].id);

  if (table_row) {
    d_row.textContent = make_row(columns, table_row.data);
  } else {
    row_index[key] = undefined;
    vars.next_row_y -= 15;
    d_row.remove();
  }
};
