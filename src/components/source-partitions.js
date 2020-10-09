import { uuidv4, create_svg_el } from './../util';
import * as sp from './source-partition';

export function build_data(config, styles, computed) {
  const { source_partitions } = config;
  const { source_partitions_fill } = styles;
  const { left_x, top_y, width, margin } = computed;
  let current_top_y = top_y + margin;

  const partitions = Object.entries(source_partitions).reduce((all, [stream, partitions]) => {
    partitions.forEach(partition => {
      const this_top_y = current_top_y;

      const config = {
        stream: stream,
        partition: partition
      };

      const this_computed = {
        left_x: left_x,
        top_y: this_top_y,
        bottom_margin: margin
      };

      all.push(sp.build_data(config, styles, this_computed));
      current_top_y += margin;
    });

    return all;
  }, []);

  return {
    kind: "source_partitions",
    id: uuidv4(),
    rendering: {
      container: {
        x: left_x,
        y: top_y,
        rx: 10,
        width: width,
        height: current_top_y - top_y,
        fill: source_partitions_fill
      }
    },
    children: {
      partitions
    }
  };
}

export function render(data) {
  const { id, rendering, children } = data;
  const { container } = rendering;
  const { partitions } = children;

  const g = create_svg_el("g");
  g.id = id;
  g.classList.add('source-partitions');

  const d_container = create_svg_el("rect");
  d_container.setAttributeNS(null, "x", container.x);
  d_container.setAttributeNS(null, "y", container.y);
  d_container.setAttributeNS(null, "rx", container.rx);
  d_container.setAttributeNS(null, "width", container.width);
  d_container.setAttributeNS(null, "height", container.height);
  d_container.setAttributeNS(null, "fill", container.fill);

  g.appendChild(d_container);

  const d_partitions = partitions.map(p => sp.render(p));
  d_partitions.forEach(p => g.appendChild(p));

  return g;
}
