import { uuidv4, select_keys, create_svg_el } from './../util';

export function build_data(config, styles, computed) {
  const { row_id, record, viewable } = config;

  return {
    kind: "row_card",
    id: uuidv4(),
    vars: {
      row_id,
      record,
      viewable
    }
  };
}

function show_record_contents(card_id) {
  // hack: This should be passed from styles,
  // or we should change the DOM hierarchy to make it unnecessary.
  // This is the y offset of svg.animation relative to the .specimen container
  const svgTopOffset = 190;
  
  return function(event) {
    
    const card = document.getElementById(card_id);    

    card.style.display = "block";
    card.style.left = event.offsetX + 10 + "px";
    card.style.top = event.offsetY + svgTopOffset + 10 + "px";
  };
}

function hide_record_contents(card_id) {
  return function(event) {
    const card = document.getElementById(card_id);
    card.style.display = "none";
  }
}

function card_text(record ) {
  const record_ks = ["stream", "partition", "offset", "t", "key", "value"];
  const row_data = select_keys(record, record_ks);
  return JSON.stringify(row_data, null, 4);
}

export function render(data) {
  const { id, vars, rendering } = data;
  const { viewable } = vars;

  const card = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  card.id = id;
  card.style.background = "#f2f2f2";
  card.style.border = "1px solid black";
  card.style.borderRadius = "5px";
  card.style.padding = "5px";
  card.style.position = "absolute";
  card.style.display = "none";
  card.style.whiteSpace = "pre";
  card.classList.add("code");
  card.textContent = card_text(vars.record);

  const row = document.getElementById(vars.row_id);

  if (viewable) {
    row.onmousemove = show_record_contents(id);
    row.onmouseout = hide_record_contents(id);
  }

  return card;
}

export function update_card_text(row_card, record) {
  const { id } = row_card;
  const el = document.getElementById(id);

  el.textContent = card_text(record);
}

export function toggle_visibility(row_card) {
  console.log(row_card);
  const { id, vars } = row_card;
  const { row_id, viewable } = vars;

  const row = document.getElementById(vars.row_id);  

  if (viewable) {
    row.onmousemove = show_record_contents(id);
    row.onmouseout = hide_record_contents(id);
  } else {
    row.onmousemove = () => {};
    row.onmouseout = () => {};
  }
}
