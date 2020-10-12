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

    pq_width: 120,
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

  const styled_input_partitions = [
  [
    { key: "sensor-1", value: { reading: 45, area: "wheel" }, t: 10, style: { fill: "#0074A2" } },
    { key: "sensor-2", value: { reading: 41, area: "motor" }, t: 25, style: { fill: "#FFC40C" } },
    { key: "sensor-1", value: { reading: 92, area: "wheel" }, t: 34, style: { fill: "#0074A2" } },
    { key: "sensor-2", value: { reading: 13, area: "engine" }, t: 42, style: { fill: "#F26135" } },
    { key: "sensor-2", value: { reading: 90, area: "engine" }, t: 45, style: { fill: "#F26135" } }
  ],
  [
    { key: "sensor-4", value: { reading: 95, area: "motor" }, t: 11 , style: { fill: "#FFC40C" } },
    { key: "sensor-3", value: { reading: 67, area: "engine" }, t: 26, style: { fill: "#F26135" } },
    { key: "sensor-3", value: { reading: 52, area: "wheel" }, t: 31, style: { fill: "#0074A2" } },
    { key: "sensor-4", value: { reading: 55, area: "engine" }, t: 43, style: { fill: "#F26135" } },
    { key: "sensor-3", value: { reading: 37, area: "engine" }, t: 57, style: { fill: "#F26135" } },
  ]
];


  s.add_root({
    name: "readings",
    kind: "stream",
    partitions: styled_input_partitions
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

    ms_px: 2
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
      "           LATEST_BY_OFFSET(area) AS area,",
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
            area: row.value.area,
            last: row.value.reading
          }
        };
      },
      columns: [
        {
          name: "sensor",
          width: 10,
          lookup: (row) => row.key
        },
        {
          name: "area",
          width: 7,
          lookup: (row) => row.value.area,
        },
        {
          name: "last",
          width: 4,
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

function chained(container) {
  const styles = {
    svg_width: 750,
    svg_height: 300,

    pq_width: 125,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 55,
    part_height: 25,
    part_margin_bottom: 20,
    part_id_margin_left: -7,
    part_id_margin_top: 15,

    row_width: 5,
    row_height: 5,
    row_margin_left: 4,
    row_offset_right: 6,

    d_row_enter_offset: 5,

    render_stream_time: false,

    font_size: "0.7em",
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
    into: "changelog-1",
    query_text: [
      "CREATE TABLE latest_readings AS",
      "    SELECT",
      "         sensor,",
      "         LATEST_BY_OFFSET(area)",
      "           AS area,",
      "         LATEST_BY_OFFSET(reading)",
      "            AS last",
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
            area: row.value.area,
            last: row.value.reading
          }
        };
      },
      columns: [
        {
          name: "sensor",
          width: 8,
          lookup: (row) => row.key
        },
        {
          name: "area",
          width: 7,
          lookup: (row) => row.value.area
        },
        {
          name: "last",
          width: 4,
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
    name: "changelog-1",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });

  s.add_child(["changelog-1"], {
    name: "pq2",
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
    },
    style: {
      fill: function(before_row, after_row) {
        return "#b136d8";
      }
    }
  });

  s.add_child(["pq2"], {
    name: "repart",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });


  s.add_child(["repart"], {
    name: "pq3",
    kind: "persistent_query",
    into: "changelog-2",
    query_text: [
      "CREATE TABLE n_readings AS",
      "    SELECT area,",
      "           COUNT(last) as n",
      "    FROM latest_readings",
      "    GROUP BY area",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { delta } = context;
      const { key, value } = row;

      const v = {
        count: delta[key]
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
        const before = state[key] || 0;
        const after = before + 1;

        return {
          [key] : after
        };
      },
      columns: [
        {
          name: "area",
          width: 10,
          lookup: (row) => row.key
        },
        {
          name: "n",
          width: 10,
          lookup: (row) => row.value.count
        }
      ]
    },
    style: {
      materialized_view_height: 110,
      fill: function(before_row, after_row) {
        return "#D8365D";
      }
    }
  });

  s.add_child(["pq3"], {
    name: "changelog-2",
    kind: "stream",
    partitions: [
      [],
      []
    ]
  });

  s.render();
}

const css = `
     .specimen {
         position: relative;
     }
     .specimen .pq {
         stroke: #b5b5b5;
         stroke-width: 1;
         fill: none;
     }
     .specimen .pq-connector {
         stroke: #b5b5b5;
         stroke-dasharray: 4;
     }
     .specimen .stream-connector {
         stroke: #b5b5b5;
     }
     .specimen .row-transformed {
         fill: #a96bff;
     }
     .specimen .row.discard {
         fill: #ff9c6b;
     }
     .specimen .partition {
         stroke: #000000;
         stroke-width: 1;
         fill: none;
     }
     .specimen .code {
         font-family: monospace;
         font-size: 13px;
     }
     .specimen .external-objects .code {
         font-size: 12px;
         line-height: 14px;
     }
     #inserts .external-objects .code {
         margin-top: -220px;
     }
     .specimen .pq-code-container {         
         margin-bottom: 10px;
         overflow-x: auto;
     }
     .specimen .specimen-controls {
         padding-bottom: 0px;
     }
     .specimen .animation {
         padding-top: 0px;
     }
     
     .specimen .specimen-controls button {
         display: inline-block;
         width: 9%;
         margin-right: 1%;
         min-width: 56px;
     }     
     .specimen .specimen-controls input[type="range"] {
         display: inline-block;
         width: 90%;
     }
     .specimen .pq-code-container pre {
         padding: 3px !important;         
     }
     .specimen .specimen-controls button {
         margin-right: 5px;
     }

     #chained .persistent-query-container g:last-child:not(.source-partitions) .code {
         font-size: 9px;
     }

     #chained .code { font-size: 11px; }

     #replaying-from-changelog .pq-code-container pre, #replaying-from-compacted .pq-code-container pre {
         transform: translateX(-80px) !important;
     }

     pre.narrative-code {
        padding: 0 15px 15px 15px !important;
        background: #f8f8f8 !important;
     }
    .hljs{display:block;overflow-x:auto;color:#333;background:#f8f8f8}.hljs-comment,.hljs-quote{color:#998;font-style:italic}.hljs-keyword,.hljs-selector-tag,.hljs-subst{color:#333;font-weight:bold}.hljs-number,.hljs-literal,.hljs-variable,.hljs-template-variable,.hljs-tag .hljs-attr{color:#008080}.hljs-string,.hljs-doctag{color:#d14}.hljs-title,.hljs-section,.hljs-selector-id{color:#900;font-weight:bold}.hljs-subst{font-weight:normal}.hljs-type,.hljs-class .hljs-title{color:#458;font-weight:bold}.hljs-tag,.hljs-name,.hljs-attribute{color:#000080;font-weight:normal}.hljs-regexp,.hljs-link{color:#009926}.hljs-symbol,.hljs-bullet{color:#990073}.hljs-built_in,.hljs-builtin-name{color:#0086b3}.hljs-meta{color:#999;font-weight:bold}.hljs-deletion{background:#fdd}.hljs-addition{background:#dfd}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:bold}
`;

materialized_view("#materialized-view");
repartitioning("#repartitioning");
replaying_from_changelog("#replaying-from-changelog");
replaying_from_compacted("#replaying-from-compacted");
latest("#latest");
chained("#chained");

const style = document.createElement('style');
style.innerHTML = css;
document.body.appendChild(style);

document.querySelectorAll('pre code').forEach((block) => {
  hljs.highlightBlock(block);
});
