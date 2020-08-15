import * as r from "./../components/row2";
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
  pack(row_data);
}

function draw_new_object(action, data_fns) {
  const { by_id } = data_fns;
  const row_data = by_id(action.after.row.id);

  return r.render(row_data);
}

export function update_layout(action, data_fns, styles, free_el) {
  adjust_rendering(action, data_fns, styles);
  const obj = draw_new_object(action, data_fns);
  free_el.appendChild(obj);
}

export function animation_seq(action, data_fns, styles) {
  const { before, after, processed_by } = action;
  const { by_id, by_name } = data_fns;
  const { row_width, row_height, row_offset_right, row_margin_left } = styles;
  const { d_row_enter_offset } = styles;

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

  return {
    kind: "keep",
    action: action,
    animations: {
      appear: {
        // Unclear if still needed
        //fill: by_id(///dynamic_elements[old_row.derived_id].fill
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
//        fill: fill_change
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
      // move_consumer_marker: {
      //   translateX: (consumer_marker_old_x - consumer_marker_new_x),
      //   opacity: consumer_marker_opacity
      // }
    }
  };
}

export function anime_data(ctx, action_animation_seq, data_fns, lineage, styles) {
  const { t, history } = ctx;
  const { action, animations } = action_animation_seq;
  const { ms_px } = styles;

  const pq_t = (t[action.processed_by] || 0);
  const row_history = (history[lineage[action.before.row.id]] || 0);
  const t_offset = ((row_history >= pq_t) ? row_history : pq_t);

  const appear_ms = 250;
  const move_to_pq_center_ms = ms_for_translate(animations.move_to_pq_center, ms_px);
  const approach_pq_ms = ms_for_translate(animations.approach_pq, ms_px);
  const traverse_pq_ms = ms_for_translate(animations.traverse_pq, ms_px);
  const depart_pq_ms = ms_for_translate(animations.depart_pq, ms_px);
  const move_to_partition_center_ms = ms_for_translate(animations.move_to_partition_center, ms_px);
  const enter_partition_ms = ms_for_translate(animations.enter_partition, ms_px);

  const row_movement = {
    t: t_offset,
    params: {
      targets: `#${action.after.row.id}`,
      easing: "linear",
      keyframes: [
        {
          duration: appear_ms,
          opacity: [0, 1],
//          fill: animations.appear.fill
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
//          fill: animations.traverse_pq.fill,
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

  const update_stream_time = {
    t: (
      t_offset +
        appear_ms +
        move_to_pq_center_ms +
        approach_pq_ms
    ),
    apply: function() {
      c.update_stream_time_text(data_fns, action.processed_by, action.after);
    },
    undo: function() {
      c.update_stream_time_text(data_fns, action.processed_by, action.before);
    }
  };

  const update_pq_offsets = {
    t: (
      t_offset +
        appear_ms +
        move_to_pq_center_ms +
        approach_pq_ms
    ),
    apply: function() {
      c.update_pq_offsets(data_fns, action.processed_by, action.after.offsets);
    },
    undo: function() {
      c.update_pq_offsets(data_fns, action.processed_by, action.before.offsets);
    }
  };

  return {
    commands: [
      row_movement
    ],
    callbacks: [
      update_stream_time,
      update_pq_offsets
    ]
  };
}
