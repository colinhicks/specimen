import { uuidv4, cycle_array } from './util';
import cloneDeep from "lodash/cloneDeep";

Object.defineProperty(String.prototype, 'hashCode', {
  value: function() {
    var hash = 0, i, chr;
    for (i = 0; i < this.length; i++) {
      chr   = this.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }
});

function choose_lowest_timestamp(streams, offsets) {
  let choices = []

  streams.forEach(s => {
    const { id, name, children } = s;
    const { partitions } = children;

    partitions.forEach((partition, i) => {
      const offset = offsets[name][i];
      const row = partition.children.rows[offset];

      if (row != undefined) {
        choices.push(row);
      }
    });
  });

  return choices.reduce((result, row) => {
    if (result == undefined) {
      return row;
    } else if (row.vars.record.t < result.vars.record.t) {
      return row;
    } else {
      return result;
    }
  }, undefined);
}

function is_drained(offsets, by_name) {
  return Object.entries(offsets).every(([pq, streams]) => {
    return Object.entries(streams).every(([stream, partitions]) => {
      return Object.entries(partitions).every(([partition, offset]) => {
        const stream_data = by_name(stream);
        const partitions = stream_data.children.partitions;
        const rows = partitions[partition].children.rows;

        return offset == rows.length;
      });
    });
  });
}

function swap_partitions(by_name, pack, pq, offsets, before_row, after_row) {
  const after_stream_name = after_row.vars.record.stream;
  const after_partition = after_row.vars.record.partition;

  const after_stream_data = by_name(after_stream_name);
  const after_partition_data = after_stream_data.children.partitions[after_partition];

  after_row.vars.record.offset = after_partition_data.children.rows.length;
  after_partition_data.children.rows.push(after_row);

  const before_offset = offsets[pq][before_row.vars.record.stream][before_row.vars.record.partition];
  offsets[pq][before_row.vars.record.stream][before_row.vars.record.partition] = before_offset + 1;

  pack(after_partition_data);
}

function initialize_offsets(pqs, streams, by_name) {
  return pqs.reduce((all_pqs, pq) => {
    const parents = pq.graph.predecessors;

    const stream_offsets = parents.reduce((all_streams, parent) => {
      const parent_data = by_name(parent);
      const partitions = parent_data.children.partitions;

      const partition_offsets = [...Array(partitions.length).keys()]
            .reduce((all, i) => {
              all[i] = 0;
              return all;
            }, {});

      all_streams[parent] = partition_offsets;
      return all_streams;
    }, {});

    all_pqs[pq.name] = stream_offsets;
    return all_pqs;
  }, {});
}

function set_after_stream(after_row, into) {
  after_row.vars.record.stream = into;
}

function make_partitioner(key) {
  if (typeof key === 'string' || key instanceof String) {
    return key.hashCode();
  } else {
    return key;
  }
}

function repartition(context, before_row, after_row, partition_by) {
  if (partition_by) {
    const key = partition_by(context, before_row.vars.record, after_row.vars.record);
    after_row.vars.record.key = key;

    const partitioner = make_partitioner(key);
    after_row.vars.record.partition = partitioner % context.partitions;
  }
}

function initialize_stream_time(pqs) {
  return pqs.reduce((all, pq) => {
    all[pq] = undefined;
    return all;
  }, {});
}

function initialize_state(pqs) {
  return pqs.reduce((all, pq) => {
    const { name, vars } = pq;
    const { aggregate } = vars.query_parts;

    if (aggregate && ("init" in aggregate)) {
      all[name] = aggregate.init();
    } else {
      all[name] = undefined;
    }
    return all;
  }, {});
}

function update_stream_time(stream_time, pq, t) {
  const st = stream_time[pq];

  if ((st == undefined) || (t > st)) {
    stream_time[pq] = t;
  }
}

function evaluate_select(runtime_context, query_context, query_parts, before_row) {
  const { by_name, pack, pq, offsets, stream_time, lineage } = runtime_context;
  const { select, into, partition_by } = query_parts;

  const before_offsets = cloneDeep(offsets[pq]);
  const before_stream_time = stream_time[pq];
  const before_row_clone = cloneDeep(before_row);

  const after_row = { ...before_row_clone, ...{ id: uuidv4() } };

  after_row.vars.record = select(query_context, before_row_clone.vars.record);
  after_row.vars.derived_id = before_row.id;

  set_after_stream(after_row, into);
  repartition(query_context, before_row, after_row, partition_by);

  swap_partitions(by_name, pack, pq, offsets, before_row, after_row);
  update_stream_time(stream_time, pq, before_row.vars.record.t);

  if (before_row.vars.derived_id) {
    lineage[before_row.id] = before_row.vars.derived_id;
  } else {
    before_row.vars.derived_id = before_row.vars.source_id;
  }

  return {
    kind: "keep",
    before: {
      row: before_row,
      offsets: before_offsets,
      stream_time: before_stream_time
    },
    after: {
      row: after_row,
      offsets: cloneDeep(offsets[pq]),
      stream_time: stream_time[pq]
    },
    processed_by: pq
  };
}

function halt_record(runtime_context, query_context, before_row, kind) {
  const { offsets, stream_time, pq, pack, lineage } = runtime_context;

  const before_record = before_row.vars.record;
  const before_offsets = cloneDeep(offsets[pq]);
  const before_stream_time = stream_time[pq];

  offsets[pq][before_record.stream][before_record.partition]++;
  update_stream_time(stream_time, pq, before_row.vars.record.t);

  const after_row = { ...cloneDeep(before_row), ...{ id: uuidv4() } };
  after_row.vars.derived_id = before_row.id;
  pack(after_row);

  if (before_row.vars.derived_id) {
    lineage[before_row.id] = before_row.vars.derived_id;
  } else {
    before_row.vars.derived_id = before_row.vars.source_id;
  }

  return {
    kind: kind,
    before: {
      row: before_row,
      offsets: before_offsets,
      stream_time: before_stream_time
    },
    after: {
      row: after_row,
      offsets: cloneDeep(offsets[pq]),
      stream_time: stream_time[pq]
    },
    processed_by: pq
  }
}

function execute_filter(runtime_context, query_context, before_row) {
  return halt_record(runtime_context, query_context, before_row, "discard");
}

function execute_absorb(runtime_context, query_context, before_row) {
  return halt_record(runtime_context, query_context, before_row, "absorb");
}

function execute_aggregation(query_context, query_parts, state, pq, before_row) {
  if (query_parts.aggregate) {
    const delta = query_parts.aggregate.delta(state[pq], before_row.vars.record);
    state[pq] = { ...state[pq], ...delta };
    query_context.delta = delta;
  }
}

export function init_runtime(objs, data_fns) {
  const streams = objs.filter(component => component.kind == "stream");
  const pqs = objs.filter(component => component.kind == "persistent_query");
  const pq_seq = pqs.map(pq => pq.name);

  const { by_name } = data_fns;

  return {
    streams: streams,
    pqs: pqs,
    pq_seq: pq_seq,
    offsets: initialize_offsets(pqs, streams, by_name),
    stream_time: initialize_stream_time(pq_seq),
    state: initialize_state(pqs),
    lineage: {},
    data_fns: data_fns
  };
}

export function tick(rt_context) {
  const { streams, pqs, offsets, stream_time, state, lineage, data_fns } = rt_context;
  const { by_name, pack } = data_fns;

  const drained = is_drained(offsets, by_name);
  let pq_seq = rt_context.pq_seq;
  let action = undefined;

  if (!drained) {
    const pq = pq_seq[0];
    const pq_data = by_name(pq);
    const parent_stream_names = pq_data.graph.predecessors;
    const parent_streams = parent_stream_names.map(s => by_name(s));

    const before_row = choose_lowest_timestamp(parent_streams, offsets[pq]);

    const runtime_context = {
      by_name,
      pack,
      pq,
      offsets,
      stream_time,
      lineage
    };

    if (before_row) {
      const query_parts = pq_data.vars.query_parts;

      if (!query_parts.into) {
        execute_aggregation({}, query_parts, state, pq, before_row);
        action = execute_absorb(runtime_context, {}, before_row);
      } else {
        const sink_data = by_name(query_parts.into);
        const sink_partitions = sink_data.children.partitions;
        
        const query_context = {
          partitions: sink_partitions.length,
        };

        if (query_parts.where) {
          if (query_parts.where(query_context, before_row.vars.record)) {
            execute_aggregation(query_context, query_parts, state, pq, before_row);
            action = evaluate_select(runtime_context, query_context, query_parts, before_row);
          } else {
            action = execute_filter(runtime_context, query_context, before_row);
          }
        } else {
          execute_aggregation(query_context, query_parts, state, pq, before_row);
          action = evaluate_select(runtime_context, query_context, query_parts, before_row);
        }
      }
    }

    pq_seq = cycle_array(pq_seq);

    return {
      ...rt_context,
      ...{
        drained: false,
        pq_seq: pq_seq,
        action: action
      }
    };
  } else {
    return {
      ...rt_context,
      ...{
        drained: true,
        action: action
      }
    };
  }
}
