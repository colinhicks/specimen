import * as stream from "./components/stream";
import * as pq from "./components/persistent-query";
import * as controls from "./components/controls";
import * as svg from "./components/svg";
import * as qt from "./components/query-text";
import * as rc from "./components/row-card";
import * as f from "./components/free";
import * as ci from "./component-index";
import * as v from "./vertical";
import * as s from "./styles";
import * as rt from "./runtime";
import * as a from "./animate";
import * as graphlib from "graphlib";

import anime from "animejs/lib/anime.es.js";

import { uuidv4, inverse_map } from "./util";

let data_fns = {
  "stream": stream.build_data,
  "persistent_query": pq.build_data
};

let rendering_fns = {
  "stream": stream.render,
  "persistent_query": pq.render,
}

function add_metadata(component, styles) {
  const { row_default_fill } = styles;

  switch(component.kind) {
  case "stream":
    component.partitions.forEach((partition, partition_id) => {
      partition.forEach((row, offset) => {
        row.record = {
          stream: component.name,
          partition: partition_id,
          offset: offset,
          t: row.t,
          key: row.key,
          value: row.value
        };

        row.style = { ...{ fill: row_default_fill }, ...row.style };
      });
    });

    return component;
  default:
    return component;
  }
}

export function Specimen(container, styles) {
  this._container = container;
  this._styles = { ... s.styles, ...styles };
  this._graph = new graphlib.Graph();
}

Specimen.prototype.add_root = function(node) {
  this._graph.setNode(node.name, add_metadata(node, this._styles));
  return this;
}

Specimen.prototype.add_child = function(parents, node) {
  this._graph.setNode(node.name, add_metadata(node, this._styles));

  parents.forEach(parent => {
    this._graph.setEdge(parent, node.name);
  });

  return this;
}

Specimen.prototype.get_node = function(name) {
  return this._graph.node(name);
}

Specimen.prototype.layout_buckets = function() {
  let index = {};
  const seq = graphlib.alg.topsort(this._graph);

  seq.forEach(x => {
    const parents = this._graph.predecessors(x);

    if (parents.length == 0) {
      index[x] = 0;
    } else {
      const parent_indices = parents.reduce((o, k) => {
        o[k] = index[k];
        return o;
      }, {});

      const max_parent = Math.max(...Object.values(parent_indices));

      index[x] = max_parent + 1;
    }
  });

  return inverse_map(index);
}

Specimen.prototype.horizontal_layout = function() {
  const { svg_width } = this._styles;

  const buckets = this.layout_buckets();
  const n = Object.keys(buckets).length;
  const column_width = (svg_width / n);

  const layout = Object.entries(buckets).reduce((all, pair) => {
    const [i, names] = pair;
    const midpoint_x = (i * column_width) + (column_width / 2);

    let result = []
    let top_y = 0;

    names.sort().forEach((name, i) => {
      const node = this._graph.node(name);
      const predecessors = this._graph.predecessors(name);
      const successors = this._graph.successors(name);

      const computed = {
        predecessors: predecessors,
        successors: successors,
        top_y: top_y,
        midpoint_x: midpoint_x
      };

      if (node.kind == "persistent_query") {
        const source_partitions = this._graph.predecessors(node.name).reduce((acc, parent) => {
          const node = this.get_node(parent);
          acc[parent] = Object.keys(node.partitions);          
          return acc;
        }, {});

        node.source_partitions = source_partitions;
        node.index = i;
      } 

      const data_fn = data_fns[node.kind];
      const data = data_fn(node, this._styles, computed);

      data.name = name;
      top_y = data.refs.bottom_y;
      result.push(data)
    });

    all.push(result);
    return all;
  }, []);

  return v.vertically_center_layout(layout).flatMap(xs => xs);
}

Specimen.prototype.draw_layout = function(layout) {
  const svg_data = svg.build_data({}, this._styles, {});
  const svg_el = svg.render(svg_data);

  layout.forEach(data => {
    const fn = rendering_fns[data.kind];
    const element = fn(data);
    svg_el.appendChild(element);
  });

  const target = document.querySelector(this._container);
  target.appendChild(svg_el);

  const query_text_data = qt.build_data({}, this._styles, {});
  qt.render(query_text_data, this._styles, {
    target: svg_el,
    layout: layout
  });

  const by_id = ci.index_by_id(layout);
  ci.pack(svg_data, by_id);
  ci.pack(query_text_data, by_id);

  return by_id;
}

