import * as c from "./common";
import { relative_add, relative_sub, ms_for_translate } from "./../util";

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
  const cross_half_pq_x = pq_data.refs.midpoint_x;
  const fall_away_y = pq_data.refs.box_bottom_y - row_height;

  after.row.rendering.x = cross_half_pq_x;
  after.row.rendering.y = fall_away_y;
  pack(after.row);

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
    kind: "discard",
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
      cross_half_pq: {
        translateX: (cross_half_pq_x - approach_pq_x),
      },
      fall_away: {
        translateY: (fall_away_y - move_to_pq_center_y),
        opacity: [1, 0]
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
  const cross_half_pq_ms = ms_for_translate(animations.cross_half_pq, ms_px);
  const fall_away_ms = ms_for_translate(animations.fall_away, ms_px);

  const consumer_marker_ms = ms_for_translate(animations.move_consumer_marker, ms_px);

  const row_movement = {
    t: t_offset,
    params: {
      targets: `#${action.after.row.id}`,
      easing: "linear",
      keyframes: [
        {
          duration: appear_ms,
          opacity: [0, 1],
          fill: animations.appear.fill
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
          duration: cross_half_pq_ms,
          translateX: relative_add(animations.cross_half_pq.translateX),
        },
        {
          duration: fall_away_ms,
          translateY: relative_add(animations.fall_away.translateY),
          opacity: animations.fall_away.opacity
        }
      ]
    }
  };

  t[action.processed_by] = (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms);

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

  return {
    commands: [
      row_movement,
      consumer_marker_movement
    ],
    callbacks: [
      update_stream_time,
      update_pq_offsets
    ]
  };
}
