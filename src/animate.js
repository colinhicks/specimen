import * as k from "./animations/keep";
import * as d from "./animations/discard";
import * as a from "./animations/absorb";

let update_layout_fns = {
  "keep": k.update_layout,
  "discard": k.update_layout,
  "absorb": k.update_layout
};

let animation_seq_fns = {
  "keep": k.animation_seq,
  "discard": d.animation_seq,
  "absorb": a.animation_seq
};

let anime_data_fns = {
  "keep": k.anime_data,
  "discard": d.anime_data,
  "absorb": a.anime_data
};

export function init_animation_context() {
  return {
    t: {},
    history: {}
  };
}

export function update_layout(action, data_fns, styles, free_el) {
  const { by_id } = data_fns;
  
  const layout_fn = update_layout_fns[action.kind];
  layout_fn(action, data_fns, styles, free_el);

  // The layout has mutated, so this row needs to be refreshed.
  action.after.row = by_id(action.after.row.id);
}

export function animation_seq(action, data_fns, styles) {
  const animation_seq_fn = animation_seq_fns[action.kind];
  return animation_seq_fn(action, data_fns, styles);
}

export function anime_data(ctx, action_animation_seq, data_fns, lineage, styles) {
  const anime_data_fn = anime_data_fns[action_animation_seq.kind];
  return anime_data_fn(ctx, action_animation_seq, data_fns, lineage, styles);
}
