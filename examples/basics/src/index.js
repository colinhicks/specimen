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

stream("#stream");
inserts("#inserts");
transformation("#transformation");
filtering("#filtering");
compressed("#compressed");
rekeying("#rekeying");
consumers("#multi-consumer");