Specimen.prototype.animate = function(by_id) {
  let progress_el = undefined;

  let anime_commands = [];
  let anime_callbacks = {
    cbs: [],
    index: 0
  };

  const timeline = anime.timeline({
    autoplay: true,
    loop: true,
    endDelay: 250,
    begin: function(anim) {
      rewind_callbacks(anim, anime_callbacks);
    },
    update: function(anim) {
      const anime_t = anim.currentTime;

      if (!anim.reversePlayback) {
        fastfoward_callbacks(anim, anime_callbacks);
      } else {
        rewind_callbacks(anim, anime_callbacks);
      }

      progress_el.value = timeline.progress;
    }
  });

  const by_name = ci.index_by_name(by_id);
  const objs = Object.values(by_id)

  const unpack_by_id = (id) => ci.unpack(by_id, id);
  const unpack_by_name = (name) => unpack_by_id(by_name[name]);
  const pack = (obj) => ci.pack(obj, by_id);

  const data_fns = {
    by_id: unpack_by_id,
    by_name: unpack_by_name,
    pack: pack
  };

  const target = document.querySelector(this._container);
  const svg_el = document.getElementById(unpack_by_name("svg-container").id);

  const query_text_el = document.getElementById(unpack_by_name("query-text").id);

  const controls_data = controls.build_data({}, this._styles, {
    timeline: timeline,
    callbacks: anime_callbacks,
  });
  const controls_el = controls.render(controls_data);

  const free_data = f.build_data({}, this._styles, {});
  const free_el = f.render(free_data);

  svg_el.appendChild(free_el);

  if (this._styles.render_controls) {
    query_text_el.insertAdjacentElement("beforebegin", controls_el);
  }

  progress_el = document.getElementById(controls_data.rendering.progress.id);

  let rt_context = rt.init_runtime(objs, data_fns);
  const animation_context = a.init_animation_context();

  while (rt_context.drained != true) {
    const next_context = rt.tick(rt_context)
    const action = next_context.action;
    const lineage = next_context.lineage;

    if (action) {
      a.update_layout(action, data_fns, this._styles, free_el);
      const animation_seq = a.animation_seq(action, data_fns, this._styles);
      const anime_data = a.anime_data(animation_context, animation_seq, data_fns, lineage, this._styles);

      anime_commands = anime_commands.concat(anime_data.commands);
      anime_callbacks.cbs = anime_callbacks.cbs.concat(anime_data.callbacks);
    }

    rt_context = next_context;
  }

  anime_commands.forEach(c => timeline.add(c.params, c.t));

  const external_el = document.createElement("div");
  external_el.classList.add("external-objects");
  
  // Render cards last so that they fall outside
  // the SVG to track the absolute cursor position.
  Object.values(by_id).forEach(obj => {
    if (obj.kind == "row_card") {
      const card_el = rc.render(obj);
      external_el.appendChild(card_el);
    }
  });

  svg_el.insertAdjacentElement("afterend", external_el);

  // Use a sorted data structure to skip this.
  anime_callbacks.cbs.sort(function(a, b) {
    if (a.t < b.t) {
      return -1;
    } else if (a.t == b.t) {
      return 0;
    } else {
      return 1;
    }
  });
}

Specimen.prototype.render = function() {
  const layout = this.horizontal_layout();
  const by_id = this.draw_layout(layout);
  this.animate(by_id);
}

function rewind_callbacks(anim, anime_callbacks) {
  const anime_t = anim.currentTime;
  
  if (anime_callbacks.index >= anime_callbacks.cbs.length) {
    anime_callbacks.index = anime_callbacks.cbs.length - 1;
  }

  while ((anime_callbacks.index >= 0) && anime_callbacks.cbs[anime_callbacks.index].t >= anime_t) {
    anime_callbacks.cbs[anime_callbacks.index].undo();
    anime_callbacks.index--;
  }
}

function fastfoward_callbacks(anim, anime_callbacks) {
  const anime_t = anim.currentTime;

  if (anime_callbacks.index < 0) {
    anime_callbacks.index = 0;
  }

  while ((anime_callbacks.index < anime_callbacks.cbs.length) &&
         (anime_callbacks.cbs[anime_callbacks.index].t <= anime_t)) {
    anime_callbacks.cbs[anime_callbacks.index].apply();
    anime_callbacks.index++;
  }
}
