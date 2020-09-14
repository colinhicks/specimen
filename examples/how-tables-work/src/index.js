import { Specimen } from '../../../src/index';

import hljs from 'highlight.js/lib/core';
import ksql from '../../../src/ksql-highlightjs';
import hljs_js from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('sql', ksql);
hljs.registerLanguage('javascript', hljs_js);
hljs.initHighlightingOnLoad();

const a_input_partitions = [
  [
    { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
    { key: "buyer-2", value: { amount: 41, country: "grc" }, t: 25 },
    { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
    { key: "buyer-2", value: { amount: 42, country: "grc" }, t: 42 },
    { key: "buyer-1", value: { amount: 40, country: "grc" }, t: 45 }
  ],
  [
    { key: "buyer-3", value: { amount: 43, country: "grc" }, t: 10 },
    { key: "buyer-4", value: { amount: 43, country: "grc" }, t: 26 },
    { key: "buyer-4", value: { amount: 41, country: "usa" }, t: 31 },
    { key: "buyer-3", value: { amount: 42, country: "usa" }, t: 43 },
    { key: "buyer-3", value: { amount: 41, country: "usa" }, t: 57 },
  ]
];

function materialized_view(container) {
  const styles = {
    svg_width: 750,
    svg_height: 400,

    pq_width: 200,
    pq_height: 150,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_margin_bottom: 20,
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
    name: "orders",
    kind: "stream",
    partitions: a_input_partitions
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "changelog",
    query_text: [
      "CREATE STREAM total_orders AS",
      "    SELECT buyer,",
      "           SUM(amount) AS total",
      "    FROM orders",
      "    GROUP BY buyer",
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
        const after = before + row.value.amount;

        return {
          [key] : after
        };
      },
      columns: [
        {
          name: "buyer",
          width: 11,
          lookup: (row) => row.key
        },
        {
          name: "total",
          width: 11,
          lookup: (row) => row.value.count
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

const b_input_partitions = [
  [
    { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11, style: { fill: "#F26135" }},
    { key: "buyer-2", value: { amount: 41, country: "grc" }, t: 25, style: { fill: "#FFC40C" }},
    { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34, style: { fill: "#F26135" }},
    { key: "buyer-2", value: { amount: 42, country: "grc" }, t: 42, style: { fill: "#FFC40C" }},
    { key: "buyer-1", value: { amount: 40, country: "grc" }, t: 45, style: { fill: "#FFC40C" }}
  ],
  [
    { key: "buyer-3", value: { amount: 43, country: "grc" }, t: 10, style: { fill: "#FFC40C" }},
    { key: "buyer-4", value: { amount: 43, country: "grc" }, t: 26, style: { fill: "#FFC40C" }},
    { key: "buyer-4", value: { amount: 41, country: "usa" }, t: 31, style: { fill: "#F26135" }},
    { key: "buyer-3", value: { amount: 42, country: "usa" }, t: 43, style: { fill: "#F26135" }},
    { key: "buyer-3", value: { amount: 41, country: "usa" }, t: 57, style: { fill: "#F26135" }},
  ]
];

function repartitioning(container) {
  const styles = {
    svg_width: 750,
    svg_height: 300,

    pq_width: 100,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 20,
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
    name: "orders",
    kind: "stream",
    partitions: b_input_partitions
  });

  s.add_child(["orders"], {
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
      return before_row.value.country;
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
      "CREATE STREAM total_orders AS",
      "    SELECT buyer,",
      "           SUM(amount) AS total",
      "    FROM orders",
      "    GROUP BY buyer",
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
        const after = before + row.value.amount;

        return {
          [key] : after
        };
      },
      columns: [
        {
          name: "buyer",
          width: 5,
          lookup: (row) => row.key
        },
        {
          name: "total",
          width: 5,
          lookup: (row) => row.value.count
        }
      ]
    },
    style: {
      materialized_view_height: 80,
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

const c_input_partitions = [
  [
    { key: "grc", value: { count: 43 }, t: 10, style: { fill: "#66CC69" } },
    { key: "grc", value: { count: 84 }, t: 25, style: { fill: "#66CC69" } },
    { key: "grc", value: { count: 127 }, t: 26, style: { fill: "#66CC69" } },
    { key: "grc", value: { count: 169 }, t: 42, style: { fill: "#66CC69" } },
    { key: "grc", value: { count: 209 }, t: 45, style: { fill: "#66CC69" } },
  ],
  [
    { key: "usa", value: { count: 45 }, t: 11, style: { fill: "#66CC69" } },
    { key: "usa", value: { count: 86 }, t: 31, style: { fill: "#66CC69" } },
    { key: "usa", value: { count: 128 }, t: 34, style: { fill: "#66CC69" } },
    { key: "usa", value: { count: 170 }, t: 43, style: { fill: "#66CC69" } },
    { key: "usa", value: { count: 211 }, t: 57, style: { fill: "#66CC69" } },
  ]
];

function replaying_from_changelog(container) {
  const styles = {
    svg_width: 400,
    svg_height: 450,

    pq_width: 110,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 20,
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

  s.add_root({
    name: "changelog",
    kind: "stream",
    partitions: c_input_partitions
  });

  s.add_child(["changelog"], {
    name: "pq1",
    kind: "persistent_query",
    query_text: [
      "CREATE STREAM total_orders AS",
      "    SELECT buyer,",
      "           SUM(amount) AS total",
      "    FROM orders",
      "    GROUP BY buyer",
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
        const before = state[key] || 0;
        const after = before + row.value.amount;

        return {
          [key] : after
        };
      },
      columns: [
        {
          name: "buyer",
          width: 6,
          lookup: (row) => row.key
        },
        {
          name: "total",
          width: 5,
          lookup: (row) => row.value.count
        }
      ]
    },
    style: {
      materialized_view_height: 80,
      fill: function(before_row, after_row) {
        return "#66CC69";
      }
    }
  });

  s.render();
}

const d_input_partitions = [
  [
    { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
    { key: "buyer-2", value: { amount: 41, country: "grc" }, t: 25 },
    { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
    { key: "buyer-2", value: { amount: 42, country: "grc" }, t: 42 },
    { key: "buyer-1", value: { amount: 40, country: "grc" }, t: 45 }
  ],
  [
    { key: "buyer-3", value: { amount: 43, country: "grc" }, t: 10 },
    { key: "buyer-4", value: { amount: 43, country: "grc" }, t: 26 },
    { key: "buyer-4", value: { amount: 41, country: "usa" }, t: 31 },
    { key: "buyer-3", value: { amount: 42, country: "usa" }, t: 43 },
    { key: "buyer-3", value: { amount: 41, country: "usa" }, t: 57 },
  ]
];

function latest(container) {
  const styles = {
    svg_width: 750,
    svg_height: 450,

    pq_width: 200,
    pq_height: 150,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_margin_bottom: 20,
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
    name: "orders",
    kind: "stream",
    partitions: d_input_partitions
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "changelog",
    query_text: [
      "CREATE STREAM total_orders AS",
      "    SELECT buyer,",
      "           LATEST_BY_OFFSET(amount) AS last_tx",
      "    FROM orders",
      "    GROUP BY buyer",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { delta } = context;
      const { key, value } = row;

      const v = {
        last_tx: delta[key]
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

        return {
          [key] : row.value.amount
        };
      },
      columns: [
        {
          name: "buyer",
          width: 11,
          lookup: (row) => row.key
        },
        {
          name: "last_tx",
          width: 11,
          lookup: (row) => row.value.last_tx
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
    svg_height: 450,

    pq_width: 110,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 20,
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
    name: "orders",
    kind: "stream",
    partitions: d_input_partitions
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "changelog-1",
    query_text: [
      "CREATE STREAM total_orders AS",
      "    SELECT buyer,",
      "           LATEST_BY_OFFSET(amount) AS last",
      "    FROM orders",
      "    GROUP BY buyer",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { delta } = context;
      const { key, value } = row;

      const v = {
        last: delta[key]
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

        return {
          [key] : row.value.amount
        };
      },
      columns: [
        {
          name: "buyer",
          width: 7,
          lookup: (row) => row.key
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
    into: "changelog-2",
    query_text: [
      "?"
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
          name: "buyer",
          width: 7,
          lookup: (row) => row.key
        },
        {
          name: "txs",
          width: 4,
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

  s.add_child(["pq2"], {
    name: "changelog-2",
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
latest("#latest");
chained("#chained");
