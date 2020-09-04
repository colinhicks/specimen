let translate_y_fns = {
  "stream": stream_translate_y,
  "persistent_query": persistent_query_translate_y
};

function stream_translate_y(data, height) {
  data.refs.top_y += height;
  data.refs.bottom_y += height;

  const label = data.children.label;

  label.rendering.text.y += height;

  label.rendering.tip.y1 += height;
  label.rendering.tip.y2 += height;

  label.rendering.bar.y1 += height;
  label.rendering.bar.y2 += height;

  label.rendering.left_foot.y1 += height;
  label.rendering.left_foot.y2 += height;

  label.rendering.right_foot.y1 += height;
  label.rendering.right_foot.y2 += height;

  data.children.partitions = data.children.partitions.map(partition => {
    partition.rendering.partition_label.y += height;
    partition.rendering.container.y += height;

    partition.refs.midpoint_y += height;

    partition.children.rows = partition.children.rows.map(row => {
      row.rendering.y += height;
      return row;
    });

    partition.children.consumer_markers = partition.children.consumer_markers.map(marker => {
      marker.rendering.arrow_y += height;
      marker.rendering.text_y += height;
      marker.refs.top_y += height;

      return marker;
    });

    return partition;
  });
  
  return data;
}

function persistent_query_translate_y(data, height) {
  data.rendering.line.y2 += height;

  data.rendering.brackets.tl.y += height;
  data.rendering.brackets.tr.y += height;
  data.rendering.brackets.bl.y += height;
  data.rendering.brackets.br.y += height;

  data.rendering.label.y += height;

  data.refs.midpoint_y += height;
  data.refs.bottom_y += height;
  data.refs.box_bottom_y += height;

  data.children.source_partitions.forEach(partition => {
    partition.rendering.y += height;
    partition.refs.bottom_y += height;
  });

  data.children.stream_time.rendering.y += height;
  data.children.stream_time.refs.bottom_y += height;
  
  return data;
}

export function vertically_center_layout(layout_data) {
  const heights = layout_data.map(components => {
    if (components.length == 1) {
      let data = components[0];

      return data.refs.bottom_y - data.refs.top_y;
    } else {
      let data_1 = components[0];
      let data_2 = components.slice(-1)[0];

      return data_2.refs.bottom_y - data_1.refs.top_y;
    }
  });

  const max_height = Math.max(...heights);

  return heights.map((height, i) => {
    const diff = (max_height - height) / 2;
    const n = layout_data[i].length;
    const each_diff = diff / n;

    return layout_data[i].map(data => {
      const fn = translate_y_fns[data.kind];
      return fn(data, each_diff);
    });
  });
}
