import * as r from "./../components/row";
import * as rc from "./../components/row-card";
import * as c from "./common";
import { relative_add, relative_sub, ms_for_translate } from "./../util";

function adjust_rendering(action, data_fns, styles) {
  const { by_id, by_name, pack } = data_fns;
  const { d_row_margin_left } = styles;
  const { stream, partition } = action.before.row.vars.record;

  const stream_data = by_name(stream);
  const partition_data = stream_data.children.partitions[partition];

  const right_x = partition_data.refs.right_x + d_row_margin_left;
  const row_data = by_id(action.after.row.id);

  row_data.rendering.x = right_x;

  // New card for new row.
  const card_config = {
    row_id: row_data.id,
    record: action.before.row.vars.record,
    viewable: false
  };

  row_data.children.row_card = rc.build_data(card_config, styles, {});

  pack(row_data);
}

function draw_new_row(action, data_fns) {
  const { by_id } = data_fns;
  const row_data = by_id(action.after.row.id);

  return r.render(row_data);
}

export function update_layout(action, data_fns, styles, free_el) {
  adjust_rendering(action, data_fns, styles);

  const row = draw_new_row(action, data_fns);
  free_el.appendChild(row);
}

export function animation_seq(action, data_fns, styles) {
  const { before, after, processed_by } = action;
  const { by_id, by_name, pack } = data_fns;
  const { row_width, row_height, row_offset_right, row_margin_left } = styles;
  const { d_row_enter_offset } = styles;
  const { consumer_m_margin_right } = styles;

  const before_record = before.row.vars.record;
  const before_stream_data = by_name(before_record.stream);
  const before_part_data = before_stream_data.children.partitions[before_record.partition];

  const after_record = after.row.vars.record;
  const after_stream_data = by_name(after_record.stream);
  const after_part_data = after_stream_data.children.partitions[after_record.partition];

  const pq_data = by_name(processed_by);
  const pq_enter_x = pq_data.refs.left_x;
  const pq_enter_y = pq_data.refs.midpoint_y;
  const pq_exit_x = pq_data.refs.right_x;

  const after_part_right_x = after_part_data.refs.right_x;
  const after_part_left_x = after_part_data.refs.left_x;

  const appear_x = after.row.rendering.x;
  const appear_y = after.row.rendering.y;

  const move_to_pq_center_x = pq_enter_x - d_row_enter_offset;
  const move_to_pq_center_y = pq_enter_y;

  const approach_pq_x = pq_enter_x;
  const traverse_pq_x = pq_exit_x;
  const depart_pq_x = traverse_pq_x + d_row_enter_offset;

  const move_to_partition_center_x = after_part_left_x - d_row_enter_offset;
  const move_to_partition_center_y = after_part_data.refs.midpoint_y - (row_height / 2);

  const after_part_margin = after_record.offset * row_margin_left;
  const after_part_spacing = after_record.offset * row_width;
  const enter_partition_x = after_part_right_x - after_part_margin - row_offset_right - after_part_spacing - row_width;

  after.row.rendering.x = enter_partition_x;
  after.row.rendering.y = move_to_partition_center_y;

  const before_fill = action.before.row.rendering.fill;
  let after_fill = undefined;

  if(pq_data.rendering.style.fill) {
    after_fill = pq_data.rendering.style.fill(before_record, after_record);
    after.row.rendering.fill = after_fill;
  }

  const fill_change = [before_fill, after_fill || before_fill];

  pack(after.row);
  after.row = by_id(after.row.id);

  const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[processed_by];
  const consumer_marker_data = by_id(consumer_marker_id);
  const derived_row_data = by_id(after.row.vars.derived_id);

  const consumer_marker_before_x = consumer_marker_data.rendering.left_x;
  const consumer_marker_after_x = derived_row_data.rendering.x + (row_width / 2) - consumer_m_margin_right;

  // If the offset is 0, it's a reasonable proxy that this is the first
  // record in the partition, so it's time to unveil the consumer marker.
  let consumer_marker_opacity = undefined;
  if (before_record.offset == 0) {
    consumer_marker_opacity = [0, 1];
  }

  consumer_marker_data.rendering.left_x = consumer_marker_after_x;
  pack(consumer_marker_data);

  return {
    kind: "keep",
    action: action,
    animations: {
      appear: {
      },
      move_to_pq_center: {
        translateX: (move_to_pq_center_x - appear_x),
        translateY: (move_to_pq_center_y - appear_y)
      },
      approach_pq: {
        translateX: (approach_pq_x - move_to_pq_center_x)
      },
      traverse_pq: {
        translateX: (traverse_pq_x - approach_pq_x),
        fill: fill_change
      },
      depart_pq: {
        translateX: (depart_pq_x - traverse_pq_x)
      },
      move_to_partition_center: {
        translateX: (move_to_partition_center_x - depart_pq_x),
        translateY: (move_to_partition_center_y - move_to_pq_center_y)
      },
      enter_partition: {
        translateX: (enter_partition_x - move_to_partition_center_x)
      },
      move_consumer_marker: {
        translateX: (consumer_marker_before_x - consumer_marker_after_x),
        opacity: consumer_marker_opacity
      }
    }
  };
}

