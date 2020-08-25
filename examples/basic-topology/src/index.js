import { Specimen } from '../../../src/index';

import hljs from 'highlight.js/lib/core';
import ksql from '../../../src/ksql-highlightjs';
import hljs_js from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('sql', ksql);
hljs.registerLanguage('javascript', hljs_js);
hljs.initHighlightingOnLoad();

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

function stream(container) {
  const styles = {
    svg_width: 750,
    svg_height: 350,

    pq_width: 150,
    pq_height: 150,
    pq_margin_top: 50,
    pq_bracket_len: 25,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_bracket_len: 10,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    render_controls: false
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
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
    svg_height: 350,

    pq_width: 150,
    pq_height: 150,
    pq_margin_top: 50,
    pq_bracket_len: 25,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_bracket_len: 10,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    render_controls: false
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-7", value: { amount: 43, country: "arg" }, t: 19 },
        { key: "buyer-1", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 45 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 73 }
      ],
      [
        { key: "buyer-3", value: { amount: 42, country: "mex" }, t: 11 },
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 38 },
        { key: "buyer-9", value: { amount: 44, country: "usa" }, t: 55 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },
        { key: "buyer-3", value: { amount: 40, country: "mex" }, t: 60 }
      ],
      [
        { key: "buyer-5", value: { amount: 41, country: "arg" }, t: 24 },
        { key: "buyer-5", value: { amount: 42, country: "arg" }, t: 43 },
        { key: "buyer-6", value: { amount: 43, country: "mex" }, t: 67 },
        { key: "buyer-9", value: { amount: 42, country: "usa" }, t: 42 }
      ]
    ]
  });

  s.render();
}

