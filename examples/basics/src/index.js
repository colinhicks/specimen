import { Specimen } from '../../../src/index';

import hljs from 'highlight.js/lib/core';
import ksql from '../../../src/ksql-highlightjs';
import hljs_js from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('sql', ksql);
hljs.registerLanguage('javascript', hljs_js);
hljs.initHighlightingOnLoad();

const flavors = [
  "#0074A2",
  "#F26135",
  "#FFC40C"
];

const input_partitions = [
  [
    { key: "sensor-1", value: { value: 45, location: "usa" }, t: 11 },
    { key: "sensor-2", value: { value: 41, location: "eth" }, t: 25 },
    { key: "sensor-1", value: { value: 42, location: "usa" }, t: 34 },
    { key: "sensor-3", value: { value: 42, location: "gcr" }, t: 42 },
    { key: "sensor-3", value: { value: 40, location: "gcr" }, t: 45 }
  ],
  [
    { key: "sensor-4", value: { value: 43, location: "eth" }, t: 10 },
    { key: "sensor-6", value: { value: 43, location: "gcr" }, t: 26 },
    { key: "sensor-5", value: { value: 41, location: "usa" }, t: 31 },
    { key: "sensor-5", value: { value: 42, location: "usa" }, t: 43 },
    { key: "sensor-4", value: { value: 41, location: "eth" }, t: 57 },
  ],
  [
    { key: "sensor-7", value: { value: 43, location: "gcr" }, t: 12 },
    { key: "sensor-8", value: { value: 40, location: "usa" }, t: 22 },
    { key: "sensor-9", value: { value: 40, location: "eth" }, t: 30 },
    { key: "sensor-9", value: { value: 44, location: "eth" }, t: 55 },
    { key: "sensor-7", value: { value: 41, location: "gcr" }, t: 53 }
  ]
];

function stream(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 150,
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

    render_controls: false
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "readings",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.render();
}

function inserts(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 150,
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

    render_controls: false
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "readings",
    kind: "stream",
    partitions: input_partitions
  });

  s.render();
}

