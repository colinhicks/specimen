import { Specimen } from '../../../src/index';

import hljs from 'highlight.js/lib/core';
import ksql from '../../../src/ksql-highlightjs';
import hljs_js from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('sql', ksql);
hljs.registerLanguage('javascript', hljs_js);
hljs.initHighlightingOnLoad();

const input_partitions = [
  [
    { key: "sensor-1", value: { reading: 45, area: "wheel" }, t: 10 },
    { key: "sensor-2", value: { reading: 41, area: "motor" }, t: 25 },
    { key: "sensor-1", value: { reading: 92, area: "wheel" }, t: 34 },
    { key: "sensor-2", value: { reading: 13, area: "engine" }, t: 42 },
    { key: "sensor-2", value: { reading: 90, area: "engine" }, t: 45 }
  ],
  [
    { key: "sensor-4", value: { reading: 95, area: "motor" }, t: 11 },
    { key: "sensor-3", value: { reading: 67, area: "engine" }, t: 26 },
    { key: "sensor-3", value: { reading: 52, area: "wheel" }, t: 31 },
    { key: "sensor-4", value: { reading: 55, area: "engine" }, t: 43 },
    { key: "sensor-3", value: { reading: 37, area: "engine" }, t: 57 },
  ]
];

function materialized_view(container) {
  const styles = {
    svg_width: 750,
    svg_height: 375,

    pq_width: 195,
    pq_height: 150,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_margin_bottom: 25,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    d_row_enter_offset: 15,

    render_stream_time: false,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "readings",
    kind: "stream",
    partitions: input_partitions
  });

  s.add_child(["readings"], {
    name: "pq1",
    kind: "persistent_query",
    into: "changelog",
    query_text: [
      "CREATE TABLE avg_readings AS",
      "    SELECT sensor,",
      "           AVG(reading) AS avg",
      "    FROM readings",
      "    GROUP BY sensor",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { delta } = context;
      const { key, value } = row;

      const agg = delta[key];
      const avg = agg.sum / agg.n;

      const v = {
        avg: avg
      }

      return { ...row, ... { value: v } };
    },
    aggregate: {
      init: function() {
        return {
        };
      },
      delta: function(state, row) {
        const { key } = row;
        const before = state[key] || { n: 0, sum: 0 };

        return {
          [key] : {
            n: before.n + 1,
            sum: before.sum + row.value.reading
          }
        };
      },
      columns: [
        {
          name: "sensor",
          width: 11,
          lookup: (row) => row.key
        },
        {
          name: "avg",
          width: 11,
          lookup: (row) => row.value.avg
        }
      ]
    },
    style: {
      materialized_view_height: 110,
      fill: function(before_row, after_row) {
        return "#66CC69";
      }
    }
  });

  s.add_child(["pq1"], {
    name: "changelog",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });

  s.render();
}

function repartitioning(container) {
  const styles = {
    svg_width: 750,
    svg_height: 300,

    pq_width: 110,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 25,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 10,

    d_row_enter_offset: 15,

    render_stream_time: false,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "readings",
    kind: "stream",
    partitions: input_partitions
  });

  s.add_child(["readings"], {
    name: "pq1",
    kind: "persistent_query",
    into: "repart",
    query_text: [
      "[[ internal ]]"
    ],
    select: function(context, row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.area;
    }
  });

  s.add_child(["pq1"], {
    name: "repart",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });

  s.add_child(["repart"], {
    name: "pq2",
    kind: "persistent_query",
    into: "changelog",
    query_text: [
      "CREATE TABLE part_avg AS",
      "    SELECT area,",
      "           AVG(reading) AS avg",
      "    FROM readings",
      "    GROUP BY area",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { delta } = context;
      const { key, value } = row;

      const agg = delta[key];
      const avg = agg.sum / agg.n;

      const k = value.area;

      const v = {
        avg: avg
      };

      return { ...row, ... { key: k, value: v } };
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.area;
    },
    aggregate: {
      init: function() {
        return {
        };
      },
      delta: function(state, row) {
        const { key } = row;
        const before = state[key] || { n: 0, sum: 0 };

        return {
          [key] : {
            n: before.n + 1,
            sum: before.sum + row.value.reading
          }
        };
      },
      columns: [
        {
          name: "area",
          width: 6,
          lookup: (row) => row.key
        },
        {
          name: "avg",
          width: 5,
          lookup: (row) => row.value.avg
        }
      ]
    },
    style: {
      materialized_view_height: 95,
      fill: function(before_row, after_row) {
        return "#66CC69";
      }
    }
  });

  s.add_child(["pq2"], {
    name: "changelog",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });

  s.render();
}

