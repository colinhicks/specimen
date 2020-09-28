import { uuidv4 } from './../util';

const code_padding = 20;

export function build_data(config, styles, computed) {
  return {
    kind: "query-text",
    id: uuidv4(),
    name: "query-text"
  };
}

function make_code_container(code) {
  const new_code = document.createElement("code");
  new_code.classList.add("lang-sql");
  new_code.innerText = code.join("\n");

  const new_pre = document.createElement("pre");
  new_pre.style.position = "absolute";
  new_pre.style.bottom = "0";
  new_pre.style.left = "0";
  new_pre.style.right = "0";

  new_pre.style.marginLeft = "auto";
  new_pre.style.marginRight = "auto";
  new_pre.appendChild(new_code);

  return {
    pre: new_pre,
    code: new_code
  };
}

function make_parent_container(id, children) {
  const new_div = document.createElement("div");
  new_div.id = id;
  new_div.style.position = "relative";
  new_div.classList.add("pq-code-container");

  children.forEach(child => new_div.appendChild(child.pre));

  return new_div;
}

function set_pre_width({ pre, code }) {
  pre.style.width = `${code.offsetWidth + code_padding}px`;
}

function set_parent_height(parent, children) {
  console.log(children);
  const heights = children.map(child => child.pre.offsetHeight);
  const height = Math.max(...heights);
  parent.style.height = `${height}px`;
}

function set_pre_transform(pq, { pre }, svg_width) {
  const x = (pq.rendering.line.x1) - (svg_width / 2);

  pre.style.webkitTransform = `translateX(${x}px)`;
  pre.style.MozTransform = `translateX(${x}px)`;
  pre.style.msTransform = `translateX(${x}px)`;
  pre.style.OTransform = `translateX(${x}px)`;
  pre.style.transform = `translateX(${x}px)`;
}

export function render(data, styles, computed) {
  const { id } = data;
  const { svg_width } = styles;
  const { layout, target } = computed;

  const pqs = layout.filter(component => {
    return (component.kind == "persistent_query") && component.rendering.top_component;
  });

  const children = pqs.map(pq => make_code_container(pq.vars.query_text));
  const parent = make_parent_container(id, children);

  target.insertAdjacentElement("beforebegin", parent);

  children.forEach(child => set_pre_width(child));
  set_parent_height(parent, children);

  pqs.forEach((pq, i) => set_pre_transform(pq, children[i], svg_width));

  return parent;
}