function transformation(container) {
  const styles = {
    svg_width: 750,
    svg_height: 325,

    pq_width: 150,
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
    into: "clean",
    query_text: [
      "CREATE STREAM clean AS",
      "    SELECT sensor,",
      "           value,",
      "           UCASE(location) AS location",
      "    FROM readings",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        country: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.location.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "clean",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.render();
}

function filtering(container) {
  const styles = {
    svg_width: 750,
    svg_height: 220,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 3,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

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
    into: "clean",
    query_text: [
      "CREATE STREAM clean AS",
      "    SELECT sensor,",
      "           value,",
      "           UCASE(location) AS location",
      "    FROM readings",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.location.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "clean",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["clean"], {
    name: "pq2",
    kind: "persistent_query",
    into: "high_readings",
    query_text: [
      "CREATE STREAM high_readings AS",
      "    SELECT sensor, value, location",
      "    FROM clean",
      "    WHERE value > 41",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    where: function(context, row) {
      return row.value.value > 41;
    },
  });

  s.add_child(["pq2"], {
    name: "high_readings",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

function compressed(container) {
  const styles = {
    svg_width: 750,
    svg_height: 220,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 3,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

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
    into: "high_pri",
    query_text: [
      "CREATE STREAM high_pri AS",
      "    SELECT sensor,",
      "           value,",
      "           UCASE(location) AS location",
      "    FROM readings",
      "    WHERE value > 41",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    where: function(context, row) {
      return row.value.value > 41;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.location.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "high_pri",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

function rekeying(container) {
  const styles = {
    svg_width: 750,
    svg_height: 220,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 3,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

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
    into: "high_pri",
    query_text: [
      "CREATE STREAM high_pri AS",
      "    SELECT sensor,",
      "           value,",
      "           UCASE(location) AS location",
      "    FROM readings",
      "    WHERE value > 41",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    where: function(context, row) {
      return row.value.value > 41;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.location.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "high_pri",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["high_pri"], {
    name: "pq2",
    kind: "persistent_query",
    into: "by_location",
    query_text: [
      "CREATE STREAM by_location AS",
      "    SELECT *",
      "    FROM high_pri",
      "    PARTITION BY location",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.location;
    }
  });

  s.add_child(["pq2"], {
    name: "by_location",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

function consumers(container) {
  const styles = {
    svg_width: 750,
    svg_height: 575,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    coll_label_margin_bottom: 50,

    part_width: 100,
    part_height: 25,
    part_margin_bottom: 60,
    part_id_margin_left: -15,
    part_id_margin_top: 3,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

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
    into: "high_pri",
    query_text: [
      "CREATE STREAM high_pri AS",
      "    SELECT sensor,",
      "           value,",
      "           UCASE(location) AS location",
      "    FROM readings",
      "    WHERE value > 41",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    where: function(context, row) {
      return row.value.value > 41;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.location.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "high_pri",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["high_pri"], {
    name: "pq2",
    kind: "persistent_query",
    into: "by_location",
    query_text: [
      "CREATE STREAM by_location AS",
      "    SELECT *",
      "    FROM high_pri",
      "    PARTITION BY location",
      "    EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.location;
    }
  });

  s.add_child(["pq2"], {
    name: "by_location",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["high_pri"], {
    name: "pq3",
    kind: "persistent_query",
    into: "by_zone",
    query_text: [
      "CREATE STREAM s1_by_location AS",
      "  SELECT sensor,",
      "         value,",
      "         UCASE(location) AS location",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(context, row) {
      const { value } = row;

      const v = {
        value: value.value,
        location: value.location.toUpperCase()
      }

      return { ...row, ... { value: v } };
    },
    partition_by: function(context, before_row, after_row) {
      return (before_row.value.location + " ");
    }
  });

  s.add_child(["pq3"], {
    name: "by_zone",
    kind: "stream",
    partitions: [
      [],
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
         font-size: 14px;
     }

     .specimen .external-objects .code {
         font-size: 12px;
         line-height: 14px;
     }

     .specimen .pq-code-container {         
         margin-bottom: 10px;
     }

     .specimen .controls {
         padding-bottom: 0px;
     }

     .specimen .animation {
         padding-top: 0px;
     }
     
     .specimen .controls button {
         display: inline-block;
         width: 9%;
         margin-right: 1%;
     }
     
     .specimen .controls input[type="range"] {
         display: inline-block;
         width: 90%;
     }

     .specimen .pq-code-container pre {
         padding: 3px !important;         
     }

     .specimen .controls button {
         margin-right: 5px;
     }

     .specimen .source-partitions {
         display: none;
     }

     #transformation .source-partitions {
         display: block;
     }

     #filtering .pq-code-container pre:first-child {
         left: -20px !important;
     }

     #filtering .pq-code-container pre:last-child {
         left: 20px !important;
     }

    .hljs{display:block;overflow-x:auto;color:#333;background:#f8f8f8}.hljs-comment,.hljs-quote{color:#998;font-style:italic}.hljs-keyword,.hljs-selector-tag,.hljs-subst{color:#333;font-weight:bold}.hljs-number,.hljs-literal,.hljs-variable,.hljs-template-variable,.hljs-tag .hljs-attr{color:#008080}.hljs-string,.hljs-doctag{color:#d14}.hljs-title,.hljs-section,.hljs-selector-id{color:#900;font-weight:bold}.hljs-subst{font-weight:normal}.hljs-type,.hljs-class .hljs-title{color:#458;font-weight:bold}.hljs-tag,.hljs-name,.hljs-attribute{color:#000080;font-weight:normal}.hljs-regexp,.hljs-link{color:#009926}.hljs-symbol,.hljs-bullet{color:#990073}.hljs-built_in,.hljs-builtin-name{color:#0086b3}.hljs-meta{color:#999;font-weight:bold}.hljs-deletion{background:#fdd}.hljs-addition{background:#dfd}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:bold}

`;

stream("#stream");
inserts("#inserts");
transformation("#transformation");
filtering("#filtering");
compressed("#compressed");
rekeying("#rekeying");
consumers("#multi-consumer");

const style = document.createElement('style');
style.innerHTML = css;
document.body.appendChild(style);