function replaying_from_changelog(container) {
  const styles = {
    svg_width: 400,
    svg_height: 300,

    pq_width: 125,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 25,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 10,

    render_stream_time: false,

    ms_px: 3.5
  };

  const s = new Specimen(container, styles);

  const replay_partitions = [
    [
      { key: "engine", value: { avg: 67    }, t: 26, style: { fill: "#66CC69" } },
      { key: "engine", value: { avg: 40    }, t: 42, style: { fill: "#66CC69" } },
      { key: "engine", value: { avg: 45    }, t: 43, style: { fill: "#66CC69" } },
      { key: "engine", value: { avg: 56.25 }, t: 45, style: { fill: "#66CC69" } },
      { key: "engine", value: { avg: 52.4  }, t: 57, style: { fill: "#66CC69" } },
    ],
    [
      { key: "wheel", value: { avg: 45   }, t: 10, style: { fill: "#66CC69" } },
      { key: "motor", value: { avg: 95   }, t: 11, style: { fill: "#66CC69" } },
      { key: "motor", value: { avg: 68   }, t: 25, style: { fill: "#66CC69" } },
      { key: "wheel", value: { avg: 48.5 }, t: 31, style: { fill: "#66CC69" } },
      { key: "wheel", value: { avg: 63   }, t: 34, style: { fill: "#66CC69" } },
    ]
  ];

  s.add_root({
    name: "changelog",
    kind: "stream",
    partitions: replay_partitions
  });

  s.add_child(["changelog"], {
    name: "pq1",
    kind: "persistent_query",
    query_text: [
      "CREATE TABLE part_avg AS",
      "    SELECT area,",
      "           AVG(reading) AS avg",
      "    FROM readings",
      "    GROUP BY area",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      return row;
    },
    aggregate: {
      init: function() {
        return {
        };
      },
      delta: function(state, row) {
        const { key } = row;
        const after = row.value.avg;

        return {
          [key] : after
        };
      },
      columns: [
        {
          name: "area",
          width: 8,
          lookup: (row) => row.key
        },
        {
          name: "avg",
          width: 5,
          lookup: (row) => row.value.avg
        }
      ]
    },
    style: {
      materialized_view_height: 95,
      fill: function(before_row, after_row) {
        return "#66CC69";
      }
    }
  });

  s.render();
}

function replaying_from_compacted(container) {
  const styles = {
    svg_width: 400,
    svg_height: 400,

    pq_width: 165,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 25,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 10,

    render_stream_time: false,

    ms_px: 3.5
  };

  const s = new Specimen(container, styles);

  const compacted_partitions = [
    [
      { key: "engine", value:  { avg: 52.4 }, t: 57, style: { fill: "#66CC69" } },
      { key: "motor", value:   { avg: 68 }, t: 25, style: { fill: "#66CC69" } },
      { key: "wheel", value:   { avg: 63 }, t: 63, style: { fill: "#66CC69" } },
      { key: "brakes", value:  { avg: 14 }, t: 42, style: { fill: "#66CC69" } },
      { key: "windows", value: { avg: 700 }, t: 45, style: { fill: "#66CC69" } },
    ],
    [
      { key: "axle", value:       { avg: 124 }, t: 11, style: { fill: "#66CC69" } },
      { key: "compressor", value: { avg: 90.5 }, t: 31, style: { fill: "#66CC69" } },
      { key: "alternator", value: { avg: 84.22 }, t: 34, style: { fill: "#66CC69" } },
      { key: "frame", value:      { avg: 170.31 }, t: 43, style: { fill: "#66CC69" } },
      { key: "pump", value:       { avg: 900 }, t: 57, style: { fill: "#66CC69" } },
    ]
  ];

  s.add_root({
    name: "changelog",
    kind: "stream",
    partitions: compacted_partitions
  });

  s.add_child(["changelog"], {
    name: "pq1",
    kind: "persistent_query",
    query_text: [
      "CREATE TABLE part_avg AS",
      "    SELECT area,",
      "           AVG(reading) AS avg",
      "    FROM readings",
      "    GROUP BY area",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      return row;
    },
    aggregate: {
      init: function() {
        return {
        };
      },
      delta: function(state, row) {
        const { key } = row;
        const after = row.value.avg;

        return {
          [key] : after
        };
      },
      columns: [
        {
          name: "area",
          width: 11,
          lookup: (row) => row.key
        },
        {
          name: "avg",
          width: 7,
          lookup: (row) => row.value.avg
        }
      ]
    },
    style: {
      materialized_view_height: 200,
      fill: function(before_row, after_row) {
        return "#66CC69";
      }
    }
  });

  s.render();
}

function latest(container) {
  const styles = {
    svg_width: 750,
    svg_height: 375,

    pq_width: 195,
    pq_height: 150,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_margin_bottom: 25,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    d_row_enter_offset: 15,

    render_stream_time: false,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "readings",
    kind: "stream",
    partitions: input_partitions
  });

  s.add_child(["readings"], {
    name: "pq1",
    kind: "persistent_query",
    into: "changelog",
    query_text: [
      "CREATE TABLE latest_readings AS",
      "    SELECT sensor,",
      "           LATEST_BY_OFFSET(reading) AS last",
      "    FROM readings",
      "    GROUP BY sensor",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { delta } = context;
      const { key, value } = row;

      const v = delta[key];

      return { ...row, ... { value: v } };
    },
    aggregate: {
      init: function() {
        return {
        };
      },
      delta: function(state, row) {
        const { key } = row;

        return {
          [key] : {
            last: row.value.reading
          }
        };
      },
      columns: [
        {
          name: "sensor",
          width: 11,
          lookup: (row) => row.key
        },
        {
          name: "last",
          width: 11,
          lookup: (row) => row.value.last
        }
      ]
    },
    style: {
      materialized_view_height: 110,
      fill: function(before_row, after_row) {
        return "#66CC69";
      }
    }
  });

  s.add_child(["pq1"], {
    name: "changelog",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });

  s.render();
}

materialized_view("#materialized-view");
repartitioning("#repartitioning");
replaying_from_changelog("#replaying-from-changelog");
replaying_from_compacted("#replaying-from-compacted");
latest("#latest");