export function anime_data(ctx, action_animation_seq, data_fns, lineage, styles) {
  const { t, history } = ctx;
  const { action, animations } = action_animation_seq;
  const { by_name, by_id } = data_fns;
  const { ms_px, d_row_appear_ms } = styles;

  const pq_t = (t[action.processed_by] || 0);
  const row_history = (history[lineage[action.before.row.id]] || 0);
  const t_offset = ((row_history >= pq_t) ? row_history : pq_t);

  const appear_ms = d_row_appear_ms;
  const move_to_pq_center_ms = ms_for_translate(animations.move_to_pq_center, ms_px);
  const approach_pq_ms = ms_for_translate(animations.approach_pq, ms_px);
  const traverse_pq_ms = ms_for_translate(animations.traverse_pq, ms_px);
  const depart_pq_ms = ms_for_translate(animations.depart_pq, ms_px);
  const move_to_partition_center_ms = ms_for_translate(animations.move_to_partition_center, ms_px);
  const enter_partition_ms = ms_for_translate(animations.enter_partition, ms_px);

  const consumer_marker_ms = ms_for_translate(animations.move_consumer_marker, ms_px);

  const row_movement = {
    t: t_offset,
    params: {
      targets: `#${action.after.row.id}`,
      easing: "linear",
      keyframes: [
        {
          duration: appear_ms,
          opacity: [0, 1]
        },
        {
          duration: move_to_pq_center_ms,
          translateX: relative_add(animations.move_to_pq_center.translateX),
          translateY: relative_add(animations.move_to_pq_center.translateY)
        },
        {
          duration: approach_pq_ms,
          translateX: relative_add(animations.approach_pq.translateX)
        },
        {
          duration: traverse_pq_ms,
          translateX: relative_add(animations.traverse_pq.translateX),
          fill: animations.traverse_pq.fill,
        },
        {
          duration: depart_pq_ms,
          translateX: relative_add(animations.depart_pq.translateX)
        },
        {
          duration: move_to_partition_center_ms,
          translateX: relative_add(animations.move_to_partition_center.translateX),
          translateY: relative_add(animations.move_to_partition_center.translateY)
        },
        {
          duration: enter_partition_ms,
          translateX: relative_add(animations.enter_partition.translateX)
        }
      ]
    }
  };

  t[action.processed_by] = (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms);
  history[action.before.row.id] = (
    t_offset +
      appear_ms +
      move_to_pq_center_ms +
      approach_pq_ms +
      traverse_pq_ms +
      depart_pq_ms +
      move_to_partition_center_ms +
      enter_partition_ms
  );

  const before_record = action.before.row.vars.record;
  const before_stream_data = by_name(before_record.stream);
  const before_part_data = before_stream_data.children.partitions[before_record.partition];
  const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[action.processed_by];

  const consumer_marker_movement = {
    t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
    params: {
      targets: `#${consumer_marker_id}`,
      easing: "linear",
      keyframes: [
        {
          duration: 1,
          opacity: animations.move_consumer_marker.opacity
        },
        {
          duration: consumer_marker_ms,
          translateX: relative_sub(animations.move_consumer_marker.translateX)
        }
      ]
    }
  };

  const card_id = action.after.row.children.row_card.id;

  const unhide_row_card = {
    t: t_offset,
    apply: function() {
      c.toggle_row_card_visibility(data_fns, card_id, true);
    },
    undo: function() {
      c.toggle_row_card_visibility(data_fns, card_id, false);
    }
  };

  const update_stream_time = {
    t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
    apply: function() {
      c.update_stream_time_text(data_fns, action.processed_by, action.after);
    },
    undo: function() {
      c.update_stream_time_text(data_fns, action.processed_by, action.before);
    }
  };

  const update_pq_offsets = {
    t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
    apply: function() {
      c.update_pq_offsets(data_fns, action.processed_by, action.after.offsets);
    },
    undo: function() {
      c.update_pq_offsets(data_fns, action.processed_by, action.before.offsets);
    }
  };
  
  const update_row_card = {
    t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
    apply: function() {
      c.update_row_card(data_fns, card_id, action.after.row);
    },
    undo: function() {
      c.update_row_card(data_fns, card_id, action.before.row);
    }
  };

  return {
    commands: [
      row_movement,
      consumer_marker_movement
    ],
    callbacks: [
      unhide_row_card,
      update_stream_time,
      update_pq_offsets,
      update_row_card
    ]
  };
}