function transformation(container) {
  const styles = {
    svg_width: 750,
    svg_height: 350,

    pq_width: 150,
    pq_height: 150,
    pq_margin_top: 50,
    pq_bracket_len: 25,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_bracket_len: 10,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-7", value: { amount: 43, country: "arg" }, t: 19 },
        { key: "buyer-1", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 45 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 73 }
      ],
      [
        { key: "buyer-3", value: { amount: 42, country: "mex" }, t: 11 },
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 38 },
        { key: "buyer-9", value: { amount: 44, country: "usa" }, t: 55 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },
        { key: "buyer-3", value: { amount: 40, country: "mex" }, t: 60 }
      ],
      [
        { key: "buyer-5", value: { amount: 41, country: "arg" }, t: 24 },
        { key: "buyer-5", value: { amount: 42, country: "arg" }, t: 43 },
        { key: "buyer-6", value: { amount: 43, country: "mex" }, t: 67 },
        { key: "buyer-9", value: { amount: 42, country: "usa" }, t: 42 }
      ]
    ]
  });

  s.add_child(["s1"], {
    name: "pq1",
    kind: "persistent_query",
    into: "s2",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer, amount, UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    style: {
      fill: function(before_row, after_row) {
        const flavors = [
          "#38CCED",
          "#0074A2",
          "#829494",
          "#D8365D"
        ];
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "s2",
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
    svg_height: 350,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-7", value: { amount: 43, country: "arg" }, t: 19 },
        { key: "buyer-1", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 45 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 73 }
      ],
      [
        { key: "buyer-3", value: { amount: 42, country: "mex" }, t: 11 },
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 38 },
        { key: "buyer-9", value: { amount: 44, country: "usa" }, t: 55 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },
        { key: "buyer-3", value: { amount: 40, country: "mex" }, t: 60 }
      ],
      [
        { key: "buyer-5", value: { amount: 41, country: "arg" }, t: 24 },
        { key: "buyer-5", value: { amount: 42, country: "arg" }, t: 43 },
        { key: "buyer-6", value: { amount: 43, country: "mex" }, t: 67 },
        { key: "buyer-9", value: { amount: 42, country: "usa" }, t: 42 }
      ]
    ]
  });

  s.add_child(["s1"], {
    name: "pq1",
    kind: "persistent_query",
    into: "s2",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    style: {
      fill: function(before_row, after_row) {
        const flavors = [
          "#38CCED",
          "#0074A2",
          "#829494",
          "#D8365D"
        ];
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "s2",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["s2"], {
    name: "pq2",
    kind: "persistent_query",
    into: "s3",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount != 42;
    }
  });

  s.add_child(["pq2"], {
    name: "s3",
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
    svg_height: 350,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-7", value: { amount: 43, country: "arg" }, t: 19 },
        { key: "buyer-1", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 45 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 73 }
      ],
      [
        { key: "buyer-3", value: { amount: 42, country: "mex" }, t: 11 },
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 38 },
        { key: "buyer-9", value: { amount: 44, country: "usa" }, t: 55 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },
        { key: "buyer-3", value: { amount: 40, country: "mex" }, t: 60 }
      ],
      [
        { key: "buyer-5", value: { amount: 41, country: "arg" }, t: 24 },
        { key: "buyer-5", value: { amount: 42, country: "arg" }, t: 43 },
        { key: "buyer-6", value: { amount: 43, country: "mex" }, t: 67 },
        { key: "buyer-9", value: { amount: 42, country: "usa" }, t: 42 }
      ]
    ]
  });

  s.add_child(["s1"], {
    name: "pq1",
    kind: "persistent_query",
    into: "s2",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount != 42;
    },
    style: {
      fill: function(before_row, after_row) {
        const flavors = [
          "#38CCED",
          "#0074A2",
          "#829494",
          "#D8365D"
        ];
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "s2",
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
    svg_height: 350,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-7", value: { amount: 43, country: "arg" }, t: 19 },
        { key: "buyer-1", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 45 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 73 }
      ],
      [
        { key: "buyer-3", value: { amount: 42, country: "mex" }, t: 11 },
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 38 },
        { key: "buyer-9", value: { amount: 44, country: "usa" }, t: 55 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },
        { key: "buyer-3", value: { amount: 40, country: "mex" }, t: 60 }
      ],
      [
        { key: "buyer-5", value: { amount: 41, country: "arg" }, t: 24 },
        { key: "buyer-5", value: { amount: 42, country: "arg" }, t: 43 },
        { key: "buyer-6", value: { amount: 43, country: "mex" }, t: 67 },
        { key: "buyer-9", value: { amount: 42, country: "usa" }, t: 42 }
      ]
    ]
  });

  s.add_child(["s1"], {
    name: "pq1",
    kind: "persistent_query",
    into: "s2",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount != 42;
    },
    style: {
      fill: function(before_row, after_row) {
        const flavors = [
          "#38CCED",
          "#0074A2",
          "#829494",
          "#D8365D"
        ];
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "s2",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["s2"], {
    name: "pq2",
    kind: "persistent_query",
    into: "s3",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.country.hashCode();
    }
  });

  s.add_child(["pq2"], {
    name: "s3",
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
    svg_height: 700,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    coll_label_margin_bottom: 50,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 60,
    part_id_margin_left: -15,
    part_id_margin_top: 8,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "s1",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-7", value: { amount: 43, country: "arg" }, t: 19 },
        { key: "buyer-1", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 45 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 73 }
      ],
      [
        { key: "buyer-3", value: { amount: 42, country: "mex" }, t: 11 },
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 38 },
        { key: "buyer-9", value: { amount: 44, country: "usa" }, t: 55 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },
        { key: "buyer-3", value: { amount: 40, country: "mex" }, t: 60 }
      ],
      [
        { key: "buyer-5", value: { amount: 41, country: "arg" }, t: 24 },
        { key: "buyer-5", value: { amount: 42, country: "arg" }, t: 43 },
        { key: "buyer-6", value: { amount: 43, country: "mex" }, t: 67 },
        { key: "buyer-9", value: { amount: 42, country: "usa" }, t: 42 }
      ]
    ]
  });

  s.add_child(["s1"], {
    name: "pq1",
    kind: "persistent_query",
    into: "s2",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount != 42;
    },
    style: {
      fill: function(before_row, after_row) {
        const flavors = [
          "#38CCED",
          "#0074A2",
          "#829494",
          "#D8365D"
        ];
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "s2",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["s2"], {
    name: "pq2",
    kind: "persistent_query",
    into: "s3",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.country.hashCode();
    }
  });

  s.add_child(["pq2"], {
    name: "s3",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["s2"], {
    name: "pq3",
    kind: "persistent_query",
    into: "s4",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.amount;
    }
  });

  s.add_child(["pq3"], {
    name: "s4",
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
