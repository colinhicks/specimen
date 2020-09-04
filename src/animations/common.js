import * as st from "./../components/stream-time";
import * as sp from "./../components/source-partition";
import * as rc from "./../components/row-card";

export function toggle_row_card_visibility(data_fns, card_id, viewable) {
  const { by_id, pack } = data_fns;

  const card_data = by_id(card_id);
  card_data.vars.viewable = viewable;
  rc.toggle_visibility(card_data);

  pack(card_data);
}

export function update_stream_time_text(data_fns, pq_name, row) {
  const { by_name } = data_fns;
  const pq_data = by_name(pq_name);
  const stream_time_data = pq_data.children.stream_time;

  st.update_time(stream_time_data, row);
}

export function update_pq_offsets(data_fns, pq_name, offsets) {
  const { by_name } = data_fns;
  const pq_data = by_name(pq_name);

  Object.entries(offsets).forEach(([ collection, partitions] ) => {
    Object.entries(partitions).forEach(([ partition, offset ]) => {
      const sp_data = pq_data.children.source_partitions[partition];
      const last_offset = offset - 1;

      sp.update_offset(sp_data, last_offset);
    });
  });
}

export function update_row_card(data_fns, card_id, row) {
  const { by_id } = data_fns;

  const card_data = by_id(card_id);
  const record = row.vars.record;

  rc.update_card_text(card_data, record);
}
